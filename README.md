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

### Stage 2 — ArcherChat rewrite + local validation ✓ verified at d8 and d12

Rewrite the core modules from scratch:
- **Muon optimizer** + compute-optimal scaling (the auto-derivation of token horizon, batch size, LR, weight decay from one `--depth` dial).
- **Sliding-window attention** (FA3 path + SDPA fallback for consumer hardware).
- **Tokenizing distributed dataloader** with epoch / shard state.
- **KV-cache inference engine** with batched decoding.
- **SFT pipeline** including the packing-to-padding transition for variable-length chat data.

All modules are implemented and validated locally against nanochat: forward, optimizer step, and greedy decode are **bit-identical** (Δ=0), and `evaluate_bpb` reproduces the oracle's 0.9376 on its own weights. **ArcherChat-d8 trains end-to-end** (full 1920-step run); its final val_bpb sits within the expected noise band of nanochat-d8 (see below on why an exact match isn't achievable). **ArcherChat-d12** is the second data point, to be trained on a stable GPU box.

> **On "match within noise":** bf16 training is non-deterministic for *everyone* (PyTorch's embedding backward uses atomic scatter-add), so two full runs — even of identical code — diverge by ~seed-level amounts. Verified directly: ArcherChat-vs-nanochat and ArcherChat-vs-itself diverge by the same magnitude over a fixed batch/init. Faithfulness is therefore proven by the **per-step bit-identity** + a **self-consistency control**, not by chasing an exact final val_bpb.

> **What "bit-identical" now covers.** Every deterministic stage of the training path has
> been checked against nanochat, not just the forward pass:
>
> | stage | check | result |
> |---|---|---|
> | `init_weights()` | same seed, compare every tensor | **63/63 bit-identical** |
> | dataloader | compare batches element-wise | **655,360 tokens identical** |
> | data consumed over a full run | final loader cursor vs oracle's | **same shard / row-group / epoch** |
> | forward | logits on fixed weights | Δ = 0 |
> | optimizer step | fp32-eager *and* bf16-compiled | Δ = 0 |
> | schedules + grad accum | source audit | identical |
> | eval harness | run our `base_eval` on the *oracle's* weights | 0.905818/0.943396 vs nanochat's 0.905772/0.943642 |
>
> Init and the dataloader had no gate before: `oracle_forward_check` and
> `oracle_optim_check` both operate on fixed loaded weights, so neither ever ran
> `init_weights()`, and the dataloader gate was marked "implied green" rather than
> measured. Both are now real gates (`scripts/oracle_init_check.py`,
> `scripts/oracle_dataloader_check.py`).

> **Careful with the d8 corpus.** Stage 1's d8 ran against 10 dataset shards and wrapped
> into a second epoch; the later d12 run grew the directory to 18 shards, so an unpinned
> d8 rerun trains on different data and lands a different model. See
> [STAGE1.md](STAGE1.md) for how to pin it. d12 is unaffected.

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

**Stage 1** complete. **Stage 2 verified at both depths** — full pretrain + SFT + eval runs at
d8 and d12, measured against the Stage 1 oracles:

| metric | d8 (oracle → ArcherChat) | d12 (oracle → ArcherChat) |
|---|---|---|
| pretrain val_bpb | 0.9376 → 0.9449 (**+0.0073**) | 0.842544 → 0.8434 (**+0.0009**) |
| Base CORE | 0.0976 → 0.0938 (**−0.0038**) | 0.1542 → 0.1535 (**−0.0007**) |
| SFT val_bpb | 0.4185 → 0.4189 (**+0.0004**) | 0.3562 → 0.3570 (**+0.0008**) |

At d12 all three land within **0.001**. SFT terminated at the oracle's exact step count at both
depths (1942 and 971) — and since SFT is dataset-driven, that confirms the mixture, packing and
epoch boundary independently of the loss. SpellingBee scored **199/200 on both sides**, an exact
match on a generative task.

Full results, the equivalence-gate table, the corpus trap that invalidated the first d8 attempt,
and the five latent bugs found by actually running the pipeline: **[STAGE2.md](STAGE2.md)**.

**Stage 3** (cloud d24) not started. See [TECH_PLAN.md](TECH_PLAN.md) for gate-by-gate detail.

## License

MIT
