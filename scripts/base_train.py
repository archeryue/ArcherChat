#!/usr/bin/env python3
"""
ArcherChat pretraining entry point (nanochat base_train.py).
All heavy ML logic lives in archerchat/; this file is pure orchestration.

Pretraining follows nanochat's conventions exactly: step-driven horizon from
compute_scale(), trapezoidal LR schedule, cosine weight-decay schedule, and a
Muon momentum schedule.

Single-GPU:
    python scripts/base_train.py --depth 8
    python scripts/base_train.py --depth 8 --resume

Multi-GPU (torchrun):
    torchrun --standalone --nproc_per_node=8 scripts/base_train.py --depth 24

SFT lives in scripts/chat_sft.py; both pull shared infrastructure from
archerchat/common.py, nanochat-style.
"""

import os
import time
import argparse
import logging

from dotenv import load_dotenv
# Load repo-root .env (ENDLEX_URL / ENDLEX_TOKEN) before anything reads the env.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import torch

from archerchat.common import (
    compute_init, compute_cleanup, autodetect_device_type,
    get_base_dir, get_peak_flops, print0, print_banner, COMPUTE_DTYPE,
    init_tracker, maybe_upload_checkpoint,
)
from archerchat.model      import GPT, GPTConfig
from archerchat.scaling    import compute_scale
from archerchat.optimizer  import get_lr_multiplier, get_muon_momentum, get_weight_decay
from archerchat.loss       import evaluate_bpb
from archerchat.dataloader import get_tokenizer, get_token_bytes, make_pretrain_dataloader
from archerchat.checkpoint import save_checkpoint, load_checkpoint, build_model

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Args
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="ArcherChat pretrainer")

    p.add_argument("--depth", type=int, required=True,
                   help="Model depth. All hyperparams are derived via compute_scale().")
    p.add_argument("--total-batch-size",  type=int, default=None,
                   help="Override total tokens per gradient step")
    p.add_argument("--device-batch-size", type=int, default=32,
                   help="Per-GPU micro-batch size in sequences. This is a VRAM knob, "
                        "NOT derived from scaling — grad accumulation makes up the "
                        "difference. (Stage 1 on 16 GiB: d8=16, d12=8; nanochat default 32)")
    p.add_argument("--sequence-len",   type=int, default=2048)
    p.add_argument("--warmup-steps",   type=int, default=40,
                   help="Linear-warmup steps (nanochat default: 40)")
    p.add_argument("--window-pattern", type=str, default="SSSL",
                   help="Attention window pattern, e.g. 'SSSL'")
    p.add_argument("--run", type=str, default=None,
                   help="Endlex run name (default: archerchat-pretrain-d{depth})")
    p.add_argument("--resume", action="store_true",
                   help="Resume from the latest checkpoint in ckpt_dir")
    p.add_argument("--eval-every",  type=int, default=250,
                   help="Run validation every N gradient steps (nanochat: 250)")
    p.add_argument("--eval-tokens", type=int, default=80 * 524288,
                   help="Tokens per validation pass; eval batch count is derived as "
                        "eval_tokens // (device_batch_size * T * world_size) (nanochat: 80*2^19)")
    p.add_argument("--checkpoint-every", type=int, default=1000,
                   help="Save checkpoint every N gradient steps")
    p.add_argument("--max-steps", type=int, default=None,
                   help="Debug: stop after this many optimizer steps. Schedules still use "
                        "the full total_steps, and checkpoints are NOT written (pipeline smoke test).")
    p.add_argument("--device", type=str, default=None,
                   help="Force device type: cuda | cpu | mps (default: auto-detect)")

    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# Pretraining
# ─────────────────────────────────────────────────────────────────────────────

def run_pretrain(args, rank, local_rank, world_size, device, device_type):
    scale = compute_scale(args.depth)   # see archerchat/scaling.py for the math

    total_batch_tokens = args.total_batch_size or scale["batch_size"]
    B                  = args.device_batch_size
    T                  = args.sequence_len
    n_tokens_target    = scale["n_tokens"]

    total_steps = n_tokens_target // total_batch_tokens   # floor like nanochat
    # Debug cap: run fewer steps but keep the schedule denominator at the true total_steps.
    run_steps = total_steps if args.max_steps is None else min(total_steps, args.max_steps)
    tokens_per_rank_micro = B * T
    assert total_batch_tokens % (tokens_per_rank_micro * world_size) == 0, (
        f"total_batch_tokens ({total_batch_tokens}) must be divisible by "
        f"device_batch_size * T * world_size = {B} * {T} * {world_size}"
    )
    grad_accum_steps = total_batch_tokens // (tokens_per_rank_micro * world_size)

    print0(
        f"scale  n_tokens={n_tokens_target:.2e}  batch={total_batch_tokens}  "
        f"matrix_lr={scale['lr']:.4f}  wd={scale['wd']:.4f}\n"
        f"steps  total={total_steps}  warmup={args.warmup_steps}  "
        f"accum={grad_accum_steps}  eval_every={args.eval_every}"
    )

    # ── Tokenizer (re-uses Stage 1's from ~/.cache/nanochat/tokenizer/) ──
    tokenizer   = get_tokenizer()
    token_bytes = get_token_bytes(device)
    print0(f"tokenizer  vocab_size={tokenizer.get_vocab_size()}")

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
    ckpt_dir = os.path.join(base_dir, "base_checkpoints", f"d{args.depth}")
    start_step    = 0
    loader_resume = None

    # ── Model init / resume ────────────────────────────────────────────
    if args.resume:
        print0(f"resuming pretrain from {ckpt_dir}")
        model, _, meta = build_model(ckpt_dir, step=None, device=device, phase="train")
        start_step    = meta["step"]
        loader_resume = meta.get("loader_state")
    else:
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
    raw_model = getattr(model, "_orig_mod", model)

    # ── Optimizer ──────────────────────────────────────────────────────
    optimizer = raw_model.setup_optimizer(
        lr             = scale["lr"],
        weight_decay   = scale["wd"],
        embedding_lr   = scale["embedding_lr"],
        unembedding_lr = scale["unembedding_lr"],
        scalar_lr      = scale["scalar_lr"],
    )
    weight_decay_scaled = scale["wd"]
    for g in optimizer.param_groups:
        g["initial_lr"] = g["lr"]  # stash for proportional LR scaling

    if args.resume:
        _, opt_data, _ = load_checkpoint(ckpt_dir, step=start_step, device=device,
                                          load_optimizer=True, rank=rank)
        if opt_data is not None:
            optimizer.load_state_dict(opt_data)

    # ── Dataloaders ────────────────────────────────────────────────────
    train_loader = make_pretrain_dataloader(
        tokenizer, B, T, split="train", device=device,
        resume_state_dict=loader_resume, rank=rank, world_size=world_size,
    )
    # Rebuilt fresh for every evaluation (nanochat convention) so val_bpb is
    # always measured on the same leading batches of the val split.
    build_val_loader = lambda: make_pretrain_dataloader(
        tokenizer, B, T, split="val", device=device,
        rank=rank, world_size=world_size,
    )
    eval_steps = args.eval_tokens // (B * T * world_size)

    run_name = args.run or f"archerchat-pretrain-d{args.depth}"
    tracker = init_tracker("archerchat", run_name, config={
        "phase": "pretrain", "depth": args.depth,
        "n_params": n_params["total"], "n_tokens_target": scale["n_tokens"],
        "total_batch_tokens": total_batch_tokens,
        "lr": scale["lr"], "wd": scale["wd"],
        "T": T, "world_size": world_size, "compute_dtype": str(COMPUTE_DTYPE),
        **{k: scale[k] for k in ("n_layers", "n_heads", "n_kv_heads", "n_embd")},
    })

    # ── MFU bookkeeping ────────────────────────────────────────────────
    flops_per_token = raw_model.estimate_flops()
    peak_flops = (get_peak_flops(torch.cuda.get_device_name(local_rank))
                  if device_type == "cuda" else float("inf"))
    print0(f"flops/token={flops_per_token:.2e}  peak_flops={peak_flops:.2e}")
    print0(f"training step {start_step} → {run_steps}"
           + (f" (capped from {total_steps} by --max-steps)" if args.max_steps is not None else "") + "\n")

    # ─────────────────────────────────────────────────────────────────────
    # Training loop
    # ─────────────────────────────────────────────────────────────────────
    # Time only the fwd/bwd/step section — eval, checkpointing, and compile
    # warmup must not pollute tok/s and MFU (nanochat convention).
    synchronize = torch.cuda.synchronize if device_type == "cuda" else (lambda: None)
    loader_state = None   # updated each micro-step; persisted in every checkpoint meta

    for step in range(start_step, run_steps + 1):
        last_step = step == run_steps

        # ── Validation (step 0, every eval_every steps, and the final step) ─
        if last_step or step % args.eval_every == 0:
            model.eval()
            val_loader = build_val_loader()
            val_bpb = evaluate_bpb(model, val_loader, eval_steps, token_bytes)
            model.train()
            print0(f"step {step:6d} | val_bpb {val_bpb:.4f}")
            if rank == 0:
                tracker.log({"step": step, "val/bpb": val_bpb})

        # ── Checkpoint (skip step == start_step: on resume it already exists;
        #    skip entirely in --max-steps debug mode so we don't litter ckpt_dir) ─
        if args.max_steps is None and step > start_step and (step % args.checkpoint_every == 0 or last_step):
            meta_data = {
                "step": step,
                "phase": "pretrain",
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
            maybe_upload_checkpoint(run_name, step, ckpt_dir, rank)

        if last_step:
            break

        # ── LR / momentum / weight-decay schedules (nanochat convention) ─
        lrm            = get_lr_multiplier(step, total_steps, args.warmup_steps)
        muon_momentum  = get_muon_momentum(step, total_steps)
        muon_wd        = get_weight_decay(step, total_steps, weight_decay_scaled)
        for g in optimizer.param_groups:
            g["lr"] = g["initial_lr"] * lrm
            if g.get("kind") == "muon":
                g["momentum"]     = muon_momentum
                g["weight_decay"] = muon_wd

        # ── Forward + backward with gradient accumulation ──────────────
        # NOTE: no gradient clipping — nanochat doesn't clip, and adding it
        # would change the training trajectory vs the Stage 1 oracles.
        synchronize()
        t0 = time.perf_counter()
        optimizer.zero_grad(set_to_none=True)
        loss_sum = None   # accumulated on-device; a single .item() below avoids
                          # one CPU-GPU sync per micro-step (nanochat convention)

        for _ in range(grad_accum_steps):
            x, y, loader_state = next(train_loader)
            # Divide before backward so gradients are already mean-reduced across micro-steps.
            loss = model(x, y, loss_reduction="mean") / grad_accum_steps
            loss.backward()
            loss_sum = loss.detach() if loss_sum is None else loss_sum + loss.detach()

        optimizer.step()
        synchronize()
        dt = time.perf_counter() - t0
        train_loss = loss_sum.item()   # single sync point per step

        # ── Throughput / MFU (measures only the fwd/bwd/step section) ──
        tok_per_sec = total_batch_tokens / dt
        mfu = flops_per_token * tok_per_sec / peak_flops if peak_flops < float("inf") else 0.0

        # ── Logging ───────────────────────────────────────────────────
        if rank == 0:
            tracker.log({
                "step": step,
                "train/loss":       train_loss,
                "train/lrm":        lrm,
                "perf/tok_per_sec": tok_per_sec,
                "perf/mfu":         mfu,
            })
        if step % 10 == 0:
            print0(
                f"step {step:6d} | loss {train_loss:.4f} | lrm {lrm:.3f} | "
                f"tok/s {tok_per_sec:,.0f} | mfu {mfu:.1%}"
            )

    print0(f"\ndone: pretrain d{args.depth}  ({run_steps} steps"
           + (" — debug/--max-steps run" if args.max_steps is not None else "") + ")")
    tracker.finish()


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    device_type = args.device or autodetect_device_type()
    _is_ddp, rank, local_rank, world_size, device = compute_init(device_type)

    print_banner()
    print0(f"phase=pretrain  depth={args.depth}  "
           f"world_size={world_size}  dtype={COMPUTE_DTYPE}")

    run_pretrain(args, rank, local_rank, world_size, device, device_type)
    compute_cleanup()


if __name__ == "__main__":
    main()
