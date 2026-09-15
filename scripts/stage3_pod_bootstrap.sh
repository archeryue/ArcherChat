#!/usr/bin/env bash
# Bootstrap a fresh multi-GPU pod for ArcherChat DDP validation.
#
# Everything here runs ON THE POD, on the meter — so it does exactly one thing per line
# and nothing interactive. Run it once, then drive the gates by hand.
#
#   BRANCH=claude/stage2-verification-d8-d12 SHARDS=20 bash stage3_pod_bootstrap.sh
#
# Expects (rsync these in FIRST, they are small):
#   ~/.cache/nanochat/tokenizer/{tokenizer.pkl,token_bytes.pt}   540 KB
#   .env with ENDLEX_URL / ENDLEX_TOKEN                          (optional)
set -euo pipefail

BRANCH="${BRANCH:-claude/stage2-verification-d8-d12}"
SHARDS="${SHARDS:-10}"          # 10 == exactly what runs/d8_local.sh used, so a fresh pod
                                # reproduces the d8 ORACLE CORPUS with no pinning needed
                                # (d12 would need ~20; d24 ~170)
BASE="$HOME/.cache/nanochat"

echo "=== 1. repo ==="
[ -d ~/ArcherChat ] || git clone -b "$BRANCH" https://github.com/archeryue/ArcherChat.git ~/ArcherChat
cd ~/ArcherChat && git checkout "$BRANCH" && git pull --ff-only

echo "=== 2. python env ==="
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv sync --extra gpu

echo "=== 3. dataset ==="
# ArcherChat has no dataset downloader of its own — dataloader._artifact_dir() only LOOKS
# for base_data_climbmix under ~/.cache/{archerchat,nanochat}. nanochat owns the fetcher,
# so we borrow it and write into the directory ArcherChat already falls back to.
mkdir -p "$BASE"
[ -d ~/nanochat ] || git clone https://github.com/karpathy/nanochat.git ~/nanochat
cd ~/nanochat
NANOCHAT_BASE_DIR="$BASE" uv run python -m nanochat.dataset -n "$SHARDS"

echo "=== 4. sanity ==="
cd ~/ArcherChat
ls "$BASE/tokenizer" || { echo "!! tokenizer missing — rsync it before running"; exit 1; }
nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader
.venv/bin/python -c "
from archerchat.dataloader import list_parquet_files, get_tokenizer
tr, va = list_parquet_files('train'), list_parquet_files('val')
print(f'train shards: {len(tr)}   val: {[p.split(\"/\")[-1] for p in va]}')
t = get_tokenizer(); print('tokenizer vocab:', t.get_vocab_size())
"
echo
echo "ready. next:"
echo "  .venv/bin/python scripts/oracle_ddp_check.py --world-size 8     # gate 1, ~2 min"
echo "  torchrun --standalone --nproc_per_node=8 scripts/base_train.py \\"
echo "     --depth 8 --window-pattern L --device-batch-size 16 \\"
echo "     --eval-every 200 --eval-tokens 4194304 --checkpoint-every 1920 \\"
echo "     --ckpt-dir \$HOME/.cache/nanochat/base_checkpoints/d8_ddp --run archerchat-d8-ddp"
echo "     # target: val_bpb 0.9376 (oracle) / 0.9449 (our single-GPU v3), band +/-0.01"
