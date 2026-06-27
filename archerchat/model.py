"""
archerchat/model.py — GPT language model.

Implement every method marked NotImplementedError.
train.py calls these interfaces exactly as written — don't change signatures.

Architecture to implement (verified against nanochat/gpt.py):
  - NO learnable RMSNorm — use F.rms_norm(x, (x.size(-1),)) directly, no weight/bias
  - RoPE positional encoding, base theta=100000, applied per attention block
  - QK-norm: norm(q) * 1.2, norm(k) * 1.2 after RoPE
  - Grouped-query attention (n_head query heads, n_kv_head key/value heads)
  - Sliding-window attention: per-layer (left, right) window derived from window_pattern
    via _compute_window_sizes(); last layer always full context
  - FFN: ReLU² activation (F.relu(x).square()), width = 4 × n_embd, NO bias
  - Untied wte / lm_head (no weight tying)
  - Value embeddings (ResFormer): alternating layers share a separate Embedding table;
    gated and added to V before attention
  - Smear gate: mixes prev token's embedding into current position (cheap bigram info)
  - Backout: subtract cached mid-layer residual before final norm
  - Per-layer scalars: resid_lambdas (init ≈ 1.05–1.15) and x0_lambdas (init ≈ 0.05–0.20)
  - Logit soft-cap: 15 * tanh(logits / 15), computed in fp32
  - Vocab padding to nearest multiple of 64 for tensor-core alignment

Reference: nanochat/gpt.py — copy the architecture exactly for oracle comparison.
Acceptance gate: max(abs(logits_archer − logits_nano)) < 1e-4 on fp32 with Stage 1 weights.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Iterator

import torch
import torch.nn as nn


@dataclass
class GPTConfig:
    """All architecture knobs for one GPT model.

    Defaults match a tiny d4 smoke-test model.
    train.py overrides every field from compute_scale().
    """
    vocab_size:     int  = 32768
    n_layer:        int  = 4
    n_head:         int  = 4
    n_kv_head:      int  = 1     # number of KV heads (GQA; must divide n_head)
    n_embd:         int  = 256
    sequence_len:   int  = 2048  # maximum / training context length
    window_pattern: str  = "SSSL"  # cycling pattern of 'S' (sliding) and 'L' (full) layers


class GPT(nn.Module):
    """
    Transformer language model.

    Used by train.py for both pretraining and SFT.
    Used by engine.py for KV-cache inference.
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
        """
        super().__init__()
        raise NotImplementedError

    # ── Weight init ───────────────────────────────────────────────────

    def init_weights(self) -> None:
        """
        Initialize all parameters in-place (nanochat convention exactly).

        Called once after `model.to_empty(device=device)`.

        wte:        N(0, 0.8)
        lm_head:    N(0, 0.001)
        per block:
          c_q, c_k, c_v:  Uniform(-s, s)  where s = sqrt(3) / sqrt(n_embd)
          c_proj:          zeros
          c_fc:            Uniform(-s*0.4, s*0.4)
          c_proj (MLP):    zeros
        resid_lambdas[i]:  1.15 - 0.10 * i / (n_layer - 1)
        x0_lambdas[i]:     0.20 - 0.15 * i / (n_layer - 1)
        smear_lambda:      zeros
        backout_lambda:    0.2
        smear_gate:        Uniform(0, 0.02)
        ve weights:        Uniform(-s, s)  (same s as c_v)
        ve_gate weights:   Uniform(0, 0.02)

        Embeddings (wte, value_embeds) are then cast to COMPUTE_DTYPE to save memory.
        (Exception: fp16 keeps them fp32 because GradScaler can't unscale fp16 grads.)
        """
        raise NotImplementedError

    # ── Introspection ─────────────────────────────────────────────────

    def get_device(self) -> torch.device:
        """Return the device this model lives on (single-GPU assumed)."""
        raise NotImplementedError

    def estimate_flops(self) -> float:
        """
        Estimated FLOPs per forward token (not per batch, not per step).

        Used by train.py to compute MFU:
            mfu = flops_per_token * tokens_per_sec / peak_flops

        Standard estimate for a transformer with sequence length T:
            FLOPs/token ≈ 6 * n_params
        (the '6' comes from multiply-accumulate counting; see PaLM paper §A).
        Use self.num_scaling_params()["transformer_matrices"] for n_params here,
        since embeddings/head don't contribute proportionally to training FLOPs.
        """
        raise NotImplementedError

    def num_scaling_params(self) -> dict:
        """
        Return a dict of parameter counts:

        {
          "total":                 int,  # all parameters
          "transformer_matrices":  int,  # only weight matrices counted by scaling laws
                                         # (excludes embedding table, lm_head, norms, biases)
        }

        train.py logs "total" and uses "transformer_matrices" for MFU / scaling math.
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
        Build and return the optimizer for this model (nanochat convention exactly).

        Param groups (all are AdamW except matrix params which use Muon):
          lm_head:          AdamW, lr = unembedding_lr * dmodel_scale, betas=(0.8, 0.96),  eps=1e-10, wd=0.01
          wte:              AdamW, lr = embedding_lr   * dmodel_scale, betas=(0.8, 0.995), eps=1e-10, wd=0.001
          value_embeds:     AdamW, lr = embedding_lr   * dmodel_scale * 0.5, betas=(0.8, 0.995), eps=1e-10, wd=0.01
          resid_lambdas:    AdamW, lr = scalar_lr * 0.01, betas=(0.8, 0.95),  eps=1e-10, wd=0.05
          x0_lambdas:       AdamW, lr = scalar_lr,        betas=(0.96, 0.95), eps=1e-10, wd=0.0
          smear / backout:  AdamW, lr = 0.2,              betas=(0.8, 0.95),  eps=1e-10, wd=0.0
          matrix params:    Muon,  lr = lr (= matrix_lr), momentum=0.95, ns_steps=5, beta2=0.9, wd=weight_decay
                            (grouped by shape for efficient stacking in newton_schulz)

        dmodel_scale = (n_embd / 768) ** -0.5  — scales AdamW LRs so 768-dim is the reference.

        lr here is the "matrix LR" anchor from compute_scale(depth).
        train.py stashes initial_lr and scales all groups uniformly via lr_scale = current_lr / max_lr.

        Use MuonAdamW (single-GPU) or DistMuonAdamW (DDP) from archerchat.optimizer.
        Check torch.distributed.is_initialized() to decide which to use.
        """
        raise NotImplementedError

    # ── Forward ───────────────────────────────────────────────────────

    def forward(
        self,
        idx: torch.Tensor,
        targets: torch.Tensor | None = None,
        kv_cache: list | None = None,
        loss_reduction: str = "mean",
    ) -> torch.Tensor | tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            idx:            (B, T) int64 — input token ids
            targets:        (B, T) int64 — target token ids, or None for inference
                            Positions where targets == -1 are excluded from the loss
                            (used by SFT to mask non-assistant tokens).
            kv_cache:       list of per-layer KV cache tensors, mutated in-place during
                            inference (see engine.py). Pass None during training.
            loss_reduction: "mean" | "none" — passed to F.cross_entropy.
                            train.py always uses "mean".
                            evaluate_bpb() uses "none" to compute per-token losses.

        Returns:
            If targets is None:   logits  (B, T, vocab_size)
            If targets provided:  loss    scalar (or (B*T,) if loss_reduction="none")
        """
        raise NotImplementedError

    # ── Inference ─────────────────────────────────────────────────────

    def generate(
        self,
        tokens: torch.Tensor,
        max_new_tokens: int,
        temperature: float = 1.0,
        top_k: int | None = None,
        seed: int = 42,
    ) -> Iterator[int]:
        """
        Auto-regressive generation without KV cache (simple fallback).

        Yields one token id at a time.
        engine.py provides a faster KV-cache version; this is the reference impl.

        Args:
            tokens:         (T,) int64 — prompt token ids (no batch dim)
            max_new_tokens: stop after generating this many tokens
            temperature:    divide logits by temperature before sampling
            top_k:          if set, restrict sampling to the top-k logits
            seed:           RNG seed for reproducibility
        """
        raise NotImplementedError
