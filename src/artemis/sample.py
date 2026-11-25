"""The demo: a throwaway to-do repository, a home run in-process, and the rule-based mock lead.

The mock lead is a few rules, not a model (lead.plan), so it says mock wherever it speaks. `converse` is also the
terminal lead `artemis start` opens when no lead CLI is installed. In `artemis demo` the lead's "send as you" step
is a real web request held on a card: approved, Artemis sends it with a demo key to the local demo receiver, a
loopback endpoint standing in for a team webhook, and nothing leaves this computer.
"""

from collections.abc import Callable, Iterable
from dataclasses import replace
from datetime import date, datetime, timedelta
import json
import os
from pathlib import Path
import secrets
import sys
from tempfile import TemporaryDirectory
import time
from unittest import mock

from . import __version__, attention, guard
from .config import CONFIG_NAME, Config, HomeConfig
from .judge import Criterion
from .ledger import Ledger
from .roles import Interrupt, Role, WorkflowError
from .schedule import next_after
from .ship import git


SENTENCE = ("Add a --json flag and a --done filter, document both in the README, "
            "then post a release note to the team.")
HOOK = "DEMO_TEAM_HOOK"         # the demo's website key: made for each demo, sent only to the local receiver
CARRY_S = 60                    # how long the lead waits to see an approved card carried out
FILM_SPEC = "weekly fri 18:00"
FILM_TITLE = "Sort this week's files and post the summary"
FILM_BRIEF = ("Every Friday at 18:00, sort this week's files in incoming/ into one folder per day (YYYY-MM-DD/), "
              "write summary.csv with one row per file (day, name, bytes), and post the summary to my team "
              "channel. Keep every file's contents as they are.")

TODO = '''\
"""A tiny to-do list for the Artemis demo."""

import argparse

ITEMS = [
    {"title": "Water the basil", "done": False},
    {"title": "Repot the mint", "done": True},
    {"title": "Buy seeds", "done": False},
]


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Show the to-do list.")
    add_output_options(parser)
    add_filter_options(parser)
    return parser.parse_args(argv)


def add_output_options(parser):
    """Options that change how the list is printed."""


def add_filter_options(parser):
    """Options that choose which items are printed."""


def select(items, args):
    return items


def render(items, args):
    return "\\n".join(("[x] " if item["done"] else "[ ] ") + item["title"] for item in items)


def main(argv=None):
    args = parse_args(argv)
    print(render(select(ITEMS, args), args))


if __name__ == "__main__":
    main()
'''

TESTS = '''\
import unittest

import todo


class PlainOutput(unittest.TestCase):
    def test_lists_every_item(self):
        text = todo.render(todo.select(todo.ITEMS, todo.parse_args([])), todo.parse_args([]))
        self.assertEqual(text.splitlines()[0], "[ ] Water the basil")
        self.assertEqual(len(text.splitlines()), 3)


if __name__ == "__main__":
    unittest.main()
'''

NOTIFY = '''\
"""Post a message to the team. In this demo the team channel is a local file: nothing leaves the machine."""

from pathlib import Path
import sys

outbox = Path("outbox")
outbox.mkdir(exist_ok=True)
with (outbox / "team.md").open("a", encoding="utf-8") as stream:
    stream.write(" ".join(sys.argv[1:]) + "\\n")
print("posted to the demo outbox (outbox/team.md); nothing left this machine")
'''

README = """\
# todo

A tiny to-do list, used by the Artemis demo.
"""

GITIGNORE = ".artemis/\noutbox/\n__pycache__/\n"


def create(path: Path) -> None:
    """Make the demo repository at path, with one commit on main."""
    path.mkdir(parents=True)
    git(path, "init", "--quiet", "-b", "main", "--template=")
    git(path, "config", "user.name", "Demo User")
    git(path, "config", "user.email", "demo@example.invalid")
    git(path, "config", "commit.gpgsign", "false")
    for name, text in (("todo.py", TODO), ("test_todo.py", TESTS), ("notify.py", NOTIFY),
                       ("README.md", README), (".gitignore", GITIGNORE)):
        (path / name).write_text(text, encoding="utf-8", newline="\n")
    git(path, "add", "--", ".")
    git(path, "commit", "--quiet", "-m", "Start the to-do list")


def create_film(path: Path, today: date | None = None) -> list[str]:
    """Make the film folder: incoming/ holds a few small stand-in clips, dated this week. Returns their names."""
    today = today or date.today()
    monday = today - timedelta(days=today.weekday())
    incoming = path / "incoming"
    incoming.mkdir(parents=True)
    names = []
    for offset, take in ((0, 1), (0, 2), (1, 1), (3, 1), (4, 1), (4, 2)):
        name = f"clip-{(monday + timedelta(days=offset)).isoformat()}-take{take}.mov"
        (incoming / name).write_bytes(f"stand-in footage for {name}\n".encode("utf-8"))
        names.append(name)
    return names


def stage_film(ledger: Ledger, folder: Path, now: float | None = None) -> tuple[int, int]:
    """Register the film folder as a project and give it its Friday schedule. Returns (project, schedule)."""
    now = time.time() if now is None else now
    project = ledger.add_project(Role.OWNER, folder.name, "folder", str(folder.resolve()))
    criteria = (Criterion("summary.csv", artifact="summary.csv"),)
    schedule = ledger.add_schedule(Role.OWNER, project, FILM_TITLE, FILM_BRIEF, "host", criteria, FILM_SPEC,
                                   next_after(FILM_SPEC, datetime.fromtimestamp(now)))
    return project, schedule


# The mock lead

def header(config: HomeConfig, project, worker: str) -> str:
    workers = f"workers: {worker} ×{config.agents.max_workers}"
    if worker == "mock":
        workers = f"workers: mock ×{config.agents.max_workers} (no AI; for trying the flow)"
    kinds = " · ".join(kind for kind in Interrupt if kind in config.interrupts.ask) or "nothing"
    root = Path(project["path"])
    if project["kind"] == "repo":
        target = Config.load(root).target if (root / CONFIG_NAME).exists() else "main"
        where = f"Tasks run in their own git worktrees. Only checked work reaches {target}."
    else:
        where = "Workers work in this folder through Artemis's tools; the judge checks the folder afterwards."
    return "\n".join((f"Artemis {__version__} · project {project['name']} · lead: mock · {workers}", where,
                      f"You are asked only for: {kinds}."))


def converse(ledger: Ledger, config: HomeConfig, project, lines: Iterable[str], say: Callable[[str], None], *,
             live: bool = False, tick_s: float = 1.0, hold: Callable[[str, str], int | None] | None = None) -> None:
    """The mock lead over the person's lines, typed or scripted. The home runs the tasks it makes. `hold(kind,
    what)` may turn an ask into a request held on a card (its number); otherwise the ask is a card to decide."""
    from .lead import plan  # the rule planner; imported here because it is only needed while someone talks

    root = Path(project["path"])
    repo = project["kind"] == "repo"
    for line in lines:
        text = line.strip()
        verb, _, rest = text.removeprefix("artemis ").strip().partition(" ")
        if not text:
            continue
        if verb in {"quit", "exit"}:
            return
        if verb in {"approve", "decline"} and rest.strip().isdigit():
            say(_decide(ledger, int(rest), verb == "approve"))
            continue
        if verb in {"digest", "inbox", "status"}:
            say({"digest": attention.digest, "inbox": attention.inbox, "status": attention.status}[verb](ledger))
            continue
        settings = Config.load(root) if repo and (root / CONFIG_NAME).exists() else None
        steps = plan(text, settings.checks if settings else ())
        try:
            if settings:
                for _, criteria in steps.tasks:
                    settings.landing_checks(criteria)
            request = ledger.request(Role.OWNER, text, project=project["id"])
            tasks = [ledger.add_task(Role.LEAD, request, title, "", criteria, kind="code" if repo else "host")
                     for title, criteria in steps.tasks]
        except WorkflowError as error:
            say(f"lead (mock) › I cannot plan that: {error}")
            continue
        cards = [(hold and hold(kind, what)) or _ask(ledger, root, request, kind, what)
                 for kind, what in steps.asks if kind in config.interrupts.ask]
        rows = [f"lead (mock) › {_count(len(tasks))}, running in parallel:" if tasks else
                "lead (mock) › Nothing to build for this; it is a decision for you:"]
        for number, (title, criteria) in zip(tasks, steps.tasks):
            rows.append(f"  #{number} {title:<28} check: {', '.join(c.label for c in criteria)}")
        for card, (kind, what) in zip(cards, steps.asks):
            rows.append(f"  {what} — {WHY[kind].rstrip('.')}, so it waits in your inbox (decision {card}).")
        say("\n".join(rows))
        _follow(ledger, tasks, say, live=live, tick_s=tick_s)
        for card in ledger.cards("waiting"):
            say(attention.card(ledger, card))


WHY = {Interrupt.SEND: "it speaks in your name.", Interrupt.SPEND: "it spends money.",
       Interrupt.DELETE: "it cannot be undone."}


def _count(count: int) -> str:
    return {1: "One task", 2: "Two tasks", 3: "Three tasks"}.get(count, f"{count} tasks")


def _ask(ledger: Ledger, root: Path, request: int, kind: str, what: str) -> int:
    """An ask as a card to decide. The demo project's team post is a command on its card, which the home runs once
    you approve it; any other ask has nothing for the mock lead to run."""
    command = None
    if kind == Interrupt.SEND and (root / "notify.py").is_file():
        command = json.dumps([sys.executable, "notify.py", what])
    return ledger.open_card(Role.LEAD, kind, what, WHY[kind], request=request, command=command,
                            cwd=str(root) if command else None, shell=guard.SHELL if command else None)


def _decide(ledger: Ledger, number: int, approve: bool) -> str:
    ledger.decide_card(Role.OWNER, number, approve)
    if not approve:
        return f"declined: {number} · nothing happens"
    if ledger.card(number)["command"] is not None:
        return f"approved: {number} · Artemis carries it out once\n" + _carried(ledger, number)
    note = "recorded only (the mock lead has nothing to run for this)"
    ledger.finish_card(Role.LEAD, number, "done", note)
    return f"approved: {number} · recorded\nlead (mock) › Decision {number}: {note}."


def _carried(ledger: Ledger, number: int) -> str:
    """What came of an approved card the home carries out, once it has (or that it has not yet)."""
    from .demo_receiver import compare
    deadline = time.monotonic() + CARRY_S
    while (card := ledger.card(number))["state"] in {"approved", "running"} and time.monotonic() < deadline:
        time.sleep(0.1)
    if card["state"] in {"approved", "running"}:
        return f"lead (mock) › Decision {number} is not carried out yet; a running home does it (artemis serve)."
    lines = [line for line in (card["result"] or "").splitlines() if line.strip()]
    said = compare(ledger, card) or " · ".join(dict.fromkeys(lines[:1] + lines[-1:]))
    return f"lead (mock) › Decision {number}: {card['state']}" + (f"; {said}." if said else ".")


def _follow(ledger: Ledger, tasks: list[int], say: Callable[[str], None], *, live: bool, tick_s: float) -> None:
    """Show the status line as it changes until every task of this request has settled."""
    last = ""
    while True:
        line = attention.statusline(ledger)
        if line != last:
            if live:
                sys.stdout.write("\r\033[K" + line)
                sys.stdout.flush()
            else:
                say(line)
            last = line
        states = {row["id"]: row["state"] for row in ledger.work()}
        if all(states.get(task) not in {"queued", "running", "verified", "reported"} for task in tasks):
            break
        time.sleep(tick_s)
    if live:
        sys.stdout.write("\n")


def demo(fast: bool, worker: str, keep: bool, film: bool = False) -> int:
    """The golden path, unattended, on a home run inside this process: one sentence, three workers, one
    decision, approve, digest. Its home lives in the demo project's .artemis/home and goes away with it; its vault
    opens with a passphrase made for this demo, so no keychain is needed."""
    # the home imports the supervisor and the broker, which this module's other callers need not
    from . import httpop
    from .demo_receiver import DemoReceiver
    from .home import Grant, Home, Parts, Paths
    from .vault import origin

    seconds = {"ARTEMIS_MOCK_SECONDS": "0.2"} if fast else {}
    with TemporaryDirectory(prefix="artemis-demo-") as scratch, \
            mock.patch.dict(os.environ, {"ARTEMIS_VAULT_PASSPHRASE": secrets.token_urlsafe(24), **seconds}):
        root = (Path.cwd() if keep else Path(scratch)) / "artemis-demo"
        if root.exists():
            raise WorkflowError("./artemis-demo already exists; remove it or run the demo elsewhere.")
        create(root)
        Config.initialize(root, "main")
        paths = Paths.at(root / ".artemis" / "home")
        paths.root.mkdir(parents=True)
        paths.config.write_text('[vault]\nunlock = "env"\n', encoding="utf-8")
        # this build's parts, with the mock lead talking here and every task placed on the demo's worker
        parts = replace(Parts.of_this_build(), lead=None, web_start=None,
                        place=lambda kind, config, busy, **where: worker)
        home = Home(paths, 0, parts)
        project = home.ledger.project(home.ledger.add_project(Role.OWNER, root.name, "repo", str(root.resolve())))
        home.start()
        try:
            with DemoReceiver(home.ledger, project["id"]) as receiver:
                home.vault.set(HOOK, secrets.token_urlsafe(24), use="http", kind="send", origin=origin(receiver.url),
                               note="made for this demo; the local demo receiver stands in for a team webhook")
                lead = Grant(None, None, project["id"], "lead", root, "repo")

                def hold(kind: str, what: str) -> int | None:
                    if kind != Interrupt.SEND:
                        return None
                    held = httpop.request(home, lead, {"method": "POST", "url": receiver.url, "body": what,
                                                       "secret": HOOK})
                    return held.get("card")

                print(header(home.config, project, worker), flush=True)

                def scripted():
                    for line in (SENTENCE, "artemis approve 1", "artemis digest"):
                        print(f"\nyou › {line}", flush=True)
                        yield line

                converse(home.ledger, home.config, project, scripted(), lambda text: print(text, flush=True),
                         tick_s=0.2 if fast else 1.0, hold=hold)
            if film:
                folder = root.parent / "film-demo"
                clips = create_film(folder)
                _, schedule = stage_film(home.ledger, folder)
                when = datetime.fromtimestamp(home.ledger.schedules()[schedule - 1]["next_at"])
                print(f"\nStaged film-demo: {len(clips)} clips in incoming/, schedule {FILM_SPEC} "
                      f"(next {when:%a %d %b %H:%M}): {FILM_TITLE.lower()}.", flush=True)
        finally:
            home.close()
    return 0
