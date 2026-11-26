"""The lead: one cold, headless turn per message from the person, or per wake from the home.

Each turn starts a fresh process of the configured provider with the static instructions (templates/lead.md) and
a context packet read from the ledger, and nothing else: no vendor session is resumed, so [agents] lead can change
between turns. The lead acts only through the Artemis lead tools. Its reply streams to the App as it is written and
lands in the conversation scrubbed of vault values.
"""

from importlib.resources import files
import threading
import time
import uuid

from . import agents
from .mock_worker import plan  # the v0.2 chat lead's planner, below
from .packet import focus, packet
from .roles import Role, WorkflowError
from .worker_adapters import delta, setting

LEAD_RUN = 0        # the broker grant number of a lead turn; turns run one at a time, so one number serves them all


def instructions() -> str:
    return files("artemis.templates").joinpath("lead.md").read_text(encoding="utf-8")


def called(config) -> str:
    """The names the person chose in the App's first-run setup, as the first line of a turn; empty when none."""
    name, you = setting(config, "lead", "name", ""), setting(config, "lead", "you", "")
    parts = [f"Your name here is {name}." if name else "", f"Call the person {you}." if you else ""]
    said = " ".join(part for part in parts if part)
    return f"{said}\n" if said else ""


def _lessons(ledger, projects: list[int]) -> list[str]:
    try:
        from .lessons import prompt_lines
    except ImportError:
        return []
    return list(dict.fromkeys(line for project in projects or [None] for line in prompt_lines(ledger, project)))[:10]


class LeadRunner:
    def __init__(self, home):
        self.home = home
        self._lock = threading.RLock()
        self.saying: dict | None = None      # the turn being written: turn, text so far, at, message
        self.cancel = threading.Event()      # set to end the turn being written (the App's cancel)

    def turn(self, message: int) -> None:
        """Answer one message of the person's. Raises WorkflowError, with the reason, when the lead did not answer."""
        row = self.home.ledger.message(message)
        self._run(row, f"you (message #{message}): {row['text']}", "lead.turn",
                  focus(self.home.ledger, row["text"], row["project_id"]))

    def wake(self, reason: str) -> None:
        """Let the lead look at something that happened: a request settled, a task stuck, a card answered. At most
        [lead] wake_per_hour wakes run in any hour (0: none); past that, what happened waits in the ledger for the
        next turn's packet."""
        ledger, cap = self.home.ledger, int(setting(self.home.config, "lead", "wake_per_hour", 6))
        with self._lock:        # counted and run under one lock, so wakes that arrive together cannot pass the cap
            if len(ledger.events(kind="lead.wake", since=time.time() - 3600)) >= cap:
                return
            self._run(None, f"artemis (system): {reason}", "lead.wake", focus(ledger, reason))

    def _run(self, message, line: str, kind: str, projects: list[int]) -> None:
        home, ledger = self.home, self.home.ledger
        with self._lock:
            turn = uuid.uuid4().hex
            self.saying = {"turn": turn, "text": "", "at": time.time(),
                           "message": None if message is None else message["id"]}
            self.cancel.clear()
            home.publish("turn.started", {"turn": turn})
            try:
                self._write(message, line, kind, projects, turn)
            finally:
                self.saying = None
                home.publish("turn.ended", {"turn": turn})

    def _write(self, message, line: str, kind: str, projects: list[int], turn: str) -> None:
        """Run the lead's provider for one turn: its reply streams to the App as it is written (self.saying and
        said.delta) and is kept in the ledger when it ends. The App's cancel ends it early."""
        home, ledger, config = self.home, self.home.ledger, self.home.config
        name = agents.lead_provider(config, home.vault, ledger)
        label = agents.LABELS[name]
        context = packet(ledger, projects, _lessons(ledger, projects),
                         history=int(setting(config, "lead", "history", 20)),
                         before=None if message is None else message["id"])
        folder = home.paths.lead
        folder.mkdir(parents=True, exist_ok=True)
        scrubber = agents.scrubber(home.vault)
        stream = scrubber.stream()

        def shown(piece: str) -> None:
            if piece:
                self.saying["text"] += piece
                home.publish("said.delta", {"turn": turn, "text": piece})

        halted = ledger.stopped()
        started = time.monotonic()
        token = home.grant(LEAD_RUN, None, projects[0] if projects else None, "lead", folder, "folder")
        try:
            spawn = agents.launch(name, role="lead", mode="host", cwd=folder,
                                  prompt=f"{called(config)}{context}\n\n{line}\n",
                                  mcp=home.mcp_command(token), config=config, vault=home.vault,
                                  scratch=folder / "run", instructions=instructions())
            outcome = agents.run_turn(
                spawn, folder, float(setting(config, "lead", "max_turn_minutes", 5)) * 60,
                lambda output: shown(stream.feed(delta(name, output))),
                lambda: home.closing.is_set() or self.cancel.is_set() or (not halted and ledger.stopped()))
        finally:
            home.revoke(LEAD_RUN)
        shown(stream.flush())
        seconds = round(time.monotonic() - started)
        project = None if message is None else message["project_id"]
        data = {"turn": turn, "provider": name, "message": None if message is None else message["id"]}
        try:
            reply = agents.answer(spawn, outcome)
        except WorkflowError as error:
            reason = scrubber.scrub(("You cancelled the answer" if self.cancel.is_set()
                                     else f"{label} did not answer") + f" after {seconds} s: {error}")
            ledger.record(Role.HOME, kind, reason[:400], project=project, data=data)
            raise WorkflowError(reason) from None
        ledger.record(Role.HOME, kind, f"{label} answered in {seconds} s", project=project, data=data)
        ledger.say(Role.LEAD, scrubber.scrub(reply), project=project, turn=turn)


# v0.2 surface, used by cli.py (`artemis start`, `artemis chat`) and the flow tests until they move to the home;
# delete it then. Its v0.2 imports are inside the functions, so a rewrite of those modules cannot break LeadRunner.

LEAD_COMMANDS = ("request", "task", "ask", "status", "inbox", "digest", "wait", "show", "retry", "drop",
                 "carried", "note", "statusline")
PERSON_ONLY = ("approve", "decline", "resume")


def header(config, lead, worker) -> str:
    from . import __version__
    from .roles import Interrupt
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
    """Claude Code settings for the terminal lead: a live status line, Artemis commands allowed, approval kept from it."""
    return {
        "statusLine": {"type": "command", "command": "artemis statusline", "refreshInterval": 2},
        "permissions": {
            "allow": [f"Bash(artemis {name}:*)" for name in LEAD_COMMANDS],
            "deny": [f"Bash(artemis {name}:*)" for name in PERSON_ONLY],
        },
    }


def _path_with_artemis() -> dict[str, str]:
    """Make sure `artemis` resolves in the lead's shell to this installation."""
    import os
    from pathlib import Path
    import shutil
    import sys
    env = dict(os.environ)
    here = Path(sys.argv[0]).resolve().parent
    if shutil.which("artemis") is None and (here / "artemis").exists():
        env["PATH"] = f"{here}{os.pathsep}{env.get('PATH', '')}"
    return env


def start_cli(config, lead) -> int:
    import json
    import subprocess
    from .config import STATE
    instructions_text = config.instructions("lead.md")
    if lead.name != "claude":
        raise WorkflowError(f"{lead.label} cannot be started as the lead yet.")
    settings = config.root / STATE / "session" / "claude-settings.json"
    settings.parent.mkdir(parents=True, exist_ok=True)
    settings.write_text(json.dumps(session_settings(), indent=2), encoding="utf-8")
    argv = ["claude", "--append-system-prompt", instructions_text, "--settings", str(settings),
            "--name", "artemis lead"]
    return subprocess.run(argv, cwd=config.root, env=_path_with_artemis(), check=False).returncode


def _carry_out(config, ledger, decision) -> str:
    """The chat lead's one action: the demo project's team post, which writes a local file."""
    import subprocess
    import sys
    from .roles import Interrupt
    script = config.root / "notify.py"
    if decision["kind"] == Interrupt.SEND and script.exists():
        subprocess.run((sys.executable, "notify.py", decision["what"]), cwd=config.root, check=True,
                       capture_output=True, timeout=30)
        note = "posted to the demo outbox"
    else:
        note = "recorded only (the mock lead has nothing to run for this)"
    ledger.finish_card(Role.LEAD, decision["id"], "done", note)
    return note


def chat(config, ledger, lines, say, *, live: bool, tick_s: float = 1.0) -> None:
    """Run the chat lead over the person's lines (typed, or scripted for the demo)."""
    from .attention import digest, inbox, status
    for line in lines:
        text = line.strip()
        command = text.removeprefix("artemis ").strip()
        verb, _, rest = command.partition(" ")
        if not text:
            continue
        if verb in {"quit", "exit"}:
            return
        if verb in {"approve", "decline"} and rest.strip().isdigit():
            ledger.decide_card(Role.OWNER, int(rest), verb == "approve")
            decision = ledger.card(int(rest))
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


def _request(config, ledger, text: str, say, *, live: bool, tick_s: float) -> None:
    from .attention import card
    from .config import repo_project
    from .mock_worker import WHY
    from .supervise import dispatch
    request = ledger.request(Role.OWNER, text, project=repo_project(ledger, config.root))
    steps = plan(text, config.checks)
    for _, criteria in steps.tasks:
        config.landing_checks(criteria)
    numbers = [ledger.add_task(Role.LEAD, request, title, "", criteria) for title, criteria in steps.tasks]
    decisions = [ledger.open_card(Role.LEAD, kind, what, WHY[kind], request=request) for kind, what in steps.asks
                 if kind in config.interrupts]
    rows = [f"lead (mock) › {_plural_tasks(len(numbers))}, running in parallel:"]
    for number, (title, criteria) in zip(numbers, steps.tasks):
        checks = ", ".join(c.label for c in criteria)
        rows.append(f"  #{number} {title:<28} check: {checks}")
    for decision, (kind, what) in zip(decisions, steps.asks):
        rows.append(f"  {what} — {WHY[kind].rstrip('.')}, so it waits in your inbox (decision {decision}).")
    say("\n".join(rows))
    dispatch(config, ledger)
    _follow(ledger, numbers, say, live=live, tick_s=tick_s)
    for decision in ledger.cards("waiting"):
        say(card(ledger, decision))


def _plural_tasks(count: int) -> str:
    return {1: "One task", 2: "Two tasks", 3: "Three tasks"}.get(count, f"{count} tasks")


def _follow(ledger, tasks: list[int], say, *, live: bool, tick_s: float) -> None:
    """Show the status line as it changes until every task of this request has settled."""
    import sys
    from .attention import statusline
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


def start(config, lead, worker) -> int:
    import sys
    from .config import ledger_path
    from .ledger import Ledger
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

