#!/usr/bin/env python3
"""
ArcherChat training entry point.
Handles pretraining (--phase pretrain) and supervised fine-tuning (--phase sft).
All heavy ML logic lives in archerchat/; this file is pure orchestration.

Single-GPU:
    python scripts/train.py --phase pretrain --depth 8
    python scripts/train.py --phase pretrain --depth 8 --resume
    python scripts/train.py --phase sft      --depth 8

Multi-GPU (torchrun):
    torchrun --standalone --nproc_per_node=8 scripts/train.py --phase pretrain --depth 24
"""

import os
import math
import time
import argparse
import logging

import torch

from archerchat.common import (
    compute_init, compute_cleanup,
    get_base_dir, get_peak_flops,
    print0, print_banner, COMPUTE_DTYPE,
    init_tracker, upload_checkpoint_async,
)
from archerchat.model      import GPT, GPTConfig
from archerchat.optimizer  import compute_scale, get_lr
from archerchat.loss       import evaluate_bpb
from archerchat.dataloader import get_tokenizer, get_token_bytes, make_pretrain_dataloader
from archerchat.checkpoint import save_checkpoint, load_checkpoint, build_model

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Args
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="ArcherChat trainer")

    # Required
    p.add_argument("--phase", choices=["pretrain", "sft"], required=True)
    p.add_argument("--depth", type=int, required=True,
                   help="Model depth. All hyperparams are derived via compute_scale().")

    # Hyper-param overrides (default: from compute_scale)
    p.add_argument("--total-batch-size",  type=int,   default=None,
                   help="Total tokens per gradient step")
    p.add_argument("--device-batch-size", type=int,   default=None,
                   help="Per-GPU micro-batch size in sequences")
    p.add_argument("--sequence-len",      type=int,   default=2048)
    p.add_argument("--lr",                type=float, default=None,
                   help="Peak learning rate (matrix / main LR group)")
    p.add_argument("--weight-decay",      type=float, default=None)
    p.add_argument("--warmup-steps",      type=int,   default=None,
                   help="Linear-warmup steps (default: 1%% of total)")
    p.add_argument("--window-pattern",    type=str,   default="SSSL",
                   help="Attention window pattern, e.g. 'SSSL'")

    # Run metadata
    p.add_argument("--run", type=str, default=None,
                   help="Endlex run name (default: archerchat-{phase}-d{depth})")

    # Resume / init
    p.add_argument("--resume", action="store_true",
                   help="Pretrain: resume from the latest checkpoint in ckpt_dir")
    p.add_argument("--init-from", type=str, default=None,
                   help="SFT: explicit path to a pretrain checkpoint dir "
                        "(default: auto-locate the pretrain d{depth} checkpoint)")

    # Eval / checkpoint cadence
    p.add_argument("--eval-every",       type=int, default=250,
                   help="Run validation every N gradient steps")
    p.add_argument("--eval-steps",       type=int, default=20,
                   help="Number of val batches per evaluation")
    p.add_argument("--checkpoint-every", type=int, default=1000,
                   help="Save checkpoint every N gradient steps")

    # Hardware
    p.add_argument("--device", type=str, default=None,
                   help="Force device type: cuda | cpu | mps (default: auto-detect)")

    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# Checkpoint-dir layout  (mirrors Stage 1's nanochat layout for interop)
# ─────────────────────────────────────────────────────────────────────────────

def _ckpt_dir(base_dir: str, phase: str, depth: int) -> str:
    subdir = "base_checkpoints" if phase == "pretrain" else "chatsft_checkpoints"
    return os.path.join(base_dir, subdir, f"d{depth}")


def _maybe_upload(run_name: str, step: int, ckpt_dir: str, rank: int) -> None:
    """Async-upload the freshly saved checkpoint to Endlex (rank 0, only if URL is set)."""
    if rank != 0 or not os.environ.get("ENDLEX_URL"):
        return
    candidates = {
        f"model_{step:06d}.pt":  os.path.join(ckpt_dir, f"model_{step:06d}.pt"),
        f"meta_{step:06d}.json": os.path.join(ckpt_dir, f"meta_{step:06d}.json"),
    }
    files = {k: v for k, v in candidates.items() if os.path.exists(v)}
    if files:
        upload_checkpoint_async(run_name, step, files)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # ── Distributed init ──────────────────────────────────────────────
    device_type = args.device or (
        "cuda" if torch.cuda.is_available() else
        "mps"  if torch.backends.mps.is_available() else "cpu"
    )
    is_ddp, rank, local_rank, world_size, device = compute_init(device_type)

    print_banner()
    print0(f"phase={args.phase}  depth={args.depth}  "
           f"world_size={world_size}  dtype={COMPUTE_DTYPE}")

    # ── Hyperparams from depth ─────────────────────────────────────────
    # compute_scale() returns the compute-optimal config for this depth.
    # Every field can be overridden on the CLI.
    scale = compute_scale(args.depth)

    total_batch_tokens = args.total_batch_size  or scale["batch_size"]         # tokens/grad-step
    device_batch_size  = args.device_batch_size or scale["device_batch_size"]  # seqs/rank/micro-step
    T                  = args.sequence_len
    max_lr             = args.lr           or scale["lr"]
    weight_decay       = args.weight_decay or scale["wd"]
    n_tokens_target    = scale["n_tokens"]                                      # compute-optimal budget

    total_steps  = math.ceil(n_tokens_target / total_batch_tokens)
    warmup_steps = args.warmup_steps or max(1, total_steps // 100)

    tokens_per_rank_micro = device_batch_size * T
    assert total_batch_tokens % (tokens_per_rank_micro * world_size) == 0, (
        f"total_batch_tokens ({total_batch_tokens}) must be divisible by "
        f"device_batch_size * T * world_size = "
        f"{device_batch_size} * {T} * {world_size}"
    )
    grad_accum_steps = total_batch_tokens // (tokens_per_rank_micro * world_size)
    B = device_batch_size

    print0(
        f"scale  n_params={scale['n_params']:.2e}  n_tokens={n_tokens_target:.2e}  "
        f"batch={total_batch_tokens}  lr={max_lr:.4f}  wd={weight_decay:.4f}\n"
        f"steps  total={total_steps}  warmup={warmup_steps}  "
        f"accum={grad_accum_steps}  eval_every={args.eval_every}"
    )

    # ── Tokenizer ──────────────────────────────────────────────────────
    # Re-uses Stage 1's tokenizer from ~/.cache/nanochat/tokenizer/
    tokenizer   = get_tokenizer()
    token_bytes = get_token_bytes(device)  # shape (vocab_size,) int — UTF-8 bytes per token id
    print0(f"tokenizer  vocab_size={tokenizer.get_vocab_size()}")

    # ── Model config ───────────────────────────────────────────────────
    config = GPTConfig(
        vocab_size     = tokenizer.get_vocab_size(),
        n_layer        = scale["n_layers"],
        n_head         = scale["n_heads"],
        n_kv_head      = scale["n_kv_heads"],
        n_embd         = scale["n_embd"],
        sequence_len   = T,
        window_pattern = args.window_pattern,
    )
    base_dir = get_base_dir()
    ckpt_dir = _ckpt_dir(base_dir, args.phase, args.depth)
    start_step    = 0
    loader_resume = None

    # ── Model init / resume ────────────────────────────────────────────
    if args.phase == "pretrain" and args.resume:
        print0(f"resuming pretrain from {ckpt_dir}")
        model, _, meta = build_model(ckpt_dir, step=None, device=device, phase="train")
        start_step    = meta["step"]
        loader_resume = meta.get("loader_state")

    elif args.phase == "sft":
        pretrain_dir = args.init_from or _ckpt_dir(base_dir, "pretrain", args.depth)
        print0(f"SFT: loading pretrain weights from {pretrain_dir}")
        model, _, _ = build_model(pretrain_dir, step=None, device=device, phase="train")

    else:   # fresh pretrain
        print0("initializing model from scratch")
        with torch.device("meta"):
            model = GPT(config)
        model.to_empty(device=device)
        model.init_weights()

    model.train()
    n_params = model.num_scaling_params()
    print0(f"model  {n_params['total'] / 1e6:.1f}M params  "
           f"(matrices={n_params['transformer_matrices'] / 1e6:.1f}M)")

    if device_type == "cuda":
        model = torch.compile(model)

    # raw_model is the uncompiled module — used for optimizer setup, state_dict, etc.
    raw_model = getattr(model, "_orig_mod", model)

    # ── Optimizer ──────────────────────────────────────────────────────
    # setup_optimizer() defines all param groups (Muon for matrices, AdamW for embeddings/head).
    # lr is the "matrix LR" anchor; other groups scale relative to it internally.
    optimizer = raw_model.setup_optimizer(lr=max_lr, weight_decay=weight_decay)
    for g in optimizer.param_groups:
        g["initial_lr"] = g["lr"]  # stash so the LR schedule can scale each group uniformly

    if args.phase == "pretrain" and args.resume:
        _, opt_data, _ = load_checkpoint(ckpt_dir, step=start_step, device=device,
                                          load_optimizer=True, rank=rank)
        if opt_data is not None:
            optimizer.load_state_dict(opt_data)

    # ── Dataloaders ────────────────────────────────────────────────────
    if args.phase == "pretrain":
        train_loader = make_pretrain_dataloader(
            tokenizer, B, T, split="train", device=device,
            resume_state_dict=loader_resume,
        )
        val_loader = make_pretrain_dataloader(
            tokenizer, B, T, split="val", device=device,
        )
    else:
        from archerchat.sft import make_sft_dataloader
        train_loader = make_sft_dataloader(
            tokenizer, B, T, device=device, resume_state_dict=loader_resume,
        )
        val_loader = make_sft_dataloader(tokenizer, B, T, device=device)

    # ── Endlex tracker ─────────────────────────────────────────────────
    run_name = args.run or f"archerchat-{args.phase}-d{args.depth}"
    tracker  = init_tracker("archerchat", run_name, config={
        "phase": args.phase, "depth": args.depth,
        "n_params": n_params["total"], "n_tokens_target": n_tokens_target,
        "total_batch_tokens": total_batch_tokens, "lr": max_lr, "wd": weight_decay,
        "T": T, "world_size": world_size, "compute_dtype": str(COMPUTE_DTYPE),
        **{k: scale[k] for k in ("n_layers", "n_heads", "n_kv_heads", "n_embd")},
    })

    # ── MFU bookkeeping ────────────────────────────────────────────────
    flops_per_token = raw_model.estimate_flops()
    if device_type == "cuda":
        peak_flops = get_peak_flops(torch.cuda.get_device_name(local_rank))
    else:
        peak_flops = float("inf")  # MFU won't be meaningful on non-CUDA devices

    print0(f"flops/token={flops_per_token:.2e}  peak_flops={peak_flops:.2e}")
    print0(f"training step {start_step} → {total_steps}\n")

    # ─────────────────────────────────────────────────────────────────────
    # Training loop
    # ─────────────────────────────────────────────────────────────────────
    loader_state = None   # updated each micro-step; persisted in every checkpoint meta
    t0 = time.perf_counter()

    for step in range(start_step, total_steps + 1):

        # ── Validation (at step 0 and every eval_every steps) ─────────
        if step % args.eval_every == 0:
            model.eval()
            val_bpb = evaluate_bpb(model, val_loader, args.eval_steps, token_bytes)
            model.train()
            print0(f"step {step:6d} | val_bpb {val_bpb:.4f}")
            if rank == 0:
                tracker.log({"step": step, "val/bpb": val_bpb})

        # ── Checkpoint ────────────────────────────────────────────────
        if step > 0 and (step % args.checkpoint_every == 0 or step == total_steps):
            meta_data = {
                "step": step,
                "phase": args.phase,
                "model_config": vars(config),
                "loader_state": loader_state,
                "args": vars(args),
            }
            save_checkpoint(
                ckpt_dir, step,
                model_data=raw_model.state_dict(),
                optimizer_data=optimizer.state_dict(),
                meta_data=meta_data,
                rank=rank,
            )
            _maybe_upload(run_name, step, ckpt_dir, rank)

        if step == total_steps:
            break

        # ── LR schedule: linear warmup + cosine decay ─────────────────
        min_lr     = max_lr / 10
        current_lr = get_lr(step, warmup_steps, total_steps, max_lr, min_lr)
        lr_scale   = current_lr / max_lr
        for g in optimizer.param_groups:
            g["lr"] = g["initial_lr"] * lr_scale

        # ── Forward + backward with gradient accumulation ──────────────
        optimizer.zero_grad(set_to_none=True)
        loss_accum = 0.0

        for _ in range(grad_accum_steps):
            x, y, loader_state = next(train_loader)
            # Divide before backward so gradients are already mean-reduced across micro-steps.
            loss = model(x, y, loss_reduction="mean") / grad_accum_steps
            loss.backward()
            loss_accum += loss.detach().item()

        # ── Gradient clipping + optimizer step ────────────────────────
        grad_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        # ── Throughput / MFU ──────────────────────────────────────────
        if device_type == "cuda":
            torch.cuda.synchronize()
        t1 = time.perf_counter()
        tok_per_sec = B * T * grad_accum_steps * world_size / (t1 - t0)
        mfu = flops_per_token * tok_per_sec / peak_flops if peak_flops < float("inf") else 0.0
        t0 = t1

        # ── Logging ───────────────────────────────────────────────────
        if rank == 0:
            tracker.log({
                "step": step,
                "train/loss":       loss_accum,
                "train/lr":         current_lr,
                "train/grad_norm":  grad_norm.item(),
                "perf/tok_per_sec": tok_per_sec,
                "perf/mfu":         mfu,
            })
        if step % 10 == 0:
            print0(
                f"step {step:6d} | loss {loss_accum:.4f} | lr {current_lr:.2e} | "
                f"tok/s {tok_per_sec:,.0f} | mfu {mfu:.1%}"
            )

    # ── Finish ────────────────────────────────────────────────────────
    print0(f"\ndone: {args.phase} d{args.depth}  ({total_steps} steps)")
    tracker.finish()
    compute_cleanup()


if __name__ == "__main__":
    main()
