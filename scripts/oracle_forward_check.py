"""
Forward-equivalence gate (TECH_PLAN step 1): load Stage-1 nanochat d8 weights into
BOTH nanochat.gpt.GPT and archerchat.model.GPT, run the same batch through both,
compare logits. ArcherChat renames attn.c_proj->c_o and block.mlp->ffn, so the
nanochat state_dict keys are remapped for the ArcherChat side only.

Runs in the native COMPUTE_DTYPE (bf16 on this GPU): if the two implementations do
the same ops, logits should be (near-)identical and argmax must agree 100%.
"""
import os
import sys
import json

import torch

sys.path.append(os.path.expanduser("~/nanochat"))  # append: don't shadow archerchat

from nanochat.gpt import GPT as NanoGPT, GPTConfig as NanoConfig
from archerchat.model import GPT as ArcherGPT, GPTConfig as ArcherConfig
from archerchat.common import COMPUTE_DTYPE

CKPT = os.path.expanduser("~/.cache/nanochat/base_checkpoints/d8")
device = torch.device("cuda")
print(f"device={device}  COMPUTE_DTYPE={COMPUTE_DTYPE}")

# ---- load config + weights ---------------------------------------------------
with open(os.path.join(CKPT, "meta_001920.json")) as f:
    cfg_kwargs = json.load(f)["model_config"]
print("config:", cfg_kwargs)
state = torch.load(os.path.join(CKPT, "model_001920.pt"), map_location=device, weights_only=False)


def build(gpt_cls, cfg_cls, sd):
    with torch.device("meta"):
        model = gpt_cls(cfg_cls(**cfg_kwargs))
    model.to_empty(device=device)
    model.init_weights()             # materialize non-persistent rotary buffers
    model.load_state_dict(sd, strict=True, assign=True)
    model.eval()
    return model


def remap_to_archer(sd):
    out = {}
    for k, v in sd.items():
        k = k.replace(".attn.c_proj.", ".attn.c_o.")   # attn output projection
        k = k.replace(".mlp.", ".ffn.")                # MLP submodule
        out[k] = v
    return out


nano = build(NanoGPT, NanoConfig, state)
archer = build(ArcherGPT, ArcherConfig, remap_to_archer(state))
print("both models loaded (strict=True) ✓")

# ---- compare forward logits --------------------------------------------------
torch.manual_seed(1234)
B, T = 2, 128
idx = torch.randint(0, cfg_kwargs["vocab_size"], (B, T), device=device)

with torch.inference_mode():
    ln = nano(idx)      # (B, T, V) fp32 (softcapped)
    la = archer(idx)

assert ln.shape == la.shape, (ln.shape, la.shape)
diff = (ln.float() - la.float()).abs()
argmax_match = (ln.argmax(-1) == la.argmax(-1)).float().mean().item()
# top-1 logit rank correlation proxy: fraction of positions with identical top token
print(f"logits shape={tuple(la.shape)}")
print(f"max |Δlogit| = {diff.max().item():.6f}")
print(f"mean |Δlogit| = {diff.mean().item():.6f}")
print(f"argmax agreement = {argmax_match*100:.3f}%")

# CE loss on random targets (both should agree closely)
tgt = torch.randint(0, cfg_kwargs["vocab_size"], (B, T), device=device)
with torch.inference_mode():
    l_nano = nano(idx, tgt).item()
    l_archer = archer(idx, tgt).item()
print(f"CE loss nano={l_nano:.6f}  archer={l_archer:.6f}  |Δ|={abs(l_nano-l_archer):.2e}")

ok = argmax_match == 1.0 and diff.max().item() < 0.05
print("\nORACLE FORWARD-EQUIVALENCE:", "PASS ✅" if ok else "CHECK ⚠️")
