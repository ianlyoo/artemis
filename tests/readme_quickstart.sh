#!/bin/sh
# Run the README quickstart as written, in a scratch home, and check that the demo ends in the digest.
# The install line installs ARTEMIS_INSTALL_SOURCE instead of the public URL (default: this checkout),
# so a commit is tested before it is pushed.
set -eu
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
python3 - "$repo" "${ARTEMIS_INSTALL_SOURCE:-$repo}" <<'PY'
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

URL = "git+https://github.com/ianlyoo/artemis"
DIGEST = ("3 tasks done · asked you 1× · nothing stuck", "decided   D1 Post a release note to the team")


def block(path, heading):
    readme = path.read_text(encoding="utf-8")
    _, start, tail = readme.partition("<!-- quickstart:begin -->")
    quickstart, end, _ = tail.partition("<!-- quickstart:end -->")
    if not start or not end:
        raise SystemExit(f"Quickstart markers are missing in {path.name}.")
    section = quickstart.split(f"\n### {heading}\n", 1)[1]
    return section.split("\n```sh\n", 1)[1].split("\n```", 1)[0] + "\n"


repo, source = Path(sys.argv[1]), sys.argv[2]
blocks = {}
for name, (english, korean) in {"install": ("Install", "설치"), "demo": ("Run the demo", "데모 실행")}.items():
    blocks[name] = block(repo / "README.md", english)
    if blocks[name] != block(repo / "README.ko.md", korean):
        raise SystemExit(f"The English and Korean {name} commands differ.")
if URL not in blocks["install"]:
    raise SystemExit(f"The install block no longer installs {URL}.")

with TemporaryDirectory(prefix="readme-quickstart-") as scratch:
    home, work, bin_dir = (Path(scratch) / part for part in ("home", "work", "bin"))
    for folder in (home, work):
        folder.mkdir()
    env = {key: value for key, value in os.environ.items() if not key.startswith(("GIT_", "PIPX_"))}
    env.update(HOME=str(home), XDG_CONFIG_HOME=str(home), GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
               PIPX_HOME=str(Path(scratch) / "pipx"), PIPX_BIN_DIR=str(bin_dir),
               PATH=os.pathsep.join((str(bin_dir), env["PATH"])))
    install = blocks["install"].replace(URL, source)
    print(f"$ {install.strip()}", flush=True)
    subprocess.run(("sh", "-eu"), cwd=work, input=install, text=True, env=env, check=True)
    print(f"$ {blocks['demo'].strip()}", flush=True)
    result = subprocess.run(("sh", "-eu"), cwd=work, input=blocks["demo"], text=True, env=env,
                            stdout=subprocess.PIPE, encoding="utf-8")
    print(result.stdout, end="")
    if result.returncode:
        raise SystemExit(result.returncode)
    missing = [line for line in DIGEST if line not in result.stdout]
    if missing:
        raise SystemExit("The demo did not end in the expected digest; missing: " + "; ".join(missing))
    print("quickstart ok: the demo ended in the digest")
PY
