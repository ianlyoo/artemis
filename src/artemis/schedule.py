"""Schedules: when a recurring or one-off task is due, and the tick that turns due slots into tasks.

Specs, in this machine's local time:
  at 2026-12-01T09:00         once (an offset such as +09:00 or Z is honoured)
  every 30m · every 2h        a fixed interval after the previous slot
  every 3d [at 09:00]         every N days, at that time of day when given
  daily 07:30 · weekly mon 09:00

A time the clocks skip when daylight saving starts runs at the next minute that exists; a time that happens
twice when it ends runs once. After a time-zone change, slots already planned keep their instant and the ones
after follow the new zone's clock.
"""

from datetime import datetime, timedelta
import re
import time

from .ledger import Ledger


LATE_S = 120   # a slot fired more than this after its time is labelled late
GRAMMAR = "at <ISO time>, every <N>m|h|d [at HH:MM], daily HH:MM or weekly <mon..sun> HH:MM"
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _clock(text: str) -> tuple[int, int]:
    found = re.fullmatch(r"(\d{1,2}):(\d{2})", text)
    if not found or int(found[1]) > 23 or int(found[2]) > 59:
        raise ValueError(f"{text!r} is not a time of day like 09:00.")
    return int(found[1]), int(found[2])


def _at(day: datetime, clock: str) -> datetime:
    hour, minute = _clock(clock)
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0, fold=0)


def instant(wall: datetime) -> float:
    """The Unix time of a local wall-clock time. One the clocks skipped (the spring change) becomes the next
    minute that exists; one that happens twice (the autumn change) is its first occurrence."""
    wall = wall.replace(fold=0)
    while True:
        when = wall.timestamp()
        if datetime.fromtimestamp(when).replace(fold=0) == wall:
            return when
        wall = (wall + timedelta(minutes=1)).replace(second=0, microsecond=0)


def _after(candidate: datetime, after: float, step: timedelta) -> float:
    """The first of candidate, candidate + step, ... whose instant is strictly later than after."""
    while (when := instant(candidate)) <= after:
        candidate += step
    return when


def next_after(spec: str, after: datetime) -> float | None:
    """The first slot of spec strictly after `after`, as a Unix time; None once a one-off has passed.

    Naive datetimes are local time (fold picks the second of a repeated hour); aware ones are converted.
    Day-based specs keep their wall-clock time across daylight-saving changes; minute and hour intervals are
    fixed lengths of real time. Raises ValueError for a spec outside the grammar, naming the grammar.
    """
    moment = after.timestamp()
    now = datetime.fromtimestamp(moment)
    words = spec.strip().lower().split()
    match words:
        case ["at", text]:
            try:
                when = datetime.fromisoformat(text.upper())
            except ValueError:
                raise ValueError(f"{text!r} is not an ISO 8601 time like 2026-12-01T09:00.") from None
            slot = when.timestamp() if when.tzinfo else instant(when)
            return slot if slot > moment else None
        case ["daily", clock]:
            return _after(_at(now, clock), moment, timedelta(days=1))
        case ["weekly", day, clock] if day[:3] in DAYS:
            ahead = (DAYS.index(day[:3]) - now.weekday()) % 7
            return _after(_at(now + timedelta(days=ahead), clock), moment, timedelta(days=7))
        case ["every", amount, *rest] if (found := re.fullmatch(r"([1-9]\d{0,4})([mhd])", amount)):
            count, unit = int(found[1]), found[2]
            if rest and (unit != "d" or len(rest) != 2 or rest[0] != "at"):
                raise ValueError("Only a day interval takes a time of day: every 2d at 09:00.")
            if unit != "d":
                return moment + count * (60 if unit == "m" else 3600)
            later = now + timedelta(days=count)
            if not rest:
                return _after(later.replace(fold=0), moment, timedelta(days=1))
            base = later - timedelta(days=1)
            return _after(_at(base, rest[1]), instant(base), timedelta(days=1))
    raise ValueError(f"Unknown schedule {spec!r}. Use {GRAMMAR}.")


def tick(ledger: Ledger, now: float | None = None) -> list[int]:
    """Turn every due slot into a task, once. Returns the tasks made.

    A slot missed while the home was off (or stopped) fires once, labelled late, and the following slot is the
    schedule's next one after now: missed slots are not made up one by one. ledger.fire moves next_at only from
    the slot read here, so two ticks (or two homes) racing for one slot make one task.
    """
    if ledger.stopped():
        return []
    now = time.time() if now is None else now
    made = []
    for row in ledger.due(now):
        slot = row["next_at"]
        following = next_after(row["spec"], datetime.fromtimestamp(slot))
        if following is not None and following <= now:
            following = next_after(row["spec"], datetime.fromtimestamp(now))
        task = ledger.fire(row["id"], slot, following, late=now - slot > LATE_S)
        if task is not None:
            made.append(task)
    return made
