"""SQLite records and transactional workflow transitions."""

from contextlib import closing, contextmanager
from dataclasses import asdict, dataclass
import json
from pathlib import Path
import re
import sqlite3
from typing import Callable

from .judge import ArtifactEvidence, Case, CommandEvidence, Criterion, Evidence, Judge, Verdict
from .roles import OwnerAction, Role, WorkflowError, require


SCHEMA = """
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL UNIQUE REFERENCES requests,
    outcome TEXT NOT NULL, approach TEXT
);
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY, goal_id INTEGER NOT NULL UNIQUE REFERENCES goals,
    title TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects,
    title TEXT NOT NULL, criteria TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks,
    sha TEXT NOT NULL, claim TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
    submission_id INTEGER NOT NULL REFERENCES submissions,
    criterion INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (submission_id, criterion)
);
CREATE TABLE IF NOT EXISTS verdicts (
    id INTEGER PRIMARY KEY, submission_id INTEGER NOT NULL REFERENCES submissions,
    kind TEXT NOT NULL, gaps TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks,
    kind TEXT NOT NULL, description TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('waiting', 'granted', 'done'))
);
CREATE TABLE IF NOT EXISTS receipts (
    submission_id INTEGER PRIMARY KEY REFERENCES submissions,
    state TEXT NOT NULL CHECK(state IN ('checked', 'red', 'stale', 'applied')),
    checks TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, role TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL,
    request_id INTEGER REFERENCES requests, goal_id INTEGER REFERENCES goals,
    project_id INTEGER REFERENCES projects, task_id INTEGER REFERENCES tasks
);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'Events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'Events are append-only'); END;
CREATE VIEW IF NOT EXISTS work AS
SELECT t.id, t.title, t.project_id,
    CASE
        WHEN r.state = 'applied' THEN 'shipped'
        WHEN r.state = 'red' THEN 'checks failed'
        WHEN r.state = 'stale' THEN 'needs new commit'
        WHEN v.kind = 'pass' THEN 'verified'
        WHEN v.kind = 'reject' THEN 'needs evidence'
        WHEN v.kind = 'stop' THEN 'stopped'
        WHEN s.id IS NOT NULL THEN 'reported'
        ELSE 'assigned'
    END AS state,
    s.id AS submission_id, s.sha, v.kind AS verdict
FROM tasks t
LEFT JOIN submissions s ON s.id = (
    SELECT MAX(id) FROM submissions WHERE task_id = t.id
)
LEFT JOIN verdicts v ON v.id = (
    SELECT MAX(id) FROM verdicts WHERE submission_id = s.id
)
LEFT JOIN receipts r ON r.submission_id = s.id;
"""


@dataclass(frozen=True)
class Check:
    argv: tuple[str, ...]
    exit_code: int
    output_sha256: str


@dataclass(frozen=True)
class Receipt:
    commit: str
    state: str
    checks: tuple[Check, ...]


def _one(db: sqlite3.Connection, sql: str, *args: object) -> sqlite3.Row:
    row = db.execute(sql, args).fetchone()
    if row is None:
        raise WorkflowError("The requested record does not exist.")
    return row


def _event(db: sqlite3.Connection, actor: Role, kind: str, detail: str, *,
           request: int | None = None, goal: int | None = None,
           project: int | None = None, task: int | None = None) -> None:
    db.execute(
        "INSERT INTO events(role, kind, detail, request_id, goal_id, project_id, task_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)", (actor, kind, detail, request, goal, project, task),
    )


def _active(db: sqlite3.Connection) -> None:
    last = db.execute(
        "SELECT kind FROM events WHERE role = 'owner' AND kind IN ('halt', 'resume') "
        "ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if last and last["kind"] == "halt":
        raise WorkflowError("Work is stopped until the owner resumes it.")


def _require_task_release(db: sqlite3.Connection, task: int) -> None:
    latest = db.execute(
        "SELECT kind FROM events WHERE (kind = 'stop' AND task_id = ?) "
        "OR (kind = 'resume' AND role = 'owner') ORDER BY id DESC LIMIT 1",
        (task,),
    ).fetchone()
    if latest and latest["kind"] == "stop":
        raise WorkflowError("This task is stopped until the owner resumes it.")


def _candidate(db: sqlite3.Connection, task: int, sha: str) -> int:
    row = _one(db, "SELECT * FROM work WHERE id = ?", task)
    if row["verdict"] != "pass" or row["sha"] != sha:
        raise WorkflowError("Shipping requires a pass for this exact commit.")
    return row["submission_id"]


def _receipt(db: sqlite3.Connection, submission: int, sha: str) -> Receipt | None:
    row = db.execute("SELECT * FROM receipts WHERE submission_id = ?", (submission,)).fetchone()
    if row is None:
        return None
    checks = tuple(
        Check(tuple(item["argv"]), item["exit_code"], item["output_sha256"])
        for item in json.loads(row["checks"])
    )
    return Receipt(sha, row["state"], checks)


class Ledger:
    """The only workflow store. Each transition appends an event in the same write."""

    def __init__(self, path: Path):
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, isolation_level=None, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as db:
            db.executescript("BEGIN IMMEDIATE;\n" + SCHEMA + "\nCOMMIT;")

    @contextmanager
    def _write(self, actor: Role, expected: Role, *, intervention: bool = False):
        require(actor, expected)
        with closing(self._connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if not intervention:
                _active(db)
            yield db

    def allow_step(self) -> None:
        with closing(self._connect()) as db:
            _active(db)

    def request(self, actor: Role, text: str) -> int:
        with self._write(actor, Role.OWNER) as db:
            key = db.execute("INSERT INTO requests(text) VALUES (?)", (text,)).lastrowid
            _event(db, actor, "request", text, request=key)
            return key

    def set_goal(self, actor: Role, request: int, outcome: str) -> int:
        with self._write(actor, Role.LEAD) as db:
            key = db.execute("INSERT INTO goals(request_id, outcome) VALUES (?, ?)",
                             (request, outcome)).lastrowid
            _event(db, actor, "goal", outcome, goal=key)
            return key

    def plan(self, actor: Role, goal: int, approach: str) -> None:
        with self._write(actor, Role.CTO) as db:
            row = _one(db, "SELECT approach FROM goals WHERE id = ?", goal)
            if row["approach"] is not None:
                raise WorkflowError("This goal already has a plan.")
            db.execute("UPDATE goals SET approach = ? WHERE id = ?", (approach, goal))
            _event(db, actor, "plan", approach, goal=goal)

    def open_project(self, actor: Role, goal: int, title: str) -> int:
        with self._write(actor, Role.PM) as db:
            if _one(db, "SELECT approach FROM goals WHERE id = ?", goal)["approach"] is None:
                raise WorkflowError("The project needs a CTO plan.")
            key = db.execute("INSERT INTO projects(goal_id, title) VALUES (?, ?)",
                             (goal, title)).lastrowid
            _event(db, actor, "project", title, project=key)
            return key

    def assign(self, actor: Role, project: int, title: str, criteria: tuple[Criterion, ...]) -> int:
        with self._write(actor, Role.PM) as db:
            key = db.execute("INSERT INTO tasks(project_id, title, criteria) VALUES (?, ?, ?)",
                             (project, title, json.dumps([asdict(c) for c in criteria]))).lastrowid
            labels = ", ".join(criterion.label for criterion in criteria)
            _event(db, actor, "assigned", f"{title} [{labels}]", task=key)
            return key

    def submit(self, actor: Role, task: int, sha: str, claim: str,
               items: dict[int, Evidence]) -> None:
        """Record a complete evidence snapshot, keyed by one-based criterion number."""
        if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", sha):
            raise ValueError("Submit the full Git commit hash.")
        with self._write(actor, Role.WORKER) as db:
            _require_task_release(db, task)
            row = _one(db, "SELECT * FROM work WHERE id = ?", task)
            if row["state"] == "shipped":
                raise WorkflowError("This task has already shipped.")
            if row["state"] == "verified" and (
                row["sha"] == sha or _receipt(db, row["submission_id"], row["sha"]) is not None
            ):
                raise WorkflowError("Finish shipping the passing submission.")
            criteria = json.loads(_one(db, "SELECT criteria FROM tasks WHERE id = ?", task)["criteria"])
            if not items.keys() <= set(range(1, len(criteria) + 1)):
                raise ValueError("Evidence must refer to an assigned criterion.")
            submission = db.execute(
                "INSERT INTO submissions(task_id, sha, claim) VALUES (?, ?, ?)", (task, sha, claim)
            ).lastrowid
            db.executemany(
                "INSERT INTO evidence VALUES (?, ?, ?, ?)",
                [(submission, number, "command" if isinstance(item, CommandEvidence) else "artifact",
                  json.dumps(asdict(item))) for number, item in items.items()],
            )
            _event(db, actor, "reported", f"{claim} ({len(items)}/{len(criteria)} evidence)", task=task)

    def judge(self, actor: Role, task: int, judge: Judge) -> Verdict:
        with self._write(actor, Role.CQO) as db:
            _require_task_release(db, task)
            row = _one(db, "SELECT * FROM work WHERE id = ?", task)
            if row["state"] not in {"reported", "stopped"}:
                raise WorkflowError("There is no unjudged submission.")
            submission = _one(db, "SELECT * FROM submissions WHERE id = ?", row["submission_id"])
            raw = _one(db, "SELECT criteria FROM tasks WHERE id = ?", task)["criteria"]
            criteria = tuple(
                Criterion(item["label"], tuple(item["command"]), item["output"], item["artifact"])
                for item in json.loads(raw)
            )
            items = {}
            for saved in db.execute("SELECT * FROM evidence WHERE submission_id = ?", (submission["id"],)):
                data = json.loads(saved["data"])
                items[saved["criterion"]] = (
                    CommandEvidence(tuple(data["argv"]), data["exit_code"], data["output"])
                    if saved["kind"] == "command" else ArtifactEvidence(**data)
                )
            case = Case(submission["sha"], submission["claim"], criteria,
                        tuple(items.get(number) for number in range(1, len(criteria) + 1)))
            verdict = judge.assess(case)
            db.execute("INSERT INTO verdicts(submission_id, kind, gaps) VALUES (?, ?, ?)",
                       (submission["id"], verdict.kind, json.dumps(verdict.gaps)))
            detail = "; ".join(verdict.gaps) or "All done criteria supported"
            _event(db, actor, verdict.kind, detail, task=task)
            return verdict

    def stop(self, actor: Role, reason: str) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            _event(db, actor, "halt", reason)

    def resume(self, actor: Role, reason: str) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            _event(db, actor, "resume", reason)

    def request_action(self, actor: Role, task: int, kind: OwnerAction, description: str) -> int:
        if not isinstance(kind, OwnerAction):
            raise ValueError("Unknown owner action.")
        with self._write(actor, Role.PM) as db:
            key = db.execute(
                "INSERT INTO approvals(task_id, kind, description, state) VALUES (?, ?, ?, 'waiting')",
                (task, kind, description),
            ).lastrowid
            _event(db, actor, "waiting", f"{description} ({kind})", task=task)
            return key

    def approve(self, actor: Role, approval: int) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            row = _one(db, "SELECT * FROM approvals WHERE id = ?", approval)
            if row["state"] != "waiting":
                raise WorkflowError("This action is no longer waiting for approval.")
            db.execute("UPDATE approvals SET state = 'granted' WHERE id = ?", (approval,))
            _event(db, actor, "approved", row["description"], task=row["task_id"])

    def simulate_action(self, actor: Role, approval: int) -> None:
        """Consume approval for one simulated action."""
        with self._write(actor, Role.WORKER) as db:
            row = _one(db, "SELECT * FROM approvals WHERE id = ?", approval)
            if row["state"] != "granted":
                raise WorkflowError("This action requires an unused owner approval.")
            db.execute("UPDATE approvals SET state = 'done' WHERE id = ?", (approval,))
            _event(db, actor, "simulated", row["description"], task=row["task_id"])

    def _ship_receipt(self, task: int, sha: str) -> Receipt | None:
        with closing(self._connect()) as db, db:
            db.execute("BEGIN")
            _active(db)
            return _receipt(db, _candidate(db, task, sha), sha)

    def _record_checks(self, task: int, sha: str, checks: tuple[Check, ...], *,
                       config_error: str | None = None) -> Receipt:
        if not checks and config_error is None:
            raise ValueError("Shipping requires at least one check.")
        with self._write(Role.SHIP, Role.SHIP) as db:
            submission = _candidate(db, task, sha)
            previous = _receipt(db, submission, sha)
            if previous is not None:
                return previous
            state = "red" if config_error is not None or any(c.exit_code for c in checks) else "checked"
            db.execute("INSERT INTO receipts VALUES (?, ?, ?)",
                       (submission, state, json.dumps([asdict(c) for c in checks])))
            detail = config_error or ", ".join(f"{' '.join(c.argv)} exit {c.exit_code}" for c in checks)
            _event(db, Role.SHIP, state, detail, task=task)
            return Receipt(sha, state, checks)

    def _land(self, task: int, sha: str, apply: Callable[[], bool]) -> Receipt:
        """Serialize the final Git update, with a durable check receipt for recovery."""
        with self._write(Role.SHIP, Role.SHIP) as db:
            submission = _candidate(db, task, sha)
            receipt = _receipt(db, submission, sha)
            if receipt is None or receipt.state == "red":
                raise WorkflowError("Shipping requires green checks.")
            if receipt.state != "checked":
                return receipt
            applied = apply()
            state = "applied" if applied else "stale"
            detail = (f"main contains {sha[:12]}, receipt saved" if applied
                      else "Candidate diverged from main. Submit a new commit.")
            db.execute("UPDATE receipts SET state = ? WHERE submission_id = ?", (state, submission))
            _event(db, Role.SHIP, state, detail, task=task)
            return Receipt(sha, state, receipt.checks)

    def timeline(self, task: int | None = None) -> list[sqlite3.Row]:
        with closing(self._connect()) as db:
            if task is None:
                return db.execute("SELECT * FROM events ORDER BY id").fetchall()
            scope = _one(
                db, "SELECT p.id, g.id AS goal, g.request_id FROM tasks t "
                "JOIN projects p ON p.id = t.project_id JOIN goals g ON g.id = p.goal_id "
                "WHERE t.id = ?", task,
            )
            return db.execute(
                "SELECT * FROM events WHERE task_id = ? OR project_id = ? OR goal_id = ? "
                "OR request_id = ? OR (role = 'owner' AND kind IN ('halt', 'resume')) ORDER BY id",
                (task, scope["id"], scope["goal"], scope["request_id"]),
            ).fetchall()

    def open_work(self) -> list[sqlite3.Row]:
        with closing(self._connect()) as db:
            return db.execute("SELECT id, title, state FROM work WHERE state <> 'shipped' ORDER BY id").fetchall()
