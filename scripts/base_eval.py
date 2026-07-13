#!/usr/bin/env python3
"""
ArcherChat base-model evaluation entry point (nanochat base_eval.py).

Scores a pretrained checkpoint on the CORE metric (DCLM task suite). Loads the
model with archerchat.checkpoint.build_model, ensures the eval bundle is present
via archerchat.eval_bundle.ensure_eval_bundle(), and runs
archerchat.core_eval.evaluate_task over each task.

Chat-model evaluation (ChatCORE) lives in scripts/chat_eval.py.

    python scripts/base_eval.py --depth 8
"""

# TODO(stage 2, TECH_PLAN step): implement the CORE harness.
