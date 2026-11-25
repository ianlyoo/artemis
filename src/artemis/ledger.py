"""SQLite records and transactional workflow transitions."""

from contextlib import closing, contextmanager
from dataclasses import asdict, dataclass
import json
from pathlib import Path
import re
import sqlite3
import time

from .judge import EVIDENCE_KINDS, Case, Criterion, Evidence, Judge, Verdict
from .roles import Interrupt, Role, WorkflowError, require


VERSION = 3
SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK(kind IN ('repo', 'folder')), path TEXT NOT NULL UNIQUE,
    created REAL NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
    shell INTEGER NOT NULL DEFAULT 0, no_run INTEGER NOT NULL DEFAULT 0, allowed_roots TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, at REAL NOT NULL, role TEXT NOT NULL CHECK(role IN ('you', 'lead', 'artemis')),
    text TEXT NOT NULL, project_id INTEGER REFERENCES projects, card_id INTEGER, turn TEXT
);
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects, text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'cli' CHECK(source IN ('chat', 'cli', 'schedule', 'lesson')),
    message_id INTEGER REFERENCES messages
);
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects, title TEXT NOT NULL,
    brief TEXT NOT NULL, kind TEXT NOT NULL, criteria TEXT NOT NULL, spec TEXT NOT NULL,
    next_at REAL NOT NULL, last_at REAL, active INTEGER NOT NULL DEFAULT 1, created REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests,
    project_id INTEGER NOT NULL REFERENCES projects,
    title TEXT NOT NULL, brief TEXT NOT NULL, criteria TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'code' CHECK(kind IN ('code', 'host', 'review', 'research', 'docs')),
    provider TEXT, review INTEGER NOT NULL DEFAULT 0, schedule_id INTEGER REFERENCES schedules,
    dropped INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks,
    agent TEXT NOT NULL, branch TEXT, pid INTEGER,
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
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects, request_id INTEGER REFERENCES requests,
    task_id INTEGER REFERENCES tasks, run_id INTEGER REFERENCES runs,
    kind TEXT NOT NULL CHECK(kind IN ('money out', 'irreversible delete', 'send as you', 'choice', 'secret')),
    what TEXT NOT NULL, why TEXT NOT NULL,
    command TEXT, cwd TEXT, shell TEXT, secrets TEXT NOT NULL DEFAULT '[]', rule TEXT, options TEXT,
    state TEXT NOT NULL CHECK(state IN ('waiting', 'approved', 'declined', 'running', 'done', 'failed', 'unknown',
                                        'expired')),
    answer TEXT, result TEXT, created REAL NOT NULL, decided REAL, expires REAL
);
CREATE TABLE IF NOT EXISTS standing_approvals (
    id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards, kind TEXT NOT NULL,
    schedule_id INTEGER REFERENCES schedules, url TEXT, method TEXT, argv TEXT, cwd TEXT, secret TEXT,
    created REAL NOT NULL, revoked REAL
);
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, cookie_hash TEXT NOT NULL UNIQUE, code TEXT,
    state TEXT NOT NULL CHECK(state IN ('pending', 'allowed', 'revoked')), phone INTEGER NOT NULL DEFAULT 0,
    created REAL NOT NULL, last_seen REAL
);
CREATE TABLE IF NOT EXISTS adapter_status (
    provider TEXT NOT NULL, role TEXT NOT NULL, os TEXT NOT NULL, version TEXT NOT NULL, features TEXT NOT NULL,
    auth TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('live', 'contract', 'unqualified')),
    receipt TEXT NOT NULL, at REAL NOT NULL, PRIMARY KEY (provider, role, os)
);
CREATE TABLE IF NOT EXISTS receipts (
    submission_id INTEGER PRIMARY KEY REFERENCES submissions,
    state TEXT NOT NULL CHECK(state IN ('checked', 'red', 'stale', 'applied')),
    target TEXT NOT NULL, candidate TEXT NOT NULL, checks TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY, provider TEXT NOT NULL, ref TEXT NOT NULL, started REAL NOT NULL,
    turns INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0, ended REAL
);
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY, run_id INTEGER REFERENCES runs, task_id INTEGER REFERENCES tasks,
    card_id INTEGER REFERENCES cards, command TEXT NOT NULL, cwd TEXT NOT NULL, shell TEXT NOT NULL,
    started REAL NOT NULL, ended REAL, exit_code INTEGER, output TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects,
    kind TEXT NOT NULL CHECK(kind IN ('rule', 'check', 'guard', 'placement')),
    text TEXT NOT NULL CHECK(length(text) <= 200), payload TEXT NOT NULL DEFAULT '{}',
    state TEXT NOT NULL CHECK(state IN ('proposed', 'active', 'retired', 'unproven')),
    source TEXT NOT NULL DEFAULT '[]', created REAL NOT NULL,
    uses INTEGER NOT NULL DEFAULT 0, first_try INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS secret_uses (
    id INTEGER PRIMARY KEY, at REAL NOT NULL, name TEXT NOT NULL, tool TEXT NOT NULL,
    task_id INTEGER REFERENCES tasks, run_id INTEGER REFERENCES runs, card_id INTEGER REFERENCES cards
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, at REAL NOT NULL, role TEXT NOT NULL, kind TEXT NOT NULL,
    detail TEXT NOT NULL, project_id INTEGER REFERENCES projects, request_id INTEGER REFERENCES requests,
    task_id INTEGER REFERENCES tasks, card_id INTEGER REFERENCES cards, data TEXT
);
CREATE INDEX IF NOT EXISTS events_task ON events(task_id);
CREATE INDEX IF NOT EXISTS events_project ON events(project_id);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'Events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'Events are append-only'); END;
CREATE VIEW IF NOT EXISTS work AS
SELECT t.id, t.title, t.request_id, t.project_id, t.kind, t.provider, t.review, t.schedule_id,
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

CARD_KINDS = (*Interrupt, "choice", "secret")
SECRET_NAME = re.compile(r"[A-Z][A-Z0-9_]{0,63}")


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


def _event(db: sqlite3.Connection, actor: Role, kind: str, detail: str, *, project: int | None = None,
           request: int | None = None, task: int | None = None, card: int | None = None,
           data: dict | None = None) -> int:
    if task is not None and (project is None or request is None):
        row = db.execute("SELECT project_id, request_id FROM tasks WHERE id = ?", (task,)).fetchone()
        if row is not None:
            project = project if project is not None else row["project_id"]
            request = request if request is not None else row["request_id"]
    if request is not None and project is None:
        row = db.execute("SELECT project_id FROM requests WHERE id = ?", (request,)).fetchone()
        project = row["project_id"] if row is not None else None
    return db.execute(
        "INSERT INTO events(at, role, kind, detail, project_id, request_id, task_id, card_id, data) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (time.time(), actor, kind, detail, project, request, task, card,
         None if data is None else json.dumps(data)),
    ).lastrowid


def _active(db: sqlite3.Connection) -> None:
    last = db.execute(
        "SELECT kind FROM events WHERE role = ? AND kind IN ('halt', 'resume') ORDER BY id DESC LIMIT 1",
        (Role.OWNER,),
    ).fetchone()
    if last and last["kind"] == "halt":
        raise WorkflowError("Work is stopped until you resume it.")


def _fields(data: dict) -> dict:
    return {key: tuple(value) if isinstance(value, list) else value for key, value in data.items()}


def _criteria(raw: str) -> tuple[Criterion, ...]:
    return tuple(Criterion(**_fields(item)) for item in json.loads(raw))


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


def _project_id(db: sqlite3.Connection, project: int | str) -> int:
    column = "id" if isinstance(project, int) else "name"
    return _one(db, f"SELECT id FROM projects WHERE {column} = ?", project)["id"]


class Ledger:
    """The only workflow store. Each transition appends an event in the same write."""

    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def _connect(self):
        with closing(sqlite3.connect(self.path, isolation_level=None, timeout=30,
                                     check_same_thread=False)) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys = ON")
            yield db

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            tables = db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'").fetchone()[0]
            if version not in (0, VERSION) or (version == 0 and tables):
                raise WorkflowError("This ledger was made by another Artemis version. Move it aside "
                                    "and start again.")
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript(f"BEGIN IMMEDIATE;\n{SCHEMA}\nPRAGMA user_version = {VERSION};\nCOMMIT;")

    @contextmanager
    def _write(self, actor: Role, *expected: Role, intervention: bool = False):
        require(actor, *expected)
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

    # Projects

    def add_project(self, actor: Role, name: str, kind: str, path: Path | str) -> int:
        if kind not in ("repo", "folder"):
            raise ValueError("A project is a repo or a folder.")
        if not re.fullmatch(r"[\w.-]{1,64}", name):
            raise WorkflowError("A project name uses letters, digits, '.', '-' or '_' (at most 64).")
        with self._write(actor, Role.OWNER, Role.LEAD, intervention=True) as db:
            found = db.execute("SELECT id FROM projects WHERE path = ?", (str(path),)).fetchone()
            if found is not None:
                return found["id"]
            if db.execute("SELECT 1 FROM projects WHERE name = ?", (name,)).fetchone():
                raise WorkflowError(f"Another project is already called {name}.")
            key = db.execute("INSERT INTO projects(name, kind, path, created) VALUES (?, ?, ?, ?)",
                             (name, kind, str(path), time.time())).lastrowid
            _event(db, actor, "project.added", f"{name} ({kind}) at {path}", project=key)
            return key

    def set_project_flags(self, actor: Role, project: int, *, shell: bool, no_run: bool,
                          allowed_roots: tuple[str | Path, ...] = ()) -> None:
        """What a project's workers may do beyond the defaults: run shells with inline commands (shell), have no
        run or job tool at all (no_run), and reach these absolute folders (strings or paths) besides its own."""
        allowed_roots = tuple(str(root) for root in allowed_roots)
        if any(not Path(root).is_absolute() for root in allowed_roots):
            raise WorkflowError("An allowed root is an absolute folder path.")
        with self._write(actor, Role.OWNER, intervention=True) as db:
            row = _one(db, "SELECT * FROM projects WHERE id = ?", project)
            db.execute("UPDATE projects SET shell = ?, no_run = ?, allowed_roots = ? WHERE id = ?",
                       (int(shell), int(no_run), json.dumps(list(allowed_roots)), project))
            flags = [name for name, on in (("shell", shell), ("no run", no_run)) if on]
            roots = f", {len(allowed_roots)} extra folder(s)" if allowed_roots else ""
            _event(db, actor, "project.flags", f"{row['name']}: {', '.join(flags) or 'defaults'}{roots}",
                   project=project, data={"shell": shell, "no_run": no_run, "allowed_roots": list(allowed_roots)})

    def projects(self, include_archived: bool = False) -> list[sqlite3.Row]:
        with self._read() as db:
            sql = "SELECT * FROM projects" + ("" if include_archived else " WHERE archived = 0") + " ORDER BY id"
            return db.execute(sql).fetchall()

    def project(self, project: int | str) -> sqlite3.Row:
        with self._read() as db:
            return _one(db, "SELECT * FROM projects WHERE id = ?", _project_id(db, project))

    # The person and the lead

    def request(self, actor: Role, text: str, project: int | None = None, source: str = "cli",
                message: int | None = None) -> int:
        if not text.strip():
            raise WorkflowError("A request needs the words that were said.")
        with self._write(actor, Role.OWNER, Role.HOME) as db:
            key = db.execute("INSERT INTO requests(project_id, text, source, message_id) VALUES (?, ?, ?, ?)",
                             (project, text, source, message)).lastrowid
            _event(db, actor, "request", text, project=project, request=key)
            return key

    def request_row(self, request: int) -> sqlite3.Row:
        """One request as recorded: its words, project and source."""
        with self._read() as db:
            return _one(db, "SELECT * FROM requests WHERE id = ?", request)

    def add_task(self, actor: Role, request: int, title: str, brief: str, criteria: tuple[Criterion, ...], *,
                 project: int | None = None, kind: str = "code", provider: str | None = None,
                 review: bool = False, schedule: int | None = None) -> int:
        if not criteria:
            raise WorkflowError("A task needs at least one check the judge can run or read.")
        with self._write(actor, Role.LEAD, Role.HOME) as db:
            asked = _one(db, "SELECT project_id FROM requests WHERE id = ?", request)
            project = project if project is not None else asked["project_id"]
            if project is None:
                raise WorkflowError("A task needs a project.")
            _one(db, "SELECT id FROM projects WHERE id = ?", project)
            key = db.execute(
                "INSERT INTO tasks(request_id, project_id, title, brief, criteria, kind, provider, review, "
                "schedule_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (request, project, title, brief, json.dumps([asdict(c) for c in criteria]), kind, provider,
                 int(review), schedule),
            ).lastrowid
            labels = ", ".join(criterion.label for criterion in criteria)
            _event(db, actor, "task", f"{title} [{labels}]", project=project, request=request, task=key,
                   data={"kind": kind, "provider": provider, "review": review})
            return key

    def requests(self, project: int | None = None, message: int | None = None) -> list[sqlite3.Row]:
        sql, args = "SELECT * FROM requests WHERE 1", []
        if project is not None:
            sql, args = sql + " AND project_id = ?", [*args, project]
        if message is not None:
            sql, args = sql + " AND message_id = ?", [*args, message]
        with self._read() as db:
            return db.execute(sql + " ORDER BY id", args).fetchall()

    def drop(self, actor: Role, task: int, reason: str) -> None:
        with self._write(actor, Role.LEAD) as db:
            row = _one(db, "SELECT * FROM work WHERE id = ?", task)
            if row["state"] in {"shipped", "running", "dropped"}:
                raise WorkflowError(f"A {row['state']} task cannot be dropped.")
            db.execute("UPDATE tasks SET dropped = 1 WHERE id = ?", (task,))
            _event(db, actor, "dropped", reason, task=task)

    def revise(self, actor: Role, task: int, brief: str) -> None:
        with self._write(actor, Role.LEAD) as db:
            _one(db, "SELECT id FROM tasks WHERE id = ?", task)
            db.execute("UPDATE tasks SET brief = ? WHERE id = ?", (brief, task))
            _event(db, actor, "revised", brief[:200], task=task)

    def note(self, actor: Role, text: str, request: int | None = None, project: int | None = None,
             task: int | None = None) -> None:
        with self._write(actor, Role.LEAD, Role.WORKER, Role.HOME) as db:
            _event(db, actor, "note", text, project=project, request=request, task=task)

    def stop(self, actor: Role, reason: str) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            _event(db, actor, "halt", reason)

    def resume(self, actor: Role, reason: str) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            _event(db, actor, "resume", reason)

    def mark_read(self, actor: Role) -> int:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            return _event(db, actor, "read", "caught up")

    # Cards: the only way anything is put to the person

    def open_card(self, actor: Role, kind: str, what: str, why: str, *, project: int | None = None,
                  request: int | None = None, task: int | None = None, run: int | None = None,
                  command: str | None = None, cwd: str | None = None, shell: str | None = None,
                  secrets: tuple[str, ...] = (), rule: str | None = None, options: object = None,
                  expires: float | None = None) -> int:
        if kind not in CARD_KINDS:
            raise ValueError(f"A card is one of: {', '.join(CARD_KINDS)}.")
        if kind == "choice" and not (isinstance(options, list) and options):
            raise WorkflowError("A choice card needs its options.")
        if kind == "secret" and not (isinstance(options, dict) and SECRET_NAME.fullmatch(options.get("name", ""))):
            raise WorkflowError("A secret card needs the secret's NAME in capitals.")
        with self._write(actor, Role.LEAD, Role.HOME, Role.WORKER) as db:
            if task is not None:
                row = _one(db, "SELECT project_id, request_id FROM tasks WHERE id = ?", task)
                project = project if project is not None else row["project_id"]
                request = request if request is not None else row["request_id"]
            elif request is not None and project is None:
                project = _one(db, "SELECT project_id FROM requests WHERE id = ?", request)["project_id"]
            key = db.execute(
                "INSERT INTO cards(project_id, request_id, task_id, run_id, kind, what, why, command, cwd, shell, "
                "secrets, rule, options, state, created, expires) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)",
                (project, request, task, run, kind, what, why, command, cwd, shell, json.dumps(list(secrets)),
                 rule, None if options is None else json.dumps(options), time.time(), expires),
            ).lastrowid
            _event(db, actor, "card.opened", f"{what} ({kind})", project=project, request=request, task=task,
                   card=key, data={"kind": kind, "rule": rule})
            return key

    def _waiting(self, db: sqlite3.Connection, card: int, *kinds: str) -> sqlite3.Row:
        row = _one(db, "SELECT * FROM cards WHERE id = ?", card)
        if row["state"] != "waiting":
            raise WorkflowError("This card is no longer waiting for you.")
        if kinds and row["kind"] not in kinds:
            raise WorkflowError(f"Card {card} is a {row['kind']} card.")
        return row

    def decide_card(self, actor: Role, card: int, approve: bool, standing: dict | None = None) -> None:
        """Approve or decline a waiting interrupt card. `standing` binds a standing approval to this exact operation:
        {"schedule": id?, "url": str?, "method": str?, "argv": [..]?, "cwd": str?, "secret": NAME?}. Never for money."""
        if self.expire_cards():
            if self.card(card)["state"] == "expired":
                raise WorkflowError("This card expired before you answered it.")
        with self._write(actor, Role.OWNER, intervention=True) as db:
            row = self._waiting(db, card, *Interrupt)
            state = "approved" if approve else "declined"
            db.execute("UPDATE cards SET state = ?, decided = ? WHERE id = ?", (state, time.time(), card))
            if approve and standing is not None:
                if row["kind"] == Interrupt.SPEND:
                    raise WorkflowError("Money out is asked every time; it never gets a standing approval.")
                db.execute("INSERT INTO standing_approvals(card_id, kind, schedule_id, url, method, argv, cwd, secret, "
                           "created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           (card, row["kind"], standing.get("schedule"), standing.get("url"), standing.get("method"),
                            None if standing.get("argv") is None else json.dumps(standing["argv"]),
                            standing.get("cwd"), standing.get("secret"), time.time()))
            _event(db, actor, f"card.{state}", row["what"], project=row["project_id"], request=row["request_id"],
                   task=row["task_id"], card=card, data={"standing": standing})

    def choose(self, actor: Role, card: int, option: str) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            row = self._waiting(db, card, "choice")
            labels = {item["id"]: item["label"] for item in json.loads(row["options"])}
            if option not in labels:
                raise WorkflowError(f"Choose one of: {', '.join(labels)}.")
            db.execute("UPDATE cards SET state = 'done', answer = ?, decided = ? WHERE id = ?",
                       (option, time.time(), card))
            _event(db, actor, "card.answered", f"{row['what']}: {labels[option]}", project=row["project_id"],
                   request=row["request_id"], task=row["task_id"], card=card, data={"option": option})

    def secret_set(self, actor: Role, card: int) -> str:
        """Close a secret card once the vault holds the value. Returns the secret's name."""
        with self._write(actor, Role.OWNER, intervention=True) as db:
            row = self._waiting(db, card, "secret")
            name = json.loads(row["options"])["name"]
            db.execute("UPDATE cards SET state = 'done', answer = 'set', decided = ? WHERE id = ?",
                       (time.time(), card))
            _event(db, actor, "secret.set", name, project=row["project_id"], request=row["request_id"],
                   task=row["task_id"], card=card)
            return name

    def claim_card(self, actor: Role, card: int) -> bool:
        """Take an approved card with a command to run. Exactly one caller wins."""
        with self._write(actor, Role.HOME) as db:
            claimed = db.execute("UPDATE cards SET state = 'running' WHERE id = ? AND state = 'approved' "
                                 "AND command IS NOT NULL", (card,)).rowcount
            if claimed:
                row = _one(db, "SELECT * FROM cards WHERE id = ?", card)
                _event(db, actor, "card.running", row["command"][:200], project=row["project_id"],
                       request=row["request_id"], task=row["task_id"], card=card)
            return bool(claimed)

    def finish_card(self, actor: Role, card: int, state: str, result: str) -> None:
        if state not in ("done", "failed", "unknown"):
            raise ValueError("A card finishes done, failed or unknown.")
        with self._write(actor, Role.HOME, Role.LEAD, intervention=True) as db:
            row = _one(db, "SELECT * FROM cards WHERE id = ?", card)
            expected = "running" if row["command"] is not None else "approved"
            if row["state"] != expected:
                raise WorkflowError("Only an approved card can be carried out.")
            db.execute("UPDATE cards SET state = ?, result = ? WHERE id = ?", (state, result, card))
            _event(db, actor, f"card.{state}", result[:300], project=row["project_id"], request=row["request_id"],
                   task=row["task_id"], card=card)

    def cards(self, state: str | None = None, project: int | None = None) -> list[sqlite3.Row]:
        sql, args = "SELECT * FROM cards WHERE 1", []
        if state is not None:
            sql, args = sql + " AND state = ?", [*args, state]
        if project is not None:
            sql, args = sql + " AND project_id = ?", [*args, project]
        with self._read() as db:
            return db.execute(sql + " ORDER BY id", args).fetchall()

    def card(self, card: int) -> sqlite3.Row:
        with self._read() as db:
            return _one(db, "SELECT * FROM cards WHERE id = ?", card)

    def standing(self, *, kind: str, schedule: int | None = None, url: str | None = None, method: str | None = None,
                 argv: list[str] | None = None, cwd: str | None = None, secret: str | None = None) -> sqlite3.Row | None:
        """A standing approval the person gave for exactly this operation, or None."""
        with self._read() as db:
            return db.execute(
                "SELECT * FROM standing_approvals WHERE revoked IS NULL AND kind = ? AND schedule_id IS ? AND url IS ? "
                "AND method IS ? AND argv IS ? AND cwd IS ? AND secret IS ? ORDER BY id DESC LIMIT 1",
                (kind, schedule, url, method, None if argv is None else json.dumps(argv), cwd, secret),
            ).fetchone()

    def standing_approvals(self) -> list[sqlite3.Row]:
        with self._read() as db:
            return db.execute("SELECT * FROM standing_approvals WHERE revoked IS NULL ORDER BY id").fetchall()

    def revoke_standing(self, actor: Role, approval: int) -> None:
        with self._write(actor, Role.OWNER, intervention=True) as db:
            row = _one(db, "SELECT * FROM standing_approvals WHERE id = ?", approval)
            db.execute("UPDATE standing_approvals SET revoked = ? WHERE id = ?", (time.time(), approval))
            _event(db, actor, "standing.revoked", f"standing approval {approval} ({row['kind']})", card=row["card_id"])

    def expire_cards(self, now: float | None = None) -> int:
        now = now or time.time()
        with self._write(Role.HOME, Role.HOME, intervention=True) as db:
            rows = db.execute("SELECT * FROM cards WHERE state = 'waiting' AND expires IS NOT NULL AND expires < ?",
                              (now,)).fetchall()
            for row in rows:
                db.execute("UPDATE cards SET state = 'expired' WHERE id = ?", (row["id"],))
                _event(db, Role.HOME, "card.expired", row["what"], project=row["project_id"],
                       request=row["request_id"], task=row["task_id"], card=row["id"])
            return len(rows)

    # Devices and adapters

    def add_device(self, name: str, cookie_hash: str, code: str, phone: bool) -> int:
        with self._write(Role.HOME, Role.HOME, intervention=True) as db:
            key = db.execute("INSERT INTO devices(name, cookie_hash, code, state, phone, created) "
                             "VALUES (?, ?, ?, 'pending', ?, ?)", (name, cookie_hash, code, int(phone), time.time())).lastrowid
            _event(db, Role.HOME, "device.pending", f"{name} waits for confirmation on this computer")
            return key

    def set_device(self, actor: Role, device: int, state: str) -> None:
        if state not in ("allowed", "revoked"):
            raise ValueError("A device is allowed or revoked.")
        with self._write(actor, Role.OWNER, intervention=True) as db:
            row = _one(db, "SELECT * FROM devices WHERE id = ?", device)
            db.execute("UPDATE devices SET state = ?, code = NULL WHERE id = ?", (state, device))
            _event(db, actor, f"device.{state}", row["name"])

    def device(self, cookie_hash: str) -> sqlite3.Row | None:
        with self._connect() as db, db:
            row = db.execute("SELECT * FROM devices WHERE cookie_hash = ?", (cookie_hash,)).fetchone()
            if row is not None:
                db.execute("UPDATE devices SET last_seen = ? WHERE id = ?", (time.time(), row["id"]))
            return row

    def devices(self) -> list[sqlite3.Row]:
        with self._read() as db:
            return db.execute("SELECT * FROM devices ORDER BY id").fetchall()

    def set_adapter(self, provider: str, role: str, os_name: str, version: str, features: list[str], auth: str,
                    status: str, receipt: str) -> None:
        with self._write(Role.HOME, Role.HOME, intervention=True) as db:
            db.execute("INSERT INTO adapter_status VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, role, os) "
                       "DO UPDATE SET version = excluded.version, features = excluded.features, auth = excluded.auth, "
                       "status = excluded.status, receipt = excluded.receipt, at = excluded.at",
                       (provider, role, os_name, version, json.dumps(sorted(features)), auth, status, receipt, time.time()))
            kind = {"live": "adapter.qualified", "contract": "adapter.requalify", "unqualified": "adapter.unqualified"}
            _event(db, Role.HOME, kind[status], f"{provider} as {role} on {os_name}: {status}",
                   data={"version": version, "auth": auth})

    def adapters(self) -> list[sqlite3.Row]:
        with self._read() as db:
            return db.execute("SELECT * FROM adapter_status ORDER BY provider, role").fetchall()

    # The conversation and the lead's sessions

    def say(self, actor: Role, text: str, project: int | None = None, card: int | None = None,
            turn: str | None = None) -> int:
        role = {Role.OWNER: "you", Role.LEAD: "lead", Role.HOME: "artemis"}.get(actor)
        if role is None:
            raise WorkflowError("Only you, the lead or Artemis speak in the conversation.")
        with self._write(actor, actor, intervention=True) as db:
            key = db.execute("INSERT INTO messages(at, role, text, project_id, card_id, turn) "
                             "VALUES (?, ?, ?, ?, ?, ?)", (time.time(), role, text, project, card, turn)).lastrowid
            _event(db, actor, "said", text[:200], project=project, card=card, data={"message": key})
            return key

    def message(self, message: int) -> sqlite3.Row:
        with self._read() as db:
            return _one(db, "SELECT * FROM messages WHERE id = ?", message)

    def messages(self, after: int = 0, limit: int = 200) -> list[sqlite3.Row]:
        with self._read() as db:
            rows = db.execute("SELECT * FROM messages WHERE id > ? ORDER BY id DESC LIMIT ?",
                              (after, limit)).fetchall()
            return rows[::-1]

    def message(self, message: int) -> sqlite3.Row:
        with self._read() as db:
            return _one(db, "SELECT * FROM messages WHERE id = ?", message)

    def notes(self, actor: Role, limit: int = 10) -> list[sqlite3.Row]:
        """The newest notes one role recorded, oldest first."""
        with self._read() as db:
            rows = db.execute("SELECT * FROM events WHERE role = ? AND kind = 'note' ORDER BY id DESC LIMIT ?",
                              (actor, limit)).fetchall()
            return rows[::-1]

    def open_session(self, provider: str, ref: str) -> int:
        with self._connect() as db, db:
            db.execute("UPDATE sessions SET ended = ? WHERE provider = ? AND ended IS NULL", (time.time(), provider))
            return db.execute("INSERT INTO sessions(provider, ref, started) VALUES (?, ?, ?)",
                              (provider, ref, time.time())).lastrowid

    def touch_session(self, session: int, tokens: int = 0) -> None:
        with self._connect() as db, db:
            db.execute("UPDATE sessions SET turns = turns + 1, tokens = ? WHERE id = ?", (tokens, session))

    def end_session(self, session: int) -> None:
        with self._connect() as db, db:
            db.execute("UPDATE sessions SET ended = ? WHERE id = ? AND ended IS NULL", (time.time(), session))

    def session(self, provider: str) -> sqlite3.Row | None:
        with self._read() as db:
            return db.execute("SELECT * FROM sessions WHERE provider = ? AND ended IS NULL ORDER BY id DESC LIMIT 1",
                              (provider,)).fetchone()

    # Commands run through the broker

    def start_job(self, command: str, cwd: str, shell: str, *, run: int | None = None, task: int | None = None,
                  card: int | None = None) -> int:
        with self._connect() as db, db:
            return db.execute("INSERT INTO jobs(run_id, task_id, card_id, command, cwd, shell, started) "
                              "VALUES (?, ?, ?, ?, ?, ?, ?)",
                              (run, task, card, command, cwd, shell, time.time())).lastrowid

    def end_job(self, job: int, exit_code: int | None, output: str) -> None:
        with self._connect() as db, db:
            db.execute("UPDATE jobs SET ended = ?, exit_code = ?, output = ? WHERE id = ?",
                       (time.time(), exit_code, output[-65536:], job))

    def job(self, job: int) -> sqlite3.Row:
        with self._read() as db:
            return _one(db, "SELECT * FROM jobs WHERE id = ?", job)

    def jobs(self, run: int | None = None) -> list[sqlite3.Row]:
        with self._read() as db:
            if run is None:
                return db.execute("SELECT * FROM jobs ORDER BY id").fetchall()
            return db.execute("SELECT * FROM jobs WHERE run_id = ? ORDER BY id", (run,)).fetchall()

    def record(self, actor: Role, kind: str, detail: str, *, project: int | None = None,
               request: int | None = None, task: int | None = None, card: int | None = None,
               data: dict | None = None) -> int:
        """Append an event that changes no table: a command run, a file changed, a review, a wake."""
        with self._write(actor, actor, intervention=True) as db:
            return _event(db, actor, kind, detail, project=project, request=request, task=task, card=card, data=data)

    def secret_used(self, name: str, tool: str, *, task: int | None = None, run: int | None = None,
                    card: int | None = None) -> None:
        with self._write(Role.HOME, Role.HOME, intervention=True) as db:
            db.execute("INSERT INTO secret_uses(at, name, tool, task_id, run_id, card_id) VALUES (?, ?, ?, ?, ?, ?)",
                       (time.time(), name, tool, task, run, card))
            _event(db, Role.HOME, "secret.used", f"{name} in {tool}", task=task, card=card)

    def secret_uses(self, name: str | None = None) -> list[sqlite3.Row]:
        with self._read() as db:
            if name is None:
                return db.execute("SELECT * FROM secret_uses ORDER BY id").fetchall()
            return db.execute("SELECT * FROM secret_uses WHERE name = ? ORDER BY id", (name,)).fetchall()

    # Schedules

    def add_schedule(self, actor: Role, project: int, title: str, brief: str, kind: str,
                     criteria: tuple[Criterion, ...], spec: str, next_at: float) -> int:
        if not criteria:
            raise WorkflowError("A scheduled task needs at least one check.")
        with self._write(actor, Role.LEAD, Role.OWNER) as db:
            _one(db, "SELECT id FROM projects WHERE id = ?", project)
            key = db.execute(
                "INSERT INTO schedules(project_id, title, brief, kind, criteria, spec, next_at, created) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (project, title, brief, kind, json.dumps([asdict(c) for c in criteria]), spec, next_at, time.time()),
            ).lastrowid
            _event(db, actor, "schedule.added", f"{title} · {spec}", project=project, data={"schedule": key})
            return key

    def schedules(self, project: int | None = None) -> list[sqlite3.Row]:
        with self._read() as db:
            if project is None:
                return db.execute("SELECT * FROM schedules ORDER BY id").fetchall()
            return db.execute("SELECT * FROM schedules WHERE project_id = ? ORDER BY id", (project,)).fetchall()

    def due(self, now: float) -> list[sqlite3.Row]:
        with self._read() as db:
            return db.execute("SELECT * FROM schedules WHERE active = 1 AND next_at <= ? ORDER BY next_at",
                              (now,)).fetchall()

    def fire(self, schedule: int, slot: float, next_at: float | None, late: bool) -> int | None:
        """Turn one due slot into a request and a task, exactly once. Returns the task, or None if taken."""
        with self._write(Role.HOME, Role.HOME) as db:
            row = _one(db, "SELECT * FROM schedules WHERE id = ?", schedule)
            moved = db.execute("UPDATE schedules SET next_at = ?, last_at = ?, active = ? WHERE id = ? AND next_at = ?",
                               (next_at if next_at is not None else slot, slot, int(next_at is not None),
                                schedule, slot)).rowcount
            if not moved:
                return None
            request = db.execute("INSERT INTO requests(project_id, text, source) VALUES (?, ?, 'schedule')",
                                 (row["project_id"], f"{row['title']} ({row['spec']})")).lastrowid
            _event(db, Role.HOME, "request", row["title"], project=row["project_id"], request=request)
            task = db.execute(
                "INSERT INTO tasks(request_id, project_id, title, brief, criteria, kind, schedule_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (request, row["project_id"], row["title"], row["brief"], row["criteria"], row["kind"], schedule),
            ).lastrowid
            _event(db, Role.HOME, "schedule.late" if late else "schedule.fired", row["title"],
                   project=row["project_id"], request=request, task=task, data={"schedule": schedule, "slot": slot})
            return task

    # Lessons

    def add_lesson(self, actor: Role, kind: str, text: str, payload: dict | None = None,
                   source: list | None = None, project: int | None = None, state: str = "active") -> int:
        if state not in ("active", "proposed"):
            raise ValueError("A new lesson is active or proposed.")
        if not text.strip() or len(text) > 200:
            raise WorkflowError("A lesson is one line of at most 200 characters.")
        with self._write(actor, Role.LEAD, Role.HOME) as db:
            key = db.execute("INSERT INTO lessons(project_id, kind, text, payload, state, source, created) "
                             "VALUES (?, ?, ?, ?, ?, ?, ?)",
                             (project, kind, text, json.dumps(payload or {}), state, json.dumps(source or []),
                              time.time())).lastrowid
            _event(db, actor, "lesson.added" if state == "proposed" else "lesson.active", text, project=project,
                   data={"lesson": key, "kind": kind})
            return key

    def set_lesson(self, actor: Role, lesson: int, state: str) -> None:
        if state not in ("active", "retired", "unproven", "proposed"):
            raise ValueError("Unknown lesson state.")
        allowed = (Role.OWNER,) if state == "active" else (Role.OWNER, Role.HOME)
        with self._write(actor, *allowed, intervention=True) as db:
            row = _one(db, "SELECT * FROM lessons WHERE id = ?", lesson)
            db.execute("UPDATE lessons SET state = ? WHERE id = ?", (state, lesson))
            _event(db, actor, f"lesson.{state}", row["text"], project=row["project_id"], data={"lesson": lesson})

    def activate_lesson(self, lesson: int) -> None:
        """The home turns a proposed lesson active once its check has passed on the target."""
        with self._write(Role.HOME, Role.HOME) as db:
            row = _one(db, "SELECT * FROM lessons WHERE id = ?", lesson)
            if row["state"] != "proposed":
                raise WorkflowError("Only a proposed lesson can be activated.")
            db.execute("UPDATE lessons SET state = 'active' WHERE id = ?", (lesson,))
            _event(db, Role.HOME, "lesson.active", row["text"], project=row["project_id"], data={"lesson": lesson})

    def lessons(self, project: int | None = None, state: str | None = "active") -> list[sqlite3.Row]:
        sql, args = "SELECT * FROM lessons WHERE 1", []
        if state is not None:
            sql, args = sql + " AND state = ?", [state]
        if project is not None:
            sql, args = sql + " AND (project_id IS NULL OR project_id = ?)", [*args, project]
        with self._read() as db:
            return db.execute(sql + " ORDER BY id DESC", args).fetchall()

    def lesson_used(self, lesson: int, first_try: bool) -> None:
        with self._connect() as db, db:
            db.execute("UPDATE lessons SET uses = uses + 1, first_try = first_try + ? WHERE id = ?",
                       (int(first_try), lesson))

    # Workers

    def claim_run(self, actor: Role, task: int, agent: str, branch: str | None = None) -> int:
        """Start a run for a task that has none in progress; the check and insert are one write."""
        with self._write(actor, Role.LEAD, Role.HOME) as db:
            row = _one(db, "SELECT * FROM work WHERE id = ?", task)
            if row["state"] in {"running", "shipped", "dropped", "verified"}:
                raise WorkflowError(f"Task {task} is {row['state']}.")
            key = db.execute("INSERT INTO runs(task_id, agent, branch, started) VALUES (?, ?, ?, ?)",
                             (task, agent, branch, time.time())).lastrowid
            _event(db, actor, "started", f"{agent}" + (f" on {branch}" if branch else ""), task=task,
                   data={"run": key, "agent": agent})
            return key

    def run_pid(self, run: int, pid: int) -> None:
        with self._connect() as db, db:
            db.execute("UPDATE runs SET pid = ? WHERE id = ?", (pid, run))

    def end_run(self, actor: Role, run: int, outcome: str, note: str) -> None:
        with self._write(actor, Role.WORKER, Role.HOME, intervention=True) as db:
            row = _one(db, "SELECT * FROM runs WHERE id = ?", run)
            if row["ended"] is not None:
                return
            db.execute("UPDATE runs SET ended = ?, outcome = ?, note = ? WHERE id = ?",
                       (time.time(), outcome, note, run))
            kind = {"done": "finished", "stuck": "stuck", "stopped": "stopped"}[outcome]
            _event(db, actor, kind, note, task=row["task_id"], data={"run": run})

    def end_orphans(self, note: str = "home restarted") -> int:
        """Mark runs left open by a home that is gone as stuck. Returns how many."""
        with self._write(Role.HOME, Role.HOME, intervention=True) as db:
            rows = db.execute("SELECT id, task_id FROM runs WHERE ended IS NULL").fetchall()
            for row in rows:
                db.execute("UPDATE runs SET ended = ?, outcome = 'stuck', note = ? WHERE id = ?",
                           (time.time(), note, row["id"]))
                _event(db, Role.HOME, "stuck", note, task=row["task_id"], data={"run": row["id"]})
            return len(rows)

    def retrying(self, actor: Role, task: int, reason: str) -> None:
        with self._write(actor, Role.WORKER, Role.HOME) as db:
            _one(db, "SELECT id FROM tasks WHERE id = ?", task)
            _event(db, actor, "retrying", reason, task=task)

    def task_brief(self, task: int) -> sqlite3.Row:
        with self._read() as db:
            return _one(db, "SELECT * FROM tasks WHERE id = ?", task)

    def submissions(self, task: int) -> list[sqlite3.Row]:
        """A task's submissions, oldest first, each with its verdict (None while unjudged)."""
        with self._read() as db:
            return db.execute(
                "SELECT s.*, (SELECT kind FROM verdicts WHERE submission_id = s.id ORDER BY id DESC LIMIT 1) AS verdict "
                "FROM submissions s WHERE s.task_id = ? ORDER BY s.id", (task,)).fetchall()

    def evidence(self, task: int) -> tuple[sqlite3.Row | None, dict[int, Evidence]]:
        """The task's latest submission, with its verdict and gaps once judged, and its evidence by criterion."""
        with self._read() as db:
            row = db.execute("SELECT s.*, v.kind AS verdict, v.gaps FROM submissions s LEFT JOIN verdicts v ON v.id = "
                             "(SELECT MAX(id) FROM verdicts WHERE submission_id = s.id) WHERE s.task_id = ? "
                             "ORDER BY s.id DESC LIMIT 1", (task,)).fetchone()
            if row is None:
                return None, {}
            return row, {saved["criterion"]: evidence_from(saved["kind"], json.loads(saved["data"]))
                         for saved in db.execute("SELECT * FROM evidence WHERE submission_id = ?", (row["id"],))}

    def submit(self, actor: Role, task: int, sha: str, claim: str,
               items: dict[int, Evidence]) -> None:
        """Record a complete evidence snapshot, keyed by one-based criterion number.

        A repo task submits its full commit hash; a host task submits 'host:' and the snapshot's SHA-256.
        """
        if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}|host:[0-9a-f]{64}", sha):
            raise ValueError("Submit the full Git commit hash, or host: and the evidence digest.")
        with self._write(actor, Role.WORKER, Role.HOME) as db:
            row = _one(db, "SELECT * FROM tasks WHERE id = ?", task)
            criteria = _criteria(row["criteria"])
            if not items.keys() <= set(range(1, len(criteria) + 1)):
                raise ValueError("Evidence must refer to an assigned criterion.")
            submission = db.execute(
                "INSERT INTO submissions(task_id, sha, claim) VALUES (?, ?, ?)", (task, sha, claim)
            ).lastrowid
            db.executemany(
                "INSERT INTO evidence VALUES (?, ?, ?, ?)",
                [(submission, number, type(item).KIND, json.dumps(asdict(item))) for number, item in items.items()],
            )
            first = claim.strip().splitlines()[0] if claim.strip() else ""
            _event(db, actor, "reported", f"{first[:120]} ({len(items)}/{len(criteria)} evidence)", task=task)

    def judge(self, actor: Role, task: int, judge: Judge) -> Verdict:
        with self._write(actor, Role.JUDGE) as db:
            row = _one(db, "SELECT * FROM work WHERE id = ?", task)
            if row["submission_id"] is None or row["verdict"] is not None:
                raise WorkflowError("There is no unjudged submission.")
            submission = _one(db, "SELECT * FROM submissions WHERE id = ?", row["submission_id"])
            criteria = _criteria(_one(db, "SELECT criteria FROM tasks WHERE id = ?", task)["criteria"])
            items = {saved["criterion"]: evidence_from(saved["kind"], json.loads(saved["data"]))
                     for saved in db.execute("SELECT * FROM evidence WHERE submission_id = ?", (submission["id"],))}
            case = Case(submission["sha"], submission["claim"], criteria,
                        tuple(items.get(number) for number in range(1, len(criteria) + 1)))
            verdict = judge.assess(case)
            db.execute("INSERT INTO verdicts(submission_id, kind, gaps) VALUES (?, ?, ?)",
                       (submission["id"], verdict.kind, json.dumps(verdict.gaps)))
            detail = "; ".join(verdict.gaps) or "All done criteria supported"
            _event(db, actor, verdict.kind, detail, task=task)
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
            _event(db, Role.SHIP, state, detail, task=task)
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
            _event(db, Role.SHIP, state, detail, task=task)
            return Receipt(sha, state, receipt.candidate, receipt.checks)

    # Views

    def work(self, task: int | None = None, project: int | None = None) -> list[sqlite3.Row]:
        with self._read() as db:
            if task is not None:
                return [_one(db, "SELECT * FROM work WHERE id = ?", task)]
            if project is not None:
                return db.execute("SELECT * FROM work WHERE project_id = ? ORDER BY id", (project,)).fetchall()
            return db.execute("SELECT * FROM work ORDER BY id").fetchall()

    def receipts(self) -> dict[int, sqlite3.Row]:
        with self._read() as db:
            rows = db.execute("SELECT s.task_id, r.* FROM receipts r JOIN submissions s "
                              "ON s.id = r.submission_id WHERE r.state = 'applied'").fetchall()
            return {row["task_id"]: row for row in rows}

    def events(self, after: int = 0, task: int | None = None, project: int | None = None,
               limit: int | None = None, kind: str | None = None, since: float | None = None) -> list[sqlite3.Row]:
        sql, args = "SELECT * FROM events WHERE id > ?", [after]
        if kind is not None:
            sql, args = sql + " AND kind = ?", [*args, kind]
        if since is not None:
            sql, args = sql + " AND at >= ?", [*args, since]
        if task is not None:
            sql, args = sql + " AND (task_id = ? OR (role = ? AND kind IN ('halt', 'resume')))", [*args, task, Role.OWNER]
        if project is not None:
            sql, args = sql + " AND (project_id = ? OR project_id IS NULL)", [*args, project]
        sql += " ORDER BY id" + (f" LIMIT {int(limit)}" if limit else "")
        with self._read() as db:
            return db.execute(sql, args).fetchall()

    def latest_events(self, limit: int, kinds: tuple[str, ...] | None = None,
                      project: int | None = None) -> list[sqlite3.Row]:
        """The newest events, optionally of some kinds or one project, oldest first."""
        sql, args = "SELECT * FROM events WHERE 1", []
        if kinds is not None:
            sql, args = sql + f" AND kind IN ({', '.join('?' * len(kinds))})", [*args, *kinds]
        if project is not None:
            sql, args = sql + " AND project_id = ?", [*args, project]
        with self._read() as db:
            return db.execute(sql + " ORDER BY id DESC LIMIT ?", [*args, limit]).fetchall()[::-1]

    def task_history(self, task: int) -> dict[str, list[sqlite3.Row]]:
        """A task's runs, submissions, evidence and verdicts, oldest first."""
        joined = "JOIN submissions s ON s.id = {}.submission_id WHERE s.task_id = ?"
        with self._read() as db:
            _one(db, "SELECT id FROM tasks WHERE id = ?", task)
            return {
                "runs": db.execute("SELECT * FROM runs WHERE task_id = ? ORDER BY id", (task,)).fetchall(),
                "submissions": db.execute("SELECT * FROM submissions WHERE task_id = ? ORDER BY id",
                                          (task,)).fetchall(),
                "evidence": db.execute("SELECT e.* FROM evidence e " + joined.format("e")
                                       + " ORDER BY e.submission_id, e.criterion", (task,)).fetchall(),
                "verdicts": db.execute("SELECT v.* FROM verdicts v " + joined.format("v") + " ORDER BY v.id",
                                       (task,)).fetchall(),
            }

    def last_read(self) -> sqlite3.Row | None:
        with self._read() as db:
            return db.execute("SELECT * FROM events WHERE role = ? AND kind = 'read' ORDER BY id DESC LIMIT 1",
                              (Role.OWNER,)).fetchone()

    def counts(self, since: float | None = None, project: int | None = None) -> dict[str, int]:
        """What the person's attention cost and bought: cards put to them against tasks done."""
        since = since or 0.0
        with self._read() as db:
            where, args = ("", []) if project is None else (" AND w.project_id = ?", [project])
            rows = db.execute("SELECT w.state, p.kind AS project_kind FROM work w JOIN projects p "
                              "ON p.id = w.project_id WHERE 1" + where, args).fetchall()
            done_events = db.execute(
                "SELECT COUNT(DISTINCT e.task_id) FROM events e JOIN tasks t ON t.id = e.task_id "
                "JOIN projects p ON p.id = t.project_id WHERE e.at >= ? AND ((e.kind = 'applied') OR "
                "(e.kind = 'pass' AND p.kind = 'folder'))" + ("" if project is None else " AND t.project_id = ?"),
                [since, *args]).fetchone()[0]
            card_where = "" if project is None else " AND project_id = ?"
            asked = db.execute("SELECT COUNT(*) FROM cards WHERE created >= ?" + card_where,
                               [since, *args]).fetchone()[0]
            waiting = db.execute("SELECT COUNT(*) FROM cards WHERE state = 'waiting'" + card_where,
                                 args).fetchone()[0]
        states = [row["state"] for row in rows]
        return {
            "running": states.count("running"),
            "queued": states.count("queued"),
            "stuck": states.count("stuck"),
            "verified": sum(1 for row in rows if row["state"] == "verified" and row["project_kind"] == "repo"),
            "shipped": states.count("shipped"),
            "done": done_events,
            "asked": asked,
            "waiting": waiting,
        }

    def stopped(self) -> bool:
        try:
            self.allow_step()
        except WorkflowError:
            return True
        return False


def evidence_from(kind: str, data: dict) -> Evidence:
    """Rebuild one evidence record from its stored kind and fields."""
    for cls in EVIDENCE_KINDS:
        if cls.KIND == kind:
            return cls(**_fields(data))
    raise WorkflowError(f"Unknown evidence kind {kind!r}.")
