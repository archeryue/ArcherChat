"""
archerchat/sft.py — supervised fine-tuning data pipeline.

Implement everything marked NotImplementedError.
train.py calls make_sft_dataloader() when --phase sft.
engine.py calls render_conversation() for chat inference.

What to implement:
  - render_conversation(): apply the chat template to a conversation dict list
  - build_example(): tokenize one conversation, build the assistant-only loss mask
  - make_sft_dataloader(): infinite generator over the SFT corpus

Chat template (must match nanochat exactly — any divergence breaks the d8 SFT oracle):
    <|im_start|>system
    {system message}
    <|im_end|>
    <|im_start|>user
    {user message}
    <|im_end|>
    <|im_start|>assistant
    {assistant message}
    <|im_end|>
    ... (repeat user/assistant turns)

Loss mask convention (confirm against nanochat before coding — TECH_PLAN step 9):
    1 for assistant token positions (these contribute to loss)
    0 for everything else (system, user, special tokens)
    EOS after each assistant turn: check nanochat to confirm whether it is masked 1 or 0.

Acceptance gate (step 9):
    build_example() on a canonical 3-turn conversation → loss mask is 1 exactly on
    assistant token positions and 0 everywhere else.
"""

from __future__ import annotations

from typing import Generator

import torch


def render_conversation(
    tokenizer,
    conversation: list[dict],
    add_generation_prompt: bool = False,
) -> str:
    """
    Apply the ChatML template to a conversation and return the raw text.

    Args:
        tokenizer:              result of get_tokenizer()
        conversation:           list of {"role": str, "content": str} dicts
                                roles: "system", "user", "assistant"
        add_generation_prompt:  if True, append '<|im_start|>assistant\n' at the end
                                (used during inference to prime the model)

    Returns:
        str — the templated conversation text ready for tokenization

    Note: keep the template byte-for-byte identical to nanochat's render_conversation()
    so that tokenization produces the same token ids and the SFT oracle comparisons hold.
    """
    raise NotImplementedError


def build_example(
    tokenizer,
    conversation: list[dict],
    max_tokens: int = 2048,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Tokenize one conversation and build the assistant-only loss mask.

    Args:
        tokenizer:    result of get_tokenizer()
        conversation: list of {"role": str, "content": str} dicts
        max_tokens:   truncate at this many tokens (hard cutoff)

    Returns:
        (ids, mask):
            ids:  (T,) int64 — token ids (T ≤ max_tokens)
            mask: (T,) bool  — True for tokens that contribute to loss
                               (assistant positions only; confirm EOS convention with nanochat)

    Acceptance gate (step 9):
        Given a 3-turn conversation, mask.sum() must equal exactly the number of
        assistant tokens.  mask[0] must be False (BOS never contributes to loss).
    """
    raise NotImplementedError


def make_sft_dataloader(
    tokenizer,
    B: int,
    T: int,
    device: torch.device | str,
    resume_state_dict: dict | None = None,
    rank: int = 0,
    world_size: int = 1,
) -> Generator[tuple[torch.Tensor, torch.Tensor, dict], None, None]:
    """
    Infinite generator of (inputs, targets, state_dict) for SFT.

    Same interface as make_pretrain_dataloader() but with an assistant-only loss mask:
        x:     (B, T) int64 on device — input token ids
        y:     (B, T) int64 on device — targets; non-assistant positions are set to -1
                                          so F.cross_entropy(ignore_index=-1) skips them
        state: dict for deterministic resume (same format as pretrain loader)

    Args:
        tokenizer:          result of get_tokenizer()
        B:                  micro-batch size in sequences
        T:                  sequence length in tokens
        device:             where to put the returned tensors
        resume_state_dict:  if provided, skip to this position before yielding
        rank:               DDP rank
        world_size:         total DDP ranks

    Data source:
        SFT conversations from ~/.cache/nanochat/chatsft_data/ (or download if missing).
        Use the same download URL / format as nanochat's chat_sft.py.

    Packing vs padding:
        Pack multiple short conversations into one length-T window separated by EOS.
        Pad the last window in a batch to T with token_id=0 (target=-1 for padding).

    Acceptance gate (step 9):
        First 100 SFT steps with ArcherChat loader must produce val_bpb within 2% of
        the nanochat-d8 SFT oracle at the same step (same pretrain weights as init).
    """
    raise NotImplementedError
