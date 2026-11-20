"""Drive the local role chain and inspect its ledger from a project root."""

import argparse
from pathlib import Path
import shlex
import sqlite3
import subprocess
import sys
import time

from .agents import CommandRunner
from .config import CONFIG_NAME, DEFAULT_LEDGER, Config, command
from .demo import demo
from .judge import ArtifactEvidence, CommandEvidence, Criterion, RuleJudge
from .ledger import Ledger
from .roles import OwnerAction, Role, WorkflowError
from .ship import checkout, git, ship


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        self.exit(2, f"{self.prog}: {' '.join(message.splitlines())}\n")


def _parser() -> Parser:
    parser = Parser(prog="harness", description="Drive a local evidence-driven delivery workflow.")
    commands = parser.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init", help="Install sample project configuration and initialize its ledger.")
    init.add_argument("dir", type=Path, nargs="?", default=Path("."))
    play = commands.add_parser("demo", help="Run a fictional task through every role.")
    play.add_argument("--fast", action="store_true", help="Skip the pauses between events.")
    show = commands.add_parser("show", help="Read the ledger timeline.")
    show.add_argument("--task", type=int, metavar="N", help="Show one task and its handoffs.")
    book = commands.add_parser("runbook", help="Read a configured role's instructions.")
    book.add_argument("role", type=Role, choices=list(Role))

    commands.add_parser("request", help="Owner: record a request.").add_argument("text")
    goal = commands.add_parser("goal", help="Lead: turn a request into a goal.")
    goal.add_argument("request", type=int)
    goal.add_argument("outcome")
    plan = commands.add_parser("plan", help="CTO: record how the goal will be delivered.")
    plan.add_argument("goal", type=int)
    plan.add_argument("approach")
    project = commands.add_parser("project", help="PM: open a project for a planned goal.")
    project.add_argument("goal", type=int)
    project.add_argument("title")
    assign = commands.add_parser("assign", help="PM: assign a task and its done criteria.")
    assign.add_argument("project", type=int)
    assign.add_argument("title")
    assign.add_argument("--criterion", action="append", required=True,
                        metavar="LABEL=cmd:COMMAND|LABEL=file:PATH")

    submit = commands.add_parser("submit", help="Worker: submit a commit and capture its evidence.")
    run = commands.add_parser("run", help="Worker: submit a claim from the configured local command.")
    for worker in (submit, run):
        worker.add_argument("--task", type=int, required=True)
        worker.add_argument("--commit", required=True)
        worker.add_argument("--evidence", action="append", default=[], metavar="cmd:COMMAND|file:PATH")
    submit.add_argument("--claim", required=True)
    judge = commands.add_parser("judge", help="CQO: judge the latest submission.")
    judge.add_argument("--task", type=int, required=True)
    land = commands.add_parser("ship", help="Run checks and fast-forward main to the passed branch.")
    land.add_argument("--task", type=int, required=True)
    land.add_argument("--branch", required=True)

    action = commands.add_parser("request-action", help="PM: request one owner-only action.")
    action.add_argument("--task", type=int, required=True)
    action.add_argument("--kind", type=OwnerAction, choices=list(OwnerAction), required=True)
    action.add_argument("description")
    for name, help_text in (("approve", "Owner: approve one waiting action."),
                            ("action", "Worker: simulate the approved action.")):
        commands.add_parser(name, help=help_text).add_argument("--approval", type=int, required=True)
    for name, help_text in (("stop", "Owner: stop automatic work."),
                            ("resume", "Owner: release a stop.")):
        commands.add_parser(name, help=help_text).add_argument("reason")

    return parser


def _line(row: sqlite3.Row) -> str:
    return f"{row['id']:02d}  {row['role']:<6}  {row['kind']:<9}  {row['detail']}"


def _show(ledger: Ledger, task: int | None, heading: str = "Ledger timeline") -> None:
    timeline = ledger.timeline(task)
    print(heading)
    for row in timeline:
        print(_line(row))


def _play(fast: bool) -> None:
    ledger = Ledger(DEFAULT_LEDGER)
    ledger.initialize()
    previous = ledger.timeline()
    cursor = previous[-1]["id"] if previous else 0

    def emit() -> None:
        nonlocal cursor
        for row in ledger.timeline():
            if row["id"] > cursor:
                print(_line(row), flush=True)
                cursor = row["id"]
                if not fast:
                    time.sleep(0.2)

    print("Todo CLI demo", flush=True)
    task = demo(ledger, emit)
    _show(ledger, task, f"\nLedger timeline | task {task}")
    print(f"\nLedger: {DEFAULT_LEDGER}")


Source = str | tuple[str, ...]


def _source(text: str) -> Source:
    kind, _, value = text.partition(":")
    if kind == "cmd":
        return command(shlex.split(value), "Command evidence")
    if kind == "file" and value and "\0" not in value:
        path = Path(value)
        if not path.is_absolute() and ".." not in path.parts and path.parts:
            return path.as_posix()
    raise WorkflowError("Use cmd:COMMAND or file:RELATIVE_PATH for evidence.")


def _criterion(text: str) -> Criterion:
    label, equals, spec = text.partition("=")
    if not equals or not label.strip():
        raise WorkflowError("Use LABEL=cmd:COMMAND or LABEL=file:RELATIVE_PATH for a criterion.")
    source = _source(spec)
    if isinstance(source, str):
        return Criterion(label.strip(), artifact=source)
    return Criterion(label.strip(), command=source)


def _require_git_root(root: Path) -> None:
    try:
        checkout_root = Path(git(root, "rev-parse", "--show-toplevel")).resolve()
    except subprocess.CalledProcessError:
        raise WorkflowError("Run this command from the target Git repository root.") from None
    if checkout_root != root:
        raise WorkflowError("Run this command from the target Git repository root.")


def _submit(args: argparse.Namespace, config: Config, ledger: Ledger) -> None:
    _require_git_root(config.root)
    try:
        sha = git(config.root, "rev-parse", "--verify", "--end-of-options", f"{args.commit}^{{commit}}")
    except subprocess.CalledProcessError:
        raise WorkflowError("The submitted commit does not exist in this repository.") from None
    title, criteria = ledger.submission_brief(args.task, sha)
    sources = {number: item.command or item.artifact for number, item in enumerate(criteria, 1)}
    selected = dict.fromkeys(_source(text) for text in args.evidence)
    if selected.keys() - sources.values():
        raise WorkflowError("Each evidence source must match an assigned criterion.")

    claim = getattr(args, "claim", "")
    captured = {}
    if selected or args.command == "run":
        with checkout(config.root, sha) as tree:
            # Read artifacts before commands can change files in the disposable checkout.
            for source in sorted(selected, key=lambda item: isinstance(item, tuple)):
                ledger.allow_step(args.task)
                if isinstance(source, str):
                    try:
                        git(tree, "--literal-pathspecs", "ls-files", "--error-unmatch", "--", source)
                        captured[source] = ArtifactEvidence.capture(tree, source)
                    except (OSError, subprocess.CalledProcessError):
                        raise WorkflowError("File evidence needs a readable file tracked by the commit.") from None
                else:
                    captured[source] = CommandEvidence.capture(tree, source)
            if args.command == "run":
                ledger.allow_step(args.task)
                criteria_lines = "\n".join(f"- {item.label}: {item.artifact or shlex.join(item.command)}"
                                           for item in criteria)
                brief = f"Task {args.task}: {title}\nCommit: {sha}\nDone criteria:\n{criteria_lines}\n"
                claim = CommandRunner(config.roles[Role.WORKER]).claim(tree, args.task, brief)
    if not claim.strip():
        raise WorkflowError("Provide a nonempty claim.")
    ledger.submit(Role.WORKER, args.task, sha, claim,
                  {number: captured[source] for number, source in sources.items() if source in captured})
    print(f"Task {args.task} reported at {sha[:12]}.")


def _transition(args: argparse.Namespace, config: Config, ledger: Ledger) -> int:
    match args.command:
        case "request":
            print(ledger.request(Role.OWNER, args.text))
        case "goal":
            print(ledger.set_goal(Role.LEAD, args.request, args.outcome))
        case "plan":
            ledger.plan(Role.CTO, args.goal, args.approach)
        case "project":
            print(ledger.open_project(Role.PM, args.goal, args.title))
        case "assign":
            criteria = tuple(_criterion(item) for item in args.criterion)
            print(ledger.assign(Role.PM, args.project, args.title, criteria))
        case "submit" | "run":
            _submit(args, config, ledger)
        case "judge":
            verdict = ledger.judge(Role.CQO, args.task, RuleJudge())
            print(f"{verdict.kind}: {'; '.join(verdict.gaps) or 'All done criteria supported'}")
            return {"pass": 0, "reject": 3, "stop": 4}[verdict.kind]
        case "ship":
            _require_git_root(config.root)
            receipt = ship(ledger, args.task, config.root, args.branch, commands=config.checks)
            print(f"Ship {receipt.state}: {receipt.commit}")
            return 0 if receipt.state == "applied" else 5
        case "request-action":
            if args.kind not in config.owner_actions:
                raise WorkflowError("This owner action kind is disabled in harness.toml.")
            print(ledger.request_action(Role.PM, args.task, args.kind, args.description))
        case "approve":
            ledger.approve(Role.OWNER, args.approval)
        case "action":
            ledger.simulate_action(Role.WORKER, args.approval)
        case "stop":
            ledger.stop(Role.OWNER, args.reason)
        case "resume":
            ledger.resume(Role.OWNER, args.reason)
        case "show":
            _show(ledger, args.task)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "demo":
            _play(args.fast)
            return 0
        if args.command == "init":
            config = Config.initialize(args.dir)
            Ledger(config.ledger).initialize()
            print(f"Ledger ready at {config.ledger.relative_to(config.root)}")
            return 0
        root = Path.cwd()
        if args.command == "show" and not (root / CONFIG_NAME).exists():
            if not DEFAULT_LEDGER.is_file():
                raise WorkflowError("Run harness init or harness demo first.")
            _show(Ledger(DEFAULT_LEDGER), args.task)
            return 0
        config = Config.load(root)
        if args.command == "runbook":
            print(config.roles[args.role].instructions())
            return 0
        if not config.ledger.is_file():
            raise WorkflowError("Run harness init to initialize the configured ledger.")
        return _transition(args, config, Ledger(config.ledger))
    except (ValueError, WorkflowError) as error:
        print(f"harness: {' '.join(str(error).splitlines())}", file=sys.stderr)
    except (sqlite3.Error, subprocess.SubprocessError, OSError):
        print("harness: a local database, Git, or filesystem operation failed.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
