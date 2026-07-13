"""
archerchat/model.py — GPT language model.

Implement every method marked NotImplementedError.
scripts/base_train.py and scripts/chat_sft.py call these interfaces exactly as
written — don't change signatures.

Architecture (verified line-by-line against nanochat/gpt.py):
  - NO learnable RMSNorm — use F.rms_norm(x, (x.size(-1),)) directly, no weight/bias
  - RoPE, base theta=100000, HALF-SPLIT convention (not interleaved pairs — see below)
  - QK-norm: RoPE first, THEN norm(q)*1.2, norm(k)*1.2
  - Attention is FULL MHA. n_kv_head == n_head, always (see below).
  - Sliding-window attention: per-layer window from window_pattern; last layer full
  - FFN: ReLU² activation (F.relu(x).square()), width = 4 × n_embd, NO bias
  - Untied wte / lm_head (no weight tying)
  - Value embeddings (ResFormer): one INDEPENDENT table per VE layer, gated into V
  - Smear gate: mixes prev token's embedding into current position
  - Backout: subtract cached mid-layer residual before final norm
  - Per-layer scalars: resid_lambdas, x0_lambdas
  - Logit soft-cap: 15 * tanh(logits / 15), in fp32, AFTER cropping padded vocab
  - Vocab padded to a multiple of 64 — applies to wte, lm_head AND value_embeds

Reference: nanochat/gpt.py — copy the architecture exactly for oracle comparison.
Acceptance gate: max(abs(logits_archer − logits_nano)) < 1e-4 on fp32 with Stage 1 weights.

═════════════════════════════════════════════════════════════════════════════
GQA — RESOLVED. nanochat is ALWAYS FULL MHA.

base_train.py:138 sets `n_kv_head=num_heads`. Every trained nanochat model has
n_kv_head == n_head. The GQA code path exists (gpt.py:74 asserts n_kv_head <= n_head
and n_head % n_kv_head == 0) but is NEVER EXERCISED.

Keep the GQA-capable code — it's 3 lines and matches the oracle's tensor shapes — but
know that the reducing path is dead. n_kv_head only ever changes the width of the
value-embedding tables. scaling.get_model_config() is the authority:
    n_head = n_kv_head = ceil(depth * 64 / 128) * 128 / 128
    d4 → 2 heads / 256 dim    d8 → 4 / 512    d12 → 6 / 768    d24 → 12 / 1536
═════════════════════════════════════════════════════════════════════════════
THREE HARD BLOCKERS you will hit in the first hour if you don't read this:

1. THE CUSTOM `Linear` (below). nanochat has NO torch.autocast anywhere. Master
   weights stay fp32; activations are bf16 (because init_weights casts the embeddings
   to COMPUTE_DTYPE). The bridge is a Linear subclass that casts its weight to the
   input dtype in forward(). Without it you get an immediate dtype RuntimeError — and
   if you "fix" that by adding autocast, the optimizer starts seeing bf16 master weights.

2. init_weights() MUST RECOMPUTE THE RoPE BUFFERS. __init__ registers cos/sin as
   non-persistent buffers on the META device; after to_empty() they are uninitialized
   garbage. If you don't recompute them in init_weights(), the model trains on random
   positional encodings. It will still train. It will just be bad. (gpt.py:255-258)

3. RoPE IS HALF-SPLIT, NOT INTERLEAVED-PAIR. The interleaved convention
   (x[..., 0::2] / x[..., 1::2]) is more common, is self-consistent, trains fine, and
   will fail the 1e-4 logit gate with no other symptom. (gpt.py:57-63)
═════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Iterator

import torch
import torch.nn as nn
import torch.nn.functional as F

from archerchat.attention import flash_attn
from archerchat.kv_cache import KVCache

@dataclass
class GPTConfig:
    """All architecture knobs for one GPT model.

    Defaults are the d4 smoke-test model, and they MATCH scaling.get_model_config(4).
    (The previous defaults did not: they said n_head=4/n_kv_head=1, which is a GQA
    model the oracle never builds. A bare GPTConfig() must be a real d4.)
    scripts/base_train.py overrides every field from compute_scale().
    """
    vocab_size:     int  = 32768
    n_layer:        int  = 4
    n_head:         int  = 2     # d4: 256 / 128 = 2
    n_kv_head:      int  = 2     # == n_head. nanochat is always full MHA.
    n_embd:         int  = 256
    sequence_len:   int  = 2048  # maximum / training context length
    window_pattern: str  = "SSSL"  # cycling pattern of 'S' (sliding) and 'L' (full) layers


class Linear(nn.Linear):
    """
    nn.Linear that casts its weight to the INPUT's dtype inside forward().

    This is nanochat's replacement for torch.autocast (gpt.py:45-50), and EVERY linear
    in the model is this class: c_q, c_k, c_v, c_proj, c_fc, lm_head, smear_gate, ve_gate.

    Why: master weights must stay fp32 so the optimizer has precision, but matmuls
    should run in the activation dtype (bf16, which is what the embeddings were cast to
    in init_weights). This class is the only thing bridging the two.
    """
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.linear(x, self.weight.to(dtype=x.dtype))


def has_ve(layer_idx: int, n_layer: int) -> bool:
    """
    Which layers get a value-embedding table (nanochat gpt.py:53-55):
    """
    return layer_idx % 2 == (n_layer - 1) % 2


def apply_rotary_emb(x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
    """
    RoPE, half-split instead of traditional interleaved-pair.

    x is (B, T, H, head_dim); cos/sin are (1, T, 1, head_dim/2).

    Precompute (gpt.py:268-283), base = 100000:
        channel_range = torch.arange(0, head_dim, 2, dtype=torch.float32)
        inv_freq = 1.0 / (base ** (channel_range / head_dim))
        freqs = torch.outer(torch.arange(seq_len, dtype=torch.float32), inv_freq)
        cos, sin = freqs.cos().to(COMPUTE_DTYPE), freqs.sin().to(COMPUTE_DTYPE)
        cos, sin = cos[None, :, None, :], sin[None, :, None, :]

    The buffer is over-computed 10×: self.rotary_seq_len = config.sequence_len * 10
    (gpt.py:195), with an assert in forward.
    """
    d = x.shape[3] // 2
    x1, x2 = x[:, :, :, :d], x[:, :, :, d:]
    y1 = x1 * cos + x2 * sin
    y2 = x1 * (-sin) + x2 * cos
    return torch.cat([y1, y2], 3)

class CausalSelfAttention(nn.Module):
    def __init__(self, config: GPTConfig, layer_idx: int):
        super().__init__()
        self.layer_idx = layer_idx
        assert config.n_embd % config.n_head == 0
        assert config.n_kv_head <= config.n_head and config.n_head % config.n_kv_head == 0
        self.n_head = config.n_head
        self.n_kv_head = config.n_kv_head
        self.head_dim = config.n_embd // config.n_head
        self.c_q = Linear(config.n_embd, config.n_head * self.head_dim, bias=False)
        self.c_k = Linear(config.n_embd, config.n_kv_head * self.head_dim, bias=False)
        self.c_v = Linear(config.n_embd, config.n_kv_head * self.head_dim, bias=False)
        self.c_o = Linear(config.n_embd, config.n_embd, bias=False)
        self.ve_gate_channels = 12
        self.ve_gate = Linear(self.ve_gate_channels, self.n_kv_head, bias=False) if has_ve(layer_idx, config.n_layer) else None

    def forward(self, x: torch.Tensor, ve: torch.Tensor | None, cos_sin: tuple[torch.Tensor, torch.Tensor], window_size: int, kv_cache: KVCache | None) -> torch.Tensor:
        B, T, C = x.size()
        q = self.c_q(x).view(B, T, self.n_head, self.head_dim)
        k = self.c_k(x).view(B, T, self.n_kv_head, self.head_dim)
        v = self.c_v(x).view(B, T, self.n_kv_head, self.head_dim)
        # value embedding gate, black magic.
        if ve is not None:
            gate = 3 * torch.sigmoid(self.ve_gate(x[:, :, :self.ve_gate_channels]))
            v = v + gate.unsqueeze(-1) * ve.view(B, T, self.n_kv_head, self.head_dim)
        # apply RoPE
        cos, sin = cos_sin
        q, k = apply_rotary_emb(q, cos, sin), apply_rotary_emb(k, cos, sin)
        q, k = F.rms_norm(q, (q.size(-1),)) * 1.2, F.rms_norm(k, (k.size(-1),)) * 1.2
        # attention FA + SWA + GQA
        if kv_cache is None:
            y = flash_attn.flash_attn_func(q, k, v, causal=True, window_size=window_size)
        else:
            # KV-cache path — see kv_cache.py for the cache contract.
            k_cache, v_cache = kv_cache.get_layer_cache(self.layer_idx)
            y = flash_attn.flash_attn_with_kvcache(
                q, k, v, k_cache, v_cache, cache_seqlens = kv_cache.cache_seqlens, causal=True, window_size=window_size
            )
            if self.layer_idx == kv_cache.n_layers - 1:
                kv_cache.advance(T)
        # output projection
        y = y.contiguous().view(B, T, C)
        y = self.c_o(y)
        return y

class MLP(nn.Module):
    def __init__(self, config: GPTConfig):
        super().__init__()
        self.c_fc = Linear(config.n_embd, 4 * config.n_embd, bias=False)
        self.c_proj = Linear(4 * config.n_embd, config.n_embd, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.c_fc(x)
        x = F.relu(x).square()
        x = self.c_proj(x)
        return x

class Block(nn.Module):
    def __init__(self, config: GPTConfig, layer_idx: int):
        super().__init__()
        self.attn = CausalSelfAttention(config, layer_idx)
        self.ffn = MLP(config)
    
    def forward(self, x: torch.Tensor, ve: torch.Tensor | None, cos_sin: tuple[torch.Tensor, torch.Tensor], window_size: int, kv_cache: KVCache | None) -> torch.Tensor:
        x = x + self.attn(F.rms_norm(x, (x.size(-1),)), ve, cos_sin, window_size, kv_cache)
        x = x + self.ffn(F.rms_norm(x, (x.size(-1),)))
        return x

class GPT(nn.Module):
    """
    Transformer language model.

    Used by base_train.py / chat_sft.py for training, and by engine.py for KV-cache
    inference.
    """

    def __init__(self, config: GPTConfig) -> None:
        """
        Build all sub-modules from config.

        Must work on the meta device:
            with torch.device("meta"):
                model = GPT(config)
            model.to_empty(device=device)
            model.init_weights()

        So __init__ must not read or write any tensor data — only define shapes.

        Sub-modules (gpt.py:170-199):
            padded_vocab = round_up(vocab_size, 64)
            transformer.wte      : nn.Embedding(padded_vocab, n_embd)
            transformer.h[i]     : Block — pre-norm, no post-block norm:
                                     x = x + attn(norm(x), ve, cos_sin, window, kv_cache)
                                     x = x + mlp(norm(x))
            lm_head              : Linear(n_embd, padded_vocab, bias=False)
            value_embeds         : nn.ModuleDict — ONE INDEPENDENT nn.Embedding(padded_vocab,
                                   kv_dim) per layer i where has_ve(i, n_layer).
                                   ⚠️ They do NOT share a table. kv_dim = n_kv_head * head_dim.
            ve_gate (per VE layer): Linear(12, n_kv_head, bias=False)
            smear_gate           : Linear(24, 1, bias=False)
            smear_lambda         : nn.Parameter(torch.zeros(1))
            backout_lambda       : nn.Parameter — scalar
            resid_lambdas        : nn.Parameter (n_layer,)
            x0_lambdas           : nn.Parameter (n_layer,)
            cos, sin             : non-persistent buffers (recomputed in init_weights!)
        """
        super().__init__()
        self.config = config
        # init window sizes for each layer, cycling through the window pattern
        long_window = config.sequence_len
        short_window = -(-long_window // 4 // 128) * 128
        chart = {"S": (short_window, 0), "L": (long_window, 0)}
        self.window_sizes = []
        for layer_idx in range(config.n_layer):
            char = config.window_pattern[layer_idx % len(config.window_pattern)]
            self.window_sizes.append(chart[char])
        self.window_sizes[-1] = (long_window, 0)  # last layer always full
        # init sub-modules
        padded_vocab = (config.vocab_size + 63) // 64 * 64
        if padded_vocab != config.vocab_size:
            print(f"Padding vocab {config.vocab_size} → {padded_vocab}")
        self.transformer = nn.ModuleDict({
            "wte": nn.Embedding(padded_vocab, config.n_embd),
            "h": nn.ModuleList([Block(config, layer_idx) for layer_idx in range(config.n_layer)]),
        })
        #TODO: others

    # ── Weight init ───────────────────────────────────────────────────

    def init_weights(self) -> None:
        """
        Initialize all parameters in-place (nanochat gpt.py:218-266). Called once
        after `model.to_empty(device=device)`.

        s = 3**0.5 * n_embd**-0.5

        wte:              N(0, 0.8)          ← 0.8, not 1.0. nanochat's OWN docstring
                                               (gpt.py:206) says 1.0 and is STALE/WRONG;
                                               its code (gpt.py:218) says 0.8. Trust code.
        lm_head:          N(0, 0.001)
        per block:
          c_q, c_k, c_v:  U(-s, s)
          c_proj (attn):  zeros
          c_fc:           U(-0.4s, 0.4s)
          c_proj (MLP):   zeros
        resid_lambdas[i]: 1.15 - 0.10 * i / max(n_layer - 1, 1)   ← the max() guard
        x0_lambdas[i]:    0.20 - 0.15 * i / max(n_layer - 1, 1)      matters at n_layer=1
        smear_lambda:     zeros              ← so smear starts as an exact no-op
        backout_lambda:   0.2
        smear_gate:       U(0, 0.02)
        ve weights:       U(-s, s)
        ve_gate weights:  U(0, 0.02)

        THEN, two things the old spec omitted:

        (1) RECOMPUTE THE ROPE BUFFERS (gpt.py:255-258). Non-negotiable — see the
            module header. They are meta-device garbage until you do:
                head_dim = n_embd // n_head
                cos, sin = self._precompute_rotary_embeddings(self.rotary_seq_len, head_dim)
                self.cos, self.sin = cos, sin

        (2) CAST EMBEDDINGS to COMPUTE_DTYPE (gpt.py:263-266) — this is what makes the
            activations bf16 and thus what the custom Linear exists to accommodate:
                if COMPUTE_DTYPE != torch.float16:      # fp16 carve-out: GradScaler
                    wte and each value_embeds table → COMPUTE_DTYPE
            ⚠️ lm_head is NOT cast. It stays fp32.
        """
        raise NotImplementedError

    # ── Introspection ─────────────────────────────────────────────────

    def get_device(self) -> torch.device:
        """Return the device this model lives on (single-GPU assumed)."""
        raise NotImplementedError

    def estimate_flops(self) -> float:
        """
        Estimated FLOPs per forward token. Used by base_train.py for MFU:
            mfu = flops_per_token * tokens_per_sec / peak_flops

        ⚠️ The old spec said "6 * transformer_matrices". BOTH halves are wrong.
        nanochat (gpt.py:329-343):

            nparams = sum(p.numel() for p in self.parameters())
            nparams_exclude = wte + value_embeds + resid_lambdas + x0_lambdas \
                              + smear_gate + smear_lambda + backout_lambda
            # so the 6x term covers transformer_matrices + lm_head, NOT matrices alone

            h, q, t = n_head, n_embd // n_head, sequence_len
            attn_flops = 0
            for window_size in self.window_sizes:
                window = window_size[0]
                effective_seq = t if window < 0 else min(window, t)
                attn_flops += 12 * h * q * effective_seq

            return 6 * (nparams - nparams_exclude) + attn_flops

        There is an ADDITIVE ATTENTION TERM. Omit it and MFU is off by ~10-20%.
        """
        raise NotImplementedError

    def num_scaling_params(self) -> dict:
        """
        Return a dict of parameter counts (nanochat breakdown exactly):

        {
          "total":                int,  # all parameters
          "transformer_matrices": int,  # Q/K/V/O + FFN weight matrices (scaling-law params)
          "lm_head":              int,  # unembedding weight (also counted in scaling math)
          "wte":                  int,  # token embedding table
          "value_embeds":         int,  # per-layer value embedding matrices
          "scalars":              int,  # resid_lambdas, x0_lambdas, smear/backout
        }

        scaling.py uses:  scaling_params = transformer_matrices + lm_head
        base_train.py logs `total`.

        Oracle check (from the Stage 1 logs):
            d12 → transformer_matrices = 84,935,088 ; lm_head = 25,165,824
            d8  → transformer_matrices = 25,166,016 ; lm_head = 16,777,216
        tests/test_scaling.py already asserts the downstream math against these, so if
        your counts are right the whole scaling table falls out correct.
        """
        raise NotImplementedError

    # ── Optimizer ─────────────────────────────────────────────────────

    def setup_optimizer(
        self,
        lr: float,
        weight_decay: float = 0.0,
        unembedding_lr: float = 0.004,
        embedding_lr: float = 0.2,
        scalar_lr: float = 0.5,
    ) -> torch.optim.Optimizer:
        """
        Build and return the optimizer (nanochat gpt.py:385-413). VERIFIED CORRECT —
        every number below was checked against the oracle.

        dmodel_scale = (n_embd / 768) ** -0.5   ← applied HERE, not in scaling.py.
          scaling.compute_scale() deliberately returns PRE-width-scaling LRs. If you
          forget this factor, d8's AdamW LRs come out 1.2247× wrong.

        Param groups (all AdamW except the matrices, which are Muon):
          lm_head:        AdamW, lr = unembedding_lr * dmodel_scale, betas=(0.8, 0.96),  eps=1e-10, wd=0.01
          wte:            AdamW, lr = embedding_lr   * dmodel_scale, betas=(0.8, 0.995), eps=1e-10, wd=0.001
          value_embeds:   AdamW, lr = embedding_lr   * dmodel_scale * 0.5, betas=(0.8, 0.995), eps=1e-10, wd=0.01
          resid_lambdas:  AdamW, lr = scalar_lr * 0.01, betas=(0.8, 0.95),  eps=1e-10, wd=0.05
          x0_lambdas:     AdamW, lr = scalar_lr,        betas=(0.96, 0.95), eps=1e-10, wd=0.0
          smear group:    AdamW, lr = 0.2 FLAT, betas=(0.8, 0.95), eps=1e-10, wd=0.0
                          ⚠️ a literal 0.2 — NOT scaled by scalar_lr, NOT by dmodel_scale.
                          The group is THREE params together (gpt.py:385):
                              [smear_gate.weight, smear_lambda, backout_lambda]
          matrix params:  Muon, lr = lr (matrix_lr), momentum=0.95, ns_steps=5, beta2=0.9,
                          wd=weight_decay.
                          ONE GROUP PER DISTINCT SHAPE, built deterministically as
                              for shape in sorted({p.shape for p in matrix_params})
                          so each group stacks into one (K, m, n) tensor for the batched
                          orthogonalization. See optimizer.py — and note Muon applies its
                          OWN per-group LR correction max(1, fan_out/fan_in)**0.5 on top.

        Tag every group with "kind" ∈ {"muon","adamw"} — base_train.py's schedule loop
        dispatches on it. nanochat also sets group["initial_lr"] here (gpt.py:412-413);
        base_train.py sets it too, which is harmless duplication.

        Use MuonAdamW (single-GPU) or DistMuonAdamW (DDP) from archerchat.optimizer.
        Check torch.distributed.is_initialized() to decide which.
        """
        raise NotImplementedError

    # ── Forward ───────────────────────────────────────────────────────

    def forward(
        self,
        idx: torch.Tensor,
        targets: torch.Tensor | None = None,
        kv_cache: KVCache | None = None,
        loss_reduction: str = "mean",
    ) -> torch.Tensor | tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            idx:            (B, T) int64 — input token ids
            targets:        (B, T) int64 — target ids, or None for inference.
                            targets == -1 are excluded from the loss (SFT's mask).
            kv_cache:       KVCache or None. See kv_cache.py.
            loss_reduction: "mean" | "none". Training uses "mean"; evaluate_bpb() uses
                            "none" to get per-token losses, shape (B*T,).

        Returns:
            targets is None  →  logits (B, T, vocab_size)
            targets given    →  loss: scalar, or (B*T,) if loss_reduction="none"

        ═══════════════════════════════════════════════════════════════════════
        EXACT OP ORDER (nanochat gpt.py:416-481). Several of these are invisible if
        you get them wrong — the model just converges somewhere else.

        1.  T0 = 0 if kv_cache is None else kv_cache.get_pos()
            cos_sin = cos[:, T0:T0+T], sin[:, T0:T0+T]     ← RoPE is OFFSET by cache pos
        2.  x = wte(idx)  →  x = x.to(COMPUTE_DTYPE)  →  x = norm(x)   ← norm AFTER embed
        3.  SMEAR (gpt.py:432-449):
              gate = smear_lambda.to(x.dtype) * sigmoid(smear_gate(x[:, 1:, :24]))
              x = cat([x[:, :1], x[:, 1:] + gate * x[:, :-1]], dim=1)
            First 24 channels of the NORMED x. Position 0 untouched.
            KV-cache branch is DIFFERENT and must be implemented — see engine.py's
            KVCache.prev_embedding:
              x_pre_smear = kv_cache.prev_embedding
              kv_cache.prev_embedding = x[:, -1:, :]
              if T > 1:                        # prefill → same as training
                  ...
              elif x_pre_smear is not None:    # decode → single token
                  gate = smear_lambda.to(x.dtype) * sigmoid(smear_gate(x[:, :, :24]))
                  x = x + gate * x_pre_smear
        4.  x0 = x            ⚠️ CAPTURED AFTER SMEAR, not before (gpt.py:452)
        5.  backout_layer = n_layer // 2
        6.  for i, block in enumerate(h):
                x = resid_lambdas[i] * x + x0_lambdas[i] * x0     ← BEFORE the block
                ve = value_embeds[str(i)](idx).to(x.dtype) if has_ve(i) else None
                x = block(x, ve, cos_sin, window_sizes[i], kv_cache)
                if i == backout_layer: x_backout = x              ← AFTER the block
        7.  x = x - backout_lambda.to(x.dtype) * x_backout
        8.  x = norm(x)
        9.  logits = lm_head(x)
            logits = logits[..., :vocab_size]      ⚠️ CROP THE PADDED VOCAB — before loss
            logits = logits.float()
            logits = 15 * torch.tanh(logits / 15)  ← softcap, in fp32
        10. F.cross_entropy(logits.view(-1, V), targets.view(-1),
                            ignore_index=-1, reduction=loss_reduction)

        Inside the attention block, V gets the value-embedding gate (gpt.py:92-95):
            ve   = ve.view(B, T, n_kv_head, head_dim)
            gate = 3 * torch.sigmoid(ve_gate(x[..., :12]))   # (B,T,n_kv_head), range (0,3)
            v    = v + gate.unsqueeze(-1) * ve               # BEFORE RoPE/attention
        First 12 channels of the block-normed x; 3×sigmoid; ONE GATE PER KV HEAD.
        ═══════════════════════════════════════════════════════════════════════
        """
        raise NotImplementedError

    # ── Inference ─────────────────────────────────────────────────────

    def generate(
        self,
        tokens: list[int],
        max_tokens: int,
        temperature: float = 1.0,
        top_k: int | None = None,
        seed: int = 42,
    ) -> Iterator[int]:
        """
        Auto-regressive generation without KV cache (simple reference fallback).
        engine.py provides the fast KV-cache version.

        Args:
            tokens:      list[int] — prompt token ids. nanochat asserts isinstance(tokens, list),
                         NOT a tensor (gpt.py:484).
            max_tokens:  stop after generating this many (named max_tokens, not max_new_tokens)
            temperature: divide logits by temperature before sampling
            top_k:       if set, restrict sampling to the top-k logits
            seed:        RNG seed

        Yields Python ints, one at a time.

        ⚠️ nanochat applies TOP-K BEFORE dividing by temperature (gpt.py:501-506): it
        masks to -inf, then divides. Note this is the OPPOSITE order from
        engine.sample_next_token, which does topk → temperature → softmax over k.
        Those two produce the same DISTRIBUTION but consume different numbers of RNG
        draws, so they only agree token-for-token at temperature=0 (greedy) — which is
        exactly what nanochat's own self-test uses. Don't expect seeded equivalence.
        """
        raise NotImplementedError
