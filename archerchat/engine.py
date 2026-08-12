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

import signal
import warnings
from collections import deque
from contextlib import contextmanager
from typing import Generator

import torch
import torch.nn.functional as F

from archerchat.kv_cache import KVCache


# ─────────────────────────────────────────────────────────────────────────────
# Calculator tool helpers (nanochat engine.py:25-79) — used by the tool state
# machine when the model emits a <|python_start|>…<|python_end|> block.
# ─────────────────────────────────────────────────────────────────────────────
@contextmanager
def timeout(duration, formula):
    def timeout_handler(signum, frame):
        raise Exception(f"'{formula}': timed out after {duration} seconds")

    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(duration)
    yield
    signal.alarm(0)


def eval_with_timeout(formula, max_time=3):
    try:
        with timeout(max_time, formula):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", SyntaxWarning)
                return eval(formula, {"__builtins__": {}}, {})
    except Exception:
        signal.alarm(0)
        return None


def use_calculator(expr):
    """Safely evaluate a simple math expression or a `.count()` string op."""
    expr = expr.replace(",", "")
    if all(x in "0123456789*+-/.() " for x in expr):
        if "**" in expr:  # disallow power operator
            return None
        return eval_with_timeout(expr)
    allowed_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'\"()._ "
    if not all(x in allowed_chars for x in expr):
        return None
    dangerous_patterns = ["__", "import", "exec", "eval", "compile", "open", "file",
                          "input", "raw_input", "globals", "locals", "vars", "dir",
                          "getattr", "setattr", "delattr", "hasattr"]
    expr_lower = expr.lower()
    if any(pattern in expr_lower for pattern in dangerous_patterns):
        return None
    if ".count(" not in expr:
        return None
    return eval_with_timeout(expr)


class RowState:
    """Per-row state during batched generation (nanochat engine.py:160-167)."""

    def __init__(self, current_tokens=None):
        self.current_tokens = current_tokens or []  # token sequence for this row
        self.forced_tokens = deque()                # queue of tokens to force-inject
        self.in_python_block = False                # inside a <|python_*|> block?
        self.python_expr_tokens = []                # tokens of the current python expr
        self.completed = False                      # has this row hit a terminal token?


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
    assert temperature >= 0.0, "temperature must be non-negative"
    if temperature == 0.0:
        return torch.argmax(logits, dim=-1, keepdim=True)
    if top_k is not None and top_k > 0:
        k = min(top_k, logits.size(-1))
        vals, idx = torch.topk(logits, k, dim=-1)
        vals = vals / temperature                       # temperature AFTER topk
        probs = F.softmax(vals, dim=-1)                 # softmax over k, NOT over V
        choice = torch.multinomial(probs, num_samples=1, generator=rng)
        return idx.gather(1, choice)                     # gather back to vocab ids
    logits = logits / temperature
    probs = F.softmax(logits, dim=-1)
    return torch.multinomial(probs, num_samples=1, generator=rng)


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
        assert isinstance(tokens, list) and isinstance(tokens[0], int), "expecting list of ints"
        device = self.model.get_device()
        # Repo-wide convention: cuda → bf16, everything else → fp32 (KVCache pre-allocates).
        dtype = torch.bfloat16 if device.type == "cuda" else torch.float32
        rng = torch.Generator(device=device)
        rng.manual_seed(seed)

        # Special tokens for the tool-use state machine and row termination.
        get_special = lambda s: self.tokenizer.encode_special(s)
        python_start = get_special("<|python_start|>")
        python_end = get_special("<|python_end|>")
        output_start = get_special("<|output_start|>")
        output_end = get_special("<|output_end|>")
        assistant_end = get_special("<|assistant_end|>")
        bos = self.tokenizer.get_bos_token_id()

        # 1) Batch-1 prefill of the prompt.
        m = self.model.config
        kv_model_kwargs = {"num_heads": m.n_kv_head, "head_dim": m.n_embd // m.n_head, "num_layers": m.n_layer}
        kv_cache_prefill = KVCache(batch_size=1, seq_len=len(tokens), device=device, dtype=dtype, **kv_model_kwargs)
        ids = torch.tensor([tokens], dtype=torch.long, device=device)
        logits = self.model.forward(ids, kv_cache=kv_cache_prefill)
        logits = logits[:, -1, :].expand(num_samples, -1)  # (1,V) → (num_samples,V)

        # 2) Fan the prefill cache out across num_samples rows.
        kv_length_hint = (len(tokens) + max_tokens) if max_tokens is not None else self.model.config.sequence_len
        kv_cache_decode = KVCache(batch_size=num_samples, seq_len=kv_length_hint, device=device, dtype=dtype, **kv_model_kwargs)
        kv_cache_decode.prefill(kv_cache_prefill)
        del kv_cache_prefill

        # 3) Per-row state.
        row_states = [RowState(tokens.copy()) for _ in range(num_samples)]

        # 4) Decode loop.
        num_generated = 0
        while True:
            if max_tokens is not None and num_generated >= max_tokens:
                break
            if all(state.completed for state in row_states):
                break

            next_ids = sample_next_token(logits, rng, temperature, top_k)  # (B, 1)
            sampled_tokens = next_ids[:, 0].tolist()

            token_column = []  # next token id along each row
            token_masks = []   # 1 if sampled, 0 if force-injected
            for i, state in enumerate(row_states):
                is_forced = len(state.forced_tokens) > 0
                token_masks.append(0 if is_forced else 1)
                next_token = state.forced_tokens.popleft() if is_forced else sampled_tokens[i]
                token_column.append(next_token)
                state.current_tokens.append(next_token)
                if next_token == assistant_end or next_token == bos:
                    state.completed = True
                # Tool state machine.
                if next_token == python_start:
                    state.in_python_block = True
                    state.python_expr_tokens = []
                elif next_token == python_end and state.in_python_block:
                    state.in_python_block = False
                    if state.python_expr_tokens:
                        expr = self.tokenizer.decode(state.python_expr_tokens)
                        result = use_calculator(expr)
                        if result is not None:
                            result_tokens = self.tokenizer.encode(str(result))
                            state.forced_tokens.append(output_start)
                            state.forced_tokens.extend(result_tokens)
                            state.forced_tokens.append(output_end)
                    state.python_expr_tokens = []
                elif state.in_python_block:
                    state.python_expr_tokens.append(next_token)

            yield token_column, token_masks
            num_generated += 1

            # Feed the chosen column back in for the next step (last forward is wasted
            # when the loop breaks — harmless, and keeps the RNG stream aligned).
            ids = torch.tensor(token_column, dtype=torch.long, device=device).unsqueeze(1)
            logits = self.model.forward(ids, kv_cache=kv_cache_decode)[:, -1, :]

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
        assistant_end = self.tokenizer.encode_special("<|assistant_end|>")
        bos = self.tokenizer.get_bos_token_id()
        results = [tokens.copy() for _ in range(num_samples)]      # prompt IS included
        masks = [[0] * len(tokens) for _ in range(num_samples)]
        completed = [False] * num_samples
        for token_column, token_masks in self.generate(tokens, num_samples, **kwargs):
            for i, (token, mask) in enumerate(zip(token_column, token_masks)):
                if not completed[i]:
                    if token == assistant_end or token == bos:
                        completed[i] = True
                    else:
                        results[i].append(token)
                        masks[i].append(mask)
            if all(completed):
                break
        return results, masks

