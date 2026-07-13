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
    """render_conversation() is pure text; the loader only needs the BOS id."""

    def get_bos_token_id(self):
        return 0


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


class TestSftDataloader:
    # ---------------------------------------------------------------------
    # build_example() is the student's homework and is still a stub. The two
    # tests below pin that fact down; flip them into real tests (mask values,
    # packing, progress/last_step) once build_example() lands.
    # ---------------------------------------------------------------------
    def test_build_example_is_not_implemented_yet(self):
        with pytest.raises(NotImplementedError):
            build_example(FakeTokenizer(), CONVERSATION_3TURN)

    def test_dataloader_propagates_build_example_stub(self, monkeypatch):
        monkeypatch.setattr(sft, "build_sft_dataset", lambda split: [
            {"messages": CONVERSATION_3TURN}
        ] * 4)
        loader = make_sft_dataloader(FakeTokenizer(), B=2, T=8, split="train", device="cpu")
        with pytest.raises(NotImplementedError) as excinfo:
            next(loader)
        # The loader must go through build_example(), not reimplement it.
        assert any(entry.name == "build_example" for entry in excinfo.traceback)

    def test_dataloader_rejects_bad_split(self):
        with pytest.raises(AssertionError):
            next(make_sft_dataloader(FakeTokenizer(), B=1, T=8, split="test", device="cpu"))
