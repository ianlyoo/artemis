"""What the lead knows at the start of each turn, read fresh from the ledger.

The lead starts cold every turn, so this is all it knows: the conversation so far, its own newest notes, every
project in one line, the focus projects in detail (open tasks with their checks and proof, recent events), every
open card, the lessons in scope and what is due in the next day.
"""

import json
import re
import time

from .roles import Role

OPEN = ("running", "queued", "reported", "verified", "stuck")
EVENTS = 12
NOTES = 10
DAY = 24 * 3600


def _when(at: float) -> str:
    return time.strftime("%Y-%m-%d %H:%M %z", time.localtime(at))


def _named(projects, tasks, text: str) -> list[int]:
    """The projects a text names, by project name or as "task #N"."""
    lowered = text.casefold()
    named = [row["id"] for row in projects
             if re.search(rf"(?<![\w.-]){re.escape(row['name'].casefold())}(?![\w-])", lowered)]
    owners = {row["id"]: row["project_id"] for row in tasks}
    named += [owners[int(number)] for number in re.findall(r"\btasks? #(\d+)", lowered) if int(number) in owners]
    return list(dict.fromkeys(named))


def focus(ledger, text: str, project: int | None = None) -> list[int]:
    """The projects a message (or a wake) is about: the project it was sent in, else the projects and tasks it
    names, else what the conversation was last about, else the last project worked on."""
    if project is not None:
        return [project]
    projects, tasks = ledger.projects(), ledger.work()
    named = _named(projects, tasks, text)
    if named:
        return named
    for row in reversed(ledger.messages(limit=50)):
        earlier = [row["project_id"]] if row["project_id"] is not None else _named(projects, tasks, row["text"])
        if earlier:
            return earlier
    if tasks:
        return [tasks[-1]["project_id"]]
    return [projects[0]["id"]] if len(projects) == 1 else []


def _proof(row) -> str:
    sha = (row["sha"] or "")[:7] if not (row["sha"] or "").startswith("host:") else "host evidence"
    if row["state"] == "running":
        return f"{row['agent']} working since {_when(row['started'])[11:16]}"
    if row["state"] == "verified":
        return f"judge pass on {sha}"
    if row["state"] == "reported":
        return f"submitted {sha}, waiting for the judge"
    if row["state"] == "stuck":
        return f"stuck: {(row['note'] or row['verdict'] or 'no note')[:160]}"
    return "waiting for a worker"


def _checks(ledger, task: int) -> str:
    criteria = json.loads(ledger.task_brief(task)["criteria"])
    return ", ".join(item.get("label", "?") for item in criteria) or "no checks"


def _said(row) -> str:
    text = row["text"].replace("\n", "\n    ")
    return f"  {row['role']} (message #{row['id']}, {_when(row['at'])[5:16]}): {text}"


def packet(ledger, project: int | list[int] | None, lessons: list, *, now: float | None = None,
           history: int = 20, before: int | None = None) -> str:
    """The context block for one lead turn; the thread holds the last `history` messages before message `before`."""
    now = time.time() if now is None else now
    focused = [project] if isinstance(project, int) else list(project or [])
    projects = ledger.projects()
    names = {row["id"]: row["name"] for row in projects}
    thread = [row for row in ledger.messages(limit=history + 50) if before is None or row["id"] < before][-history:]
    lines = [f'<artemis-context at="{_when(now)}">', f"Conversation so far (last {len(thread)} messages):"]
    lines += [_said(row) for row in thread] or ["  none yet"]
    notes = ledger.notes(Role.LEAD, NOTES)
    if notes:
        lines.append("Your notes (newest last; your own reading, not evidence):")
        lines += [f"  {_when(row['at'])[5:16]} {row['detail'][:500]}" for row in notes]
    lines.append(f"Projects ({len(projects)}):")
    for row in projects:
        counts = ledger.counts(project=row["id"])
        busy = " · ".join(f"{key} {counts[key]}" for key in ("running", "queued", "stuck", "verified", "shipped",
                                                             "waiting") if counts[key])
        lines.append(f"  #{row['id']} {row['name']} · {row['kind']} · {row['path']}" + (f" · {busy}" if busy else ""))
    if not projects:
        lines.append("  none yet")
    for key in focused:
        project_row = next((row for row in projects if row["id"] == key), None)
        if project_row is None:
            continue
        lines.append(f"Focus: #{key} {project_row['name']} ({project_row['kind']})")
        tasks = [row for row in ledger.work(project=key) if row["state"] in OPEN]
        lines.append(f"Open tasks in {project_row['name']} ({len(tasks)}):")
        lines += [f"  #{row['id']} {row['title']} · {row['kind']}" + (f" · {row['agent']}" if row["agent"] else "")
                  + f" · {row['state']} · checks: {_checks(ledger, row['id'])} · {_proof(row)}" for row in tasks]
        if not tasks:
            lines.append("  none")
        lines.append(f"Recent in {project_row['name']}:")
        recent = [row for row in ledger.events(project=key)            # its own events; messages are in the thread
                  if row["project_id"] == key and row["kind"] != "said"]
        lines += [f"  {_when(row['at'])[11:16]} {row['kind']}" + (f" #{row['task_id']}" if row["task_id"] else "")
                  + f" {' '.join(row['detail'].split())[:160]}" for row in recent[-EVENTS:]]
    cards = [row for state in ("waiting", "approved", "running") for row in ledger.cards(state)]
    lines.append(f"Cards open ({len(cards)}):")
    lines += [f"  card {row['id']} · {row['kind']} · {row['state']} · {row['what'][:160]}"
              + (f" · {names.get(row['project_id'], '')}" if row["project_id"] else "") for row in cards]
    if lessons:
        lines.append(f"Lessons in force ({min(len(lessons), 10)}):")
        lines += [f"  {line}" for line in lessons[:10]]
    due = [row for row in ledger.schedules() if row["active"] and row["next_at"] <= now + DAY]
    if due:
        lines.append("Due in the next 24 h:")
        lines += [f"  schedule {row['id']} · {row['title']} · {names.get(row['project_id'], '')} · "
                  f"{_when(row['next_at'])}" for row in due]
    lines.append("</artemis-context>")
    return "\n".join(lines)
