"""
archerchat/kv_cache.py — the KV cache object.

Implement everything marked NotImplementedError.

This is a LEAF module: it imports only torch, and never imports model/attention/engine.
Everything else imports it, so the dependency arrow always points here.

  engine.py     constructs KVCache (twice, in Engine.generate: prefill then decode)
  model.py      receives one and reads/writes it: get_pos, get_layer_cache, advance,
                cache_seqlens, n_layers, prev_embedding
  attention.py  never sees a KVCache — the shim takes raw k_cache/v_cache/cache_seqlens
                tensors, so it does NOT import this module.

Upstream nanochat defines this class inside nanochat/engine.py (engine.py:82-137).
It lives in its own file here; the class name, every field name, and the behavior are
IDENTICAL, so the oracle comparison is unaffected and the line-number citations below
still point into nanochat/engine.py.

Reference: nanochat/engine.py:82-137
Acceptance gate (TECH_PLAN step 8): this cache is what makes greedy decode match
nanochat token-for-token at batch_size 1 AND 4.

═════════════════════════════════════════════════════════════════════════════
⚠️  KVCache MUST HAVE `prev_embedding`.  It is the SMEAR STATE.

An earlier spec listed reset/get_pos/get_layer_cache/advance/prefill and omitted this.
model.forward()'s decode path reads AND writes kv_cache.prev_embedding every single
step (gpt.py:440-441 — see model.py's forward docstring, step 3).

    self.prev_embedding = None    # in __init__ AND in reset()

    def prefill(self, other):     # fan-out — nanochat engine.py:135-137
        ...
        if other.prev_embedding is not None:
            self.prev_embedding = other.prev_embedding.expand(self.batch_size, -1, -1).clone()

Note the .expand(...).clone(): the batch-1 embedding must be MATERIALIZED across
num_samples rows, not left as a broadcast view — the model writes into it next step.

Without prev_embedding: AttributeError at best. If you stub it to None, decode-time
smear silently vanishes and generation diverges from the oracle partway through.
═════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import torch


class KVCache:
    """
    Pre-allocated per-layer KV cache in flash-attn layout: (B, T, H, D).

    Storage (nanochat engine.py:93-104) — these EXACT names are read by model.py, so
    don't rename them:
        batch_size     = batch_size
        max_seq_len    = seq_len
        n_layers       = num_layers        # ← model.py:168 tests `layer_idx == n_layers - 1`
        n_heads        = num_heads
        head_dim       = head_dim
        k_cache        = torch.zeros(num_layers, batch_size, seq_len, num_heads, head_dim, ...)
        v_cache        = torch.zeros(num_layers, batch_size, seq_len, num_heads, head_dim, ...)
        cache_seqlens  = torch.zeros(batch_size, dtype=torch.int32, ...)   # int32 — FA3 requires it
        prev_embedding = None                                              # ← the smear state

    ⚠️ num_heads here is the model's n_kv_head, NOT n_head. The engine builds it as
    (nanochat engine.py:200-202):
        {"num_heads": model.config.n_kv_head,
         "head_dim":  model.config.n_embd // model.config.n_head,
         "num_layers": model.config.n_layer}

    dtype = torch.bfloat16 if device.type == "cuda" else torch.float32 (engine.py:186).

    Methods to implement:
        reset()             — zero cache_seqlens AND set prev_embedding = None
                              (tensors themselves can stay dirty)
        get_pos() -> int    — current position (all rows assumed in lockstep):
                              cache_seqlens[0].item()
        get_layer_cache(i)  — (k_cache[i], v_cache[i]) views for layer i
        advance(n)          — cache_seqlens += n. Called ONCE per forward, by the model,
                              after the LAST layer (gpt.py:120-121). The attention shim
                              must NOT advance — see attention.py.
        prefill(other)      — copy a batch-1 cache's valid prefix into this larger-batch
                              cache, and fan out prev_embedding (see module header).
                              Asserts (engine.py:128-130): target pos == 0; matching
                              n_layers / n_heads / head_dim; self.max_seq_len >= other's.
    """

    def __init__(
        self,
        batch_size: int,
        num_heads: int,
        seq_len: int,
        head_dim: int,
        num_layers: int,
        device: torch.device,
        dtype: torch.dtype,
    ) -> None:
        raise NotImplementedError

    def reset(self) -> None:
        raise NotImplementedError

    def get_pos(self) -> int:
        raise NotImplementedError

    def get_layer_cache(self, layer_idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        raise NotImplementedError

    def advance(self, num_tokens: int) -> None:
        raise NotImplementedError

    def prefill(self, other: KVCache) -> None:
        raise NotImplementedError
