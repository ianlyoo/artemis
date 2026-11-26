"""The person's side of the Artemis App: approvals, questions, hand-done steps, proposed lessons, runs,
completed work and the activity timeline, projected from the public SQLite ledger.

Routes plug into web/__init__.py through ROUTES and REFRESH (wire.py). `turn(ledger)` and `groups(ledger)`
feed the dashboard and owner_views frames.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import json
import shlex
import time

from .. import agents, attention, httpop, lessons
from ..roles import INTERRUPTS, Interrupt, Role
from .secret_requests import chat_links
from .wire import Refused

OPTION_MAX = 20     # choices.js OPTION_MAX: button label cap
ROW_MAX = 100
Q_MAX = 200
LINE_MAX = 200
STANDING_KINDS = (Interrupt.SEND, Interrupt.DELETE)
STEPS = ("step", "secret")     # cards the App draws as an owner step: a thing the person does where its link goes
TERMINAL_TASKS = frozenset({"shipped", "verified", "dropped"})
ACTOR_NAMES = {"you": "owner", "lead": "lead", "worker": "worker", "judge": "judge", "ship": "ship", "artemis": "home"}


# Formatting helpers

def _iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


def _loads(raw: str | None, default=None):
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except ValueError:
        return default


def _one_line(text: str | None, limit: int = Q_MAX) -> str:
    cleaned = " ".join(str(text or "").split()).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: max(1, limit - 1)].rstrip() + "…"


def headline(text: str | None) -> str:
    """What a request or card is called on screen: its first line, whole. The screens ellipsize it to their width;
    a cut here left half words on every width."""
    lines = [line for line in str(text or "").splitlines() if line.strip()]
    return " ".join(lines[0].split()) if lines else ""


def _expired(row, now: float) -> bool:
    return row["state"] == "waiting" and row["expires"] is not None and row["expires"] < now


def _agent_label(name: str | None) -> str:
    return agents.LABELS.get(name, name) if name else "agent"


def worker_agent(run: int, agent: str | None, started: float | None, ended: float | None, task) -> dict:
    """One worker run as the screens draw an agent, named by who runs it and what for. Status, the Timeline and the
    Jobs rail all read the agents built here, so they name and count the same ones; `network_state` is what
    Status and the Timeline count as running."""
    label = _agent_label(agent)
    return {"id": f"run-{run}", "role": "worker", "title": f"{label} · {task['title']}" if task else label,
            "seat": label, "host": "local", "status": "active" if ended is None else "ended", "busy": ended is None,
            "network_state": "running" if ended is None else "done",
            "goal_id": task["request_id"] if task else None, "project_id": task["id"] if task else None,
            "parent_id": "lead", "created_at": _iso(started), "last_turn_at": _iso(ended or started),
            "ended_at": _iso(ended)}


def _int_param(handler, name: str, default: int | None = None, *, minimum: int | None = None,
               maximum: int | None = None) -> int | None:
    raw = handler.query.get(name, [""])[0].strip()
    if not raw:
        return default
    try:
        value = int(float(raw))
    except ValueError:
        raise Refused(400, f"{name} must be an integer.") from None
    if minimum is not None and value < minimum:
        value = minimum
    if maximum is not None and value > maximum:
        value = maximum
    return value


def _float_param(handler, name: str) -> float | None:
    raw = handler.query.get(name, [""])[0].strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        raise Refused(400, f"{name} must be a number.") from None


def goal_of(ledger, row, task_requests: dict[int, int] | None = None) -> int | None:
    """In the public home, a person's request is a goal; a card linked only to a task inherits its request."""
    if row["request_id"] is not None:
        return row["request_id"]
    if row["task_id"] is None:
        return None
    if task_requests is not None:
        return task_requests.get(row["task_id"])
    with ledger._read() as db:
        found = db.execute("SELECT request_id FROM tasks WHERE id = ?", (row["task_id"],)).fetchone()
        return found["request_id"] if found is not None else None


def request_map(ledger) -> tuple[dict[int, dict], dict[int, int]]:
    """Every request with its recorded creation time, plus task_id -> request_id."""
    with ledger._read() as db:
        reqs = {row["id"]: dict(row) for row in db.execute("SELECT * FROM requests ORDER BY id").fetchall()}
        created = {row["request_id"]: row["at"] for row in db.execute(
            "SELECT request_id, MIN(at) AS at FROM events WHERE request_id IS NOT NULL GROUP BY request_id"
        ).fetchall()}
        task_req = {row["id"]: row["request_id"] for row in db.execute(
            "SELECT id, request_id FROM tasks"
        ).fetchall()}
    for req_id, req in reqs.items():
        req["at"] = created.get(req_id)
    return reqs, task_req


# Scope hash and approval representation

def scope_hash(row) -> str:
    """SHA-256 hex digest over a card's canonical scope fields (kind, what, command/request, cwd, secrets)."""
    canonical = {
        "kind": row["kind"],
        "what": row["what"],
        "command": row["command"],
        "cwd": row["cwd"],
        "secrets": _loads(row["secrets"], []),
    }
    blob = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def _scope_text(row) -> str:
    """Human-readable approval scope: what, why, and the held command or web request (never secret values)."""
    parts = [row["what"]]
    if row["why"]:
        parts.append(row["why"])
    if httpop.is_http(row):
        req = _loads(row["command"], {})
        line = f"Request: {req.get('method', 'POST')} {req.get('url', '')}".strip()
        if req.get("body_sha256"):
            line += f" (sha256 {req['body_sha256'][:12]})"
        parts.append(line)
    elif row["command"]:
        parsed = _loads(row["command"])
        cmd = shlex.join(parsed) if isinstance(parsed, list) and all(isinstance(w, str) for w in parsed) else row["command"]
        parts.append(f"Command: {cmd}")
        if row["cwd"]:
            parts.append(f"Folder: {row['cwd']}")
    secrets = _loads(row["secrets"], [])
    if secrets:
        parts.append("Secrets: " + ", ".join(secrets))
    return "\n".join(parts)


def _approval_status(row, now: float) -> str:
    if _expired(row, now) or row["state"] == "expired":
        return "expired"
    if row["state"] == "waiting":
        return "pending"
    if row["state"] == "declined":
        return "denied"
    return "approved"


def approval_json(ledger, row, *, reqs: dict[int, dict] | None = None,
                  task_requests: dict[int, int] | None = None, now: float | None = None,
                  reason: str | None = None, comment: str | None = None) -> dict:
    """One approval (or question status check) in the shape approvals.js and CONTRACT.md read."""
    now = time.time() if now is None else now
    if reqs is None or task_requests is None:
        reqs, task_requests = request_map(ledger)
    goal = goal_of(ledger, row, task_requests)
    goal_title = headline(reqs[goal]["text"]) if goal in reqs else None
    status = _approval_status(row, now)
    result = {
        "id": row["id"],
        "goal_id": goal,
        "goal_title": goal_title,
        "kind": row["kind"],
        "level": "owner",
        "status": status,
        "scope_text": _scope_text(row),
        "scope_hash": scope_hash(row),
        "created_at": _iso(row["created"]),
        "decided_at": _iso(row["decided"]),
        "decided_via": "home" if row["decided"] is not None else None,
        "execution_state": "expired" if _expired(row, now) else row["state"],
    }
    if row["kind"] == "choice":
        opts = _loads(row["options"], [])
        if isinstance(opts, list):
            result["options"] = [{"id": str(o["id"]), "label": str(o["label"])} for o in opts if isinstance(o, dict)]
    verbatim = _one_line(reason, 300) if status == "denied" and reason else _one_line(comment, 200) if comment else None
    if verbatim:
        result["owner_verbatim"] = verbatim
        if status == "denied":
            result["reason"] = verbatim
    return result


# Card actions

def decide_card(handler, card_id: int, approve: bool, *, standing: bool = False,
                expected_hash: str | None = None):
    """Validate and record an owner's approval or denial of an interrupt card.

    Enforces expiry, waiting state, interrupt kind, optional scope_hash binding, phone_only device policy,
    and standing-approval eligibility before writing to the ledger.
    """
    handler.found(handler.ledger.card, card_id)
    handler.ledger.expire_cards()
    card = handler.ledger.card(card_id)
    if card["state"] == "expired":
        raise Refused(409, "This card expired before you answered it. Nothing ran.")
    if card["state"] != "waiting":
        raise Refused(409, "This card is no longer waiting for you.")
    if card["kind"] not in tuple(Interrupt):
        raise Refused(400, f"This is a {card['kind']} card; it is answered, not approved.")
    if expected_hash is not None:
        if not isinstance(expected_hash, str) or not expected_hash.strip():
            raise Refused(400, "scope_hash is required.")
        if not hmac.compare_digest(expected_hash.strip(), scope_hash(card)):
            raise Refused(409, "This approval's scope changed. Reload the card before deciding.", stale=True)
    if approve and not approves_here(handler, card["kind"]):
        raise Refused(403, "This one is approved on your paired phone. You can decline it here.")
    bound = None
    if approve and standing:
        if card["kind"] not in STANDING_KINDS:
            raise Refused(400, "Money out is asked every time; it never gets a standing approval.")
        bound = handler.standing_for(card["id"])
        if bound is None:
            raise Refused(400, "Only one exact operation from a scheduled task can be approved for good; "
                               "this one is approved once.")
    handler.ledger.decide_card(Role.OWNER, card["id"], approve, standing=bound)
    return handler.ledger.card(card["id"])


def choose_card(handler, card_id: int, option: str, *, comment: str | None = None):
    """Validate and record the person's pick on a waiting choice card."""
    handler.found(handler.ledger.card, card_id)
    handler.ledger.expire_cards()
    card = handler.ledger.card(card_id)
    if card["state"] == "expired":
        raise Refused(409, "This card expired before you answered it. Nothing ran.")
    if card["state"] != "waiting":
        raise Refused(409, "This card is no longer waiting for you.")
    handler.ledger.choose(Role.OWNER, card["id"], option, comment=comment)
    lesson = lessons.card_lesson(card)
    if lesson is not None:      # a lesson's Yes or No does what POST /api/lessons/:id/accept|retire does
        (lessons.accept if option == "accept" else lessons.retire)(handler.ledger, lesson)
    return handler.ledger.card(card["id"])


# Choices & questions (fences match choices.js parseChoices() and questions.js sameSpec())

def _choice_entries(raw_options: list[dict]) -> list[tuple[str, str, str]]:
    """Map stored [{id, label, line?}] to (option_id, button_label <= 20 chars, detail_line)."""
    entries: list[tuple[str, str, str]] = []
    used: set[str] = set()
    for index, opt in enumerate(raw_options):
        opt_id = str(opt["id"]).strip()
        full = _one_line(str(opt["label"]), LINE_MAX)
        extra = _one_line(str(opt.get("line") or ""), LINE_MAX)
        if 1 <= len(full) <= OPTION_MAX and full not in used:
            short, detail = full, extra
        elif 1 <= len(opt_id) <= OPTION_MAX and opt_id not in used:
            short, detail = opt_id, extra or full
        else:
            base = (full[: OPTION_MAX - 1].rstrip() + "…") if len(full) > OPTION_MAX else full or f"Option {index + 1}"
            short = base
            suffix = 2
            while short in used:
                tag = f" {suffix}"
                short = base[: OPTION_MAX - len(tag)].rstrip() + tag
                suffix += 1
            detail = extra or full
        used.add(short)
        entries.append((opt_id, short, detail))
    return entries


def choice_spec(what: str, raw_options: list[dict]) -> dict:
    """Question spec for GET /questions, matching the App's choices fence parser."""
    entries = _choice_entries(raw_options)
    spec: dict = {}
    q = _one_line(what, Q_MAX)
    if q:
        spec["q"] = q
    spec["options"] = [short for _, short, _ in entries]
    if any(detail for _, _, detail in entries):
        spec["details"] = [{"line": detail} for _, _, detail in entries]
    return spec


def choice_fence(what: str, raw_options: list[dict]) -> str:
    """Markdown ```choices fence carrying the exact spec GET /questions serves for this card."""
    entries = _choice_entries(raw_options)
    q = _one_line(what, Q_MAX)
    fence_options = [{"label": short, "line": detail} if detail else short for _, short, detail in entries]
    payload = {**({"q": q} if q else {}), "options": fence_options}
    return f"```choices\n{json.dumps(payload, ensure_ascii=False)}\n```"


def _resolve_choice_pick(raw_options: list[dict], pick: str) -> str | None:
    """Resolve a submitted button label, full label, or option id back to the card's option id."""
    wanted = pick.strip()
    entries = _choice_entries(raw_options)
    for opt, (opt_id, short, detail) in zip(raw_options, entries):
        if wanted in (opt_id, short, str(opt["label"]).strip(), detail):
            return opt_id
    return None


def _question_aux(ledger) -> tuple[dict[int, dict], dict[int, list[dict]], dict[int, str], float | None]:
    """Read lead messages linked to cards, comment-only question notes, answer comments, and latest lead timestamp."""
    with ledger._read() as db:
        msg_rows = db.execute("SELECT id, at, card_id FROM messages WHERE card_id IS NOT NULL ORDER BY id").fetchall()
        last_lead = db.execute("SELECT MAX(at) AS at FROM messages WHERE role = 'lead'").fetchone()["at"]
        note_rows = db.execute(
            "SELECT card_id, detail, at FROM events WHERE kind = 'question.note' AND card_id IS NOT NULL ORDER BY id"
        ).fetchall()
        ans_rows = db.execute(
            "SELECT card_id, data FROM events WHERE kind = 'card.answered' AND card_id IS NOT NULL ORDER BY id"
        ).fetchall()
    messages = {row["card_id"]: {"id": row["id"], "at": row["at"]} for row in msg_rows}
    notes: dict[int, list[dict]] = {}
    for row in note_rows:
        notes.setdefault(row["card_id"], []).append({"text": row["detail"], "at": _iso(row["at"])})
    comments: dict[int, str] = {}
    for row in ans_rows:
        data = _loads(row["data"], {})
        if isinstance(data, dict) and data.get("comment"):
            comments[row["card_id"]] = str(data["comment"])
    return messages, notes, comments, last_lead


def question_json(row, *, messages: dict[int, dict], notes: dict[int, list[dict]],
                  comments: dict[int, str], now: float | None = None) -> dict:
    """One choice card as a QuestionRecord for GET /questions and POST /questions/:id/answer."""
    now = time.time() if now is None else now
    raw_options = _loads(row["options"], [])
    spec = choice_spec(row["what"], raw_options)
    entries = _choice_entries(raw_options)
    id_to_label = {opt_id: short for opt_id, short, _ in entries}
    linked = messages.get(row["id"])
    at_ts = linked["at"] if linked else row["created"]
    if _expired(row, now) or row["state"] == "expired":
        status = "closed"
        ended = row["decided"] or row["expires"]
    elif row["state"] == "waiting":
        status = "open"
        ended = None
    elif row["state"] == "done":
        status = "answered"
        ended = row["decided"]
    else:
        status = "closed"
        ended = row["decided"]
    answer = None
    if status == "answered" and row["answer"] is not None:
        pick_label = id_to_label.get(row["answer"], row["answer"])
        comment = comments.get(row["id"])
        answer = {"picks": [pick_label], **({"comment": comment} if comment else {})}
    return {
        "id": row["id"],
        "conversation_id": linked["id"] if linked else row["id"],
        "fence": 0,
        "status": status,
        "at": _iso(at_ts),
        "ended_at": _iso(ended),
        "answer": answer,
        "notes": notes.get(row["id"], []),
        "spec": spec,
    }


# Owner steps (cards with kind = 'step')

def _step_link(row, secrets: dict[int, str]) -> str | None:
    """Where a step sends the person: a secret card's place in the chat (secrets: secret_requests.chat_links), else
    the link the lead gave."""
    if row["kind"] == "secret":
        return secrets.get(row["id"])
    opts = _loads(row["options"], {})
    if isinstance(opts, dict) and isinstance(opts.get("link"), str) and opts["link"].strip():
        return opts["link"].strip()
    return None


def step_json(ledger, row, *, task_requests: dict[int, int] | None = None, now: float | None = None) -> dict:
    """One step card as /db/read?kind=owner_steps&id=N and /owner-steps/:id/done return it."""
    now = time.time() if now is None else now
    if _expired(row, now) or row["state"] == "expired":
        status = "expired"
    elif row["state"] == "waiting":
        status = "live"
    elif row["state"] == "done":
        status = "cleared"
    else:
        status = "withdrawn"
    goal = goal_of(ledger, row, task_requests)
    link = _step_link(row, chat_links(ledger))
    item = {
        "id": row["id"],
        "goal_id": goal,
        "project_id": row["task_id"],
        "status": status,
        "text": row["what"],
        "why": row["why"],
        "created_at": _iso(row["created"]),
        "cleared_at": _iso(row["decided"]) if status == "cleared" else None,
    }
    if link is not None:
        item["link"] = link
    return item


# Dashboard projections: owner_turn and owner_groups

def _turn_items(ledger, now: float | None = None) -> tuple[list[dict], dict[int, dict]]:
    """Open items waiting on the person, each as a kind the App opens a card for: approvals, questions (a lesson
    waiting for a yes is one), and steps (a secret is one, whose link is its card in the chat)."""
    now = time.time() if now is None else now
    reqs, task_requests = request_map(ledger)
    secrets = chat_links(ledger)
    items: list[dict] = []
    for card in ledger.cards(state="waiting"):
        if _expired(card, now):
            continue
        goal = goal_of(ledger, card, task_requests)
        goal_title = headline(reqs[goal]["text"] if goal in reqs else card["what"])
        since = _iso(card["created"])
        req_ids = [goal] if goal is not None else []
        if card["kind"] in INTERRUPTS:
            items.append({
                "kind": "approval",
                "id": card["id"],
                "goal_id": goal,
                "title": goal_title,
                "what": card["what"],
                "since": since,
                "requests": req_ids,
            })
        elif card["kind"] == "choice":
            items.append({
                "kind": "question",
                "id": card["id"],
                "goal_id": goal,
                "title": goal_title,
                "what": card["what"],
                "since": since,
                "requests": req_ids,
            })
        elif card["kind"] in ("step", "secret"):
            entry = {
                "kind": "step",
                "id": card["id"],
                "goal_id": goal,
                "project_id": card["task_id"],
                "title": goal_title,
                "what": card["what"],
                "since": since,
                "requests": req_ids,
            }
            link = _step_link(card, secrets)
            if link is not None:
                entry["link"] = link
            items.append(entry)
    return items, reqs


def turn(ledger) -> list[dict]:
    """CONTRACT dashboard.owner_turn: every open card waiting for the person."""
    items, _ = _turn_items(ledger)
    return items


def groups(ledger) -> list[dict]:
    """CONTRACT dashboard.owner_groups: the person's turn grouped by goal (request), or standalone."""
    items, reqs = _turn_items(ledger)
    grouped: dict[str, dict] = {}
    order: list[str] = []
    for item in items:
        action = {**item, "key": f"{item['kind']}:{item['id']}"}
        action.pop("requests", None)
        goal = item.get("goal_id")
        group_key = f"goal:{goal}" if goal is not None else action["key"]
        if group_key not in grouped:
            req_refs = []
            if goal is not None and goal in reqs:
                req = reqs[goal]
                req_refs.append({
                    "id": req["id"],
                    "at": _iso(req["at"]),
                    "owner_text": req["text"],
                    "how": "origin",
                    "status": "in_progress",
                })
            grouped[group_key] = {
                "kind": item["kind"],
                "id": item["id"],
                "goal_id": goal,
                "key": group_key,
                "title": item["title"],
                "what": item["what"],
                "since": item["since"],
                "label": "Your turn",
                "requests": req_refs,
                "actions": [action],
            }
            order.append(group_key)
        else:
            grouped[group_key]["actions"].append(action)
    return [grouped[key] for key in order]


# Runs, completed work and timeline projections

def runs_payload(ledger) -> dict:
    """CONTRACT GET /runs: active worker runs and active broker command jobs."""
    with ledger._read() as db:
        active_runs = db.execute("SELECT * FROM runs WHERE ended IS NULL ORDER BY id").fetchall()
        active_jobs = db.execute("SELECT * FROM jobs WHERE ended IS NULL ORDER BY id").fetchall()
        tasks = {row["id"]: row for row in db.execute(
            "SELECT id, request_id, project_id, title, kind, schedule_id FROM tasks"
        ).fetchall()}
        cards = {row["id"]: row for row in db.execute(
            "SELECT id, request_id, task_id, what FROM cards"
        ).fetchall()}
        latest_ev = db.execute("SELECT COALESCE(MAX(id), 0) AS id FROM events").fetchone()["id"]
    running: list[dict] = []
    used_ids: set[int] = set()
    for run in active_runs:
        task = tasks.get(run["task_id"])
        used_ids.add(run["id"])
        running.append({
            "id": run["id"],
            "status": "running",
            "kind": task["kind"] if task else "task",
            "goal_id": task["request_id"] if task else None,
            "project_id": run["task_id"],
            "host": "local",
            "label": f"{task['title']} ({_agent_label(run['agent'])})" if task else _agent_label(run["agent"]),
            "agent": run["agent"],
            "started_at": _iso(run["started"]),
        })
    for job in active_jobs:
        task = tasks.get(job["task_id"]) if job["task_id"] is not None else None
        card = cards.get(job["card_id"]) if job["card_id"] is not None else None
        goal = task["request_id"] if task else (card["request_id"] if card else None)
        entry_id = job["id"]
        if entry_id in used_ids:
            entry_id = 1_000_000 + job["id"]
            while entry_id in used_ids:
                entry_id += 1
        used_ids.add(entry_id)
        label = headline(card["what"] if card else attention.command_line(job["command"]))
        running.append({
            "id": entry_id,
            "job_id": job["id"],
            "run_id": job["run_id"],
            "status": "running",
            "kind": "command",
            "goal_id": goal,
            "project_id": job["task_id"],
            "host": "local",
            "label": label,
            "started_at": _iso(job["started"]),
        })
    running.sort(key=lambda item: (item["started_at"] or "", item["id"]), reverse=True)
    digest = hashlib.sha256(json.dumps({"running": running, "ev": latest_ev}, sort_keys=True).encode("utf-8")).hexdigest()
    version = int(digest[:12], 16) or 1
    return {"ok": True, "version": version, "running": running, "ships": []}


def _completed_cursor(cursor: str | None) -> tuple[float, int] | None:
    if not cursor:
        return None
    if ":" in cursor:
        raw_ts, _, raw_id = cursor.partition(":")
        try:
            return float(raw_ts), int(raw_id)
        except ValueError:
            raise Refused(400, "Invalid before cursor.") from None
    try:
        return float("inf"), int(cursor)
    except ValueError:
        raise Refused(400, "Invalid before cursor.") from None


def completed_payload(ledger, *, before: str | None = None, limit: int = 50) -> dict:
    """CONTRACT GET /completed (and completed-items.js normalize): finished or dropped requests (goals)."""
    reqs, _ = request_map(ledger)
    work_by_req: dict[int, list] = {}
    for row in ledger.work():
        work_by_req.setdefault(row["request_id"], []).append(row)
    with ledger._read() as db:
        done_times = {row["task_id"]: row["at"] for row in db.execute(
            "SELECT task_id, MAX(at) AS at FROM events "
            "WHERE task_id IS NOT NULL AND kind IN ('applied', 'pass', 'finished', 'dropped') GROUP BY task_id"
        ).fetchall()}
    receipts = ledger.receipts()
    items: list[tuple[float, int, dict]] = []
    for req_id, req in reqs.items():
        tasks = work_by_req.get(req_id)
        if not tasks or not all(row["state"] in TERMINAL_TASKS for row in tasks):
            continue
        status = "dropped" if all(row["state"] == "dropped" for row in tasks) else "done"
        created_ts = req["at"] or min((row["started"] for row in tasks if row["started"] is not None), default=0.0)
        done_candidates = [t for row in tasks for t in (done_times.get(row["id"]), row["ended"]) if t is not None]
        done_ts = max(done_candidates) if done_candidates else created_ts
        created_iso, done_iso = _iso(created_ts), _iso(done_ts)
        summaries = []
        for row in tasks:
            rec = receipts.get(row["id"])
            if rec is not None:
                summaries.append(f"{row['title']} ({rec['target']} {rec['candidate'][:7]})")
            else:
                summaries.append(f"{row['title']} ({row['state']})")
        entry = {
            "id": req_id,
            "goal_id": req_id,
            "title": headline(req["text"]),
            "status": status,
            "done_at": done_iso,
            "created_at": created_iso,
            "request_id": req_id,
            "request_text": req["text"],
            "request_at": created_iso,
            "result": "; ".join(summaries),
            "requests": [{
                "id": req_id,
                "at": created_iso,
                "owner_text": req["text"],
                "request_text": req["text"],
                "how": "origin",
                "status": status,
            }],
        }
        items.append((done_ts, req_id, entry))
    items.sort(key=lambda pair: (pair[0], pair[1]), reverse=True)
    total = len(items)
    counts = {
        "done": sum(1 for _, _, item in items if item["status"] == "done"),
        "dropped": sum(1 for _, _, item in items if item["status"] == "dropped"),
    }
    cursor = _completed_cursor(before)
    if cursor is not None:
        c_ts, c_id = cursor
        items = [pair for pair in items if (pair[0], pair[1]) < (c_ts, c_id)]
    has_more = len(items) > limit
    page = items[:limit]
    next_cursor = f"{page[-1][0]}:{page[-1][1]}" if has_more and page else None
    return {
        "ok": True,
        "items": [item for _, _, item in page],
        "total": total,
        "counts": counts,
        "has_more": has_more,
        "next": next_cursor,
    }


def project_status(state: str) -> str:
    return {
        "running": "executing",
        "shipped": "done",
        "verified": "done",
        "dropped": "dropped",
        "stuck": "blocked",
        "queued": "open",
        "reported": "done_candidate",
    }.get(state, state)


def goal_status(tasks: list, waiting_cards: bool) -> str:
    if waiting_cards:
        return "awaiting_approval"
    if not tasks:
        return "received"
    states = {row["state"] for row in tasks}
    if states <= TERMINAL_TASKS:
        return "dropped" if states == {"dropped"} else "done"
    if "running" in states:
        return "executing"
    if "stuck" in states:
        return "blocked"
    return "in_progress"


def _timeline_event(row, *, tasks: dict[int, dict], latest_run: dict[int, int],
                    schedules: dict[int, dict], applied: dict[int, list[int]]) -> dict:
    """Translate one public ledger event row into the timeline event shape."""
    kind = row["kind"]
    data = _loads(row["data"], {})
    data = data if isinstance(data, dict) else {}
    task_id = row["task_id"]
    task = tasks.get(task_id) if task_id is not None else None
    goal_id = row["request_id"] if row["request_id"] is not None else (task["request_id"] if task else None)
    run_id = data.get("run") if isinstance(data.get("run"), int) else (latest_run.get(task_id) if task_id else None)
    agent_id = f"run-{run_id}" if run_id is not None else ("lead" if row["role"] == Role.LEAD else None)
    sched = schedules.get(task["schedule_id"]) if task and task["schedule_id"] is not None else None
    detail = row["detail"]

    mapped_kind, summary = kind, detail
    if kind == "started":
        mapped_kind = "agent.turn_started"
        agent = _agent_label(data.get("agent"))
        prefix = f"Schedule ({sched['title']}) started {agent}" if sched else f"Started {agent}"
        summary = f"{prefix} on {task['title']}" if task else f"{prefix}: {detail}"
        carried = applied.get(task_id, []) if task_id is not None else []
        if carried:
            summary += " · " + ", ".join(f"lesson L{lid} applied" for lid in carried)
    elif kind == "finished":
        mapped_kind = "agent.child_completed"
        summary = f"Schedule ({sched['title']}) finished: {detail}" if sched else detail
    elif kind == "stuck":
        mapped_kind = "report.blocked"
    elif kind == "stopped":
        mapped_kind = "agent.turn_ended"
    elif kind == "pass":
        mapped_kind = "report.progress"
        if sched:
            summary = f"Schedule verified ({sched['title']}): {detail}"
        else:
            summary = f"Verified ({task['title']}): {detail}" if task else f"Verified: {detail}"
    elif kind == "applied":
        mapped_kind = "agent.goal_finished"
        if sched:
            summary = f"Schedule shipped ({sched['title']}): {detail}"
        else:
            summary = f"Shipped ({task['title']}): {detail}" if task else f"Shipped: {detail}"
    elif kind in ("schedule.fired", "schedule.late"):
        note = " (late)" if kind == "schedule.late" else ""
        summary = f"Schedule ran{note}: {detail}"
    elif kind == "lesson.active":
        mapped_kind = "report.lesson"
        lid = data.get("lesson")
        summary = f"learned L{lid}: {detail}" if lid is not None else f"learned: {detail}"
    elif kind in ("lesson.added", "lesson.retired", "lesson.unproven"):
        mapped_kind = "report.lesson"
        lid = data.get("lesson")
        state = kind.split(".", 1)[1]
        summary = f"L{lid} ({state}): {detail}" if lid is not None else detail
    elif kind == "request":
        mapped_kind = "request.logged"
    elif kind == "card.opened":
        mapped_kind = "approval.requested"
    elif kind == "note":
        mapped_kind = "project.note" if task_id is not None else "goal.note"
    elif kind == "reported":
        mapped_kind = "report.progress"
    elif kind in ("reject", "red", "stale"):
        mapped_kind = "report.incident"
    elif kind == "dropped":
        mapped_kind = "project.status"
        summary = f"dropped: {detail}"

    return {
        "id": row["id"],
        "at": _iso(row["at"]),
        "kind": mapped_kind,
        "actor": ACTOR_NAMES.get(row["role"], row["role"]),
        "goal_id": goal_id,
        "project_id": task_id,
        "agent_id": agent_id,
        "summary": summary,
    }


def timeline_payload(ledger, *, start_ms: float | None = None, end_ms: float | None = None,
                     after: int = 0, limit: int = 500) -> dict:
    """CONTRACT GET /timeline (and tl-data.js createHistory): windowed events plus goal/project/agent metadata."""
    start_s = None if start_ms is None else start_ms / 1000.0
    end_s = None if end_ms is None else end_ms / 1000.0
    sql, args = "SELECT * FROM events WHERE id > ?", [after]
    if start_s is not None:
        sql, args = sql + " AND at >= ?", [*args, start_s]
    if end_s is not None:
        sql, args = sql + " AND at <= ?", [*args, end_s]
    sql += " ORDER BY id LIMIT ?"
    with ledger._read() as db:
        raw_events = db.execute(sql, [*args, limit + 1]).fetchall()
        through_id = db.execute("SELECT COALESCE(MAX(id), 0) AS id FROM events").fetchone()["id"]
        runs = db.execute("SELECT * FROM runs ORDER BY id").fetchall()
        task_times = {row["task_id"]: (row["first_at"], row["last_at"]) for row in db.execute(
            "SELECT task_id, MIN(at) AS first_at, MAX(at) AS last_at FROM events "
            "WHERE task_id IS NOT NULL GROUP BY task_id"
        ).fetchall()}
        req_times = {row["request_id"]: (row["first_at"], row["last_at"]) for row in db.execute(
            "SELECT request_id, MIN(at) AS first_at, MAX(at) AS last_at FROM events "
            "WHERE request_id IS NOT NULL GROUP BY request_id"
        ).fetchall()}
        has_lead = bool(db.execute("SELECT 1 FROM events WHERE role = 'lead' LIMIT 1").fetchone()
                        or db.execute("SELECT 1 FROM sessions LIMIT 1").fetchone())
    has_more = len(raw_events) > limit
    page = raw_events[:limit]

    reqs, task_requests = request_map(ledger)
    work_rows = ledger.work()
    tasks = {row["id"]: dict(row) for row in work_rows}
    schedules = {row["id"]: dict(row) for row in ledger.schedules()}
    applied = lessons.applied(ledger)
    latest_run: dict[int, int] = {}
    for run in runs:
        latest_run[run["task_id"]] = run["id"]

    mapped_events = [
        _timeline_event(row, tasks=tasks, latest_run=latest_run, schedules=schedules, applied=applied)
        for row in page
    ]
    counts: dict[str, int] = {}
    for ev in mapped_events:
        counts[ev["kind"]] = counts.get(ev["kind"], 0) + 1

    waiting_goals = {goal_of(ledger, card, task_requests) for card in ledger.cards(state="waiting")}
    projects_by_goal: dict[int, list[dict]] = {}
    projects_list: list[dict] = []
    for row in work_rows:
        first_at, last_at = task_times.get(row["id"], (row["started"], row["ended"] or row["started"]))
        proj = {
            "id": row["id"],
            "goal_id": row["request_id"],
            "title": row["title"],
            "status": project_status(row["state"]),
            "schedule_id": row["schedule_id"],
            "created_at": _iso(first_at),
            "updated_at": _iso(last_at or first_at),
        }
        projects_list.append(proj)
        projects_by_goal.setdefault(row["request_id"], []).append(proj)

    work_by_goal: dict[int, list] = {}
    for row in work_rows:
        work_by_goal.setdefault(row["request_id"], []).append(row)
    goals_list: list[dict] = []
    for req_id, req in reqs.items():
        first_at, last_at = req_times.get(req_id, (req["at"], req["at"]))
        goals_list.append({
            "id": req_id,
            "title": headline(req["text"]),
            "status": goal_status(work_by_goal.get(req_id, []), req_id in waiting_goals),
            "created_at": _iso(first_at),
            "updated_at": _iso(last_at or first_at),
            "projects": projects_by_goal.get(req_id, []),
        })

    agents_list: list[dict] = []
    if has_lead:
        agents_list.append({
            "id": "lead",
            "role": "lead",
            "title": "Lead",
            "host": "local",
            "status": "active",
            "busy": False,
            "created_at": _iso(page[0]["at"]) if page else None,
            "last_turn_at": _iso(page[-1]["at"]) if page else None,
        })
    agents_list += [worker_agent(run["id"], run["agent"], run["started"], run["ended"], tasks.get(run["task_id"]))
                    for run in runs]

    revision = str(through_id)
    return {
        "ok": True,
        "schema_version": 1,
        "revision": revision,
        "events": mapped_events,
        "agents": agents_list,
        "goals": goals_list,
        "truncated": has_more,
        "next": str(mapped_events[-1]["id"]) if has_more and mapped_events else None,
        "has_more": has_more,
        "metadata": {"goals": goals_list, "projects": projects_list, "agents": agents_list},
        "owner_intervals": {"items": []},
        "counts": counts,
        "coverage": {"event_set_revision": revision},
        "window": {
            "start": int(start_ms) if start_ms is not None else 0,
            "end": int(end_ms) if end_ms is not None else 0,
            "through_id": through_id,
        },
    }


def approves_here(handler, kind: str) -> bool:
    """Whether this device may approve a card of this kind: a kind the setup left to the phone, only a paired phone."""
    return kind not in handler.phone_only() or (handler.device is not None and bool(handler.device["phone"]))


# Route handlers

def get_approval(handler, key: str) -> None:
    """One approval as this device sees it: approve_here is false where only a paired phone may say yes."""
    row = handler.found(handler.ledger.card, int(key))
    if row["kind"] not in INTERRUPTS and row["kind"] != "choice":
        raise Refused(404, "There is no such approval.")
    handler.send_json({**approval_json(handler.ledger, row), "approve_here": approves_here(handler, row["kind"])})


def decide_approval(handler, key: str) -> None:
    data = handler.body()
    verdict = data.get("verdict")
    if verdict not in ("approve", "deny"):
        raise Refused(400, "verdict must be approve or deny.")
    provided = data.get("scope_hash")
    if not isinstance(provided, str) or not provided.strip():
        raise Refused(400, "scope_hash is required.")
    updated = decide_card(handler, int(key), verdict == "approve",
                          standing=bool(data.get("standing")), expected_hash=provided)
    shown = approval_json(handler.ledger, updated,
                          reason=str(data.get("reason") or "") or None,
                          comment=str(data.get("comment") or "") or None)
    handler.send_json({**shown, "ok": True, "approval": shown})


def get_questions(handler) -> None:
    now = time.time()
    messages, notes, comments, last_lead = _question_aux(handler.ledger)
    choices = [row for row in handler.ledger.cards() if row["kind"] == "choice"]
    items = [question_json(row, messages=messages, notes=notes, comments=comments, now=now) for row in choices]
    timestamps = [messages[row["id"]]["at"] if row["id"] in messages else row["created"] for row in choices]
    if last_lead is not None:
        timestamps.append(last_lead)
    latest = _iso(max(timestamps)) if timestamps else None
    handler.send_json({"latest": latest, "items": items, "refused": []})


def answer_question(handler, key: str) -> None:
    card_id = int(key)
    row = handler.found(handler.ledger.card, card_id)
    if row["kind"] != "choice":
        raise Refused(404, "There is no such question.")
    data = handler.body()
    picks = data.get("picks")
    option_raw = data.get("option")
    comment = str(data.get("comment") or "").strip()
    if not comment and isinstance(data.get("comments"), list):
        comment = " · ".join(str(part).strip() for part in data["comments"] if str(part).strip())
    has_pick = (isinstance(picks, list) and len(picks) > 0) or (isinstance(option_raw, str) and bool(option_raw.strip()))
    handler.ledger.expire_cards()
    row = handler.ledger.card(card_id)
    if not has_pick:
        if row["state"] != "waiting":
            messages, notes, comments, _ = _question_aux(handler.ledger)
            handler.send_json(question_json(row, messages=messages, notes=notes, comments=comments))
            return
        if not comment:
            raise Refused(400, "Provide a pick or a comment.")
        handler.ledger.record(Role.OWNER, "question.note", comment[:1000], project=row["project_id"],
                              request=row["request_id"], task=row["task_id"], card=row["id"])
    else:
        if row["state"] == "expired":
            raise Refused(409, "This card expired before you answered it. Nothing ran.")
        if row["state"] != "waiting":
            raise Refused(409, "This card is no longer waiting for you.")
        wanted = str(picks[0]).strip() if isinstance(picks, list) and picks else str(option_raw).strip()
        raw_options = _loads(row["options"], [])
        option_id = _resolve_choice_pick(raw_options, wanted)
        if option_id is None:
            valid = ", ".join(choice_spec(row["what"], raw_options)["options"])
            raise Refused(400, f"Choose one of: {valid}.")
        choose_card(handler, card_id, option_id, comment=comment or None)
    updated = handler.ledger.card(card_id)
    messages, notes, comments, _ = _question_aux(handler.ledger)
    handler.send_json(question_json(updated, messages=messages, notes=notes, comments=comments))


def db_read(handler) -> None:
    kind = handler.query.get("kind", [""])[0].strip()
    raw_id = handler.query.get("id", [""])[0].strip()
    if kind == "owner_steps":
        if raw_id:
            card_id = _int_param(handler, "id")
            row = handler.found(handler.ledger.card, card_id)
            if row["kind"] not in STEPS:
                raise Refused(404, "There is no such owner step.")
            handler.send_json({"ok": True, "item": step_json(handler.ledger, row)})
            return
        _, task_requests = request_map(handler.ledger)
        items = [step_json(handler.ledger, row, task_requests=task_requests)
                 for row in handler.ledger.cards() if row["kind"] in STEPS]
        handler.send_json({"ok": True, "items": items})
        return
    if kind == "approvals":
        reqs, task_requests = request_map(handler.ledger)
        if raw_id:
            card_id = _int_param(handler, "id")
            row = handler.found(handler.ledger.card, card_id)
            if row["kind"] not in INTERRUPTS:
                raise Refused(404, "There is no such approval.")
            handler.send_json({"ok": True, "item": approval_json(handler.ledger, row, reqs=reqs,
                                                                 task_requests=task_requests)})
            return
        items = [approval_json(handler.ledger, row, reqs=reqs, task_requests=task_requests)
                 for row in handler.ledger.cards() if row["kind"] in INTERRUPTS]
        handler.send_json({"ok": True, "items": items})
        return
    if kind == "conversation":      # the message that asked a question: its links are the question's materials
        row = handler.found(handler.ledger.message, _int_param(handler, "id"))
        handler.send_json({"ok": True, "item": {"id": row["id"], "role": row["role"], "text": row["text"],
                                                "at": _iso(row["at"])}})
        return
    raise Refused(400, "kind must be owner_steps, approvals or conversation.")


def owner_step_done(handler, key: str) -> None:
    card_id = int(key)
    row = handler.found(handler.ledger.card, card_id)
    if row["kind"] not in STEPS:
        raise Refused(404, "There is no such owner step.")
    if row["kind"] == "secret":
        raise Refused(409, "This clears when the secret is saved in its card: Open goes there.")
    data = handler.body()
    handler.ledger.step_done(Role.OWNER, card_id, quiet=bool(data.get("quiet")))
    updated = handler.ledger.card(card_id)
    handler.send_json({"ok": True, "item": step_json(handler.ledger, updated)})


def get_runs(handler) -> None:
    handler.send_json(runs_payload(handler.ledger))


def get_completed(handler) -> None:
    before = handler.query.get("before", [""])[0].strip() or None
    limit = _int_param(handler, "limit", 50, minimum=1, maximum=200)
    handler.send_json(completed_payload(handler.ledger, before=before, limit=limit))


def get_timeline(handler) -> None:
    start_ms = _float_param(handler, "start")
    end_ms = _float_param(handler, "end")
    after = _int_param(handler, "after", 0, minimum=0)
    limit = _int_param(handler, "limit", 500, minimum=1, maximum=2000)
    handler.send_json(timeline_payload(handler.ledger, start_ms=start_ms, end_ms=end_ms, after=after, limit=limit))


ROUTES = (
    ("GET", r"/approvals/(\d+)", get_approval),
    ("POST", r"/approvals/(\d+)/decide", decide_approval),
    ("GET", r"/questions", get_questions),
    ("POST", r"/questions/(\d+)/answer", answer_question),
    ("GET", r"/db/read", db_read),
    ("POST", r"/owner-steps/(\d+)/done", owner_step_done),
    ("GET", r"/runs", get_runs),
    ("GET", r"/completed", get_completed),
    ("GET", r"/timeline", get_timeline),
)

FRAMES = {}     # dashboard and owner_views (frames.py) carry turn() and groups(); any ledger event refreshes them
