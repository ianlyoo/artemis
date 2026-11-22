"""Evidence records and a replaceable, read-only judgment rule."""

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Literal, Protocol
import subprocess

from .process import checkout_env, executable as default_executable


@dataclass(frozen=True)
class CommandEvidence:
    argv: tuple[str, ...]
    exit_code: int
    output: str

    @classmethod
    def capture(cls, root: Path, argv: tuple[str, ...], *,
                executable: str | None = None) -> "CommandEvidence":
        env = checkout_env()
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


@dataclass(frozen=True)
class ArtifactEvidence:
    path: str
    sha256: str

    @classmethod
    def capture(cls, root: Path, path: str) -> "ArtifactEvidence":
        relative = Path(path)
        target = (root / relative).resolve()
        if relative.is_absolute() or ".." in relative.parts or not target.is_relative_to(root.resolve()):
            raise ValueError("Use an artifact path within the checkout.")
        return cls(relative.as_posix(), sha256(target.read_bytes()).hexdigest())


Evidence = CommandEvidence | ArtifactEvidence


@dataclass(frozen=True)
class Criterion:
    label: str
    command: tuple[str, ...] = ()
    output: str = ""
    artifact: str = ""

    def __post_init__(self) -> None:
        if bool(self.command) == bool(self.artifact):
            raise ValueError("A criterion requires one command or artifact path.")

    def gap(self, evidence: Evidence | None) -> str | None:
        if evidence is None:
            return "missing command evidence" if self.command else "missing artifact evidence"
        if isinstance(evidence, CommandEvidence) and self.command:
            if evidence.argv != self.command:
                return "recorded command differs from the criterion"
            if evidence.exit_code != 0:
                return f"command exited {evidence.exit_code}"
            if self.output and self.output not in evidence.output:
                return "expected text is absent from the output"
            return None
        if isinstance(evidence, ArtifactEvidence) and self.artifact:
            digest = evidence.sha256
            if evidence.path == self.artifact and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest):
                return None
        return "recorded evidence differs from the criterion"


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
