"""Start the lead you talk to: your own agent CLI session, or the built-in chat lead."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

from . import __version__
from .agents import Agent, pick
from .attention import card, digest, inbox, status, statusline
from .config import STATE, Config, ledger_path
from .judge import Criterion
from .ledger import Ledger
from .roles import Interrupt, Role, WorkflowError
from .supervise import dispatch


LEAD_COMMANDS = ("request", "task", "ask", "status", "inbox", "digest", "wait", "show", "retry", "drop",
                 "carried", "note", "statusline")
PERSON_ONLY = ("approve", "decline", "resume")


def header(config: Config, lead: Agent, worker: Agent) -> str:
    workers = f"workers: {worker.name} ×{config.max_workers}"
    if worker.mock:
        workers = f"workers: mock ×{config.max_workers} (no AI; for trying the flow)"
    kinds = " · ".join(kind for kind in Interrupt if kind in config.interrupts) or "nothing"
    return "\n".join((
        f"Artemis {__version__} · project {config.root.name} · lead: {lead.name} · {workers}",
        f"Workers run in their own git worktrees. Only checked work reaches {config.target}.",
        f"You are asked only for: {kinds}.",
    ))


def session_settings() -> dict:
    """Claude Code settings for the lead: a live status line, Artemis commands allowed, approval kept from it."""
    return {
        "statusLine": {"type": "command", "command": "artemis statusline", "refreshInterval": 2},
        "permissions": {
            "allow": [f"Bash(artemis {name}:*)" for name in LEAD_COMMANDS],
            "deny": [f"Bash(artemis {name}:*)" for name in PERSON_ONLY],
        },
    }


def _path_with_artemis() -> dict[str, str]:
    """Make sure `artemis` resolves in the lead's shell to this installation."""
    env = dict(os.environ)
    here = Path(sys.argv[0]).resolve().parent
    if shutil.which("artemis") is None and (here / "artemis").exists():
        env["PATH"] = f"{here}{os.pathsep}{env.get('PATH', '')}"
    return env


def start_cli(config: Config, lead: Agent) -> int:
    instructions = config.instructions("lead.md")
    if lead.name == "claude":
        settings = config.root / STATE / "session" / "claude-settings.json"
        settings.parent.mkdir(parents=True, exist_ok=True)
        settings.write_text(json.dumps(session_settings(), indent=2), encoding="utf-8")
        argv = ["claude", "--append-system-prompt", instructions, "--settings", str(settings),
                "--name", "artemis lead"]
    else:
        raise WorkflowError(f"{lead.label} cannot be started as the lead yet.")
    return subprocess.run(argv, cwd=config.root, env=_path_with_artemis(), check=False).returncode


# The built-in chat lead. Its planner is a few rules, not a model, so it says mock wherever it speaks.

ASKS = (
    (Interrupt.SEND, r"\b(post|publish|send|email|e-mail|tweet|announce|push|release it|message)\b"),
    (Interrupt.SPEND, r"\b(pay|buy|purchase|subscribe|order|upgrade the plan)\b"),
    (Interrupt.DELETE, r"\b(delete|wipe|erase|destroy|drop the database|remove for good)\b"),
)
WHY = {Interrupt.SEND: "it speaks in your name.", Interrupt.SPEND: "it spends money.",
       Interrupt.DELETE: "it cannot be undone."}


@dataclass(frozen=True)
class Plan:
    tasks: tuple[tuple[str, tuple[Criterion, ...]], ...]
    asks: tuple[tuple[Interrupt, str], ...]


def _title(clause: str) -> str:
    clause = clause.strip().rstrip(".!")
    return clause[:1].upper() + clause[1:]


def plan(sentence: str, checks: tuple[tuple[str, ...], ...]) -> Plan:
    """Split one sentence into parallel tasks and held-back actions, by its commas and conjunctions."""
    clauses = []
    for part in re.split(r",?\s+then\s+|;\s*|,\s+", sentence.strip()):
        pieces = re.split(r"\s+and\s+(?=a |an |the )", part)
        verb = pieces[0].split(" ", 1)[0]
        clauses.append(pieces[0])
        clauses.extend(f"{verb} {piece}" for piece in pieces[1:])
    tasks, asks = [], []
    for clause in filter(str.strip, clauses):
        kind = next((kind for kind, pattern in ASKS if re.search(pattern, clause, re.IGNORECASE)), None)
        if kind is not None:
            asks.append((kind, _title(clause)))
        elif re.search(r"\b(readme|document|docs?)\b", clause, re.IGNORECASE):
            flags = dict.fromkeys(re.findall(r"(?<!\w)--[a-z][\w-]*", sentence))
            checks_for_docs = tuple(Criterion(f"README mentions {flag}", command=("grep", "-q", "--", flag, "README.md"))
                                    for flag in flags) or (Criterion("README.md", artifact="README.md"),)
            tasks.append((_title(clause), checks_for_docs))
        else:
            tasks.append((_title(clause), tuple(Criterion(" ".join(c), command=c) for c in checks)))
    return Plan(tuple(tasks), tuple(asks))


def _carry_out(config: Config, ledger: Ledger, decision) -> str:
    """The chat lead's one action: the demo project's team post, which writes a local file."""
    script = config.root / "notify.py"
    if decision["kind"] == Interrupt.SEND and script.exists():
        subprocess.run((sys.executable, "notify.py", decision["what"]), cwd=config.root, check=True,
                       capture_output=True, timeout=30)
        note = "posted to the demo outbox"
    else:
        note = "recorded only (the mock lead has nothing to run for this)"
    ledger.carried_out(Role.LEAD, decision["id"], note)
    return note


def chat(config: Config, ledger: Ledger, lines: Iterable[str], say: Callable[[str], None], *,
         live: bool, tick_s: float = 1.0) -> None:
    """Run the chat lead over the person's lines (typed, or scripted for the demo)."""
    for line in lines:
        text = line.strip()
        command = text.removeprefix("artemis ").strip()
        verb, _, rest = command.partition(" ")
        if not text:
            continue
        if verb in {"quit", "exit"}:
            return
        if verb in {"approve", "decline"} and rest.strip().isdigit():
            ledger.decide(Role.OWNER, int(rest), verb == "approve")
            decision = next(d for d in ledger.decisions() if d["id"] == int(rest))
            if verb == "approve":
                say(f"approved: {rest} · the lead carries it out")
                say(f"lead (mock) › Decision {rest}: {_carry_out(config, ledger, decision)} "
                    "(outbox/team.md; nothing left this machine).")
            else:
                say(f"declined: {rest} · nothing happens")
            continue
        if verb in {"digest", "inbox", "status"}:
            say({"digest": lambda: digest(ledger), "inbox": lambda: inbox(ledger),
                 "status": lambda: status(ledger)}[verb]())
            continue
        _request(config, ledger, text, say, live=live, tick_s=tick_s)


def _request(config: Config, ledger: Ledger, text: str, say: Callable[[str], None], *,
             live: bool, tick_s: float) -> None:
    request = ledger.request(Role.OWNER, text)
    steps = plan(text, config.checks)
    for _, criteria in steps.tasks:
        config.landing_checks(criteria)
    numbers = [ledger.add_task(Role.LEAD, request, title, "", criteria) for title, criteria in steps.tasks]
    decisions = [ledger.ask(Role.LEAD, request, kind, what, WHY[kind]) for kind, what in steps.asks
                 if kind in config.interrupts]
    rows = [f"lead (mock) › {_plural_tasks(len(numbers))}, running in parallel:"]
    for number, (title, criteria) in zip(numbers, steps.tasks):
        checks = ", ".join(c.label for c in criteria)
        rows.append(f"  #{number} {title:<28} check: {checks}")
    for decision, (kind, what) in zip(decisions, steps.asks):
        rows.append(f"  {what} — {WHY[kind].rstrip('.')}, so it waits in your inbox (decision {decision}).")
    say("\n".join(rows))
    dispatch(config, ledger)
    _follow(config, ledger, numbers, say, live=live, tick_s=tick_s)
    for decision in ledger.decisions("waiting"):
        say(card(ledger, decision))


def _plural_tasks(count: int) -> str:
    return {1: "One task", 2: "Two tasks", 3: "Three tasks"}.get(count, f"{count} tasks")


def _follow(config: Config, ledger: Ledger, tasks: list[int], say: Callable[[str], None], *,
            live: bool, tick_s: float) -> None:
    """Show the status line as it changes until every task of this request has settled."""
    last = ""
    while True:
        line = statusline(ledger)
        if line != last:
            if live:
                sys.stdout.write("\r\033[K" + line)
                sys.stdout.flush()
            else:
                say(line)
            last = line
        rows = {row["id"]: row["state"] for row in ledger.work()}
        if all(rows.get(task) not in {"queued", "running", "verified", "reported"} for task in tasks):
            break
        time.sleep(tick_s)
    if live:
        sys.stdout.write("\n")


def start(config: Config, lead: Agent, worker: Agent) -> int:
    ledger = Ledger(ledger_path(config.root))
    print(header(config, lead, worker), flush=True)
    if lead.name != "chat":
        return start_cli(config, lead)
    print("Type one sentence of what you want. Also: status, inbox, digest, approve N, decline N, quit.")

    def typed():
        while True:
            try:
                yield input("you › ")
            except EOFError:
                return

    try:
        chat(config, ledger, typed(), print, live=sys.stdout.isatty())
    except KeyboardInterrupt:
        print()
    return 0


def pair(name: str | None, config: Config) -> tuple[Agent, Agent]:
    """--agent picks both; otherwise artemis.toml picks each."""
    if name is None:
        return pick(config.lead, "lead"), pick(config.worker, "worker")
    worker = pick(name, "worker")
    lead = pick("chat", "lead") if worker.mock or name == "api" else pick(name, "lead")
    return lead, worker
