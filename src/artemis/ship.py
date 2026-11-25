"""Merge a judged commit onto main in a disposable worktree, check the result, then move main."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path, PurePosixPath
import subprocess
from tempfile import TemporaryDirectory

from .config import STATE
from .judge import CommandEvidence
from .ledger import Check, Ledger
from .process import checkout_env
from .roles import WorkflowError


WORKER_NAME, WORKER_EMAIL = "Worker", "noreply@example.invalid"
FALLBACK_IDENTITY = {"GIT_AUTHOR_NAME": WORKER_NAME, "GIT_AUTHOR_EMAIL": WORKER_EMAIL,
                     "GIT_COMMITTER_NAME": WORKER_NAME, "GIT_COMMITTER_EMAIL": WORKER_EMAIL}
Capture = Callable[[Path, tuple[str, ...]], CommandEvidence]


def git(repo: Path, *args: str, env: dict[str, str] | None = None, timeout: int = 120,
        check: bool = True) -> str:
    git_env = checkout_env()
    git_env.update(env or {})
    return subprocess.run(
        ("git", *args), cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
        text=True, encoding="utf-8", errors="surrogateescape", check=check, timeout=timeout, env=git_env,
    ).stdout.strip()


def identity(repo: Path) -> dict[str, str]:
    """Commit as the repository's configured user, or as Artemis where none is set."""
    try:
        git(repo, "config", "user.email")
        git(repo, "config", "user.name")
    except subprocess.CalledProcessError:
        return dict(FALLBACK_IDENTITY)
    return {}


def is_ancestor(repo: Path, ancestor: str, descendant: str) -> bool:
    try:
        git(repo, "merge-base", "--is-ancestor", ancestor, descendant)
    except subprocess.CalledProcessError as error:
        if error.returncode == 1:
            return False
        raise
    return True


@contextmanager
def checkout(repo: Path, commit: str) -> Iterator[Path]:
    with TemporaryDirectory(prefix="artemis-check-") as scratch:
        tree = Path(scratch) / "checkout"
        git(repo, "worktree", "add", "--detach", str(tree), commit)
        try:
            yield tree
        finally:
            git(repo, "worktree", "remove", "--force", str(tree))


def _reserved_entry(repo: Path, sha: str) -> str | None:
    reserved = PurePosixPath(STATE.as_posix().casefold())
    entries = git(repo, "ls-tree", "--full-tree", "-r", "-t", "-z", "--name-only", sha)
    for name in filter(None, entries.split("\0")):
        if PurePosixPath(name.casefold()).is_relative_to(reserved):
            return name
    return None


@dataclass(frozen=True)
class Landing:
    state: str          # applied, conflict, red, blocked
    detail: str
    candidate: str = ""


def _merge(repo: Path, base: str, sha: str, message: str) -> str | None:
    """Return the commit that puts sha on top of base, or None when they conflict."""
    if is_ancestor(repo, base, sha):
        return sha
    with TemporaryDirectory(prefix="artemis-merge-") as scratch:
        tree = Path(scratch) / "merge"
        git(repo, "worktree", "add", "--detach", str(tree), base)
        try:
            try:
                git(tree, "-c", "commit.gpgsign=false", "merge", "--no-ff", "--no-edit", "-m", message, sha,
                    env=identity(repo))
            except subprocess.CalledProcessError:
                return None
            return git(tree, "rev-parse", "HEAD")
        finally:
            git(repo, "worktree", "remove", "--force", str(tree))


def _advance(repo: Path, ref: str, base: str, candidate: str) -> bool:
    """Fast-forward the target from base to candidate. False when it moved or local edits are in the way."""
    head = git(repo, "symbolic-ref", "--quiet", "HEAD", check=False)
    if head == ref:
        if git(repo, "rev-parse", ref) != base:
            return False
        try:
            git(repo, "merge", "--ff-only", "--no-autostash", candidate)
        except subprocess.CalledProcessError:
            return False
        return True
    try:
        git(repo, "update-ref", ref, candidate, base)
    except subprocess.CalledProcessError:
        return False
    return True


def ship(ledger: Ledger, task: int, sha: str, repo: Path, title: str, *,
         commands: tuple[tuple[str, ...], ...], target: str = "main", capture: Capture | None = None) -> Landing:
    """Land a passed commit: merge onto the target branch, run the checks on the merge, fast-forward it.

    One landing at a time per repository: the caller holds the project's lane (Home.lane).
    """
    capture = CommandEvidence.capture if capture is None else capture
    ref = f"refs/heads/{target}"
    ledger.allow_step()
    if ledger.ship_receipt(task, sha) is not None:
        raise WorkflowError("This commit already has a ship receipt.")
    base = git(repo, "rev-parse", "--verify", ref)
    blocked = _reserved_entry(repo, sha)
    if blocked is not None:
        ledger.record_checks(task, sha, sha, (), target=target,
                             problem=f"The commit tracks {blocked}, which Artemis keeps local.")
        return Landing("blocked", f"the commit tracks {blocked}")
    if is_ancestor(repo, sha, base):
        candidate = base
    else:
        candidate = _merge(repo, base, sha, f"Land task {task}: {title}")
        if candidate is None:
            return Landing("conflict", f"the branch conflicts with {target}")
    reports = []
    with checkout(repo, candidate) as tree:
        for argv in commands:
            ledger.allow_step()
            result = capture(tree, argv)
            reports.append(Check(argv, result.exit_code, sha256(result.output.encode()).hexdigest()))
            if result.exit_code:
                ledger.record_checks(task, sha, candidate, tuple(reports), target=target)
                tail = result.output.strip()[-800:]
                return Landing("red", f"{' '.join(argv)} exited {result.exit_code} on the merged result:\n{tail}",
                               candidate)
    ledger.record_checks(task, sha, candidate, tuple(reports), target=target)
    moved = _advance(repo, ref, base, candidate)
    receipt = ledger.land(task, sha, moved)
    if not moved:
        return Landing("blocked", f"{target} moved or has local edits in the way", candidate)
    return Landing("applied", f"{target} is {candidate[:7]}", receipt.candidate)
