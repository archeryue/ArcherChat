"""
Init-equivalence gate. This is the one part of the training path that NO existing gate
covers:

  - oracle_forward_check.py loads Stage-1 weights into BOTH models, so it proves the
    forward math agrees given identical weights. It never runs our init_weights().
  - oracle_optim_check.py drives a fixed param + fixed grad, so it never runs init either.

But init_weights() is what every from-scratch run actually starts from. Both repos call
torch.manual_seed(42) in compute_init() (nanochat/common.py:185, archerchat/common.py:181),
so if the two implementations draw from the RNG in the SAME ORDER with the SAME shapes and
distributions, the initial weights must come out BIT-IDENTICAL. Any reordering, any extra
or missing draw, and they diverge — statistically equivalent but a different starting
point, which shows up only as a small unexplained gap in the final loss.

Usage:
    python scripts/oracle_init_check.py            # d8
    python scripts/oracle_init_check.py 12         # d12
"""

import os
import sys

import torch

sys.path.append(os.path.expanduser("~/nanochat"))  # append: don't shadow archerchat

from nanochat.gpt import GPT as NanoGPT, GPTConfig as NanoConfig

from archerchat.common import COMPUTE_DTYPE
from archerchat.model import GPT as ArcherGPT, GPTConfig as ArcherConfig
from archerchat.scaling import get_model_config

depth = int(sys.argv[1]) if len(sys.argv) > 1 else 8
device = torch.device("cuda")
arch = get_model_config(depth)
cfg = dict(
    vocab_size=32768,
    n_layer=arch["n_layers"],
    n_head=arch["n_heads"],
    n_kv_head=arch["n_kv_heads"],
    n_embd=arch["n_embd"],
    sequence_len=2048,
    window_pattern="L",
)
print(f"device={device}  COMPUTE_DTYPE={COMPUTE_DTYPE}  depth={depth}")
print(f"config: {cfg}\n")


def build_init(gpt_cls, cfg_cls):
    # Exactly what compute_init() does before the model is built.
    torch.manual_seed(42)
    torch.cuda.manual_seed(42)
    with torch.device("meta"):
        model = gpt_cls(cfg_cls(**cfg))
    model.to_empty(device=device)
    model.init_weights()
    return model


def to_archer_key(k):
    return k.replace(".attn.c_proj.", ".attn.c_o.").replace(".mlp.", ".ffn.")


nano = build_init(NanoGPT, NanoConfig)
archer = build_init(ArcherGPT, ArcherConfig)

nano_sd = {to_archer_key(k): v for k, v in nano.state_dict().items()}
archer_sd = dict(archer.state_dict())

missing = set(nano_sd) - set(archer_sd)
extra = set(archer_sd) - set(nano_sd)
if missing or extra:
    print(f"KEY MISMATCH  missing_in_archer={sorted(missing)}  extra_in_archer={sorted(extra)}")

worst = []
n_identical = 0
for k in sorted(set(nano_sd) & set(archer_sd)):
    a, b = nano_sd[k].float(), archer_sd[k].float()
    if a.shape != b.shape:
        worst.append((float("inf"), k, f"shape {tuple(a.shape)} vs {tuple(b.shape)}"))
        continue
    d = (a - b).abs().max().item()
    if d == 0.0:
        n_identical += 1
    else:
        worst.append((d, k, f"std {a.std().item():.6f} vs {b.std().item():.6f}"))

total = len(set(nano_sd) & set(archer_sd))
print(f"tensors compared: {total}   bit-identical: {n_identical}   differing: {len(worst)}")
if worst:
    print("\nlargest deviations:")
    for d, k, note in sorted(worst, reverse=True)[:12]:
        print(f"  {d:>12.6e}  {k:<48} {note}")

ok = not worst and not missing and not extra
print("\nINIT-EQUIVALENCE:", "PASS ✅ (identical starting weights)" if ok else "MISMATCH ⚠️")
if ok:
    print("Both runs start from the same point, so any final-loss gap is accumulated "
          "training non-determinism, not a different initialization.")
sys.exit(0 if ok else 1)
