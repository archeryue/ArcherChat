"""Tests for archerchat/sft.py (TECH_PLAN step 9).

The chat template is the oracle-critical part: any divergence from nanochat's
tokenizer.render_conversation() changes the token ids and invalidates every SFT
bpb comparison. Note nanochat does NOT use ChatML — no <|im_start|>, no newlines
around the delimiters, and no system role in the rendered stream.
"""

import os
import pickle
import sys

import pytest
import torch

import archerchat.sft as sft
from archerchat.sft import build_example, make_sft_dataloader, render_conversation

NANOCHAT_DIR = os.environ.get("NANOCHAT_DIR", os.path.expanduser("~/nanochat"))
TOKENIZER_PKL = os.path.expanduser("~/.cache/nanochat/tokenizer/tokenizer.pkl")

CONVERSATION_3TURN = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is 2+2?"},
    {"role": "assistant", "content": "4"},
]


class FakeTokenizer:
    """render_conversation() is pure text; build_example() also needs encode() and
    encode_special(). One-char-per-token encode keeps the mask arithmetic obvious.
    """

    _SPECIALS = [
        "<|bos|>", "<|user_start|>", "<|user_end|>",
        "<|assistant_start|>", "<|assistant_end|>",
        "<|python_start|>", "<|python_end|>",
        "<|output_start|>", "<|output_end|>",
    ]

    def get_bos_token_id(self):
        return 0

    def encode_special(self, s):
        # Distinct high ids so specials never collide with content (ord < 0x110000).
        return 2_000_000 + self._SPECIALS.index(s)

    def encode(self, text):
        return [ord(c) for c in text]  # one token per character, fully deterministic


class TestRenderConversation:
    def test_system_user_assistant(self):
        # Byte-for-byte nanochat: a system message has no delimiters of its own, it is
        # merged into the first user message with "\n\n".
        assert render_conversation(FakeTokenizer(), CONVERSATION_3TURN) == (
            "<|bos|>"
            "<|user_start|>You are a helpful assistant.\n\nWhat is 2+2?<|user_end|>"
            "<|assistant_start|>4<|assistant_end|>"
        )

    def test_multi_turn_without_system(self):
        conversation = [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
            {"role": "user", "content": "bye"},
            {"role": "assistant", "content": "goodbye"},
        ]
        assert render_conversation(FakeTokenizer(), conversation) == (
            "<|bos|>"
            "<|user_start|>hi<|user_end|><|assistant_start|>hello<|assistant_end|>"
            "<|user_start|>bye<|user_end|><|assistant_start|>goodbye<|assistant_end|>"
        )

    def test_generation_prompt_primes_the_assistant(self):
        rendered = render_conversation(
            FakeTokenizer(),
            [{"role": "user", "content": "hi"}],
            add_generation_prompt=True,
        )
        assert rendered == "<|bos|><|user_start|>hi<|user_end|><|assistant_start|>"

    def test_tool_use_parts(self):
        conversation = [
            {"role": "user", "content": "2+2?"},
            {"role": "assistant", "content": [
                {"type": "text", "text": "Let me compute."},
                {"type": "python", "text": "2+2"},
                {"type": "python_output", "text": "4"},
                {"type": "text", "text": "It is 4."},
            ]},
        ]
        assert render_conversation(FakeTokenizer(), conversation) == (
            "<|bos|><|user_start|>2+2?<|user_end|><|assistant_start|>"
            "Let me compute."
            "<|python_start|>2+2<|python_end|>"
            "<|output_start|>4<|output_end|>"
            "It is 4."
            "<|assistant_end|>"
        )

    def test_accepts_task_style_dict(self):
        # tasks/ emit {"messages": [...]}; both forms must render identically.
        as_dict = render_conversation(FakeTokenizer(), {"messages": CONVERSATION_3TURN})
        assert as_dict == render_conversation(FakeTokenizer(), CONVERSATION_3TURN)

    def test_roles_must_alternate(self):
        with pytest.raises(AssertionError):
            render_conversation(FakeTokenizer(), [
                {"role": "user", "content": "a"},
                {"role": "user", "content": "b"},
            ])

    def test_does_not_mutate_input(self):
        conversation = [dict(m) for m in CONVERSATION_3TURN]
        render_conversation(FakeTokenizer(), conversation)
        assert conversation == CONVERSATION_3TURN

    @pytest.mark.skipif(
        not (os.path.isdir(NANOCHAT_DIR) and os.path.exists(TOKENIZER_PKL)),
        reason="needs the nanochat oracle repo (NANOCHAT_DIR) and Stage 1's tokenizer",
    )
    def test_matches_nanochat_oracle_byte_for_byte(self):
        # Decode nanochat's rendered ids back to text (decode is lossless over special
        # tokens) and compare against our template. Same bytes => same ids.
        sys.path.append(NANOCHAT_DIR)  # append, not insert: don't shadow our tasks/ pkg
        from nanochat.tokenizer import RustBPETokenizer

        with open(TOKENIZER_PKL, "rb") as f:
            enc = pickle.load(f)
        oracle = RustBPETokenizer(enc, "<|bos|>")

        for conversation in [
            CONVERSATION_3TURN,
            [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}],
            [{"role": "user", "content": "2+2?"},
             {"role": "assistant", "content": [
                 {"type": "text", "text": "Let me compute."},
                 {"type": "python", "text": "2+2"},
                 {"type": "python_output", "text": "4"},
                 {"type": "text", "text": "It is 4."},
             ]}],
        ]:
            ids, _ = oracle.render_conversation({"messages": conversation})
            assert oracle.decode(ids) == render_conversation(oracle, conversation)


class TestBuildExample:
    def test_mask_is_assistant_only(self):
        # 3-turn conv after system-merge → assistant content "4" (1 char) + <|assistant_end|>.
        ids, mask = build_example(FakeTokenizer(), CONVERSATION_3TURN)
        assert ids.dtype == torch.long
        assert mask.dtype == torch.bool
        assert ids.shape == mask.shape
        assert not bool(mask[0])                    # BOS never supervised
        # exactly the assistant content tokens (len("4")=1) plus one <|assistant_end|>
        assert int(mask.sum()) == 1 + 1

    def test_mask_supervises_terminator_not_opener(self):
        ids, mask = build_example(FakeTokenizer(), CONVERSATION_3TURN)
        tok = FakeTokenizer()
        assistant_start = tok.encode_special("<|assistant_start|>")
        assistant_end = tok.encode_special("<|assistant_end|>")
        # opener not supervised, terminator supervised
        opener_pos = (ids == assistant_start).nonzero().flatten().tolist()
        end_pos = (ids == assistant_end).nonzero().flatten().tolist()
        assert opener_pos and all(not bool(mask[p]) for p in opener_pos)
        assert end_pos and all(bool(mask[p]) for p in end_pos)

    def test_tool_call_supervised_output_not(self):
        conv = [
            {"role": "user", "content": "2+2?"},
            {"role": "assistant", "content": [
                {"type": "text", "text": "hi"},
                {"type": "python", "text": "2+2"},          # supervised (incl. delimiters)
                {"type": "python_output", "text": "4"},     # NOT supervised
                {"type": "text", "text": "done"},
            ]},
        ]
        ids, mask = build_example(FakeTokenizer(), conv)
        tok = FakeTokenizer()
        out_start = tok.encode_special("<|output_start|>")
        py_start = tok.encode_special("<|python_start|>")
        assert all(not bool(mask[p]) for p in (ids == out_start).nonzero().flatten().tolist())
        assert all(bool(mask[p]) for p in (ids == py_start).nonzero().flatten().tolist())


class TestSftDataloader:
    def test_dataloader_yields_real_batches(self, monkeypatch):
        import torch
        # short conversations so several pack into a row (T=32 → row_capacity 33)
        conv = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "ok"}]
        monkeypatch.setattr(sft, "build_sft_dataset", lambda split: [{"messages": conv}] * 8)
        loader = make_sft_dataloader(FakeTokenizer(), B=2, T=32, split="train", device="cpu")
        x, y, info = next(loader)
        assert x.shape == (2, 32) and y.shape == (2, 32)
        assert x.dtype == torch.long and y.dtype == torch.long
        assert set(info) == {"progress", "epoch", "last_step"}
        # mask plumbing: some targets are ignored (-1) and some are supervised assistant tokens
        assert (y == -1).any() and (y != -1).any()

    def test_dataloader_rejects_bad_split(self):
        with pytest.raises(AssertionError):
            next(make_sft_dataloader(FakeTokenizer(), B=1, T=8, split="test", device="cpu"))
