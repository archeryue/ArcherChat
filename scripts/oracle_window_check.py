"""
Sliding-window-equivalence gate (Stage 3 prerequisite).

`--window-pattern` has been **L** in every run this project has ever done — Stage 1's
d8/d12 oracles and every Stage 2 run. But nanochat's 8xH100 speedrun does not pass the
flag at all, so d24 will train with the default **SSSL**: three sliding layers of 512
tokens then one full layer, tiled, with the last layer always forced to full.

That means the entire sliding-window path — `attention.make_window_mask()`, the
`window_sizes` table, the short-window arithmetic — is unexercised code on the critical
path of the most expensive run in the project.

This is INDEPENDENT of FA3. FA3 is a kernel question (Hopper-only, SM 90); the mask is a
correctness question and can be checked anywhere, including on consumer Blackwell through
the SDPA shim. Getting it wrong trains d24 with the wrong receptive field and voids the
run no matter which kernel is underneath.

Checks, per pattern:
  1. the window_sizes TABLE matches nanochat's exactly (short window, tiling, forced-full
     last layer)
  2. forward logits match on identical weights

Note the test sequence must be LONGER than the short window, or `make_window_mask` takes
its `window >= Tq` fast path and returns None — testing nothing.

Usage:
    python scripts/oracle_window_check.py
    python scripts/oracle_window_check.py ~/.cache/nanochat/base_checkpoints/d12 --patterns L,SSSL,SSL
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import torch

sys.path.append(os.path.expanduser("~/nanochat"))  # append: don't shadow archerchat

from nanochat.gpt import GPT as NanoGPT, GPTConfig as NanoCfg

from archerchat.model import GPT as ArcherGPT, GPTConfig as ArcherCfg

TOL = 1e-4  # same bar as the step-1 forward-equivalence gate


def remap(sd):
    return {k.replace(".attn.c_proj.", ".attn.c_o.").replace(".mlp.", ".ffn."): v
            for k, v in sd.items()}


def main():
    p = argparse.ArgumentParser(description="sliding-window equivalence vs nanochat")
    p.add_argument("ckpt", nargs="?",
                   default=os.path.expanduser("~/.cache/nanochat/base_checkpoints/d8"))
    p.add_argument("--patterns", default="L,SSSL,SSL")
    p.add_argument("--seq-len", type=int, default=1024,
                   help="must exceed the short window (512) or the mask fast-path hides bugs")
    args = p.parse_args()

    cfg = json.load(open(glob.glob(os.path.join(args.ckpt, "meta_*.json"))[0]))["model_config"]
    state = torch.load(glob.glob(os.path.join(args.ckpt, "model_*.pt"))[0],
                       map_location="cuda", weights_only=False)
    dev = torch.device("cuda")
    assert args.seq_len > 512, "seq_len must exceed the short window or nothing is tested"

    def build(cls, ccls, sd, wp):
        c = dict(cfg); c["window_pattern"] = wp
        with torch.device("meta"):
            m = cls(ccls(**c))
        m.to_empty(device=dev); m.init_weights()
        m.load_state_dict(sd, strict=True, assign=True); m.eval()
        return m

    torch.manual_seed(7)
    idx = torch.randint(0, cfg["vocab_size"], (2, args.seq_len), device=dev)
    ok = True
    for wp in args.patterns.split(","):
        nano = build(NanoGPT, NanoCfg, state, wp)
        archer = build(ArcherGPT, ArcherCfg, remap(state), wp)
        same_table = nano.window_sizes == archer.window_sizes
        with torch.inference_mode():
            ln, la = nano(idx), archer(idx)
        d = (ln.float() - la.float()).abs().max().item()
        agree = (ln.argmax(-1) == la.argmax(-1)).float().mean().item()
        good = same_table and d < TOL and agree == 1.0
        ok &= good
        print(f"{wp:<6} windows={archer.window_sizes}")
        print(f"       table_match={same_table}  max|Δ|={d:.3e}  argmax={agree*100:.3f}%  "
              f"-> {'PASS' if good else 'FAIL'}")
        del nano, archer
        torch.cuda.empty_cache()

    print("\nSLIDING-WINDOW EQUIVALENCE:", "PASS ✅" if ok else "FAIL ⚠️")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
