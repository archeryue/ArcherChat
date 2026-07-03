"""Tests for archerchat/common.py (the only fully-implemented module so far).

The per-module acceptance-gate tests from TECH_PLAN.md land here as their
modules get implemented (test_scaling.py for gate 3, test_optimizer.py for
gate 2, etc.).
"""

import math

from archerchat.common import get_peak_flops


class TestGetPeakFlops:
    def test_stage1_gpu(self):
        # The Stage 1 / Stage 2 box; MFU comparisons depend on this value.
        assert get_peak_flops("NVIDIA GeForce RTX 5060 Ti") == 94.9e12

    def test_stage3_gpu(self):
        assert get_peak_flops("NVIDIA H100 80GB HBM3") == 989e12
        assert get_peak_flops("NVIDIA H100 PCIe") == 756e12

    def test_l40_not_shadowed_by_l4(self):
        # "l4" is a substring of "l40"/"l40s"; table order must keep the
        # more specific entries first.
        assert get_peak_flops("NVIDIA L40S") == 362e12
        assert get_peak_flops("NVIDIA L40") == 181.05e12
        assert get_peak_flops("NVIDIA L4") == 121e12

    def test_unknown_gpu_returns_inf(self):
        # Unknown hardware must yield MFU=0, not a wrong guess.
        assert math.isinf(get_peak_flops("Imaginary GPU 9000"))
