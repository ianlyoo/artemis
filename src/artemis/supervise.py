"""Run each task to its end without the person: the worker, its evidence, the judge, and for a repository the
ship lane; at most three attempts per run.

`dispatch` is called by the home twice a second. It gives each ready task a provider and a run, within
[agents] max_workers and each provider's cap, and starts a Supervisor thread for it. A repository task works in
its own Git worktree under ARTEMIS_HOME/work on branch artemis/task-N; a folder task works in the folder itself,
through the home's tools, and is judged on what the folder holds afterwards.

When a worker asked the person something (a card), its run ends as soon as the worker exits, noted
"waiting for card N", without spending an attempt. Once every such card is decided and carried out, the task
runs again and the new attempt is told what came of each card.
"""

from collections import Counter
from contextlib import closing
from dataclasses import asdict, dataclass
from functools import partial
import hashlib
from importlib.resources import files
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
from tempfile import TemporaryFile
import threading
import time
from typing import Callable

from . import process
from .agents import AGENTS
from .config import CONFIG_NAME, DEFAULT_LEDGER, Config
from .judge import ArtifactEvidence, CommandEvidence, Criterion, RuleJudge, capture, snapshot
from .ledger import _criteria
from .roles import Role, WorkflowError
from .ship import checkout, git, identity, ship


ATTEMPTS = 3
POLL_S = 0.5
OPEN_CARD = ("waiting", "approved", "running")
WAITING = re.compile(r"waiting for card (\d+)")
FOLDER_WORKER = """\
# You are a worker

You do one task, alone, in the folder named below. Nobody will answer questions while you work: decide
sensibly and say what you assumed in your last message.

- Work through the Artemis tools: they read, write and run commands in this folder. A step that spends money,
  deletes what cannot be restored or sends something in the person's name becomes a card the person decides;
  when a tool says it is waiting for a card, finish and say so in your last message.
- Change only what the task needs, inside this folder.
- The judge checks the folder after you finish, against the checks below.
- Your last message is your claim: what you changed and what you ran, in at most five lines.
"""


@dataclass(frozen=True)
class Launch:
    """How to start one worker: argv, extra environment, the text it reads on stdin, and how to read its claim
    out of everything it printed."""
    argv: list[str]
    env: dict[str, str]
    stdin: str
    decode: Callable[[str], str]


def dispatch(home) -> list[int]:
    """Start a supervisor for each ready task while there is room. Returns the tasks started."""
    ledger = home.ledger
    if ledger.stopped() or home.closing.is_set():
        return []
    rows = ledger.work()
    running = [row for row in rows if row["state"] == "running"]
    busy = Counter(row["agent"] for row in running)
    room = home.config.agents.max_workers - len(running)
    started, held = [], {}
    for row in rows:
        if room <= 0:
            break
        thread = home.supervisors.get(row["id"])
        if (thread is not None and thread.is_alive()) or not _ready(home, row):
            continue
        project = ledger.project(row["project_id"])
        if project["id"] not in held:
            held[project["id"]] = project["kind"] == "repo" and legacy_stopped(Path(project["path"]))
        if held[project["id"]]:
            home.log_once(f"{project['name']}: its v0.2 ledger (.artemis/ledger.db) is stopped, so nothing starts "
                          "there until it is resumed with v0.2 or that file is moved aside")
            continue
        try:
            provider = row["provider"] or home.place(row["kind"], dict(busy), project["id"])
        except WorkflowError as error:
            home.log_once(f"task {row['id']} waits: {error}")
            continue
        if not provider or busy[provider] >= home.config.agents.cap(provider):    # "": none can take it now
            continue
        repo = project["kind"] == "repo"
        try:
            run = ledger.claim_run(Role.HOME, row["id"], provider, f"artemis/task-{row['id']}" if repo else None)
        except WorkflowError:
            continue
        home.retries.discard(row["id"])
        supervisor = Supervisor(home, run, row["id"], provider, row)
        thread = threading.Thread(target=supervisor.run, name=f"artemis-task-{row['id']}", daemon=True)
        home.supervisors[row["id"]] = thread
        thread.start()
        busy[provider] += 1
        room -= 1
        started.append(row["id"])
    return started


def _ready(home, row) -> bool:
    """Queued; or stuck and asked to run again; or waiting for cards that are all settled now."""
    if row["state"] == "queued":
        return True
    if row["state"] != "stuck":
        return False
    if row["id"] in home.retries:
        return True
    if not (row["note"] and WAITING.fullmatch(row["note"])):
        return False
    return not any(card["run_id"] == row["run_id"] and card["state"] in OPEN_CARD for card in home.ledger.cards())


def settings(root: Path) -> Config:
    """A project's own artemis.toml (checks, protected paths, its API worker), or empty settings."""
    return Config.load(root) if (root / CONFIG_NAME).exists() else Config(root, frozenset(), ())


def legacy_stopped(root: Path) -> bool:
    """Whether the repository's own v0.2 ledger ends in a stop. That file is read, never written."""
    old = root / DEFAULT_LEDGER
    if not old.is_file():
        return False
    try:
        with closing(sqlite3.connect(old.resolve().as_uri() + "?mode=ro", uri=True)) as db:
            last = db.execute("SELECT kind FROM events WHERE kind IN ('halt', 'resume') "
                              "ORDER BY id DESC LIMIT 1").fetchone()
    except sqlite3.Error:
        return False
    return bool(last and last[0] == "halt")


def evidence_digest(items: dict) -> str:
    """What a folder task submits in place of a commit: host: and the SHA-256 of its evidence."""
    record = {str(number): {"kind": type(item).KIND, **asdict(item)} for number, item in sorted(items.items())}
    return "host:" + hashlib.sha256(json.dumps(record, sort_keys=True).encode("utf-8")).hexdigest()


def _evidence(root: Path, sha: str, criteria: tuple[Criterion, ...], pass_env: tuple[str, ...] = ()) -> dict:
    """Evidence for a commit: each criterion in a fresh checkout of it, so no check sees another's leftovers."""
    items = {}
    for number, criterion in enumerate(criteria, 1):
        with checkout(root, sha) as tree:
            if criterion.command:
                items[number] = CommandEvidence.capture(tree, criterion.command, pass_env=pass_env)
            else:
                try:
                    git(tree, "--literal-pathspecs", "ls-files", "--error-unmatch", "--", criterion.artifact)
                    items[number] = ArtifactEvidence.capture(tree, criterion.artifact)
                except (OSError, subprocess.CalledProcessError, ValueError):
                    pass
    return items


def _commit(tree: Path, root: Path, message: str) -> str | None:
    """Commit what the worker left in its worktree. Returns a problem, or None.

    Workers only edit files; Artemis commits, so a sandboxed agent never needs write access to Git's metadata.
    """
    git(tree, "add", "--all", "--", ".")
    marked = git(tree, "grep", "--cached", "-l", "-E", "^(<<<<<<<|>>>>>>>) ", check=False)
    if marked:
        return f"conflict markers remain in {', '.join(marked.splitlines()[:5])}"
    merging = Path(git(tree, "rev-parse", "--git-path", "MERGE_HEAD"))
    merging = merging if merging.is_absolute() else tree / merging
    if git(tree, "status", "--porcelain") or merging.exists():
        git(tree, "-c", "commit.gpgsign=false", "commit", "--quiet", "--no-verify", "-m", message,
            env=identity(root))
    return None


def _merge_target(tree: Path, root: Path, target: str) -> list[str]:
    """Merge the target branch into the task branch. Returns the files left with conflict markers."""
    try:
        git(tree, "-c", "commit.gpgsign=false", "merge", "--no-ff", "--no-commit", target, env=identity(root))
    except subprocess.CalledProcessError:
        return git(tree, "diff", "--name-only", "--diff-filter=U").splitlines()
    _commit(tree, root, f"Merge {target} into this task")
    return []


def _card_outcome(card) -> str:
    what = f"Card {card['id']} ({card['what']})"
    result = (card["result"] or "").strip()[-500:]
    if card["kind"] == "secret":
        name = json.loads(card["options"] or "{}").get("name", "")
        return f"{what}: the person set the secret {name}; use it by its name."
    if card["kind"] == "choice":
        return f"{what}: the person chose {card['answer']}."
    match card["state"]:
        case "declined":
            return f"{what}: the person declined it. Do not do it; find another way, or say why there is none."
        case "expired":
            return f"{what}: nobody answered it in time, so it was not done. Ask again only if it is still needed."
        case "done":
            return f"{what}: approved and carried out. Result: {result or 'done'}"
        case _:
            return f"{what}: approved, but it ended {card['state']}. {result}".rstrip()


class Supervisor:
    """One run of one task, in its own thread."""

    def __init__(self, home, run: int, task: int, provider: str, previous):
        self.home = home
        self.ledger = home.ledger
        self.run_id = run
        self.provider = provider
        self.previous = previous                   # the task's work row before this run was claimed
        self.task = self.ledger.task_brief(task)
        self.project = self.ledger.project(self.task["project_id"])
        self.root = Path(self.project["path"])
        self.extra = tuple(map(Path, json.loads(self.project["allowed_roots"] or "[]")))   # project add --root
        self.repo = self.project["kind"] == "repo"
        self.criteria = _criteria(self.task["criteria"])
        self.log = home.paths.log(task)
        self.tree = home.paths.worktree(self.project["name"], task) if self.repo else self.root
        self.config = settings(self.root)
        self.shipped = False
        self.start: dict[str, dict] = {}

    def run(self) -> None:
        outcome, note = "stuck", "gave up"
        try:
            outcome, note = self._attempts()
        except WorkflowError as error:
            outcome, note = ("stopped", "stopped by you") if self.ledger.stopped() else ("stuck", str(error))
        except (subprocess.SubprocessError, OSError) as error:
            outcome, note = "stuck", f"{type(error).__name__} while running the task: {error}"
        except Exception as error:  # the run must still end in the ledger, whatever went wrong
            outcome, note = "stuck", f"Artemis failed while running the task: {type(error).__name__}: {error}"
        finally:
            self.home.revoke(self.run_id)
            self.ledger.end_run(Role.HOME, self.run_id, outcome, note[:500] or "gave up")
            if self.shipped:
                try:
                    git(self.root, "worktree", "remove", "--force", str(self.tree))
                except (subprocess.SubprocessError, OSError):
                    pass
            self.home.supervisors.pop(self.task["id"], None)

    # The attempts

    def _attempts(self) -> tuple[str, str]:
        task = self.task["id"]
        if self.repo and not self.tree.exists():
            self.tree.parent.mkdir(parents=True, exist_ok=True)
            git(self.root, "worktree", "add", "-B", f"artemis/task-{task}", str(self.tree), self.config.target)
        if not self.repo:
            self.start = self._inputs()
        token = self.home.grant(self.run_id, task, self.project["id"], "worker", self.tree, self.project["kind"])
        feedback = self._follow_up()
        note = "gave up"
        for attempt in range(1, ATTEMPTS + 1):
            self.ledger.allow_step()
            base = git(self.tree, "rev-parse", "HEAD") if self.repo else ""
            result, claim = self._work(feedback, token)
            if result == "stopped":
                return "stopped", "stopped by you"
            if result == "closing":
                return "stuck", "the home stopped"
            held = [card["id"] for card in self.ledger.cards()
                    if card["run_id"] == self.run_id and card["state"] in OPEN_CARD]
            if held:
                return "done", f"waiting for card {held[0]}"
            if result != "done":
                note = {"timeout": f"no result after {self.home.config.agents.worker_minutes} min",
                        "failed": "the worker exited with an error"}[result] + f": {claim[-300:]}"
                if result == "timeout":
                    return "stuck", note
                feedback = f"The previous attempt failed: {note}. Finish the task."
            else:
                done, note, feedback = (self._repo(claim, base) if self.repo else self._folder(claim))
                if done:
                    return "done", note
            if attempt < ATTEMPTS:
                self.ledger.retrying(Role.WORKER, task, note.splitlines()[0][:300])
        return "stuck", note

    def _repo(self, claim: str, base: str) -> tuple[bool, str, str]:
        """Commit, judge, review if asked, and land. Returns (shipped, note, feedback for another attempt)."""
        task, title, target = self.task["id"], self.task["title"], self.config.target
        problem = _commit(self.tree, self.root, title)
        sha = git(self.tree, "rev-parse", "HEAD")
        if problem or sha == base:
            note = problem or "the worker made no change"
            return False, note, f"Your last attempt left no usable change: {note}. Finish the change."
        self.ledger.submit(Role.WORKER, task, sha, claim,
                           _evidence(self.root, sha, self.criteria, self.config.pass_env))
        verdict = self.ledger.judge(Role.JUDGE, task, RuleJudge())
        if verdict.kind != "pass":
            gaps = "; ".join(verdict.gaps)
            return False, f"judge: {gaps}", f"The judge rejected your change: {gaps}. Fix it."
        rejected = self._review(sha)
        if rejected:
            return False, f"review: {rejected}", f"A reviewer rejected your change: {rejected}. Fix it."
        with self.home.lane(self.project["id"]):
            landing = ship(self.ledger, task, sha, self.root, title, target=target,
                           commands=self.config.landing_checks(self.criteria),
                           capture=partial(CommandEvidence.capture, pass_env=self.config.pass_env))
        if landing.state == "applied":
            self.shipped = True
            return True, landing.detail, ""
        note = f"ship lane: {landing.detail}"
        if landing.state == "blocked":
            raise WorkflowError(note)
        conflicted = _merge_target(self.tree, self.root, target)
        if conflicted:
            feedback = (f"{target} moved while you worked. Artemis merged it into your branch, and these files now "
                        f"hold conflict markers: {', '.join(conflicted)}. Resolve each one keeping the intent of "
                        "both sides, and remove every marker. Do not commit; Artemis does.")
        else:
            feedback = (f"Your change passed alone but fails once merged with the current {target}. Artemis merged "
                        f"{target} into your branch. Fix what breaks. The ship lane said: {landing.detail}")
        return False, f"{note.splitlines()[0]}; {target} merged in for the worker", feedback

    def _folder(self, claim: str) -> tuple[bool, str, str]:
        """Judge the folder as it is now. Returns (verified, note, feedback for another attempt)."""
        task = self.task["id"]
        items = capture(self.root, self.criteria, self.config.pass_env, before=self.start, extra=self.extra)
        self.ledger.submit(Role.WORKER, task, evidence_digest(items), claim, items)
        verdict = self.ledger.judge(Role.JUDGE, task, RuleJudge())
        if verdict.kind != "pass":
            gaps = "; ".join(verdict.gaps)
            return False, f"judge: {gaps}", f"The judge found these gaps in the folder: {gaps}. Close them."
        rejected = self._review(evidence_digest(items))
        if rejected:
            return False, f"review: {rejected}", f"A reviewer rejected the result: {rejected}. Fix it."
        return True, "verified: every check holds in the folder", ""

    def _inputs(self) -> dict[str, dict]:
        """What the host checks compare with later (judge.snapshot), as the folder was when the task first ran:
        taken once and kept in the ledger, so a retry or a restarted home compares with the same start."""
        for event in self.ledger.events(task=self.task["id"]):
            if event["kind"] == "inputs" and event["data"]:
                return json.loads(event["data"])["files"]
        taken = snapshot(self.root, self.criteria, self.extra)
        found = [entry for files in taken.values() for entry in files.values()]
        if found:
            self.ledger.record(Role.HOME, "inputs", f"{len(found)} input file(s), {sum(size for size, _ in found)} "
                               "bytes, at the start", task=self.task["id"], data={"files": taken})
        return taken

    def _review(self, sha: str) -> str:
        """The gaps a second agent found, when the task asked for a review; empty when it passed or was not asked."""
        if not self.task["review"]:
            return ""
        if self.home.parts.review is None:
            self.home.log_once("a task asked for review, but this build has no reviewer; the judge's pass stands")
            return ""
        verdict, gaps = self.home.parts.review(self.home, self.task["id"], sha, self.provider)
        return "" if verdict == "pass" else "; ".join(gaps) or "no reason given"

    # One worker process

    def _work(self, feedback: str, token: Path) -> tuple[str, str]:
        """Run the worker to its end. Returns (result, claim): done, failed, timeout, stopped or closing."""
        launch = self._launch(self._prompt(feedback), token)
        self.log.parent.mkdir(parents=True, exist_ok=True)
        lock = threading.Lock()
        with (self.log.open("a", encoding="utf-8") as log, TemporaryFile() as stdin):
            def write(text: str) -> None:
                with lock:
                    log.write(text)
                    log.flush()

            write(f"\n--- {self.provider} worker: {process.join_command(launch.argv[:3])} ... (run {self.run_id})\n")
            stdin.write(launch.stdin.encode("utf-8"))
            stdin.seek(0)
            try:
                child = subprocess.Popen(
                    launch.argv, cwd=self.tree, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    env=process.agent_env(self.provider) | launch.env, **process.group())
            except OSError as error:
                write(f"{launch.argv[0]} could not start: {error.strerror}\n")
                return "failed", f"{launch.argv[0]} could not start: {error.strerror}"
            self.ledger.record(Role.HOME, "worker.process", f"process {child.pid}", task=self.task["id"],
                               data={"run": self.run_id, "pid": child.pid, "start": process.started(child.pid)})
            said: list[str] = []
            errors: list[str] = []
            pumps = [threading.Thread(target=self._pump, args=(child.stdout, said, write), daemon=True),
                     threading.Thread(target=self._pump, args=(child.stderr, errors, write), daemon=True)]
            for pump in pumps:
                pump.start()
            result = self._watch(child)
            for pump in pumps:
                pump.join(10)
            try:
                claim = launch.decode("".join(said)).strip()
            except WorkflowError as error:
                claim, result = str(error), ("failed" if result == "done" else result)
            if result == "done" and child.returncode:
                result = "failed"
            if result == "done" and not claim:
                result, claim = "failed", "The worker finished without a final message."
            if result == "failed" and not claim:
                claim = " ".join("".join(errors).split()[-60:])  # a failing CLI often says why only on stderr
            claim = self.home.scrub(claim)
            write(f"--- claim ({result}): {claim}\n")
        return result, claim[-1500:]

    def _pump(self, stream, kept: list[str], write) -> None:
        """Copy one output stream into the log as it arrives, with secret values replaced by their names."""
        scrub = self.home.scrub_stream()
        for line in iter(stream.readline, b""):
            text = line.decode("utf-8", errors="replace")
            kept.append(text)
            write(scrub.feed(text))
        write(scrub.flush())
        stream.close()

    def _watch(self, child: subprocess.Popen) -> str:
        """Wait for the worker. A stop, the home closing, or the deadline ends its whole process tree."""
        deadline = time.monotonic() + self.home.config.agents.worker_minutes * 60
        while child.poll() is None:
            if self.ledger.stopped():
                result = "stopped"
            elif self.home.closing.is_set():
                result = "closing"
            elif time.monotonic() > deadline:
                result = "timeout"
            else:
                self.home.closing.wait(POLL_S)
                continue
            process.kill_tree(child)
            return result
        return "done"

    def _launch(self, prompt: str, token: Path) -> Launch:
        checks = tuple(c.command for c in self.criteria if c.command)
        if self.home.parts.launch is not None:
            made = self.home.parts.launch(
                self.provider, role="worker", mode="repo" if self.repo else "host", cwd=self.tree, prompt=prompt,
                mcp=self.home.mcp_command(token), config=self.home.config, vault=self.home.vault,
                scratch=self.home.paths.runs / f"run-{self.run_id}", session=None)
            return Launch(list(made.argv), dict(made.env), made.stdin or "", made.decode)
        agent = AGENTS.get(self.provider)
        if agent is None:
            raise WorkflowError(f"This build cannot start a {self.provider} worker.")
        argv, env, decode = agent.worker_launch(self.config, self.tree, checks)
        if self.provider == "api" and self.config.api:
            env = env | self._api_key(self.config.api.key_env)
        reader = (lambda text: decode(text.splitlines())) if decode else str.strip
        return Launch(list(argv), dict(env), prompt, reader)

    def _api_key(self, name: str) -> dict[str, str]:
        """The API worker's key, by the name artemis.toml gives: from the vault, else from this environment."""
        if self.home.vault is not None and self.home.vault.info(name) is not None:
            return self.home.vault.env([name])
        return {name: os.environ[name]} if os.environ.get(name) else {}

    # What the worker reads

    def _prompt(self, feedback: str) -> str:
        if self.repo:
            intro = files("artemis.templates").joinpath("worker.md").read_text(encoding="utf-8")
        else:
            intro = FOLDER_WORKER + f"\nThe folder: {self.root}\n"
        where = "is in your commit" if self.repo else "exists in the folder"
        checks = "\n".join(f"- {c.label}: " + (f"`{process.join_command(c.command)}` exits 0" if c.command
                                                else f"{c.artifact} {where}") for c in self.criteria)
        task = self.task
        text = (f"{intro.strip()}\n\nTask #{task['id']}: {task['title']}\n\n"
                f"{task['brief'].strip() or task['title']}\n\nChecks:\n{checks}\n")
        lessons = self._lessons()
        if lessons:
            text += "\nLearned on earlier tasks here:\n" + "\n".join(f"- {line}" for line in lessons) + "\n"
        if feedback:
            text += f"\nThis is another attempt. {feedback}\n"
        return text

    def _lessons(self) -> list[str]:
        if self.home.parts.prompt_lines is None:
            return []
        try:
            return list(self.home.parts.prompt_lines(self.ledger, self.project["id"]))
        except Exception as error:
            self.home.log_once(f"lessons could not be read: {type(error).__name__}: {error}")
            return []

    def _follow_up(self) -> str:
        """What the previous run of this task left: its cards' outcomes, retry requests since, and its note."""
        previous = self.previous
        if previous is None or previous["run_id"] is None:
            return ""
        lines = [_card_outcome(card) for card in self.ledger.cards()
                 if card["run_id"] == previous["run_id"] and card["state"] not in OPEN_CARD]
        ended = previous["ended"] or 0
        for event in self.ledger.events(task=self.task["id"]):
            if event["kind"] == "retrying" and event["role"] != Role.WORKER and event["at"] >= ended:
                lines.append(f"Asked to try again: {event['detail']}")
        if previous["note"] and not WAITING.fullmatch(previous["note"]):
            lines.insert(0, f"The previous run ended: {previous['note']}")
        return " ".join(lines)
