"""The `artemis` command: what the person, the lead and the workers call."""

import argparse
import os
from pathlib import Path
import shlex
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import time

from . import attention, sample
from .agents import pick
from .config import CONFIG_NAME, Config, command, ledger_path
from .judge import Criterion
from .lead import chat, header, pair, start
from .ledger import Ledger
from .roles import Interrupt, Role, WorkflowError
from .ship import git
from .supervise import dispatch, log_path, spawn, worktree


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        self.exit(2, f"{self.prog}: {attention.visible(message)}\n")


def _parser() -> Parser:
    parser = Parser(prog="artemis", description="Talk to one lead while workers run in parallel. "
                    "You are asked only for real decisions.")
    commands = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")
    add = commands.add_parser

    begin = add("start", help="Start the lead you talk to (in a Git repository, or --demo).")
    begin.add_argument("--demo", action="store_true", help="Create ./artemis-demo, a small project to try it on.")
    begin.add_argument("--agent", metavar="NAME", help="claude or mock for both lead and workers (default: artemis.toml).")
    play = add("demo", help="Run the whole path once, unattended, with mock workers.")
    play.add_argument("--fast", action="store_true", help="Make the mock workers near-instant.")
    play.add_argument("--agent", default="mock", metavar="NAME", help="Worker agent (default: mock).")
    play.add_argument("--keep", action="store_true", help="Leave ./artemis-demo in place to inspect it.")
    add("init", help="Write artemis.toml and the ledger in the current Git repository.")

    add("status", help="Running work, decisions for you, and the count of times you were asked.")
    add("inbox", help="The decisions waiting for you.")
    peek = add("digest", help="What happened since you last looked, one line each with its evidence label.")
    peek.add_argument("--peek", action="store_true", help="Do not mark it as read.")
    for name, text in (("approve", "You: say yes to one decision."), ("decline", "You: say no to one decision.")):
        add(name, help=text).add_argument("decision", type=int)

    words = add("request", help="Lead: record what the person asked for, in their words.")
    words.add_argument("text")
    task = add("task", help="Lead: add a task to a request; it starts at once.")
    task.add_argument("request", type=int)
    task.add_argument("title")
    task.add_argument("--brief", default="", help="What to change and why.")
    task.add_argument("--check", action="append", default=[], metavar="COMMAND", help="Must exit 0.")
    task.add_argument("--file", action="append", default=[], metavar="PATH", help="Must exist in the commit.")
    task.add_argument("--hold", action="store_true", help="Queue it without starting.")
    ask = add("ask", help="Lead: put one decision to the person.")
    ask.add_argument("request", type=int)
    ask.add_argument("what")
    ask.add_argument("--kind", required=True, choices=list(Interrupt))
    ask.add_argument("--why", required=True)
    done = add("carried", help="Lead: record that an approved decision was carried out.")
    done.add_argument("decision", type=int)
    done.add_argument("note")
    again = add("retry", help="Lead: run a stuck task again.")
    again.add_argument("task", type=int)
    again.add_argument("--brief", help="Replace the task's brief.")
    drop = add("drop", help="Lead: give up a task, with the reason.")
    drop.add_argument("task", type=int)
    drop.add_argument("reason")
    note = add("note", help="Lead: record its own reading (shown as inferred).")
    note.add_argument("text")
    pause = add("wait", help="Lead: block until something the person should hear about happens.")
    pause.add_argument("--timeout", type=float, default=600, metavar="SECONDS")
    show = add("show", help="The full record: every event, or one task's events and log tail.")
    show.add_argument("--task", type=int, metavar="N")
    add("statusline", help="One line for a status bar.")
    for name, text in (("stop", "You: stop all automatic work now."), ("resume", "You: release a stop.")):
        add(name, help=text).add_argument("reason", nargs="?", default="")
    return parser


SHELL_OPERATORS = set("();<>|&")


def _check(text: str) -> tuple[str, ...]:
    """One command run without a shell. Shell operators are refused rather than passed on as arguments."""
    lexer = shlex.shlex(text, posix=False, punctuation_chars=True)
    lexer.whitespace_split = True
    if any(token and set(token) <= SHELL_OPERATORS for token in lexer):
        raise WorkflowError(f"--check runs one command without a shell: {text!r}. "
                            "Give each command its own --check; every one must exit 0.")
    return command(shlex.split(text), "--check")


def _criteria(config: Config, checks: list[str], files: list[str]) -> tuple[Criterion, ...]:
    items = [Criterion(text, command=_check(text)) for text in checks]
    for text in files:
        path = Path(text)
        if path.is_absolute() or ".." in path.parts or not path.parts:
            raise WorkflowError("--file needs a path inside the project.")
        items.append(Criterion(path.as_posix(), artifact=path.as_posix()))
    items = items or [Criterion(" ".join(c), command=c) for c in config.checks]
    config.landing_checks(items)
    return tuple(items)


def _root() -> Path:
    try:
        root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel")).resolve()
    except (subprocess.CalledProcessError, OSError):
        raise WorkflowError("Run this inside a Git repository (or try: artemis start --demo).") from None
    return root


def _init(root: Path) -> Config:
    """Install the settings once. Work lands on main, or else on the branch checked out now."""
    target = "main"
    if not git(root, "rev-parse", "--verify", "--quiet", "refs/heads/main", check=False):
        target = git(root, "symbolic-ref", "--quiet", "--short", "HEAD", check=False)
        if not target or not git(root, "rev-parse", "--verify", "--quiet", "HEAD", check=False):
            raise WorkflowError("Check out a branch with at least one commit; Artemis lands work on it.")
    config = Config.initialize(root, target)
    Ledger(ledger_path(root)).initialize()
    exclude = Path(git(root, "rev-parse", "--git-path", "info/exclude"))
    exclude = exclude if exclude.is_absolute() else root / exclude
    lines = exclude.read_text(encoding="utf-8").splitlines() if exclude.exists() else []
    if ".artemis/" not in lines:
        exclude.parent.mkdir(parents=True, exist_ok=True)
        exclude.write_text("\n".join(lines + [".artemis/"]) + "\n", encoding="utf-8")
    return config


def _session(name: str | None, config: Config) -> Config:
    lead, worker = pair(name, config)
    os.environ["ARTEMIS_LEAD"], os.environ["ARTEMIS_WORKER"] = lead.name, worker.name
    return Config.load(config.root)


def _start(args: argparse.Namespace) -> int:
    if args.demo:
        target = Path.cwd() / "artemis-demo"
        if not target.exists():
            sample.create(target)
        os.chdir(target)
    root = _root()
    config = _session(args.agent, _init(root))
    lead, worker = pair(None, config)
    return start(config, lead, worker)


def _demo(fast: bool, agent: str, keep: bool) -> int:
    """The golden path, unattended: one sentence, three workers, one decision, approve, digest."""
    if fast:
        os.environ["ARTEMIS_MOCK_SECONDS"] = "0.2"
    os.environ["ARTEMIS_LEAD"], os.environ["ARTEMIS_WORKER"] = "chat", pick(agent, "worker").name
    with TemporaryDirectory(prefix="artemis-demo-") as scratch:
        root = (Path.cwd() if keep else Path(scratch)) / "artemis-demo"
        if root.exists():
            raise WorkflowError("./artemis-demo already exists; remove it or run the demo elsewhere.")
        sample.create(root)
        config = _init(root)
        ledger = Ledger(ledger_path(root))
        lead, worker = pair(None, config)
        print(header(config, lead, worker), flush=True)

        def scripted():
            for line in (sample.SENTENCE, "artemis approve 1", "artemis digest"):
                print(f"\nyou › {line}", flush=True)
                yield line

        chat(config, ledger, scripted(), lambda text: print(text, flush=True), live=False,
             tick_s=0.2 if fast else 1.0)
        _settle(ledger)
    return 0


def _settle(ledger: Ledger, limit_s: float = 30) -> None:
    """Wait for supervisors to exit before their project is removed."""
    deadline = time.monotonic() + limit_s
    while time.monotonic() < deadline:
        if not any(row["pid"] and attention._alive(row["pid"]) for row in ledger.work()):
            return
        time.sleep(0.1)


def _show(ledger: Ledger, root: Path, task: int | None) -> None:
    for row in ledger.events(task=task):
        scope = f"#{row['task_id']}" if row["task_id"] else (f"D{row['decision_id']}" if row["decision_id"] else "")
        print(f"{row['id']:03d}  {row['role']:<6} {row['kind']:<11} {scope:<4} {attention.visible(row['detail'])}")
    if task is not None:
        log = log_path(root, task)
        if log.exists():
            tail = log.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-15:]
            print(f"\nLast lines of the worker log ({log.relative_to(root).as_posix()}):")
            print("\n".join(attention.visible(line) for line in tail))


def _ledger_command(args: argparse.Namespace, root: Path) -> int:
    config = Config.load(root)
    ledger = Ledger(ledger_path(root))
    if not ledger.path.is_file():
        raise WorkflowError("Run artemis init (or artemis start) first.")
    match args.command:
        case "status":
            print(attention.status(ledger))
        case "statusline":
            print(attention.statusline(ledger))
        case "inbox":
            print(attention.inbox(ledger))
        case "digest":
            print(attention.digest(ledger, mark=not args.peek))
        case "approve" | "decline":
            ledger.decide(Role.OWNER, args.decision, args.command == "approve")
            print(f"{args.command}d: {args.decision}" + (" · the lead carries it out" if args.command == "approve"
                                                          else " · nothing happens"))
        case "request":
            print(ledger.request(Role.OWNER, args.text))
        case "task":
            number = ledger.add_task(Role.LEAD, args.request, args.title, args.brief,
                                     _criteria(config, args.check, args.file))
            print(number)
            if not args.hold:
                dispatch(config, ledger)
        case "ask":
            if Interrupt(args.kind) not in config.interrupts:
                raise WorkflowError(f"{args.kind} is not in [interrupts] in {CONFIG_NAME}; decide it yourself.")
            print(ledger.ask(Role.LEAD, args.request, Interrupt(args.kind), args.what, args.why))
        case "carried":
            ledger.carried_out(Role.LEAD, args.decision, args.note)
        case "retry":
            row = ledger.work(args.task)[0]
            if row["state"] not in {"stuck", "queued"}:
                raise WorkflowError(f"Task {args.task} is {row['state']}; only a stuck task is retried.")
            if args.brief:
                ledger.revise(Role.LEAD, args.task, args.brief)
            spawn(root, ledger.claim_run(Role.LEAD, args.task, pick(config.worker, "worker").name), args.task)
        case "drop":
            ledger.drop(Role.LEAD, args.task, args.reason)
            tree = worktree(root, args.task)
            if tree.exists():
                git(root, "worktree", "remove", "--force", str(tree))
        case "note":
            ledger.note(Role.LEAD, args.text)
        case "wait":
            print(attention.wait(ledger, args.timeout))
        case "show":
            _show(ledger, root, args.task)
        case "stop":
            ledger.stop(Role.OWNER, args.reason or "stopped")
            print("Stopped. Workers end their current step; nothing new starts until artemis resume.")
        case "resume":
            ledger.resume(Role.OWNER, args.reason or "resumed")
            dispatch(config, ledger)
            print("Resumed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "start":
            return _start(args)
        if args.command == "demo":
            return _demo(args.fast, args.agent, args.keep)
        if args.command == "init":
            config = _init(_root())
            print(f"Ready: {CONFIG_NAME} and .artemis/ in {config.root.name}. Next: artemis start")
            return 0
        return _ledger_command(args, _root())
    except (ValueError, WorkflowError) as error:
        print(f"artemis: {attention.visible(str(error))}", file=sys.stderr)
    except (sqlite3.Error, subprocess.SubprocessError, OSError) as error:
        print(f"artemis: a local database, Git or file operation failed ({type(error).__name__}).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
