"""Check a pinned commit in a disposable Git worktree and fast-forward main."""

from collections.abc import Iterator
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
import os
import subprocess
from tempfile import TemporaryDirectory
import tomllib

from .config import check_plan
from .judge import CommandEvidence
from .ledger import Check, Ledger, Receipt
from .process import checkout_env
from .roles import WorkflowError


def git(repo: Path, *args: str, env: dict[str, str] | None = None) -> str:
    git_env = checkout_env()
    git_env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
    git_env.update(env or {})
    return subprocess.run(
        ("git", *args), cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, check=True, timeout=30, env=git_env,
    ).stdout.strip()


@contextmanager
def checkout(repo: Path, commit: str) -> Iterator[Path]:
    with TemporaryDirectory(prefix="harness-check-") as scratch:
        tree = Path(scratch) / "checkout"
        git(repo, "worktree", "add", "--detach", str(tree), commit)
        try:
            yield tree
        finally:
            git(repo, "worktree", "remove", "--force", str(tree))


class _CheckPlanError(WorkflowError):
    """The candidate's check configuration could not be used."""


def _candidate_checks(tree: Path) -> tuple[tuple[str, ...], ...]:
    try:
        with (tree / "ship.toml").open("rb") as config:
            commands = tomllib.load(config).get("checks")
    except (OSError, ValueError):
        raise _CheckPlanError("The candidate needs a readable ship.toml.") from None
    try:
        return check_plan(commands, "ship.toml checks")
    except WorkflowError as error:
        raise _CheckPlanError(str(error)) from None


def _checks(tree: Path, ledger: Ledger, commands: tuple[tuple[str, ...], ...]) -> tuple[Check, ...]:
    reports = []
    for argv in commands:
        ledger.allow_step()
        result = CommandEvidence.capture(tree, argv)
        reports.append(Check(argv, result.exit_code, sha256(result.output.encode()).hexdigest()))
    return tuple(reports)


def _require_main(repo: Path) -> None:
    if git(repo, "symbolic-ref", "--quiet", "HEAD") != "refs/heads/main":
        raise WorkflowError("Check out main before applying a ship.")
    if git(repo, "status", "--porcelain"):
        raise WorkflowError("Main must have a clean working tree.")


def ship(ledger: Ledger, task: int, repo: Path, branch: str, *,
         commands: tuple[tuple[str, ...], ...] | None = None) -> Receipt:
    """Run trusted local check commands and apply to a clean main checkout."""
    ledger.allow_step()
    sha = git(repo, "rev-parse", "--verify", f"refs/heads/{branch}^{{commit}}")
    receipt = ledger._ship_receipt(task, sha)
    if receipt is None:
        _require_main(repo)
        try:
            with checkout(repo, sha) as tree:
                plan = _candidate_checks(tree) if commands is None else commands
                checks = _checks(tree, ledger, plan)
        except _CheckPlanError as error:
            return ledger._record_checks(task, sha, (), config_error=str(error))
        receipt = ledger._record_checks(task, sha, checks)
    if receipt.state != "checked":
        return receipt

    def apply() -> bool:
        _require_main(repo)
        # A prior attempt may have advanced Git before its SQLite transaction committed.
        try:
            git(repo, "merge", "--ff-only", sha)
        except subprocess.CalledProcessError:
            if git(repo, "merge-base", "HEAD", sha) not in {sha, git(repo, "rev-parse", "HEAD")}:
                return False
            raise
        return True

    return ledger._land(task, sha, apply)
