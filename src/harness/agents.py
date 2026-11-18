"""Role runner interface and the demo's local stand-ins."""

from collections.abc import Callable
from typing import Protocol, TypeVar

from .ledger import Ledger
from .roles import Role, runbook

T = TypeVar("T")


class Runner(Protocol):
    def run(self, role: Role, step: Callable[[str], T]) -> T: ...


class ScriptedRunner:
    """Dispatch local steps. A command-backed runner would pass the role card and task context to an agent command here."""

    def __init__(self, ledger: Ledger):
        self.ledger = ledger

    def run(self, role: Role, step: Callable[[str], T]) -> T:
        self.ledger.allow_step()
        return step(runbook(role))
