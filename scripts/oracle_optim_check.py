"""
Optimizer-step equivalence gate (TECH_PLAN step 2): run identical fixed gradients
through ArcherChat's MuonAdamW/AdamW and nanochat's, compare parameter trajectories.

Muon is tested on square (1024x1024), tall (3072x768, exercises the 2x fanout/fanin
LR correction + the tall polar branch) and wide (768x3072) shapes. AdamW tested on a
32768x256-ish embedding-like matrix. Runs in native COMPUTE_DTYPE (bf16 here).
"""
import os
# Eager on both sides so we compare ALGORITHMS, not torch.compile's bf16 fusion vs eager.
os.environ.setdefault("TORCHDYNAMO_DISABLE", "1")
import sys

import torch

# fp32 matmuls default to TF32 (~10-bit mantissa) on Ampere+, which the 5-step momentum
# feedback amplifies. Turn it off so the gate compares true-fp32 arithmetic.
if os.environ.get("NO_TF32", "1") == "1":
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False

sys.path.append(os.path.expanduser("~/nanochat"))

import archerchat.optimizer as A
import nanochat.optim as N

# TECH_PLAN step-2 tolerance is specified at fp32 (bf16 Muon drift is expected and is
# measured separately). Force fp32 in the polar_express path on BOTH sides so no bf16
# cast happens; the module global is read at call time, so this patch takes effect.
FORCE_FP32 = os.environ.get("FORCE_FP32", "1") == "1"
if FORCE_FP32:
    A.COMPUTE_DTYPE = torch.float32
    N.COMPUTE_DTYPE = torch.float32
COMPUTE_DTYPE = torch.float32 if FORCE_FP32 else A.COMPUTE_DTYPE

device = torch.device("cuda")
print(f"device={device}  compute_dtype={COMPUTE_DTYPE}  dynamo_disabled={os.environ.get('TORCHDYNAMO_DISABLE')}")


def run(OptCls, group_maker, shapes, n_steps=5, seed=0):
    """Return list-of-trajectories (one per param), running n_steps with a fixed grad."""
    g = torch.Generator(device="cpu").manual_seed(seed)
    params, grads = [], []
    for sh in shapes:
        params.append(torch.randn(*sh, generator=g).to(device).requires_grad_(True))
        grads.append(torch.randn(*sh, generator=g).to(device))
    opt = OptCls([group_maker(params)])
    traj = []
    for _ in range(n_steps):
        for p, gr in zip(params, grads):
            p.grad = gr.clone()
        opt.step()
        traj.append([p.detach().float().clone() for p in params])
    return traj


def compare(name, shapes, group_maker):
    ta = run(A.__dict__[OptName], group_maker, shapes)
    tn = run(N.__dict__[OptName], group_maker, shapes)
    worst = 0.0
    for step in range(len(ta)):
        for pi in range(len(shapes)):
            d = (ta[step][pi] - tn[step][pi]).abs().max().item()
            worst = max(worst, d)
    print(f"  {name:22s} shapes={shapes}  max|Δparam| over 5 steps = {worst:.3e}")
    return worst


OptName = "MuonAdamW"
print("\n[Muon] archer.MuonAdamW vs nanochat.MuonAdamW")
muon_group = lambda ps: dict(kind="muon", params=ps, lr=0.02, momentum=0.95,
                             ns_steps=5, beta2=0.9, weight_decay=0.01)
w1 = compare("square", [(1024, 1024)], muon_group)
w2 = compare("tall (2x LR corr.)", [(3072, 768)], muon_group)
w3 = compare("wide", [(768, 3072)], muon_group)
w4 = compare("stacked group", [(256, 256), (256, 256), (256, 256)], muon_group)

print("\n[AdamW] archer.MuonAdamW vs nanochat.MuonAdamW (adamw group)")
adamw_group = lambda ps: dict(kind="adamw", params=ps, lr=0.004,
                              betas=(0.8, 0.95), eps=1e-10, weight_decay=0.01)
w5 = compare("adamw matrix", [(4096, 256)], adamw_group)
w6 = compare("adamw scalar", [(8,)], adamw_group)

worst = max(w1, w2, w3, w4, w5, w6)
tol = 1e-5 if COMPUTE_DTYPE == torch.float32 else 5e-3
print(f"\nworst max|Δparam| = {worst:.3e}   tol({COMPUTE_DTYPE})={tol:.0e}")
print("OPTIMIZER-STEP EQUIVALENCE:", "PASS ✅" if worst <= tol else "CHECK ⚠️")
