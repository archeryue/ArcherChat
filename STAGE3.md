# Stage 3 — d24 on 8×H100: runbook and pre-flight

Stage 3 rents expensive hardware, so everything here exists to keep discovery off the
meter. It is written from a **4×5090 rehearsal on RunPod** that cost ~$3 and found five
things that would each have cost far more at $25/hr.

Read the pre-flight checklist. Every line in it is there because it went wrong once.

---

## Pre-flight checklist (do this BEFORE provisioning)

- [ ] **Check the image's preinstalled torch first.** `python3 -c "import torch;print(torch.__version__)"`.
      If it is close to our pin, build a venv that *inherits* it:
      `python3 -m venv --system-site-packages /root/av` then install only
      `filelock tiktoken pyarrow python-dotenv` and `endlex` from git. **Never run
      `uv sync --extra gpu` on a rented box** — it re-downloads ~3 GB of torch + CUDA libs.
- [ ] **`torchrun` will NOT exist in a `--system-site-packages` venv.** Console scripts are
      not inherited, only packages. Use `python -m torch.distributed.run`.
- [ ] **Put `--` between the script and its arguments.** `--run` is a prefix of the
      launcher's `--run-path`, and argparse abbreviation matching makes it ambiguous:
      `run.py: error: ambiguous option: --run could match --run-path, --run_path`.
      nanochat's own speedrun.sh does this: `torchrun ... -m scripts.base_train -- --depth=24`.
- [ ] **PEP 668** blocks system `pip install` on these images. The venv sidesteps it;
      `--break-system-packages` is the other option.
- [ ] **Ship the tokenizer, never retrain it.** 540 KB of
      `~/.cache/nanochat/tokenizer/{tokenizer.pkl,token_bytes.pt}`. A retrained vocab
      invalidates every oracle comparison. `mkdir -p` the destination first — rsync does
      not create nested parents and will fail.
- [ ] **ArcherChat has no dataset downloader.** `dataloader._artifact_dir()` only *looks*
      in `~/.cache/{archerchat,nanochat}`. Clone nanochat and run
      `NANOCHAT_BASE_DIR=~/.cache/nanochat python -m nanochat.dataset -n <N>`.
      d24 at ratio 8 needs ~170 shards.
- [ ] **Shard count sets the corpus, and the corpus is part of the experiment.**
      See [STAGE2.md](STAGE2.md) — a mismatched shard count silently changes what the model
      trains on and fails CORE with no error.
- [ ] **Size the disk.** d24 checkpoints are ~10 GB each and DDP writes one optimizer shard
      *per rank*. At `--keep-last 3` on 8 ranks that is substantial; the 5090 pod had only
      30 GB, which would not have held d24 at all.
- [ ] **Ship `.env` (ENDLEX_URL / ENDLEX_TOKEN).** Forgotten on the rehearsal, so the run
      streamed no metrics and uploaded nothing — the tracker silently fell back to offline
      JSONL. On a 4-hour d24 run that means flying blind until you SSH in.
- [ ] **Plan to bring weights home by `rsync`, not Endlex.** Measured 21 MB/s pod→home
      (321 MB in 17 s; a ~4 GB d24 checkpoint is ~3 min). Endlex's chunked upload threw
      `SSL: SSLV3_ALERT_BAD_RECORD_MAC` repeatedly during the d8 runs. **Endlex for live
      metrics, rsync for weights.** Only `model_*.pt` + `meta_*.json` are needed for eval —
      the optimizer shards are the larger half and are only for resume.
- [ ] **Watchdog before workload.** `shutdown -h +N` at boot, plus auto-terminate when the
      final eval writes its result. Never let session liveness be the only thing between you
      and a running meter.
- [ ] **Verify a launch actually started** — check process liveness and non-zero GPU
      utilisation within ~30 s. Do not `sleep` then read a filtered log.
- [ ] **On failure, read the RAW log.** Filtered greps hide the error you did not predict.

---

## Mistakes made during the 4×5090 rehearsal

Ordered by cost. All of these were mine, not the code's.

| # | mistake | cost | fix |
|---|---|---|---|
| 1 | Ran `uv sync --extra gpu` without checking the preinstalled torch. Pod had 2.8.0, our pin is 2.9.1, so it began re-downloading torch + the whole CUDA stack — **from PyPI at 1 MB/s** | **~14 min of a 30 min budget** | check torch first; inherit it via `--system-site-packages` |
| 2 | Did not check `rsync`'s exit code, and printed "tokenizer shipped" when it had **failed** (`mkdir ... No such file or directory`) | near-miss — a silent false success on the one artifact that must not be regenerated | `mkdir -p` remotely first; `&& echo OK \|\| echo FAILED` |
| 3 | Sequenced the bootstrap as download-then-test, when **the DDP gates need no dataset at all** (synthetic tensors) | delayed the primary result behind an irrelevant download | run data-independent gates in parallel with the data fetch |
| 4 | Assumed gloo could run the gate because I probed the *collectives* in isolation — but not the `async_op=True` + `.get_future()` pattern the real code uses (`Work::getFuture not implemented`) | one wasted cycle and a wrong claim to the user | test the actual code path, not its components |
| 5 | Wrote the gate to assert **exact bit-identity** for a distributed reduction | false "MISMATCH" that looked like a real bug; one re-run | tolerance 1e-5 (TECH_PLAN's own optimizer threshold). `ReduceOp.AVG` sums-then-divides and sliced tensors hit different kernels — bitwise identity is unachievable by construction |
| 6 | Launched with `--run`, colliding with the launcher's `--run-path` | one failed launch | `--` separator — **I had already read this exact pattern in nanochat's speedrun.sh and failed to apply it** |
| 7 | Launched `/root/av/bin/torchrun`, which does not exist in a `--system-site-packages` venv | one failed launch, ~90 s before I noticed | `python -m torch.distributed.run`; verify the binary exists before backgrounding |
| 8 | Backgrounded launches with `nohup` and then checked a **filtered** log after a sleep, so two consecutive silent failures went unnoticed until the user prompted me | the user had to tell me to monitor | assert GPU utilisation > 0 within 30 s of every launch |

### The meta-lesson

Six of the eight are the same error in different clothes: **I verified a component and
inferred the whole**. Probed collectives but not the future pattern (#4). Checked the
script parsed but never ran it (#5, #6, #7). Echoed success without checking status (#2).
On rented hardware the rule is: *run the actual command once, cheaply, before you need it
to work.*

---

## Code bugs the rehearsal found

Not mistakes — findings. These were latent and would have surfaced at $25/hr.

| bug | consequence on 8×H100 |
|---|---|
| **`prune_checkpoints()` raced under DDP.** Every rank derived its stale-step list by globbing `model_*.pt` — which *rank 0 deletes*. Ranks arriving later saw an already-pruned directory, computed an empty stale set and leaked their shards. Caught on the real 4-GPU run: `optim_001500_rank{1,2,3}.pt` survived after rank 0 pruned step 1500 | ~7 optimizer shards of ~10 GB leaking **per save** at d24/ws=8 — fills the disk and kills the run. Fixed: each rank derives its list from its **own** `optim_*_rank{r}.pt`; rank 0 unions in `model_*.pt` since it is the sole writer of those and must still clean up a step whose shard is missing |
| **MFU missing the `world_size` factor.** `mfu = flops/tok × tok/s ÷ peak_flops`, but `tok_per_sec` is *global* while `peak_flops` is *one GPU's*. Correct at ws=1 (every Stage-1/2 run), wrong under DDP | would have read **8× high** at d24 — and MFU is precisely the signal for judging whether FA3/sliding-window is working, the single biggest cost lever in the run. Fixed in `base_train.py` and `chat_sft.py` (nanochat does `/(gpu_peak_flops * ddp_world_size)`, base_train.py:554) |

---

## What the rehearsal proved

| gate | result |
|---|---|
| `DistMuonAdamW` vs verified `MuonAdamW`, ws=4 | **max\|Δ\| 2.98e-08** across ZERO-RANK, remainder and even shard regimes — 300× inside tolerance |
| per-rank optimizer checkpoint shards | `optim_001920_rank{0..3}.pt` written correctly |
| DDP dataloader striping + `evaluate_bpb` all-reduce | **d8 full run: val_bpb 0.9307 vs oracle 0.9376, Δ −0.0069** (band ±0.01) |
| final loader cursor | `shard 1 / rg 16 / epoch 2` vs oracle `pq 1 / rg 22 / epoch 2` — same shard and epoch; the row-group offset is expected, ranks stride row groups |
| `torch.distributed.run` at `nproc_per_node>1` | works, with the `--` separator |
| real MFU on 4×5090 | ~48% (the logged 192% was the world_size bug) |

The d8 DDP run used torch **2.8.0** (the pod's preinstalled build), not the 2.9.1 everything
else was verified against — another reason its Δ is −0.0069 rather than matching our
single-GPU 0.9449 closely.

Sharding coverage does **not** require 8 GPUs — it requires the right `K` (matrices per
shape group) relative to world_size. `oracle_ddp_check.py --n-layer` sets `K` directly, so
`--n-layer 6 --world-size 4` reproduces d12-at-ws=8's exact regime. See that script's
docstring for the table.

---

## d24 run sequence

```bash
# 0. watchdog FIRST
shutdown -h +480

# 1. env — inherit torch, download none
python3 -m venv --system-site-packages /root/av
/root/av/bin/pip install filelock tiktoken pyarrow python-dotenv \
    "endlex @ git+https://github.com/archeryue/Endlex"

# 2. artifacts from home (mkdir -p first!)
ssh POD 'mkdir -p /root/.cache/nanochat/tokenizer'
rsync -az ~/.cache/nanochat/tokenizer/ POD:/root/.cache/nanochat/tokenizer/
rsync -az ~/.cache/nanochat/eval_bundle/ POD:/root/.cache/nanochat/eval_bundle/

# 3. data (~170 shards for d24 @ ratio 8) — HF runs ~18 MB/s, this is not the bottleneck
git clone https://github.com/karpathy/nanochat.git /root/nanochat && cd /root/nanochat
NANOCHAT_BASE_DIR=/root/.cache/nanochat /root/av/bin/python -m nanochat.dataset -n 170

# 4. gates BEFORE the expensive run
cd /root/ArcherChat && export PYTHONPATH=/root/ArcherChat
for NL in 6 3 12; do
  /root/av/bin/python scripts/oracle_ddp_check.py --world-size 8 --n-layer $NL
done

# 5. d24 — note the `--` separator
/root/av/bin/python -m torch.distributed.run --standalone --nproc_per_node=8 \
  scripts/base_train.py -- \
  --depth 24 --target-param-data-ratio 8 --device-batch-size 16 \
  --eval-every 200 --eval-tokens 4194304 --checkpoint-every 200 --keep-last 3 \
  --ckpt-dir /root/.cache/nanochat/base_checkpoints/d24 --run archerchat-d24
```

Then `base_eval` → `chat_sft` → `chat_eval`, all under the same launcher and `--`.
Target: **CORE ≥ 0.2565** (GPT-2). Expect ~2.5–4.4 h of pretrain depending on MFU —
and now that MFU is reported correctly, it is a trustworthy early signal: if it comes in
far below ~35%, stop and check that FA3 is actually being used for the sliding-window
layers rather than the dense-mask SDPA fallback.
