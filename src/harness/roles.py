"""Role permissions and on-demand runbooks for the local runner."""

from enum import StrEnum
from importlib.resources import files
import tomllib


class Role(StrEnum):
    OWNER = "owner"
    LEAD = "lead"
    CTO = "cto"
    PM = "pm"
    WORKER = "worker"
    CQO = "cqo"
    SHIP = "ship"


class OwnerAction(StrEnum):
    SPEND = "money out"
    DELETE = "irreversible delete"
    SEND = "send as owner"


class WorkflowError(RuntimeError):
    """An operation that the current workflow does not permit."""


def require(actor: Role, expected: Role) -> None:
    if actor is not expected:
        raise WorkflowError(f"Only {expected} may perform this transition.")


def runbook(role: Role) -> str:
    card = files("harness.runbooks").joinpath(f"{role.value}.toml")
    return tomllib.loads(card.read_text(encoding="utf-8"))["instructions"]
