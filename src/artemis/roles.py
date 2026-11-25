"""Who may make each ledger transition, and the actions that wait for a person."""

from enum import StrEnum


class Role(StrEnum):
    OWNER = "you"
    LEAD = "lead"
    WORKER = "worker"
    JUDGE = "judge"
    SHIP = "ship"
    HOME = "artemis"     # the home process itself: scheduler, broker, dispatcher


class Interrupt(StrEnum):
    """The only kinds of action that are put to the person."""

    SPEND = "money out"
    DELETE = "irreversible delete"
    SEND = "send as you"


INTERRUPTS = frozenset(kind.value for kind in Interrupt)
CARD_KINDS = (*Interrupt, "choice", "secret")


class WorkflowError(RuntimeError):
    """An operation that the current workflow does not permit."""


def require(actor: Role, *expected: Role) -> None:
    if actor not in expected:
        names = " or the ".join(str(role) for role in expected)
        raise WorkflowError(f"Only the {names} may perform this transition.")
