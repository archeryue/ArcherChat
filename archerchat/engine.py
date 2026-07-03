"""
archerchat/engine.py — KV-cache inference engine.

Implement everything marked NotImplementedError.
Called by scripts/chat_cli.py, scripts/chat_web.py, and eval.py (ChatCORE).

The interface mirrors nanochat/engine.py so the vendored chat scripts work
unchanged.  The two-phase structure is the whole point of this module:
  prefill — run the full prompt through the model once, batch=1, filling the
            KV cache; then replicate the cache across num_samples rows
  decode  — one token per row per step via attention.flash_attn_with_kvcache

Acceptance gate (TECH_PLAN step 8):
    Greedy decode 256 tokens from a fixed prompt with ArcherChat-d8 SFT weights;
    token sequence must match nanochat's engine exactly, at batch_size 1 AND 4.

Reference: nanochat/engine.py
"""

from __future__ import annotations

from typing import Generator

import torch


class KVCache:
    """
    Pre-allocated per-layer KV cache in flash-attn layout: (B, T, H, D).

    Storage: k_cache / v_cache tensors of shape (n_layers, B, T_max, n_kv_head, head_dim),
    plus cache_seqlens (B,) int32 — the number of valid positions per row, which
    attention.flash_attn_with_kvcache reads and the engine advances.

    Methods to implement (nanochat semantics):
        reset()                  — zero cache_seqlens (tensors can stay dirty)
        get_pos() -> int         — current position (all rows assumed in sync)
        get_layer_cache(i)       — (k_cache[i], v_cache[i]) views for layer i
        advance(n)               — cache_seqlens += n after appending n tokens
        prefill(other)           — copy a batch-1 cache's valid prefix into this
                                   (larger-batch) cache; used to fan out one
                                   prompt prefill across num_samples decode rows
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


def sample_next_token(
    logits: torch.Tensor,
    rng: torch.Generator,
    temperature: float = 1.0,
    top_k: int | None = None,
) -> torch.Tensor:
    """
    Sample one token id per row from (B, vocab_size) logits.

    temperature == 0.0 → greedy argmax (this is what the step-8 equivalence
    test exercises).  Otherwise divide logits by temperature, optionally
    restrict to top_k, softmax, and torch.multinomial with the passed rng.

    Returns: (B, 1) int64 token ids.
    """
    raise NotImplementedError


class Engine:
    """
    Batched KV-cache generation with per-row stop handling.

    Used by chat_cli.py / chat_web.py as:
        engine = Engine(model, tokenizer)
        for token_column, token_masks in engine.generate(tokens, **kwargs):
            ...

    Notes:
      - model is the UNCOMPILED GPT (decode shapes change every step;
        torch.compile would retrace constantly).
      - tokenizer is needed for the special tokens that terminate a row
        (<|assistant_end|>, BOS) and for the python-interpreter tool-use
        state machine (nanochat runs tool calls mid-generation; replicate
        only if/when tool use is in scope — not needed for step 8).
    """

    def __init__(self, model, tokenizer) -> None:
        self.model = model
        self.tokenizer = tokenizer

    @torch.inference_mode()
    def generate(
        self,
        tokens: list[int],
        num_samples: int = 1,
        max_tokens: int | None = None,
        temperature: float = 1.0,
        top_k: int | None = None,
        seed: int = 42,
    ) -> Generator[tuple[list[int], list[int]], None, None]:
        """
        Stream generated tokens, one "column" per decode step.

        Yields (token_column, token_masks) per step:
            token_column: list of num_samples token ids (one per row)
            token_masks:  list of num_samples ints — 1 if the row is still
                          actively sampling, 0 if it has finished (or the
                          token was forced, e.g. tool output injection)

        Implementation outline (nanochat engine.py):
            1. Prefill: batch-1 KVCache sized to len(tokens); one forward over
               the whole prompt; take last-position logits.
            2. Fan out: allocate a num_samples-row KVCache sized to
               len(tokens) + max_tokens (or model.config.sequence_len),
               prefill(...) from the batch-1 cache.
            3. Decode loop: sample_next_token per row (rows that already
               finished keep decoding but are masked out), append to the
               cache via model.forward(ids, kv_cache=...), stop when every
               row has emitted <|assistant_end|>/BOS or max_tokens reached.
        """
        raise NotImplementedError

    def generate_batch(
        self,
        tokens: list[int],
        num_samples: int = 1,
        **kwargs,
    ) -> tuple[list[list[int]], list[list[int]]]:
        """
        Non-streaming wrapper around generate(): collect the per-step columns
        and return (results, masks) as num_samples row-major token lists,
        prompt tokens excluded.
        """
        raise NotImplementedError
