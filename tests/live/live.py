"""Live runs of the real agent CLIs through the adapters, for receipts. Not part of the unit suite.

    python tests/live/live.py [options] worker NAME [NAME ...]   one coding task per provider, all at the same time
    python tests/live/live.py [options] lead NAME [NAME ...]     one lead turn per provider, in order, in one home
    python tests/live/live.py [options] doctor [NAME ...]        qualification probes; --role narrows them

Each run builds a throwaway home: a real ledger, a demo repository, a demo notes folder, and the stand-in broker
(broker.py) as the agents' Artemis tools. Provider keys come from stdin, one line per --key-stdin name, and stay
in memory; every line printed is scrubbed of them.
"""

import argparse
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
from threading import Event, Lock, Thread
import time
from types import SimpleNamespace

from artemis import agents, qualify
from artemis.judge import Criterion
from artemis.lead import LeadRunner
from artemis.ledger import Ledger
from artemis.packet import focus, packet
from artemis.roles import Role, WorkflowError
from artemis.scrub import Scrubber
from artemis.worker_adapters import delta

BROKER = Path(__file__).with_name("broker.py")
CHECK = ["python" if os.name == "nt" else "python3", "-m", "unittest"]     # Windows has no python3 by default
WORKER_MINUTES = 15
LEAD_MESSAGES = [
    "What is going on in calc and in notes right now? Also add a task to calc: a multiply(a, b) function in "
    f"calc.py with a unittest in test_calc.py, checked by `{' '.join(CHECK)}`.",
    "Which of the two projects needs me next, and why? One short paragraph.",
]


class MemoryVault:
    """Keys read from stdin, kept in memory for these runs only."""

    def __init__(self, values: dict[str, str]):
        self.held, self.version, self.unlocked, self.key = values, 1, True, os.urandom(32)
        self.scrubber = Scrubber(self)

    def info(self, name):
        return SimpleNamespace(name=name, kind="api-key", note="") if name in self.held else None

    def env(self, names):
        return {name: self.held[name] for name in names}

    def values(self):
        return list(self.held.items())

    def master_key(self) -> bytes:
        return self.key


class Out:
    """Scrubbed, line-buffered printing shared by the threads."""

    def __init__(self, vault):
        self.scrubber, self.lock = vault.scrubber, Lock()

    def __call__(self, text: str = "", stream=sys.stdout) -> None:
        with self.lock:
            print(self.scrubber.scrub(text), file=stream, flush=True)


def git(cwd: Path, *argv: str) -> str:
    return subprocess.run(("git", "-c", "user.name=demo", "-c", "user.email=demo@example.com", *argv), cwd=cwd,
                          check=True, capture_output=True, text=True).stdout.strip()


def demo_repo(path: Path) -> Path:
    path.mkdir(parents=True)
    git(path, "init", "-q", "-b", "main")
    (path / "calc.py").write_text('"""A tiny calculator."""\n\n\ndef add(a, b):\n    return a + b\n', encoding="utf-8")
    (path / "test_calc.py").write_text("import unittest\n\nimport calc\n\n\nclass Add(unittest.TestCase):\n"
                                       "    def test_add(self):\n        self.assertEqual(calc.add(2, 3), 5)\n\n\n"
                                       "if __name__ == \"__main__\":\n    unittest.main()\n", encoding="utf-8")
    (path / "README.md").write_text("# calc\n\nA tiny calculator: add so far.\n", encoding="utf-8")
    git(path, "add", ".")
    git(path, "commit", "-q", "-m", "Start calc")
    return path


def demo_notes(path: Path) -> Path:
    path.mkdir(parents=True)
    (path / "2026-11-02 groceries.md").write_text("- oat milk\n- basil\n", encoding="utf-8")
    (path / "2026-11-14 trip.md").write_text("Train at 08:10. Bring the charger.\n", encoding="utf-8")
    (path / "ideas.md").write_text("A notes index that sorts by date.\n", encoding="utf-8")
    return path


class LiveHome:
    """The home interface LeadRunner uses, over a throwaway ledger, with the stand-in broker as the tools."""

    def __init__(self, root: Path, config, vault, out: Out):
        self.paths = SimpleNamespace(root=root, lead=root / "lead", runs=root / "runs")
        self.paths.runs.mkdir(parents=True, exist_ok=True)
        self.ledger = Ledger(root / "ledger.db")
        self.ledger.initialize()
        self.config, self.vault, self.out = config, vault, out
        self.closing = Event()
        self.log = root / "calls.jsonl"
        self.log.touch()
        self.streamed: list[str] = []

    def grant(self, run, task, project, role, root, kind) -> Path:
        token = self.paths.runs / f"{run}.token"
        token.write_text(json.dumps({"run": run, "task": task, "project": project, "role": role, "root": str(root),
                                     "kind": kind}), encoding="utf-8")
        return token

    def revoke(self, run) -> None:
        (self.paths.runs / f"{run}.token").unlink(missing_ok=True)

    def mcp_command(self, token: Path) -> list[str]:
        return [sys.executable, str(BROKER), "--ledger", str(self.paths.root / "ledger.db"), "--token", str(token),
                "--log", str(self.log)]

    def publish(self, kind: str, data: dict) -> None:
        self.streamed.append(data["text"])

    def calls(self, after: int = 0) -> list[dict]:
        return [json.loads(line) for line in self.log.read_text(encoding="utf-8").splitlines()[after:]]


def settings(args) -> SimpleNamespace:
    return SimpleNamespace(
        agents={"lead": "auto", "worker_minutes": WORKER_MINUTES}, placement={}, lead={"max_turn_minutes": 8},
        api={"base_url": args.api_base, "model": args.api_model, "key": args.api_key},
        gemini={"model": args.gemini_model}, opencode={"model": args.opencode_model})


def describe(name: str, config) -> str:
    return f"{agents.LABELS[name]} {qualify.version(name, config)} on {platform.platform()}"


# Workers

@dataclass
class Receipt:
    name: str
    lines: list[str] = field(default_factory=list)
    began: float = 0.0
    ended: float = 0.0
    passed: bool = False


def worker(name: str, home: LiveHome, out: Out) -> Receipt:
    receipt = Receipt(name)
    ledger, root = home.ledger, home.paths.root
    repo = demo_repo(root / f"calc-{name}")
    project = ledger.add_project(Role.OWNER, f"calc-{name}", "repo", repo)
    title = "Add subtract to calc.py"
    brief = ("Add subtract(a, b) to calc.py, returning a - b, and a unittest for it in test_calc.py. Keep add as "
             "it is. Run the check with the Artemis run tool before you finish.")
    task = ledger.add_task(Role.LEAD, ledger.request(Role.OWNER, title, project), title, brief,
                           (Criterion("unit tests pass", command=tuple(CHECK)),), project=project)
    tree = root / f"tree-{name}"
    git(repo, "worktree", "add", "-q", "-b", f"artemis/task-{task}", str(tree))
    run = ledger.claim_run(Role.HOME, task, name, f"artemis/task-{task}")
    token = home.grant(run, task, project, "worker", tree, "repo")
    prompt = f"Task #{task}: {title}\n\n{brief}\n\nChecks (argv for the run tool): {json.dumps(CHECK)}\n"
    instructions = (Path(agents.__file__).parent / "templates" / "worker.md").read_text(encoding="utf-8")
    spawn = agents.launch(name, role="worker", mode="repo", cwd=tree, prompt=prompt, mcp=home.mcp_command(token),
                          config=home.config, vault=home.vault, scratch=root / f"scratch-{name}",
                          instructions=instructions)
    receipt.lines.append(f"provider: {describe(name, home.config)}")
    receipt.lines.append(f"argv: {json.dumps(spawn.argv)}")
    receipt.lines.append(f"env added: {sorted(spawn.env)}")
    receipt.began = time.time()
    out(f"[{name}] started at {time.strftime('%H:%M:%S')}", sys.stderr)
    outcome = agents.run_turn(spawn, tree, WORKER_MINUTES * 60,
                              lambda line: (piece := delta(name, line)) and out(f"[{name}] {piece.rstrip()}", sys.stderr))
    receipt.ended = time.time()
    home.revoke(run)
    try:
        reply = agents.answer(spawn, outcome)
    except WorkflowError as error:      # a live receipt records what went wrong, as the agent said it
        reply = f"(none: {error})"
    check = subprocess.run(CHECK, cwd=tree, capture_output=True, text=True)
    receipt.passed = outcome.exit_code == 0 and check.returncode == 0 and "subtract" in (tree / "calc.py").read_text()
    calls = [call for call in home.calls() if call["run"] == run]
    receipt.lines += [
        f"exit: {outcome.exit_code} after {receipt.ended - receipt.began:.0f} s "
        f"({time.strftime('%H:%M:%S', time.localtime(receipt.began))}-"
        f"{time.strftime('%H:%M:%S', time.localtime(receipt.ended))})",
        f"reply: {reply.strip()[:800]}",
        f"changed: {git(tree, 'status', '--porcelain') or 'nothing'}",
        f"check {' '.join(CHECK)} afterwards: exit {check.returncode} · {check.stderr.strip().splitlines()[-1:]}",
        f"artemis tool calls: {json.dumps([(call['tool'], call['arguments']) for call in calls])[:1200]}",
        f"native tools called: {sorted(qualify.native_tools(name, outcome.stdout)[1])}",
        f"stderr tail: {' '.join(outcome.stderr.split())[-600:]}" if outcome.exit_code != 0 else "stderr: (not shown)",
        f"last stdout lines: {json.dumps([line[:240] for line in outcome.stdout.splitlines()[-8:]], indent=1)}"
        if outcome.exit_code != 0 else "stdout: (read above)",
        f"RESULT: {'PASS' if receipt.passed else 'FAIL'}",
    ]
    return receipt


def workers(names: list[str], home: LiveHome, out: Out) -> int:
    receipts: dict[str, Receipt] = {}
    threads = [Thread(target=lambda name=name: receipts.__setitem__(name, worker(name, home, out))) for name in names]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    for name in names:
        receipt = receipts.get(name, Receipt(name, ["(the run raised; see stderr)"]))
        out(f"\n=== worker {name} ===")
        for line in receipt.lines:
            out(line)
    if len(receipts) > 1:
        overlap = min(r.ended for r in receipts.values()) - max(r.began for r in receipts.values())
        out(f"\nconcurrent: {', '.join(names)} overlapped for {max(overlap, 0):.0f} s")
    return 0 if receipts and all(receipt.passed for receipt in receipts.values()) else 1


# The lead

def lead(names: list[str], home: LiveHome, out: Out) -> int:
    ledger, root = home.ledger, home.paths.root
    calc = ledger.add_project(Role.OWNER, "calc", "repo", demo_repo(root / "calc"))
    notes = ledger.add_project(Role.OWNER, "notes", "folder", demo_notes(root / "notes"))
    ledger.add_task(Role.LEAD, ledger.request(Role.OWNER, "Add subtract", calc), "Add subtract to calc.py",
                    "subtract(a, b) with a test.", (Criterion("unit tests pass", command=tuple(CHECK)),), project=calc)
    ledger.add_task(Role.LEAD, ledger.request(Role.OWNER, "Index the notes", notes), "Write index.md for the notes",
                    "One line per note, newest first.", (Criterion("index.md exists", artifact="index.md"),),
                    project=notes, kind="docs")
    ledger.say(Role.OWNER, "Keep calc tiny: no dependencies.")
    ledger.say(Role.LEAD, "Noted: calc stays dependency-free.")
    runner, failures = LeadRunner(home), 0
    for number, name in enumerate(names):
        home.config.agents["lead"] = name
        out(f"\n=== lead turn {number + 1}: {describe(name, home.config)} ===")
        if name == "codex":
            result = qualify.qualify("codex", "lead", ledger, home.config, home.vault)
            out(f"codex lead qualification: {result.status} · {result.receipt}")
        text = LEAD_MESSAGES[min(number, len(LEAD_MESSAGES) - 1)]
        message = ledger.say(Role.OWNER, text)
        row = ledger.message(message)
        out("--- context packet the lead started from ---")
        out(packet(ledger, focus(ledger, row["text"], row["project_id"]), [], before=message))
        out(f"--- message ---\nyou (message #{message}): {text}")
        seen, home.streamed = len(home.calls()), []
        began = time.monotonic()
        try:
            runner.turn(message)
        except Exception as error:      # a live receipt records whatever went wrong, as it was
            failures += 1
            out(f"--- the turn failed ---\n{type(error).__name__}: {error}")
        out(f"--- artemis tool calls ({time.monotonic() - began:.0f} s) ---")
        for call in home.calls(seen):
            out(f"{call['tool']} {json.dumps(call['arguments'])} -> {call['answer'][:300]}")
        out(f"--- streamed to the app: {len(home.streamed)} pieces ---")
        for said in [row for row in ledger.messages(after=message) if row["role"] == "lead"]:
            out(f"--- reply (message #{said['id']}, turn {said['turn']}) ---\n{said['text']}")
        events = [row for row in ledger.events() if row["kind"] == "lead.turn"][-1:]
        out("--- ledger ---\n" + "\n".join(f"{row['kind']}: {row['detail']} {row['data']}" for row in events))
    out("\n=== tasks after the turns ===")
    for row in ledger.work():
        out(f"#{row['id']} {ledger.project(row['project_id'])['name']} · {row['title']} · {row['state']}")
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="live.py")
    parser.add_argument("--key-stdin", action="append", default=[], help="a vault name; its value is a stdin line")
    parser.add_argument("--gemini-model", default="")
    parser.add_argument("--opencode-model", default="")
    parser.add_argument("--api-base", default="")
    parser.add_argument("--api-model", default="")
    parser.add_argument("--api-key", default="OPENAI_API_KEY")
    parser.add_argument("--role", action="append", choices=("lead", "code", "host"))
    parser.add_argument("command", choices=("worker", "lead", "doctor"))
    parser.add_argument("names", nargs="*")
    args = parser.parse_args(argv)
    vault = MemoryVault({name: sys.stdin.readline().strip() for name in args.key_stdin})
    out = Out(vault)
    config = settings(args)
    with tempfile.TemporaryDirectory(prefix="artemis-live-") as folder:
        home = LiveHome(Path(folder).resolve(), config, vault, out)
        if args.command == "worker":
            return workers(args.names, home, out)
        if args.command == "lead":
            return lead(args.names, home, out)
        qualify.doctor(home.ledger, config, vault, args.names or None, args.role, out)
        out("\n=== stored matrix ===")
        for row in home.ledger.adapters():
            out(f"{row['provider']} · {row['role']} · {row['os']} · {row['version']} · {row['auth']} · "
                f"{row['status']} · features {row['features']}\n  {row['receipt']}")
        return 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    sys.exit(main())
