"""
archerchat/engine.py — KV-cache inference engine.

Implement everything marked NotImplementedError.
Called by scripts/chat_cli.py, scripts/chat_web.py, scripts/chat_eval.py (ChatCORE),
and scripts/base_eval.py (--eval sample).

The interface mirrors nanochat/engine.py so the vendored chat scripts work unchanged.
The two-phase structure is the whole point of this module:
  prefill — run the full prompt through the model once, batch=1, filling the KV cache;
            then replicate the cache across num_samples rows
  decode  — one token per row per step via attention.flash_attn_with_kvcache

Acceptance gate (TECH_PLAN step 8):
    Greedy decode 256 tokens from a fixed prompt with ArcherChat-d8 SFT weights;
    token sequence must match nanochat's engine exactly, at batch_size 1 AND 4.

The KVCache class itself lives in archerchat/kv_cache.py (upstream keeps it in
engine.py; splitting it makes it a leaf that model.py can import without an import
cycle). It is still CONSTRUCTED here, twice, inside Engine.generate().

Reference: nanochat/engine.py
"""

from __future__ import annotations

from typing import Generator

import torch
import torch.nn.functional as F

from archerchat.kv_cache import KVCache


def sample_next_token(
    logits: torch.Tensor,
    rng: torch.Generator,
    temperature: float = 1.0,
    top_k: int | None = None,
) -> torch.Tensor:
    """
    Sample one token id per row from (B, vocab_size) logits.
    Returns: (B, 1) int64 token ids.

    assert temperature >= 0.0.
    temperature == 0.0 → greedy argmax. (This is what the step-8 equivalence gate uses,
    and it is the ONLY mode in which this function and model.generate() agree — see below.)

    Otherwise (nanochat engine.py:146-156) — the ORDER MATTERS:

        if top_k is not None and top_k > 0:
            k = min(top_k, logits.size(-1))
            vals, idx = torch.topk(logits, k, dim=-1)
            vals = vals / temperature                  # temperature AFTER topk
            probs = F.softmax(vals, dim=-1)            # softmax over k, NOT over V
            choice = torch.multinomial(probs, num_samples=1, generator=rng)
            return idx.gather(1, choice)               # gather back to vocab ids

    ⚠️ This is mathematically the same DISTRIBUTION as "-inf mask → softmax over V", but
    torch.multinomial consumes a DIFFERENT NUMBER OF RNG DRAWS over k categories than
    over V. With a fixed seed you therefore get different tokens. Any seeded-sampling
    equivalence test against a mask-based implementation WILL fail even though both are
    correct. (This is also why model.generate() — which masks-then-divides, the opposite
    order — only matches this at temperature=0.)
    """
    raise NotImplementedError


class Engine:
    """
    Batched KV-cache generation with per-row stop handling.

    Used by chat_cli.py / chat_web.py / chat_eval.py as:
        engine = Engine(model, tokenizer)
        for token_column, token_masks in engine.generate(tokens, **kwargs):
            ...

    Notes:
      - model is the UNCOMPILED GPT (decode shapes change every step; torch.compile
        would retrace constantly).
      - tokenizer supplies the terminal tokens (<|assistant_end|>, BOS) and, if you ever
        do tool use, the python-interpreter state machine. Tool use is NOT needed for the
        step-8 gate.
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
            token_masks:  list of num_samples ints

        ⚠️ token_masks does NOT mean "row still active". The old spec said that; it is
        wrong. nanochat engine.py:247-248:
                is_forced = len(state.forced_tokens) > 0
                token_masks.append(0 if is_forced else 1)
        It means exactly one thing: SAMPLED (1) vs FORCE-INJECTED by the tool loop (0).
        A finished row keeps decoding and keeps emitting mask=1. Completion has no
        effect on the mask whatsoever.

        SETUP (engine.py:200-221):
            kv_cache_prefill = KVCache(batch_size=1, seq_len=len(tokens), ...)   # exactly
                                                                                 # the prompt
            logits = model.forward(ids, kv_cache=kv_cache_prefill)
            logits = logits[:, -1, :].expand(num_samples, -1)   # (1,V) → (num_samples,V)
            ⚠️ Miss the .expand and you get a shape error on the first sample_next_token.
               All rows start from the SAME prefill logits; divergence is purely from RNG.

            kv_length_hint = (len(tokens) + max_tokens) if max_tokens is not None \
                             else model.config.sequence_len
            kv_cache_decode = KVCache(batch_size=num_samples, seq_len=kv_length_hint, ...)
            kv_cache_decode.prefill(kv_cache_prefill)
            del kv_cache_prefill

        DECODE LOOP (engine.py:230-280) — loop forever until num_generated >= max_tokens
        OR all rows completed. Order within one iteration:
            check stops → sample_next_token(logits, ...) → per-row forced/sampled
            selection + state update → YIELD → num_generated += 1
            → ids = torch.tensor(token_column).unsqueeze(1)          # (B, 1)
            → logits = model.forward(ids, kv_cache=kv_cache_decode)[:, -1, :]

        Two behaviors to replicate rather than "fix":
          - The LAST forward of the loop is WASTED — its logits are discarded when the
            loop breaks. Harmless, and it keeps the RNG stream aligned with the oracle.
          - COMPLETED ROWS KEEP DECODING and keep being fed back into the cache. They are
            NOT removed from the batch. This matters for reproducing the oracle at
            num_samples > 1 — which is exactly the step-8 gate (batch_size 4).

        Row completion (engine.py:254): next_token == assistant_end or next_token == bos.
        """
        raise NotImplementedError

    def generate_batch(
        self,
        tokens: list[int],
        num_samples: int = 1,
        **kwargs,
    ) -> tuple[list[list[int]], list[list[int]]]:
        """
        Non-streaming wrapper around generate(): collect the per-step columns into
        row-major token lists.

        ⚠️ THE PROMPT IS INCLUDED IN THE RESULT. The old spec said "prompt tokens
        excluded" — that is wrong, and scripts/chat_eval.py depends on the correct
        behavior (it slices `result[len(prompt):]` to recover the completion). If you
        exclude the prompt, every ChatCORE completion loses its first len(prompt) tokens
        and the scores are garbage.

        nanochat engine.py:290-291 seeds the accumulators WITH the prompt:
            results = [tokens.copy() for _ in range(num_samples)]
            masks   = [[0] * len(tokens) for _ in range(num_samples)]

        Terminal tokens (assistant_end, bos) are the only things NOT appended
        (engine.py:296-299).
        """
        raise NotImplementedError

