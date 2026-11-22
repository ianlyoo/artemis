#!/bin/sh
# Refresh transcript.txt from `artemis demo` (mock workers, no account), then redraw the README images.
set -eu
demo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
artemis_bin=$(command -v artemis)
python3 - "$demo_dir" "$artemis_bin" <<'PY'
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

with TemporaryDirectory(prefix="artemis-record-") as scratch:
    env = os.environ | {
        "HOME": scratch, "XDG_CONFIG_HOME": scratch, "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
    }
    transcript = subprocess.check_output([sys.argv[2], "demo"], cwd=scratch, env=env)

(Path(sys.argv[1]) / "transcript.txt").write_bytes(transcript)
PY
python3 "$demo_dir/../../assets/readme/render.py"
