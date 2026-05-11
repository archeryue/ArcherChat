# Stage 1 — Local nanochat baselines

Goal: validate that the full nanochat pipeline (tokenizer → pretraining → base eval → SFT → chat eval) runs end-to-end on a single RTX 5060 Ti (16 GiB, Blackwell consumer, SM 12.0), and produce reference numbers at two depths (d8, d12) that ArcherChat will be compared against in Stage 2.

## Hardware

- Single NVIDIA RTX 5060 Ti, 16,311 MiB VRAM, driver 591.86, SM 12.0
- ~95 TFLOPS dense bf16 (estimated from NVIDIA's "759 AI TOPS" sparse-INT8 / 8)
- WSL2 (Linux 6.6) on Windows
- No FA3 (Hopper-only), no FP8 (Hopper-targeted in upstream nanochat)
- Single GPU → trainer auto-uses gradient accumulation, no `torchrun`

## Code changes vs upstream nanochat

1. **`nanochat/common.py`** — added `["5060", "ti"], 94.9e12` to the `get_peak_flops` consumer-RTX table so the MFU column logs a real number instead of 0.00. (Patch applied mid-run after pretraining started; took effect for base_eval/SFT/chat_eval.)
2. **`runs/d8_local.sh`** — new file. Single-GPU adaptation of `runs/speedrun.sh`. No `torchrun`, `--window-pattern=L`, no `--fp8`, `--device-batch-size=16`, 10 dataset shards.
3. **`runs/d12_local.sh`** — sibling of d8 script. `--depth=12`, `--device-batch-size=8` (safer for 16 GiB at the larger model), 18 dataset shards, `--max-per-task=200` on base_eval and `--max-problems=200` on chat_eval (since GSM8K generation is the bottleneck on single GPU).

## d8 run

| | Value |
|---|---|
| Pretraining time | 76.7 min |
| Pretraining peak VRAM | 8.2 GiB |
| Total tokens | 503 M |
| Final pretrain val_bpb | 0.938 |
| **Base CORE** (DCLM, 22 tasks, full) | **0.0976** |
| SFT time | 78.6 min |
| Final SFT val_bpb | 0.4185 |
| **ChatCORE** (sample / categorical) | **0.2173 / 0.0734** |
| ARC-Easy | 32.83% |
| ARC-Challenge | 28.84% |
| MMLU | 29.85% |
| GSM8K / HumanEval / SpellingBee | not measured (chat_eval killed during GSM8K) |
| Throughput | ~106K tok/s @ ~39% MFU |
| Wall-clock (full pipeline) | ~5 h |

CORE eval was full (default `--max-per-task=-1`), which alone took ~2 h. That's why chat_eval was capped on the d12 run.

## d12 run

| | Value |
|---|---|
| Pretraining time | 481 min (8 h 1 min) |
| Pretraining peak VRAM | 9.4 GiB (measured during full run; mid-training watcher saw transient 10.7 GiB during compile) |
| Total tokens | 1.32 B |
| Final pretrain val_bpb | 0.842 |
| **Base CORE** (capped 200/task) | **0.1542** |
| SFT time | 182 min (3 h 2 min) |
| Final SFT val_bpb | 0.356 |
| **ChatCORE** (sample / categorical) | **0.2578 / 0.1128** |
| ARC-Easy | 38.00% |
| ARC-Challenge | 29.00% |
| MMLU | 32.50% |
| GSM8K | 5.00% (10/200) |
| HumanEval | 9.76% (16/164) |
| SpellingBee | 99.50% (199/200) |
| Throughput | ~45K tok/s @ ~42% MFU |
| Wall-clock (full pipeline) | ~12.5 h |

## d8 vs d12 head-to-head

| Metric | d8 | d12 | Δ |
|---|---|---|---|
| Min val_bpb (pretrain) | 0.938 | **0.842** | -10% |
| Base CORE | 0.0976 | **0.1542** | **+58%** |
| Min val_bpb (SFT) | 0.4185 | **0.3562** | -15% |
| ChatCORE (sample) | 0.2173 | **0.2578** | +19% |
| ChatCORE_cat | 0.0734 | **0.1128** | **+54%** |
| ARC-Easy | 32.83% | **38.00%** | +5 pts |
| ARC-Challenge | 28.84% | 29.00% | flat |
| MMLU | 29.85% | **32.50%** | +3 pts |

Scaling holds across every metric, with the biggest jumps on multiple-choice / categorical tasks (where the smaller model is closer to chance). Generation tasks (GSM8K, HumanEval) remain near-floor at d12 — those need substantially larger models to lift.

## Performance / MFU notes

- d8: ~37 TFLOPS effective @ ~39% MFU (batch=16)
- d12: ~40 TFLOPS effective @ ~42% MFU (batch=8)
- d12 hits slightly higher MFU because larger model = better arithmetic intensity, even at smaller batch
- 5060 Ti delivers consistent ~38–43% MFU on this workload — much better than the 15–25% I'd guessed before measuring. Pre-run TFLOPS-ratio estimates were ~3× too pessimistic.
- VRAM measurements (`nvidia-smi`) showed d12 peak well under headroom; batch=16 would have fit and saved ~25–35 min, but the marginal time savings weren't worth the restart cost.

## Calibration data points (for future estimates)

- **d8 pipeline (single 5060 Ti):** ~5 hours wall-clock
- **d12 pipeline (single 5060 Ti):** ~12.5 hours wall-clock
- **Eval is the slow part.** Single-GPU CORE is sequential (no rank-parallel sharding), so it takes ~2 h uncapped or ~30–45 min capped at `--max-per-task=200`. GSM8K is the chat_eval bottleneck because of generation; capping with `--max-problems=200` brings it from multi-hour to ~30 min.
- **Per-FLOPs check:** d12 = 6.3× d8 wall-clock for pretraining ≈ predicted 5× from compute (8.7e17 vs 1.8e17 FLOPs), with extra slowness from smaller batch / lower arithmetic intensity at d8 → d12 boundaries.

## Artifacts on disk (local box)

```
~/.cache/nanochat/
├── tokenizer/                          # rustbpe BPE, vocab 32 768
├── base_data_climbmix/                 # 18 parquet shards (~1.5 GB compressed)
├── base_checkpoints/
│   ├── d8/                             # 865 MB (model + meta + optimizer shards)
│   └── d12/                            # 1.9 GB
├── chatsft_checkpoints/
│   ├── d8/                             # 865 MB
│   └── d12/                            # 1.9 GB
└── eval_bundle/                        # DCLM CORE eval data

~/nanochat/
├── report.md                           # final d12 report
├── runs/d8_local.sh, runs/d12_local.sh
└── runs/d8_local.log, runs/d12_local.log
```

wandb run for d12: https://wandb.ai/archeryue7-hust/nanochat/runs/mvvunqy8

## Targets for Stage 2 (ArcherChat)

The numbers above are what ArcherChat needs to match (or beat) when reimplemented from scratch. Concretely, an ArcherChat-d8 trained on the same data/hyperparameters should land within noise of:

- val_bpb (pretrain) ≈ 0.94
- Base CORE ≈ 0.10
- val_bpb (SFT) ≈ 0.42
- ChatCORE ≈ 0.22

…and an ArcherChat-d12 should land within noise of:

- val_bpb (pretrain) ≈ 0.84
- Base CORE ≈ 0.15
- val_bpb (SFT) ≈ 0.36
- ChatCORE ≈ 0.26

Caveat on direct comparison: the d12 `Base CORE` of 0.154 was measured with `--max-per-task=200` (vs d8's full eval). For a clean ArcherChat-vs-nanochat comparison at d12, the ArcherChat run should use the same cap, or both should be re-run uncapped.

## Open items for Stage 2

- Endlex MVP (server + tracker + checkpoint sync) needs to exist before ArcherChat training starts, so training scripts can target it from day one.
- ArcherChat's own design / TECH_PLAN doc.
- For Stage 3 (d24 cloud speedrun), this stage's MFU patch and `--max-per-task` learnings should be ported into ArcherChat's run scripts.
