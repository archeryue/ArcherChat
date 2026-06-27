"""
archerchat/optimizer.py — Muon optimizer + compute-optimal scaling derivation.

Implement everything marked NotImplementedError.
model.py calls setup_optimizer() which imports MuonAdamW from here.
train.py calls compute_scale() and get_lr().

What to implement:
  - compute_scale(depth): derive compute-optimal hyperparams from model depth.
    Must match nanochat exactly for depth ∈ {4, 8, 12, 16, 20, 24}.
    Acceptance gate (step 3): exact equality with nanochat's table.

  - get_lr(step, warmup_steps, total_steps, max_lr, min_lr): LR schedule.
    Linear warmup from 0 → max_lr, then cosine decay to min_lr.

  - MuonAdamW: single-GPU combined Muon + AdamW optimizer.
    Muon applies Newton–Schulz orthogonalization to the gradient before the AdamW
    step (for 2-D weight matrices).  AdamW runs on all other params.
    Acceptance gate (step 2): 5-step param trajectory matches nanochat < 1e-5.

  - DistMuonAdamW: multi-GPU version (torchrun / DDP).
    Each rank owns a shard of the Muon param group; Nesterov momentum is
    all-reduced across ranks before the Newton–Schulz step.

Reference implementations: nanochat/optim.py, https://github.com/KellerJordan/Muon
"""

from __future__ import annotations

import math
from typing import Callable, Iterable

import torch
import torch.distributed as dist


# ─────────────────────────────────────────────────────────────────────────────
# Scaling derivation
# ─────────────────────────────────────────────────────────────────────────────

def compute_scale(depth: int) -> dict:
    """
    Derive compute-optimal architecture + training hyperparams from model depth.

    This is the single function that encodes the scaling-law math for ArcherChat.
    It must reproduce nanochat's exact numbers for every supported depth.

    Args:
        depth: number of transformer layers (= n_layer in GPTConfig)

    Returns a dict with these exact keys (train.py reads all of them):
        n_layers        int   — same as depth
        n_heads         int   — query heads
        n_kv_heads      int   — key/value heads (GQA)
        n_embd          int   — model width (embedding dimension)
        n_params        int   — total parameter count (embedding table included)
        n_tokens        int   — compute-optimal training token budget
        batch_size      int   — total tokens per gradient step (across all GPUs)
        device_batch_size int — sequences per GPU per micro-step
        lr              float — peak matrix learning rate
        wd              float — weight decay

    Acceptance gate (TECH_PLAN step 3):
        For depth ∈ {4, 8, 12, 16, 20, 24}, every value must match nanochat exactly.
        Run: python -c "from archerchat.optimizer import compute_scale; ..."
        and compare against nanochat's table.  Any mismatch = re-derive.
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# LR schedule
# ─────────────────────────────────────────────────────────────────────────────

def get_lr(
    step: int,
    warmup_steps: int,
    total_steps: int,
    max_lr: float,
    min_lr: float,
) -> float:
    """
    Linear warmup (steps 0 → warmup_steps) then cosine decay (→ total_steps).

    Returns the absolute LR value for the "matrix" param group at this step.
    train.py scales all other groups proportionally via:
        group["lr"] = group["initial_lr"] * (current_lr / max_lr)

    Args:
        step:         current gradient step (0-indexed)
        warmup_steps: number of warmup steps (LR linearly increases 0 → max_lr)
        total_steps:  total number of training steps
        max_lr:       peak learning rate
        min_lr:       minimum LR at end of cosine decay (typically max_lr / 10)

    Returns:
        float in [min_lr, max_lr]
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Newton–Schulz orthogonalization (the core of Muon)
# ─────────────────────────────────────────────────────────────────────────────

def newton_schulz(G: torch.Tensor, n_steps: int = 5) -> torch.Tensor:
    """
    Approximate the orthogonal factor of G via Newton–Schulz iteration.

    Given G ∈ ℝ^{m×n}, returns an approximately orthogonal matrix X of the
    same shape such that X ≈ U (the left singular vectors of G).

    The iteration is:
        X_{t+1} = a * X_t + b * X_t @ X_t.T @ X_t
    with (a, b) chosen to converge in ~5 steps.

    Must run in the same dtype as G (bf16 during training).
    Acceptance gate (step 2): run in fp32 against nanochat's newton_schulz.

    Args:
        G:       (m, n) weight gradient, m ≥ n assumed (transpose if not)
        n_steps: number of Newton–Schulz iterations (nanochat uses 5)

    Returns:
        (m, n) approximately orthogonal matrix
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Single-GPU optimizer
# ─────────────────────────────────────────────────────────────────────────────

class MuonAdamW(torch.optim.Optimizer):
    """
    Combined Muon + AdamW optimizer for single-GPU training.

    Param groups:
      - "muon" group:  2-D weight matrices (Q/K/V/O projections, FFN weights, lm_head).
                       Gradient is orthogonalized via newton_schulz() then used as
                       the effective gradient for an SGD-with-momentum step.
      - "adamw" group: all other params (embeddings, RMSNorm weights).
                       Standard AdamW update.

    The two groups are passed as a list to the constructor:
        optimizer = MuonAdamW([
            {"params": matrix_params, "lr": lr, ...},
            {"params": other_params,  "lr": lr * 0.1, ...},
        ])

    model.py's setup_optimizer() creates both groups and passes them here.

    Acceptance gate (step 2):
        Fixed 1024×1024 matrix, fixed gradient → 5 Muon steps → max abs diff < 1e-5
        vs nanochat's MuonAdamW.
    """

    def __init__(
        self,
        params: Iterable,
        lr: float = 0.02,
        weight_decay: float = 0.0,
        momentum: float = 0.95,
        nesterov: bool = True,
        ns_steps: int = 5,
        betas: tuple[float, float] = (0.9, 0.95),
        eps: float = 1e-8,
    ) -> None:
        raise NotImplementedError

    @torch.no_grad()
    def step(self, closure: Callable | None = None) -> torch.Tensor | None:
        raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Multi-GPU optimizer
# ─────────────────────────────────────────────────────────────────────────────

class DistMuonAdamW(torch.optim.Optimizer):
    """
    Distributed Muon + AdamW for torchrun / DDP training.

    Identical to MuonAdamW except that each rank owns a *shard* of the Muon
    param group.  Before the Newton–Schulz step the momentum buffer is
    all-reduced across ranks so every rank sees the global gradient.

    Only instantiated when world_size > 1 (model.py checks dist.is_initialized()).

    Implementation note: use dist.all_reduce(buf, op=dist.ReduceOp.AVG) or SUM+scale.
    """

    def __init__(
        self,
        params: Iterable,
        lr: float = 0.02,
        weight_decay: float = 0.0,
        momentum: float = 0.95,
        nesterov: bool = True,
        ns_steps: int = 5,
        betas: tuple[float, float] = (0.9, 0.95),
        eps: float = 1e-8,
        rank: int = 0,
        world_size: int = 1,
    ) -> None:
        raise NotImplementedError

    @torch.no_grad()
    def step(self, closure: Callable | None = None) -> torch.Tensor | None:
        raise NotImplementedError
