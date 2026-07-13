"""
archerchat/checkpoint.py — checkpoint save / load / model-from-checkpoint.

Implement everything marked NotImplementedError.
train.py calls save_checkpoint() and load_checkpoint().
train.py + engine.py call build_model() to reconstruct a model from disk.

Layout under base_dir (binary-compatible with Stage 1 nanochat layout):
    base_checkpoints/d{depth}/
        model_{step:06d}.pt     — model state dict (rank 0)
        optim_{step:06d}_rank{rank}.pt  — optimizer state dict (per rank; rank 0 = full for single-GPU)
        meta_{step:06d}.json    — JSON with step, config, loader_state, args

    chatsft_checkpoints/d{depth}/ — same structure for SFT runs

Acceptance gate (step 6):
    Round-trip save → load → compare weights and optimizer state: must be identical.
"""

from __future__ import annotations

import glob
import json
import logging
import os
import re

import torch

from archerchat.common import get_base_dir, print0

logger = logging.getLogger(__name__)

# Names must match Stage 1's files byte-for-byte — ~/.cache/nanochat/base_checkpoints/d8
# is read back by these loaders, and common.maybe_upload_checkpoint() globs for them.
_MODEL_FILE = "model_{step:06d}.pt"
_OPTIM_FILE = "optim_{step:06d}_rank{rank:d}.pt"
_META_FILE  = "meta_{step:06d}.json"

_CHECKPOINT_SUBDIR = {
    "base": "base_checkpoints",
    "sft":  "chatsft_checkpoints",
    "rl":   "chatrl_checkpoints",
}


def find_last_step(checkpoint_dir: str) -> int:
    """Largest step for which a model_{step:06d}.pt exists in checkpoint_dir."""
    model_files = glob.glob(os.path.join(checkpoint_dir, "model_*.pt"))
    if not model_files:
        raise FileNotFoundError(f"No checkpoints found in {checkpoint_dir}")
    return max(int(os.path.basename(f).split("_")[-1].split(".")[0]) for f in model_files)


def find_largest_model(checkpoints_dir: str) -> str:
    """Pick a model tag: the largest d<number> subdirectory, else the most recent one."""
    if not os.path.isdir(checkpoints_dir):
        raise FileNotFoundError(f"No checkpoints found in {checkpoints_dir}")
    model_tags = [f for f in os.listdir(checkpoints_dir)
                  if os.path.isdir(os.path.join(checkpoints_dir, f))]
    if not model_tags:
        raise FileNotFoundError(f"No checkpoints found in {checkpoints_dir}")
    depths = [(int(m.group(1)), tag) for tag in model_tags
              if (m := re.match(r"d(\d+)$", tag))]
    if depths:
        return max(depths)[1]
    return max(model_tags, key=lambda t: os.path.getmtime(os.path.join(checkpoints_dir, t)))


def _patch_missing_config_keys(model_config_kwargs: dict) -> None:
    """Stage 1 checkpoints predate some config keys; fill in the values they trained with."""
    # Models trained before sliding-window attention used full context on every layer.
    if "window_pattern" not in model_config_kwargs:
        model_config_kwargs["window_pattern"] = "L"


def _patch_missing_keys(model_data: dict, config) -> None:
    """Stage 1 checkpoints predate some parameters; fill in their identity/disabled values."""
    if "resid_lambdas" not in model_data:
        model_data["resid_lambdas"] = torch.ones(config.n_layer)
    if "x0_lambdas" not in model_data:
        model_data["x0_lambdas"] = torch.zeros(config.n_layer)


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
        optim_{step:06d}_rank{rank}.pt      — saved by every rank (for DDP sharding)
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
    os.makedirs(checkpoint_dir, exist_ok=True)

    if rank == 0:
        model_path = os.path.join(checkpoint_dir, _MODEL_FILE.format(step=step))
        _atomic_torch_save(model_data, model_path)
        logger.info(f"Saved model parameters to: {model_path}")

        meta_path = os.path.join(checkpoint_dir, _META_FILE.format(step=step))
        tmp_path = meta_path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(meta_data, f, indent=2)
        os.replace(tmp_path, meta_path)
        logger.info(f"Saved metadata to: {meta_path}")

    # Optimizer state is sharded across ranks (Muon/DDP), so every rank saves its own shard.
    if optimizer_data is not None:
        optim_path = os.path.join(checkpoint_dir, _OPTIM_FILE.format(step=step, rank=rank))
        _atomic_torch_save(optimizer_data, optim_path)
        logger.info(f"Saved optimizer state to: {optim_path}")


def _atomic_torch_save(data, path: str) -> None:
    tmp_path = path + ".tmp"
    torch.save(data, tmp_path, _use_new_zipfile_serialization=True)
    os.replace(tmp_path, path)


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
        load_optimizer: if True, also load optim_{step:06d}_rank{rank}.pt
        rank:           DDP rank for optimizer shard lookup

    Returns:
        (model_data, optimizer_data, meta_data)
        model_data:     state dict from model_{step:06d}.pt
        optimizer_data: state dict from optim file, or None if load_optimizer=False
        meta_data:      dict parsed from meta_{step:06d}.json
    """
    if step is None:
        step = find_last_step(checkpoint_dir)

    model_path = os.path.join(checkpoint_dir, _MODEL_FILE.format(step=step))
    model_data = torch.load(model_path, map_location=device, weights_only=True)

    optimizer_data = None
    if load_optimizer:
        optim_path = os.path.join(checkpoint_dir, _OPTIM_FILE.format(step=step, rank=rank))
        # A checkpoint may carry no optimizer shard for this rank (e.g. saved with a
        # different world size, or model-only). Callers treat None as "start fresh".
        if os.path.exists(optim_path):
            optimizer_data = torch.load(optim_path, map_location=device, weights_only=True)
        else:
            logger.warning(f"Optimizer checkpoint not found: {optim_path}")

    meta_path = os.path.join(checkpoint_dir, _META_FILE.format(step=step))
    with open(meta_path, "r", encoding="utf-8") as f:
        meta_data = json.load(f)

    return model_data, optimizer_data, meta_data


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
    from archerchat.dataloader import get_tokenizer
    from archerchat.model import GPT, GPTConfig

    assert phase in ("train", "eval"), f"Invalid phase: {phase}"
    device = torch.device(device) if isinstance(device, str) else device

    model_data, _, meta_data = load_checkpoint(checkpoint_dir, step, device, load_optimizer=False)

    if device.type in ("cpu", "mps"):
        # Embeddings are stored in bf16; CPU/MPS inference wants float.
        model_data = {k: v.float() if v.dtype == torch.bfloat16 else v
                      for k, v in model_data.items()}
    # torch.compile prepends "_orig_mod." to every key if a compiled model was saved.
    model_data = {k.removeprefix("_orig_mod."): v for k, v in model_data.items()}

    model_config_kwargs = dict(meta_data["model_config"])
    _patch_missing_config_keys(model_config_kwargs)
    config = GPTConfig(**model_config_kwargs)
    _patch_missing_keys(model_data, config)
    print0(f"Building model with config: {model_config_kwargs}")

    with torch.device("meta"):
        model = GPT(config)
    model.to_empty(device=device)
    model.init_weights()  # materializes the non-persistent buffers (rotary embeddings)
    model.load_state_dict(model_data, strict=True, assign=True)
    model.eval() if phase == "eval" else model.train()

    tokenizer = get_tokenizer()
    assert tokenizer.get_vocab_size() == config.vocab_size, (
        f"Tokenizer vocab size {tokenizer.get_vocab_size()} does not match "
        f"model config vocab size {config.vocab_size}"
    )
    return model, tokenizer, meta_data


def load_model(
    source: str,
    device: torch.device | str,
    phase: str = "eval",
    model_tag: str | None = None,
    step: int | None = None,
) -> tuple:
    """
    Convenience wrapper over build_model() with nanochat checkpoint_manager's
    load_model() interface — scripts/chat_cli.py and scripts/chat_web.py
    (vendored from nanochat) call this exact signature.

    Args:
        source:    "base" → base_checkpoints/, "sft" → chatsft_checkpoints/
        device:    device to place the model on
        phase:     "train" | "eval"
        model_tag: subdirectory name, e.g. "d8"; None = pick the largest depth
                   present (scan for d* subdirectories, take max depth)
        step:      which step to load; None = latest (build_model handles this)

    Returns:
        (model, tokenizer, meta_data) — same as build_model()

    Implementation:
        1. subdir = {"base": "base_checkpoints", "sft": "chatsft_checkpoints"}[source]
        2. checkpoints_dir = os.path.join(get_base_dir(), subdir)
        3. Resolve model_tag (largest d* if None), join, delegate to build_model()
    """
    checkpoints_dir = os.path.join(get_base_dir(), _CHECKPOINT_SUBDIR[source])
    if model_tag is None:
        model_tag = find_largest_model(checkpoints_dir)
        print0(f"No model tag provided, guessing model tag: {model_tag}")
    checkpoint_dir = os.path.join(checkpoints_dir, model_tag)
    print0(f"Loading model from {checkpoint_dir} with step {step if step is not None else 'latest'}")
    return build_model(checkpoint_dir, step, device, phase)
