"""SQLite records and transactional workflow transitions."""

from contextlib import closing, contextmanager
from dataclasses import asdict, dataclass
import json
from pathlib import Path
import re
import sqlite3
import time

from .judge import ArtifactEvidence, Case, CommandEvidence, Criterion, Evidence, Judge, Verdict
from .roles import Interrupt, Role, WorkflowError, require


VERSION = 2
SCHEMA = """
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests,
    title TEXT NOT NULL, brief TEXT NOT NULL, criteria TEXT NOT NULL,
    dropped INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks,
    agent TEXT NOT NULL, branch TEXT NOT NULL, pid INTEGER,
    started REAL NOT NULL, ended REAL,
    outcome TEXT CHECK(outcome IN ('done', 'stuck', 'stopped')), note TEXT
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
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests,
    kind TEXT NOT NULL, what TEXT NOT NULL, why TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('waiting', 'approved', 'declined', 'done')),
    note TEXT
);
CREATE TABLE IF NOT EXISTS receipts (
    submission_id INTEGER PRIMARY KEY REFERENCES submissions,
    state TEXT NOT NULL CHECK(state IN ('checked', 'red', 'stale', 'applied')),
    target TEXT NOT NULL, candidate TEXT NOT NULL, checks TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, at REAL NOT NULL, role TEXT NOT NULL, kind TEXT NOT NULL,
    detail TEXT NOT NULL, request_id INTEGER REFERENCES requests,
    task_id INTEGER REFERENCES tasks, decision_id INTEGER REFERENCES decisions
);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'Events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'Events are append-only'); END;
CREATE VIEW IF NOT EXISTS work AS
SELECT t.id, t.title, t.request_id,
    CASE
        WHEN t.dropped THEN 'dropped'
        WHEN r.state = 'applied' THEN 'shipped'
        WHEN run.id IS NOT NULL AND run.ended IS NULL THEN 'running'
        WHEN run.outcome IN ('stuck', 'stopped') THEN 'stuck'
        WHEN r.state IN ('red', 'stale') THEN 'stuck'
        WHEN v.kind = 'pass' THEN 'verified'
        WHEN v.kind IS NOT NULL THEN 'stuck'
        WHEN s.id IS NOT NULL THEN 'reported'
        WHEN run.id IS NULL THEN 'queued'
        ELSE 'stuck'
    END AS state,
    s.id AS submission_id, s.sha, v.kind AS verdict, r.candidate AS landed, r.target,
    run.id AS run_id, run.agent, run.branch, run.pid, run.started, run.ended, run.note
FROM tasks t
LEFT JOIN runs run ON run.id = (SELECT MAX(id) FROM runs WHERE task_id = t.id)
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
    candidate: str
    checks: tuple[Check, ...]


def _one(db: sqlite3.Connection, sql: str, *args: object) -> sqlite3.Row:
    row = db.execute(sql, args).fetchone()
    if row is None:
        raise WorkflowError("The requested record does not exist.")
    return row


def _event(db: sqlite3.Connection, actor: Role, kind: str, detail: str, *,
           request: int | None = None, task: int | None = None, decision: int | None = None) -> int:
    return db.execute(
        "INSERT INTO events(at, role, kind, detail, request_id, task_id, decision_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)", (time.time(), actor, kind, detail, request, task, decision),
    ).lastrowid


def _active(db: sqlite3.Connection) -> None:
    last = db.execute(
        "SELECT kind FROM events WHERE role = ? AND kind IN ('halt', 'resume') ORDER BY id DESC LIMIT 1",
        (Role.OWNER,),
    ).fetchone()
    if last and last["kind"] == "halt":
        raise WorkflowError("Work is stopped until you resume it.")


def _criteria(raw: str) -> tuple[Criterion, ...]:
    return tuple(Criterion(item["label"], tuple(item["command"]), item["output"], item["artifact"])
                 for item in json.loads(raw))


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
    return Receipt(sha, row["state"], row["candidate"], checks)


class Ledger:
    """The only workflow store. Each transition appends an event in the same write."""

    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def _connect(self):
        with closing(sqlite3.connect(self.path, isolation_level=None, timeout=30)) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys = ON")
            yield db

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            tables = db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'").fetchone()[0]
            if version not in (0, VERSION) or (version == 0 and tables):
                raise WorkflowError("This ledger was made by another Artemis version. Move .artemis aside "
                                    "and run artemis init again.")
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript(f"BEGIN IMMEDIATE;\n{SCHEMA}\nPRAGMA user_version = {VERSION};\nCOMMIT;")

    @contextmanager
    def _write(self, actor: Role, expected: Role, *, intervention: bool = False):
        require(actor, expected)
        with self._connect() as db, db:
            db.execute("BEGIN IMMEDIATE")
            if not intervention:
                _active(db)
            yield db

    @contextmanager
    def _read(self):
        with self._connect() as db, db:
            db.execute("BEGIN")
            yield db

    def allow_step(self) -> None:
        with self._read() as db:
            _active(db)

    # The person and the lead

    def request(self, actor: Role, text: str) -> int:
        if not text.strip():
            raise WorkflowError("A request needs the words that were said.")
        with self._write(actor, Role.OWNER) as db:
            key = db.execute("INSERT INTO requests(text) VALUES (?)", (text,)).lastrowid
            _event(db, actor, "request", text, request=key)
            return key

    def add_task(self, actor: Role, request: int, title: str, brief: str,
                 criteria: tuple[Criterion, ...]) -> int:
        if not criteria:
            raise WorkflowError("A task needs at least one check the judge can run or read.")
        with self._write(actor, Role.LEAD) as db:
            _one(db, "SELECT id FROM requests WHERE id = ?", request)
            key = db.execute(
                "INSERT INTO tasks(request_id, title, brief, criteria) VALUES (?, ?, ?, ?)",
                (request, title, brief, json.dumps([asdict(c) for c in criteria])),
            ).lastrowid
            labels = ", ".join(criterion.label for criterion in criteria)
            _event(db, actor, "task", f"{title} [{labels}]", request=request, task=key)
            return key

    def drop(self, actor: Role, task: int, reason: str) -> None:
        with self._write(actor, Role.LEAD) as db:
            row = _one(db, "SELECT * FROM work WHERE id = ?", task)
            if row["state"] in {"shipped", "running", "dropped"}:
                raise WorkflowError(f"A {row['state']} task cannot be dropped.")
            db.execute("UPDATE tasks SET dropped = 1 WHERE id = ?", (task,))
            _event(db, actor, "dropped", reason, request=row["request_id"], task=task)

    def revise(self, actor: Role, task: int, brief: str) -> None:
        with self._write(actor, Role.LEAD) as db:
            row = _one(db, "SELECT request_id FROM tasks WHERE id = ?", task)
            db.execute("UPDATE tasks SET brief = ? WHERE id = ?", (brief, task))
            _event(db, actor, "revised", brief[:200], request=row["request_id"], task=task)

    def note(self, actor: Role, text: str, request: int | None = None) -> None:
        with self._write(actor, Role.LEAD) as db:
            _event(db, actor, "note", text, request=request)

    def ask(self, actor: Role, request: int, kind: Interrupt, what: str, why: str) -> int:
        if not isinstance(kind, Interrupt):
            raise ValueError("Unknown interrupt kind.")
        with self._write(actor, Role.LEAD) as db:
            _one(db, "SELECT id FROM requests WHERE id = ?", request)
            key = db.execute(
                "INSERT INTO decisions(request_id, kind, what, why, state) VALUES (?, ?, ?, ?, 'waiting')",
                (request, kind, what, why),
            ).lastrowid
            _event(db, actor, "asked", f"{what} ({kind})", request=request, decision=key)
            return key

    def decide(self, actor: Role, decision: int, approve: bool) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            row = _one(db, "SELECT * FROM decisions WHERE id = ?", decision)
            if row["state"] != "waiting":
                raise WorkflowError("This decision is no longer waiting for you.")
            state = "approved" if approve else "declined"
            db.execute("UPDATE decisions SET state = ? WHERE id = ?", (state, decision))
            _event(db, actor, state, row["what"], request=row["request_id"], decision=decision)

    def carried_out(self, actor: Role, decision: int, note: str) -> None:
        with self._write(actor, Role.LEAD) as db:
            row = _one(db, "SELECT * FROM decisions WHERE id = ?", decision)
            if row["state"] != "approved":
                raise WorkflowError("Only an approved decision can be carried out.")
            db.execute("UPDATE decisions SET state = 'done', note = ? WHERE id = ?", (note, decision))
            _event(db, actor, "carried out", note, request=row["request_id"], decision=decision)

    def stop(self, actor: Role, reason: str) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            _event(db, actor, "halt", reason)

    def resume(self, actor: Role, reason: str) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            _event(db, actor, "resume", reason)

    def mark_read(self, actor: Role) -> int:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            return _event(db, actor, "read", "caught up")

    # Workers

    def claim_run(self, actor: Role, task: int, agent: str) -> int:
        """Start a run for a task that has none in progress; the check and insert are one write."""
        with self._write(actor, Role.LEAD) as db:
            row = _one(db, "SELECT * FROM work WHERE id = ?", task)
            if row["state"] in {"running", "shipped", "dropped", "verified"}:
                raise WorkflowError(f"Task {task} is {row['state']}.")
            branch = f"artemis/task-{task}"
            key = db.execute("INSERT INTO runs(task_id, agent, branch, started) VALUES (?, ?, ?, ?)",
                             (task, agent, branch, time.time())).lastrowid
            _event(db, actor, "started", f"{agent} on {branch}", request=row["request_id"], task=task)
            return key

    def run_pid(self, run: int, pid: int) -> None:
        with self._connect() as db, db:
            db.execute("UPDATE runs SET pid = ? WHERE id = ?", (pid, run))

    def end_run(self, actor: Role, run: int, outcome: str, note: str) -> None:
        with self._write(actor, Role.WORKER, intervention=True) as db:
            row = _one(db, "SELECT * FROM runs WHERE id = ?", run)
            if row["ended"] is not None:
                return
            db.execute("UPDATE runs SET ended = ?, outcome = ?, note = ? WHERE id = ?",
                       (time.time(), outcome, note, run))
            task = _one(db, "SELECT request_id FROM tasks WHERE id = ?", row["task_id"])
            kind = {"done": "finished", "stuck": "stuck", "stopped": "stopped"}[outcome]
            _event(db, actor, kind, note, request=task["request_id"], task=row["task_id"])

    def retrying(self, actor: Role, task: int, reason: str) -> None:
        with self._write(actor, Role.WORKER) as db:
            row = _one(db, "SELECT request_id FROM tasks WHERE id = ?", task)
            _event(db, actor, "retrying", reason, request=row["request_id"], task=task)

    def task_brief(self, task: int) -> sqlite3.Row:
        with self._read() as db:
            return _one(db, "SELECT * FROM tasks WHERE id = ?", task)

    def submit(self, actor: Role, task: int, sha: str, claim: str,
               items: dict[int, Evidence]) -> None:
        """Record a complete evidence snapshot, keyed by one-based criterion number."""
        if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", sha):
            raise ValueError("Submit the full Git commit hash.")
        with self._write(actor, Role.WORKER) as db:
            row = _one(db, "SELECT * FROM tasks WHERE id = ?", task)
            criteria = _criteria(row["criteria"])
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
            first = claim.strip().splitlines()[0] if claim.strip() else ""
            _event(db, actor, "reported", f"{first[:120]} ({len(items)}/{len(criteria)} evidence)",
                   request=row["request_id"], task=task)

    def judge(self, actor: Role, task: int, judge: Judge) -> Verdict:
        with self._write(actor, Role.JUDGE) as db:
            row = _one(db, "SELECT * FROM work WHERE id = ?", task)
            if row["submission_id"] is None or row["verdict"] is not None:
                raise WorkflowError("There is no unjudged submission.")
            submission = _one(db, "SELECT * FROM submissions WHERE id = ?", row["submission_id"])
            criteria = _criteria(_one(db, "SELECT criteria FROM tasks WHERE id = ?", task)["criteria"])
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
            _event(db, actor, verdict.kind, detail, request=row["request_id"], task=task)
            return verdict

    # The ship lane

    def ship_receipt(self, task: int, sha: str) -> Receipt | None:
        with self._read() as db:
            _active(db)
            return _receipt(db, _candidate(db, task, sha), sha)

    def record_checks(self, task: int, sha: str, candidate: str, checks: tuple[Check, ...], *,
                      target: str = "main", problem: str | None = None) -> Receipt:
        if not checks and problem is None:
            raise ValueError("Shipping requires at least one check.")
        with self._write(Role.SHIP, Role.SHIP) as db:
            submission = _candidate(db, task, sha)
            state = "red" if problem is not None or any(c.exit_code for c in checks) else "checked"
            db.execute("INSERT INTO receipts VALUES (?, ?, ?, ?, ?) ON CONFLICT(submission_id) DO UPDATE SET "
                       "state = excluded.state, candidate = excluded.candidate, checks = excluded.checks",
                       (submission, state, target, candidate, json.dumps([asdict(c) for c in checks])))
            detail = problem or ", ".join(f"{' '.join(c.argv)} exit {c.exit_code}" for c in checks)
            request = _one(db, "SELECT request_id FROM tasks WHERE id = ?", task)["request_id"]
            _event(db, Role.SHIP, state, detail, request=request, task=task)
            return Receipt(sha, state, candidate, checks)

    def land(self, task: int, sha: str, applied: bool) -> Receipt:
        with self._write(Role.SHIP, Role.SHIP) as db:
            submission = _candidate(db, task, sha)
            receipt = _receipt(db, submission, sha)
            if receipt is None or receipt.state != "checked":
                raise WorkflowError("Landing requires green checks on the candidate.")
            state = "applied" if applied else "stale"
            target = _one(db, "SELECT target FROM receipts WHERE submission_id = ?", submission)["target"]
            detail = (f"{target} is {receipt.candidate[:7]}, receipt saved" if applied
                      else f"{target} moved while the checks ran")
            db.execute("UPDATE receipts SET state = ? WHERE submission_id = ?", (state, submission))
            request = _one(db, "SELECT request_id FROM tasks WHERE id = ?", task)["request_id"]
            _event(db, Role.SHIP, state, detail, request=request, task=task)
            return Receipt(sha, state, receipt.candidate, receipt.checks)

    # Views

    def work(self, task: int | None = None) -> list[sqlite3.Row]:
        with self._read() as db:
            if task is None:
                return db.execute("SELECT * FROM work ORDER BY id").fetchall()
            return [_one(db, "SELECT * FROM work WHERE id = ?", task)]

    def decisions(self, state: str | None = None) -> list[sqlite3.Row]:
        with self._read() as db:
            if state is None:
                return db.execute("SELECT * FROM decisions ORDER BY id").fetchall()
            return db.execute("SELECT * FROM decisions WHERE state = ? ORDER BY id", (state,)).fetchall()

    def receipts(self) -> dict[int, sqlite3.Row]:
        with self._read() as db:
            rows = db.execute("SELECT s.task_id, r.* FROM receipts r JOIN submissions s "
                              "ON s.id = r.submission_id WHERE r.state = 'applied'").fetchall()
            return {row["task_id"]: row for row in rows}

    def events(self, after: int = 0, task: int | None = None) -> list[sqlite3.Row]:
        with self._read() as db:
            if task is None:
                return db.execute("SELECT * FROM events WHERE id > ? ORDER BY id", (after,)).fetchall()
            return db.execute(
                "SELECT * FROM events WHERE id > ? AND (task_id = ? OR (role = ? AND kind IN "
                "('halt', 'resume'))) ORDER BY id", (after, task, Role.OWNER),
            ).fetchall()

    def last_read(self) -> sqlite3.Row | None:
        with self._read() as db:
            return db.execute("SELECT * FROM events WHERE role = ? AND kind = 'read' ORDER BY id DESC LIMIT 1",
                              (Role.OWNER,)).fetchone()

    def stopped(self) -> bool:
        try:
            self.allow_step()
        except WorkflowError:
            return True
        return False
