"""
Local smoke test for the freshly-implemented ML core (not a pytest — run directly).

Exercises, on the real GPU in COMPUTE_DTYPE:
  1. meta-construct → to_empty → init_weights
  2. forward pass (loss finite)
  3. setup_optimizer + 20 training steps on a fixed batch (loss must drop)
  4. Engine KV-cache generation (prefill + decode) at num_samples=1 and 4, greedy
  5. model.generate() reference path (no KV cache)
"""
import torch

from archerchat.common import COMPUTE_DTYPE
from archerchat.model import GPT, GPTConfig
from archerchat.engine import Engine

torch.manual_seed(0)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"device={device}  COMPUTE_DTYPE={COMPUTE_DTYPE}")

# Small but real d4 model.
cfg = GPTConfig(vocab_size=32768, n_layer=4, n_head=2, n_kv_head=2, n_embd=256,
                sequence_len=512, window_pattern="SSSL")
with torch.device("meta"):
    model = GPT(cfg)
model.to_empty(device=device)
model.init_weights()
n = sum(p.numel() for p in model.parameters())
print(f"model built: {n/1e6:.1f}M params, windows={model.window_sizes}")

# ---- 1) forward pass ---------------------------------------------------------
B, T = 4, 64
idx = torch.randint(0, cfg.vocab_size, (B, T), device=device)
targets = torch.randint(0, cfg.vocab_size, (B, T), device=device)
loss0 = model(idx, targets)
print(f"[forward] loss={loss0.item():.4f}  finite={torch.isfinite(loss0).item()}  "
      f"(random-init baseline ~ln(vocab)={torch.log(torch.tensor(float(cfg.vocab_size))):.3f})")
assert torch.isfinite(loss0).item()

# logits path (no targets)
with torch.no_grad():
    logits = model(idx)
print(f"[forward] logits shape={tuple(logits.shape)} dtype={logits.dtype} "
      f"finite={torch.isfinite(logits).all().item()}")
assert logits.shape == (B, T, cfg.vocab_size)

# ---- 2) optimizer + training steps ------------------------------------------
opt = model.setup_optimizer(lr=0.02, weight_decay=0.0)
print(f"[optim] {len(opt.param_groups)} groups "
      f"({sum(g['kind']=='muon' for g in opt.param_groups)} muon / "
      f"{sum(g['kind']=='adamw' for g in opt.param_groups)} adamw)")
losses = []
for step in range(20):
    loss = model(idx, targets)          # overfit one fixed batch
    opt.zero_grad(set_to_none=True)
    loss.backward()
    opt.step()
    losses.append(loss.item())
print(f"[train] loss {losses[0]:.4f} -> {losses[-1]:.4f}  (steps: "
      + " ".join(f"{l:.2f}" for l in losses[::4]) + ")")
assert losses[-1] < losses[0], "loss did not decrease — optimizer/backward broken"
assert all(torch.isfinite(torch.tensor(l)) for l in losses), "non-finite loss during training"

# ---- 3) Engine KV-cache generation ------------------------------------------
class FakeTok:
    _S = {"<|python_start|>": 30001, "<|python_end|>": 30002, "<|output_start|>": 30003,
          "<|output_end|>": 30004, "<|assistant_end|>": 30005}
    def encode_special(self, s): return self._S[s]
    def get_bos_token_id(self): return 0
    def encode(self, s): return [1]
    def decode(self, ids): return ""

model.eval()
engine = Engine(model, FakeTok())
prompt = [5, 10, 42, 100, 7]
for ns in (1, 4):
    results, masks = engine.generate_batch(prompt, num_samples=ns, max_tokens=16, temperature=0.0)
    print(f"[engine] num_samples={ns}: {len(results)} rows, "
          f"row0 len={len(results[0])} (prompt {len(prompt)} + gen), "
          f"first gen tokens={results[0][len(prompt):len(prompt)+6]}")
    assert len(results) == ns
    assert results[0][:len(prompt)] == prompt  # prompt included

# batch_size=1 vs the first row of batch_size=4 must match token-for-token at greedy
r1, _ = engine.generate_batch(prompt, num_samples=1, max_tokens=16, temperature=0.0)
r4, _ = engine.generate_batch(prompt, num_samples=4, max_tokens=16, temperature=0.0)
print(f"[engine] greedy bs1 == bs4[row0]: {r1[0] == r4[0]}")
assert r1[0] == r4[0], "batched decode diverges from single-row decode at greedy"

# ---- 4) model.generate() reference path (no KV cache) -----------------------
gen = list(model.generate(prompt, max_tokens=8, temperature=0.0))
print(f"[model.generate] greedy tokens={gen}")
assert len(gen) == 8

print("\nSMOKE TEST PASSED ✅")
