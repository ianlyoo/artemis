"""What the person sees: the status line, the decision inbox and the catch-up digest, all read from the ledger."""

import json
import os
import shlex
import shutil
import time

from .ledger import Ledger
from .roles import Role


WAKE = {"finished", "stuck", "stopped", "applied", "asked", "approved", "declined", "dropped", "halt", "resume"}


def visible(text: str) -> str:
    return "".join(char if char.isprintable() else " " for char in text)


def clip(text: str, room: int) -> str:
    """Printable text in at most room characters, cut after a whole word and marked with an ellipsis."""
    text = " ".join(visible(text).split())
    if len(text) <= room:
        return text
    cut = text[:room].rsplit(" ", 1)[0] if " " in text[:room] else text[:room - 1]
    return cut.rstrip(" ,;:·-(") + "…"


def _plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def _ago(seconds: float) -> str:
    minutes = round(seconds / 60)
    if minutes < 1:
        return "under a minute"
    if minutes < 60:
        return _plural(minutes, "min").replace("mins", "min")
    return _plural(round(minutes / 60), "hour")


def _alive(pid: int | None) -> bool:
    if not pid or os.name == "nt":
        return True
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except OSError:
        return True
    return True


def reap(ledger: Ledger) -> None:
    """A run whose supervisor process is gone is stuck: say so in the ledger rather than show it as running."""
    for row in ledger.work():
        if row["state"] == "running" and row["pid"] and not _alive(row["pid"]):
            ledger.end_run(Role.WORKER, row["run_id"], "stuck", "the worker process ended without a result")


def window(ledger: Ledger) -> tuple[int, float | None]:
    """The digest window starts where the person last caught up."""
    last = ledger.last_read()
    return (last["id"], last["at"]) if last else (0, None)


def counts(ledger: Ledger) -> dict[str, int]:
    after, _ = window(ledger)
    rows = ledger.work()
    events = ledger.events(after)
    return {
        "running": sum(row["state"] == "running" for row in rows),
        "queued": sum(row["state"] == "queued" for row in rows),
        "stuck": sum(row["state"] == "stuck" for row in rows),
        "waiting": len(ledger.decisions("waiting")),
        "asked": sum(event["kind"] == "asked" for event in events),
        "done": len({event["task_id"] for event in events if event["kind"] == "applied"}),
    }


def statusline(ledger: Ledger) -> str:
    reap(ledger)
    n = counts(ledger)
    parts = [f"{n['running']} running"]
    if n["queued"]:
        parts.append(f"{n['queued']} queued")
    if n["waiting"]:
        parts.append(f"{_plural(n['waiting'], 'decision')} for you")
    if n["stuck"]:
        parts.append(f"{n['stuck']} stuck (lead)")
    parts.append(f"asked you {n['asked']}×")
    parts.append(f"{n['done']} done")
    mark = "■ stopped by you · " if ledger.stopped() else "● "
    return mark + " · ".join(parts)


def _proof(ledger: Ledger, task: int) -> str:
    """One phrase of evidence for a task's latest judged submission, named by its criteria."""
    with ledger._read() as db:
        rows = db.execute(
            "SELECT e.criterion, e.kind, e.data, t.criteria FROM evidence e "
            "JOIN work w ON w.submission_id = e.submission_id JOIN tasks t ON t.id = w.id "
            "WHERE w.id = ? ORDER BY e.criterion", (task,),
        ).fetchall()
    phrases = []
    for row in rows:
        data = json.loads(row["data"])
        label = json.loads(row["criteria"])[row["criterion"] - 1]["label"]
        if row["kind"] != "command":
            phrases.append(f"{data['path']} recorded")
        elif label == shlex.join(data["argv"]) or label == " ".join(data["argv"]):
            phrases.append(f"{label} exit {data['exit_code']}")
        else:
            phrases.append(label)
    if len(phrases) > 1 and all(p.startswith("README mentions ") for p in phrases):
        return "README mentions " + ", ".join(p.removeprefix("README mentions ") for p in phrases)
    return ", ".join(phrases) or "no evidence"


def _task_line(ledger: Ledger, row) -> tuple[str, str]:
    state = row["state"]
    if state == "shipped":
        return "shipped", f"{row['target']} {row['landed'][:7]} · {_proof(ledger, row['id'])}"
    if state == "verified":
        return "verified", f"judge passed {row['sha'][:7]} · landing next"
    if state == "reported":
        return "reported", "a worker says so; not checked yet"
    if state == "running":
        return "running", f"{row['agent']} · {_ago(time.time() - row['started'])}"
    if state == "stuck":
        return "stuck", f"{visible(row['note'] or 'no result')[:70]} · the lead handles it"
    return state, ""


def status(ledger: Ledger) -> str:
    lines = [statusline(ledger)]
    for row in ledger.work():
        if row["state"] == "dropped":
            continue
        label, detail = _task_line(ledger, row)
        lines.append(f"{label:<9} #{row['id']} {clip(row['title'], 40):<40} {detail}".rstrip())
    for decision in ledger.decisions("waiting"):
        lines.append(f"{'waiting':<9} D{decision['id']} {clip(decision['what'], 40):<40} "
                     f"{decision['kind']} · artemis approve {decision['id']}")
    return "\n".join(lines)


def _ready(ledger: Ledger, request: int) -> str:
    rows = [row for row in ledger.work() if row["request_id"] == request and row["state"] != "dropped"]
    if not rows:
        return "nothing else in this request"
    shipped = [row for row in rows if row["state"] == "shipped"]
    if len(shipped) == len(rows):
        numbers = [row["id"] for row in rows]
        span = f"#{numbers[0]}" if len(numbers) == 1 else f"#{numbers[0]}–#{numbers[-1]}"
        landed = {event["task_id"]: event["id"] for event in ledger.events() if event["kind"] == "applied"}
        last = max(shipped, key=lambda row: landed.get(row["id"], 0))  # the latest landing holds all the others
        return (f"{'task' if len(rows) == 1 else 'tasks'} {span} shipped, checks green on "
                f"{last['target']} {last['landed'][:7]}")
    states = {}
    for row in rows:
        states[row["state"]] = states.get(row["state"], 0) + 1
    return "tasks so far: " + ", ".join(f"{count} {state}" for state, count in states.items())


def card(ledger: Ledger, decision) -> str:
    return "\n".join((
        f"Decision {decision['id']} · {decision['kind']}",
        f"  {visible(decision['what'])}",
        f"  Why you: {visible(decision['why'])}",
        "  If you do nothing: nothing happens.",
        f"  Ready because: {_ready(ledger, decision['request_id'])}.",
        f"  artemis approve {decision['id']}   ·   artemis decline {decision['id']}",
    ))


def inbox(ledger: Ledger) -> str:
    waiting = ledger.decisions("waiting")
    if not waiting:
        return "Nothing is waiting for you."
    return "\n\n".join(card(ledger, decision) for decision in waiting)


def digest(ledger: Ledger, *, mark: bool = True) -> str:
    reap(ledger)
    after, since = window(ledger)
    events = ledger.events(after)
    n = counts(ledger)
    start = since if since is not None else (events[0]["at"] if events else time.time())
    stuck = "nothing stuck" if not n["stuck"] else f"{n['stuck']} stuck (the lead has it)"
    lines = [f"Last {_ago(time.time() - start)} · {_plural(n['done'], 'task')} done · "
             f"asked you {n['asked']}× · {stuck}"]
    touched = {event["task_id"] for event in events if event["task_id"]}
    rows = [row for row in ledger.work() if row["id"] in touched and row["state"] != "dropped"]
    columns = max(shutil.get_terminal_size((100, 24)).columns, 60)  # the narrowest layout the lines are cut for
    width = max((len(clip(row["title"], 34)) for row in rows), default=0)
    for row in rows:
        label, detail = _task_line(ledger, row)
        lines.append(f"{label:<9} #{row['id']} {clip(row['title'], 34):<{width}}  {detail}".rstrip())
    decided = {event["decision_id"] for event in events if event["decision_id"]}
    for decision in ledger.decisions():
        if decision["id"] not in decided and decision["state"] != "waiting":
            continue
        label, result = {
            "waiting": ("waiting", f"for you: artemis approve {decision['id']}"),
            "approved": ("decided", "you approved · the lead is carrying it out"),
            "declined": ("decided", "you declined"),
            "done": ("decided", f"you approved · {decision['note'] or 'done'}"),
        }[decision["state"]]
        lines.append(_one_line(f"{label:<9} D{decision['id']} ", decision["what"], result, columns))
    for event in events:
        if event["kind"] == "note":
            lines.append(f"{'inferred':<9} {clip(event['detail'], columns - 10)}")
    if len(lines) == 1:
        lines.append("Nothing changed.")
    if mark:
        ledger.mark_read(Role.OWNER)
    return "\n".join(lines)


def _one_line(head: str, what: str, result: str, columns: int) -> str:
    """A decision in one terminal line: what gives up room first, down to 24 characters, then the result."""
    room = columns - len(head) - 2
    result = clip(result, room)
    what = clip(what, max(room - len(result), 24))
    return f"{head}{what}  {clip(result, room - len(what))}"


def wait(ledger: Ledger, timeout_s: float, poll_s: float = 1.0) -> str:
    """Block until something the lead should tell the person happens, then describe it in a few lines."""
    events = ledger.events()
    cursor = events[-1]["id"] if events else 0
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        reap(ledger)
        fresh = [event for event in ledger.events(cursor) if event["kind"] in WAKE]
        if fresh:
            time.sleep(poll_s)  # let events that land together be told together
            fresh = [event for event in ledger.events(cursor) if event["kind"] in WAKE]
            lines = [f"{event['kind']:<9} " + (f"#{event['task_id']} " if event["task_id"] else "")
                     + (f"D{event['decision_id']} " if event["decision_id"] else "")
                     + visible(event["detail"])[:100] for event in fresh]
            return "\n".join(lines + [statusline(ledger)])
        time.sleep(poll_s)
    return "No change. " + statusline(ledger)
