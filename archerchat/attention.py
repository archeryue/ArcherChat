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
    raise NotImplementedError


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
        raise NotImplementedError

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
        raise NotImplementedError


# Singleton — model.py does: from archerchat.attention import flash_attn
flash_attn = FlashAttnCompat()
