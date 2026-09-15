"""
DDP-equivalence gate (Stage 3 prerequisite). DistMuonAdamW has never been executed —
every Stage 2 verification ran single-GPU through MuonAdamW, which is the class that was
proven bit-identical to nanochat. The distributed variant is a different code path:
it reduce-scatters gradients, updates a SLICE of each stacked shape-group, and
all-gathers the updated params back. Nothing has ever checked that it lands in the same
place as the single-process optimizer.

The gate: give both optimizers identical parameters and identical gradients, step them
the same number of times, and compare. Every rank is fed the same gradient, so the AVG
reduction is mathematically the identity and DistMuonAdamW must land where MuonAdamW does.

TOLERANCE 1e-5, not exact. Bitwise identity is NOT the right bar for a distributed
reduction: ReduceOp.AVG sums then divides (N*x/N != x in floating point), and a sharded
slice hits different kernels and accumulation orders than the full stack. Observed
deviation is ~1e-8 absolute on params of std ~0.09 — fp32 epsilon. 1e-5 is the same
threshold TECH_PLAN already uses for the single-GPU optimizer-equivalence gate.

WHY THE SHAPE GROUPS MATTER. Muon groups params by shape and shards each group across
ranks, so what gets exercised is K (matrices per group) vs world_size. Three regimes:

    K % ws == 0   even split
    K %% ws != 0   remainder  -- ranks get different counts
    K < ws        ZERO-RANK  -- some ranks own nothing in that group

Real models only reach the interesting ones at particular world sizes:

    d8   K=[4,8,8,32]     ws=4: all even          ws=8: ZERO-RANK
    d12  K=[6,12,12,48]   ws=4: remainder         ws=8: ZERO-RANK + 2x remainder
    d24  K=[12,24,24,96]  ws=4: all even          ws=8: remainder

Coverage therefore does NOT require 8 GPUs -- it requires the right K. --n-layer sets K
directly (K = 4*n_layer attention, n_layer per MLP shape, n_layer/2 ve_gates), so at
world_size=4:

    --n-layer 12  -> K=[6,12,12,48]  remainder
    --n-layer 6   -> K=[3,6,6,24]    ZERO-RANK + remainder  (== d12 at ws=8)
    --n-layer 3   -> K=[2,3,3,12]    ZERO-RANK on three groups

Run all three on a 4-GPU box and you have covered what an 8-GPU box would show.

REQUIRES NCCL — i.e. real GPUs, one per rank. gloo implements the collectives themselves
(reduce_scatter_tensor, all_gather_into_tensor, even ReduceOp.AVG all work), but NOT the
async_op=True + .get_future() pattern DistMuonAdamW is built on:

    RuntimeError: Work::getFuture not implemented.

So this gate cannot be faked on CPU. It has to run on a multi-GPU box, and it should run
at world_size=8 to reach the uneven-shard path described above.

Usage:
    python scripts/oracle_ddp_check.py --world-size 4 --n-layer 12
    python scripts/oracle_ddp_check.py --world-size 4 --n-layer 6   # == d12 at ws=8
    python scripts/oracle_ddp_check.py --world-size 4 --n-layer 3
"""

from __future__ import annotations

import argparse
import os

import torch
import torch.distributed as dist
import torch.multiprocessing as mp

SEED = 1234
STEPS = 5


def build_model(device, n_layer=12):
    """Small model whose Muon shape-groups mirror d12/d24's K values.

    n_layer=12 with n_head=1 gives K=48 attention matrices, K=12 per MLP shape and K=6
    ve_gates — i.e. groups that are uneven at ws=8, which is the whole point.
    """
    from archerchat.model import GPT, GPTConfig
    torch.manual_seed(SEED)
    cfg = GPTConfig(vocab_size=512, n_layer=n_layer, n_head=1, n_kv_head=1,
                    n_embd=128, sequence_len=128, window_pattern="L")
    with torch.device("meta"):
        model = GPT(cfg)
    model.to_empty(device=device)
    model.init_weights()
    return model


def fixed_grads(model, device):
    """Same gradient on every rank, so ReduceOp.AVG is the identity."""
    g = torch.Generator(device="cpu").manual_seed(99)
    for p in model.parameters():
        p.grad = torch.randn(p.shape, generator=g, dtype=torch.float32).to(device=device, dtype=p.dtype) * 0.01


def worker(rank, world_size, backend, result_path, n_layer):
    os.environ.setdefault("MASTER_ADDR", "127.0.0.1")
    os.environ.setdefault("MASTER_PORT", "29577")
    device = torch.device("cpu") if backend == "gloo" else torch.device(f"cuda:{rank}")
    if backend == "nccl":
        torch.cuda.set_device(device)
    dist.init_process_group(backend, rank=rank, world_size=world_size)

    from archerchat.optimizer import MuonAdamW, DistMuonAdamW

    # --- distributed side -------------------------------------------------------
    model = build_model(device, n_layer)
    groups = model.setup_optimizer(lr=0.02, weight_decay=0.1)   # picks Dist* under dist
    assert isinstance(groups, DistMuonAdamW), f"expected DistMuonAdamW, got {type(groups).__name__}"
    for _ in range(STEPS):
        fixed_grads(model, device)
        groups.step()
    dist_params = {n: p.detach().float().cpu().clone() for n, p in model.named_parameters()}

    if rank == 0:
        # --- single-process reference (the class verified against nanochat) ------
        dist.destroy_process_group()   # so setup_optimizer() now yields plain MuonAdamW
        ref = build_model(device, n_layer)
        opt = ref.setup_optimizer(lr=0.02, weight_decay=0.1)
        assert isinstance(opt, MuonAdamW), f"expected MuonAdamW, got {type(opt).__name__}"
        for _ in range(STEPS):
            fixed_grads(ref, device)
            opt.step()
        ref_params = {n: p.detach().float().cpu().clone() for n, p in ref.named_parameters()}
        deltas = sorted(((ref_params[n] - dist_params[n]).abs().max().item(), n)
                        for n in ref_params)
        torch.save({"deltas": deltas, "n": len(ref_params)}, result_path)
    else:
        dist.destroy_process_group()


def main():
    p = argparse.ArgumentParser(description="DistMuonAdamW vs MuonAdamW equivalence")
    p.add_argument("--world-size", type=int, default=4)
    p.add_argument("--n-layer", type=int, default=12,
                   help="sets K per shape group; see module docstring for the ws=4 recipe")
    p.add_argument("--backend", type=str, default="nccl", choices=["gloo", "nccl"])
    args = p.parse_args()

    out = "/tmp/_archerchat_ddp_gate.pt"
    if os.path.exists(out):
        os.remove(out)
    print(f"DistMuonAdamW vs MuonAdamW | backend={args.backend} world_size={args.world_size} "
          f"n_layer={args.n_layer} steps={STEPS}")
    mp.spawn(worker, args=(args.world_size, args.backend, out, args.n_layer), nprocs=args.world_size, join=True)

    TOL = 1e-5
    res = torch.load(out, weights_only=False)
    deltas = res["deltas"]
    worst_d, worst_n = max(deltas)
    n_exact = sum(1 for d, _ in deltas if d == 0.0)
    over = [(d, n) for d, n in deltas if d > TOL]
    print(f"  tensors={res['n']}  bit-identical={n_exact}  "
          f"max|Δ|={worst_d:.3e} ({worst_n})  tol={TOL:.0e}")
    if not over:
        print(f"\nDDP-EQUIVALENCE: PASS ✅  DistMuonAdamW matches MuonAdamW to "
              f"{worst_d:.1e} at world_size={args.world_size} (fp32 epsilon).")
        return 0
    print(f"\nDDP-EQUIVALENCE: FAIL ⚠️  {len(over)}/{res['n']} tensors exceed {TOL:.0e}")
    for d, n in sorted(over, reverse=True)[:12]:
        print(f"  {d:>12.6e}  {n}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
