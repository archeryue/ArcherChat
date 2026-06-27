"""
archerchat/attention.py — attention kernel wrapper.

Implement sdpa_attention() and the SlideWindow mask helper.
model.py calls these; this file owns the masking math.

What to implement:
  - sdpa_attention(): wraps torch.nn.functional.scaled_dot_product_attention with
    the correct causal / sliding-window mask.  On Blackwell consumer (RTX 5060 Ti,
    SM 12.0) FlashAttention-3 is unavailable, so we use SDPA with an explicit mask.
  - make_sliding_window_mask(): builds the bool mask for one attention layer given
    the window size and sequence length.
  - Document-boundary mask support for SFT packing (used by sft.py).

Stage 3 note: when running on H100s, swap sdpa_attention() body to call
flash_attn_func() from the flash-attn package.  The model.py call site should not
change.

Acceptance gate (step 1): logit equivalence with nanochat.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


def make_sliding_window_mask(
    seq_len: int,
    window_size: int,
    device: torch.device,
) -> torch.Tensor:
    """
    Build a causal sliding-window attention mask.

    A token at position i can attend to positions j iff:
        j <= i  (causal)  AND  i - j < window_size  (within window)

    Returns a (seq_len, seq_len) bool tensor where True means "block this pair"
    (i.e., the additive mask convention used by SDPA: -inf for True positions).

    Args:
        seq_len:     sequence length
        window_size: how many past positions each token can see (including itself)
        device:      where to allocate the mask
    """
    raise NotImplementedError


def make_full_causal_mask(seq_len: int, device: torch.device) -> torch.Tensor:
    """
    Standard lower-triangular causal mask.

    Returns (seq_len, seq_len) bool tensor — True means blocked.
    Equivalent to make_sliding_window_mask(seq_len, seq_len, device).
    Kept separate so model.py can branch on layer type without recomputing.
    """
    raise NotImplementedError


def sdpa_attention(
    q: torch.Tensor,
    k: torch.Tensor,
    v: torch.Tensor,
    mask: torch.Tensor | None,
    dropout_p: float = 0.0,
) -> torch.Tensor:
    """
    Scaled dot-product attention via torch.nn.functional.scaled_dot_product_attention.

    This is the Blackwell-safe path (no FA3 dependency).

    Args:
        q:       (B, n_head,    T, head_dim)
        k:       (B, n_kv_head, T, head_dim)  — repeat_interleave for GQA happens here
                 OR already expanded to (B, n_head, T, head_dim)
        v:       (B, n_kv_head, T, head_dim)  — same as k
        mask:    (seq_len, seq_len) bool additive mask, or None for full causal via SDPA's
                 is_causal=True fast path.  True = blocked position (-inf in attention).
        dropout_p: only used during training

    Returns:
        (B, n_head, T, head_dim) — attended values

    Implementation note: if mask is None use is_causal=True (fastest path).
    If mask is provided, negate it (SDPA expects True = attend, False = mask) or pass
    an additive float mask of 0 / -inf.
    """
    raise NotImplementedError


def sdpa_attention_with_kvcache(
    q: torch.Tensor,
    k_cache: torch.Tensor,
    v_cache: torch.Tensor,
    k_new: torch.Tensor,
    v_new: torch.Tensor,
    cache_seqlens: torch.Tensor,
) -> torch.Tensor:
    """
    Single-token decode step using a KV cache.

    Called by engine.py during auto-regressive generation.

    Args:
        q:             (B, n_head,    1, head_dim)   — current query (one new token)
        k_cache:       (B, n_kv_head, T_max, head_dim) — mutable cache, updated in-place
        v_cache:       (B, n_kv_head, T_max, head_dim) — mutable cache, updated in-place
        k_new:         (B, n_kv_head, 1, head_dim)   — new key to append
        v_new:         (B, n_kv_head, 1, head_dim)   — new value to append
        cache_seqlens: (B,) int32 — number of valid tokens already in the cache per row

    Returns:
        (B, n_head, 1, head_dim)

    Implementation:
        1. Write k_new / v_new into k_cache / v_cache at position cache_seqlens[b] for each b.
        2. Compute attention of q against k_cache[:, :, :max_len, :] / v_cache, using a
           causal mask that allows each query to attend only to cache_seqlens[b] + 1 positions.
    """
    raise NotImplementedError
