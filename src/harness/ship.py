"""Check a pinned commit in a disposable Git worktree and fast-forward main."""

from collections.abc import Iterator
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path, PurePosixPath
import os
import subprocess
from tempfile import TemporaryDirectory

from .config import DEFAULT_LEDGER
from .judge import CommandEvidence
from .ledger import Check, Ledger, Receipt
from .process import checkout_env
from .roles import WorkflowError


MAIN = "refs/heads/main"


def git(repo: Path, *args: str, env: dict[str, str] | None = None) -> str:
    git_env = checkout_env()
    git_env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
    git_env.update(env or {})
    return subprocess.run(
        ("git", *args), cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="surrogateescape", check=True, timeout=30, env=git_env,
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


def _reserved_entry(repo: Path, sha: str, database: Path) -> str | None:
    reserved = [PurePosixPath(DEFAULT_LEDGER.parent.as_posix())]
    root = repo.resolve()
    database = database.resolve()
    if database.is_relative_to(root):
        relative = database.relative_to(root).as_posix()
        reserved.extend(PurePosixPath(relative + suffix) for suffix in ("", "-journal", "-wal", "-shm"))
    local_paths = [PurePosixPath(path.as_posix().casefold()) for path in reserved]
    entries = git(repo, "ls-tree", "--full-tree", "-r", "-t", "-z", sha)
    for entry in filter(None, entries.split("\0")):
        metadata, name = entry.split("\t", 1)
        kind = metadata.split()[1]
        candidate = PurePosixPath(name.casefold())
        if any(candidate.is_relative_to(path) or (kind != "tree" and path.is_relative_to(candidate))
               for path in local_paths):
            return name
    return None


def _checks(tree: Path, ledger: Ledger, commands: tuple[tuple[str, ...], ...]) -> tuple[Check, ...]:
    reports = []
    for argv in commands:
        ledger.allow_step()
        result = CommandEvidence.capture(tree, argv)
        reports.append(Check(argv, result.exit_code, sha256(result.output.encode()).hexdigest()))
    return tuple(reports)


def _require_main(repo: Path) -> None:
    if git(repo, "symbolic-ref", "--quiet", "HEAD") != MAIN:
        raise WorkflowError("Check out main before applying a ship.")
    if git(repo, "status", "--porcelain"):
        raise WorkflowError("Main must have a clean working tree.")


def _is_ancestor(repo: Path, ancestor: str, descendant: str) -> bool:
    try:
        git(repo, "merge-base", "--is-ancestor", ancestor, descendant)
    except subprocess.CalledProcessError as error:
        if error.returncode == 1:
            return False
        raise
    return True


def ship(ledger: Ledger, task: int, repo: Path, branch: str, *,
         commands: tuple[tuple[str, ...], ...]) -> Receipt:
    """Run the operator's checks on the candidate, then apply to a clean main checkout."""
    ledger.allow_step()
    sha = git(repo, "rev-parse", "--verify", f"refs/heads/{branch}^{{commit}}")
    receipt = ledger._ship_receipt(task, sha)
    if receipt is not None and receipt.state != "checked":
        return receipt
    blocked = _reserved_entry(repo, sha, ledger.path)
    if blocked is not None:
        return ledger._record_checks(task, sha, (), preflight_error=f"Candidate tracks reserved path {blocked}.")
    if receipt is None:
        _require_main(repo)
        with checkout(repo, sha) as tree:
            checks = _checks(tree, ledger, commands)
        receipt = ledger._record_checks(task, sha, checks)
    if receipt.state != "checked":
        return receipt

    def apply() -> bool:
        _require_main(repo)
        try:
            git(repo, "merge", "--ff-only", "--no-squash", "--no-autostash", "--no-overwrite-ignore", sha)
        except subprocess.CalledProcessError:
            if not (_is_ancestor(repo, MAIN, sha) or _is_ancestor(repo, sha, MAIN)):
                return False
            raise
        # Containment also covers a retry after Git applied and the ledger write failed.
        if not _is_ancestor(repo, sha, MAIN):
            raise WorkflowError("Git returned success without including the candidate in main.")
        return True

    return ledger._land(task, sha, apply)
