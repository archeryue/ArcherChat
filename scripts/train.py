#!/usr/bin/env python3
"""
ArcherChat training entry point.
Handles pretraining (--phase pretrain) and supervised fine-tuning (--phase sft).
All heavy ML logic lives in archerchat/; this file is pure orchestration.

The two phases follow nanochat's conventions exactly (base_train.py / chat_sft.py):
  pretrain — step-driven horizon from compute_scale(), trapezoidal LR schedule,
             cosine weight-decay schedule, Muon momentum schedule.
  sft      — dataset-driven stopping (one epoch by default), LRs inherited from
             the pretrain derivation × --init-lr-frac, weight decay 0, its own
             progress-based LR schedule and momentum schedule.

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

from dotenv import load_dotenv
# Load repo-root .env (ENDLEX_URL / ENDLEX_TOKEN) before anything reads the env.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import torch
import torch.distributed as dist

from archerchat.common import (
    compute_init, compute_cleanup,
    get_base_dir, get_peak_flops,
    print0, print_banner, COMPUTE_DTYPE,
    init_tracker, upload_checkpoint_async,
)
from archerchat.model      import GPT, GPTConfig
from archerchat.scaling    import compute_scale
from archerchat.optimizer  import (
    get_lr_multiplier, get_muon_momentum, get_weight_decay,
    get_sft_lr_multiplier, get_sft_muon_momentum,
)
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

    # Hyper-param overrides (LRs and WD come from scaling.py; override sparingly)
    p.add_argument("--total-batch-size",  type=int, default=None,
                   help="Override total tokens per gradient step")
    p.add_argument("--device-batch-size", type=int, default=32,
                   help="Per-GPU micro-batch size in sequences. This is a VRAM knob, "
                        "NOT derived from scaling — grad accumulation makes up the "
                        "difference. (Stage 1 on 16 GiB: d8=16, d12=8; nanochat default 32)")
    p.add_argument("--sequence-len",      type=int, default=2048)
    p.add_argument("--warmup-steps",      type=int, default=40,
                   help="Pretrain: linear-warmup steps (nanochat default: 40)")
    p.add_argument("--window-pattern",    type=str, default="SSSL",
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

    # SFT-specific (nanochat chat_sft.py conventions)
    p.add_argument("--num-iterations", type=int, default=-1,
                   help="SFT: number of optimization steps (-1 = one epoch of the dataset)")
    p.add_argument("--init-lr-frac",   type=float, default=0.8,
                   help="SFT: initial LR as a fraction of the pretrain base LRs")
    p.add_argument("--warmup-ratio",   type=float, default=0.0,
                   help="SFT: fraction of the run used for LR warmup")
    p.add_argument("--warmdown-ratio", type=float, default=0.5,
                   help="SFT: fraction of the run used for LR warmdown")
    p.add_argument("--final-lr-frac",  type=float, default=0.0,
                   help="SFT: final LR as a fraction of the initial LR")
    p.add_argument("--load-optimizer", type=int, default=1,
                   help="SFT: warm-start optimizer state (momentum buffers) from the "
                        "pretrain checkpoint (0=no, 1=yes)")

    # Eval / checkpoint cadence
    p.add_argument("--eval-every",  type=int, default=None,
                   help="Run validation every N gradient steps "
                        "(default: 250 pretrain, 200 sft — nanochat conventions)")
    p.add_argument("--eval-tokens", type=int, default=None,
                   help="Tokens per validation pass; eval batch count is derived as "
                        "eval_tokens // (device_batch_size * T * world_size) "
                        "(default: 80*2^19 pretrain, 40*2^19 sft — nanochat conventions)")
    p.add_argument("--checkpoint-every", type=int, default=1000,
                   help="Pretrain: save checkpoint every N gradient steps "
                        "(SFT saves once, at the end of the run)")

    # Hardware
    p.add_argument("--device", type=str, default=None,
                   help="Force device type: cuda | cpu | mps (default: auto-detect)")

    args = p.parse_args()

    # Phase-dependent defaults (nanochat: base_train.py vs chat_sft.py)
    if args.eval_every is None:
        args.eval_every = 250 if args.phase == "pretrain" else 200
    if args.eval_tokens is None:
        args.eval_tokens = (80 if args.phase == "pretrain" else 40) * 524288

    return args


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


def _sync_last_step(last_step: bool, world_size: int, device) -> bool:
    """All ranks must agree on stopping (SFT's loader is dataset-driven per rank)."""
    if world_size == 1:
        return last_step
    t = torch.tensor(int(last_step), dtype=torch.int32, device=device)
    dist.all_reduce(t, op=dist.ReduceOp.MAX)
    return bool(t.item())


class StepTimer:
    """Times only the fwd/bwd/step section of each iteration.

    Eval, checkpointing, and torch.compile warmup must not pollute tok/s and MFU,
    so start() is called after those sections and stop() right after optimizer.step().
    """

    def __init__(self, device_type: str):
        self._sync = torch.cuda.synchronize if device_type == "cuda" else (lambda: None)
        self._t0 = None

    def start(self) -> None:
        self._sync()
        self._t0 = time.perf_counter()

    def stop(self) -> float:
        self._sync()
        return time.perf_counter() - self._t0


# ─────────────────────────────────────────────────────────────────────────────
# Shared setup helpers
# ─────────────────────────────────────────────────────────────────────────────

def _setup_grad_accum(total_batch_tokens, device_batch_size, T, world_size):
    tokens_per_rank_micro = device_batch_size * T
    assert total_batch_tokens % (tokens_per_rank_micro * world_size) == 0, (
        f"total_batch_tokens ({total_batch_tokens}) must be divisible by "
        f"device_batch_size * T * world_size = "
        f"{device_batch_size} * {T} * {world_size}"
    )
    return total_batch_tokens // (tokens_per_rank_micro * world_size)


def _init_tracker_for_run(args, scale, n_params, total_batch_tokens, T, world_size):
    run_name = args.run or f"archerchat-{args.phase}-d{args.depth}"
    tracker = init_tracker("archerchat", run_name, config={
        "phase": args.phase, "depth": args.depth,
        "n_params": n_params["total"], "n_tokens_target": scale["n_tokens"],
        "total_batch_tokens": total_batch_tokens,
        "lr": scale["lr"],
        "wd": 0.0 if args.phase == "sft" else scale["wd"],  # SFT trains with wd=0
        "T": T, "world_size": world_size, "compute_dtype": str(COMPUTE_DTYPE),
        **{k: scale[k] for k in ("n_layers", "n_heads", "n_kv_heads", "n_embd")},
    })
    return run_name, tracker


# ─────────────────────────────────────────────────────────────────────────────
# Pretraining
# ─────────────────────────────────────────────────────────────────────────────

def run_pretrain(args, rank, local_rank, world_size, device, device_type):
    scale = compute_scale(args.depth)   # see archerchat/scaling.py for the math

    total_batch_tokens = args.total_batch_size or scale["batch_size"]
    B                  = args.device_batch_size
    T                  = args.sequence_len
    n_tokens_target    = scale["n_tokens"]

    total_steps      = n_tokens_target // total_batch_tokens   # floor like nanochat
    grad_accum_steps = _setup_grad_accum(total_batch_tokens, B, T, world_size)

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
    ckpt_dir = _ckpt_dir(base_dir, "pretrain", args.depth)
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

    run_name, tracker = _init_tracker_for_run(
        args, scale, n_params, total_batch_tokens, T, world_size)

    # ── MFU bookkeeping ────────────────────────────────────────────────
    flops_per_token = raw_model.estimate_flops()
    peak_flops = (get_peak_flops(torch.cuda.get_device_name(local_rank))
                  if device_type == "cuda" else float("inf"))
    print0(f"flops/token={flops_per_token:.2e}  peak_flops={peak_flops:.2e}")
    print0(f"training step {start_step} → {total_steps}\n")

    # ─────────────────────────────────────────────────────────────────────
    # Training loop
    # ─────────────────────────────────────────────────────────────────────
    loader_state = None   # updated each micro-step; persisted in every checkpoint meta
    timer = StepTimer(device_type)

    for step in range(start_step, total_steps + 1):
        last_step = step == total_steps

        # ── Validation (step 0, every eval_every steps, and the final step) ─
        if last_step or step % args.eval_every == 0:
            model.eval()
            val_loader = build_val_loader()
            val_bpb = evaluate_bpb(model, val_loader, eval_steps, token_bytes)
            model.train()
            print0(f"step {step:6d} | val_bpb {val_bpb:.4f}")
            if rank == 0:
                tracker.log({"step": step, "val/bpb": val_bpb})

        # ── Checkpoint (skip step == start_step: on resume it already exists) ─
        if step > start_step and (step % args.checkpoint_every == 0 or last_step):
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
            _maybe_upload(run_name, step, ckpt_dir, rank)

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
        timer.start()
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
        dt = timer.stop()
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

    print0(f"\ndone: pretrain d{args.depth}  ({total_steps} steps)")
    tracker.finish()


# ─────────────────────────────────────────────────────────────────────────────
# SFT  (nanochat chat_sft.py conventions: dataset-driven stopping, wd=0,
#       LRs = pretrain base LRs × init_lr_frac, progress-based LR schedule)
# ─────────────────────────────────────────────────────────────────────────────

def run_sft(args, rank, local_rank, world_size, device, device_type):
    from archerchat.sft import make_sft_dataloader

    base_dir = get_base_dir()
    ckpt_dir = _ckpt_dir(base_dir, "sft", args.depth)

    # ── Load pretrain weights ──────────────────────────────────────────
    pretrain_dir = args.init_from or _ckpt_dir(base_dir, "pretrain", args.depth)
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
    grad_accum_steps = _setup_grad_accum(total_batch_tokens, B, T, world_size)

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

    run_name, tracker = _init_tracker_for_run(
        args, scale, n_params, total_batch_tokens, T, world_size)

    flops_per_token = raw_model.estimate_flops()
    peak_flops = (get_peak_flops(torch.cuda.get_device_name(local_rank))
                  if device_type == "cuda" else float("inf"))

    # ─────────────────────────────────────────────────────────────────────
    # Training loop — dataset-driven: the loader signals epoch progress and
    # end-of-epoch via `info`; --num-iterations > 0 overrides the horizon.
    # ─────────────────────────────────────────────────────────────────────
    x, y, info = next(train_loader)   # prefetch the first micro-batch
    step      = 0
    last_step = False
    val_bpb   = None
    timer     = StepTimer(device_type)

    while True:
        last_step = _sync_last_step(last_step, world_size, device)

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
            _maybe_upload(run_name, step, ckpt_dir, rank)
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
        timer.start()
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
        dt = timer.stop()
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

    device_type = args.device or (
        "cuda" if torch.cuda.is_available() else
        "mps"  if torch.backends.mps.is_available() else "cpu"
    )
    is_ddp, rank, local_rank, world_size, device = compute_init(device_type)

    print_banner()
    print0(f"phase={args.phase}  depth={args.depth}  "
           f"world_size={world_size}  dtype={COMPUTE_DTYPE}")

    run = run_pretrain if args.phase == "pretrain" else run_sft
    run(args, rank, local_rank, world_size, device, device_type)

    compute_cleanup()


if __name__ == "__main__":
    main()
