"""Who may make each ledger transition, and the actions that wait for a person."""

from enum import StrEnum


class Role(StrEnum):
    OWNER = "you"
    LEAD = "lead"
    WORKER = "worker"
    JUDGE = "judge"
    SHIP = "ship"


class Interrupt(StrEnum):
    """The only kinds of action that are put to the person."""

    SPEND = "money out"
    DELETE = "irreversible delete"
    SEND = "send as you"


class WorkflowError(RuntimeError):
    """An operation that the current workflow does not permit."""


def require(actor: Role, expected: Role) -> None:
    if actor is not expected:
        raise WorkflowError(f"Only the {expected} may perform this transition.")
