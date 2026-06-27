"""
archerchat/checkpoint.py — checkpoint save / load / model-from-checkpoint.

Implement everything marked NotImplementedError.
train.py calls save_checkpoint() and load_checkpoint().
train.py + engine.py call build_model() to reconstruct a model from disk.

Layout under base_dir (binary-compatible with Stage 1 nanochat layout):
    base_checkpoints/d{depth}/
        model_{step:06d}.pt     — model state dict (rank 0)
        optim_{step:06d}_r{rank}.pt  — optimizer state dict (per rank; rank 0 = full for single-GPU)
        meta_{step:06d}.json    — JSON with step, config, loader_state, args

    chatsft_checkpoints/d{depth}/ — same structure for SFT runs

Acceptance gate (step 6):
    Round-trip save → load → compare weights and optimizer state: must be identical.
"""

from __future__ import annotations

import json
import os

import torch


def save_checkpoint(
    checkpoint_dir: str,
    step: int,
    model_data: dict,
    optimizer_data: dict,
    meta_data: dict,
    rank: int = 0,
) -> None:
    """
    Save model weights, optimizer state, and metadata to checkpoint_dir.

    File naming:
        model_{step:06d}.pt              — saved by rank 0 only
        optim_{step:06d}_r{rank}.pt      — saved by every rank (for DDP sharding)
        meta_{step:06d}.json             — saved by rank 0 only (human-readable)

    Args:
        checkpoint_dir: directory to write files into (created if missing)
        step:           current training step
        model_data:     raw_model.state_dict() — full parameter dict
        optimizer_data: optimizer.state_dict() — this rank's optimizer state
        meta_data:      dict that must be JSON-serializable, includes at least:
                        {"step": int, "phase": str, "model_config": dict,
                         "loader_state": dict | None, "args": dict}
        rank:           this process's DDP rank; rank 0 saves model + meta

    Implementation notes:
        - Use torch.save(..., _use_new_zipfile_serialization=True) for smaller files.
        - Write to a .tmp file then os.replace() to avoid partial writes on failure.
        - Ensure checkpoint_dir exists (os.makedirs(..., exist_ok=True)).
    """
    raise NotImplementedError


def load_checkpoint(
    checkpoint_dir: str,
    step: int | None,
    device: torch.device | str,
    load_optimizer: bool = False,
    rank: int = 0,
) -> tuple[dict, dict | None, dict]:
    """
    Load checkpoint files from checkpoint_dir.

    Args:
        checkpoint_dir: directory that contains the checkpoint files
        step:           which step to load; if None, auto-detect the latest step
                        (scan for the largest step number in model_*.pt files)
        device:         map_location for torch.load
        load_optimizer: if True, also load optim_{step:06d}_r{rank}.pt
        rank:           DDP rank for optimizer shard lookup

    Returns:
        (model_data, optimizer_data, meta_data)
        model_data:     state dict from model_{step:06d}.pt
        optimizer_data: state dict from optim file, or None if load_optimizer=False
        meta_data:      dict parsed from meta_{step:06d}.json
    """
    raise NotImplementedError


def build_model(
    checkpoint_dir: str,
    step: int | None,
    device: torch.device | str,
    phase: str = "eval",
) -> tuple:
    """
    Reconstruct a GPT model (and tokenizer) from a checkpoint.

    Called by:
        train.py  — to resume training or initialize SFT from pretrain weights
        engine.py — to load a model for inference
        eval.py   — to load a model for benchmark evaluation

    Args:
        checkpoint_dir: directory that contains the checkpoint files
        step:           which step to load; None = latest
        device:         device to place the model on
        phase:          "train" → model.train(); "eval" → model.eval()

    Returns:
        (model, tokenizer, meta_data)
        model:      GPT instance with weights loaded, on device, in correct mode
        tokenizer:  result of get_tokenizer() (same tokenizer used during training)
        meta_data:  dict from the checkpoint's meta JSON

    Implementation:
        1. load_checkpoint(..., load_optimizer=False) to get model_data + meta_data
        2. Reconstruct GPTConfig from meta_data["model_config"]
        3. Instantiate GPT(config), load state_dict
        4. Set train / eval mode
        5. Load tokenizer via dataloader.get_tokenizer()
    """
    raise NotImplementedError
