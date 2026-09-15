"""
FA3-vs-SDPA agreement gate (run this on the H100 box, in Phase 4).

We do not write the FA3 kernel — it is external CUDA from the flash-attention-3 hub repo,
the same one nanochat imports. We cannot change it. But we do not have to trust it blindly
either, because we own a reference implementation that is already proven correct:
`scripts/oracle_window_check.py` shows the SDPA path is bit-identical to nanochat on `L`,
`SSSL` and `SSL`.

So the SDPA path becomes FA3's oracle. Same weights, same inputs, both backends, compare.

This is worth a minute of H100 time because a silent disagreement here is catastrophic and
invisible: attention that is subtly wrong still trains, still decreases the loss, and just
converges somewhere else. The specific hazard the wrapper guards against —
FA3 takes `(q, k_cache, v_cache, k=, v=)` while our call site passes
`(q, k, v, k_cache, v_cache)` — does not raise if mis-ordered, it computes garbage.

Expect agreement, not identity. FA3 and SDPA use different accumulation orders and tile
schedules, so bf16 outputs differ at roughly bf16 epsilon. The meaningful bar is argmax
agreement on the logits: if the model would pick a different token, something is wrong.

Usage (on Hopper):
    python scripts/oracle_attn_backend_check.py
    python scripts/oracle_attn_backend_check.py --patterns L,SSSL --seq-len 2048
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import subprocess
import sys

import torch

# Each backend must be selected at IMPORT time, so the two runs happen in separate
# subprocesses and exchange logits through a file.
_CHILD = "--_child" in sys.argv


def _run_one(ckpt, pattern, seq_len, backend, out_path):
    env = dict(os.environ, ARCHERCHAT_ATTN=backend)
    cmd = [sys.executable, __file__, "--_child", ckpt, pattern, str(seq_len), out_path]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{backend} child failed:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")
    return r.stdout.strip().splitlines()[-1]


def child():
    ckpt, pattern, seq_len, out_path = sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
    from archerchat.attention import ATTN_BACKEND
    from archerchat.model import GPT, GPTConfig
    cfg = json.load(open(glob.glob(os.path.join(ckpt, "meta_*.json"))[0]))["model_config"]
    cfg = dict(cfg); cfg["window_pattern"] = pattern
    sd = torch.load(glob.glob(os.path.join(ckpt, "model_*.pt"))[0], map_location="cuda",
                    weights_only=False)
    sd = {k.replace(".attn.c_proj.", ".attn.c_o.").replace(".mlp.", ".ffn."): v
          for k, v in sd.items()}
    dev = torch.device("cuda")
    with torch.device("meta"):
        m = GPT(GPTConfig(**cfg))
    m.to_empty(device=dev); m.init_weights()
    m.load_state_dict(sd, strict=True, assign=True); m.eval()
    torch.manual_seed(1234)                       # identical input in both children
    idx = torch.randint(0, cfg["vocab_size"], (2, seq_len), device=dev)
    with torch.inference_mode():
        logits = m(idx)
    torch.save(logits.float().cpu(), out_path)
    print(ATTN_BACKEND)


def main():
    p = argparse.ArgumentParser(description="FA3 vs the verified SDPA reference")
    p.add_argument("ckpt", nargs="?",
                   default=os.path.expanduser("~/.cache/nanochat/base_checkpoints/d8"))
    p.add_argument("--patterns", default="L,SSSL")
    p.add_argument("--seq-len", type=int, default=1024)
    p.add_argument("--tol", type=float, default=2e-2, help="bf16-scale logit tolerance")
    args = p.parse_args()

    from archerchat.attention import _load_fa3
    fa3, why = _load_fa3()
    if fa3 is None:
        print(f"SKIP: FA3 unavailable here — {why}")
        print("This gate only means something on Hopper. Run it in Phase 4 on the H100 box.")
        return 0

    ok = True
    for pattern in args.patterns.split(","):
        a, b = "/tmp/_attn_fa3.pt", "/tmp/_attn_sdpa.pt"
        n1 = _run_one(args.ckpt, pattern, args.seq_len, "fa3", a)
        n2 = _run_one(args.ckpt, pattern, args.seq_len, "sdpa", b)
        la, lb = torch.load(a, weights_only=True), torch.load(b, weights_only=True)
        d = (la - lb).abs().max().item()
        agree = (la.argmax(-1) == lb.argmax(-1)).float().mean().item()
        good = agree == 1.0 and d < args.tol
        ok &= good
        print(f"{pattern:<6} [{n1}] vs [{n2}]")
        print(f"       max|Δlogit|={d:.3e}  argmax agreement={agree*100:.3f}%  "
              f"-> {'PASS' if good else 'FAIL'}")

    print("\nFA3-vs-SDPA AGREEMENT:", "PASS ✅" if ok else "FAIL ⚠️")
    if not ok:
        print("Do NOT start the d24 run. The SDPA path is the one proven bit-identical to\n"
              "nanochat, so a disagreement means the FA3 wiring is wrong — most likely the\n"
              "(q, k, v, k_cache, v_cache) -> (q, k_cache, v_cache, k=, v=) re-ordering.")
    return 0 if ok else 1


if __name__ == "__main__":
    if _CHILD:
        child()
    else:
        raise SystemExit(main())
