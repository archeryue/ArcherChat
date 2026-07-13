"""Acceptance gate 3 (TECH_PLAN.md): archerchat/scaling.py vs the nanochat oracle.

Every expected number below is transcribed from nanochat's own run logs
(nanochat/runs/d8_local.log, d12_local.log) — the "Parameter counts" block and
the auto-computed batch size / LR scale / weight decay / iteration lines.

compute_scale() and get_d12_reference_tokens() are NOT exercised here: they build
a GPT on the meta device and archerchat/model.py is still a stub. Everything below
the parameter count is pure arithmetic, so we feed the oracle's own scaling_params
in directly and check the derivation end-to-end.
"""

import pytest

from archerchat.scaling import (
    B_REF,
    BASE_MATRIX_LR,
    TARGET_RATIO,
    get_batch_lr_scale,
    get_model_config,
    get_optimal_batch_size,
    get_scaled_weight_decay,
    get_token_budget,
)

# scaling_params = transformer_matrices + lm_head (nanochat base_train.py)
D8_SCALING_PARAMS = 25_166_016 + 16_777_216   # = 41,943,232
D12_SCALING_PARAMS = 84_935_088 + 25_165_824  # = 110,100,912
D_REF = TARGET_RATIO * D12_SCALING_PARAMS     # = 1,321,210,944


class TestGetModelConfig:
    @pytest.mark.parametrize("depth, n_embd, n_heads", [
        (4, 256, 2), (8, 512, 4), (12, 768, 6), (16, 1024, 8), (20, 1280, 10), (24, 1536, 12),
    ])
    def test_arch_from_depth(self, depth, n_embd, n_heads):
        cfg = get_model_config(depth)
        assert cfg["n_layers"] == depth
        assert cfg["n_embd"] == n_embd
        assert cfg["n_heads"] == n_heads
        assert cfg["n_kv_heads"] == n_heads  # full MHA, no GQA reduction

    def test_width_rounds_up_to_head_dim(self):
        # depth=4 → 4*64 = 256 already lands on a 128 boundary; depth=3 → 192 → 256.
        assert get_model_config(3)["n_embd"] == 256


class TestTokenBudget:
    def test_d12_reference_horizon(self):
        assert get_token_budget(D12_SCALING_PARAMS) == 1_321_210_944

    def test_d8(self):
        assert get_token_budget(D8_SCALING_PARAMS) == 503_318_784


class TestOptimalBatchSize:
    def test_d12_reproduces_b_ref(self):
        # The reference depth must land back on the empirically tuned B_REF.
        n_tokens = get_token_budget(D12_SCALING_PARAMS)
        assert get_optimal_batch_size(n_tokens, D_REF) == 524_288 == B_REF

    def test_d8(self):
        n_tokens = get_token_budget(D8_SCALING_PARAMS)
        assert get_optimal_batch_size(n_tokens, D_REF) == 262_144  # 2**18


class TestBatchLRScale:
    def test_d12_is_unity(self):
        assert get_batch_lr_scale(524_288) == 1.0

    def test_d8_is_sqrt_half(self):
        assert get_batch_lr_scale(262_144) == pytest.approx(0.7071, abs=5e-5)

    def test_matrix_lr_at_d8(self):
        assert BASE_MATRIX_LR * get_batch_lr_scale(262_144) == pytest.approx(0.014142, abs=1e-6)


class TestScaledWeightDecay:
    def test_d12_stays_at_base(self):
        # nanochat prints no "Scaling weight decay" line for d12 — it stays 0.28.
        n_tokens = get_token_budget(D12_SCALING_PARAMS)
        assert get_scaled_weight_decay(524_288, n_tokens, D_REF) == pytest.approx(0.28)

    def test_d8(self):
        n_tokens = get_token_budget(D8_SCALING_PARAMS)
        wd = get_scaled_weight_decay(262_144, n_tokens, D_REF)
        assert wd == pytest.approx(0.519723, abs=1e-6)


class TestTrainingHorizon:
    """num_iterations lives in base_train.py (n_tokens // batch_size), but the
    oracle logs pin it, so the derivation is checked here."""

    @pytest.mark.parametrize("scaling_params, batch_size, iters, total_tokens", [
        (D8_SCALING_PARAMS, 262_144, 1_920, 503_316_480),
        (D12_SCALING_PARAMS, 524_288, 2_520, 1_321_205_760),
    ])
    def test_num_iterations(self, scaling_params, batch_size, iters, total_tokens):
        n_tokens = get_token_budget(scaling_params)
        num_iterations = n_tokens // batch_size
        assert num_iterations == iters
        assert num_iterations * batch_size == total_tokens
        # "Tokens : Scaling params ratio: 12.00" in both logs.
        assert total_tokens / scaling_params == pytest.approx(12.0, abs=5e-3)
