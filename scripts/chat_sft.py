#!/usr/bin/env python3
"""
ArcherChat supervised fine-tuning entry point (nanochat chat_sft.py).
All heavy ML logic lives in archerchat/; this file is pure orchestration.

SFT follows nanochat's conventions exactly: dataset-driven stopping (one epoch
by default), LRs inherited from the pretrain derivation × --init-lr-frac, weight
decay 0, and its own progress-based LR and Muon momentum schedules.

Single-GPU:
    python scripts/chat_sft.py --depth 8

Multi-GPU (torchrun):
    torchrun --standalone --nproc_per_node=8 scripts/chat_sft.py --depth 24

Pretraining lives in scripts/base_train.py; both pull shared infrastructure from
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
import torch.distributed as dist

from archerchat.common import (
    compute_init, compute_cleanup, autodetect_device_type,
    get_base_dir, get_peak_flops, print0, print_banner, COMPUTE_DTYPE,
    init_tracker, maybe_upload_checkpoint,
)
from archerchat.model      import GPTConfig
from archerchat.scaling    import compute_scale
from archerchat.optimizer  import get_sft_lr_multiplier, get_sft_muon_momentum
from archerchat.loss       import evaluate_bpb
from archerchat.dataloader import get_token_bytes
from archerchat.checkpoint import save_checkpoint, load_checkpoint, build_model
from archerchat.sft        import make_sft_dataloader

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Args
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="ArcherChat SFT trainer")

    p.add_argument("--depth", type=int, required=True,
                   help="Model depth. All hyperparams are derived via compute_scale().")
    p.add_argument("--total-batch-size",  type=int, default=None,
                   help="Override total tokens per gradient step")
    p.add_argument("--device-batch-size", type=int, default=32,
                   help="Per-GPU micro-batch size in sequences. This is a VRAM knob, "
                        "NOT derived from scaling — grad accumulation makes up the "
                        "difference. (Stage 1 on 16 GiB: d8=16, d12=8; nanochat default 32)")
    p.add_argument("--sequence-len", type=int, default=2048)
    p.add_argument("--run", type=str, default=None,
                   help="Endlex run name (default: archerchat-sft-d{depth})")
    p.add_argument("--init-from", type=str, default=None,
                   help="Explicit path to a pretrain checkpoint dir "
                        "(default: auto-locate the pretrain d{depth} checkpoint)")
    p.add_argument("--num-iterations", type=int, default=-1,
                   help="Number of optimization steps (-1 = one epoch of the dataset)")
    p.add_argument("--init-lr-frac",   type=float, default=0.8,
                   help="Initial LR as a fraction of the pretrain base LRs")
    p.add_argument("--warmup-ratio",   type=float, default=0.0,
                   help="Fraction of the run used for LR warmup")
    p.add_argument("--warmdown-ratio", type=float, default=0.5,
                   help="Fraction of the run used for LR warmdown")
    p.add_argument("--final-lr-frac",  type=float, default=0.0,
                   help="Final LR as a fraction of the initial LR")
    p.add_argument("--load-optimizer", type=int, default=1,
                   help="Warm-start optimizer state (momentum buffers) from the "
                        "pretrain checkpoint (0=no, 1=yes)")
    p.add_argument("--eval-every",  type=int, default=200,
                   help="Run validation every N gradient steps (nanochat: 200)")
    p.add_argument("--eval-tokens", type=int, default=40 * 524288,
                   help="Tokens per validation pass; eval batch count is derived as "
                        "eval_tokens // (device_batch_size * T * world_size) (nanochat: 40*2^19)")
    p.add_argument("--ckpt-dir", type=str, default=None,
                   help="Where to write SFT checkpoints (default: chatsft_checkpoints/d{depth}). "
                        "Set this for ArcherChat-trained runs so they don't overwrite the "
                        "Stage-1 nanochat oracle checkpoints.")
    p.add_argument("--device", type=str, default=None,
                   help="Force device type: cuda | cpu | mps (default: auto-detect)")

    return p.parse_args()


def sync_last_step(last_step, world_size, device):
    """All ranks must agree on stopping (SFT's loader is dataset-driven per rank)."""
    if world_size == 1:
        return last_step
    t = torch.tensor(int(last_step), dtype=torch.int32, device=device)
    dist.all_reduce(t, op=dist.ReduceOp.MAX)
    return bool(t.item())


# ─────────────────────────────────────────────────────────────────────────────
# SFT  (nanochat chat_sft.py conventions: dataset-driven stopping, wd=0,
#       LRs = pretrain base LRs × init_lr_frac, progress-based LR schedule)
# ─────────────────────────────────────────────────────────────────────────────

def run_sft(args, rank, local_rank, world_size, device, device_type):
    base_dir = get_base_dir()
    ckpt_dir = args.ckpt_dir or os.path.join(base_dir, "chatsft_checkpoints", f"d{args.depth}")

    # ── Load pretrain weights ──────────────────────────────────────────
    pretrain_dir = args.init_from or os.path.join(base_dir, "base_checkpoints", f"d{args.depth}")
    print0(f"SFT: loading pretrain weights from {pretrain_dir}")
    model, tokenizer, meta = build_model(pretrain_dir, step=None, device=device, phase="train")
    config = GPTConfig(**meta["model_config"])
    token_bytes = get_token_bytes(device)

    # Batch sizes and base LRs come from the same derivation pretraining used.
    # (nanochat inherits them from the pretrain checkpoint's user_config; our
    # compute_scale() is deterministic in depth, so re-deriving is equivalent.)
    scale = compute_scale(args.depth)
    total_batch_tokens = args.total_batch_size or scale["batch_size"]
    B = args.device_batch_size
    T = args.sequence_len
    tokens_per_rank_micro = B * T
    assert total_batch_tokens % (tokens_per_rank_micro * world_size) == 0, (
        f"total_batch_tokens ({total_batch_tokens}) must be divisible by "
        f"device_batch_size * T * world_size = {B} * {T} * {world_size}"
    )
    grad_accum_steps = total_batch_tokens // (tokens_per_rank_micro * world_size)

    print0(f"sft  batch={total_batch_tokens}  accum={grad_accum_steps}  "
           f"init_lr_frac={args.init_lr_frac}  num_iterations={args.num_iterations}")

    model.train()
    n_params = model.num_scaling_params()
    if device_type == "cuda":
        model = torch.compile(model)
    raw_model = getattr(model, "_orig_mod", model)

    # ── Optimizer ──────────────────────────────────────────────────────
    # Pretraining's cosine WD schedule ends at zero, so SFT continues with wd=0.
    optimizer = raw_model.setup_optimizer(
        lr             = scale["lr"],
        weight_decay   = 0.0,
        embedding_lr   = scale["embedding_lr"],
        unembedding_lr = scale["unembedding_lr"],
        scalar_lr      = scale["scalar_lr"],
    )

    # Warm-start momentum buffers from the pretrain optimizer state.
    # load_state_dict() overwrites param_group hyperparams (incl. LRs, which the
    # pretrain warmdown left near zero) — save our fresh LRs and restore them.
    if args.load_optimizer:
        _, opt_data, _ = load_checkpoint(pretrain_dir, step=None, device=device,
                                          load_optimizer=True, rank=rank)
        if opt_data is not None:
            base_lrs = [g["lr"] for g in optimizer.param_groups]
            optimizer.load_state_dict(opt_data)
            for g, base_lr in zip(optimizer.param_groups, base_lrs):
                g["lr"] = base_lr
            print0("warm-started optimizer from pretrain checkpoint (LRs reset)")
        else:
            print0("WARNING: pretrain optimizer state not found, starting fresh")

    for g in optimizer.param_groups:
        g["lr"] = g["lr"] * args.init_lr_frac
        g["initial_lr"] = g["lr"]

    # ── Dataloaders ────────────────────────────────────────────────────
    train_loader = make_sft_dataloader(
        tokenizer, B, T, split="train", device=device,
        rank=rank, world_size=world_size,
    )
    build_val_loader = lambda: make_sft_dataloader(
        tokenizer, B, T, split="val", device=device,
        rank=rank, world_size=world_size,
    )
    eval_steps = args.eval_tokens // (B * T * world_size)

    run_name = args.run or f"archerchat-sft-d{args.depth}"
    tracker = init_tracker("archerchat", run_name, config={
        "phase": "sft", "depth": args.depth,
        "n_params": n_params["total"], "n_tokens_target": scale["n_tokens"],
        "total_batch_tokens": total_batch_tokens,
        "lr": scale["lr"], "wd": 0.0,  # SFT trains with wd=0
        "T": T, "world_size": world_size, "compute_dtype": str(COMPUTE_DTYPE),
        **{k: scale[k] for k in ("n_layers", "n_heads", "n_kv_heads", "n_embd")},
    })

    flops_per_token = raw_model.estimate_flops()
    peak_flops = (get_peak_flops(torch.cuda.get_device_name(local_rank))
                  if device_type == "cuda" else float("inf"))

    # ─────────────────────────────────────────────────────────────────────
    # Training loop — dataset-driven: the loader signals epoch progress and
    # end-of-epoch via `info`; --num-iterations > 0 overrides the horizon.
    # ─────────────────────────────────────────────────────────────────────
    # Time only the fwd/bwd/step section — eval and checkpointing must not
    # pollute tok/s and MFU (nanochat convention).
    synchronize = torch.cuda.synchronize if device_type == "cuda" else (lambda: None)
    x, y, info = next(train_loader)   # prefetch the first micro-batch
    step      = 0
    last_step = False
    val_bpb   = None

    while True:
        last_step = sync_last_step(last_step, world_size, device)

        # ── Validation (every eval_every steps and at the last step) ──
        if last_step or step % args.eval_every == 0:
            model.eval()
            val_loader = build_val_loader()
            val_bpb = evaluate_bpb(model, val_loader, eval_steps, token_bytes)
            model.train()
            print0(f"step {step:6d} | val_bpb {val_bpb:.4f}")
            if rank == 0:
                tracker.log({"step": step, "val/bpb": val_bpb})

        # ── Final checkpoint (SFT saves once, at the end — nanochat convention) ─
        if last_step:
            meta_data = {
                "step": step,
                "phase": "sft",
                "val_bpb": val_bpb,
                "model_config": vars(config),
                "loader_state": None,
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
            break

        # ── Schedules (progress-based; SFT has no weight-decay schedule) ─
        progress = (step / args.num_iterations if args.num_iterations > 0
                    else info["progress"])
        lrm           = get_sft_lr_multiplier(progress, args.warmup_ratio,
                                              args.warmdown_ratio, args.final_lr_frac)
        muon_momentum = get_sft_muon_momentum(step)
        for g in optimizer.param_groups:
            g["lr"] = g["initial_lr"] * lrm
            if g.get("kind") == "muon":
                g["momentum"] = muon_momentum

        # ── Forward + backward with gradient accumulation (no clipping) ─
        synchronize()
        t0 = time.perf_counter()
        optimizer.zero_grad(set_to_none=True)
        loss_sum = None

        for _ in range(grad_accum_steps):
            loss = model(x, y, loss_reduction="mean") / grad_accum_steps
            loss.backward()
            loss_sum = loss.detach() if loss_sum is None else loss_sum + loss.detach()
            x, y, info = next(train_loader)   # fetch next (may flag end of epoch)
            if info["last_step"]:
                last_step = True

        optimizer.step()
        synchronize()
        dt = time.perf_counter() - t0
        train_loss = loss_sum.item()
        step += 1
        if 0 < args.num_iterations <= step:
            last_step = True

        tok_per_sec = total_batch_tokens / dt
        mfu = flops_per_token * tok_per_sec / peak_flops if peak_flops < float("inf") else 0.0

        if rank == 0:
            tracker.log({
                "step": step,
                "train/loss":       train_loss,
                "train/lrm":        lrm,
                "train/epoch":      info["epoch"],
                "perf/tok_per_sec": tok_per_sec,
                "perf/mfu":         mfu,
            })
        if step % 10 == 0:
            print0(
                f"step {step:6d} | loss {train_loss:.4f} | lrm {lrm:.3f} | "
                f"epoch {info['epoch']} | tok/s {tok_per_sec:,.0f} | mfu {mfu:.1%}"
            )

    print0(f"\ndone: sft d{args.depth}  ({step} steps)")
    tracker.finish()


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    device_type = args.device or autodetect_device_type()
    _is_ddp, rank, local_rank, world_size, device = compute_init(device_type)

    print_banner()
    print0(f"phase=sft  depth={args.depth}  "
           f"world_size={world_size}  dtype={COMPUTE_DTYPE}")

    run_sft(args, rank, local_rank, world_size, device, device_type)
    compute_cleanup()


if __name__ == "__main__":
    main()
