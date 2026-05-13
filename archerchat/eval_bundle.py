"""
Eval-bundle download + placement. Extracted from nanochat/scripts/base_eval.py
so the copy-tier tasks/ and core_eval.py have a stable home for the bundle
URL and unzip flow. Keep the cache path layout identical to nanochat — Stage 1
artifacts under ~/.cache/nanochat/eval_bundle/ must interop.

Source: https://github.com/karpathy/nanochat scripts/base_eval.py
"""

import os
import shutil
import tempfile
import zipfile

from archerchat.common import download_file_with_lock, get_base_dir, print0

EVAL_BUNDLE_URL = "https://karpathy-public.s3.us-west-2.amazonaws.com/eval_bundle.zip"


def place_eval_bundle(file_path):
    """Unzip eval_bundle.zip into base_dir/eval_bundle/."""
    base_dir = get_base_dir()
    eval_bundle_dir = os.path.join(base_dir, "eval_bundle")
    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(file_path, "r") as zip_ref:
            zip_ref.extractall(tmpdir)
        extracted_bundle_dir = os.path.join(tmpdir, "eval_bundle")
        shutil.move(extracted_bundle_dir, eval_bundle_dir)
    print0(f"Placed eval_bundle directory at {eval_bundle_dir}")


def ensure_eval_bundle():
    """Idempotent: download + unzip the eval bundle if not already present.

    Returns the path to the unpacked eval_bundle/ directory.
    """
    base_dir = get_base_dir()
    eval_bundle_dir = os.path.join(base_dir, "eval_bundle")
    if not os.path.exists(eval_bundle_dir):
        download_file_with_lock(
            EVAL_BUNDLE_URL, "eval_bundle.zip", postprocess_fn=place_eval_bundle
        )
    return eval_bundle_dir
