#!/bin/sh
# Run with harness installed to refresh the synthetic transcript.
set -eu
demo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
harness_bin=$(command -v harness)
python3 - "$demo_dir" "$harness_bin" <<'PY'
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

with TemporaryDirectory(prefix="harness-record-") as scratch:
    env = os.environ | {
        "HOME": scratch, "XDG_CONFIG_HOME": scratch, "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
    }
    transcript = subprocess.check_output([sys.argv[2], "demo"], cwd=scratch, env=env)

(Path(sys.argv[1]) / "transcript.txt").write_bytes(transcript)
PY
