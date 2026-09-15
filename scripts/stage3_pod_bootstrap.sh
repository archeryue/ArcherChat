#!/usr/bin/env bash
# Bootstrap a rented multi-GPU box for ArcherChat. Runs ON THE BOX, on the meter.
#
#   BRANCH=main SHARDS=170 bash stage3_pod_bootstrap.sh
#
# Ship these in FIRST (see STAGE3.md step 2) — they are small and must not be regenerated:
#   ~/.cache/nanochat/tokenizer/{tokenizer.pkl,token_bytes.pt}   540 KB
#   ~/ArcherChat/.env  (ENDLEX_URL / ENDLEX_TOKEN)               <1 KB
#
# Deliberately does NOT run `uv sync --extra gpu`. On a rented box that re-downloads
# ~3 GB of torch + CUDA libs from PyPI, which measured 1 MB/s on RunPod and burned 14
# minutes of a 30 minute budget. These images ship a working CUDA torch; we inherit it.
set -euo pipefail

BRANCH="${BRANCH:-main}"
SHARDS="${SHARDS:-170}"        # d24 @ ratio 8 = 5.84B tokens; cropping reads ~9B => ~170
BASE="$HOME/.cache/nanochat"
VENV="${VENV:-/root/av}"

say() { echo; echo "=== $* ==="; }

say "0. what the image already has"
python3 -c "import torch;print('torch',torch.__version__,'| cuda',torch.version.cuda,'| gpus',torch.cuda.device_count())"
nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader
df -h / | tail -1

say "1. repo"
[ -d ~/ArcherChat ] || git clone -b "$BRANCH" https://github.com/archeryue/ArcherChat.git ~/ArcherChat
cd ~/ArcherChat && git fetch -q origin && git checkout -q "$BRANCH" && git pull -q --ff-only

say "2. venv that INHERITS the preinstalled torch (downloads no torch)"
# --system-site-packages: we get the image's torch/CUDA; only the small pure-python deps
# are fetched. Also sidesteps PEP 668, which blocks `pip install` into the system python.
[ -x "$VENV/bin/python" ] || python3 -m venv --system-site-packages "$VENV"
"$VENV/bin/pip" install -q --no-cache-dir filelock tiktoken pyarrow python-dotenv
"$VENV/bin/pip" install -q --no-cache-dir "endlex @ git+https://github.com/archeryue/Endlex"
# FA3 comes from the HF kernels hub (same kernel nanochat uses), not pip flash-attn.
"$VENV/bin/pip" install -q --no-cache-dir kernels
"$VENV/bin/python" -c "import torch;print('venv torch',torch.__version__,'gpus',torch.cuda.device_count())"
# NOTE: $VENV/bin/torchrun does NOT exist -- console scripts are not inherited, only
# packages. Launch with: $VENV/bin/python -m torch.distributed.run

say "3. dataset"
# ArcherChat has no downloader of its own: dataloader._artifact_dir() only LOOKS under
# ~/.cache/{archerchat,nanochat}. nanochat owns the fetcher, so borrow it and write into
# the directory ArcherChat already falls back to. HF runs ~18 MB/s; this is not the bottleneck.
mkdir -p "$BASE"
[ -d ~/nanochat ] || git clone -q https://github.com/karpathy/nanochat.git ~/nanochat
if [ "$(ls "$BASE/base_data_climbmix" 2>/dev/null | wc -l)" -lt "$SHARDS" ]; then
  (cd ~/nanochat && NANOCHAT_BASE_DIR="$BASE" "$VENV/bin/python" -m nanochat.dataset -n "$SHARDS")
fi

say "3b. FA3 availability"
# The hub ships PREBUILT kernels per (torch, cuda, arch). If this image's combination has
# no build, get_kernel() fails and you silently fall back to SDPA -- which for SSSL is 34%
# SLOWER than no windowing at all (measured). Check before the run, not during it.
"$VENV/bin/python" - <<'PY' || echo "!! FA3 unavailable -- see STAGE3.md 0.3 for the SSSL-vs-L trade"
import torch, re, urllib.request, json
tv = "torch" + "".join(torch.__version__.split("+")[0].split(".")[:2])
cu = "cu" + (torch.version.cuda or "").replace(".", "")
want = f"{tv}-cxx11-{cu}-x86_64-linux"
url = "https://huggingface.co/api/models/varunneal/flash-attention-3/tree/main/build"
have = {x["path"].split("/")[-1] for x in json.load(urllib.request.urlopen(url, timeout=30))}
print(f"   this image: torch {torch.__version__} -> needs build {want}")
print(f"   {'OK - prebuilt kernel exists' if want in have else 'MISSING - no prebuilt kernel for this combo'}")
major, _ = torch.cuda.get_device_capability()
print(f"   GPU is sm{major}x -> {'Hopper, FA3 usable' if major == 9 else 'NOT Hopper, FA3 will not load'}")
raise SystemExit(0 if want in have else 1)
PY

say "4. pre-flight assertions"
cd ~/ArcherChat
[ -f "$BASE/tokenizer/tokenizer.pkl" ] || { echo "!! tokenizer missing -- rsync it, do NOT retrain"; exit 1; }
[ -f .env ] || echo "!! WARNING: no .env -- Endlex will run offline, you will be blind to progress"
PYTHONPATH=~/ArcherChat "$VENV/bin/python" - <<'PY'
from archerchat.dataloader import list_parquet_files, get_tokenizer
tr, va = list_parquet_files("train"), list_parquet_files("val")
print(f"train shards: {len(tr)}   val: {[p.split('/')[-1] for p in va]}")
print("tokenizer vocab:", get_tokenizer().get_vocab_size())
PY

say "READY -- next: the DDP gates, then d24. See STAGE3.md."
