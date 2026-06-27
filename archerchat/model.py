"""
archerchat/model.py — GPT language model.

Implement every method marked NotImplementedError.
train.py calls these interfaces exactly as written — don't change signatures.

Architecture to implement:
  - RMSNorm (no bias, learnable weight)
  - RoPE positional encoding (applied inside each attention block)
  - QK-norm (applied to Q and K before computing attention scores)
  - Grouped-query attention (n_head query heads, n_kv_head key/value heads)
  - Sliding-window attention via archerchat.attention (pattern driven by window_pattern)
  - SwiGLU feed-forward network (2/3 × 4 × n_embd hidden dim, no bias)
  - Untied token embeddings and unembedding (lm_head does NOT share weights with wte)
  - Muon-friendly weight init (std ≈ 1/sqrt(fan_in), zero biases, special output projections)

Reference: nanochat/gpt.py (same architecture).
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
        Initialize all parameters in-place.

        Called once after `model.to_empty(device=device)`.
        Muon works best with:
          - embedding table: N(0, 1) then normalize rows to unit norm
          - attention Q/K/V projections: N(0, 1/sqrt(n_embd))
          - attention output projection: N(0, 1/sqrt(n_embd * n_layer))
          - FFN gate/up projections: same as attention Q/K/V
          - FFN down projection: same depth scaling as attn output
          - lm_head: zero-init (or small)
          - all RMSNorm weights: 1.0
        Adjust if nanochat's exact init differs — acceptance test will catch it.
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

    def setup_optimizer(self, lr: float, weight_decay: float) -> torch.optim.Optimizer:
        """
        Build and return the optimizer for this model.

        Should create two param groups:
          1. Matrix params (Q/K/V/O projections, FFN gate/up/down, lm_head) → Muon,
             lr=lr, weight_decay=weight_decay
          2. Non-matrix params (embedding table, RMSNorm weights, biases if any) → AdamW,
             lr = lr * 0.1 (or the ratio nanochat uses), weight_decay=0.0

        lr is the "matrix LR" anchor derived from compute_scale(depth).
        train.py will scale each group's lr uniformly via:
            group["lr"] = group["initial_lr"] * lr_scale

        Import MuonAdamW from archerchat.optimizer.
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
