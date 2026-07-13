"""
archerchat/loss.py — loss computation and bits-per-byte evaluation.

Implement everything marked NotImplementedError.
train.py calls evaluate_bpb(); model.py optionally calls chunked_cross_entropy()
inside its forward() to avoid materializing the full (B*T, vocab_size) logit tensor.

What to implement:
  - chunked_cross_entropy(): memory-efficient CE loss by chunking the time dimension
  - evaluate_bpb(): run val_loader for N steps, compute average bits-per-byte

Bits-per-byte is the tokenization-independent loss metric used for all comparisons
with Stage 1 oracles.  Formula:
    bpb = avg_cross_entropy_nats * log2(e) / avg_bytes_per_token

where avg_bytes_per_token comes from token_bytes (see dataloader.get_token_bytes()).
"""

from __future__ import annotations

import math
from typing import Iterator

import torch
import torch.distributed as dist
import torch.nn.functional as F


def chunked_cross_entropy(
    logits: torch.Tensor,
    targets: torch.Tensor,
    chunk_size: int = 1024,
    ignore_index: int = -1,
) -> torch.Tensor:
    """
    Cross-entropy loss computed in chunks to avoid peak memory on large vocab.

    Args:
        logits:       (B, T, vocab_size) or (B*T, vocab_size) float
        targets:      (B, T) or (B*T,) int64
                      Positions where targets == ignore_index are excluded from loss.
        chunk_size:   process this many time steps at once (lower = less memory)
        ignore_index: token id to ignore (default -1 matches SFT masking convention)

    Returns:
        scalar loss (mean over non-ignored positions)

    Memory trick: reshape to (B*T, vocab_size), iterate over chunks of chunk_size rows,
    accumulate loss and count, divide at the end.  Never materialise softmax probabilities
    over the full sequence × vocab grid at once.

    model.py can call this inside forward() instead of F.cross_entropy to stay under
    the 16 GiB VRAM budget at larger sequence lengths.
    """
    logits = logits.view(-1, logits.size(-1))
    targets = targets.view(-1)
    assert logits.size(0) == targets.size(0)

    total_loss = logits.new_zeros(())
    total_count = logits.new_zeros(())
    for i in range(0, targets.size(0), chunk_size):
        logits_chunk = logits[i:i + chunk_size]
        targets_chunk = targets[i:i + chunk_size]
        # 'sum' (not 'mean') so chunks of unequal valid-token counts can be added up
        # and normalised once at the end — makes chunking exact, not approximate.
        total_loss = total_loss + F.cross_entropy(
            logits_chunk, targets_chunk, ignore_index=ignore_index, reduction="sum",
        )
        total_count = total_count + (targets_chunk != ignore_index).sum()

    # count == 0 (everything masked) yields nan, exactly like F.cross_entropy(reduction="mean")
    return total_loss / total_count


@torch.no_grad()
def evaluate_bpb(
    model: torch.nn.Module,
    loader: Iterator,
    steps: int,
    token_bytes: torch.Tensor,
) -> float:
    """
    Evaluate validation bits-per-byte.

    Runs the model on `steps` batches from loader, computes average bpb.

    Args:
        model:        GPT model in eval mode (train.py calls model.eval() before this)
        loader:       generator yielding (x, y, ...) tuples — the pretrain loader
                      yields (x, y, state), the SFT loader (x, y, info); elements
                      past the first two are ignored here
        steps:        number of batches to evaluate; train.py derives it as
                      eval_tokens // (B * T * world_size) — nanochat convention
        token_bytes:  (vocab_size,) int32 tensor from get_token_bytes()
                      maps token id → number of UTF-8 bytes it represents

    Returns:
        float — average bits per byte (lower is better; Stage 1 d8 oracle ≈ 0.94)

    Formula:
        For each batch:
            per_token_loss = model(x, y, loss_reduction="none")   # (B*T,) nats
            valid_mask     = (y.view(-1) != -1)
            nats           = per_token_loss[valid_mask].sum()
            bytes_         = token_bytes[y.view(-1)[valid_mask]].sum().float()
        bpb = total_nats / total_bytes * log2(e)

    DDP (nanochat loss_eval.py convention): each rank sees a disjoint slice of the
    val data, so before the final division, all-reduce BOTH accumulators:
        if dist.is_initialized():
            dist.all_reduce(total_nats,  op=dist.ReduceOp.SUM)
            dist.all_reduce(total_bytes, op=dist.ReduceOp.SUM)
    (keep them as on-device tensors until after the reduce).

    Edge case: if total_bytes == 0 (all targets masked), return float("inf").
    """
    device = token_bytes.device
    total_nats = torch.zeros((), dtype=torch.float32, device=device)
    total_bytes = torch.zeros((), dtype=torch.int64, device=device)

    batch_iter = iter(loader)
    for _ in range(steps):
        x, y, *_ = next(batch_iter)
        loss = model(x, y, loss_reduction="none").view(-1)   # (B*T,) nats
        y = y.view(-1)
        # ignore_index (-1) targets must not index token_bytes; clamp them to 0 and
        # zero out their byte count instead (nanochat loss_eval.py convention).
        valid = y >= 0
        num_bytes = torch.where(
            valid, token_bytes[torch.where(valid, y, torch.zeros_like(y))],
            torch.zeros_like(y, dtype=token_bytes.dtype),
        )
        # Tokens worth 0 bytes (special tokens, and masked ones) contribute no nats
        # either, so bpb stays a pure per-byte quantity.
        total_nats += (loss * (num_bytes > 0)).sum()
        total_bytes += num_bytes.sum()

    # Each rank evaluates a disjoint slice of val, so reduce both accumulators
    # on-device before dividing.
    if dist.is_initialized() and dist.get_world_size() > 1:
        dist.all_reduce(total_nats, op=dist.ReduceOp.SUM)
        dist.all_reduce(total_bytes, op=dist.ReduceOp.SUM)

    total_nats = total_nats.item()
    total_bytes = total_bytes.item()
    if total_bytes == 0:
        return float("inf")
    return total_nats / total_bytes * math.log2(math.e)
