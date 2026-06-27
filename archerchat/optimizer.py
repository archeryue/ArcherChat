"""
archerchat/optimizer.py — Muon optimizer (MuonAdamW, DistMuonAdamW) and LR schedule.

Implement everything marked NotImplementedError.
model.py's setup_optimizer() imports MuonAdamW / DistMuonAdamW from here.
train.py imports get_lr() from here.

Compute-optimal scaling (compute_scale) lives in archerchat.common — it is
configuration logic, not optimizer logic.

What to implement:
  - get_lr(): warmup + cosine decay LR schedule
  - newton_schulz(): NS5 orthogonalization (core of Muon)
  - MuonAdamW: single-GPU combined Muon + AdamW optimizer
  - DistMuonAdamW: multi-GPU variant with gradient all-reduce before NS step

Reference: nanochat/optim.py
"""

from __future__ import annotations

import math
from typing import Callable, Iterable

import torch
import torch.distributed as dist


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
