#!/usr/bin/env python3
"""
ArcherChat chat-model evaluation entry point (nanochat chat_eval.py).

Scores an SFT checkpoint on the ChatCORE metric: the mean of the per-task
random-baseline-centered accuracies over ARC-Easy, ARC-Challenge, MMLU, GSM8K,
HumanEval and SpellingBee (0 = random baseline, 1 = perfect). ChatCORE is only
reported when all six tasks were evaluated.

Two evaluation loops, dispatched on the task's eval_type:
  generative  — sample a completion per problem and check it (needs archerchat/engine.py)
  categorical — one batched forward, argmax over the answer-letter logits (no sampling)

Loads the model with archerchat.checkpoint.build_model and drives generation
through archerchat.engine (the same inference path chat_cli.py / chat_web.py use).

Base-model evaluation (CORE) lives in scripts/base_eval.py.

Single-GPU:
    python scripts/chat_eval.py --depth 8
    python scripts/chat_eval.py --depth 8 --task-name ARC-Easy

Multi-GPU (torchrun):
    torchrun --standalone --nproc_per_node=8 scripts/chat_eval.py --depth 8
"""

import os
import argparse
from functools import partial

from dotenv import load_dotenv
# Load repo-root .env (ENDLEX_URL / ENDLEX_TOKEN) before anything reads the env.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import torch
import torch.distributed as dist

from archerchat.common import (
    compute_init, compute_cleanup, autodetect_device_type, get_dist_info,
    get_base_dir, print0, print_banner, COMPUTE_DTYPE, init_tracker,
)
from archerchat.checkpoint import build_model
from archerchat.engine     import Engine
from archerchat.sft        import render_for_completion

from tasks.arc         import ARC
from tasks.gsm8k       import GSM8K
from tasks.humaneval   import HumanEval
from tasks.mmlu        import MMLU
from tasks.spellingbee import SpellingBee

TASKS = {
    "ARC-Easy":      partial(ARC, subset="ARC-Easy", split="test"),
    "ARC-Challenge": partial(ARC, subset="ARC-Challenge", split="test"),
    "MMLU":          partial(MMLU, subset="all", split="test"),
    "GSM8K":         partial(GSM8K, subset="main", split="test"),
    "HumanEval":     HumanEval,
    "SpellingBee":   partial(SpellingBee, size=256, split="test"),
}
ALL_TASKS = ["ARC-Easy", "ARC-Challenge", "MMLU", "GSM8K", "HumanEval", "SpellingBee"]
# Random-baseline accuracy per task: 1-of-4 multiple choice => 0.25, open-ended => 0.0.
BASELINE_ACCURACIES = {
    "ARC-Easy": 0.25,
    "ARC-Challenge": 0.25,
    "MMLU": 0.25,
    "GSM8K": 0.0,
    "HumanEval": 0.0,
    "SpellingBee": 0.0,
}


# ─────────────────────────────────────────────────────────────────────────────
# Args
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="ArcherChat chat-model evaluation")

    p.add_argument("--depth", type=int, required=True,
                   help="Model depth; selects chatsft_checkpoints/d{depth}")
    p.add_argument("--init-from", type=str, default=None,
                   help="Explicit path to a chat checkpoint dir "
                        "(default: auto-locate the SFT d{depth} checkpoint)")
    p.add_argument("--step", type=int, default=None,
                   help="Checkpoint step to evaluate (default: latest)")
    p.add_argument("-a", "--task-name", type=str, default=None,
                   help=f"Task(s) to evaluate, '|'-separated (default: all of "
                        f"{'|'.join(ALL_TASKS)}). ChatCORE needs all of them.")
    p.add_argument("-t", "--temperature", type=float, default=0.0,
                   help="Sampling temperature for generative tasks (0 = greedy)")
    p.add_argument("-m", "--max-new-tokens", type=int, default=512,
                   help="Max tokens sampled per problem on generative tasks")
    p.add_argument("-n", "--num-samples", type=int, default=1,
                   help="Samples per problem on generative tasks (pass@k: any sample passes)")
    p.add_argument("-k", "--top-k", type=int, default=50,
                   help="Top-k for sampling on generative tasks")
    p.add_argument("-b", "--batch-size", type=int, default=8,
                   help="Batch size for categorical (multiple-choice) tasks")
    p.add_argument("-x", "--max-problems", type=int, default=None,
                   help="Cap the problems evaluated per task (default: all)")
    p.add_argument("--run", type=str, default=None,
                   help="Endlex run name (default: archerchat-chat-eval-d{depth})")
    p.add_argument("--device", type=str, default=None,
                   help="Force device type: cuda | cpu | mps (default: auto-detect)")

    args = p.parse_args()
    args.task_names = ALL_TASKS if args.task_name is None else args.task_name.split("|")
    unknown = [t for t in args.task_names if t not in TASKS]
    if unknown:
        p.error(f"Unknown task(s): {unknown}. Valid: {ALL_TASKS}")
    return args


# ─────────────────────────────────────────────────────────────────────────────
# Generative eval: one problem at a time, sample, check the completion
# ─────────────────────────────────────────────────────────────────────────────

def run_generative_eval(task_object, tokenizer, model, engine, num_samples,
                        max_new_tokens, temperature, top_k, max_problems=None):
    _ddp, rank, _local_rank, world_size = get_dist_info()
    device = model.get_device()

    num_problems = len(task_object) if max_problems is None else min(len(task_object), max_problems)
    num_passed, total = 0, 0

    for i in range(rank, num_problems, world_size):
        conversation = task_object[i]
        encoded_prompt = render_for_completion(tokenizer, conversation)
        results, _ = engine.generate_batch(
            encoded_prompt,
            num_samples=num_samples,
            max_tokens=max_new_tokens,
            temperature=temperature,
            top_k=top_k,
        )
        prefix_length = len(encoded_prompt)
        completions = [tokenizer.decode(tokens[prefix_length:]) for tokens in results]
        # pass@k semantics: the problem counts as passed if ANY sample passes.
        passed = any(task_object.evaluate(conversation, c) for c in completions)
        total += 1
        num_passed += int(passed)
        print(f"\r\033[KRank {rank} | {num_passed}/{total} ({100 * num_passed / total:.2f}%)",
              end="", flush=True)
    print()

    num_passed, total = all_reduce_counts(num_passed, total, device)
    print0("=" * 50)
    print0(f"Final: {num_passed}/{total} ({100 * num_passed / total:.2f}%)")
    return num_passed / total


# ─────────────────────────────────────────────────────────────────────────────
# Categorical eval: no sampling, so whole batches of problems go through in one
# forward and we read the answer off the logits of the available answer letters
# ─────────────────────────────────────────────────────────────────────────────

def run_categorical_eval(task_object, tokenizer, model, batch_size, max_problems=None):
    _ddp, rank, _local_rank, world_size = get_dist_info()
    device = model.get_device()
    bos = tokenizer.get_bos_token_id()  # padding token; those positions are never read

    num_problems = len(task_object) if max_problems is None else min(len(task_object), max_problems)
    num_batches = -(-num_problems // batch_size)  # ceil div

    letter_to_id = {}  # letters repeat across problems; save the tokenizer the work
    num_passed, total = 0, 0

    for i in range(rank, num_batches, world_size):
        i0, i1 = i * batch_size, min((i + 1) * batch_size, num_problems)
        conversations = [task_object[ii] for ii in range(i0, i1)]
        prompt_ids = [render_for_completion(tokenizer, c) for c in conversations]
        max_length = max(len(ids) for ids in prompt_ids)
        # The answer is predicted from the last real token of each (right-padded) prompt.
        answer_positions = [len(ids) - 1 for ids in prompt_ids]
        padded = [ids + [bos] * (max_length - len(ids)) for ids in prompt_ids]
        input_ids = torch.tensor(padded, dtype=torch.long, device=device)

        with torch.no_grad():
            logits = model(input_ids)  # (B, T, V)

        # Score only the letters that this problem actually offers. This is the standard
        # (easier) multiple-choice protocol: we don't ask the model to freely emit a letter.
        for idx, conversation in enumerate(conversations):
            letters = conversation["letters"]
            letter_ids = []
            for letter in letters:
                if letter not in letter_to_id:
                    encoded = tokenizer.encode(letter)
                    assert len(encoded) == 1, "Each letter must be a single token"
                    letter_to_id[letter] = encoded[0]
                letter_ids.append(letter_to_id[letter])
            focus_logits = logits[idx, answer_positions[idx], letter_ids]
            predicted_letter = letters[focus_logits.argmax(dim=-1).item()]
            num_passed += int(task_object.evaluate(conversation, predicted_letter))
            total += 1

    num_passed, total = all_reduce_counts(num_passed, total, device)
    accuracy = num_passed / total
    print0(f"Final: {num_passed}/{total} ({100 * accuracy:.2f}%)")
    return accuracy


def all_reduce_counts(num_passed, total, device):
    """Problems are striped across ranks, so both counters must be summed globally."""
    if not dist.is_initialized():
        return num_passed, total
    counts = torch.tensor([num_passed, total], dtype=torch.long, device=device)
    dist.all_reduce(counts, op=dist.ReduceOp.SUM)
    return counts[0].item(), counts[1].item()


# ─────────────────────────────────────────────────────────────────────────────
# Evaluation
# ─────────────────────────────────────────────────────────────────────────────

def run_chat_eval(task_name, model, tokenizer, engine,
                  batch_size=1, num_samples=1, max_new_tokens=512, temperature=0.0,
                  top_k=50, max_problems=None):
    task_object = TASKS[task_name]()
    if task_object.eval_type == "generative":
        return run_generative_eval(task_object, tokenizer, model, engine, num_samples,
                                   max_new_tokens, temperature, top_k,
                                   max_problems=max_problems)
    elif task_object.eval_type == "categorical":
        return run_categorical_eval(task_object, tokenizer, model, batch_size,
                                    max_problems=max_problems)
    raise ValueError(f"Unsupported task evaluation type: {task_object.eval_type}")


def compute_chatcore(results):
    """ChatCORE: mean baseline-centered accuracy — 0 at random, 1 at perfect."""
    centered = [(acc - BASELINE_ACCURACIES[task]) / (1.0 - BASELINE_ACCURACIES[task])
                for task, acc in results.items()]
    return sum(centered) / len(centered)


def run_eval(args, rank, world_size, device):
    base_dir = get_base_dir()
    ckpt_dir = args.init_from or os.path.join(base_dir, "chatsft_checkpoints", f"d{args.depth}")
    print0(f"loading chat weights from {ckpt_dir}")

    # Not compiled: the engine's decode shapes change every step, so a compiled
    # model would retrace continuously.
    model, tokenizer, meta = build_model(ckpt_dir, step=args.step, device=device, phase="eval")
    engine = Engine(model, tokenizer)
    step = meta["step"]
    print0(f"evaluating d{args.depth} step {step}  tasks={','.join(args.task_names)}")

    run_name = args.run or f"archerchat-chat-eval-d{args.depth}"
    tracker = init_tracker("archerchat", run_name, config={
        "phase": "chat_eval", "depth": args.depth, "step": step,
        "tasks": args.task_names, "temperature": args.temperature,
        "num_samples": args.num_samples, "top_k": args.top_k,
        "max_new_tokens": args.max_new_tokens, "max_problems": args.max_problems,
        "world_size": world_size, "compute_dtype": str(COMPUTE_DTYPE),
    })

    results = {}
    for task_name in args.task_names:
        print0("\n" + "=" * 80)
        print0(f"{task_name}")
        print0("=" * 80)
        results[task_name] = run_chat_eval(
            task_name, model, tokenizer, engine,
            batch_size=args.batch_size,
            num_samples=args.num_samples,
            max_new_tokens=args.max_new_tokens,
            temperature=args.temperature,
            top_k=args.top_k,
            max_problems=args.max_problems,
        )
        print0(f"{task_name} accuracy: {100 * results[task_name]:.2f}%")

    metrics = {"step": step}
    metrics.update({f"chat/{task}": acc for task, acc in results.items()})
    # ChatCORE is only meaningful over the full suite.
    if all(task in results for task in ALL_TASKS):
        chatcore = compute_chatcore(results)
        metrics["chat/ChatCORE"] = chatcore
        print0(f"\nChatCORE metric: {chatcore:.4f}")

    if rank == 0:
        tracker.log(metrics)
    tracker.finish()
    return metrics


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    device_type = args.device or autodetect_device_type()
    _is_ddp, rank, _local_rank, world_size, device = compute_init(device_type)

    print_banner()
    print0(f"phase=chat_eval  depth={args.depth}  "
           f"world_size={world_size}  dtype={COMPUTE_DTYPE}")

    run_eval(args, rank, world_size, device)
    compute_cleanup()


if __name__ == "__main__":
    main()
