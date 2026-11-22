"""Shared fixtures: a throwaway repository and an isolated Git environment."""

import os
from pathlib import Path
import subprocess


def git(repo: Path, *args: str) -> str:
    return subprocess.run(("git", *args), cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


def repository(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    git(path, "init", "-q", "-b", "main")
    git(path, "config", "user.name", "Demo User")
    git(path, "config", "user.email", "demo@example.invalid")
    git(path, "config", "commit.gpgsign", "false")
    (path / "app.py").write_text("VALUE = 1\n", encoding="utf-8", newline="\n")
    (path / "test_app.py").write_text(
        "import unittest\n\nimport app\n\n\nclass T(unittest.TestCase):\n"
        "    def test_value(self):\n        self.assertGreater(app.VALUE, 0)\n", encoding="utf-8", newline="\n")
    git(path, "add", ".")
    git(path, "commit", "-qm", "Start")
    return path


def commit(repo: Path, branch: str, name: str, text: str, *, base: str = "main") -> str:
    git(repo, "switch", "-q", "-c", branch, base)
    (repo / name).write_text(text, encoding="utf-8", newline="\n")
    git(repo, "add", ".")
    git(repo, "commit", "-qm", f"Change {name}")
    sha = git(repo, "rev-parse", "HEAD")
    git(repo, "switch", "-q", "main")
    return sha


def isolated_env(home: Path) -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if not key.startswith(("GIT_", "ARTEMIS_"))}
    env.update(HOME=str(home), XDG_CONFIG_HOME=str(home), GIT_CONFIG_NOSYSTEM="1")
    return env
