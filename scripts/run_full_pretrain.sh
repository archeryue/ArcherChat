#!/usr/bin/env bash
# Resilient full pretrain for a flaky (WSL2) GPU box: checkpoint frequently and
# auto-resume on any crash (WSL `dxgkio_make_resident` faults, external SIGTERM, OOM).
#
# Usage: run_full_pretrain.sh <depth> [extra base_train.py args...]
#   e.g. run_full_pretrain.sh 8 --device-batch-size 8 --eval-tokens 10485760 --checkpoint-every 100
set -u

DEPTH="${1:?usage: run_full_pretrain.sh <depth> [args...]}"; shift || true
HOME_DIR="$HOME"
CKPT="$HOME_DIR/.cache/nanochat/base_checkpoints/d${DEPTH}_archer"
LOG="$HOME_DIR/ArcherChat/d${DEPTH}_full_run.log"
RUN_NAME="${RUN_NAME:-archerchat-d${DEPTH}-pretrain}"   # Endlex run name (override via env)

# expandable_segments reduces allocator fragmentation — the main mitigation for WSL's
# dxgkrnl make_resident (-12 ENOMEM) failures under sustained load.
export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
# Keep checkpoints local — don't push 300+ MB per save over the Endlex tunnel (metric
# streaming is unaffected). Override with ENDLEX_UPLOAD_CHECKPOINTS=1 if you want archival.
export ENDLEX_UPLOAD_CHECKPOINTS="${ENDLEX_UPLOAD_CHECKPOINTS:-0}"

mkdir -p "$CKPT"
cd "$HOME_DIR/ArcherChat" || exit 1
: > "$LOG"

for attempt in $(seq 1 30); do
    if ls "$CKPT"/model_*.pt >/dev/null 2>&1; then RESUME="--resume"; else RESUME=""; fi
    echo "===== attempt ${attempt}  resume=${RESUME:-none}  $(date -u +%H:%M:%S)Z =====" >> "$LOG"
    .venv/bin/python scripts/base_train.py \
        --depth "$DEPTH" --window-pattern L \
        --ckpt-dir "$CKPT" --run "$RUN_NAME" \
        "$@" $RESUME >> "$LOG" 2>&1
    ec=$?
    if grep -q "done: pretrain" "$LOG"; then
        echo "===== COMPLETED on attempt ${attempt} =====" >> "$LOG"
        break
    fi
    echo "===== attempt ${attempt} died (ec=${ec}); will resume =====" >> "$LOG"
done

echo "---- final log tail ----"
tail -45 "$LOG"
