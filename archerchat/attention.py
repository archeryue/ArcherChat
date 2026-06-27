"""
archerchat/attention.py — attention kernel wrapper.

model.py calls flash_attn.flash_attn_func() and flash_attn.flash_attn_with_kvcache()
from here.  This file owns the window_size → mask translation for the SDPA path.

nanochat interface (what model.py calls):
    flash_attn.flash_attn_func(q, k, v, causal=True, window_size=(left, right))
    flash_attn.flash_attn_with_kvcache(q, k_cache, v_cache, k=k, v=v,
                                        cache_seqlens=..., causal=True, window_size=...)

window_size convention (same as FlashAttention-2/3):
    (left, right) where left = tokens before current position to attend to (-1 = unlimited)
                         right = 0 for causal.  Examples:
        full causal:         (-1, 0)
        sliding window of N: (N, 0)

Tensor layout: nanochat uses (B, T, H, D) — NOT the PyTorch (B, H, T, D) default.
SDPA wants (B, H, T, D), so transpose before/after.

On RTX 5060 Ti (Blackwell SM 12.0) FA3 is unavailable.  Implement using SDPA with
an explicit float mask from make_window_mask().  The call site in model.py must NOT
change for Stage 3 — just swap the body of flash_attn_func to call the real FA package.

Acceptance gate (step 1): logit equivalence with nanochat on fp32 forward pass.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


def make_window_mask(
    seq_len: int,
    window_size: tuple[int, int],
    device: torch.device,
    dtype: torch.dtype = torch.float32,
) -> torch.Tensor | None:
    """
    Build an additive attention mask from a (left, right) window_size tuple.

    Returns None when window_size[0] == -1 (full context) so the caller can
    use the faster is_causal=True SDPA path instead.

    For sliding windows returns (seq_len, seq_len) float tensor:
        0.0  → attend this pair
        -inf → mask this pair
    Causal constraint (j > i) is always applied.

    Args:
        seq_len:     sequence length T
        window_size: (left, right); left = max lookback tokens (-1 = unlimited)
        device:      allocate here
        dtype:       float32 recommended (SDPA accumulates in fp32 internally)
    """
    raise NotImplementedError


class FlashAttnCompat:
    """
    Drop-in shim that exposes the flash_attn interface via SDPA (no FA3 needed).
    model.py imports this and calls it identically to the real flash-attn package.
    """

    def flash_attn_func(
        self,
        q: torch.Tensor,
        k: torch.Tensor,
        v: torch.Tensor,
        causal: bool = True,
        window_size: tuple[int, int] = (-1, 0),
    ) -> torch.Tensor:
        """
        Training-time scaled dot-product attention (no KV cache).

        Args:
            q:           (B, T, n_head,    head_dim)
            k:           (B, T, n_kv_head, head_dim)
            v:           (B, T, n_kv_head, head_dim)
            causal:      always True during training
            window_size: (left, right) — see module docstring

        Returns:
            (B, T, n_head, head_dim)

        Implementation steps:
            1. Transpose to (B, H, T, D) for SDPA.
            2. GQA expand: repeat_interleave k, v from n_kv_head to n_head.
            3. Build additive mask via make_window_mask().
               If left == -1 (full context) skip the mask and pass is_causal=True.
            4. F.scaled_dot_product_attention(q, k, v, attn_mask=mask, is_causal=...).
            5. Transpose output back to (B, T, H, D).
        """
        raise NotImplementedError

    def flash_attn_with_kvcache(
        self,
        q: torch.Tensor,
        k_cache: torch.Tensor,
        v_cache: torch.Tensor,
        k: torch.Tensor,
        v: torch.Tensor,
        cache_seqlens: torch.Tensor,
        causal: bool = True,
        window_size: tuple[int, int] = (-1, 0),
    ) -> torch.Tensor:
        """
        Decode-time attention with a mutable KV cache (called by engine.py).

        Args:
            q:             (B, 1, n_head,    head_dim) — single new query
            k_cache:       (B, T_max, n_kv_head, head_dim) — mutated in-place
            v_cache:       (B, T_max, n_kv_head, head_dim) — mutated in-place
            k:             (B, 1, n_kv_head, head_dim) — new key to append
            v:             (B, 1, n_kv_head, head_dim) — new value to append
            cache_seqlens: (B,) int32 — valid entries per row before this step
            causal:        always True
            window_size:   (left, right) — sliding-window constraint on past tokens

        Returns:
            (B, 1, n_head, head_dim)

        Implementation:
            1. Write k / v into k_cache / v_cache at index cache_seqlens[b] for each b.
            2. Attend q against the valid cache prefix (length = cache_seqlens[b] + 1).
            3. Honour the sliding-window left bound if left != -1.
        """
        raise NotImplementedError


# Singleton — model.py does: from archerchat.attention import flash_attn
flash_attn = FlashAttnCompat()
