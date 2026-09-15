"""
archerchat/attention.py — attention kernel wrapper.

model.py calls flash_attn.flash_attn_func() and flash_attn.flash_attn_with_kvcache()
from here.  This file owns the window_size → mask translation for the SDPA path.

nanochat interface (what model.py calls):
    flash_attn.flash_attn_func(q, k, v, causal=True, window_size=(left, right))
    flash_attn.flash_attn_with_kvcache(q, k_cache, v_cache, k=k, v=v,
                                        cache_seqlens=..., causal=True, window_size=...)

Tensor layout: nanochat uses (B, T, H, D) — NOT the PyTorch (B, H, T, D) default.
SDPA wants (B, H, T, D), so transpose before/after.

On RTX 5060 Ti (Blackwell SM 12.0) FA3 is unavailable.  Implement using SDPA.  The
call site in model.py must NOT change for Stage 3 — just swap the body to call the
real FA package.

Reference: nanochat/flash_attention.py (the SDPA fallback), nanochat/gpt.py:106-121.
Acceptance gate (step 1): logit equivalence with nanochat on fp32 forward pass.

═════════════════════════════════════════════════════════════════════════════
FOUR CORRECTIONS to what this file used to say. All verified against nanochat.

1. ⚠️ flash_attn_with_kvcache IS NOT DECODE-ONLY.  It used to be documented as
   q: (B, 1, ...) — a single new query.  nanochat calls it whenever kv_cache is not
   None, and that INCLUDES THE PREFILL forward, where T_new = len(prompt).  Write it
   for general T_new or the engine breaks on its very first call. This is the #1 fix
   in this file.

2. ⚠️ "FULL CONTEXT" IS NEVER (-1, 0) IN THIS MODEL.  gpt.py:296-311 maps
   "L" → (sequence_len, 0) = (2048, 0).  window_size[0] == -1 NEVER OCCURS.  So a
   `return None if window_size[0] == -1` fast path is DEAD CODE and every "L" layer
   would build a dense 2048×2048 mask.  The correct "is this effectively full?" test
   is nanochat's (flash_attention.py:79):
       if (window < 0 or window >= Tq) and Tq == Tk:  → plain is_causal=True SDPA

3. ⚠️ THE SHORT WINDOW IS 512, NOT 768.  gpt.py:300 is
       short_window = -(-long_window // 4 // 128) * 128
   whose inline comment says "(2048 -> 768)" — THE COMMENT IS WRONG.  Evaluate it:
       -((-2048 // 4) // 128) * 128 = -((-512) // 128) * 128 = -(-4) * 128 = 512
   It is ceil(seq_len / 4 / 128) * 128 — a QUARTER of context, which is what gpt.py:37
   says ("S=short (quarter context)").  base_train.py:54's CLI help ALSO lies
   ("S=half context").  Three inconsistent statements in the oracle; the code says 512.
   Check for yourself:  python -c "print(-(-2048 // 4 // 128) * 128)"

4. ⚠️ THERE IS NO DOCUMENT-BOUNDARY MASKING IN NANOCHAT.  I grepped the whole tree for
   cu_seqlens / varlen / doc_bound / document_mask / block_mask / flex_attention — zero
   hits.  Sequences are BOS-packed by the dataloader and attention runs STRAIGHT ACROSS
   document boundaries.  Do NOT implement doc-boundary masking "for correctness": it
   would diverge from the oracle and fail the logit gate.
═════════════════════════════════════════════════════════════════════════════
WINDOW SEMANTICS — the off-by-one that is invisible if you get it wrong.

    left = N  means  N tokens of lookback PLUS SELF = N+1 keys.

Two places in nanochat prove it (flash_attention.py:87-89 and :100):
    start = max(0, Tk - (window + 1))            # decode: keep window+1 keys
    mask = mask & ((row_idx - col_idx) <= window)  # inclusive <=

Get this off by one and the model trains fine with a silently different receptive field.

window_size is (left, right); right = 0 for causal.
═════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import os

import torch
import torch.nn.functional as F


def make_window_mask(
    seq_len_q: int,
    seq_len_k: int,
    window_size: tuple[int, int],
    device: torch.device,
) -> torch.Tensor | None:
    """
    Build a causal (+ optionally sliding-window) attention mask.

    Note the signature takes BOTH Tq and Tk: during decode/prefill-with-cache they
    differ (Tq = new tokens, Tk = everything in the cache), and the causal mask must be
    OFFSET accordingly. A single-seq_len version cannot express that.

    Returns None when the window is effectively full AND Tq == Tk — the caller then
    uses the faster is_causal=True SDPA path. "Effectively full" means
    `window < 0 or window >= Tq` (see correction #2 above), NOT `window == -1`.

    Otherwise returns a (Tq, Tk) BOOL mask (True = attend). nanochat uses bool, not an
    additive -inf float mask; SDPA accepts either and they agree numerically.

    The offset causal mask (nanochat flash_attention.py:93-102) — transcribe exactly:

        row_idx = (Tk - Tq) + torch.arange(Tq, device=device).unsqueeze(1)
        col_idx = torch.arange(Tk, device=device).unsqueeze(0)
        mask = col_idx <= row_idx
        if window >= 0 and window < Tk:
            mask = mask & ((row_idx - col_idx) <= window)     # inclusive — see above
        return mask

    Args:
        seq_len_q:   number of query positions (Tq)
        seq_len_k:   number of key positions   (Tk) — includes cached keys
        window_size: (left, right); left = max lookback
        device:      allocate here
    """
    Tq, Tk = seq_len_q, seq_len_k
    window = window_size[0]
    # Effectively full context AND same length → let the caller use is_causal=True.
    if (window < 0 or window >= Tq) and Tq == Tk:
        return None
    # Offset causal mask (nanochat flash_attention.py:93-102). The queries live at the
    # LAST Tq positions of a length-Tk sequence, so row i corresponds to absolute pos
    # (Tk - Tq) + i.
    row_idx = (Tk - Tq) + torch.arange(Tq, device=device).unsqueeze(1)
    col_idx = torch.arange(Tk, device=device).unsqueeze(0)
    mask = col_idx <= row_idx
    # Sliding window: keep only the `window` most-recent keys (inclusive of self).
    if window >= 0 and window < Tk:
        mask = mask & ((row_idx - col_idx) <= window)
    return mask


class FlashAttnCompat:
    """
    Drop-in shim exposing the flash_attn interface via SDPA (no FA3 needed).
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
        Training-time attention (no KV cache). Here Tq == Tk always.

        Args:
            q:           (B, T, n_head,    head_dim)
            k:           (B, T, n_kv_head, head_dim)
            v:           (B, T, n_kv_head, head_dim)
            causal:      always True during training
            window_size: (left, right) — for this model, (2048, 0) or (512, 0)

        Returns:
            (B, T, n_head, head_dim)

        Steps:
            1. Transpose to (B, H, T, D) for SDPA.
            2. GQA: nanochat passes `enable_gqa=(q.size(1) != k.size(1))` to SDPA
               (flash_attention.py:126) rather than repeat_interleave'ing k/v — the flag
               is free, repeat_interleave costs memory. Under full MHA it's a no-op
               either way, but prefer the flag.
            3. Fast path: if (window < 0 or window >= T) → SDPA(is_causal=True), no mask.
               Otherwise build the bool mask via make_window_mask(T, T, ...).
            4. F.scaled_dot_product_attention(q, k, v, attn_mask=mask, is_causal=...)
               — pass exactly one of attn_mask / is_causal, never both.
            5. Transpose back to (B, T, H, D).
        """
        # (B, T, H, D) -> (B, H, T, D) for SDPA
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)
        enable_gqa = q.size(1) != k.size(1)  # free GQA — no repeat_interleave
        Tq = q.size(2)
        mask = make_window_mask(Tq, k.size(2), window_size, q.device)
        if mask is None:
            y = F.scaled_dot_product_attention(q, k, v, is_causal=True, enable_gqa=enable_gqa)
        else:
            y = F.scaled_dot_product_attention(q, k, v, attn_mask=mask, enable_gqa=enable_gqa)
        return y.transpose(1, 2)  # back to (B, T, H, D)

    def flash_attn_with_kvcache(
        self,
        q: torch.Tensor,
        k: torch.Tensor,
        v: torch.Tensor,
        k_cache: torch.Tensor,
        v_cache: torch.Tensor,
        cache_seqlens: torch.Tensor,
        causal: bool = True,
        window_size: tuple[int, int] = (-1, 0),
    ) -> torch.Tensor:
        """
        Attention against a mutable KV cache. Called by model.forward() whenever
        kv_cache is not None — WHICH INCLUDES PREFILL, not just decode.

        Args:
            q:             (B, T_new, n_head,    head_dim)
                           ⚠️ T_new == len(prompt) on the prefill call, 1 during decode.
                           Do NOT assume 1.
            k:             (B, T_new, n_kv_head, head_dim) — new keys to write
            v:             (B, T_new, n_kv_head, head_dim) — new values to write
            k_cache:       (B, T_max, n_kv_head, head_dim) — mutated IN-PLACE
            v_cache:       (B, T_max, n_kv_head, head_dim) — mutated IN-PLACE
            cache_seqlens: (B,) int32 — valid entries per row BEFORE this step
            causal:        always True
            window_size:   (left, right)

        Returns:
            (B, T_new, n_head, head_dim)

        Implementation (nanochat flash_attention.py:156-177):
            B, T_new, H, D = q.shape
            pos = cache_seqlens[0].item()        # read UNIFORMLY from row 0 — nanochat
                                                 # assumes all rows are in lockstep, it
                                                 # does NOT index per-row
            k_cache[:, pos:pos+T_new] = k
            v_cache[:, pos:pos+T_new] = v
            k_full = k_cache[:, :pos+T_new]
            v_full = v_cache[:, :pos+T_new]
            → then attend q (Tq = T_new) against k_full/v_full (Tk = pos + T_new)
              using the OFFSET causal mask from make_window_mask(T_new, pos+T_new, ...).

        ⚠️ DO NOT ADVANCE THE CACHE HERE. cache_seqlens is bumped by the MODEL, once,
        after the last layer (gpt.py:120-121):
            if self.layer_idx == kv_cache.n_layers - 1:
                kv_cache.advance(T)
        If this shim also advances, the cache double-counts and every position is wrong.
        """
        B, T_new, H, D = q.shape
        pos = cache_seqlens[0].item()  # uniform position across the batch (lockstep rows)
        # Write the new k/v into the pre-allocated cache in-place (matches FA3 semantics).
        k_cache[:, pos:pos + T_new] = k
        v_cache[:, pos:pos + T_new] = v
        end_pos = pos + T_new
        k_full = k_cache[:, :end_pos]
        v_full = v_cache[:, :end_pos]
        # (B, T, H, D) -> (B, H, T, D) for SDPA
        q_sdpa = q.transpose(1, 2)
        k_sdpa = k_full.transpose(1, 2)
        v_sdpa = v_full.transpose(1, 2)
        enable_gqa = q_sdpa.size(1) != k_sdpa.size(1)
        mask = make_window_mask(T_new, end_pos, window_size, q.device)
        if mask is None:
            y = F.scaled_dot_product_attention(q_sdpa, k_sdpa, v_sdpa, is_causal=True, enable_gqa=enable_gqa)
        else:
            y = F.scaled_dot_product_attention(q_sdpa, k_sdpa, v_sdpa, attn_mask=mask, enable_gqa=enable_gqa)
        return y.transpose(1, 2)  # back to (B, T_new, H, D)


# Singleton — model.py does: from archerchat.attention import flash_attn
# ─────────────────────────────────────────────────────────────────────────────
# Backend selection: real FA3 when the hardware has it, SDPA otherwise
# ─────────────────────────────────────────────────────────────────────────────
#
# ⚠️ THE TWO APIs ARE NOT THE SAME SHAPE. The real FA3 (and nanochat's wrapper)
# take the cache FIRST and the new keys/values as KEYWORDS:
#
#     fa3.flash_attn_with_kvcache(q, k_cache, v_cache, k=k, v=v, cache_seqlens=...)
#
# ArcherChat's shim takes them positionally in the other order, and model.py calls it
# that way:
#
#     flash_attn.flash_attn_with_kvcache(q, k, v, k_cache, v_cache, cache_seqlens=...)
#
# The module docstring promises the model.py call site does NOT change for Stage 3, so the
# translation happens HERE. Swapping the backend without this adapter would silently pass
# the new keys as the cache — which does not raise, it just computes garbage.


def _load_fa3():
    """FA3 kernels are compiled for Hopper (sm90) ONLY.

    Ada (sm89) and Blackwell (sm100/sm120, including every RTX 50-series) must use SDPA.
    nanochat fetches the kernel from the HF hub rather than pip (flash_attention.py:24-40);
    we try that first so Stage 3 gets the same kernel the oracle would, then fall back to a
    pip-installed `flash_attn` if one is present.
    """
    if not torch.cuda.is_available():
        return None, "no cuda"
    major, minor = torch.cuda.get_device_capability()
    if major != 9:
        return None, f"sm{major}{minor} is not Hopper (FA3 is sm90-only)"
    try:
        import os
        os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
        from kernels import get_kernel
        return get_kernel("varunneal/flash-attention-3").flash_attn_interface, "fa3 (hf kernels)"
    except Exception as e:
        first = f"hf kernels unavailable ({type(e).__name__})"
    try:
        import flash_attn
        return flash_attn, "fa3 (pip flash_attn)"
    except Exception as e:
        return None, f"{first}; pip flash_attn unavailable ({type(e).__name__})"


class FlashAttn3:
    """Adapter onto the real FA3 kernels, preserving ArcherChat's call signature."""

    def __init__(self, fa3):
        self._fa3 = fa3

    def flash_attn_func(self, q, k, v, causal=True, window_size=(-1, 0)):
        return self._fa3.flash_attn_func(q, k, v, causal=causal, window_size=window_size)

    def flash_attn_with_kvcache(self, q, k, v, k_cache, v_cache, cache_seqlens,
                                causal=True, window_size=(-1, 0)):
        # NOTE the re-ordering: ours is (q, k, v, k_cache, v_cache); FA3's is
        # (q, k_cache, v_cache, k=, v=). See the warning above.
        return self._fa3.flash_attn_with_kvcache(
            q, k_cache, v_cache, k=k, v=v, cache_seqlens=cache_seqlens,
            causal=causal, window_size=window_size,
        )


# ARCHERCHAT_ATTN=sdpa forces the fallback (useful for A/B-ing the kernels against the
# SDPA path that scripts/oracle_window_check.py validated bit-identically vs nanochat).
_forced = os.environ.get("ARCHERCHAT_ATTN", "auto").lower()
if _forced == "sdpa":
    flash_attn, ATTN_BACKEND = FlashAttnCompat(), "sdpa (forced by ARCHERCHAT_ATTN)"
else:
    _fa3, _why = _load_fa3()
    if _fa3 is not None:
        flash_attn, ATTN_BACKEND = FlashAttn3(_fa3), _why
    else:
        flash_attn, ATTN_BACKEND = FlashAttnCompat(), f"sdpa ({_why})"
        if _forced == "fa3":
            raise RuntimeError(f"ARCHERCHAT_ATTN=fa3 requested but unavailable: {_why}")

# ⚠️ Sliding window on the SDPA path materialises a dense (Tq, Tk) bool mask per layer per
# batch. It is CORRECT — oracle_window_check.py proves it bit-identical to nanochat — but
# it is slow. On a non-Hopper box prefer --window-pattern L; at d24 on H100 the whole point
# of Stage 3's cost model is that FA3 handles SSSL natively. base_train.py prints
# ATTN_BACKEND at startup so this is never a guess.
