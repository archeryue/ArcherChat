"""Root conftest: fail loudly when pytest runs outside the project venv.

This repo keeps ``[tool.uv] default-groups = []`` so cloud GPU installs stay
lean — which means a plain ``uv sync`` does NOT install pytest. A bare
``uv run pytest`` then silently falls back to a globally-installed pytest
running under a different interpreter, which can't import ``archerchat`` and
dies with a confusing ModuleNotFoundError at collection time.

Catch that here and say exactly what to run instead.
"""

import importlib.util
import sys

# archerchat alone isn't a reliable probe: pytest prepends the rootdir to
# sys.path, which makes the bare source tree importable from ANY interpreter.
# torch is the anchor runtime dep that only exists in the project venv.
_missing = [m for m in ("archerchat", "torch") if importlib.util.find_spec(m) is None]
if _missing:
    sys.exit(
        "\n"
        f"{' and '.join(_missing)} not importable from this interpreter:\n"
        f"    {sys.executable}\n"
        "\n"
        "You are almost certainly running a globally-installed pytest — the\n"
        "dev dependency group (which contains pytest) is not synced by\n"
        "default in this repo. Run tests with:\n"
        "\n"
        "    uv run --group dev pytest -q\n"
    )
