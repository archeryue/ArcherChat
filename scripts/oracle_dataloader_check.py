"""
Dataloader-equivalence gate (TECH_PLAN step 4). This gate was previously marked
"implied green: bpb reproduces oracle" — which is not the same thing. bpb reproducing
only shows the loader yields *reasonable* data, not the *same* data in the *same order*.

The packing is buffer-sensitive: each row is filled by picking the LARGEST buffered doc
that still fits, so the batch contents depend on exactly which documents sit in the
1000-doc buffer at that moment. That in turn depends on the document stream order, the
refill granularity (tokenizer_batch_size) and the buffer high-water mark. A mismatch in
any of them yields a different-but-plausible token stream, trains fine, and lands the
model somewhere slightly different — exactly the signature of a small one-sided val_bpb
gap with no other symptom.

So: pull the same batches from nanochat's loader and ArcherChat's, and compare the
tensors element-wise.

Usage:
    python scripts/oracle_dataloader_check.py                # 20 batches, train split
    python scripts/oracle_dataloader_check.py --batches 5 --split val
"""

import argparse
import hashlib
import os
import sys

import torch

sys.path.append(os.path.expanduser("~/nanochat"))  # append: don't shadow archerchat

from nanochat.dataloader import tokenizing_distributed_data_loader_with_state_bos_bestfit as nano_loader
from nanochat.tokenizer import get_tokenizer as nano_get_tokenizer

from archerchat.dataloader import get_tokenizer as archer_get_tokenizer
from archerchat.dataloader import make_pretrain_dataloader


def sha(t: torch.Tensor) -> str:
    return hashlib.sha256(t.cpu().numpy().tobytes()).hexdigest()[:16]


def parse_args():
    p = argparse.ArgumentParser(description="nanochat vs ArcherChat dataloader equality")
    p.add_argument("--batches", type=int, default=20)
    p.add_argument("--split", type=str, default="train", choices=["train", "val"])
    p.add_argument("--device-batch-size", type=int, default=16)
    p.add_argument("--sequence-len", type=int, default=2048)
    return p.parse_args()


def main():
    args = parse_args()
    B, T = args.device_batch_size, args.sequence_len

    # Each side uses its OWN tokenizer, so this exercises the full data path
    # (tokenization + streaming + packing), not just the packer.
    nano_tok = nano_get_tokenizer()
    archer_tok = archer_get_tokenizer()

    nano = nano_loader(nano_tok, B, T, split=args.split, device="cpu")
    archer = make_pretrain_dataloader(archer_tok, B, T, split=args.split, device="cpu")

    print(f"comparing {args.batches} batches, split={args.split}, B={B} T={T}\n")
    print(f"{'batch':>5}  {'nanochat x':>16}  {'archerchat x':>16}  {'match':>6}  {'tok Δ':>7}")
    print("-" * 62)

    all_match = True
    total_mismatched = 0
    for i in range(args.batches):
        nx, ny, _ = next(nano)
        ax, ay, _ = next(archer)
        x_eq = torch.equal(nx, ax)
        y_eq = torch.equal(ny, ay)
        match = x_eq and y_eq
        ndiff = int((nx != ax).sum().item()) if nx.shape == ax.shape else -1
        total_mismatched += max(ndiff, 0)
        all_match &= match
        print(f"{i:>5}  {sha(nx):>16}  {sha(ax):>16}  "
              f"{'OK' if match else 'DIFF':>6}  {ndiff:>7}")

    print()
    if all_match:
        n_tok = args.batches * B * T
        print(f"DATALOADER: PASS ✅  {n_tok:,} tokens identical, element for element.")
        print("The training data stream is not a source of the val_bpb gap.")
    else:
        print(f"DATALOADER: MISMATCH ⚠️  {total_mismatched:,} differing token positions.")
        print("The two runs did NOT train on the same data — this is a real bug, "
              "and it would fully explain a small one-sided val_bpb gap.")
    return 0 if all_match else 1


if __name__ == "__main__":
    sys.exit(main())
