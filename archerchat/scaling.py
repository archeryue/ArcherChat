"""
archerchat/scaling.py — compute-optimal scaling derivation.

The single most important file to understand before training.
All numbers here come from nanochat's base_train.py (inline, no dedicated file there).
Re-derive everything from the papers cited below — don't copy constants blindly.

─────────────────────────────────────────────────────────────────────────────
WHAT THIS FILE DOES

Given a model depth, computes:
  1. Architecture  (n_embd, n_heads from depth × aspect_ratio, head_dim)
  2. Token budget  (how long to train for, from Chinchilla / nanochat ratio)
  3. Batch size    (compute-optimal B from Power Lines paper)
  4. Learning rate (base LRs + batch-size scaling)
  5. Weight decay  (scaled via T_epoch framework)

─────────────────────────────────────────────────────────────────────────────
THE MATH (read before implementing)

Step 1 — Architecture from depth
─────────────────────────────────
nanochat uses two knobs:
    aspect_ratio = 64          # model_dim = depth * aspect_ratio
    head_dim     = 128         # each attention head is this wide

    model_dim = round_up(depth * aspect_ratio, head_dim)
              = ceil(depth * 64 / 128) * 128

    n_heads   = model_dim // head_dim
    n_kv_heads = n_heads   # no GQA reduction in nanochat (full MHA)

Examples:
    depth=4  → model_dim=256,  n_heads=2
    depth=8  → model_dim=512,  n_heads=4
    depth=12 → model_dim=768,  n_heads=6
    depth=24 → model_dim=1536, n_heads=12


Step 2 — Which parameters count for scaling?
─────────────────────────────────────────────
nanochat uses   scaling_params = transformer_matrices + lm_head

NOT total params (excludes embeddings, value_embeds, scalars, smear/backout).
Reason: transformer matrices + lm_head give the cleanest scaling-law fits
(see nanochat dev/LOG.md Jan 27 2026).

To get scaling_params, build the model on meta device and call:
    counts = model.num_scaling_params()
    scaling_params = counts["transformer_matrices"] + counts["lm_head"]


Step 3 — Token budget (Chinchilla / nanochat ratio)
─────────────────────────────────────────────────────
nanochat's default: target_param_data_ratio = 12
(slightly undertrained relative to Chinchilla's 20:1, see speedrun.sh --target-param-data-ratio=8)

    n_tokens = target_ratio * scaling_params

The d12 reference horizon:
    D_REF = target_ratio * scaling_params(d12)

d12 is the reference depth at which all hyperparameters are tuned by hand.
All other depths extrapolate from d12 via the laws below.


Step 4 — Optimal batch size (Power Lines paper)
─────────────────────────────────────────────────
Ref: https://arxiv.org/abs/2505.13738  "Power Lines: Scaling Laws..."

B_opt ∝ D^0.383   where D = training token horizon

nanochat's reference at d12:
    B_REF = 2**19 = 524288 tokens   (empirically tuned)

For any other depth:
    B_raw = B_REF * (n_tokens / D_REF) ** 0.383
    B_opt = 2 ** round(log2(B_raw))  ← nearest power-of-2 for hardware efficiency


Step 5 — LR scaling with batch size (square-root rule)
────────────────────────────────────────────────────────
For AdamW and Muon, nanochat uses η ∝ √(B/B_REF):

    batch_lr_scale = sqrt(B_opt / B_REF)

Base LRs at B_REF (d12-tuned, before scaling):
    matrix_lr      = 0.02    → Muon param groups
    embedding_lr   = 0.30    → wte, value_embeds (AdamW)
    unembedding_lr = 0.008   → lm_head (AdamW)
    scalar_lr      = 0.5     → resid_lambdas, x0_lambdas, smear/backout (AdamW)

All four are multiplied by batch_lr_scale before being passed to setup_optimizer().


Step 6 — Weight decay scaling (T_epoch framework)
───────────────────────────────────────────────────
Ref: https://arxiv.org/abs/2405.13698  "T_epoch: ..."

Central idea: T_epoch = B / (η · λ · D) should stay constant across scales.
With η ∝ √(B/B_REF), keeping T_epoch constant requires:

    λ = λ_ref · √(B/B_REF) · (D_REF / D)

where D = n_tokens (training horizon) and λ_ref = 0.28 (d12-tuned base weight decay).

Note: these papers study AdamW, not Muon. nanochat applies the same formula to
Muon's weight decay as a reasonable assumption that hasn't been studied carefully.

Additionally, weight decay is further cosine-decayed to zero over training
(see get_weight_decay() in optimizer.py):
    wd(step) = weight_decay_scaled * 0.5 * (1 + cos(π * step / total_steps))


─────────────────────────────────────────────────────────────────────────────
ACCEPTANCE GATE (TECH_PLAN step 3)

For depth ∈ {4, 8, 12, 16, 20, 24}, every value must match nanochat exactly:
    python -c "
    from archerchat.scaling import compute_scale
    for d in [4, 8, 12, 16, 20, 24]:
        s = compute_scale(d)
        print(d, s)
    "
Compare against nanochat's base_train.py printed output for the same depths.
Any mismatch = re-derive from the formulas above, don't adjust to fit.
"""

from __future__ import annotations

import math


# ─────────────────────────────────────────────────────────────────────────────
# Architecture from depth
# ─────────────────────────────────────────────────────────────────────────────

ASPECT_RATIO = 64    # model_dim = depth * ASPECT_RATIO, then rounded to HEAD_DIM
HEAD_DIM     = 128   # each attention head dimension; also the rounding boundary

def get_model_config(depth: int) -> dict:
    """
    Derive architecture dimensions from depth alone.

    No model instantiation needed — pure arithmetic.

    Returns:
        n_layers:   int — same as depth
        n_embd:     int — model width = ceil(depth * 64 / 128) * 128
        n_heads:    int — query heads = n_embd // 128
        n_kv_heads: int — key/value heads = n_heads (full MHA, no GQA reduction)
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Reference constants (d12-tuned, empirically determined)
# ─────────────────────────────────────────────────────────────────────────────

B_REF              = 2 ** 19   # 524288 tokens — optimal batch size at d12
TARGET_RATIO       = 12        # token budget = TARGET_RATIO * scaling_params
BASE_WEIGHT_DECAY  = 0.28      # λ_ref (d12-tuned, before scaling)
BASE_MATRIX_LR     = 0.02      # matrix LR at B_REF (before batch-size scaling)
BASE_EMBEDDING_LR  = 0.30      # embedding LR at B_REF
BASE_UNEMBEDDING_LR = 0.008    # lm_head LR at B_REF
BASE_SCALAR_LR     = 0.5       # resid/x0/smear/backout LR at B_REF


def get_d12_reference_tokens() -> int:
    """
    Compute D_REF: the compute-optimal token horizon for d12.

    This requires building a d12 model on the meta device to count scaling params.
    Called once at training startup to anchor all other depth's batch/lr/wd scaling.

    Returns:
        int — D_REF = TARGET_RATIO * scaling_params(d12)
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Token budget
# ─────────────────────────────────────────────────────────────────────────────

def get_token_budget(scaling_params: int, target_ratio: float = TARGET_RATIO) -> int:
    """
    Compute the compute-optimal training token budget.

    Args:
        scaling_params: transformer_matrices + lm_head parameter count
                        (from model.num_scaling_params())
        target_ratio:   token:param ratio (default TARGET_RATIO=12)

    Returns:
        int — total tokens to train on
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Batch size (Power Lines paper)
# ─────────────────────────────────────────────────────────────────────────────

def get_optimal_batch_size(n_tokens: int, d_ref: int) -> int:
    """
    Compute the compute-optimal batch size (Power Lines, B ∝ D^0.383).

    Args:
        n_tokens: this model's training token budget (D)
        d_ref:    reference horizon D_REF = get_d12_reference_tokens()

    Returns:
        int — nearest power-of-2 to B_REF * (n_tokens / d_ref) ** 0.383

    Note: round to nearest power of 2 for hardware efficiency.
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# LR and weight decay scaling
# ─────────────────────────────────────────────────────────────────────────────

def get_batch_lr_scale(batch_size: int) -> float:
    """
    LR multiplier from batch size (square-root rule: η ∝ √(B/B_REF)).

    Args:
        batch_size: the computed optimal batch size for this depth

    Returns:
        float — multiply all base LRs by this factor
    """
    raise NotImplementedError


def get_scaled_weight_decay(batch_size: int, n_tokens: int, d_ref: int) -> float:
    """
    Scale the base weight decay via the T_epoch framework.

    Formula: λ = BASE_WEIGHT_DECAY * sqrt(B/B_REF) * (D_REF/D)

    Args:
        batch_size: optimal batch size for this depth
        n_tokens:   training token budget for this depth (D)
        d_ref:      reference token budget D_REF from get_d12_reference_tokens()

    Returns:
        float — weight decay to pass to setup_optimizer()
    """
    raise NotImplementedError


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def compute_scale(depth: int, target_ratio: float = TARGET_RATIO) -> dict:
    """
    Full compute-optimal configuration for the given model depth.

    Builds a d12 reference model on meta device once (to get D_REF),
    then derives all hyperparams analytically.

    Returns a dict consumed by train.py:
        n_layers          int
        n_heads           int
        n_kv_heads        int
        n_embd            int
        n_tokens          int   — training token budget
        batch_size        int   — total tokens per gradient step
        device_batch_size int   — sequences per GPU (= batch_size / world_size / T, at T=2048)
        lr                float — matrix LR (after batch scaling)
        embedding_lr      float
        unembedding_lr    float
        scalar_lr         float
        wd                float — initial weight decay (before cosine schedule)

    Implementation order:
        1. get_model_config(depth)       → arch
        2. Build GPT(arch_config) on meta device, count scaling_params
        3. get_d12_reference_tokens()    → d_ref
        4. get_token_budget(...)         → n_tokens
        5. get_optimal_batch_size(...)   → batch_size
        6. get_batch_lr_scale(...)       → lr_scale
        7. get_scaled_weight_decay(...)  → wd
        8. Derive device_batch_size = batch_size // (default_world_size * T)
           (single-GPU default: world_size=1, T=2048)
    """
    raise NotImplementedError
