"""Tests for archerchat/dataloader.py (TECH_PLAN gate 4).

The heavy tests need Stage 1's artifacts (tokenizer + ClimbMix shards) on disk; they
skip if they aren't there. They read from the val split only (one shard, a couple of
row groups) so they stay in the seconds range.
"""

import json
import os

import pytest
import torch

from archerchat.dataloader import (
    DOC_BUFFER_SIZE,
    _artifact_dir,
    _compute_token_bytes,
    get_token_bytes,
    get_tokenizer,
    list_parquet_files,
    make_pretrain_dataloader,
)


def _artifacts_present() -> bool:
    try:
        tok_dir = _artifact_dir("tokenizer")
        data_dir = _artifact_dir("base_data_climbmix")
    except FileNotFoundError:
        return False
    has_tok = os.path.exists(os.path.join(tok_dir, "tokenizer.pkl"))
    has_data = any(f.endswith(".parquet") for f in os.listdir(data_dir))
    return has_tok and has_data


needs_artifacts = pytest.mark.skipif(
    not _artifacts_present(),
    reason="Stage 1 artifacts (tokenizer + base_data_climbmix shards) not on disk",
)

B, T = 2, 128


@pytest.fixture(scope="module")
def tokenizer():
    return get_tokenizer()


@needs_artifacts
class TestTokenizer:
    def test_bos_is_a_special_token(self, tokenizer):
        bos = tokenizer.get_bos_token_id()
        assert tokenizer.decode([bos]) == "<|bos|>"
        assert bos < tokenizer.get_vocab_size()

    def test_encode_batch_matches_encode_one(self, tokenizer):
        texts = ["hello world", "the quick brown fox 123"]
        bos = tokenizer.get_bos_token_id()
        batched = tokenizer.encode(texts, prepend=bos, num_threads=4)
        assert batched == [tokenizer.encode(t, prepend=bos) for t in texts]
        assert all(row[0] == bos for row in batched)


@needs_artifacts
class TestTokenBytes:
    def test_shape_dtype_and_specials(self, tokenizer):
        token_bytes = get_token_bytes("cpu")
        assert token_bytes.shape == (tokenizer.get_vocab_size(),)
        assert token_bytes.dtype == torch.int32
        # Special tokens must not contribute to bpb.
        for special in tokenizer.get_special_tokens():
            assert token_bytes[tokenizer.encode_special(special)].item() == 0

    def test_recompute_matches_stage1_artifact(self, tokenizer):
        # Guards the fallback path: recomputing from the tokenizer must reproduce the
        # token_bytes.pt that Stage 1's tok_train.py wrote, or bpb would shift.
        path = os.path.join(_artifact_dir("tokenizer"), "token_bytes.pt")
        if not os.path.exists(path):
            pytest.skip("no token_bytes.pt artifact to compare against")
        assert torch.equal(_compute_token_bytes(tokenizer), get_token_bytes("cpu"))


@needs_artifacts
class TestPretrainDataloader:
    def test_batch_shapes_and_bos_alignment(self, tokenizer):
        loader = make_pretrain_dataloader(tokenizer, B, T, split="val", device="cpu")
        x, y, state = next(loader)
        assert x.shape == (B, T) and y.shape == (B, T)
        assert x.dtype == torch.int64 and y.dtype == torch.int64
        # y is x shifted by one (both are views into one row of length T+1).
        assert torch.equal(x[:, 1:], y[:, :-1])
        # Every row starts at a document boundary.
        assert (x[:, 0] == tokenizer.get_bos_token_id()).all()
        assert set(state) == {"shard_idx", "row_group_idx", "doc_offset", "epoch", "doc_buffer"}
        assert state["epoch"] == 1
        assert len(state["doc_buffer"]) >= DOC_BUFFER_SIZE - 1

    def test_val_loader_always_replays_the_same_leading_batches(self, tokenizer):
        # base_train.py rebuilds the val loader for every evaluation; val_bpb is only
        # comparable across steps if those batches are always the same.
        first = [next(make_pretrain_dataloader(tokenizer, B, T, split="val", device="cpu"))[0].clone()
                 for _ in range(2)]
        assert torch.equal(first[0], first[1])

    def test_train_and_val_use_disjoint_shards(self):
        train, val = list_parquet_files("train"), list_parquet_files("val")
        assert len(val) == 1  # nanochat pins the LAST shard as val
        assert not set(train) & set(val)

    def test_state_dict_is_json_serializable(self, tokenizer):
        loader = make_pretrain_dataloader(tokenizer, B, T, split="val", device="cpu")
        _, _, state = next(loader)
        roundtrip = json.loads(json.dumps(state))  # checkpoint meta is a JSON file
        assert roundtrip == state

    @pytest.mark.parametrize("rank,world_size", [(0, 1), (1, 2)])
    def test_restart_determinism(self, tokenizer, rank, world_size):
        # Continuous run: 6 batches, snapshotting the state after batch 3.
        loader = make_pretrain_dataloader(tokenizer, B, T, split="val", device="cpu",
                                          rank=rank, world_size=world_size)
        batches, resume_state = [], None
        for step in range(6):
            x, y, state = next(loader)
            batches.append((x.clone(), y.clone()))
            if step == 2:
                resume_state = json.loads(json.dumps(state))  # exactly what lands in the ckpt

        # Restarted run: a fresh loader from that state must reproduce batches 4..6.
        resumed = make_pretrain_dataloader(tokenizer, B, T, split="val", device="cpu",
                                           resume_state_dict=resume_state,
                                           rank=rank, world_size=world_size)
        for step in range(3, 6):
            x, y, _ = next(resumed)
            assert torch.equal(x, batches[step][0]), f"inputs diverge at step {step}"
            assert torch.equal(y, batches[step][1]), f"targets diverge at step {step}"

    def test_resume_state_from_a_later_batch_also_lands_exactly(self, tokenizer):
        # A resume point deeper into the stream exercises a partially-drained doc buffer
        # spanning several row groups.
        loader = make_pretrain_dataloader(tokenizer, B, T, split="val", device="cpu")
        for _ in range(9):
            x, y, state = next(loader)
        expect_x, expect_y, _ = next(loader)
        resumed = make_pretrain_dataloader(tokenizer, B, T, split="val", device="cpu",
                                           resume_state_dict=json.loads(json.dumps(state)))
        x, y, _ = next(resumed)
        assert torch.equal(x, expect_x) and torch.equal(y, expect_y)
