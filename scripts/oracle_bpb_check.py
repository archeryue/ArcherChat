"""
bpb-eval sanity (partial TECH_PLAN step 7): load the Stage-1 d8 *base* oracle weights
and run our evaluate_bpb over the real climbmix val split. Should reproduce the value
recorded in the checkpoint meta (val_bpb = 0.9376), confirming loss.py + dataloader +
model agree with the oracle metric on real data.
"""
import os
import json

import torch

from archerchat.checkpoint import build_model
from archerchat.dataloader import get_token_bytes, make_pretrain_dataloader
from archerchat.loss import evaluate_bpb

CKPT = os.path.expanduser("~/.cache/nanochat/base_checkpoints/d8")
device = torch.device("cuda")

recorded = json.load(open(os.path.join(CKPT, "meta_001920.json")))["val_bpb"]
model, tok, meta = build_model(CKPT, step=None, device=device, phase="eval")
token_bytes = get_token_bytes(device=device)

B, T, steps = 16, 2048, 120  # ~3.9M val tokens — enough for a tight bpb estimate
val_loader = make_pretrain_dataloader(tok, B, T, split="val", device=device)
bpb = evaluate_bpb(model, val_loader, steps, token_bytes)

print(f"recorded val_bpb (full eval) = {recorded:.4f}")
print(f"our evaluate_bpb ({steps} batches, {B*T*steps/1e6:.1f}M tokens) = {bpb:.4f}")
print(f"|Δ| = {abs(bpb - recorded):.4f}")
print("BPB EVAL:", "PASS ✅" if abs(bpb - recorded) < 0.02 else "CHECK ⚠️")
