# ArcherChat

A from-scratch reimplementation of [nanochat](https://github.com/karpathy/nanochat), built end-to-end on a single consumer GPU (RTX 5060 Ti, 16 GiB) for the local stages, then scaled to 8×H100 cloud for the GPT-2 speedrun.

The goal isn't to *beat* nanochat — it's to deeply understand every layer of the modern LLM stack by rewriting it. nanochat's numbers serve as the correctness oracle: ArcherChat-d8 should match nanochat-d8 within noise, ArcherChat-d12 should match nanochat-d12, and the final d24 cloud run should clear GPT-2's CORE score (0.2565) on 8×H100.

## Project plan

### Stage 1 — Local nanochat baselines ✓ done

Run karpathy's nanochat unchanged on a 5060 Ti at d8 and d12 to establish reference numbers ArcherChat will be measured against.

Outputs:
- `runs/d8_local.sh` and `runs/d12_local.sh` adapted from nanochat's `runs/speedrun.sh` for single-GPU consumer Blackwell (no FA3, no FP8, `--window-pattern=L`).
- A small patch to nanochat's `get_peak_flops` table so MFU logs a real number on the 5060 Ti.
- Reference numbers locked in for both depths — see [STAGE1.md](STAGE1.md).

### Stage 2 — ArcherChat rewrite + local validation ✓ code-complete & validated

Rewrite the core modules from scratch:
- **Muon optimizer** + compute-optimal scaling (the auto-derivation of token horizon, batch size, LR, weight decay from one `--depth` dial).
- **Sliding-window attention** (FA3 path + SDPA fallback for consumer hardware).
- **Tokenizing distributed dataloader** with epoch / shard state.
- **KV-cache inference engine** with batched decoding.
- **SFT pipeline** including the packing-to-padding transition for variable-length chat data.

All modules are implemented and validated locally against nanochat: forward, optimizer step, and greedy decode are **bit-identical** (Δ=0), and `evaluate_bpb` reproduces the oracle's 0.9376 on its own weights. **ArcherChat-d8 trains end-to-end** (full 1920-step run); its final val_bpb sits within the expected noise band of nanochat-d8 (see below on why an exact match isn't achievable). **ArcherChat-d12** is the second data point, to be trained on a stable GPU box.

> **On "match within noise":** bf16 training is non-deterministic for *everyone* (PyTorch's embedding backward uses atomic scatter-add), so two full runs — even of identical code — diverge by ~seed-level amounts. Verified directly: ArcherChat-vs-nanochat and ArcherChat-vs-itself diverge by the same magnitude over a fixed batch/init. Faithfulness is therefore proven by the **per-step bit-identity** + a **self-consistency control**, not by chasing an exact final val_bpb.

See [TECH_PLAN.md](TECH_PLAN.md) for the full module-by-module plan and acceptance gates.

### Stage 3 — Cloud d24 speedrun

Rent 8×H100, run the ArcherChat speedrun script, target the [nanochat leaderboard's GPT-2 threshold](https://github.com/karpathy/nanochat#time-to-gpt-2-leaderboard) (0.2565 CORE). Final weights + metrics sync from cloud to home box via [Endlex](https://github.com/archeryue/Endlex). The cloud instance can be torn down the moment training finishes — nothing of value lives on it.

## Development

```bash
uv sync                          # runtime deps only (what the cloud box needs)
uv sync --extra gpu              # + CUDA torch (cloud/GPU box)
uv run --group dev pytest -q     # run tests (dev group holds pytest — not synced by default)
```

Note: `[tool.uv] default-groups = []` keeps cloud installs lean, so a bare
`uv run pytest` would fall back to any globally-installed pytest and fail to
import `archerchat`; the root `conftest.py` catches this with a clear message.

Training (single GPU):
```bash
source .env
python scripts/base_train.py --depth 8      # --max-steps N for a debug run; --ckpt-dir to redirect
python scripts/chat_sft.py   --depth 8
```

For a long unattended run on a flaky box, `scripts/run_full_pretrain.sh <depth>` wraps
`base_train.py` with frequent checkpointing + auto-resume (survives time-limits / crashes).

## Companion repos

- **[Endlex](https://github.com/archeryue/Endlex)** — self-hosted wandb replacement (metrics dashboard + checkpoint sync). ArcherChat uses Endlex as its only telemetry layer. Set `ENDLEX_URL` / `ENDLEX_TOKEN` in `.env` to enable live streaming; falls back to offline JSONL when unset.

## Status

**Stage 1** complete. **Stage 2** code-complete and locally validated — every module passes its nanochat-equivalence gate (forward / optimizer-step / greedy-decode all bit-identical; scaling table, dataloader restart, and checkpoint round-trip green), and ArcherChat-d8 trains end-to-end. Remaining: the multi-hour full d8 SFT and d12 pretrain+SFT runs, best done on a stable GPU box. **Stage 3** (cloud d24) not started. See [TECH_PLAN.md](TECH_PLAN.md) for the gate-by-gate detail.

## License

MIT
