"""
archerchat/optimizer.py — Muon optimizer (MuonAdamW, DistMuonAdamW) and LR/momentum/WD schedules.

Implement everything marked NotImplementedError.
model.py's setup_optimizer() imports MuonAdamW / DistMuonAdamW from here.
train.py imports get_lr_multiplier, get_muon_momentum, get_weight_decay from here.

Compute-optimal scaling (compute_scale) lives in archerchat.scaling.

What to implement:
  - get_lr_multiplier():     trapezoidal LR schedule (warmup → constant → linear warmdown)
  - get_muon_momentum():     Muon momentum schedule (0.85→0.97 warmup, warmdown to 0.90)
  - get_weight_decay():      cosine WD decay to zero
  - get_sft_lr_multiplier(): SFT progress-based LR schedule (nanochat chat_sft.py)
  - get_sft_muon_momentum(): SFT Muon momentum schedule (0.85→0.95 over 300 steps)
  - newton_schulz():         NS5 orthogonalization (core of Muon)
  - MuonAdamW:              single-GPU combined Muon + AdamW optimizer
  - DistMuonAdamW:          multi-GPU variant with gradient all-reduce before NS step

Reference: nanochat/optim.py, nanochat/base_train.py, nanochat/scripts/chat_sft.py
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
# SFT schedules (nanochat chat_sft.py conventions)
# ─────────────────────────────────────────────────────────────────────────────

def get_sft_lr_multiplier(
    progress: float,
    warmup_ratio: float = 0.0,
    warmdown_ratio: float = 0.5,
    final_lr_frac: float = 0.0,
) -> float:
    """
    SFT LR schedule (nanochat chat_sft.py exactly).

    Same trapezoidal shape as get_lr_multiplier(), but parameterized by
    progress ∈ [0, 1] instead of absolute step counts, because SFT is
    dataset-driven and doesn't always know total steps in advance:

        progress < warmup_ratio:          (progress + 1e-8) / warmup_ratio
        progress <= 1.0 - warmdown_ratio: 1.0
        else: decay = (progress - (1.0 - warmdown_ratio)) / warmdown_ratio
              return (1 - decay) * 1.0 + decay * final_lr_frac

    nanochat defaults: warmup_ratio=0.0 (no warmup), warmdown_ratio=0.5,
    final_lr_frac=0.0 (decay to zero).
    """
    raise NotImplementedError


def get_sft_muon_momentum(step: int) -> float:
    """
    SFT Muon momentum schedule (nanochat chat_sft.py exactly):

        frac = min(step / 300, 1)
        return (1 - frac) * 0.85 + frac * 0.95

    Warms up 0.85 → 0.95 over the first 300 steps, then constant.
    (Note: differs from pretrain — peaks at 0.95 not 0.97, and no warmdown.)
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

    Param groups (matching nanochat gpt.py setup_optimizer — lm_head is NOT Muon):
      - "muon" groups:  2-D transformer block matrices ONLY (Q/K/V/O projections,
                        FFN weights — i.e. model.transformer.h parameters).
                        Gradient is orthogonalized via newton_schulz() then used as
                        the effective gradient for an SGD-with-momentum step.
      - "adamw" groups: everything else — lm_head, wte, value_embeds, and the
                        per-layer scalars (resid/x0/smear/backout). Standard AdamW,
                        one group per LR/betas combination (see model.setup_optimizer).
                        Note: this architecture has NO learnable norm parameters.

    Groups are passed as a list of dicts, each tagged with "kind" ("muon"/"adamw")
    so train.py's schedule loop can target Muon groups:
        optimizer = MuonAdamW([
            {"params": matrix_params,  "kind": "muon",  "lr": matrix_lr, ...},
            {"params": lm_head_params, "kind": "adamw", "lr": unembedding_lr * dmodel_scale, ...},
            ...
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
