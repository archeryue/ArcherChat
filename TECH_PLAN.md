# Stage 2 — ArcherChat rewrite plan

Rewrite nanochat from scratch on a single RTX 5060 Ti, validate against the Stage 1 baselines in [STAGE1.md](STAGE1.md), then hand the resulting codebase to Stage 3 (d24 cloud speedrun) unchanged.

The plan is biased two ways:

1. **Learning-first.** Modules that teach the modern LLM stack get rewritten by hand. Modules that don't (tokenizer trainer, eval task scorers, web UI) get copied so they don't pollute the comparison.
2. **Falsifiable.** Every module has a numeric acceptance test against nanochat. Stage 2 is "done" when ArcherChat-d8 and ArcherChat-d12 land inside the noise bands derived from STAGE1.md.

## Prerequisites

- **Endlex MVP** (server + tracker + checkpoint sync) is the only telemetry layer. No wandb in ArcherChat from day one. Endlex is wired via `archerchat.common.init_tracker()` which wraps `endlex.Tracker` — offline-safe when `ENDLEX_URL` is unset.
- Stage 1 artifacts on disk (`~/.cache/nanochat/{tokenizer,base_data_climbmix,base_checkpoints,chatsft_checkpoints,eval_bundle}/`) are the oracle. Don't delete them.
- ⚠️ **The d8 corpus is NOT what it was when the d8 oracle ran.** `runs/d8_local.sh` did
  `dataset -n 10` (10 train shards + the pinned val shard); the later d12 run did `-n 18`
  and grew `base_data_climbmix/` to 18 train shards. Because best-fit cropping discards
  ~35% of tokens, d8's 503M-token budget reads ~774M — which *exhausted* the 10-shard
  corpus and wrapped into **epoch 2**, re-training on shards 0-1. With 18 shards present
  a d8 rerun never wraps and trains on all-fresh data instead. Same budget, different
  data, different model. To reproduce the d8 oracle you MUST pin the corpus back to 10
  shards. `dataloader._artifact_dir()` prefers `~/.cache/archerchat/<name>` over the
  Stage-1 dir, so the pin needs no code change:
      mkdir -p ~/.cache/archerchat/base_data_climbmix
      ln -s ~/.cache/nanochat/base_data_climbmix/shard_0000{0..9}.parquet \
            ~/.cache/nanochat/base_data_climbmix/shard_06542.parquet \
            ~/.cache/archerchat/base_data_climbmix/
  d12 is unaffected: `d12_local.sh` used 18 shards, which is exactly what is on disk.
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
  oracle_*.py      ✓ done  — equivalence harnesses (forward/optim/bpb/decode/train +
                              init, dataloader and final-val_bpb head-to-head)
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
| 4 | `dataloader.py` | ✅ done | **measured**: 655,360 tokens identical to nanochat's loader, element for element (`oracle_dataloader_check.py`). Previously only "implied green" |
| 5 | `scripts/base_train.py` + smoke | ✅ done | real d8 pipeline runs on climbmix; ~40% MFU (matches Stage-1 band) |
| 6 | `checkpoint.py` | ✅ done | round-trip save/load; also loads Stage-1 nanochat ckpts via key remap; `--keep-last` retention (final step prunes to 1) |
| 6b | `init_weights()` | ✅ done | **63/63 tensors bit-identical** to nanochat from the same seed (`oracle_init_check.py`). No previous gate covered init — forward/optim gates both load fixed weights |
| 7 | **Full ArcherChat-d8 pretrain** | ✅ **PASS** | v3 (compiled Muon, corpus pinned to the oracle's 10 shards): val_bpb **0.9449** vs **0.9376**, Δ **+0.0073** (±0.01). Base CORE **0.0938** vs **0.0976**, Δ **−0.0038** (±0.005). Final loader cursor identical to the oracle's (`shard 1 / rg 22 / epoch 2`). History: v1 eager-Muon 0.9483 = outside band (fixed by `da488a3`); v2 on the *grown* 18-shard corpus failed CORE at 0.0835 = corpus drift, not code (see Prerequisites) |
| 8 | `kv_cache.py` + `engine.py` | ✅ done | Greedy-decode **token-for-token** with nanochat on d8-SFT, bs 1 **and** 4 |
| 9 | `sft.py` | ✅ done | loss-mask unit tests pass (assistant-only, incl. terminator); `render_for_completion()` added here (nanochat keeps it on the tokenizer — `chat_eval.py` called a method ArcherChat never implemented, so chat_eval could not run at all) |
| 10 | **Full ArcherChat-d8 SFT + chat_eval** | ✅ **PASS** | SFT val_bpb **0.4189** vs **0.4185**, Δ **+0.0004**; terminated at **1942 steps, same as the oracle** (dataset-driven ⟹ mixture/packing/epoch all match independently of the loss). chat_eval: ARC-E 32.66 (−0.17 pts), MMLU 30.19 (+0.34), ARC-C 32.00 (+3.16 = 2.4σ, favourable) ⟹ ChatCORE_cat 0.0882 vs 0.0734. Stage 1's d8 chat_eval died during GSM8K, so only these three are comparable |
| 11 | **Full ArcherChat-d12 pretrain + SFT** | ✅ **PASS** | val_bpb **0.8434** vs **0.842544** (Δ **+0.0009**, whole 2520-step trajectory within ±0.003). Base CORE **0.1535** vs **0.1542** (Δ **−0.0007**). SFT val_bpb **0.3570** vs **0.3562** (Δ **+0.0008**), terminating at **971 steps = the oracle's count**. ChatCORE 0.2300 vs 0.2449 recomputed (Δ −0.0149 = **0.77σ**) — within noise, though the pre-registered ±0.01 band is unachievable at n=200 (see Comparison protocol §4). SpellingBee **199/200 on both sides — exact**. d12 needs no corpus pin, which is why it lands ~8× tighter than d8 |
| 12 | Freeze repo, tag `v0.2`, hand to Stage 3 | ⏳ pending | Gates 1–11 green. Endlex runs: [d12](https://train.endlex.ai/run/archerchat-d12), [d12-sft](https://train.endlex.ai/run/archerchat-d12-sft), [d8-v3](https://train.endlex.ai/run/archerchat-d8-v3), [d8-v3-sft](https://train.endlex.ai/run/archerchat-d8-v3-sft). Results: [STAGE2.md](STAGE2.md) |

## Per-module acceptance tests

**Forward-equivalence (step 1).** Load Stage 1's `~/.cache/nanochat/base_checkpoints/d8/` weights into `archerchat.model.GPT`, run fp32 forward on a fixed 8×1024 batch sampled from shard 0, compare logits to nanochat's forward on the same batch and weights:
- `max(abs(logits_archer - logits_nano))` < 1e-4
- CE loss difference < 1e-5

**Optimizer-step equivalence (step 2).** Fixed seed, random 1024×1024 matrix as the param, fixed gradient. Run 5 Muon steps in both implementations. Param trajectory `max abs diff` < 1e-5 at every step. Repeat for the AdamW group (embeddings/head) with the same protocol.

**Scaling math (step 3).** Generate `(depth, n_params, tokens, batch_size, lr, wd)` table for depth ∈ {4, 8, 12, 16, 20, 24}. Exact equality with nanochat's derived values. Any mismatch = re-derive, don't fudge.

**Dataloader (step 4).** `scripts/oracle_dataloader_check.py` — pull the same batches from
nanochat's loader and ArcherChat's and compare tensors element-wise. Reading the two
implementations is not enough: packing is buffer-sensitive (each row takes the LARGEST
buffered doc that fits), so the batch contents depend on the document stream order, the
refill granularity (`tokenizer_batch_size`) and the buffer high-water mark. A mismatch in
any of them yields a different-but-plausible token stream that trains fine and lands the
model somewhere slightly different, with no other symptom.
- *Restart:* run loader for 1000 steps, save state, restart from saved state, advance 1000 more steps. Compare to a continuous run at step 2000 — batches must be identical.

**Init equivalence (step 6b).** `scripts/oracle_init_check.py` — the one part of the
training path no other gate reaches. `oracle_forward_check.py` and `oracle_optim_check.py`
both operate on fixed loaded weights, so neither ever runs `init_weights()` — which is what
every from-scratch run actually starts from. Both repos call `torch.manual_seed(42)` in
`compute_init()`, so identical RNG draw order ⟹ bit-identical initial weights.

**KV cache (step 8).** Greedy decode 256 tokens from a fixed prompt with the ArcherChat-d8 SFT weights and nanochat-d8 SFT weights (same weights, different inference paths). Token sequences must match exactly. Run with batch_size=1 and batch_size=4 to catch batched-decode bugs.

**SFT mask (step 9).** Build a canonical 3-turn conversation, run `sft.build_example()`, assert the loss mask is `1` exactly on assistant token positions and `0` everywhere else, including the EOS after each assistant turn (per nanochat convention — confirm before coding).

## Comparison protocol (the "within noise" claim)

Stage 1 numbers are single-seed measurements, so "within noise" needs operational meaning:

1. **Pretraining val_bpb.** Single seed, ± 0.01 absolute.
2. **Base CORE.** Single seed, ± 0.005 absolute. d8's 0.0976 has ~22-task averaging built in.
3. **SFT val_bpb.** ± 0.01 absolute.
4. **ChatCORE_sample.** ⚠️ **The original ±0.01 here was mis-specified and is not achievable
   when chat_eval is capped.** Propagating per-task binomial error through the 6-task mean,
   the 1σ spread of the difference between two independent runs at `--max-problems 200` is
   **0.0193** — so ±0.01 is 0.52σ and the real resolution is ±0.0385 (2σ). Use **±0.04 at
   n=200**; only a ±0.01 claim on *uncapped* evals is meaningful, and that is impossible
   against Stage 1's d12 because its own chat_eval was capped at 200. The per-task "within 2
   absolute pts" rule is likewise unusable at n=200, where 1σ is already 1.5–3.4 pts —
   compare in units of σ, not absolute points.
5. **d12 Base CORE caveat.** STAGE1.md d12 number used `--max-per-task=200`. ArcherChat-d12 must use the same cap or both must be re-run uncapped. Pick one before training; don't compare across caps.
6. **Corpus must match, not just the token budget.** Verify the run consumed the *same
   shards the same number of times* by diffing the final checkpoint's loader state
   (`meta_*.json` → `loader_state.epoch` / `shard_idx`) against the oracle's
   (`dataloader_state_dict` → `epoch` / `pq_idx`). The d8 oracle ends at `epoch: 2`; a
   run against the grown 18-shard corpus ends at `epoch: 1` and is a different
   experiment. See Prerequisites.
7. **Eval config must match.** `val_bpb` depends on how many val batches it averages —
   the same oracle weights read 0.9369 @128 batches and 0.9394 @320. nanochat's d8/d12
   runs used `--eval-tokens=4194304` (128 batches at 16x2048); use the same, or compare
   only re-measurements made under one config (`scripts/oracle_final_compare.py`).

If any gate trips, the rule is **stop and bisect**, not "rerun with different seed and hope". The bisect order is: optimizer → loss → dataloader → model → scaling.

## Risks and open items

- **FA3 unavailable on Blackwell consumer.** SDPA path must be correct *and* fast enough at d12 to finish d12 pretrain in < 1.5× Stage 1's 481 min. If it's slower, profile attention first.
- **Muon numerical drift — RESOLVED.** Our Muon first ran eager; nanochat's runs under `@torch.compile`, and in bf16 eager vs compiled diverge (fusion keeps intermediates fp32 longer / different reduction order) — enough to move a from-scratch d8 to val_bpb 0.955 vs 0.938. Fixed by `@torch.compile`-ing the Muon/AdamW steps (0-D-tensor scalars to avoid per-step recompile): now **bit-identical to nanochat in fp32-eager AND bf16-compiled** (max\|Δparam\|=0).
- **Training is non-deterministic (inherent, not a bug).** bf16 backward uses atomic scatter-add (embeddings) → run-to-run non-reproducible for *everyone*, nanochat included. Confirmed: ArcherChat-vs-nanochat and ArcherChat-vs-**itself** diverge by the same ~0.08–0.10 over 25 chaotic steps from identical init+data. ⟹ final val_bpb is only reproducible to ±(seed + non-determinism) — exactly the ±0.01 band. Faithfulness is proven by per-step bit-identity + the self-consistency control, not by an exact final number. (Scripts: `oracle_train_headtohead.py`, `oracle_train_selfconsistency.py`.)
- **Tokenizer pin.** Reusing Stage 1's tokenizer assumes byte-level compat with nanochat's pinned rustbpe commit. If we ever bump rustbpe, d8/d12 oracles invalidate.
- **Corpus pin — RESOLVED for d8, watch for d24.** Downloading more shards for a deeper
  model silently changes what a *shallower* rerun trains on, because the shallow run stops
  wrapping. Diagnosed via a train-vs-val bpb split: the oracle fit its train split 0.038
  better than val (it saw shard 0 twice) while ArcherChat showed no train advantage at all
  (0.9533 vs 0.9530). Any future depth added to this box has the same hazard.
- **Eval harness is exact — the gap was never measurement.** Running ArcherChat's own
  `base_eval` on the *oracle's* weights reproduces nanochat's numbers to 5 decimal places
  (train 0.905818 vs 0.905772, val 0.943396 vs 0.943642), so a metric difference always
  means the model differs, never the harness. Run this control before bisecting.
- **Endlex connectivity.** `ENDLEX_URL=https://train.endlex.ai` is set in `.env`. Tracker falls back to offline-only (local JSONL) automatically if the server is unreachable — training is never blocked, but metrics won't stream live.
- **Single-GPU MFU.** Stage 1 hit ~39–42% MFU. ArcherChat needs to land in the same band or the step 5 smoke-test gate gets relaxed for the wrong reason.

## Out of scope for Stage 2

- Midtraining and RL (`mid_train.py`, `chat_rl.py` in nanochat). Stage 1 didn't run them; Stage 2 won't either.
- Multi-node. Stage 2 is single-GPU; Stage 3 is single-node 8×H100.
- Quantization (FP8, INT8). Stage 3 may revisit FP8 on Hopper; Stage 2 stays bf16.
