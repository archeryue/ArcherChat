#!/usr/bin/env python3
"""
ArcherChat chat-model evaluation entry point (nanochat chat_eval.py).

Scores an SFT checkpoint on the ChatCORE metric. Loads the model with
archerchat.checkpoint.build_model and drives generation through
archerchat.engine (the same inference path chat_cli.py / chat_web.py use).

Base-model evaluation (CORE) lives in scripts/base_eval.py.

    python scripts/chat_eval.py --depth 8
"""

# TODO(stage 2, TECH_PLAN step): implement the ChatCORE harness.
