"""
archerchat/optimizer.py — Muon optimizer (MuonAdamW, DistMuonAdamW) and LR/momentum/WD schedules.

Implement everything marked NotImplementedError.
model.py's setup_optimizer() imports MuonAdamW / DistMuonAdamW from here.
scripts/base_train.py imports get_lr_multiplier, get_muon_momentum, get_weight_decay.
scripts/chat_sft.py imports get_sft_lr_multiplier, get_sft_muon_momentum.

Compute-optimal scaling (compute_scale) lives in archerchat.scaling.

What to implement:
  - get_lr_multiplier():     trapezoidal LR schedule (warmup → constant → linear warmdown)
  - get_muon_momentum():     Muon momentum schedule (0.85→0.97 warmup, warmdown to 0.90)
  - get_weight_decay():      cosine WD decay to zero
  - get_sft_lr_multiplier(): SFT progress-based LR schedule
  - get_sft_muon_momentum(): SFT Muon momentum schedule (0.85→0.95 over 300 steps)
  - polar_express():         the orthogonalization at the core of Muon  ← NOT Newton–Schulz, read below
  - MuonAdamW:               single-GPU combined Muon + AdamW optimizer
  - DistMuonAdamW:           multi-GPU variant (shards grads, NOT momentum — read below)

Reference: nanochat/optim.py, nanochat/scripts/base_train.py, nanochat/scripts/chat_sft.py

═════════════════════════════════════════════════════════════════════════════
⚠️  READ THIS FIRST — the Muon in nanochat is NOT the Muon in the papers.

An earlier version of this file described textbook Muon (Newton–Schulz with fixed
cubic coefficients, momentum SGD, plain weight decay). That description was WRONG.
It was verified against nanochat/optim.py and every one of those claims is false.

If you implement textbook Muon, the model will train, the loss will go down, and it
will converge to a DIFFERENT PLACE than the Stage 1 oracle — with no error and no
symptom. These are the four things that make nanochat's Muon what it is:

  1. POLAR EXPRESS, not Newton–Schulz.  A quintic iteration with FIVE DIFFERENT
     coefficient triples (one per step), not a cubic with one fixed (a, b).
  2. NORMUON variance reduction.  A second-moment buffer (this is what beta2=0.9
     is for) rescales the orthogonalized update. Textbook Muon has no such thing.
  3. CAUTIOUS WEIGHT DECAY.  Decay is applied only where the update and the
     parameter agree in sign.
  4. A PER-GROUP LR SHAPE CORRECTION:  lr * max(1, fan_out/fan_in)**0.5.
     The FFN up-projection (4C, C) therefore trains at 2× the nominal matrix LR.
     ← This one is the nastiest silent bug in the whole project. Do not miss it.

Everything below is transcribed from nanochat/optim.py. Trust it over your memory
of the Muon paper.
═════════════════════════════════════════════════════════════════════════════
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
    Trapezoidal LR schedule (nanochat base_train.py:360-369 exactly):
        [0, warmup_steps)             : linear ramp  (step+1)/warmup_steps
        [warmup_steps, warmdown_start): constant 1.0
        [warmdown_start, total_steps] : linear ramp 1.0 → final_lr_frac

    where  warmdown_steps = round(warmdown_ratio * total_steps)   ← round(), not int()
           warmdown_start = total_steps - warmdown_steps

    Exact shape (the boundary is INCLUSIVE — `<=`, not `<`):
        if step < warmup_steps:                     return (step + 1) / warmup_steps
        elif step <= total_steps - warmdown_steps:  return 1.0
        else:
            progress = (total_steps - step) / warmdown_steps
            return progress * 1.0 + (1 - progress) * final_lr_frac

    NOTE: warmup uses (step+1)/warmup_steps so step=0 returns 1/warmup_steps, not 0.
    Do not clamp the warmup phase — the multiplier can be below final_lr_frac during
    the first few steps.

    Returns a multiplier in (0, 1.0].
    base_train.py applies it as:
        group["lr"] = group["initial_lr"] * get_lr_multiplier(step, ...)
    """
    raise NotImplementedError


def get_muon_momentum(step: int, total_steps: int, warmdown_ratio: float = 0.65) -> float:
    """
    Muon momentum schedule (nanochat base_train.py:375-381).

        [0, 400)                : linear warmup 0.85 → 0.97   (frac = step / 400)
        [400, warmdown_start)   : constant 0.97
        [warmdown_start, total] : linear warmdown 0.97 → 0.90

    Applied by base_train.py as: group["momentum"] = get_muon_momentum(step, total_steps)

    ⚠️ GOTCHA — reproduce this, do NOT "fix" it:
    nanochat checks the `step < 400` warmup branch FIRST. On a short run (total_steps
    < ~1150 — which includes ANY d4 smoke test) warmdown_start < 400, so the warmdown
    branch is UNREACHABLE and momentum only ever warms up. That is the oracle's real
    behavior. If you reorder the branches to "fix" it, d4 will not match.

    Also: frac = step / 400, NOT (step + 1) / 400. (Differs from get_lr_multiplier's
    warmup, which does use step+1. Yes, really.)
    """
    raise NotImplementedError


def get_weight_decay(step: int, total_steps: int, weight_decay_scaled: float) -> float:
    """
    Cosine weight decay schedule (nanochat convention):
        wd(step) = weight_decay_scaled * 0.5 * (1 + cos(π * step / total_steps))

    Decays from weight_decay_scaled to 0 over the course of training.
    Applied by base_train.py as: group["weight_decay"] = get_weight_decay(step, total_steps, wd)

    This ending-at-zero is WHY SFT trains with wd=0 (see chat_sft.py) — pretraining
    has already ramped it to zero, so SFT just continues from there.
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
    SFT LR schedule (nanochat chat_sft.py:314-322 exactly).

    Same trapezoidal shape as get_lr_multiplier(), but parameterized by
    progress ∈ [0, 1] instead of absolute step counts, because SFT is
    dataset-driven and doesn't always know total steps in advance:

        progress < warmup_ratio:          (progress + 1e-8) / warmup_ratio
        progress <= 1.0 - warmdown_ratio: 1.0
        else: decay = (progress - (1.0 - warmdown_ratio)) / warmdown_ratio
              return (1 - decay) * 1.0 + decay * final_lr_frac

    nanochat defaults: warmup_ratio=0.0 (no warmup), warmdown_ratio=0.5,
    final_lr_frac=0.0 (decay to zero).

    NOTE: SFT has NO weight-decay schedule at all — chat_sft.py sets weight_decay=0.0
    and its loop only ever writes `lr` and `momentum`. Don't add one.
    """
    raise NotImplementedError


def get_sft_muon_momentum(step: int) -> float:
    """
    SFT Muon momentum schedule (nanochat chat_sft.py:324-327 exactly):

        frac = min(step / 300, 1)
        return (1 - frac) * 0.85 + frac * 0.95

    Warms up 0.85 → 0.95 over the first 300 steps, then constant.
    (Differs from pretrain: peaks at 0.95 not 0.97, and has no warmdown.)
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Polar Express orthogonalization (the core of Muon)
#
# The Muon papers call this step "Newton–Schulz". nanochat does NOT use
# Newton–Schulz — it uses Polar Express (arXiv 2505.16932) coefficients, computed
# for num_iters=5, safety_factor=2e-2, cushion=2. The function is named for what
# it actually is.
# ─────────────────────────────────────────────────────────────────────────────

# nanochat/optim.py:81-89. Five DIFFERENT triples — one consumed per iteration.
# ns_steps SLICES this list (coeffs[:ns_steps]); it is not a loop count over fixed
# coefficients. These are NOT the classic Muon NS5 constants (3.4445, -4.7750, 2.0315).
POLAR_EXPRESS_COEFFS = [
    (8.156554524902461, -22.48329292557795, 15.878769915207462),
    (4.042929935166739, -2.808917465908714,  0.5000178451051316),
    (3.8916678022926607, -2.772484153217685, 0.5060648178503393),
    (3.285753657755655, -2.3681294933425376, 0.46449024233003106),
    (2.3465413258596377, -1.7097828382687081, 0.42323551169305323),
]


def polar_express(X: torch.Tensor, ns_steps: int = 5) -> torch.Tensor:
    """
    Approximate the orthogonal factor of X (the core of the Muon update).

    Args:
        X:        (K, m, n) — a STACK of K gradient matrices that all share the same
                  shape. Muon groups params by shape precisely so they can be
                  orthogonalized as one batched tensor. NOT a single 2-D matrix.
        ns_steps: how many coefficient triples to consume (nanochat: 5 = all of them)

    Returns:
        (K, m, n) approximately orthogonal stack.

    ─────────────────────────────────────────────────────────────────────────
    THE ALGORITHM (nanochat/optim.py:115-129) — transcribe it, don't derive it:

        X = g.bfloat16() if COMPUTE_DTYPE == torch.bfloat16 else g
        X = X / (X.norm(dim=(-2, -1), keepdim=True) * 1.01 + 1e-6)

        if g.size(-2) > g.size(-1):          # TALL
            for a, b, c in POLAR_EXPRESS_COEFFS[:ns_steps]:
                A = X.mT @ X
                B = b * A + c * (A @ A)
                X = a * X + X @ B
        else:                                # WIDE
            for a, b, c in POLAR_EXPRESS_COEFFS[:ns_steps]:
                A = X @ X.mT
                B = b * A + c * (A @ A)
                X = a * X + B @ X

    ─────────────────────────────────────────────────────────────────────────
    FOUR TRAPS, all of which produce a plausible-but-wrong orthogonalizer:

    1. It is a QUINTIC:  a*X + X @ (b*A + c*A²).  Not the cubic a*X + b*X@X.T@X.
    2. The coefficients CHANGE EVERY ITERATION. There is no fixed (a, b).
    3. NON-SQUARE: nanochat NEVER TRANSPOSES. It branches on size(-2) > size(-1)
       and changes which side B multiplies on. Transposing to force m ≥ n (the usual
       trick) gives a different answer.
    4. PRE-NORMALIZATION is  X / (‖X‖_F * 1.01 + 1e-6)  — Frobenius norm with a 1.01
       safety factor, not the usual  X / (‖X‖_F + 1e-7).

    `.mT` is a batched transpose (swaps the last two dims of the (K, m, n) stack).
    Runs in bf16 when COMPUTE_DTYPE is bfloat16 (explicit cast inside); fp16 is
    unstable here, so that case keeps the incoming dtype.

    Acceptance gate (step 2): fp32, fixed input → max abs diff < 1e-5 vs nanochat's.
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Single-GPU optimizer
# ─────────────────────────────────────────────────────────────────────────────

class MuonAdamW(torch.optim.Optimizer):
    """
    Combined Muon + AdamW optimizer for single-GPU training.

    Param groups (built by model.py's setup_optimizer — lm_head is NOT Muon):
      - kind="muon":  2-D transformer block matrices ONLY (c_q/c_k/c_v/c_proj,
                      mlp.c_fc/c_proj). Carries: lr, momentum, ns_steps, beta2,
                      weight_decay.  ONE GROUP PER DISTINCT SHAPE — nanochat builds
                      them as `for shape in sorted({p.shape for p in matrix_params})`
                      so each group can be stacked into a single (K, m, n) tensor
                      and orthogonalized in one batched call.
      - kind="adamw": everything else — lm_head, wte, value_embeds, and the per-layer
                      scalars (resid/x0/smear/backout). Carries: lr, betas, eps,
                      weight_decay.  This architecture has NO learnable norm params.

    step() dispatches on group["kind"]. base_train.py's schedule loop already relies
    on this tag (`if g.get("kind") == "muon"`).

    ═══════════════════════════════════════════════════════════════════════════
    THE MUON STEP HAS FOUR STAGES (nanochat/optim.py:110-148). Textbook Muon has one.

    Let `params`/`grads` be the stacked (K, m, n) tensors for one shape-group.

    (a) NESTEROV MOMENTUM — optim.py:110-113
            momentum_buffer.lerp_(grads, 1 - momentum)
            g = grads.lerp_(momentum_buffer, momentum)     # g = (1-m)·grad + m·buf
        (note: lerp_ is IN-PLACE on the grad stack)

    (b) POLAR EXPRESS — g = polar_express(g, ns_steps)     # see above

    (c) NORMUON VARIANCE REDUCTION — optim.py:131-142.  THIS IS WHAT beta2 IS FOR.
        The second-moment buffer is FACTORED, not full (optim.py:252-256):
            state_shape = (K, m, 1) if m >= n else (K, 1, n)
            red_dim     = -1        if m >= n else -2
        then:
            v_mean   = g.float().square().mean(dim=red_dim, keepdim=True)
            red_size = g.size(red_dim)
            v_norm   = (v_mean.sum(dim=(-2,-1), keepdim=True) * red_size).sqrt()
            second_momentum_buffer.lerp_(v_mean, 1 - beta2)
            step_size = second_momentum_buffer.clamp_min(1e-10).rsqrt()
            scaled    = (v_mean * red_size) * step_size.float().square()
            v_norm_new = scaled.sum(dim=(-2,-1), keepdim=True).sqrt()
            g = g * (step_size * (v_norm / v_norm_new.clamp_min(1e-10))).to(g.dtype)

    (d) CAUTIOUS WEIGHT DECAY — optim.py:144-148.  Decay ONLY where the update and
        the parameter agree in sign:
            mask = (g * params) >= 0
            params.sub_(lr * g + lr * wd * params * mask)
        A plain `p -= lr*(g + wd*p)` is WRONG.

    ═══════════════════════════════════════════════════════════════════════════
    ⚠️  THE PER-GROUP LR SHAPE CORRECTION (nanochat/optim.py:265) — MOST IMPORTANT.

        effective_lr = group["lr"] * max(1.0, shape[-2] / shape[-1]) ** 0.5

    Concretely, with C = n_embd:
        mlp.c_fc   (4C, C)  →  max(1, 4)**0.5 = 2.0×   ← FFN up-proj trains at DOUBLE
        mlp.c_proj (C, 4C)  →  1.0×
        attn.c_*   (C, C)   →  1.0×

    Miss this and the model trains fine, converges, and lands somewhere else.
    There is no error message. This is the single nastiest silent bug in the project.
    ═══════════════════════════════════════════════════════════════════════════

    THE ADAMW INNER STEP (nanochat/optim.py:40-50) — three traps:
        p.mul_(1 - lr * wd)                       # decoupled WD, LR-scaled, applied FIRST
        exp_avg.lerp_(grad, 1 - beta1)
        exp_avg_sq.lerp_(grad.square(), 1 - beta2)
        bias1 = 1 - beta1 ** step                 # step is 1-INDEXED
        bias2 = 1 - beta2 ** step
        denom = (exp_avg_sq / bias2).sqrt() + eps # eps is OUTSIDE the sqrt
        p.add_(exp_avg / denom, alpha=-(lr / bias1))
    With eps=1e-10, putting eps inside the sqrt materially changes the update.

    Acceptance gate (step 2):
        Fixed 1024×1024 matrix, fixed gradient → 5 Muon steps → max abs diff < 1e-5
        vs nanochat's MuonAdamW.
    """

    def __init__(self, param_groups: list[dict]) -> None:
        """
        nanochat/optim.py:180-181 is literally:

            def __init__(self, param_groups: list[dict]):
                super().__init__(param_groups, defaults={})

        `defaults={}` — there are NO optimizer-level defaults. Every group carries all
        of its own keys, and they differ by kind: muon groups have momentum/ns_steps/
        beta2 and never betas/eps; adamw groups have betas/eps and never momentum.

        There is NO `nesterov` flag — Nesterov momentum is unconditional.
        """
        raise NotImplementedError

    @torch.no_grad()
    def step(self) -> None:
        """Dispatch per group on group["kind"] ∈ {"muon", "adamw"}. Takes no closure."""
        raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Multi-GPU optimizer
# ─────────────────────────────────────────────────────────────────────────────

class DistMuonAdamW(torch.optim.Optimizer):
    """
    Distributed Muon + AdamW for torchrun training.

    Only instantiated when world_size > 1 (model.py checks dist.is_initialized()).

    ⚠️ An earlier version of this docstring said each rank all-reduces the MOMENTUM
    BUFFER before the orthogonalization step. That is WRONG. nanochat never
    communicates momentum buffers at all.

    WHAT NANOCHAT ACTUALLY DOES — ZeRO-2 style, all comms INSIDE the optimizer:

      Muon groups (optim.py:398-408, 476-498):
        1. Stack this shape-group's grads → (K, m, n), zero-pad to chunk_size*world.
        2. dist.reduce_scatter_tensor(grad_chunk, stacked_grads, op=ReduceOp.AVG)
           → each rank now holds the averaged grads for ONLY its own chunk.
        3. Each rank runs the full 4-stage Muon step on its chunk alone.
        4. dist.all_gather_into_tensor(...) the UPDATED PARAMS back to everyone.
        Momentum and second-moment buffers are allocated at chunk_size (optim.py:467-470)
        — they are SHARDED PER RANK and never reduced. Each rank only ever sees its own.

      AdamW groups (optim.py:376-386, 410-449) — also sharded:
        if p.numel() < 1024:  all_reduce the grad, every rank does the full update.
        else:                 reduce_scatter the grad; each rank updates only the slice
                              p[rank*rs : (rank+1)*rs]; then all_gather p back.
                              (Requires p.shape[0] % world_size == 0.)

      The whole thing is 3-phase and async: launch all the reduce_scatters →
      wait/compute/launch the all_gathers → wait on the gathers.

    ⚠️ CRITICAL: nanochat does NOT wrap the model in torch.nn.parallel.DistributedDataParallel.
    ALL gradient reduction happens here, inside the optimizer. If you wrap the model in
    DDP *and* implement this, every gradient gets averaged TWICE and your effective LR
    is silently halved. scripts/base_train.py deliberately does not use DDP — keep it
    that way.
    """

    def __init__(self, param_groups: list[dict], rank: int = 0, world_size: int = 1) -> None:
        raise NotImplementedError

    @torch.no_grad()
    def step(self) -> None:
        raise NotImplementedError
