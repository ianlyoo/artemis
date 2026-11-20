#!/bin/sh
# Use --install to run the install block. Run the default mode in that environment.
set -eu
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
python3 - "$repo" "${1:-quickstart}" <<'PY'
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory


def block(path, heading):
    section = path.read_text(encoding="utf-8").split(f"\n### {heading}\n", 1)[1]
    return section.split("\n```sh\n", 1)[1].split("\n```", 1)[0]


repo = Path(sys.argv[1])
mode = sys.argv[2]
if mode not in {"--install", "quickstart"}:
    raise SystemExit("Usage: tests/readme_quickstart.sh [--install]")
blocks = {}
for name, (english, korean) in {
    "--install": ("Install", "설치"),
    "quickstart": ("Run a project", "프로젝트 실행"),
}.items():
    script = block(repo / "README.md", english)
    if script != block(repo / "README.ko.md", korean):
        raise SystemExit(f"The English and Korean {name} commands differ.")
    blocks[name] = script + "\n"

if mode == "--install":
    raise SystemExit(subprocess.run(("sh", "-eu"), cwd=repo, input=blocks[mode], text=True).returncode)

with TemporaryDirectory(prefix="readme-quickstart-") as scratch:
    home = Path(scratch) / "home"
    cwd = Path(scratch) / "work"
    home.mkdir()
    cwd.mkdir()
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env.update(HOME=str(home), XDG_CONFIG_HOME=str(home),
               GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
    result = subprocess.run(("sh", "-eu"), cwd=cwd, input=blocks[mode], text=True, env=env)
    raise SystemExit(result.returncode)
PY
