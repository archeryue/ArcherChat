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

### Stage 2 — ArcherChat rewrite + local validation

Rewrite the core modules from scratch:
- **Muon optimizer** + compute-optimal scaling (the auto-derivation of token horizon, batch size, LR, weight decay from one `--depth` dial).
- **Sliding-window attention** (FA3 path + SDPA fallback for consumer hardware).
- **Tokenizing distributed dataloader** with epoch / shard state.
- **KV-cache inference engine** with batched decoding.
- **SFT pipeline** including the packing-to-padding transition for variable-length chat data.

Train **ArcherChat-d8** locally; compare against nanochat-d8 baseline. If within noise, train **ArcherChat-d12** as the second data point — proves the rewrite scales correctly across depth, not just that one configuration happened to work.

### Stage 3 — Cloud d24 speedrun

Rent 8×H100, run the ArcherChat speedrun script, target the [nanochat leaderboard's GPT-2 threshold](https://github.com/karpathy/nanochat#time-to-gpt-2-leaderboard) (0.2565 CORE). Final weights + metrics sync from cloud to home box via [Endlex](https://github.com/archeryue/Endlex). The cloud instance can be torn down the moment training finishes — nothing of value lives on it.

## Companion repos

- **[Endlex](https://github.com/archeryue/Endlex)** — self-hosted wandb replacement (metrics dashboard + checkpoint sync). ArcherChat will use Endlex as its only telemetry layer from day one. Must exist before Stage 2 starts.

## Status

Stage 1 complete. Stage 2 starts after Endlex MVP lands.

## License

TBD.
