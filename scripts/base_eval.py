#!/usr/bin/env python3
"""
ArcherChat base-model evaluation entry point (nanochat base_eval.py).

Scores a pretrained checkpoint on three evaluations (comma-separated --eval):
  core    : CORE metric over the DCLM ICL task suite (Stage 1 d8 oracle: 0.0976)
  bpb     : bits-per-byte over the train/val splits of the pretraining corpus
  sample  : free-form samples from the model (drives archerchat/engine.py)

Loads the model with archerchat.checkpoint.build_model, ensures the eval bundle
is present via archerchat.eval_bundle.ensure_eval_bundle(), and runs
archerchat.core_eval.evaluate_task over each task.

Chat-model evaluation (ChatCORE) lives in scripts/chat_eval.py.

Single-GPU:
    python scripts/base_eval.py --depth 8
    python scripts/base_eval.py --depth 8 --eval core --max-per-task 100

Multi-GPU (torchrun):
    torchrun --standalone --nproc_per_node=8 scripts/base_eval.py --depth 8
"""

import os
import csv
import json
import time
import random
import argparse

from dotenv import load_dotenv
# Load repo-root .env (ENDLEX_URL / ENDLEX_TOKEN) before anything reads the env.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import yaml

from archerchat.common import (
    compute_init, compute_cleanup, autodetect_device_type,
    get_base_dir, print0, print_banner, COMPUTE_DTYPE, init_tracker,
)
from archerchat.core_eval   import evaluate_task
from archerchat.eval_bundle import ensure_eval_bundle
from archerchat.checkpoint  import build_model
from archerchat.dataloader  import get_token_bytes, make_pretrain_dataloader
from archerchat.loss        import evaluate_bpb
from archerchat.engine      import Engine

EVAL_MODES = ("core", "bpb", "sample")

# nanochat's fixed prompt set — keep identical so samples stay comparable.
SAMPLE_PROMPTS = [
    "The capital of France is",
    "The chemical symbol of gold is",
    "If yesterday was Friday, then tomorrow will be",
    "The opposite of hot is",
    "The planets of the solar system are:",
    "My favorite color is",
    "If 5*x + 3 = 13, then x is",
]


# ─────────────────────────────────────────────────────────────────────────────
# Args
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="ArcherChat base-model evaluation")

    p.add_argument("--depth", type=int, required=True,
                   help="Model depth; selects base_checkpoints/d{depth}")
    p.add_argument("--init-from", type=str, default=None,
                   help="Explicit path to a pretrain checkpoint dir "
                        "(default: auto-locate the pretrain d{depth} checkpoint)")
    p.add_argument("--step", type=int, default=None,
                   help="Checkpoint step to evaluate (default: latest)")
    p.add_argument("--eval", type=str, default="core,bpb,sample",
                   help=f"Comma-separated evaluations to run: {','.join(EVAL_MODES)}")
    p.add_argument("--max-per-task", type=int, default=-1,
                   help="Max examples per CORE task (-1 = all; nanochat default)")
    p.add_argument("--device-batch-size", type=int, default=32,
                   help="Per-GPU micro-batch size in sequences for the bpb eval")
    p.add_argument("--split-tokens", type=int, default=40 * 524288,
                   help="Tokens evaluated per split for bpb (nanochat: 40*2^19)")
    p.add_argument("--run", type=str, default=None,
                   help="Endlex run name (default: archerchat-base-eval-d{depth})")
    p.add_argument("--device", type=str, default=None,
                   help="Force device type: cuda | cpu | mps (default: auto-detect)")

    args = p.parse_args()
    args.eval_modes = [m.strip() for m in args.eval.split(",") if m.strip()]
    invalid = set(args.eval_modes) - set(EVAL_MODES)
    if invalid:
        p.error(f"Invalid eval modes: {sorted(invalid)}. Valid: {list(EVAL_MODES)}")
    return args


# ─────────────────────────────────────────────────────────────────────────────
# CORE  (DCLM: https://arxiv.org/abs/2406.11794)
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_core(model, tokenizer, device, max_per_task=-1):
    """
    CORE = mean over tasks of the random-baseline-centered accuracy, so a random
    model scores 0.0 and a perfect one 1.0. The task list, few-shot counts, and
    continuation delimiters come from the eval bundle's core.yaml; the per-task
    random baselines from its eval_meta_data.csv (in percent, hence the 0.01x).

    Returns {"results", "centered_results", "core_metric"}.
    """
    eval_bundle_dir = ensure_eval_bundle()
    config_path    = os.path.join(eval_bundle_dir, "core.yaml")
    data_base_path = os.path.join(eval_bundle_dir, "eval_data")
    eval_meta_data = os.path.join(eval_bundle_dir, "eval_meta_data.csv")

    with open(config_path, "r", encoding="utf-8") as f:
        tasks = yaml.safe_load(f)["icl_tasks"]

    random_baselines = {}
    with open(eval_meta_data, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            random_baselines[row["Eval Task"]] = float(row["Random baseline"])

    results, centered_results = {}, {}
    for task in tasks:
        start_time = time.time()
        label = task["label"]
        task_meta = {
            "task_type": task["icl_task_type"],
            "dataset_uri": task["dataset_uri"],
            "num_fewshot": task["num_fewshot"][0],
            "continuation_delimiter": task.get("continuation_delimiter", " "),
        }
        print0(f"Evaluating: {label} ({task_meta['num_fewshot']}-shot, "
               f"type: {task_meta['task_type']})... ", end="")

        data_path = os.path.join(data_base_path, task_meta["dataset_uri"])
        with open(data_path, "r", encoding="utf-8") as f:
            data = [json.loads(line.strip()) for line in f]

        # Fixed-seed shuffle so --max-per-task subsamples the same examples every run.
        random.Random(1337).shuffle(data)
        if max_per_task > 0:
            data = data[:max_per_task]

        accuracy = evaluate_task(model, tokenizer, data, device, task_meta)
        random_baseline = random_baselines[label]
        centered = (accuracy - 0.01 * random_baseline) / (1.0 - 0.01 * random_baseline)
        results[label] = accuracy
        centered_results[label] = centered
        print0(f"accuracy: {accuracy:.4f} | centered: {centered:.4f} | "
               f"time: {time.time() - start_time:.2f}s")

    core_metric = sum(centered_results.values()) / len(centered_results)
    return {
        "results": results,
        "centered_results": centered_results,
        "core_metric": core_metric,
    }


def write_core_csv(core_results, model_slug):
    csv_path = os.path.join(get_base_dir(), "base_eval", f"{model_slug}.csv")
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        f.write(f"{'Task':<35}, {'Accuracy':<10}, {'Centered':<10}\n")
        for label, acc in core_results["results"].items():
            centered = core_results["centered_results"][label]
            f.write(f"{label:<35}, {acc:<10.6f}, {centered:<10.6f}\n")
        f.write(f"{'CORE':<35}, {'':<10}, {core_results['core_metric']:<10.6f}\n")
    return csv_path


# ─────────────────────────────────────────────────────────────────────────────
# Evaluation
# ─────────────────────────────────────────────────────────────────────────────

def run_base_eval(args, rank, world_size, device):
    base_dir = get_base_dir()
    ckpt_dir = args.init_from or os.path.join(base_dir, "base_checkpoints", f"d{args.depth}")
    print0(f"loading base weights from {ckpt_dir}")

    # Never torch.compile here: core_eval and the engine forward varying sequence
    # lengths, so a compiled model would retrace on nearly every example.
    model, tokenizer, meta = build_model(ckpt_dir, step=args.step, device=device, phase="eval")
    step = meta["step"]
    sequence_len = meta["model_config"]["sequence_len"]
    model_slug = f"base_model_d{args.depth}_{step:06d}"
    print0(f"evaluating {model_slug}  modes={','.join(args.eval_modes)}")

    run_name = args.run or f"archerchat-base-eval-d{args.depth}"
    tracker = init_tracker("archerchat", run_name, config={
        "phase": "base_eval", "depth": args.depth, "step": step,
        "eval": args.eval_modes, "max_per_task": args.max_per_task,
        "world_size": world_size, "compute_dtype": str(COMPUTE_DTYPE),
    })
    metrics = {"step": step}

    # ── Samples (rank 0 only; generation is not sharded) ───────────────
    if "sample" in args.eval_modes and rank == 0:
        print0("\n" + "=" * 80)
        print0("Model samples")
        print0("=" * 80)
        engine = Engine(model, tokenizer)
        bos = tokenizer.get_bos_token_id()
        print0("\nConditioned samples (greedy):")
        for prompt in SAMPLE_PROMPTS:
            tokens = tokenizer(prompt, prepend=bos)
            sample, _ = engine.generate_batch(tokens, num_samples=1, max_tokens=16, temperature=0)
            print0("-" * 80)
            print0(tokenizer.decode(sample[0]))
        print0("\nUnconditioned samples (temperature 1.0):")
        tokens = tokenizer("", prepend=bos)
        uncond, _ = engine.generate_batch(tokens, num_samples=8, max_tokens=128, temperature=1.0)
        for sample in uncond:
            print0("-" * 80)
            print0(tokenizer.decode(sample))

    # ── BPB ────────────────────────────────────────────────────────────
    if "bpb" in args.eval_modes:
        print0("\n" + "=" * 80)
        print0("BPB evaluation")
        print0("=" * 80)
        B, T = args.device_batch_size, sequence_len
        token_bytes = get_token_bytes(device)
        tokens_per_step = B * T * world_size
        split_tokens = (args.split_tokens // tokens_per_step) * tokens_per_step
        if split_tokens != args.split_tokens:
            print0(f"adjusted split_tokens to {split_tokens} "
                   f"(must be divisible by {tokens_per_step})")
        steps = split_tokens // tokens_per_step
        for split in ["train", "val"]:
            loader = make_pretrain_dataloader(
                tokenizer, B, T, split=split, device=device,
                rank=rank, world_size=world_size,
            )
            bpb = evaluate_bpb(model, loader, steps, token_bytes)
            metrics[f"{split}/bpb"] = bpb
            print0(f"{split} bpb: {bpb:.6f}")

    # ── CORE ───────────────────────────────────────────────────────────
    if "core" in args.eval_modes:
        print0("\n" + "=" * 80)
        print0("CORE evaluation")
        print0("=" * 80)
        core_results = evaluate_core(model, tokenizer, device, max_per_task=args.max_per_task)
        metrics["core/metric"] = core_results["core_metric"]
        for label, centered in core_results["centered_results"].items():
            metrics[f"core/{label}"] = centered
        if rank == 0:
            csv_path = write_core_csv(core_results, model_slug)
            print0(f"\nresults written to: {csv_path}")
            print0(f"CORE metric: {core_results['core_metric']:.4f}")

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
    print0(f"phase=base_eval  depth={args.depth}  "
           f"world_size={world_size}  dtype={COMPUTE_DTYPE}")

    run_base_eval(args, rank, world_size, device)
    compute_cleanup()


if __name__ == "__main__":
    main()
