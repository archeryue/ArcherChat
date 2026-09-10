"""
Final pretrain comparison (TECH_PLAN step 7): evaluate several d8 checkpoints through
ONE code path with ONE eval config, so the only thing that differs is the weights.

Why this exists rather than just diffing the training logs: nanochat's d8 run used
--eval-tokens=4194304 (128 batches at 16x2048) and ArcherChat's used 10485760 (320
batches). Both take the LEADING batches of the val split, so the 128-batch estimate is
a strict prefix of the 320-batch one — they are different estimators of val bpb and
differ by a systematic offset that has nothing to do with training. Comparing raw log
numbers across the two therefore mixes an eval-harness artifact into the very gap the
Stage 2 gate is trying to measure.

This script re-evaluates every checkpoint at BOTH batch counts, which both removes the
confound and quantifies it.

Usage:
    python scripts/oracle_final_compare.py
    python scripts/oracle_final_compare.py --batches 128 320 --device-batch-size 16
"""

import argparse
import json
import os

import torch

from archerchat.checkpoint import build_model, find_last_step
from archerchat.dataloader import get_token_bytes, make_pretrain_dataloader
from archerchat.loss import evaluate_bpb

BASE = os.path.expanduser("~/.cache/nanochat/base_checkpoints")

# (label, checkpoint dir, what it is)
DEFAULT_TARGETS = [
    ("nanochat-d8 (oracle)", os.path.join(BASE, "d8"),
     "Stage 1 baseline, trained by upstream nanochat"),
    ("archerchat-d8 v1", os.path.join(BASE, "d8_archer"),
     "eager Muon — known not to match"),
    ("archerchat-d8 v2", os.path.join(BASE, "d8_archer_v2"),
     "torch.compile'd Muon — the candidate"),
]

# STAGE1.md: nanochat-d8 final pretrain val_bpb, and the TECH_PLAN comparison band.
ORACLE_VAL_BPB = 0.9376
BAND = 0.01


def parse_args():
    p = argparse.ArgumentParser(description="Head-to-head final val_bpb at d8")
    p.add_argument("--batches", type=int, nargs="+", default=[128, 320],
                   help="Eval batch counts to measure at (128 = nanochat's "
                        "--eval-tokens=4194304, 320 = ArcherChat's 10485760)")
    p.add_argument("--device-batch-size", type=int, default=16)
    p.add_argument("--sequence-len", type=int, default=2048)
    return p.parse_args()


def main():
    args = parse_args()
    device = torch.device("cuda")
    B, T = args.device_batch_size, args.sequence_len
    token_bytes = get_token_bytes(device=device)

    rows = []
    for label, ckpt_dir, note in DEFAULT_TARGETS:
        if not os.path.isdir(ckpt_dir):
            print(f"skip {label}: {ckpt_dir} not found")
            continue
        step = find_last_step(ckpt_dir)
        meta_path = os.path.join(ckpt_dir, f"meta_{step:06d}.json")
        recorded = json.load(open(meta_path)).get("val_bpb")
        model, tok, _ = build_model(ckpt_dir, step=None, device=device, phase="eval")

        measured = {}
        for n in args.batches:
            # Rebuilt per measurement so every checkpoint sees the identical leading
            # batches of the val split (the loader is deterministic from a cold start).
            loader = make_pretrain_dataloader(tok, B, T, split="val", device=device)
            measured[n] = evaluate_bpb(model, loader, n, token_bytes)
        rows.append((label, step, recorded, measured, note))
        del model
        torch.cuda.empty_cache()

    width = max(len(r[0]) for r in rows)
    hdr = f"{'checkpoint':<{width}}  {'step':>5}  {'logged':>7}"
    for n in args.batches:
        hdr += f"  {f'{n}b':>8}"
    hdr += "   note"
    print("\n" + hdr)
    print("-" * len(hdr))
    for label, step, recorded, measured, note in rows:
        line = f"{label:<{width}}  {step:>5}  "
        line += f"{recorded:>7.4f}" if recorded is not None else f"{'—':>7}"
        for n in args.batches:
            line += f"  {measured[n]:>8.4f}"
        line += f"   {note}"
        print(line)

    # The gate: v2 vs the oracle, measured at the same batch count.
    by_label = {r[0]: r[3] for r in rows}
    if "nanochat-d8 (oracle)" in by_label and "archerchat-d8 v2" in by_label:
        print()
        for n in args.batches:
            o = by_label["nanochat-d8 (oracle)"][n]
            v = by_label["archerchat-d8 v2"][n]
            d = v - o
            verdict = "PASS ✅" if abs(d) <= BAND else "OUTSIDE BAND ⚠️"
            print(f"  @{n} batches ({n * B * T / 1e6:.1f}M tokens):  "
                  f"oracle {o:.4f}  archer-v2 {v:.4f}  Δ {d:+.4f}  "
                  f"(band ±{BAND})  {verdict}")
        if len(args.batches) > 1:
            a, b = args.batches[0], args.batches[-1]
            o = by_label["nanochat-d8 (oracle)"]
            print(f"\n  eval-size artifact: the same oracle weights read "
                  f"{o[a]:.4f} @{a}b vs {o[b]:.4f} @{b}b "
                  f"(Δ {o[b] - o[a]:+.4f}) — this is the offset that makes raw "
                  f"cross-log comparison misleading.")


if __name__ == "__main__":
    main()
