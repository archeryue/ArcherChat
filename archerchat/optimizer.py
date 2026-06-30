"""
archerchat/optimizer.py — Muon optimizer (MuonAdamW, DistMuonAdamW) and LR/momentum/WD schedules.

Implement everything marked NotImplementedError.
model.py's setup_optimizer() imports MuonAdamW / DistMuonAdamW from here.
train.py imports get_lr_multiplier, get_muon_momentum, get_weight_decay from here.

Compute-optimal scaling (compute_scale) lives in archerchat.scaling.

What to implement:
  - get_lr_multiplier(): trapezoidal LR schedule (warmup → constant → linear warmdown)
  - get_muon_momentum(): Muon momentum schedule (0.85→0.97 warmup, warmdown to 0.90)
  - get_weight_decay():  cosine WD decay to zero
  - newton_schulz():     NS5 orthogonalization (core of Muon)
  - MuonAdamW:          single-GPU combined Muon + AdamW optimizer
  - DistMuonAdamW:      multi-GPU variant with gradient all-reduce before NS step

Reference: nanochat/optim.py, nanochat/base_train.py
"""

from __future__ import annotations

import math
from typing import Callable, Iterable

import torch
import torch.distributed as dist


# ─────────────────────────────────────────────────────────────────────────────
# LR schedule
# ─────────────────────────────────────────────────────────────────────────────

def get_lr_multiplier(
    step: int,
    total_steps: int,
    warmup_steps: int = 40,
    warmdown_ratio: float = 0.65,
    final_lr_frac: float = 0.05,
) -> float:
    """
    Trapezoidal LR schedule (nanochat convention exactly):
        [0, warmup_steps)             : linear ramp  (step+1)/warmup_steps
        [warmup_steps, warmdown_start): constant 1.0
        [warmdown_start, total_steps] : linear ramp 1.0 → final_lr_frac

    NOTE: warmup uses (step+1)/warmup_steps so step=0 returns 1/warmup_steps,
    not 0. This matches nanochat exactly. Do not clamp the warmup phase — the
    multiplier can be below final_lr_frac during the first few steps.

    Returns a multiplier in (0, 1.0].
    train.py applies it as:
        group["lr"] = group["initial_lr"] * get_lr_multiplier(step, ...)

    Args:
        step:           current gradient step (0-indexed)
        total_steps:    total training steps
        warmup_steps:   linear warmup length (nanochat default: 40)
        warmdown_ratio: fraction of total_steps used for linear warmdown (default: 0.65)
        final_lr_frac:  LR at the end of warmdown as a fraction of peak (default: 0.05)
    """
    raise NotImplementedError


def get_muon_momentum(step: int, total_steps: int, warmdown_ratio: float = 0.65) -> float:
    """
    Muon momentum schedule (nanochat convention):
        [0, 400)                  : linear warmup 0.85 → 0.97
        [400, warmdown_start)     : constant 0.97
        [warmdown_start, total]   : linear warmdown 0.97 → 0.90

    Returns momentum value for the Muon param groups at this step.
    Applied by train.py as: group["momentum"] = get_muon_momentum(step, total_steps)
    """
    raise NotImplementedError


def get_weight_decay(step: int, total_steps: int, weight_decay_scaled: float) -> float:
    """
    Cosine weight decay schedule (nanochat convention):
        wd(step) = weight_decay_scaled * 0.5 * (1 + cos(π * step / total_steps))

    Decays from weight_decay_scaled to 0 over the course of training.
    Applied by train.py as: group["weight_decay"] = get_weight_decay(step, total_steps, wd)
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
