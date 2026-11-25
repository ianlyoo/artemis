"""What the person sees, read from the ledger across every project: the status line, the inbox and the digest.

Each digest line carries a label that says how it is known:
  shipped   landed on the project's branch with its checks green (repo work)
  verified  the judge passed it on recorded evidence (host work ends here, named by what was checked; repo work
            lands next)
  reported  a worker says so; not checked yet
  running   a worker is on it now          queued   waiting for a free worker
  stuck     no result; the lead has it when the running home has one, otherwise it is yours to retry
  waiting   a card for you                 decided  you answered a card, and what came of it
  learned   a lesson from a mistake or a correction, where it came from, and the question when it waits for you
  inferred  the lead's own reading, not checked
"""

from dataclasses import dataclass
import json
import os
import re
import shutil
import sys
import time
from urllib.parse import urlsplit

from . import demo_receiver
from .ledger import Ledger
from .lessons import question, source_text
from .process import join_command
from .roles import INTERRUPTS, Role


WAKE = {"finished", "stuck", "stopped", "applied", "card.opened", "card.approved", "card.declined", "card.done",
        "card.failed", "card.unknown", "card.answered", "secret.set", "dropped", "halt", "resume"}
ORDER = ("shipped", "verified", "reported", "running", "queued", "decided", "waiting", "learned", "stuck",
         "inferred")
TITLE_ROOM = 34


@dataclass(frozen=True)
class DigestLine:
    label: str              # one of ORDER
    ref: str                # "#3" a task, "D2" a card, "L4" a lesson, "" a note
    title: str
    proof: str              # how it is known, in words
    project: str | None     # the project's name; None for what holds in every project
    question: str | None = None  # a learned guard or rule waiting for your yes; the App shows it as a button


@dataclass(frozen=True)
class Digest:
    lines: list[DigestLine]
    counts: dict
    text: str               # the plain-terminal rendering, cut to the terminal's width

    def __str__(self) -> str:
        return self.text


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


def _columns() -> int:
    """The width lines are cut to: the terminal's, 100 when not a terminal, and never under 60."""
    return max(shutil.get_terminal_size((100, 24)).columns, 60)


def _ago(seconds: float) -> str:
    minutes = max(round(seconds / 60), 1)
    if minutes < 60:
        return f"{minutes} min"
    hours = round(minutes / 60)
    return f"{hours} h" if hours < 48 else f"{round(hours / 24)} days"


def _data(event) -> dict:
    return json.loads(event["data"]) if event["data"] else {}


def window(ledger: Ledger) -> tuple[int, float | None]:
    """The digest window starts where the person last caught up."""
    last = ledger.last_read()
    return (last["id"], last["at"]) if last else (0, None)


def lead_runs(ledger: Ledger) -> bool:
    """Whether a lead acts on stuck work now: the home that started last said it has one, and it still runs."""
    with ledger._read() as db:
        row = db.execute("SELECT data FROM events WHERE kind = 'home.started' ORDER BY id DESC LIMIT 1").fetchone()
    if row is None or not json.loads(row["data"] or "{}").get("lead"):
        return False
    from .home import Paths, running    # here, not at the top: the home shows this module's views
    return running(Paths.at(ledger.path.parent)) is not None


def statusline(ledger: Ledger, project: int | None = None) -> str:
    """One line for every project together (or one): work in hand, cards for you, and what your attention bought."""
    _, since = window(ledger)
    n = ledger.counts(since, project)
    parts = [f"{n['running']} running"]
    if n["queued"]:
        parts.append(f"{n['queued']} queued")
    if n["waiting"]:
        parts.append(f"{_plural(n['waiting'], 'decision')} for you")
    if n["stuck"]:
        parts.append(f"{n['stuck']} stuck ({'lead' if lead_runs(ledger) else 'yours'})")
    parts.append(f"asked you {n['asked']}×")
    parts.append(f"{n['done']} done")
    return ("stopped by you · " if ledger.stopped() else "") + " · ".join(parts)


def _said(argv: list[str], exit_code: int) -> str:
    """A check in words: grep -q PATTERN FILE that passed reads as FILE mentions PATTERN; others as run."""
    args = [arg for arg in argv[1:] if arg != "--"]
    if argv[0] == "grep" and len(args) == 3 and args[0] == "-q" and exit_code == 0:
        return f"{args[2]} mentions {args[1]}"
    return f"{join_command(argv)} exit {exit_code}"


def _phrase(criterion: dict, evidence: dict | None) -> str:
    """One criterion of a passed task in words, naming the property that was checked and what was recorded."""
    evidence = evidence or {}
    if criterion.get("exists"):
        return f"{criterion['exists']} {'written' if evidence.get('changed') else 'exists'}"
    if criterion.get("contains"):
        path, text = criterion["contains"]
        return f"{path} mentions {text}"
    if criterion.get("count"):
        pattern, least = criterion["count"]
        found = evidence.get("matched")
        if not isinstance(found, int):
            return f"at least {least} files match {pattern}"
        return f"{found} {'file matches' if found == 1 else 'files match'} {pattern}"
    if criterion.get("preserved"):
        found = evidence.get("expected")
        if not isinstance(found, int) or evidence.get("missing"):
            return f"files from {criterion['preserved'][0]} preserved"
        return f"{_plural(found, 'file')}, every digest preserved"
    if criterion.get("artifact"):
        return f"{criterion['artifact']} recorded"
    argv = list(criterion.get("command") or ())
    if evidence and "exit_code" in evidence and criterion["label"] in (join_command(argv), " ".join(argv)):
        return _said(list(evidence["argv"]), evidence["exit_code"])
    return criterion["label"]


def _proof(ledger: Ledger, task: int) -> str:
    """The evidence for a task's latest submission, one phrase per criterion."""
    with ledger._read() as db:
        row = db.execute("SELECT t.criteria, w.submission_id FROM tasks t JOIN work w ON w.id = t.id "
                         "WHERE t.id = ?", (task,)).fetchone()
        saved = {item["criterion"]: json.loads(item["data"]) for item in db.execute(
            "SELECT criterion, data FROM evidence WHERE submission_id = ?", (row["submission_id"],))}
    criteria = json.loads(row["criteria"])
    return _joined([_phrase(criterion, saved.get(number)) for number, criterion in enumerate(criteria, 1)])


def _joined(phrases: list[str]) -> str:
    """Evidence phrases as one: "README mentions --json" and "README mentions --done" read as one mention."""
    grouped: dict[str, list[str]] = {}
    for phrase in phrases:
        subject, said, what = phrase.partition(" mentions ")
        grouped.setdefault(subject + said, []).append(what)
    mentioned = lambda subject: subject.removesuffix(" recorded").removesuffix(" exists") + " mentions "  # noqa: E731
    shown = [subject + ", ".join(filter(None, what)) for subject, what in grouped.items()
             if mentioned(subject) not in grouped]  # a file it mentions is there; no need to say so twice
    return " · ".join(shown) or "no evidence"


def _task_line(ledger: Ledger, row, project_kind: str, lead: bool | None = None) -> tuple[str, str]:
    """A task's state and its proof in one line; lead says whether a lead runs (looked up when a stuck row needs it)."""
    state = row["state"]
    if state == "shipped":
        return "shipped", f"{row['target']} {row['landed'][:7]} · {_proof(ledger, row['id'])}"
    if state == "verified" and (project_kind == "folder" or (row["sha"] or "").startswith("host:")):
        return "verified", _proof(ledger, row["id"])
    if state == "verified":
        return "verified", f"judge passed {row['sha'][:7]} · landing next"
    if state == "reported":
        return "reported", "a worker says so; not checked yet"
    if state == "running":
        return "running", f"{row['agent']} · {_ago(time.time() - row['started'])}"
    if state == "stuck":
        lead = lead_runs(ledger) if lead is None else lead
        keeper = "the lead has it" if lead else f"yours: artemis retry {row['id']}"
        return "stuck", f"{visible(row['note'] or 'no result')[:70]} · {keeper}"
    return state, "next free worker takes it" if state == "queued" else ""


def title(ledger: Ledger, card) -> str:
    """What a card is about, as the action: a web request names where it goes, the demo receiver by name."""
    request = demo_receiver.request_of(card)
    if request is None:
        return card["what"]
    method = request.get("method") or "POST"
    url = urlsplit(request["url"])
    where = (f"the {demo_receiver.NAME}" if demo_receiver.listening(ledger, request["url"]) else
             url.netloc.rpartition("@")[2] + url.path)
    return f"{method} {'from' if method in ('GET', 'HEAD') else 'to'} {where}"


def command_line(command: str) -> str:
    """A card's command as a person reads it. The program goes by its name where the name alone finds that same
    program (Artemis's own Python, or the first on PATH); any other program keeps its whole path."""
    try:
        argv = json.loads(command)
    except ValueError:
        return visible(command)
    if not (isinstance(argv, list) and argv and all(isinstance(part, str) for part in argv)):
        return visible(command)
    name = re.split(r"[\\/]", argv[0])[-1]
    name = name[:-4] if name.lower().endswith(".exe") else name
    if name != argv[0] and _found_as(argv[0], name):
        argv = [name, *argv[1:]]
    return visible(join_command(argv))


def _found_as(path: str, name: str) -> bool:
    try:
        found = shutil.which(name)
        return os.path.samefile(path, sys.executable) or bool(found and os.path.samefile(path, found))
    except OSError:
        return False


def _card_line(ledger: Ledger, card, lead: bool) -> tuple[str, str]:
    kind, state = card["kind"], card["state"]
    options = json.loads(card["options"]) if card["options"] else None
    if state == "waiting":
        return "waiting", f"secret {options['name']} · for you" if kind == "secret" else f"{kind} · for you"
    if kind == "choice":
        labels = {item["id"]: item["label"] for item in options}
        return "decided", f"you chose {labels.get(card['answer'], card['answer'])}"
    if kind == "secret":
        return "decided", f"you set {options['name']} (the value went to the vault)"
    with ledger._read() as db:
        job = db.execute("SELECT exit_code FROM jobs WHERE card_id = ? AND ended IS NOT NULL ORDER BY id DESC "
                         "LIMIT 1", (card["id"],)).fetchone()
    request = demo_receiver.request_of(card)
    result = (card["result"] or "").split("\n", 1)[0] if request else card["result"]   # a web request: its status
    ran = f"ran: exit {job['exit_code']}" if job else None
    if state == "done":
        return "decided", f"you approved · {_arrival(ledger, card, request) or ran or result or 'done'}"
    return {
        "approved": ("decided", "you approved · " + ("about to run" if card["command"] else
                                                      "the lead is carrying it out" if lead else
                                                      "no lead runs to carry it out")),
        "running": ("decided", "you approved · running now"),
        "declined": ("decided", "you declined"),
        "failed": ("stuck", f"you approved · it failed: {ran or result or 'no output'}"),
        "unknown": ("stuck", "you approved · the outcome is unknown; it is not run again"),
        "expired": ("stuck", "expired before you answered · nothing ran · " + (
            "the lead has it" if lead else "ask again if you still want it")),
    }[state]


def _arrival(ledger: Ledger, card, request) -> str | None:
    """What the demo receiver got for a web request, short enough for one line (the title already names it)."""
    got = demo_receiver.arrived(ledger, card) if request else None
    if got is None:
        return None
    wanted = request["body_sha256"]
    if got == wanted:
        return f"it got that exact body (sha256 {got[:7]})"
    return f"it got a different body (sha256 {got[:7]}; the card said {wanted[:7]})"


def _lesson_proof(lesson, reasons: dict[int, str]) -> str:
    proof = source_text(lesson)
    if question(lesson):
        proof += f" · {question(lesson)} artemis lesson accept {lesson['id']}"
    elif lesson["state"] == "proposed":
        proof += f" · proposed: {reasons.get(lesson['id'], 'not checked yet')}"
    elif lesson["state"] == "unproven":
        proof += f" · unproven after {lesson['uses']} uses"
    elif lesson["uses"]:
        proof += f" · used {lesson['uses']}×, {lesson['first_try']} first try"
    return proof


def digest(ledger: Ledger, project: int | None = None, since: float | None = None, *,
           mark: bool = False) -> Digest:
    """What happened since you last looked (or since a time), one line per thing with its evidence label.

    mark records that you caught up, so the next digest starts here.
    """
    after, start = (0, since) if since is not None else window(ledger)
    events = [event for event in ledger.events(after, project=project)
              if (since is None or event["at"] >= since) and (project is None or event["project_id"] == project)]
    start = start if start is not None else (events[0]["at"] if events else time.time())
    projects = {row["id"]: row for row in ledger.projects(include_archived=True)}
    name = lambda key: projects[key]["name"] if key in projects else None  # noqa: E731
    lines = []

    lead = lead_runs(ledger)
    touched = {event["task_id"] for event in events if event["task_id"]}
    for row in ledger.work(project=project):
        if (row["id"] in touched and row["state"] != "dropped") or row["state"] == "stuck":
            label, proof = _task_line(ledger, row, projects[row["project_id"]]["kind"], lead)
            lines.append(DigestLine(label, f"#{row['id']}", row["title"], proof, name(row["project_id"])))

    answered = {event["card_id"] for event in events if event["card_id"]}
    for card in ledger.cards(project=project):
        if card["id"] in answered or card["state"] == "waiting":
            label, proof = _card_line(ledger, card, lead)
            lines.append(DigestLine(label, f"D{card['id']}", title(ledger, card), proof, name(card["project_id"])))

    learned = {_data(event)["lesson"] for event in events if event["kind"].startswith("lesson.")}
    reasons = {_data(event)["lesson"]: event["detail"].split(": ", 1)[-1] for event in events
               if event["kind"] == "note" and event["role"] == Role.HOME and "lesson" in _data(event)}
    for lesson in reversed(ledger.lessons(project, state=None)):
        if lesson["id"] in learned and lesson["state"] != "retired" and (project is None or lesson["project_id"] == project):
            lines.append(DigestLine("learned", f"L{lesson['id']}", lesson["text"], _lesson_proof(lesson, reasons),
                                    name(lesson["project_id"]), question(lesson)))

    lines += [DigestLine("inferred", "", event["detail"], "", name(event["project_id"]))
              for event in events if event["kind"] == "note" and event["role"] == Role.LEAD]
    lines.sort(key=lambda line: (ORDER.index(line.label), int(line.ref[1:] or 0)))

    counts = ledger.counts(start, project) | {"since": start, "wakes": sum(event["kind"] == "lead.wake"
                                                                        for event in events)}
    held = sum(line.label == "stuck" for line in lines)
    header = (f"Last {_ago(time.time() - start)} · asked you {counts['asked']}× · {counts['done']} done · "
              f"{held} stuck · {_plural(counts['wakes'], 'wake')}")
    grouped = project is None and len(projects) > 1
    text = _render(header, lines, projects if grouped else None, _columns())
    if mark:
        ledger.mark_read(Role.OWNER)
    return Digest(lines, counts, text)


def _render(header: str, lines: list[DigestLine], projects: dict | None, columns: int) -> str:
    """The plain-terminal digest: under each project's name when there are several, every line cut to fit."""
    out = [header]
    width = max((len(clip(line.title, TITLE_ROOM)) for line in lines if line.label not in ("learned", "inferred")),
                default=0)
    if not projects:
        out += [_text_line(line, width, columns) for line in lines]
        return "\n".join(out if lines else out + ["Nothing changed."])
    kinds = {row["name"]: row["kind"] for row in projects.values()}
    groups: dict[str | None, list[DigestLine]] = {}
    for line in lines:
        groups.setdefault(line.project, []).append(line)
    for key in [name for name in kinds if name in groups] + ([None] if None in groups else []):
        out.append(f"{key} ({kinds[key]})" if key else "all projects")
        out += ["  " + _text_line(line, width, columns - 2) for line in groups[key]]
    return "\n".join(out if lines else out + ["Nothing changed."])


def _text_line(line: DigestLine, width: int, columns: int) -> str:
    head = f"{line.label:<9} {line.ref} " if line.ref else f"{line.label:<9} "
    if line.label == "inferred":
        return head + clip(line.title, columns - len(head))
    if line.label == "learned":
        return _one_line(head, f'"{line.title}"', line.proof, columns, " · ")
    if line.ref.startswith("D"):
        return _one_line(head, line.title, line.proof, columns)
    head += f"{clip(line.title, TITLE_ROOM):<{width}}  "
    return (head + clip(line.proof, columns - len(head))).rstrip()


def _one_line(head: str, what: str, result: str, columns: int, between: str = "  ") -> str:
    """One terminal line: what gives up room first, down to 24 characters, then the result."""
    room = columns - len(head) - len(between)
    result = clip(result, room)
    what = clip(what, max(room - len(result), 24))
    return f"{head}{what}{between}{clip(result, room - len(what))}"


def _projects_shown(ledger: Ledger, project: int | None) -> dict | None:
    """Group by project when showing everything and there is more than one."""
    rows = {row["id"]: row for row in ledger.projects()}
    return rows if project is None and len(rows) > 1 else None


def status(ledger: Ledger, project: int | None = None) -> str:
    """The status line, then what is in hand per project: open tasks and the cards waiting for you."""
    columns = _columns()
    lines = [clip(statusline(ledger, project), columns)]
    grouped = _projects_shown(ledger, project)
    kinds = {row["id"]: row["kind"] for row in ledger.projects(include_archived=True)}
    lead = lead_runs(ledger)
    for key in (grouped or {None: None}):
        indent = "  " if grouped else ""
        rows = []
        for row in ledger.work(project=key if grouped else project):
            if row["state"] in ("dropped", "shipped") or (row["state"] == "verified" and
                                                          kinds[row["project_id"]] == "folder"):
                continue
            label, detail = _task_line(ledger, row, kinds[row["project_id"]], lead)
            rows.append(_one_line(f"{indent}{label:<9} #{row['id']} ", row["title"], detail, columns))
        for card in ledger.cards("waiting", project=key if grouped else project):
            rows.append(_one_line(f"{indent}{'waiting':<9} D{card['id']} ", title(ledger, card), _hint(card),
                                  columns))
        if grouped and rows:
            lines.append(f"{grouped[key]['name']} ({grouped[key]['kind']})")
        lines += rows
    return "\n".join(lines)


def _hint(card) -> str:
    if card["kind"] in INTERRUPTS:
        return f"{card['kind']} · artemis approve {card['id']}"
    return f"{card['kind']} · answer in the App"


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
    """One card as the terminal shows it: what, why it is yours, what runs, and how to answer."""
    kind = decision["kind"]
    project = ledger.project(decision["project_id"])["name"] if decision["project_id"] else None
    head = f"Decision {decision['id']} · {kind}" if kind in INTERRUPTS else f"{kind.capitalize()} {decision['id']}"
    lines = [head + (f" · {project}" if project else ""),
             f"  {visible(title(ledger, decision))}", f"  Why you: {visible(decision['why'])}"]
    sends = demo_receiver.request_of(decision)
    if sends:
        to = f" (the {demo_receiver.NAME})" if demo_receiver.listening(ledger, sends["url"]) else ""
        lines.append(f"  Sends: {sends.get('method', 'POST')} {visible(sends['url'])}{to}"
                     + (f" · body sha256 {sends['body_sha256'][:12]}" if sends.get("body_sha256") else ""))
    elif decision["command"]:
        lines.append(f"  Runs: {command_line(decision['command'])}")
    secrets = json.loads(decision["secrets"] or "[]")
    if secrets:
        lines.append(f"  Uses the secrets: {', '.join(secrets)} (by name; the values stay in the vault)")
    if kind == "choice":
        options = json.loads(decision["options"])
        lines.append("  Options: " + " · ".join(f"{item['id']}) {item['label']}" for item in options))
        lines.append("  Answer in the App.")
        return "\n".join(lines)
    if kind == "secret":
        name = json.loads(decision["options"])["name"]
        lines.append(f"  Set {name} in the App: the value goes straight to the vault, kept out of the model's "
                     "context.")
        return "\n".join(lines)
    lines.append("  If you do nothing: nothing happens.")
    if decision["request_id"]:
        lines.append(f"  Ready because: {_ready(ledger, decision['request_id'])}.")
    elif decision["task_id"]:
        lines.append(f"  Ready because: task #{decision['task_id']} is held at this step until you answer.")
    lines.append(f"  artemis approve {decision['id']}   ·   artemis decline {decision['id']}")
    return "\n".join(lines)


def inbox(ledger: Ledger, project: int | None = None) -> str:
    waiting = ledger.cards("waiting", project=project)
    if not waiting:
        return "Nothing is waiting for you."
    return "\n\n".join(card(ledger, decision) for decision in waiting)


def wait(ledger: Ledger, timeout_s: float, poll_s: float = 1.0) -> str:
    """Block until something the lead should tell the person happens, then describe it in a few lines."""
    events = ledger.events()
    cursor = events[-1]["id"] if events else 0
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        fresh = [event for event in ledger.events(cursor) if event["kind"] in WAKE]
        if fresh:
            time.sleep(poll_s)  # let events that land together be told together
            fresh = [event for event in ledger.events(cursor) if event["kind"] in WAKE]
            lines = [f"{event['kind']:<9} " + (f"#{event['task_id']} " if event["task_id"] else "")
                     + (f"D{event['card_id']} " if event["card_id"] else "")
                     + visible(event["detail"])[:100] for event in fresh]
            return "\n".join(lines + [statusline(ledger)])
        time.sleep(poll_s)
    return "No change. " + statusline(ledger)
