"""
Self-consistency control for the train-step head-to-head.

Runs the SAME ArcherChat code TWICE from identical init + identical data, and compares
the loss trajectory. If the two runs diverge by roughly the same amount the ArcherChat-vs-
nanochat head-to-head did (~0.1 over 25 steps), then that divergence is non-determinism
(PyTorch embedding backward uses atomic scatter-add on CUDA — non-reproducible in bf16),
NOT a systematic ArcherChat-vs-nanochat discrepancy.

If instead the two ArcherChat runs stay ~0 (deterministic) while the cross-run diverged,
there IS a real ArcherChat-vs-nanochat difference to hunt down.
"""
import torch

from archerchat.model import GPT, GPTConfig
from archerchat.common import COMPUTE_DTYPE
from archerchat.scaling import compute_scale

dev = torch.device("cuda")
print(f"device={dev}  COMPUTE_DTYPE={COMPUTE_DTYPE}")
CFG = dict(vocab_size=32768, n_layer=8, n_head=4, n_kv_head=4,
           n_embd=512, sequence_len=2048, window_pattern="L")
s = compute_scale(8)


def build():
    with torch.device("meta"):
        m = GPT(GPTConfig(**CFG))
    m.to_empty(device=dev)
    m.init_weights()
    m.train()
    return m


a = build()
b = build()
# identical init: copy a's weights into b
b.load_state_dict(a.state_dict(), strict=True, assign=False)

opt_kw = dict(lr=s["lr"], weight_decay=s["wd"], unembedding_lr=s["unembedding_lr"],
              embedding_lr=s["embedding_lr"], scalar_lr=s["scalar_lr"])
aopt = a.setup_optimizer(**opt_kw)
bopt = b.setup_optimizer(**opt_kw)

torch.manual_seed(0)
B, T, K = 4, 512, 25
batches = [(torch.randint(0, CFG["vocab_size"], (B, T), device=dev),
            torch.randint(0, CFG["vocab_size"], (B, T), device=dev)) for _ in range(K)]

print(f"\n{'step':>4} {'runA_loss':>13} {'runB_loss':>13} {'|dloss|':>10}")
worst = 0.0
for k, (x, y) in enumerate(batches):
    la = a(x, y); aopt.zero_grad(set_to_none=True); la.backward(); aopt.step()
    lb = b(x, y); bopt.zero_grad(set_to_none=True); lb.backward(); bopt.step()
    d = abs(la.item() - lb.item()); worst = max(worst, d)
    if k % 5 == 0 or k == K - 1:
        print(f"{k:>4} {la.item():>13.6f} {lb.item():>13.6f} {d:>10.2e}")

print(f"\nworst |dloss| over {K} steps = {worst:.3e}")
print("SELF-CONSISTENCY:",
      "NON-DETERMINISTIC (same code diverges too -> head-to-head drift is benign)"
      if worst > 1e-3 else "DETERMINISTIC (so the cross-run divergence is a real difference)")
