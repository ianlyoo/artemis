"""Role runner interface and the demo's local stand-ins."""

from collections.abc import Callable
from pathlib import Path
import subprocess
from typing import Protocol, TypeVar

from .config import RoleSettings
from .ledger import Ledger
from .process import checkout_env
from .roles import Role, WorkflowError, runbook

T = TypeVar("T")


class Runner(Protocol):
    def run(self, role: Role, step: Callable[[str], T]) -> T: ...


class ScriptedRunner:
    """Dispatch the scripted demo steps with the bundled role cards."""

    def __init__(self, ledger: Ledger):
        self.ledger = ledger

    def run(self, role: Role, step: Callable[[str], T]) -> T:
        self.ledger.allow_step()
        return step(runbook(role))


class CommandRunner:
    """Run a local worker command with the brief on stdin and use stdout as its claim."""

    def __init__(self, settings: RoleSettings):
        self.settings = settings

    def claim(self, root: Path, task: int, brief: str) -> str:
        if self.settings.run is None:
            raise WorkflowError("Configure roles.worker.run in harness.toml before using run.")
        argv = tuple(arg.replace("{task}", str(task)) for arg in self.settings.run)
        prompt = f"{self.settings.instructions()}\n\n{brief}"
        env = checkout_env()
        try:
            result = subprocess.run(
                argv, cwd=root, input=prompt, capture_output=True, text=True,
                encoding="utf-8", errors="replace", check=False, timeout=60, env=env,
            )
        except subprocess.TimeoutExpired:
            raise WorkflowError("Worker command timed out.") from None
        except OSError:
            raise WorkflowError("Worker command could not start.") from None
        if result.returncode:
            raise WorkflowError(f"Worker command exited {result.returncode}.")
        claim = result.stdout.strip()
        if not claim:
            raise WorkflowError("Worker command returned an empty claim.")
        return claim
