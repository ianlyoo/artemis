"""Check a pinned commit in a disposable Git worktree and fast-forward main."""

from collections.abc import Iterator
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
import os
import subprocess
from tempfile import TemporaryDirectory
import tomllib

from .judge import CommandEvidence
from .ledger import Check, Ledger, Receipt
from .roles import WorkflowError


def git(repo: Path, *args: str, env: dict[str, str] | None = None) -> str:
    git_env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    git_env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
    git_env.update(env or {})
    return subprocess.run(
        ("git", *args), cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, check=True, timeout=30, env=git_env,
    ).stdout.strip()


@contextmanager
def _checkout(repo: Path, commit: str) -> Iterator[Path]:
    with TemporaryDirectory(prefix="harness-check-") as scratch:
        tree = Path(scratch) / "checkout"
        git(repo, "worktree", "add", "--detach", str(tree), commit)
        try:
            yield tree
        finally:
            git(repo, "worktree", "remove", "--force", str(tree))


class _CheckPlanError(WorkflowError):
    """The candidate's check configuration could not be used."""


def _checks(tree: Path, ledger: Ledger) -> tuple[Check, ...]:
    try:
        with (tree / "ship.toml").open("rb") as config:
            commands = tomllib.load(config).get("checks")
    except (OSError, ValueError):
        raise _CheckPlanError("The candidate needs a readable ship.toml.") from None
    if not isinstance(commands, list) or not commands or any(
        not isinstance(argv, list) or not argv
        or not all(isinstance(arg, str) and arg and "\0" not in arg for arg in argv)
        for argv in commands
    ):
        raise _CheckPlanError("ship.toml needs a list of valid check command arrays.")

    reports = []
    for argv in commands:
        ledger.allow_step()
        try:
            result = CommandEvidence.capture(tree, tuple(argv))
            exit_code, output = result.exit_code, result.output
        except subprocess.TimeoutExpired:
            exit_code, output = 124, "Check timed out."
        except OSError:
            exit_code, output = 127, "Check command could not start."
        reports.append(Check(tuple(argv), exit_code, sha256(output.encode()).hexdigest()))
    return tuple(reports)


def ship(ledger: Ledger, task: int, repo: Path, branch: str) -> Receipt:
    """Run trusted local check commands and apply to a clean main checkout."""
    ledger.allow_step()
    sha = git(repo, "rev-parse", "--verify", f"refs/heads/{branch}^{{commit}}")
    receipt = ledger._ship_receipt(task, sha)
    if receipt is None:
        try:
            with _checkout(repo, sha) as tree:
                checks = _checks(tree, ledger)
        except _CheckPlanError as error:
            return ledger._record_checks(task, sha, (), config_error=str(error))
        receipt = ledger._record_checks(task, sha, checks)
    if receipt.state != "checked":
        return receipt

    def apply() -> bool:
        if git(repo, "symbolic-ref", "--quiet", "HEAD") != "refs/heads/main":
            raise WorkflowError("Check out main before applying a ship.")
        if git(repo, "status", "--porcelain"):
            raise WorkflowError("Main must have a clean working tree.")
        # A prior attempt may have advanced Git before its SQLite transaction committed.
        try:
            git(repo, "merge", "--ff-only", sha)
        except subprocess.CalledProcessError:
            if git(repo, "merge-base", "HEAD", sha) not in {sha, git(repo, "rev-parse", "HEAD")}:
                return False
            raise
        return True

    return ledger._land(task, sha, apply)
