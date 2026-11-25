"""Evidence records and a replaceable, read-only judgment rule.

A criterion names exactly one thing to look at: a command that must exit 0, an artifact in the commit, or, for
work on a folder, a host check: a file exists and changed since the task started, a file contains a text, at least N
files match a glob, or every file of a set is still there, byte for byte, somewhere else (its digest is preserved).

For the host checks that compare with the start, the supervisor calls snapshot() before the worker starts and passes
the result to capture() afterwards.
"""

from dataclasses import dataclass
from hashlib import sha256
import os
from pathlib import Path
from typing import ClassVar, Literal, Protocol
import subprocess

from .process import check_env, executable as default_executable


def _within(root: Path, path: str) -> Path:
    """`path` under `root` with symlinks resolved. A path that leaves `root` is refused."""
    relative = Path(path)
    target = (root / relative).resolve()
    if not path or relative.is_absolute() or ".." in relative.parts or not target.is_relative_to(root.resolve()):
        raise ValueError("Use a path inside the project.")
    return target


def _files(root: Path, pattern: str) -> list[Path]:
    """The files `pattern` names inside root: a folder's files at any depth, a file, or a glob's matches."""
    if not pattern or Path(pattern).is_absolute():
        raise ValueError("Use a path or glob inside the project.")
    base = root.resolve()
    named = (root / pattern).resolve()
    if ".." not in Path(pattern).parts and named.is_relative_to(base) and named.is_dir():
        found = [Path(folder) / name for folder, _, names in os.walk(named) for name in names]
    else:
        found = list(root.glob(pattern))
    return sorted({path.resolve() for path in found if path.is_file() and path.resolve().is_relative_to(base)})


def _digest(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        while block := stream.read(1 << 20):
            digest.update(block)
    return digest.hexdigest()


def snapshot(root: Path, criteria: tuple["Criterion", ...]) -> dict[str, dict[str, list]]:
    """What the host checks compare with later: for each `exists` path and `preserved` source, the files it names
    now, as {relative path: [size, SHA-256]}. JSON-ready, so the supervisor can keep it with the run."""
    taken: dict[str, dict[str, list]] = {}
    for criterion in criteria:
        pattern = criterion.exists or (criterion.preserved[0] if criterion.preserved else "")
        if pattern and pattern not in taken:
            try:
                taken[pattern] = {path.relative_to(root.resolve()).as_posix(): [path.stat().st_size, _digest(path)]
                                  for path in _files(root, pattern)}
            except (OSError, ValueError):
                continue
    return taken


@dataclass(frozen=True)
class CommandEvidence:
    KIND: ClassVar[str] = "command"
    argv: tuple[str, ...]
    exit_code: int
    output: str

    @classmethod
    def capture(cls, root: Path, argv: tuple[str, ...], *, executable: str | None = None,
                pass_env: tuple[str, ...] = ()) -> "CommandEvidence":
        env = check_env(pass_env)
        try:
            result = subprocess.run(
                argv, executable=executable or default_executable(argv), cwd=root, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
                check=False, timeout=600, env=env,
            )
        except subprocess.TimeoutExpired:
            return cls(argv, 124, "Check timed out.")
        except OSError:
            return cls(argv, 127, "Check command could not start.")
        return cls(argv, result.returncode, result.stdout)

    def gap(self, criterion: "Criterion") -> str | None:
        if self.argv != criterion.command:
            return "recorded command differs from the criterion"
        if self.exit_code != 0:
            return f"command exited {self.exit_code}"
        if criterion.output and criterion.output not in self.output:
            return "expected text is absent from the output"
        return None


@dataclass(frozen=True)
class ArtifactEvidence:
    KIND: ClassVar[str] = "artifact"
    path: str
    sha256: str

    @classmethod
    def capture(cls, root: Path, path: str) -> "ArtifactEvidence":
        return cls(Path(path).as_posix(), sha256(_within(root, path).read_bytes()).hexdigest())

    def gap(self, criterion: "Criterion") -> str | None:
        valid = len(self.sha256) == 64 and all(c in "0123456789abcdef" for c in self.sha256)
        return None if self.path == criterion.artifact and valid else "recorded evidence differs from the criterion"


@dataclass(frozen=True)
class ExistsEvidence:
    KIND: ClassVar[str] = "exists"
    path: str
    found: bool
    changed: bool | None = None     # since the task started; None when no snapshot was taken

    @classmethod
    def capture(cls, root: Path, path: str, before: dict[str, list] | None = None) -> "ExistsEvidence":
        target = _within(root, path)
        if not target.exists():
            return cls(path, False)
        if before is None or not target.is_file():      # a folder has no one digest to compare
            return cls(path, True)
        was = before.get(Path(path).as_posix())
        return cls(path, True, was is None or was[1] != _digest(target))

    def gap(self, criterion: "Criterion") -> str | None:
        if self.path != criterion.exists:
            return "recorded evidence differs from the criterion"
        if not self.found:
            return f"{self.path} does not exist"
        return f"{self.path} is unchanged since the task started" if self.changed is False else None


@dataclass(frozen=True)
class ContainsEvidence:
    KIND: ClassVar[str] = "contains"
    path: str
    text: str
    found: bool

    @classmethod
    def capture(cls, root: Path, path: str, text: str) -> "ContainsEvidence":
        target = _within(root, path)
        found = target.is_file() and text in target.read_text(encoding="utf-8", errors="replace")
        return cls(path, text, found)

    def gap(self, criterion: "Criterion") -> str | None:
        if (self.path, self.text) != tuple(criterion.contains):
            return "recorded evidence differs from the criterion"
        return None if self.found else f"{self.path} does not contain {self.text!r}"


@dataclass(frozen=True)
class CountEvidence:
    KIND: ClassVar[str] = "count"
    glob: str
    matched: int

    @classmethod
    def capture(cls, root: Path, glob: str) -> "CountEvidence":
        return cls(glob, len(_files(root, glob)))

    def gap(self, criterion: "Criterion") -> str | None:
        pattern, minimum = criterion.count
        if self.glob != pattern:
            return "recorded evidence differs from the criterion"
        return None if self.matched >= minimum else f"{self.matched} files match {pattern}, at least {minimum} needed"


@dataclass(frozen=True)
class PreservedEvidence:
    KIND: ClassVar[str] = "preserved"
    source: str
    target: str
    expected: int                   # files the source named when the task started
    missing: tuple[str, ...] = ()   # those with no file of the same SHA-256 under the target now

    @classmethod
    def capture(cls, root: Path, source: str, target: str, before: dict[str, list] | None) -> "PreservedEvidence":
        if before is None:
            raise ValueError("No snapshot was taken at the start, so preserved digests cannot be checked.")
        now = {_digest(path) for path in _files(root, target)}
        return cls(source, target, len(before), tuple(sorted(name for name, (_, digest) in before.items()
                                                             if digest not in now)))

    def gap(self, criterion: "Criterion") -> str | None:
        if (self.source, self.target) != tuple(criterion.preserved):
            return "recorded evidence differs from the criterion"
        if not self.expected:
            return f"no files matched {self.source} when the task started"
        if self.missing:
            shown = ", ".join(self.missing[:5]) + (", …" if len(self.missing) > 5 else "")
            return (f"{len(self.missing)} of {self.expected} files from {self.source} have no identical copy in "
                    f"{self.target}: {shown}")
        return None


Evidence = CommandEvidence | ArtifactEvidence | ExistsEvidence | ContainsEvidence | CountEvidence | PreservedEvidence
# Every kind the ledger can store and read back, by its KIND name. New evidence kinds are added here.
EVIDENCE_KINDS = (CommandEvidence, ArtifactEvidence, ExistsEvidence, ContainsEvidence, CountEvidence,
                  PreservedEvidence)
KINDS = tuple(cls.KIND for cls in EVIDENCE_KINDS)


@dataclass(frozen=True)
class Criterion:
    label: str
    command: tuple[str, ...] = ()
    output: str = ""
    artifact: str = ""
    exists: str = ""
    contains: tuple[str, str] = ()   # (path, text)
    count: tuple[str, int] = ()      # (glob, minimum number of files)
    preserved: tuple[str, str] = ()  # (from: a folder or glob at the start, to: a folder or glob now)

    def __post_init__(self) -> None:
        if [bool(getattr(self, kind)) for kind in KINDS].count(True) != 1:
            raise ValueError("A criterion names exactly one of: a command, an artifact, or a host check "
                             "(exists, contains, count, preserved).")
        if self.contains and not (len(self.contains) == 2 and all(isinstance(part, str) and part
                                                                  for part in self.contains)):
            raise ValueError("A contains check needs a path and a text.")
        if self.count and not (len(self.count) == 2 and isinstance(self.count[0], str) and self.count[0]
                               and type(self.count[1]) is int and self.count[1] >= 1):
            raise ValueError("A count check needs a glob and a minimum of at least 1.")
        if self.preserved and not (len(self.preserved) == 2 and all(isinstance(part, str) and part
                                                                    for part in self.preserved)):
            raise ValueError("A preserved check needs the files it starts from and where they must end up.")

    @property
    def kind(self) -> str:
        return next(kind for kind in KINDS if getattr(self, kind))

    def gap(self, evidence: Evidence | None) -> str | None:
        if evidence is None:
            return f"missing {self.kind} evidence"
        if evidence.KIND != self.kind:
            return "recorded evidence differs from the criterion"
        return evidence.gap(self)


def capture(root: Path, criteria: tuple[Criterion, ...], pass_env: tuple[str, ...] = (),
            before: dict[str, dict[str, list]] | None = None) -> dict[int, Evidence]:
    """Look at `root` for every criterion, numbered from 1. `before` is snapshot() from the task's start. A criterion
    that cannot be looked at gets no evidence, which the judge reports as missing."""
    items: dict[int, Evidence] = {}
    for number, criterion in enumerate(criteria, 1):
        try:
            match criterion.kind:
                case "command":
                    items[number] = CommandEvidence.capture(root, criterion.command, pass_env=pass_env)
                case "artifact":
                    items[number] = ArtifactEvidence.capture(root, criterion.artifact)
                case "exists":
                    items[number] = ExistsEvidence.capture(
                        root, criterion.exists, None if before is None else before.get(criterion.exists, {}))
                case "contains":
                    items[number] = ContainsEvidence.capture(root, *criterion.contains)
                case "count":
                    items[number] = CountEvidence.capture(root, criterion.count[0])
                case "preserved":
                    source, target = criterion.preserved
                    items[number] = PreservedEvidence.capture(
                        root, source, target, None if before is None or source not in before else before[source])
        except (OSError, ValueError):
            continue
    return items


@dataclass(frozen=True)
class Case:
    commit: str
    claim: str
    criteria: tuple[Criterion, ...]
    evidence: tuple[Evidence | None, ...]


@dataclass(frozen=True)
class Verdict:
    kind: Literal["pass", "reject", "stop"]
    gaps: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.kind not in {"pass", "reject", "stop"}:
            raise ValueError("Unknown verdict.")
        needs_reason = self.kind != "pass"
        if needs_reason != bool(self.gaps):
            raise ValueError("Pass has no gaps. Reject and stop require a reason.")


class Judge(Protocol):
    def assess(self, case: Case) -> Verdict: ...


class RuleJudge:
    """Assess recorded proof without changing the project or running its code."""

    def assess(self, case: Case) -> Verdict:
        if not case.criteria:
            return Verdict("stop", ("task has no done criteria",))
        gaps = tuple(
            f"{criterion.label}: {gap}"
            for criterion, item in zip(case.criteria, case.evidence, strict=True)
            if (gap := criterion.gap(item)) is not None
        )
        return Verdict("reject", gaps) if gaps else Verdict("pass")
