"""Lessons: mistakes and corrections become rules, checks, guards and placements that change the next run.

The home calls observe() for every new ledger event, in order. A trigger writes at most one lesson per kind,
project and wording. Lessons live in the ledger; what a lesson changes is read from there where it applies:

  rule       prompt_lines() puts it in the prompts of workers and the lead in its scope, newest ten
  check      learned_checks() adds it to the project's checks, once it exits 0 on the target and fails on the
             rejected submission that taught it
  guard      sync_rules() writes it into rules.toml as an argv prefix to ask about, once you say yes
  placement  placement_for() moves a provider to the end of the order for one kind of task in one project

A lesson applies at once only when it carries out a requirement that already exists: a criterion the judge
rejected on, or your own words in chat. Anything else, and every guard Artemis infers, waits for your yes.
Workers do not write lessons. Agents only tighten; you loosen by retiring. A lesson used five times without
beating the first-try rate of the project's tasks that ran without it is marked unproven and leaves the prompts.
"""

import json
import re
import subprocess
import threading
from importlib.resources import files
import os
from pathlib import Path
import tomllib

from .config import Config
from .httpop import is_http
from .judge import CommandEvidence, Criterion
from .ledger import Ledger
from .process import split_command
from .roles import Interrupt, Role, WorkflowError
from .ship import checkout


KINDS = ("rule", "check", "guard", "placement")
IN_PROMPT = 10                          # rule lessons per prompt
IN_A_ROW = 3                            # failed attempts before a provider moves down
TRIAL = 5                               # uses before a lesson has to show it helps
OUTCOMES = {"pass", "reject", "retrying", "stuck"}   # the first of these on a task ends its first attempt
FAILED = {"retrying", "stuck"}
RESTARTED = "home restarted"            # a run the home ended on start is not the provider's failure
INTERPRETERS = {"sh", "bash", "zsh", "dash", "fish", "cmd", "powershell", "pwsh", "python", "python3", "py",
                "node", "deno", "ruby", "perl", "env"}
HTTP = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"}
COMMIT = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")
BEGIN = "# >>> learned guards: Artemis writes this block from the guards you accepted (artemis lesson list)"
END = "# <<< learned guards"


def observe(home, event) -> None:
    """React to one new ledger event. While work is stopped no lesson is written."""
    event = dict(event)
    try:
        _observe(home, event)
    except WorkflowError:
        if not home.ledger.stopped():
            raise


def _observe(home, event: dict) -> None:
    kind, ledger = event["kind"], home.ledger
    if kind == "stuck" and event["detail"] == RESTARTED:
        return
    if kind in OUTCOMES:
        _count(ledger, event)
    if kind == "pass":
        _recovered(home, event)
    elif kind in FAILED:
        _placement(ledger, event)
    elif kind == "card.declined":
        _declined(ledger, event)
    elif kind.startswith("lesson."):
        _apply(home, event)


# Writing lessons

def propose(ledger: Ledger, actor: Role, kind: str, text: str, payload: dict | None = None,
            source: list | None = None, project: int | None = None) -> int | None:
    """Add a lesson unless one of the same kind and wording exists in its project. Returns its number, or None.

    The lead's `lesson` tool and every trigger here come through this one door. `source` cites where it came from:
    {"task": N, "criterion": label} for a criterion the judge rejected on, {"message": N} for your words in chat,
    {"card": N} for a card you declined. A rule or guard citing a requirement applies at once; a placement too
    (it only reorders); a check waits for its proof; anything else waits for your yes.
    """
    if kind not in KINDS:
        raise ValueError(f"A lesson is one of: {', '.join(KINDS)}.")
    payload, source = payload or {}, source or []
    _require_payload(kind, payload, project)
    if not all(isinstance(item, dict) for item in source):
        raise ValueError("A lesson's source is a list of objects such as {\"task\": 12, \"criterion\": \"tests\"}.")
    text = _clip(" ".join(text.split()), 200)
    key = _normal(text)
    if any(row["kind"] == kind and row["project_id"] == project and _normal(row["text"]) == key
           for row in ledger.lessons(project, state=None)):
        return None
    now = kind == "placement" or (kind in ("rule", "guard") and _requirement(ledger, source))
    lesson = ledger.add_lesson(actor, kind, text, payload, source, project=project, state="active" if now else "proposed")
    _ask(ledger, _lesson(ledger, lesson))
    return lesson


def _ask(ledger: Ledger, row) -> None:
    """Put a lesson that waits for your yes to you as a Yes/No card, said in the conversation like any choice, so
    My turn and the chat answer it where they show it; the answer accepts or retires the lesson."""
    words = asked(ledger, row)
    if words is None:
        return
    from .web.owner import choice_fence
    options = [{"id": "accept", "label": "Yes", "lesson": row["id"]}, {"id": "retire", "label": "No", "lesson": row["id"]}]
    card = ledger.open_card(Role.HOME, "choice", words, "Artemis learned this from what happened; it applies only "
                            "if you say yes.", project=row["project_id"], options=options)
    ledger.say(Role.LEAD, choice_fence(words, options), project=row["project_id"], card=card)


def _require_payload(kind: str, payload: dict, project: int | None) -> None:
    """The fields each kind needs to be applied; a lesson that could not change anything is refused."""
    argv = payload.get("argv")
    words = isinstance(argv, list) and argv and all(isinstance(word, str) and word for word in argv)
    if kind == "check" and (project is None or not words):
        raise ValueError("A check lesson names its project and payload.argv, the command to run.")
    if kind == "guard" and (payload.get("kind") not in list(Interrupt) or not words):
        raise ValueError(f"A guard lesson needs payload.kind ({', '.join(Interrupt)}) and payload.argv, the start "
                         "of the commands to ask about.")
    if kind == "placement" and (project is None or not all(isinstance(payload.get(key), str)
                                                           for key in ("kind", "demote"))):
        raise ValueError("A placement lesson names its project, payload.kind and payload.demote.")


def _requirement(ledger: Ledger, source: list[dict]) -> bool:
    """Whether a source is a requirement that already exists: a criterion the judge rejected on, or your words."""
    for item in source:
        task, label, message = item.get("task"), item.get("criterion"), item.get("message")
        if isinstance(task, int) and isinstance(label, str) and any(
                event["kind"] == "reject" and f"{label}: " in event["detail"] for event in ledger.events(task=task)):
            return True
        if isinstance(message, int):
            try:
                if ledger.message(message)["role"] == "you":
                    return True
            except WorkflowError:
                continue
    return False


def _normal(text: str) -> str:
    return " ".join(re.sub(r"[\W_]+", " ", text.casefold()).split())


def _clip(text: str, room: int) -> str:
    return text if len(text) <= room else text[:room - 1].rstrip() + "…"


def _data(event) -> dict:
    data = event["data"]
    return (json.loads(data) if isinstance(data, str) else data) or {}


def _lesson(ledger: Ledger, lesson: int):
    for row in ledger.lessons(state=None):
        if row["id"] == lesson:
            return row
    raise WorkflowError(f"There is no lesson L{lesson}.")


def _recovered(home, event: dict) -> None:
    """A task the judge rejected and then passed: the criteria it failed become rules for the next task.

    This wakes no one (the lead wakes only when a request settles, a task goes stuck or a card is answered); the
    lead sees the rule among the lessons on its next turn and may write a sharper one with its lesson tool.
    """
    ledger, task = home.ledger, event["task_id"]
    rejects = [e for e in ledger.events(task=task) if e["kind"] == "reject" and e["id"] < event["id"]]
    if not rejects:
        return
    row = ledger.task_brief(task)
    failed = [c["label"] for c in json.loads(row["criteria"])
              if any(f"{c['label']}: " in e["detail"] for e in rejects)]
    for label in dict.fromkeys(failed):
        propose(ledger, Role.HOME, "rule", f"Check before reporting: {label}", {"criterion": label},
                [{"task": task, "criterion": label, "why": "judge reject"}], project=row["project_id"])


def _placement(ledger: Ledger, event: dict) -> None:
    """Three failed attempts in a row by one provider on one kind of task here: try it last for that kind.

    A failed attempt is a `retrying`, or a `stuck` that did not just follow one (that is the run ending, not a
    new attempt). A run the home ended when it restarted is nobody's failed attempt.
    """
    project, task = event["project_id"], event["task_id"]
    kinds = {row["id"]: row["kind"] for row in ledger.work(project=project)}
    agents, streak, last, counted = {}, {}, {}, False
    for item in ledger.events(project=project):
        if item["id"] > event["id"]:
            break
        at = item["task_id"]
        if item["kind"] == "started":
            agents[at] = _data(item).get("agent")
        key = (kinds.get(at), agents.get(at))
        counted = _failed(item, last.get(at))
        if item["kind"] == "pass":
            streak[key] = 0
        elif counted:
            streak[key] = streak.get(key, 0) + 1
        if item["kind"] in OUTCOMES:
            last[at] = item["kind"]
    kind, provider = kinds.get(task), agents.get(task)
    if counted and provider and streak.get((kind, provider), 0) >= IN_A_ROW:
        propose(ledger, Role.HOME, "placement",
                f"Try {provider} last for {kind} tasks here: {IN_A_ROW} attempts in a row failed",
                {"kind": kind, "demote": provider}, [{"task": task, "why": f"{IN_A_ROW} failed attempts"}],
                project=project)


def _failed(event, previous: str | None) -> bool:
    if event["kind"] == "retrying":
        return True
    return event["kind"] == "stuck" and event["detail"] != RESTARTED and previous != "retrying"


def _declined(ledger: Ledger, event: dict) -> None:
    """A declined command proposes a guard that asks before it from now on. One "no" is not a standing rule: it
    waits for your yes. A web request is asked about by its key every time, so it proposes none."""
    card = ledger.card(event["card_id"])
    if card["rule"] or not card["command"] or card["kind"] not in list(Interrupt) or is_http(card):
        return  # a rule or a key already asks for it, or there is no command to recognise
    argv = _prefix(card["command"], card["shell"])
    if argv is not None:
        propose(ledger, Role.HOME, "guard", f'Ask before "{" ".join(argv)}" ({card["kind"]})',
                {"kind": card["kind"], "argv": argv}, [{"card": card["id"], "why": "you declined"}])


def _prefix(command: str, shell: str | None = None) -> list[str] | None:
    """The program and its first argument, as a rules.toml argv prefix: `python notify.py --to x` gives
    ["python", "notify.py"], `custom-deploy --prod` gives ["custom-deploy"].

    A bare shell or interpreter would match too much, and a web request is asked about by its secret, so neither
    gives a prefix.
    """
    windows = None if shell is None else shell == "powershell"     # the card's shell, else this computer's
    try:
        words = json.loads(command) if command.startswith("[") else split_command(command, windows=windows)
    except ValueError:
        return None
    if not (isinstance(words, list) and words and all(isinstance(word, str) and word for word in words)):
        return None
    head = [words[0]]
    if len(words) > 1 and not words[1].startswith(("-", "/")) and not any(char in words[1] for char in "*?[]"):
        head.append(words[1])
    program = re.split(r"[\\/]", head[0])[-1].lower().removesuffix(".exe")
    if words[0] in HTTP or (program in INTERPRETERS and len(head) == 1):
        return None
    return head


# Applying lessons

def _scope(ledger: Ledger, project: int | None, kind: str) -> list:
    """Active lessons of one kind for a project (its own and the home-wide ones), newest first."""
    return [row for row in ledger.lessons(project) if row["kind"] == kind and row["project_id"] in (None, project)]


def prompt_lines(ledger: Ledger, project: int | None) -> list[str]:
    """The rule lessons a prompt for this project carries, newest ten."""
    return [f"L{row['id']} {row['text']}" for row in _scope(ledger, project, "rule")[:IN_PROMPT]]


def learned_checks(ledger: Ledger, project: int) -> tuple[Criterion, ...]:
    """Proven check lessons, as criteria to add to each new task of the project."""
    return tuple(Criterion(row["text"], command=tuple(json.loads(row["payload"])["argv"]))
                 for row in _scope(ledger, project, "check"))


def placement_for(ledger: Ledger, project: int | None, kind: str, default: list[str]) -> list[str]:
    """The provider order for one kind of task in a project, with providers that kept failing here moved last."""
    payloads = [json.loads(row["payload"]) for row in _scope(ledger, project, "placement")]
    last = {payload["demote"] for payload in payloads if payload.get("kind") == kind}
    return [name for name in default if name not in last] + [name for name in default if name in last]


def _apply(home, event: dict) -> None:
    lesson = _lesson(home.ledger, _data(event)["lesson"])
    if lesson["kind"] == "guard" and event["kind"] != "lesson.added":  # a proposed guard changes nothing yet
        sync_rules(home.ledger, home.paths.rules)
    elif lesson["kind"] == "check" and event["kind"] == "lesson.added":
        threading.Thread(target=prove, args=(home.ledger, lesson["id"]), name=f"artemis-lesson-{lesson['id']}",
                         daemon=True).start()


def sync_rules(ledger: Ledger, path: Path) -> None:
    """Write the active guard lessons into rules.toml as [learned."<kind>"] argv prefixes, the same shape as
    [match."<kind>"]. The block is rebuilt from the ledger each time; every other line stays as it was written."""
    guards: dict[str, list[str]] = {}
    for row in reversed(ledger.lessons()):
        if row["kind"] == "guard":
            payload = json.loads(row["payload"])
            guards.setdefault(payload["kind"], []).append(
                f"    {json.dumps(payload['argv'], ensure_ascii=False)},    # L{row['id']} {_clip(row['text'], 60)}")
    if path.exists():
        lines = path.read_text(encoding="utf-8").splitlines()
    else:
        template = files("artemis.templates").joinpath("rules.toml")
        lines = template.read_text(encoding="utf-8").splitlines() if template.is_file() and guards else []
    begin = lines.index(BEGIN) if BEGIN in lines else len(lines)
    end = lines.index(END, begin) + 1 if END in lines[begin:] else begin
    block = [BEGIN] + [line for kind, entries in guards.items()
                       for line in (f"[learned.{json.dumps(kind)}]", "argv = [", *entries, "]")] + [END]
    written = lines[:begin] + (block if guards else []) + lines[end:]
    if written == lines:
        return
    text = "\n".join(written) + "\n"
    try:
        tomllib.loads(text)
    except tomllib.TOMLDecodeError as error:
        ledger.record(Role.HOME, "note", f"rules.toml was left as it is: it does not read as TOML ({error})")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    scratch = path.with_name(path.name + ".tmp")
    scratch.write_text(text, encoding="utf-8", newline="\n")
    os.replace(scratch, path)


def prove(ledger: Ledger, lesson: int) -> str | None:
    """Turn a proposed check on once it passes on the target and fails on the rejected submission that taught it.
    Returns why it waits, or None once it is on."""
    row = _lesson(ledger, lesson)
    reason = _unproven(ledger, row)
    if reason is None:
        ledger.activate_lesson(lesson)
    else:
        ledger.record(Role.HOME, "note", f"L{lesson} stays proposed: {reason}", project=row["project_id"],
                      data={"lesson": lesson})
    return reason


def _rejected(ledger: Ledger, row) -> str | None:
    """The commit of the newest rejected submission among the tasks a lesson came from."""
    for item in reversed(json.loads(row["source"] or "[]")):
        if isinstance(item, dict) and isinstance(item.get("task"), int):
            for submission in reversed(ledger.submissions(item["task"])):
                if submission["verdict"] == "reject" and COMMIT.fullmatch(submission["sha"]):
                    return submission["sha"]
    return None


def _unproven(ledger: Ledger, row) -> str | None:
    """Why a check lesson may not join the project's checks yet, or None when it may."""
    argv = tuple(json.loads(row["payload"]).get("argv") or ())
    if not argv or row["project_id"] is None:
        return "it names no project and command to run"
    project = ledger.project(row["project_id"])
    if project["kind"] != "repo":
        return "checks are learned for Git projects only"
    example = _rejected(ledger, row)
    if example is None:
        return "it names no task with a rejected commit for it to fail on"
    root = Path(project["path"])
    try:
        config = Config.load(root)
        target, pass_env = config.target, config.pass_env
    except WorkflowError:
        target, pass_env = "HEAD", ()
    try:
        with checkout(root, target) as tree:
            on_target = CommandEvidence.capture(tree, argv, pass_env=pass_env)
        with checkout(root, example) as tree:
            on_example = CommandEvidence.capture(tree, argv, pass_env=pass_env)
    except (subprocess.SubprocessError, OSError):
        return f"{target} or {example[:7]} could not be checked out"
    if on_target.exit_code:
        return f"it exits {on_target.exit_code} on {target}"
    if not on_example.exit_code:
        return f"it passes on {example[:7]}, the rejected commit it should catch"
    return None


# Counting what lessons did

def _history(ledger: Ledger, project: int | None) -> dict[int, dict]:
    """Per task in the project: the rule lessons its first prompt carried, and how its first attempt ended."""
    rules = {row["id"]: row["project_id"] for row in ledger.lessons(project, state=None) if row["kind"] == "rule"}
    active, tasks = {}, {}
    for event in ledger.events(project=project):
        kind, task = event["kind"], event["task_id"]
        if kind.startswith("lesson."):
            lesson = _data(event).get("lesson")
            if lesson in rules and kind == "lesson.active":
                active[lesson] = rules[lesson]
            elif lesson in rules:
                active.pop(lesson, None)
        elif kind == "started" and task not in tasks:
            carried = sorted((key for key, scope in active.items() if scope in (None, event["project_id"])),
                             reverse=True)[:IN_PROMPT]
            tasks[task] = {"carried": carried, "first_try": None, "event": None}
        elif (kind in OUTCOMES and task in tasks and tasks[task]["event"] is None
              and not (kind == "stuck" and event["detail"] == RESTARTED)):
            tasks[task].update(first_try=kind == "pass", event=event["id"])
    return tasks


def applied(ledger: Ledger, project: int | None = None) -> dict[int, list[int]]:
    """Rule lesson numbers each task's first run carried, keyed by task id."""
    return {task: list(entry["carried"]) for task, entry in _history(ledger, project).items() if entry["carried"]}


def _count(ledger: Ledger, event: dict) -> None:
    """At the end of a task's first attempt, count it for every lesson its prompt carried."""
    history = _history(ledger, event["project_id"])
    entry = history.get(event["task_id"])
    if entry is None or entry["event"] != event["id"]:
        return
    for lesson in entry["carried"]:
        ledger.lesson_used(lesson, entry["first_try"])
    for lesson in entry["carried"]:
        row = _lesson(ledger, lesson)
        if row["state"] != "active" or row["uses"] < TRIAL:
            continue
        without = [item["first_try"] for item in history.values()
                   if item["event"] is not None and lesson not in item["carried"]]
        baseline = sum(without) / len(without) if without else 0.0
        if row["first_try"] / row["uses"] <= baseline:
            ledger.set_lesson(Role.HOME, lesson, "unproven")


# Words for people

def source_text(row) -> str:
    """Where a lesson came from: "from #12 judge reject", "from D7 you declined", "from the lead"."""
    parts = []
    for item in json.loads(row["source"] or "[]"):
        ref = f"#{item['task']}" if "task" in item else f"D{item['card']}" if "card" in item else ""
        why = item.get("why") or ("your words in chat" if "message" in item else "")
        parts.append(" ".join(filter(None, (ref, why))))
    return "from " + (", ".join(filter(None, parts)) or "the lead")


def question(row) -> str | None:
    """The yes-or-no question a proposed lesson puts to you, or None when it does not wait for your yes."""
    if row["state"] != "proposed" or row["kind"] == "check":
        return None
    if row["kind"] != "guard":
        return f"Use this from now on? {row['text']}"   # no quotes around it: a lesson often quotes you
    payload = json.loads(row["payload"])
    card = next((item["card"] for item in json.loads(row["source"] or "[]") if "card" in item), None)
    asked = f"Always ask before `{' '.join(payload['argv'])}`?"
    return f"You declined D{card}. {asked}" if card else asked


def asked(ledger: Ledger, row) -> str | None:
    """question() in plain words for the App's card: what you said no to by its name, the command as words."""
    if question(row) is None:
        return None
    if row["kind"] != "guard":
        return f"Use this from now on? {row['text']}"
    cited = {item["card"] for item in json.loads(row["source"] or "[]") if "card" in item}
    declined = [card["what"] for card in ledger.cards() if card["id"] in cited]   # the cards the source names
    said = f"You said no to “{declined[0]}”. " if declined else ""
    return f"{said}Always ask before running {' '.join(json.loads(row['payload'])['argv'])}?"


def card_lesson(card) -> int | None:
    """The lesson a Yes/No card asks about, or None for any other card."""
    options = json.loads(card["options"] or "null") if card["kind"] == "choice" else None
    return options[0].get("lesson") if isinstance(options, list) and isinstance(options[0], dict) else None


def _answer(ledger: Ledger, lesson: int, option: str) -> None:
    """Close the lesson's waiting card with the answer given elsewhere (the CLI, POST /api/lessons)."""
    for card in ledger.cards(state="waiting"):
        if card_lesson(card) == lesson:
            ledger.choose(Role.OWNER, card["id"], option)


def listing(ledger: Ledger, include_retired: bool = False) -> str:
    names = {row["id"]: row["name"] for row in ledger.projects(include_archived=True)}
    lines = []
    for row in reversed(ledger.lessons(state=None)):
        if row["state"] == "retired" and not include_retired:
            continue
        used = f" · used {row['uses']}×, {row['first_try']} first try" if row["uses"] else ""
        asks = f" · {question(row)} artemis lesson accept {row['id']}" if question(row) else ""
        scope = names.get(row["project_id"], "all projects")
        lines.append(f"L{row['id']:<3} {row['state']:<9} {row['kind']:<9} {scope:<14} \"{row['text']}\"  "
                     f"{source_text(row)}{used}{asks}")
    return "\n".join(lines) or "Nothing learned yet."


def retire(ledger: Ledger, lesson: int) -> None:
    """Your no: the lesson stops applying, and its card, if one still asks, is answered No."""
    _lesson(ledger, lesson)
    ledger.set_lesson(Role.OWNER, lesson, "retired")
    _answer(ledger, lesson, "retire")


def accept(ledger: Ledger, lesson: int) -> None:
    """Your yes: a proposed, unproven or retired lesson applies from now on, and its card, if one still asks, is
    answered Yes. A check still has to pass its proof."""
    row = _lesson(ledger, lesson)
    if row["state"] != "active":
        if row["kind"] == "check":
            reason = _unproven(ledger, row)
            if reason is not None:
                raise WorkflowError(f"L{lesson} stays proposed: {reason}.")
        ledger.set_lesson(Role.OWNER, lesson, "active")
    _answer(ledger, lesson, "accept")


def add_commands(sub) -> None:
    """`artemis lesson list | retire N | accept N`, added to the CLI's subcommands."""
    lesson = sub.add_parser("lesson", help="What Artemis learned from mistakes and corrections.")
    verbs = lesson.add_subparsers(dest="lesson_verb", required=True, metavar="VERB")
    shown = verbs.add_parser("list", help="Lessons in force, proposed and unproven.")
    shown.add_argument("--all", action="store_true", help="Include retired lessons.")
    verbs.add_parser("retire", help="Stop applying a lesson.").add_argument("lesson", type=int, metavar="N")
    verbs.add_parser("accept", help="Say yes to a proposed lesson, or turn a retired one back on.").add_argument(
        "lesson", type=int, metavar="N")
    lesson.set_defaults(func=command)


def command(args, ledger: Ledger) -> int:
    if args.lesson_verb == "list":
        print(listing(ledger, include_retired=args.all))
    elif args.lesson_verb == "retire":
        retire(ledger, args.lesson)
        print(f"Retired L{args.lesson}. It no longer applies.")
    else:
        accept(ledger, args.lesson)
        print(f"L{args.lesson} applies from now on.")
    return 0
