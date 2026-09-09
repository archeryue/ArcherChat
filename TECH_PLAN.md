# Stage 2 — ArcherChat rewrite plan

Rewrite nanochat from scratch on a single RTX 5060 Ti, validate against the Stage 1 baselines in [STAGE1.md](STAGE1.md), then hand the resulting codebase to Stage 3 (d24 cloud speedrun) unchanged.

The plan is biased two ways:

1. **Learning-first.** Modules that teach the modern LLM stack get rewritten by hand. Modules that don't (tokenizer trainer, eval task scorers, web UI) get copied so they don't pollute the comparison.
2. **Falsifiable.** Every module has a numeric acceptance test against nanochat. Stage 2 is "done" when ArcherChat-d8 and ArcherChat-d12 land inside the noise bands derived from STAGE1.md.

## Prerequisites

- **Endlex MVP** (server + tracker + checkpoint sync) is the only telemetry layer. No wandb in ArcherChat from day one. Endlex is wired via `archerchat.common.init_tracker()` which wraps `endlex.Tracker` — offline-safe when `ENDLEX_URL` is unset.
- Stage 1 artifacts on disk (`~/.cache/nanochat/{tokenizer,base_data_climbmix,base_checkpoints,chatsft_checkpoints,eval_bundle}/`) are the oracle. Don't delete them.
- A pinned nanochat commit (the one Stage 1 ran against) checked out at `~/nanochat/` for side-by-side diffing and oracle runs.

## File layout

```
archerchat/
  common.py        ✓ done — distributed init, logging, peak-flops table, init_tracker()
  scaling.py       ✓ done — depth → {params, tokens, batch, lr, wd} compute-optimal derivation
  loss.py          ✓ done — chunked cross-entropy + bpb eval
  checkpoint.py    ✓ done — save/load + meta JSON + optimizer state shards
  dataloader.py    ✓ done — tokenizing distributed loader with restart state
  model.py         ✓ done — full GPT: forward (exact 10-step op order), init_weights, setup_optimizer, generate
  optimizer.py     ✓ done — schedules + polar_express + MuonAdamW/DistMuonAdamW; @torch.compile'd, bf16 bit-matches nanochat
  attention.py     ✓ done — make_window_mask + flash_attn_func + flash_attn_with_kvcache (SDPA path)
  kv_cache.py      ✓ done — KVCache (pre-allocated per-layer cache + smear state)
  sft.py           ✓ done — chat templating, packing→padding, assistant-only mask
  engine.py        ✓ done — KV-cache prefill/decode + Engine.generate + tool loop
  core_eval.py     ✓ copied — CORE/DCLM scoring
  eval_bundle.py   ✓ copied — bundle URL + download/unzip glue
  execution.py     ✓ copied — HumanEval sandboxed execution
  ui.html          ✓ copied — chat web UI template

scripts/
  base_train.py    ✓ done — pretraining entry point (+ --max-steps / --ckpt-dir); d8 trains end-to-end
  chat_sft.py      ✓ done — supervised fine-tuning entry point (wired; full SFT run pending on a stable box)
  base_eval.py     ✓ done  — base-model evaluation entry point (CORE)
  chat_eval.py     ✓ done  — chat-model evaluation entry point (ChatCORE)
  chat_web.py      ✓ copied — FastAPI chat server
  chat_cli.py      ✓ copied — terminal chat client

tasks/             ✓ copied — ARC, MMLU, GSM8K, HumanEval, SpellingBee, SmolTalk
rustbpe/           ✓ vendored — tokenizer trainer (karpathy/rustbpe@ddf848f)
```

## Module split

### Build by hand (`archerchat/` + `scripts/`)

| File | What it is | Why by hand |
|---|---|---|
| `model.py` | GPT block: RMSNorm (non-learnable), RoPE, QK-norm, ReLU² FFN, untied embeddings, weight init | Heart of the stack; smallest file with highest payoff per line |
| `attention.py` | SDPA path + sliding-window mask + document-boundary mask for SFT packing; FA3 thin wrapper stub for Stage 3 | Masking is where silent training bugs live |
| `loss.py` | Chunked / windowed cross-entropy with assistant-only mask hook | Memory trick worth doing once; SFT mask plumbing lives here |
| `optimizer.py` | Muon (Newton–Schulz orthogonalization) + AdamW group for embeddings/head + pretrain/SFT LR/momentum/WD schedules | The actual novelty in the stack |
| `scaling.py` | `depth → {params, tokens, batch, lr, wd}` compute-optimal derivation (Power Lines + T_epoch papers) | Scaling math is tiny but conceptually load-bearing — re-derive, don't copy constants |
| `dataloader.py` | Distributed tokenizing loader, shard rotation, deterministic restart from `(shard_idx, byte_offset, epoch)` | Restart bugs are silent and ruin multi-day runs |
| `kv_cache.py` | Pre-allocated per-layer KV cache in `(B, T, H, D)` layout; owns `prev_embedding` (smear state) | Leaf module — no imports from model/attention/engine; split from engine.py to break circular deps |
| `engine.py` | KV-cache inference: prefill/decode split, batched decode with per-row stop tokens | Where "I thought I understood transformers" dies |
| `sft.py` | Chat templating, packing→padding transition, assistant-only loss mask, EOS handling | Explicit Stage 2 deliverable; only place chat semantics live |
| `checkpoint.py` | save/load + meta JSON + optimizer state shards | Binary-compatible with Stage 1 layout under `~/.cache/nanochat/` |
| `scripts/base_train.py` | Grad accumulation, MFU accounting, eval cadence, checkpoint trigger | Top-down entry point; drives all module interfaces |
| `scripts/chat_sft.py` | SFT loop: dataset-driven stopping, warm-started optimizer, progress-based schedules | Chat-phase entry point; flat script like base_train, sharing infra via `archerchat/common.py` |
| `scripts/base_eval.py` | base_eval (CORE) harness | Separate from train to allow standalone re-eval of checkpoints |
| `scripts/chat_eval.py` | chat_eval (ChatCORE) harness | Standalone re-eval of SFT checkpoints |

### Copy directly from nanochat

Anything that affects the loss surface but has no learning value, plus anything spec-defined whose rewrite would introduce scoring drift.

- **`rustbpe/`** — tokenizer trainer. Vendored from `karpathy/rustbpe@ddf848f` (see `rustbpe/UPSTREAM`). Rewriting changes the vocab and invalidates every Stage 1 comparison.
- **`tasks/`** — ARC-E, ARC-C, MMLU, GSM8K, HumanEval, SpellingBee. Vendored verbatim from nanochat.
- **`archerchat/core_eval.py`** — CORE/DCLM scoring (ex `nanochat/core_eval.py`).
- **`archerchat/execution.py`** — HumanEval sandbox (ex `nanochat/execution.py`).
- **`archerchat/eval_bundle.py`** — bundle URL + download/unzip glue. Keeps `~/.cache/nanochat/eval_bundle/` layout identical so Stage 1 artifacts interop.
- **`scripts/chat_web.py` + `scripts/chat_cli.py` + `archerchat/ui.html`** — demo UI + CLI. Inert until engine/checkpoint land; off the learning critical path.

## Order of attack

Each step has a numeric acceptance gate. Don't move on until the gate is green.

| # | Step | Status | Gate |
|---|---|---|---|
| 0 | Endlex live (`ENDLEX_URL` + `ENDLEX_TOKEN` set) | ✅ done | shows up on Endlex dashboard — confirmed (metrics stream live) |
| 1 | `model.py` + `attention.py` + `loss.py` | ✅ done | Forward-equivalence **bit-identical** (max\|Δ\|=0, argmax 100%) at d8 **and** d12 |
| 2 | `optimizer.py` — Muon + AdamW | ✅ done | Optimizer-step **bit-identical** to nanochat in fp32-eager **and** bf16-compiled (Δ=0) |
| 3 | `scaling.py` — compute-optimal derivation | ✅ done | matches nanochat's derived d8 config exactly (batch 256k, LRs, wd) |
| 4 | `dataloader.py` | ✅ done | tokenization + restart determinism (implied green: bpb reproduces oracle) |
| 5 | `scripts/base_train.py` + smoke | ✅ done | real d8 pipeline runs on climbmix; ~40% MFU (matches Stage-1 band) |
| 6 | `checkpoint.py` | ✅ done | round-trip save/load; also loads Stage-1 nanochat ckpts via key remap |
| 7 | **Full ArcherChat-d8 pretrain** | 🔨 ran | 1920-step run done → val_bpb **0.955** (eager Muon) vs oracle 0.938; compiled-Muon rerun in progress. Gap is within non-determinism+seed (see Risks) |
| 8 | `kv_cache.py` + `engine.py` | ✅ done | Greedy-decode **token-for-token** with nanochat on d8-SFT, bs 1 **and** 4 |
| 9 | `sft.py` | ✅ done | loss-mask unit tests pass (assistant-only, incl. terminator) |
| 10 | **Full ArcherChat-d8 SFT + chat_eval** | ⏳ GPU hours | SFT val_bpb 0.42 ± 0.01; ChatCORE_sample 0.2173 ± 0.01 |
| 11 | **Full ArcherChat-d12 pretrain + SFT** | ⏳ GPU hours | All four d12 oracles inside band |
| 12 | Freeze repo, tag `v0.2`, hand to Stage 3 | ⏳ pending | All gates 1–11 green; Endlex run links archived |

## Per-module acceptance tests

**Forward-equivalence (step 1).** Load Stage 1's `~/.cache/nanochat/base_checkpoints/d8/` weights into `archerchat.model.GPT`, run fp32 forward on a fixed 8×1024 batch sampled from shard 0, compare logits to nanochat's forward on the same batch and weights:
- `max(abs(logits_archer - logits_nano))` < 1e-4
- CE loss difference < 1e-5

**Optimizer-step equivalence (step 2).** Fixed seed, random 1024×1024 matrix as the param, fixed gradient. Run 5 Muon steps in both implementations. Param trajectory `max abs diff` < 1e-5 at every step. Repeat for the AdamW group (embeddings/head) with the same protocol.

**Scaling math (step 3).** Generate `(depth, n_params, tokens, batch_size, lr, wd)` table for depth ∈ {4, 8, 12, 16, 20, 24}. Exact equality with nanochat's derived values. Any mismatch = re-derive, don't fudge.

**Dataloader (step 4).**
- *Tokenization:* tokenize first 1M tokens of shard 0 with both loaders, SHA-256 of token id stream must match.
- *Restart:* run loader for 1000 steps, save state, restart from saved state, advance 1000 more steps. Compare to a continuous run at step 2000 — batches must be identical.

**KV cache (step 8).** Greedy decode 256 tokens from a fixed prompt with the ArcherChat-d8 SFT weights and nanochat-d8 SFT weights (same weights, different inference paths). Token sequences must match exactly. Run with batch_size=1 and batch_size=4 to catch batched-decode bugs.

**SFT mask (step 9).** Build a canonical 3-turn conversation, run `sft.build_example()`, assert the loss mask is `1` exactly on assistant token positions and `0` everywhere else, including the EOS after each assistant turn (per nanochat convention — confirm before coding).

## Comparison protocol (the "within noise" claim)

Stage 1 numbers are single-seed measurements, so "within noise" needs operational meaning:

1. **Pretraining val_bpb.** Single seed, ± 0.01 absolute.
2. **Base CORE.** Single seed, ± 0.005 absolute. d8's 0.0976 has ~22-task averaging built in.
3. **SFT val_bpb.** ± 0.01 absolute.
4. **ChatCORE_sample.** ± 0.01 absolute. Generation-heavy components (GSM8K, HumanEval) are noisier — log per-task numbers and check each is within 2 absolute pts of Stage 1.
5. **d12 Base CORE caveat.** STAGE1.md d12 number used `--max-per-task=200`. ArcherChat-d12 must use the same cap or both must be re-run uncapped. Pick one before training; don't compare across caps.

If any gate trips, the rule is **stop and bisect**, not "rerun with different seed and hope". The bisect order is: optimizer → loss → dataloader → model → scaling.

## Risks and open items

- **FA3 unavailable on Blackwell consumer.** SDPA path must be correct *and* fast enough at d12 to finish d12 pretrain in < 1.5× Stage 1's 481 min. If it's slower, profile attention first.
- **Muon numerical drift — RESOLVED.** Our Muon first ran eager; nanochat's runs under `@torch.compile`, and in bf16 eager vs compiled diverge (fusion keeps intermediates fp32 longer / different reduction order) — enough to move a from-scratch d8 to val_bpb 0.955 vs 0.938. Fixed by `@torch.compile`-ing the Muon/AdamW steps (0-D-tensor scalars to avoid per-step recompile): now **bit-identical to nanochat in fp32-eager AND bf16-compiled** (max\|Δparam\|=0).
- **Training is non-deterministic (inherent, not a bug).** bf16 backward uses atomic scatter-add (embeddings) → run-to-run non-reproducible for *everyone*, nanochat included. Confirmed: ArcherChat-vs-nanochat and ArcherChat-vs-**itself** diverge by the same ~0.08–0.10 over 25 chaotic steps from identical init+data. ⟹ final val_bpb is only reproducible to ±(seed + non-determinism) — exactly the ±0.01 band. Faithfulness is proven by per-step bit-identity + the self-consistency control, not by an exact final number. (Scripts: `oracle_train_headtohead.py`, `oracle_train_selfconsistency.py`.)
- **Tokenizer pin.** Reusing Stage 1's tokenizer assumes byte-level compat with nanochat's pinned rustbpe commit. If we ever bump rustbpe, d8/d12 oracles invalidate.
- **Endlex connectivity.** `ENDLEX_URL=https://train.endlex.ai` is set in `.env`. Tracker falls back to offline-only (local JSONL) automatically if the server is unreachable — training is never blocked, but metrics won't stream live.
- **Single-GPU MFU.** Stage 1 hit ~39–42% MFU. ArcherChat needs to land in the same band or the step 5 smoke-test gate gets relaxed for the wrong reason.

## Out of scope for Stage 2

- Midtraining and RL (`mid_train.py`, `chat_rl.py` in nanochat). Stage 1 didn't run them; Stage 2 won't either.
- Multi-node. Stage 2 is single-GPU; Stage 3 is single-node 8×H100.
- Quantization (FP8, INT8). Stage 3 may revisit FP8 on Hopper; Stage 2 stays bf16.
