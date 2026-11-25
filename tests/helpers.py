"""Shared fixtures: a throwaway repository, an isolated environment and home, and stand-ins for the parts of
Artemis a test leaves out."""

from contextlib import contextmanager
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
from unittest import mock

from artemis import process

# Obviously fake: only ever used to lock test vaults, which unlock from the environment, never the OS keychain.
FAKE_PASSPHRASE = "fake passphrase for tests"


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


def home_settings(root: Path, extra: str = "") -> Path:
    """An Artemis home folder whose vault unlocks from the environment, never from the OS keychain."""
    root.mkdir(parents=True, exist_ok=True)
    config = root / "config.toml"
    if not config.exists():
        config.write_text('[vault]\nunlock = "env"\n' + extra, encoding="utf-8")
    return root


def isolated_env(home: Path) -> dict[str, str]:
    """The environment for an `artemis` subprocess: its own HOME and ARTEMIS_HOME, Git without the machine's
    settings, and a fake vault passphrase."""
    env = {key: value for key, value in os.environ.items() if not key.startswith(("GIT_", "ARTEMIS_"))}
    artemis = home_settings(home / ".artemis")
    env.update(HOME=str(home), USERPROFILE=str(home), XDG_CONFIG_HOME=str(home), GIT_CONFIG_NOSYSTEM="1",
               ARTEMIS_HOME=str(artemis), ARTEMIS_VAULT_PASSPHRASE=FAKE_PASSPHRASE)
    return env


@contextmanager
def vault_env():
    """A fake vault passphrase for a Home built in this process."""
    with mock.patch.dict(os.environ, {"ARTEMIS_VAULT_PASSPHRASE": FAKE_PASSPHRASE}):
        yield


def wait_for(condition, timeout_s: float = 60, step_s: float = 0.1, what: str = "the condition"):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        value = condition()
        if value:
            return value
        time.sleep(step_s)
    raise AssertionError(f"timed out after {timeout_s:.0f} s waiting for {what}")


class Broker:
    """Stand-in for the broker: records recoveries and the cards it was asked to run."""

    def __init__(self, home):
        self.home, self.recovered, self.ran = home, 0, []

    def recover(self):
        self.recovered += 1

    def run_card(self, card: int):
        from artemis.roles import Role
        if self.home.ledger.claim_card(Role.HOME, card):
            self.ran.append(card)
            self.home.ledger.finish_card(Role.HOME, card, "done", "ran (stand-in broker)")


class Lead:
    """Stand-in for the lead runner: records why it was woken."""

    def __init__(self, home):
        self.home, self.wakes = home, []

    def wake(self, reason: str):
        self.wakes.append(reason)


def serve(test, env: dict[str, str], *args: str) -> subprocess.Popen:
    """Start `artemis serve` in a subprocess and wait until it says it is ready. On Windows it gets a process group
    of its own, so stop_home can give it Ctrl+Break."""
    child = subprocess.Popen((sys.executable, "-m", "artemis.cli", "serve", "--port", "0", "--no-open", *args),
                             env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             encoding="utf-8", **(process.group() if process.WINDOWS else {}))
    test.addCleanup(stop_home, child)
    child.said = []
    for line in child.stdout:
        child.said.append(line)
        if "Home ready" in line:
            # Keep reading, so a full pipe never blocks the home's log.
            child.drain = threading.Thread(target=lambda: child.said.extend(child.stdout), daemon=True)
            child.drain.start()
            return child
    raise AssertionError("artemis serve ended before it was ready:\n" + "".join(child.said))


def stop_home(child: subprocess.Popen) -> None:
    """Stop a home as a person does, so it closes: Ctrl+Break on Windows (terminate() there ends it without
    running close()), SIGTERM elsewhere."""
    if child.poll() is None:
        child.send_signal(signal.CTRL_BREAK_EVENT if process.WINDOWS else signal.SIGTERM)
        try:
            child.wait(30)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(10)
    if getattr(child, "drain", None):
        child.drain.join(10)
    child.stdout.close()
