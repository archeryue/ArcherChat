"""
archerchat/sft.py — supervised fine-tuning data pipeline.

Implement everything marked NotImplementedError.
scripts/chat_sft.py calls make_sft_dataloader().
engine.py calls render_conversation() for chat inference.

What to implement:
  - render_conversation(): apply the chat template to a conversation dict list
  - build_example(): tokenize one conversation, build the assistant-only loss mask
  - make_sft_dataloader(): infinite generator over the SFT corpus

Chat template (verified against nanochat/tokenizer.py RustBPETokenizer.render_conversation;
this is NOT ChatML — nanochat has no <|im_start|> tokens and no newlines in the template):

    <|bos|><|user_start|>{user}<|user_end|><|assistant_start|>{assistant}<|assistant_end|>...

  - There is no system role in the rendered stream. A leading system message is merged
    into the first user message as: system_content + "\n\n" + user_content.
  - Roles must strictly alternate user/assistant/user/... after that merge.
  - Assistant content may be a list of parts instead of a string; python tool calls are
    wrapped in <|python_start|>/<|python_end|> and their outputs (which come from the
    interpreter at test time, not the model) in <|output_start|>/<|output_end|>.

Loss mask convention (verified against nanochat, TECH_PLAN step 9):
    1 for assistant content tokens AND the closing <|assistant_end|> token
      (the model must learn to emit the stop token — this is what terminates generation)
    0 for everything else: BOS, <|user_start|>, user content, <|user_end|>,
      the opening <|assistant_start|>, and python-output tokens (incl. their delimiters)
    So: the turn-terminating token IS supervised (mask=1); the turn-opening token is not.

Acceptance gate (step 9):
    build_example() on a canonical 3-turn conversation → loss mask is 1 exactly on
    assistant token positions and 0 everywhere else.
"""

from __future__ import annotations

import os
from typing import Generator

import torch

from archerchat.common import get_base_dir

# nanochat chat_sft.py data-mixture knobs (its --mmlu-epochs / --gsm8k-epochs defaults).
MMLU_EPOCHS = 3
GSM8K_EPOCHS = 4

# Conversations longer than this are truncated when rendered (nanochat: render_conversation
# max_tokens=2048). Prevents OOMs and, in the packer, rows that nothing can ever fit into.
MAX_CONVERSATION_TOKENS = 2048


def _normalize_messages(conversation: list[dict] | dict) -> list[dict]:
    """
    tasks/ emit {"messages": [...]}; the SFT API here takes the message list itself.
    Accept both, and apply nanochat's system-message surgery: there is no system role in
    the rendered stream, the system message is prepended to the first user message.
    """
    messages = conversation["messages"] if isinstance(conversation, dict) else conversation
    assert len(messages) >= 1, f"Conversation has less than 1 message: {messages}"
    if messages[0]["role"] == "system":
        assert messages[1]["role"] == "user", "System message must be followed by a user message"
        merged = dict(messages[1])
        merged["content"] = messages[0]["content"] + "\n\n" + messages[1]["content"]
        messages = [merged] + list(messages[2:])
    return list(messages)


def render_conversation(
    tokenizer,
    conversation: list[dict],
    add_generation_prompt: bool = False,
) -> str:
    """
    Apply nanochat's chat template to a conversation and return the raw text.
    (NOT ChatML — see the module header. There are no <|im_*|> tokens anywhere.)

    Args:
        tokenizer:              result of get_tokenizer()
        conversation:           list of {"role": str, "content": str} dicts
                                roles: "system", "user", "assistant"
                                (a leading system message is merged into the first
                                 user message — there is no system role in the stream)
        add_generation_prompt:  if True, append '<|assistant_start|>' at the end
                                (used during inference to prime the model)

    Returns:
        str — the templated conversation text ready for tokenization

    Note: keep the template byte-for-byte identical to nanochat's render_conversation()
    so that tokenization produces the same token ids and the SFT oracle comparisons hold.

    nanochat builds the token stream directly (tokenizer.render_conversation) rather than
    templating text, because the delimiters are special tokens that must never go through
    BPE. This returns the equivalent text form: the ids are the same iff each segment is
    encoded separately and the delimiters are looked up with encode_special() — which is
    what build_example() must do.
    """
    messages = _normalize_messages(conversation)
    out = ["<|bos|>"]
    for i, message in enumerate(messages):
        must_be_from = "user" if i % 2 == 0 else "assistant"
        assert message["role"] == must_be_from, \
            f"Message {i} is from {message['role']} but should be from {must_be_from}"
        content = message["content"]
        if message["role"] == "user":
            assert isinstance(content, str), "User messages are simply expected to be strings"
            out += ["<|user_start|>", content, "<|user_end|>"]
        else:
            out.append("<|assistant_start|>")
            if isinstance(content, str):
                out.append(content)
            elif isinstance(content, list):
                for part in content:
                    text = part["text"]
                    if part["type"] == "text":
                        out.append(text)
                    elif part["type"] == "python":
                        out += ["<|python_start|>", text, "<|python_end|>"]
                    elif part["type"] == "python_output":
                        out += ["<|output_start|>", text, "<|output_end|>"]
                    else:
                        raise ValueError(f"Unknown part type: {part['type']}")
            else:
                raise ValueError(f"Unknown content type: {type(content)}")
            out.append("<|assistant_end|>")
    if add_generation_prompt:
        out.append("<|assistant_start|>")
    return "".join(out)


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

    ═══════════════════════════════════════════════════════════════════════════
    THE LOSS MASK — the open question is ANSWERED. Verified against
    nanochat/tokenizer.py:302-345 (RustBPETokenizer.render_conversation).

        <|bos|>                                    → 0
        <|user_start|>, user content, <|user_end|> → 0
        <|assistant_start|>   (turn OPENER)        → 0     (tokenizer.py:319)
        assistant content                          → 1
        <|assistant_end|>     (turn TERMINATOR)    → 1     (tokenizer.py:345)
              ↑ the model MUST learn to emit its own stop token — this is what
                terminates generation at inference time. Supervise it.
        <|python_start|>…<|python_end|> + content  → 1     (tokenizer.py:332-334)
              ↑ the model generates tool calls, so they ARE supervised
        <|output_start|>…<|output_end|> + content  → 0     (tokenizer.py:338-340)
              ↑ these come from the Python interpreter at test time, not the model

    So: the turn-TERMINATING token is supervised; the turn-OPENING token is not.

    Build the ids by encoding each content segment separately and looking the
    delimiters up with encode_special() — the special tokens must NEVER go through BPE.
    render_conversation() above shows the exact segment order.
    ═══════════════════════════════════════════════════════════════════════════

    Acceptance gate (step 9):
        Given a 3-turn conversation, mask.sum() must equal exactly the number of
        assistant content tokens PLUS one <|assistant_end|> per assistant turn.
        mask[0] must be False (BOS never contributes to loss).

    make_sft_dataloader() below already calls this and will start working the moment
    it returns real tensors.
    """
    raise NotImplementedError


_DATASET_CACHE: dict[str, object] = {}


def build_sft_dataset(split: str):
    """
    The nanochat chat_sft.py SFT mixture, verbatim (TaskMixture deterministically
    shuffles with seed 42, so a task listed twice = two epochs of it).

    Cached: chat_sft.py rebuilds the val loader on every eval, and re-loading SmolTalk
    from HF each time would dominate the eval cost.
    """
    if split in _DATASET_CACHE:
        return _DATASET_CACHE[split]

    from tasks.common import TaskMixture
    from tasks.customjson import CustomJSON
    from tasks.gsm8k import GSM8K
    from tasks.mmlu import MMLU
    from tasks.smoltalk import SmolTalk
    from tasks.spellingbee import SimpleSpelling, SpellingBee

    if split == "train":
        identity_path = os.path.join(get_base_dir(), "identity_conversations.jsonl")
        dataset = TaskMixture([
            SmolTalk(split="train"),                                        # 460K general conversations
            CustomJSON(filepath=identity_path),                             # 1K synthetic identity convs
            CustomJSON(filepath=identity_path),                             # ...2 epochs of them
            *[MMLU(subset="all", split="auxiliary_train") for _ in range(MMLU_EPOCHS)],   # 100K/epoch
            *[GSM8K(subset="main", split="train") for _ in range(GSM8K_EPOCHS)],          # 8K/epoch
            SimpleSpelling(size=200000, split="train"),
            SpellingBee(size=80000, split="train"),
        ])
    else:
        # stop= values keep the val mixture's task ratios in line with the train mixture.
        dataset = TaskMixture([
            SmolTalk(split="test"),                                  # 24K rows
            MMLU(subset="all", split="test", stop=5200),
            GSM8K(subset="main", split="test", stop=420),
        ])

    _DATASET_CACHE[split] = dataset
    return dataset


def make_sft_dataloader(
    tokenizer,
    B: int,
    T: int,
    split: str,
    device: torch.device | str,
    rank: int = 0,
    world_size: int = 1,
) -> Generator[tuple[torch.Tensor, torch.Tensor, dict], None, None]:
    """
    Generator of (inputs, targets, info) micro-batches for SFT.

    Unlike pretraining, SFT is DATASET-DRIVEN (nanochat chat_sft.py convention):
    the run stops after one epoch of the mixture, and the loader — not train.py —
    knows where the epoch boundary is.  Each yield therefore carries progress info
    instead of a resume state (nanochat doesn't support SFT resume; neither do we):

        x:    (B, T) int64 on device — input token ids
        y:    (B, T) int64 on device — targets; non-assistant positions and padding
                                       are set to -1 so cross_entropy(ignore_index=-1)
                                       skips them
        info: {"progress":  float,  # fraction of the epoch consumed, 0.0 → 1.0
               "epoch":     int,    # current epoch (1-based; stays 1 in normal runs)
               "last_step": bool}   # True once the epoch's data is exhausted

    train.py uses info["progress"] to drive the progress-based LR schedule and
    info["last_step"] to terminate (all-reduced across ranks — each rank's shard
    can exhaust at a slightly different step, see _sync_last_step in train.py).

    Args:
        tokenizer:   result of get_tokenizer()
        B:           micro-batch size in sequences
        T:           sequence length in tokens
        split:       "train" or "val"
        device:      where to put the returned tensors
        rank:        DDP rank
        world_size:  total DDP ranks

    Data source:
        Same mixture as nanochat chat_sft.py (SmolTalk + identity conversations +
        MMLU aux-train + GSM8K + spelling tasks) via the vendored tasks/ package.

    Packing (nanochat's BOS-aligned bestfit-PAD, NOT the pretrain bestfit-crop):
        Each row starts with BOS. Conversations are packed best-fit; when nothing
        fits, the row is PADDED to T (never cropped — no tokens are ever discarded).
        Padding positions get target -1.

    Acceptance gate (step 9):
        First 100 SFT steps with ArcherChat loader must produce val_bpb within 2% of
        the nanochat-d8 SFT oracle at the same step (same pretrain weights as init).
    """
    assert split in {"train", "val"}, "split must be 'train' or 'val'"
    dataset = build_sft_dataset(split)
    dataset_size = len(dataset)
    assert dataset_size > 0
    row_capacity = T + 1  # +1 so every row still has a target at position T-1
    bos_token = tokenizer.get_bos_token_id()
    # Rendering cap: nanochat's flat 2048, but never above row_capacity — a conversation
    # longer than a row would fit nowhere and the packer would emit padding forever.
    max_tokens = min(MAX_CONVERSATION_TOKENS, row_capacity)
    buffer_size = 100

    conv_buffer: list[tuple[list[int], list[int]]] = []
    cursor = rank      # fetch position: each rank walks a disjoint stride of the dataset
    consumed = rank    # consumption trails fetching (the buffer holds ~100 conversations)
    epoch = 1

    def refill_buffer():
        nonlocal cursor, epoch
        while len(conv_buffer) < buffer_size:
            ids, mask = build_example(tokenizer, dataset[cursor], max_tokens=max_tokens)
            conv_buffer.append((ids, mask))
            cursor += world_size
            if cursor >= dataset_size:
                cursor = cursor % dataset_size
                epoch += 1

    while True:
        rows, mask_rows, row_lengths = [], [], []
        for _ in range(B):
            row, mask_row = [], []
            content_len = row_capacity
            while len(row) < row_capacity:
                refill_buffer()
                remaining = row_capacity - len(row)

                # Best fit: the longest buffered conversation that still fits whole.
                best_idx, best_len = -1, 0
                for i, (conv, _) in enumerate(conv_buffer):
                    if best_len < len(conv) <= remaining:
                        best_idx, best_len = i, len(conv)

                if best_idx >= 0:
                    conv, conv_mask = conv_buffer.pop(best_idx)
                    row.extend(conv)
                    mask_row.extend(conv_mask)
                    consumed += world_size
                else:
                    # Nothing fits: PAD the row out (never crop — SFT discards no tokens).
                    content_len = len(row)
                    row.extend([bos_token] * remaining)
                    mask_row.extend([0] * remaining)
                    break

            rows.append(row[:row_capacity])
            mask_rows.append(mask_row[:row_capacity])
            row_lengths.append(content_len)

        # Progress/stop are consumption-based, not cursor-based: the buffer runs ahead.
        progress = min(consumed / dataset_size, 1.0)
        last_step = consumed >= dataset_size

        batch = torch.tensor(rows, dtype=torch.long)
        x = batch[:, :-1].to(device=device, non_blocking=True).contiguous()
        y = batch[:, 1:].to(device=device, non_blocking=True).contiguous()

        # mask[1:] aligns with the targets (shifted by one). Everything the assistant is
        # not expected to produce gets -1 = cross_entropy's ignore_index.
        mask = torch.tensor(mask_rows, dtype=torch.int8)[:, 1:].to(device=device)
        y[mask == 0] = -1
        for i, content_len in enumerate(row_lengths):
            if content_len < row_capacity:
                y[i, content_len - 1:] = -1  # padding: also target -1

        yield x, y, {"progress": progress, "epoch": epoch, "last_step": last_step}
