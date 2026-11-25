#!/bin/sh
# Run the README quickstart as written, in a scratch home whose path has spaces and non-ASCII letters, and check that
# the demo ends in the digest.
#   sh tests/readme_quickstart.sh             the sh blocks (macOS, Linux, Git Bash on Windows)
#   sh tests/readme_quickstart.sh powershell  the PowerShell blocks, in Windows PowerShell (or pwsh)
# The installer is piped in from this checkout instead of fetched, and installs ARTEMIS_INSTALL_SOURCE (default: this
# checkout), so a commit is tested before it is pushed. With ARTEMIS_VAULT_PASSPHRASE set (CI), the home unlocks its
# vault from the environment rather than a keychain the runner lacks.
set -eu
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
python=
for candidate in python3 python; do  # on Windows python3 may be the Microsoft Store stub, which fails
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c '' >/dev/null 2>&1; then python=$candidate; break; fi
done
"${python:?Python is needed}" - "$repo" "${ARTEMIS_INSTALL_SOURCE:-$repo}" "${1:-sh}" <<'PY'
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory

RAW = "https://raw.githubusercontent.com/ianlyoo/artemis/main/"
INSTALL = {"sh": f"curl -fsSL {RAW}install.sh | sh", "powershell": f"irm {RAW}install.ps1 | iex"}
DIGEST = (r"asked you \d+\S \S \d+ done \S 0 stuck", r"(?m)^\s*decided\s+D\d+ ")


def block(path, heading, language):
    readme = path.read_text(encoding="utf-8")
    _, start, tail = readme.partition("<!-- quickstart:begin -->")
    quickstart, end, _ = tail.partition("<!-- quickstart:end -->")
    if not start or not end:
        raise SystemExit(f"Quickstart markers are missing in {path.name}.")
    section = quickstart.split(f"\n### {heading}\n", 1)[1].split("\n### ", 1)[0]
    if f"\n```{language}\n" not in section:
        return None
    return section.split(f"\n```{language}\n", 1)[1].split("\n```", 1)[0] + "\n"


sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # a Windows console code page cannot print every line
repo, source, shell = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
language = "powershell" if shell in ("powershell", "pwsh") else "sh"
blocks = {}
for name, (english, korean) in {"install": ("Install", "설치"), "demo": ("Run the demo", "데모 실행")}.items():
    found = block(repo / "README.md", english, language) or block(repo / "README.md", english, "sh")
    if found is None or found != (block(repo / "README.ko.md", korean, language) or
                                  block(repo / "README.ko.md", korean, "sh")):
        raise SystemExit(f"The English and Korean {name} commands differ, or there is no {language} block.")
    blocks[name] = found
if INSTALL[language] not in blocks["install"]:
    raise SystemExit(f"The {language} install block no longer runs: {INSTALL[language]}")

installer = (repo / f"install.{'ps1' if language == 'powershell' else 'sh'}").resolve()
if language == "sh":
    install = blocks["install"].replace(INSTALL["sh"], f"sh < '{installer.as_posix()}'")
else:
    path = str(installer).replace("'", "''")
    install = blocks["install"].replace(INSTALL["powershell"], f"Get-Content -Raw -LiteralPath '{path}' | iex")

with TemporaryDirectory(prefix="readme quickstart ") as scratch:
    root = Path(scratch) / "Ärtemis home ü"
    home, work, bin_dir = (root / part for part in ("home", "work", "bin"))
    for folder in (home, work):
        folder.mkdir(parents=True)
    env = {key: value for key, value in os.environ.items() if not key.startswith(("GIT_", "PIPX_", "UV_", "ARTEMIS_"))}
    env.update(HOME=str(home), USERPROFILE=str(home), XDG_CONFIG_HOME=str(home), GIT_CONFIG_NOSYSTEM="1",
               GIT_CONFIG_GLOBAL=os.devnull, PIPX_HOME=str(root / "pipx"), PIPX_BIN_DIR=str(bin_dir), UV_TOOL_BIN_DIR=str(bin_dir),
               ARTEMIS_INSTALL_SOURCE=source, PATH=os.pathsep.join((str(bin_dir), os.environ["PATH"])))
    if os.environ.get("ARTEMIS_VAULT_PASSPHRASE"):
        env["ARTEMIS_VAULT_PASSPHRASE"] = os.environ["ARTEMIS_VAULT_PASSPHRASE"]
        (home / ".artemis").mkdir()
        (home / ".artemis" / "config.toml").write_text('[vault]\nunlock = "env"\n', encoding="utf-8")

    def run(text):
        print("$ " + text.strip().replace("\n", "\n$ "), flush=True)
        if language == "sh":
            argv = ("sh", "-eu")
            return subprocess.run(argv, cwd=work, input=text, env=env, stdout=subprocess.PIPE, text=True,
                                  encoding="utf-8", errors="replace")
        # A script piped into iex fails by throwing; its last program (artemis doctor) may exit non-zero by design.
        lines = ["$ErrorActionPreference = 'Stop'"] + [
            line if line.rstrip().endswith("| iex") else
            f"$global:LASTEXITCODE = 0\n{line}\nif ($LASTEXITCODE) {{ exit $LASTEXITCODE }}"
            for line in text.splitlines() if line.strip()]
        script = root / "block.ps1"  # a BOM, so Windows PowerShell reads the non-ASCII path as UTF-8
        script.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")
        program = shutil.which(shell) or shutil.which("pwsh")
        argv = (program, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(script))
        # Artemis prints UTF-8 and PowerShell passes a program's output through as it is.
        return subprocess.run(argv, cwd=work, env=env, stdout=subprocess.PIPE, text=True, encoding="utf-8",
                              errors="replace")

    for name in ("install", "demo"):
        result = run(install if name == "install" else blocks["demo"])
        print(result.stdout, end="", flush=True)
        if result.returncode:
            raise SystemExit(f"The {name} block failed with exit {result.returncode}.")
    missing = [pattern for pattern in DIGEST if not re.search(pattern, result.stdout)]
    if missing:
        raise SystemExit("The demo did not end in the expected digest; missing: " + "; ".join(missing))
    print(f"quickstart ok ({language}): the demo ended in the digest")
PY
