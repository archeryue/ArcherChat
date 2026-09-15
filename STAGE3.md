# Stage 3 — d24 on 8×H100: runbook and pre-flight

> **Starting fresh? Read this box, then jump to [Step-by-step](#step-by-step-d24-on-8h100).**
>
> **Goal:** train ArcherChat d24 on 8×H100 and clear GPT-2's CORE threshold of **0.2565**.
> **Measured cost: ~2.3 h, ~$74** at $31.92/hr. Budget ~$100.
>
> **State:** everything is pre-flighted. Stage 2 is verified at d8 and d12 (see
> [STAGE2.md](STAGE2.md)); the DDP path is validated; FA3 is confirmed working on real
> Hopper; d24 has been built, trained for 22 steps, and measured at **50.2% MFU**.
> Nothing below is an estimate unless it says so.
>
> **The five things that will bite you**, each of which cost real money to learn:
> 1. **`kernels==0.11.7` is pinned. Do not loosen it.** ≥0.17 silently disables FA3 → ~34% slower, no error.
> 2. **Capacity vanishes in minutes.** Never check-then-launch; use the retry loop in Phase 1.3.
> 3. **Health-check with `get_device_capability()`**, never `device_count()` — the latter reports healthy on a dead machine.
> 4. **`python -m torch.distributed.run`, not `torchrun`** (absent from a `--system-site-packages` venv), and **put `--` before the script args** (argparse eats `--run`).
> 5. **Terminating is not instant.** Confirm the instance list is empty; "terminating" is still billing.
>
> **Prereqs on the local box:** `~/.ssh/id_rsa`, a Lambda API key, `~/.cache/nanochat/{tokenizer,eval_bundle}`, and the nanochat checkout at `~/nanochat` (the oracle — consult it for *tooling* questions too, not just numbers; that lesson cost a rented H100).


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
- [ ] **Size the disk — this is bigger than it looks.** Measured/derived for d24:
      model checkpoint **3.94 GiB**, optimizer **~10.7 GiB per rank**, and DDP writes one
      optimizer shard *per rank* because `DistMuonAdamW` shards gradients but **replicates
      momentum**. So **one save at ws=8 is ~89 GiB**, and `--keep-last 3` is **~268 GiB**.
      Plus ~14 GiB of shards. **Provision ≥ 400 GB.** (The 5090 pod had 30 GB — it could not
      have held a single d24 checkpoint.) The per-rank figure is derived from parameter
      counts, not measured; Phase 5.5 measures it for real before the run commits.
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

## Mistakes made during the H100 sessions

| # | mistake | cost | fix |
|---|---|---|---|
| 9 | Installed `kernels` **unpinned** → ≥0.17, whose changed API broke FA3 loading. I then "fixed" our loader to match the new API — pointing at a different kernel repo and requiring an HF token — instead of checking what nanochat pins | ~40 min + a rented H100 | **nanochat's lockfile pins `kernels 0.11.7`**, where its bare call just works. The oracle was one directory away the whole time. Pin, don't rewrite |
| 10 | Chased a **401** as an auth problem. Got a token; it became a **404** | the token was never needed | The 401 was the *symptom*; the cause was the version. When an error looks like auth, still check the reference's pin first |
| 11 | Claimed FA3 was "unverifiable off Hopper" and wrote `oracle_attn_backend_check.py` to skip on non-Hopper — then concluded it couldn't be tested locally | days of false blocker | **Loading a kernel and running it are different things.** The entire `get_kernel` diagnosis ran locally on a 5060 Ti for $0 |
| 12 | Debugged a defective instance for **20 min** instead of throwing it away | ~$3 | Health-check with `get_device_capability()` within 60 s; terminate and relaunch on failure. On the good machine this took **5 seconds** |
| 13 | Used `torch.cuda.device_count()` as a liveness check | reported "CUDA is up" twice when it wasn't | It does not trigger a full CUDA init. Probe with `get_device_capability()` |
| 14 | Wrote the blanket rule "never download torch on a rented box" from RunPod's 1 MB/s | nearly skipped the torch install that FA3 requires | **Measure the link.** Lambda does 32 MB/s; our pin installs in ~2 min |
| 15 | Ran the d24 smoke with `--max-steps 3` when the logger prints every 10 steps | one wasted run | Only step 0 printed, which is compile-polluted. Use ≥12 steps for a throughput number |

### The pattern, stated once

Every one of these is the same error: **I verified a component and inferred the whole.**
Probed gloo's collectives but not the async pattern the code uses. Read `speedrun.sh` for
flags but not its `--` separator. Read `flash_attention.py` for the call but not the
version pinned beside it. Checked a repo existed but not that it resolved. Counted GPUs
instead of initialising CUDA.

This project's entire method is *compare against the oracle*. It was applied rigorously to
every number — bit-identical forward, optimizer, dataloader — and abandoned the moment a
problem looked like tooling rather than numerics. **The oracle checkout answers tooling
questions too.**

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
| **sliding window (`SSSL`/`SSL`) vs nanochat** | **max\|Δlogit\|=0, argmax 100%, window tables identical** — closed a path that had *never* run (every prior run used `L`). Confirms the short window is **512**, not the 768 nanochat's own stale comment claims, and that the last layer is forced full |
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

## MEASURED on 2×H100 (smoke test, $1.37)

Everything below is measured on real Hopper, not extrapolated. This replaces the earlier
planning estimates, which assumed 35% MFU.

| gate | result |
|---|---|
| CUDA health | `get_device_capability()` → `(9, 0)` in **5 s** after SSH |
| image torch | **2.7.0** — no FA3 build; bootstrap installs 2.9.1+cu128 (~2 min at 32 MB/s) |
| **FA3 loads** | **`fa3 (varunneal/flash-attention-3)`** — nanochat's repo, nanochat's bare call, `kernels==0.11.7`, **no HF token** |
| **FA3 correctness** | vs our SDPA reference (bit-identical to nanochat): full-causal **9.77e-04**, **sliding-window (256) 3.91e-03** — bf16 rounding, not logic |
| d24 builds + trains | 1384.1M params, flops/token 4.78e9, `done: pretrain d24` clean |
| **VRAM @ `--device-batch-size 16`** | **61 GB / 80 GB** — comfortable headroom |
| config resolution | 5568 steps, batch 1 048 576, lr 0.0283, wd 0.0597 — as designed |
| **throughput (post-compile)** | **207 979 → 208 138 tok/s, 50.2% MFU**, stable across steps 10 and 20 |

**50.2% MFU with FA3 + SSSL.** For contrast, SSSL on the SDPA shim measured **22%** locally,
and `L` on SDPA measured 39.5% — so FA3 is worth substantially more than the earlier
FLOP-ratio argument suggested, because it removes the dense-mask penalty *and* exploits the
window.

### Revised d24 cost and time — from measurement, not assumption

Assuming the 2→8 GPU scaling holds (NVLink on a full node, comms were 0.9% of step time):

| phase | time | cost @ $31.92/hr |
|---|---|---|
| pretrain (5.84 B tokens) | **1.95 h** | **$62** |
| SFT (~509 M tokens) | 0.17 h | $5 |
| base_eval + chat_eval | ~0.2 h | $6 |
| **total** | **~2.3 h** | **~$74** |

Earlier planning said 2.8 h / $89 for pretrain alone at an assumed 35% MFU. The measured
50.2% makes the whole pipeline cheaper than the old pretrain-only figure. Budget ~$100 to
absorb a restart; the 8×H100 is $31.92/hr, so an idle hour costs more than the entire
smoke test that produced these numbers.

⚠️ The 2→8 extrapolation is the one unmeasured step. Comms grow with world size, so treat
1.95 h as optimistic and re-read MFU at step 50 of the real run (Phase 5.3).

---

## Step-by-step: d24 on 8×H100

Every step has an **expected output** and a **STOP IF**. Do not proceed past a failed
assertion — that is the whole point of having them. Times assume 8×H100 SXM at ~$25/hr.

Shell variables used throughout:

```bash
POD="root@<ip> -p <port> -i ~/.ssh/id_rsa"     # adjust to your provider's form
V=/root/av                                     # the venv created in step 4
A=/root/ArcherChat
```

---

### Phase 0 — before you rent (free, ~30 min)

**0.1 Decide the horizon.** `--target-param-data-ratio 8` (nanochat's speedrun, aimed at
the GPT-2 threshold) ⇒ 5.84 B tokens, **5 568 steps**, batch 1 048 576, matrix_lr 0.028284,
wd 0.059738. Ratio 12 is our compute-optimal default and costs ~1.5×.

**0.2 Confirm the world size divides the batch.** The batch is 2^20, so **world_size must be
a power of two**. 8 ✅, 4 ✅, **7 ✗, 6 ✗** — `base_train.py:118` asserts and dies at startup.

```bash
python3 -c "b=1048576; print([(d, b//(d*2048*8)) for d in (8,16,32) if b%(d*2048*8)==0])"
# -> [(8, 8), (16, 4), (32, 2)]   # (device-batch-size, grad_accum) at ws=8
```

**0.3 Wire FA3 — and know what it is actually worth.** MEASURED, not estimated (d8, same
batch, SDPA path):

| pattern | flops/token | attention share | throughput | MFU |
|---|---|---|---|---|
| `L` | 5.285e9 | 17.1% | **106,405 tok/s** | 39.5% |
| `SSSL` | 4.775e9 (−9.6%) | 8.3% | **70,589 tok/s** | 22.0% |

**On the SDPA path, `SSSL` is 34% SLOWER than `L` despite doing 9.6% fewer FLOPs** — the
dense mask costs more than the sparsity saves. So FA3's value is:

- vs running `L` on SDPA: ~**$7–10** (SSSL's 9.6% FLOP saving, if the kernel exploits it)
- vs running `SSSL` on SDPA: ~**$25–35** (avoids the 34% penalty)

An earlier version of this file claimed $70–100. That was unmeasured and wrong: attention is
only 8–17% of d24's compute, so no attention kernel can be worth a third of the run.

**The real reason to want FA3 is fidelity, not speed.** nanochat's speedrun trains with
`SSSL`, and the CORE ≥ 0.2565 threshold was established on that architecture. Falling back
to `L` trains a *different* model — full receptive field everywhere, ~10% more compute —
which is not obviously worse but is no longer the reference config.

If FA3 is unavailable on the box, the fallback is a genuine trade:

| option | cost | consequence |
|---|---|---|
| `SSSL` on SDPA | +34% wall-clock | faithful architecture, slow |
| `L` on SDPA | fast (39.5% MFU) | ~10% more FLOPs, diverges from the reference |

**PIN `kernels==0.11.7`. Do not loosen it.** This cost a rented H100 and an hour to
learn. nanochat's loader is a bare `get_kernel('varunneal/flash-attention-3')`, and its
lockfile pins **kernels 0.11.7**, where that call just works — no version, no trust flag,
no HF token. From 0.17 the API changed under it in three stacking ways, each masking the
next: `get_kernel()` requires `version=`/`revision=`; then it wants
`trust_remote_code=True`; then it resolves through HF's *kernel registry*, where this repo
is not registered (`/api/kernels/varunneal/flash-attention-3` → 404, while
`/api/kernels/kernels-community/flash-attn3` → 200), so it 401s without a token and 404s
with one. **The fix is the pin, not a rewritten call** — chasing the new API leads you to a
different kernel repo than the oracle uses.

**The kernel is obtainable — verified.** The hub repo `varunneal/flash-attention-3` is
public and ungated, and ships prebuilt kernels per `(torch, cuda, arch)`:

```
torch28:           cu126, cu128                 (x86_64)
torch29:           cu126, cu128, cu130          <- our pin, 2.9.1+cu128
torch210/211/212:  cu126, cu128, cu130
```

Both our pin and the torch 2.8+cu128 that cloud images typically ship are covered. But a
*missing* combination fails silently into SDPA, so `stage3_pod_bootstrap.sh` now asserts the
image's `(torch, cuda)` has a build **before** the run, and installs `kernels`.

Three separable correctness questions, all settled independently of the above:

| | status |
|---|---|
| **SSSL mask correctness** (`make_window_mask`, `window_sizes`, the 512 short window) | ✅ **VERIFIED** — `scripts/oracle_window_check.py` is bit-identical to nanochat (max\|Δ\|=0, argmax 100%) on `L`, `SSSL` and `SSL`. Runs on any GPU; needs no flash-attn |
| flash-attn **wrapper** correctness | ⏳ checkable wherever flash-attn installs (FA2 is SM 80+; Blackwell-consumer wheels are spotty) |
| **FA3 kernel performance** | ⏳ genuinely Hopper-only (SM 90) |

Only the third is unverifiable off Hopper. That matters because the mask is the part that
can *silently void the run* — get it wrong and d24 trains with the wrong receptive field
regardless of kernel. It is now a gate, and it was free.

**The wiring is written.** `attention.py` now selects its backend at import: FA3 from the
HF `kernels` hub (the same kernel nanochat uses), else a pip-installed `flash_attn`, else
the SDPA shim. Gated on `sm90` because FA3 is Hopper-only — every RTX 50-series box reports
`sm120` and correctly falls back.

**Our signature now matches FA3's exactly**, so the real kernel module is a literal
drop-in for the shim and there is no adapter. This was a deliberate change: an earlier
version kept a different positional order and translated in a wrapper, which is strictly
worse — mis-ordering `(q, k, v, k_cache, v_cache)` against `(q, k_cache, v_cache, k=, v=)`
**does not raise**, it silently attends over the wrong tensors and converges elsewhere.
Deleting the adapter deletes that failure mode. `model.py`'s call site now reads exactly
like nanochat `gpt.py:112`.

On the H100 box you therefore only need to *install* the kernel, not write code:

```bash
$V/bin/pip install kernels                      # then just run; the backend auto-selects
ARCHERCHAT_ATTN=fa3 $V/bin/python -c "import archerchat.attention"   # asserts FA3 is live
```

`ARCHERCHAT_ATTN=fa3` **raises** rather than silently falling back — use it as a hard
pre-flight assertion. `ARCHERCHAT_ATTN=sdpa` forces the fallback, so you can A/B the real
kernel against the SDPA path that `oracle_window_check.py` proved bit-identical to nanochat.

`base_train.py` and `chat_sft.py` print the backend at startup:

```
attention  fa3 (hf kernels)  window_pattern=SSSL      <- what you want on H100
attention  sdpa (sm120 is not Hopper ...)             <- what you get anywhere else
```

**0.4 Push the branch** you intend to run. The box clones from GitHub.

---

### Phase 1 — provision (~5 min)

Needs a Lambda API key: `export LK=<lambda api key>`. All calls are HTTP Basic with the key
as the username.

**1.1 Register your SSH key (once).**

```bash
curl -s -u "$LK:" -H "Content-Type: application/json" \
  -d "$(python3 -c "import json;print(json.dumps({'name':'archerchat-agent','public_key':open('$HOME/.ssh/id_rsa.pub').read().strip()}))")" \
  https://cloud.lambdalabs.com/api/v1/ssh-keys
```

**1.2 Check capacity — but do not trust it.**

```bash
curl -s -u "$LK:" https://cloud.lambdalabs.com/api/v1/instance-types | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
for n,i in sorted(d.items()):
    if 'h100' in n:
        r=[x['name'] for x in i.get('regions_with_capacity_available',[])]
        print(f\"{n:<24} \${i['instance_type']['price_cents_per_hour']/100:>6.2f}/hr  {', '.join(r) or '— none —'}\")"
```

⚠️ **Capacity vanishes within minutes.** `gpu_8x_h100_sxm5` appeared and disappeared twice
in one night, and three separate check-then-launch attempts lost the race. **Do not check
then launch — loop.**

**1.3 Retry-launch loop** (this is how the 2×H100 was finally obtained, on attempt ~8):

```bash
for i in $(seq 1 240); do                      # ~1 h of polling
  for REGION in us-south-2 us-south-3 us-southeast-1 us-east-1 us-west-1; do
    R=$(curl -s -u "$LK:" -H "Content-Type: application/json" \
      -d "{\"region_name\":\"$REGION\",\"instance_type_name\":\"gpu_8x_h100_sxm5\",
           \"ssh_key_names\":[\"archerchat-agent\"],\"quantity\":1,\"name\":\"archer-d24\"}" \
      https://cloud.lambdalabs.com/api/v1/instance-operations/launch)
    ID=$(echo "$R" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['data']['instance_ids'][0] if 'data' in d else '')")
    [ -n "$ID" ] && { echo "GOT $ID in $REGION"; echo "$ID" > /tmp/_inst; break 2; }
  done
  sleep 15
done
```

**1.4 Wait for `active`, get the IP.**

```bash
ID=$(cat /tmp/_inst)
for i in $(seq 1 30); do
  IP=$(curl -s -u "$LK:" https://cloud.lambdalabs.com/api/v1/instances/$ID \
     | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print(d.get('ip') or '' if d['status']=='active' else '')")
  [ -n "$IP" ] && break; sleep 10
done; echo "IP=$IP"
```

**1.5 CUDA HEALTH CHECK — do this before anything else.** On a good machine it answers in
~5 seconds; on a bad one it never will. **Terminate immediately rather than debugging** —
20 minutes was wasted on a defective box that a 5-second check would have condemned.

```bash
ssh -i ~/.ssh/id_rsa ubuntu@$IP \
  'python3 -c "import torch;print(torch.cuda.get_device_capability(0))"'
# expect: (9, 0)
```

> ⚠️ **NOT `torch.cuda.device_count()`** — it returns 2 on a machine whose CUDA is dead,
> because it does not trigger a full init. It reported "healthy" twice on a broken box.
>
> **STOP IF** this errors with `802 system not yet initialized` → terminate (1.6) and
> relaunch. See the CUDA-802 section below; on a *sliced* instance the fabric may never
> initialise. A full 8×GPU node owns its NVSwitches and should not hit this.

**1.6 Terminate (use this any time, and at the end).**

```bash
curl -s -u "$LK:" -H "Content-Type: application/json" -d "{\"instance_ids\":[\"$ID\"]}" \
  https://cloud.lambdalabs.com/api/v1/instance-operations/terminate
# then CONFIRM — 'terminating' is not 'gone':
curl -s -u "$LK:" https://cloud.lambdalabs.com/api/v1/instances | python3 -c "
import json,sys;d=json.load(sys.stdin).get('data',[]);print('CLEAR — \$0/hr' if not d else d)"
```

**1.7 Watchdog before workload.** Never let session liveness be the only thing between you
and a running meter:

```bash
ssh -i ~/.ssh/id_rsa ubuntu@$IP 'nohup sh -c "sleep 14400; sudo shutdown -h now" >/dev/null 2>&1 &'
```

Instance requirements: **8×H100 SXM** (not PCIe — NVLink keeps comms at ~0.9% of step
time), 80 GB/GPU, **≥400 GB disk** (see the disk note in the checklist).

### Phase 2 — ship artifacts (~2 min)

```bash
ssh $POD 'mkdir -p /root/.cache/nanochat/tokenizer'          # rsync will NOT create parents
rsync -az -e "ssh -p <port> -i ~/.ssh/id_rsa" \
      ~/.cache/nanochat/tokenizer/ $POD:/root/.cache/nanochat/tokenizer/ \
      && echo OK || echo "RSYNC FAILED"                       # <-- check, do not assume
rsync -az ... ~/.cache/nanochat/eval_bundle/ $POD:/root/.cache/nanochat/eval_bundle/
rsync -az ... ~/ArcherChat/.env            $POD:/root/ArcherChat/.env
```

> **Ship the tokenizer, never retrain it** — a different vocab voids every oracle number.
> **Ship `.env`** or Endlex runs offline and you are blind for four hours.

---

### Phase 3 — bootstrap (~5 min, dominated by the 170-shard fetch at ~18 MB/s)

```bash
ssh $POD 'cd /root && BRANCH=main SHARDS=170 nohup bash stage3_pod_bootstrap.sh > /root/boot.log 2>&1 &'
ssh $POD 'tail -f /root/boot.log'
```

Expected tail: `train shards: 170   val: ['shard_06542.parquet']` and `tokenizer vocab: 32768`.

> **STOP IF** shard count < 170, vocab ≠ 32768, or the tokenizer assertion fires.
> **Do not run `uv sync --extra gpu`** — see the pre-flight checklist.

---

### Phase 4 — gates before the expensive run (~5 min, saves hours)

```bash
ssh $POD "cd $A && export PYTHONPATH=$A && \
  for NL in 6 3 12; do $V/bin/python scripts/oracle_ddp_check.py --world-size 8 --n-layer \$NL; done"
```

Also run the sliding-window gate — d24 uses `SSSL`, which no run before Stage 3 exercised:

```bash
ssh $POD "cd $A && PYTHONPATH=$A $V/bin/python scripts/oracle_window_check.py --patterns L,SSSL"
```

And — **this one only means anything on Hopper** — hold the FA3 kernel accountable to the
SDPA path we proved bit-identical to nanochat:

```bash
ssh $POD "cd $A && PYTHONPATH=$A $V/bin/python scripts/oracle_attn_backend_check.py --patterns L,SSSL"
```

Expected: three × `DDP-EQUIVALENCE: PASS ✅ ... max|Δ| ~3e-08`, then
`SLIDING-WINDOW EQUIVALENCE: PASS ✅`, then `FA3-vs-SDPA AGREEMENT: PASS ✅`.

> **STOP IF** FA3 disagrees. We do not own the FA3 kernel and cannot change it — but we do
> own a reference that is proven correct, so a disagreement means *our wiring* is wrong,
> most likely the `(q, k, v, k_cache, v_cache)` → `(q, k_cache, v_cache, k=, v=)`
> re-ordering. That mis-order does not raise; it computes garbage, trains happily, and
> converges somewhere else.

> **STOP IF** any gate exceeds 1e-5. That is `DistMuonAdamW` mis-sharding, and every
> subsequent number would be garbage. Debugging here costs minutes; debugging it inside a
> 3-hour run costs the run.

`--n-layer` sets K (matrices per Muon shape group) directly, which is what determines the
sharding regime — `6` gives ZERO-RANK + remainder, `3` gives three ZERO-RANK groups, `12`
gives plain remainder. At ws=8 this covers d24's own `K=12 → 1+4` split.

---

### Phase 5 — d24 pretrain (~2 h measured; budget 3 h)

**5.1 Launch.** Note the `--` separator: `--run` is a prefix of the launcher's `--run-path`
and argparse will refuse it otherwise.

```bash
ssh $POD "cd $A && export PYTHONPATH=$A && nohup $V/bin/python -m torch.distributed.run \
  --standalone --nproc_per_node=8 scripts/base_train.py -- \
  --depth 24 --target-param-data-ratio 8 --device-batch-size 16 \
  --window-pattern SSSL --eval-every 200 --eval-tokens 4194304 \
  --checkpoint-every 200 --keep-last 3 \
  --ckpt-dir /root/.cache/nanochat/base_checkpoints/d24 --run archerchat-d24 \
  > /root/d24.log 2>&1 &"
```

**5.2 Verify it actually started — within 30 seconds.** Two silent launch failures during
the rehearsal went unnoticed because the check was a filtered grep after a sleep:

```bash
sleep 30; ssh $POD 'nvidia-smi --query-gpu=index,utilization.gpu,memory.used --format=csv,noheader; \
                    tail -20 /root/d24.log'      # RAW tail, not a grep
```

> **STOP IF** GPU utilisation is 0 — read the raw log, the error will be there.

**5.3 Read MFU at ~step 50. This is the FA3 test.** MFU now includes the `world_size`
factor, so the printed number is trustworthy.

First check the startup line — **do not infer the backend from MFU when the log states it**:

```
attention  fa3 (hf kernels)  window_pattern=SSSL
```

> **STOP IF** that reads `sdpa`. At d24 with `SSSL` the shim materialises a dense
> 2048×2048 mask per sliding layer per batch; it is correct but roughly doubles the run.

Then use MFU as the performance confirmation:

| printed MFU | meaning |
|---|---|
| ~35–50% | healthy. Proceed. |
| **~22%** | the signature of `SSSL` running on the SDPA shim — **measured** at d8, not guessed |
| **< 20%** | something else is wrong even if the backend line says fa3. Investigate before burning hours. |

**5.4 Sanity-check the horizon:** the log's header should read `steps total=5568`. Expected
val_bpb at step 0 ≈ 3.16.

**5.5 Measure the first real checkpoint, then do the disk arithmetic.** Set
`--checkpoint-every 200`, so the first save lands ~7 min in. Do not trust the estimate above:

```bash
ssh $POD 'du -sh /root/.cache/nanochat/base_checkpoints/d24/; \
          ls -la /root/.cache/nanochat/base_checkpoints/d24/ | head; df -h /'
```

> **STOP AND RETUNE IF** `one_save x keep_last + 14 GiB` exceeds free disk. Options, in
> order of preference: raise `--checkpoint-every` (fewer saves, more lost work per crash),
> drop to `--keep-last 2` (~179 GiB), or accept `--keep-last 1` (~89 GiB) only if you also
> trust the box not to die mid-write. Running out of disk at hour 3 loses the run.

---

### Phase 6 — evaluate (~15 min on 8 GPUs)

```bash
# cheap confidence check BEFORE teardown -- ~1 min, proves the checkpoint is not garbage
ssh $POD "cd $A && PYTHONPATH=$A $V/bin/python -m torch.distributed.run --standalone \
  --nproc_per_node=8 scripts/base_eval.py -- --depth 24 --max-per-task 50 \
  --init-from /root/.cache/nanochat/base_checkpoints/d24 --device-batch-size 16"

# the real number, uncapped
... --max-per-task -1 ...        # <-- THE VERDICT: CORE >= 0.2565 clears GPT-2
```

Then SFT and chat_eval, same launcher, same `--`:

```bash
... scripts/chat_sft.py -- --depth 24 --device-batch-size 16 --eval-every 200 \
      --eval-tokens 4194304 --init-from <base d24> --ckpt-dir <d24_sft> --run archerchat-d24-sft
... scripts/chat_eval.py -- --depth 24 --init-from <d24_sft> --max-problems 200
```

---

### Phase 7 — bring it home, then kill it (~5 min)

```bash
# weights by rsync, NOT Endlex: 21 MB/s measured, and Endlex's chunked upload was throwing
# SSL: SSLV3_ALERT_BAD_RECORD_MAC. Only model+meta are needed for eval; optimizer shards
# are the larger half and exist only for resume.
rsync -az --info=progress2 $POD:/root/.cache/nanochat/base_checkpoints/d24/model_*.pt   ./d24/
rsync -az $POD:/root/.cache/nanochat/base_checkpoints/d24/meta_*.json ./d24/
rsync -az $POD:/root/.cache/nanochat/chatsft_checkpoints/d24_sft/     ./d24_sft/
rsync -az $POD:/root/ArcherChat/endlex_runs/ ./pod_artifacts/endlex_runs/   # metrics
rsync -az $POD:/root/d24.log ./pod_artifacts/

# verify locally BEFORE terminating
python3 -c "import torch;d=torch.load('d24/model_005568.pt',map_location='cpu',weights_only=True);\
print(len(d),'tensors, finite:',all(torch.isfinite(v.float()).all() for v in d.values()))"
```

> **TERMINATE THE INSTANCE.** Nothing of value lives on it once the above verifies.

---

### CUDA error 802 "system not yet initialized" on a fresh H100 box

Hit this on a Lambda `gpu_2x_h100_sxm5` and lost ~$3 to it. Signature:

```
nvidia-smi                      -> both H100s visible, healthy
nvidia-smi -q | grep -A2 Fabric -> State : In Progress     (never reaches Completed)
systemctl start nvidia-fabricmanager
  -> "Detected Pre-NVL5 system"
  -> "query NVSwitch device information ... failed: WARNING Nothing to do [NV_WARN_NOTHING_TO_DO]"
ls /dev/nvidia-nvswitch*        -> only nvidia-nvswitchctl, no nvswitch0
python -c "import torch; torch.cuda.get_device_capability()"  -> RuntimeError 802
```

**Cause.** On NVSwitch systems CUDA will not initialise until Fabric Manager registers the
GPUs and fabric state reaches `Completed`. In a GPU-**passthrough VM** the NVSwitches are
often not exposed to the guest, so FM has nothing to query, fabric never completes, and
every CUDA init fails. This is a documented limitation of passthrough virtualisation, not
a driver or version problem — ours had driver and FM both at 580.105.08.

**Implication for instance choice.** This is a hazard of *sliced* instances
(`gpu_1x/2x/4x_h100_sxm5`), which are carved out of an 8-GPU NVSwitch node. A full
`gpu_8x_h100_sxm5` owns its NVSwitches, so the instance type Stage 3 actually needs is the
least exposed. Prefer the full node; treat slices as unreliable for multi-GPU CUDA.

**Triage order** (I skipped the middle two and terminated too early):

1. `nvidia-smi -q | grep -A2 Fabric` — if `In Progress`, wait ~2 min; it can be transient.
2. `sudo systemctl restart nvidia-fabricmanager; tail /var/log/fabricmanager.log`
   — the log says more than `journalctl` does.
3. `sudo nvidia-smi -r` (GPU reset), then restart fabricmanager.
4. Reboot / restart the instance.
5. **Terminate and relaunch** — on a cloud VM you cannot fix the hypervisor's NVSwitch
   exposure, so a different host is usually the only real remedy.

⚠️ **`torch.cuda.device_count()` IS NOT A LIVENESS CHECK.** It returned `2` throughout,
because it does not trigger a full CUDA init. It fooled my polling loop into reporting
success. Always probe with something that calls `_lazy_init()`:

```bash
python -c "import torch; print(torch.cuda.get_device_capability())"
```

**Also learned here:** Lambda's H100 image ships **torch 2.7.0**, for which the FA3 kernel
hub has **no build** (2.8/2.9/2.10/2.11/2.12 only). The Phase-3b assert caught it in
seconds. PyPI on Lambda runs at **32 MB/s** (vs RunPod's 1 MB/s), so installing our exact
pin — `pip install torch==2.9.1 --index-url https://download.pytorch.org/whl/cu128` — costs
~2 minutes and is the right move. The earlier blanket rule "never download torch on a
rented box" was over-generalised from one slow host: **measure the link, then decide.**

---

### If it goes wrong mid-run

`run_full_pretrain.sh` now launches DDP and auto-resumes, so prefer it over the raw
Phase 5.1 command for the real run:

```bash
ssh $POD "cd $A && PYTHONPATH=$A NPROC=8 PYTHON=$V/bin/python RUN_NAME=archerchat-d24 \
  CKPT_DIR=/root/.cache/nanochat/base_checkpoints/d24 \
  nohup bash scripts/run_full_pretrain.sh 24 --target-param-data-ratio 8 \
  --device-batch-size 16 --eval-every 200 --eval-tokens 4194304 \
  --checkpoint-every 200 --keep-last 3 > /dev/null 2>&1 &"
```

It retries up to 30 times, adding `--resume` whenever a checkpoint exists; `--keep-last 3`
guarantees one does, and the loader state in `meta_*.json` restores the exact data
position. It uses `python -m torch.distributed.run` (not `torchrun`) and inserts the `--`
separator — see the comments in the script for why both matter.

---

## Appendix — condensed command list

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
