"""Tests for archerchat/checkpoint.py (acceptance gate 6: save → load round-trip).

Uses dummy state dicts rather than a real GPT: the file format is what's under
test here, and it must stay binary-compatible with the Stage 1 nanochat layout.
"""

import json
import os

import pytest
import torch

from archerchat.checkpoint import (
    find_largest_model,
    find_last_step,
    load_checkpoint,
    prune_checkpoints,
    save_checkpoint,
)


def make_model_data():
    return {
        "transformer.wte.weight": torch.randn(64, 8, dtype=torch.bfloat16),
        "transformer.h.0.attn.c_q.weight": torch.randn(8, 8),
        "resid_lambdas": torch.ones(2),
        "lm_head.weight": torch.randn(64, 8),
    }


def make_optimizer_data(step):
    # Mirrors the real optim_*.pt payload: an integer-keyed state dict plus
    # param_groups carrying tuples/strings (must survive weights_only=True).
    return {
        "state": {
            0: {"step": step, "exp_avg": torch.randn(8, 8), "exp_avg_sq": torch.rand(8, 8)},
            1: {"step": step, "momentum_buffer": torch.randn(64, 8)},
        },
        "param_groups": [
            {"kind": "adamw", "lr": 0.01, "betas": (0.8, 0.95), "eps": 1e-10,
             "weight_decay": 0.0, "initial_lr": 0.02, "params": [0]},
            {"kind": "muon", "lr": 0.001, "momentum": 0.95, "ns_steps": 5,
             "beta2": 0.9, "weight_decay": 0.01, "initial_lr": 0.02, "params": [1]},
        ],
    }


def make_meta(step):
    return {
        "step": step,
        "phase": "pretrain",
        "val_bpb": 0.937,
        "model_config": {
            "vocab_size": 64, "n_layer": 2, "n_head": 4, "n_kv_head": 4,
            "n_embd": 8, "sequence_len": 128, "window_pattern": "SSSL",
        },
        "loader_state": {"pq_idx": 1, "rg_idx": 22, "epoch": 2},
        "args": {"depth": 8, "run": None},
    }


class TestSaveLoadRoundTrip:
    def test_round_trip(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        step = 1920
        model_data, optimizer_data, meta = make_model_data(), make_optimizer_data(step), make_meta(step)

        save_checkpoint(ckpt_dir, step, model_data, optimizer_data, meta, rank=0)
        loaded_model, loaded_optim, loaded_meta = load_checkpoint(
            ckpt_dir, step, device="cpu", load_optimizer=True, rank=0
        )

        assert loaded_model.keys() == model_data.keys()
        for k, v in model_data.items():
            assert loaded_model[k].dtype == v.dtype
            assert torch.equal(loaded_model[k], v)

        assert loaded_optim["state"].keys() == optimizer_data["state"].keys()
        for pid, state in optimizer_data["state"].items():
            for k, v in state.items():
                if torch.is_tensor(v):
                    assert torch.equal(loaded_optim["state"][pid][k], v)
                else:
                    assert loaded_optim["state"][pid][k] == v
        assert loaded_optim["param_groups"] == optimizer_data["param_groups"]

        assert loaded_meta == meta

    def test_filenames_match_stage1_convention(self, tmp_path):
        # archerchat.common.maybe_upload_checkpoint() and every Stage 1 checkpoint
        # on disk depend on these exact names (note: rank shard is `_rank0`, not `_r0`).
        ckpt_dir = str(tmp_path / "d8")
        save_checkpoint(ckpt_dir, 42, make_model_data(), make_optimizer_data(42), make_meta(42), rank=0)

        assert sorted(os.listdir(ckpt_dir)) == [
            "meta_000042.json",
            "model_000042.pt",
            "optim_000042_rank0.pt",
        ]
        with open(os.path.join(ckpt_dir, "meta_000042.json"), encoding="utf-8") as f:
            assert json.load(f)["step"] == 42

    def test_nonzero_rank_saves_only_its_optimizer_shard(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        save_checkpoint(ckpt_dir, 10, make_model_data(), make_optimizer_data(10), make_meta(10), rank=1)

        assert os.listdir(ckpt_dir) == ["optim_000010_rank1.pt"]

    def test_load_without_optimizer(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        save_checkpoint(ckpt_dir, 10, make_model_data(), make_optimizer_data(10), make_meta(10))

        _, optim, _ = load_checkpoint(ckpt_dir, 10, device="cpu", load_optimizer=False)
        assert optim is None

    def test_missing_optimizer_shard_returns_none(self, tmp_path):
        # Resuming with a different world size: rank 1's shard doesn't exist.
        ckpt_dir = str(tmp_path / "d8")
        save_checkpoint(ckpt_dir, 10, make_model_data(), make_optimizer_data(10), make_meta(10), rank=0)

        _, optim, _ = load_checkpoint(ckpt_dir, 10, device="cpu", load_optimizer=True, rank=1)
        assert optim is None


class TestStepResolution:
    def test_step_none_resolves_to_latest(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        for step in (500, 1500, 1000):
            save_checkpoint(ckpt_dir, step, make_model_data(), make_optimizer_data(step), make_meta(step))

        _, optim, meta = load_checkpoint(ckpt_dir, None, device="cpu", load_optimizer=True)
        assert meta["step"] == 1500
        assert optim["state"][0]["step"] == 1500
        assert find_last_step(ckpt_dir) == 1500

    def test_find_last_step_no_checkpoints(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            find_last_step(str(tmp_path))


class TestFindLargestModel:
    def test_picks_largest_depth(self, tmp_path):
        for tag in ("d8", "d12", "d20"):
            (tmp_path / tag).mkdir()
        # Lexicographic sorting would pick "d8"; depth ordering must pick d20.
        assert find_largest_model(str(tmp_path)) == "d20"

    def test_no_models(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            find_largest_model(str(tmp_path))


@pytest.mark.slow
class TestStage1Checkpoints:
    """The real Stage 1 checkpoints must remain loadable (binary compatibility)."""

    @pytest.mark.parametrize("subdir,tag", [("base_checkpoints", "d8"), ("chatsft_checkpoints", "d8")])
    def test_load_stage1(self, subdir, tag):
        ckpt_dir = os.path.join(os.path.expanduser("~"), ".cache", "nanochat", subdir, tag)
        if not os.path.isdir(ckpt_dir):
            pytest.skip(f"Stage 1 checkpoint not present: {ckpt_dir}")

        model_data, optim_data, meta = load_checkpoint(ckpt_dir, None, device="cpu", load_optimizer=True)
        assert meta["step"] == find_last_step(ckpt_dir)
        assert model_data["transformer.wte.weight"].shape == (
            meta["model_config"]["vocab_size"], meta["model_config"]["n_embd"]
        )
        assert set(optim_data.keys()) == {"state", "param_groups"}


class TestPruneCheckpoints:
    """Retention: --checkpoint-every is crash-resilience, not an archive (866 MB/step)."""

    def _save_steps(self, ckpt_dir, steps, rank=0):
        for step in steps:
            save_checkpoint(ckpt_dir, step, make_model_data(),
                            make_optimizer_data(step), make_meta(step), rank=rank)

    def _steps_on_disk(self, ckpt_dir):
        return sorted(int(f.split("_")[-1].split(".")[0])
                      for f in os.listdir(ckpt_dir) if f.startswith("model_"))

    def test_keeps_only_the_newest(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        self._save_steps(ckpt_dir, [100, 200, 300, 400, 500])
        prune_checkpoints(ckpt_dir, keep_last=2)
        assert self._steps_on_disk(ckpt_dir) == [400, 500]

    def test_removes_all_three_files_per_step(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        self._save_steps(ckpt_dir, [100, 200])
        prune_checkpoints(ckpt_dir, keep_last=1)
        assert sorted(os.listdir(ckpt_dir)) == [
            "meta_000200.json", "model_000200.pt", "optim_000200_rank0.pt",
        ]

    def test_survivor_still_loads(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        self._save_steps(ckpt_dir, [100, 200, 300])
        prune_checkpoints(ckpt_dir, keep_last=1)
        assert find_last_step(ckpt_dir) == 300
        _, optim, meta = load_checkpoint(ckpt_dir, None, device="cpu", load_optimizer=True)
        assert meta["step"] == 300 and optim is not None

    def test_keep_last_zero_disables(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        self._save_steps(ckpt_dir, [100, 200, 300])
        prune_checkpoints(ckpt_dir, keep_last=0)
        assert self._steps_on_disk(ckpt_dir) == [100, 200, 300]

    def test_keep_last_exceeding_count_is_a_noop(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        self._save_steps(ckpt_dir, [100, 200])
        prune_checkpoints(ckpt_dir, keep_last=10)
        assert self._steps_on_disk(ckpt_dir) == [100, 200]

    def test_nonzero_rank_prunes_only_its_own_optimizer_shard(self, tmp_path):
        # Mirrors save_checkpoint's rank split: rank 0 owns model + meta, each rank
        # owns optim_*_rank{r}.pt. A non-zero rank must not delete shared files.
        ckpt_dir = str(tmp_path / "d8")
        self._save_steps(ckpt_dir, [100, 200], rank=0)
        self._save_steps(ckpt_dir, [100, 200], rank=1)
        prune_checkpoints(ckpt_dir, keep_last=1, rank=1)
        assert self._steps_on_disk(ckpt_dir) == [100, 200]        # rank 0's files untouched
        assert not os.path.exists(os.path.join(ckpt_dir, "optim_000100_rank1.pt"))
        assert os.path.exists(os.path.join(ckpt_dir, "optim_000100_rank0.pt"))

    def test_tolerates_a_missing_optimizer_shard(self, tmp_path):
        # A crash between the model save and the optimizer save leaves a partial step.
        ckpt_dir = str(tmp_path / "d8")
        self._save_steps(ckpt_dir, [100, 200])
        os.remove(os.path.join(ckpt_dir, "optim_000100_rank0.pt"))
        prune_checkpoints(ckpt_dir, keep_last=1)
        assert self._steps_on_disk(ckpt_dir) == [200]

    def test_empty_dir_is_a_noop(self, tmp_path):
        ckpt_dir = str(tmp_path / "d8")
        os.makedirs(ckpt_dir)
        prune_checkpoints(ckpt_dir, keep_last=3)
        assert os.listdir(ckpt_dir) == []
