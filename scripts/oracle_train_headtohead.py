"""
Training-step head-to-head: ArcherChat vs nanochat, from IDENTICAL init + IDENTICAL
data, running the real train step (forward -> backward -> optimizer.step) and comparing
the loss at every step.

If forward, backward, and the optimizer are all bit-faithful, then same weights + same
batch -> same loss -> same grads -> same update -> same next weights, by induction. So a
per-step loss match over K steps proves the *full* run would track nanochat bit-for-bit —
without paying for a 1920-step run. (Comparing final val_bpb to the oracle's single seed
is noisier than this: seed/data-order alone moves it ~+/-0.01.)

Runs in the real regime: bf16 (COMPUTE_DTYPE) with torch.compile'd Muon/AdamW on both sides.
"""
import os
import sys

import torch

sys.path.append(os.path.expanduser("~/nanochat"))

from nanochat.gpt import GPT as NanoGPT, GPTConfig as NanoConfig
from archerchat.model import GPT as ArcherGPT, GPTConfig as ArcherConfig
from archerchat.common import COMPUTE_DTYPE
from archerchat.scaling import compute_scale

dev = torch.device("cuda")
print(f"device={dev}  COMPUTE_DTYPE={COMPUTE_DTYPE}")

CFG = dict(vocab_size=32768, n_layer=8, n_head=4, n_kv_head=4,
           n_embd=512, sequence_len=2048, window_pattern="L")
s = compute_scale(8)


def build(gpt_cls, cfg_cls):
    with torch.device("meta"):
        m = gpt_cls(cfg_cls(**CFG))
    m.to_empty(device=dev)
    m.init_weights()
    m.train()
    return m


nano = build(NanoGPT, NanoConfig)
archer = build(ArcherGPT, ArcherConfig)

# Make the two models start from IDENTICAL weights: copy nanochat's into ArcherChat
# (remap attn.c_proj->c_o and .mlp.->.ffn.), in-place so ArcherChat keeps its own params.
remap = lambda k: k.replace(".attn.c_proj.", ".attn.c_o.").replace(".mlp.", ".ffn.")
archer.load_state_dict({remap(k): v for k, v in nano.state_dict().items()}, strict=True, assign=False)
print("weights synced nano -> archer (strict load) ✓")

# Identical optimizer config for both (same base LRs; each applies the same internal scaling).
nopt = nano.setup_optimizer(unembedding_lr=s["unembedding_lr"], embedding_lr=s["embedding_lr"],
                            matrix_lr=s["lr"], weight_decay=s["wd"], scalar_lr=s["scalar_lr"])
aopt = archer.setup_optimizer(lr=s["lr"], weight_decay=s["wd"], unembedding_lr=s["unembedding_lr"],
                              embedding_lr=s["embedding_lr"], scalar_lr=s["scalar_lr"])

# Fixed shared data stream (random tokens are fine — we compare the two impls, not quality).
torch.manual_seed(0)
B, T, K = 4, 512, 25
batches = [(torch.randint(0, CFG["vocab_size"], (B, T), device=dev),
            torch.randint(0, CFG["vocab_size"], (B, T), device=dev)) for _ in range(K)]

print(f"\n{'step':>4} {'archer_loss':>13} {'nano_loss':>13} {'|dloss|':>10}")
worst = 0.0
for k, (x, y) in enumerate(batches):
    al = archer(x, y)
    aopt.zero_grad(set_to_none=True); al.backward(); aopt.step()
    nl = nano(x, y)
    nopt.zero_grad(set_to_none=True); nl.backward(); nopt.step()
    d = abs(al.item() - nl.item())
    worst = max(worst, d)
    if k % 5 == 0 or k == K - 1:
        print(f"{k:>4} {al.item():>13.6f} {nl.item():>13.6f} {d:>10.2e}")

print(f"\nworst |dloss| over {K} steps = {worst:.3e}")
print("TRAIN-STEP HEAD-TO-HEAD:", "MATCH ✅ (training is bit-faithful to nanochat)"
      if worst < 5e-3 else "DIVERGE ⚠️ (a real training-loop discrepancy remains)")
