"""The App's core frames on GET /events: the home's names and the panels it serves (home.settings), what the home is
doing (dashboard, and owner_views for the Workspace) and the words the App uses for states (status.labels), built from
the ledger and the home's config. wire.py says how frames plug in.

The App draws goals with projects and agents under them. In a home these are what the person asked (a request),
the tasks the lead split it into, and the runs that work on them; this computer is the one host.
"""

from datetime import datetime, timezone
import os
import shutil
import time
import uuid

from ..agents import LABELS
from ..roles import INTERRUPTS
from . import owner

DAY_S = 24 * 3600
EPOCH = uuid.uuid4().hex[:12]          # owner_views revisions count from this start of the home
HOST = "local"
FACT_STATE = {"awaiting_approval": "owner", "executing": "running", "received": "waiting", "done": "done",
              "dropped": "done"}     # the Workspace's dot for a goal's status
ASK_STATE = {"owner": "Your turn", "running": "Running", "blocked": "Blocked", "waiting": "Waiting", "idle": "Lead's turn"}
ENDED = ("done", "dropped")
PROJECT_STATE = {"running": "running", "stuck": "warning", "verified": "done", "shipped": "done",
                 "dropped": "done"}  # a task's state as Status draws its node; the rest wait their turn (idle)
# The App's panels this server serves; the App leaves out every other panel, route and menu item.
CAPABILITIES = ("chat", "approvals", "boards", "answers", "workspace", "network", "setup", "settings")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_of_day() -> float:
    """Midnight today on this computer's clock: where the day's counts start."""
    now = time.localtime()
    return time.mktime((now.tm_year, now.tm_mon, now.tm_mday, 0, 0, 0, 0, 0, -1))


def iso(at: float | None) -> str | None:
    return datetime.fromtimestamp(at, timezone.utc).isoformat() if at else None


def labels(server, query) -> dict:
    """The words the App shows for each state; the person's own turn says so."""
    return {"received": "Received", "planning": "Planning", "awaiting_approval": "Your turn",
            "executing": "Running", "done_candidate": "Checking", "done": "Done", "blocked": "Blocked",
            "blocked_on_owner": "Your turn", "awaiting_owner": "Your turn", "paused": "Paused",
            "dropped": "Dropped", "merged": "Merged", "open": "Open", "in_progress": "In progress"}


def settings(server, query) -> dict:
    """The names the App says, its language and the panels it shows; it opens every stream, so the first paint
    already has them."""
    lead = server.home.config.lead
    return {"lead": {"name": lead.name or "Lead", "role": "lead"}, "user": {"name": lead.you or "You"},
            "lang": "en", "capabilities": list(CAPABILITIES)}


class Home:
    """One read of the ledger for one frame: requests as goals, tasks as their projects, runs as agents.
    The statuses are owner.py's, so the dashboard, the timeline and My turn agree."""

    def __init__(self, server):
        ledger = server.home.ledger
        self.server, self.ledger = server, ledger
        self.reqs, self.task_requests = owner.request_map(ledger)
        self.requests = list(self.reqs.values())
        self.work = ledger.work()
        self.cards = ledger.cards()
        self.asked = {row["id"]: row["at"] for row in self.requests}
        self.tasks = {row["id"]: [work for work in self.work if work["request_id"] == row["id"]]
                      for row in self.requests}
        self.waiting = {owner.goal_of(ledger, card, self.task_requests) for card in self.cards
                        if card["state"] == "waiting"}

    def status(self, request: int) -> str:
        return owner.goal_status(self.tasks[request], request in self.waiting)

    def updated(self, request: int) -> float | None:
        times = [work["ended"] or work["started"] for work in self.tasks[request] if work["started"]]
        return max(times + [self.asked[request] or 0]) or None

    def project(self, work) -> dict:
        return {"id": work["id"], "goal_id": work["request_id"], "title": work["title"],
                "status": owner.project_status(work["state"]), "host": HOST, "blocked": work["note"] if work["state"] == "stuck"
                else None, "opened_at": iso(work["started"]), "closed_at": iso(work["ended"]),
                "seat": LABELS.get(work["agent"] or work["provider"]),
                "network_state": PROJECT_STATE.get(work["state"], "idle")}

    def request_row(self, row) -> dict:
        status = self.status(row["id"])
        return {"id": row["id"], "at": iso(self.asked[row["id"]]), "channel": row["source"], "role": "owner",
                "owner_text": row["text"], "status": "done" if status in ("done", "dropped") else "in_progress",
                "goal_id": row["id"], "closed_at": None, "goals": [{"id": row["id"], "how": "origin"}]}

    def goal(self, row) -> dict:
        title = owner.headline(row["text"]) or f"Request {row['id']}"
        return {"id": row["id"], "request_id": row["id"], "title": title, "short_name": title,
                "intent": row["text"], "status": self.status(row["id"]), "created_at": iso(self.asked[row["id"]]),
                "updated_at": iso(self.updated(row["id"])), "projects": [self.project(work) for work in self.tasks[row["id"]]],
                "requests": [{"id": row["id"], "at": iso(self.asked[row["id"]]), "owner_text": row["text"],
                              "how": "origin", "status": self.request_row(row)["status"]}]}

    def fact(self, row) -> dict:
        status = self.status(row["id"])
        running = sum(1 for work in self.tasks[row["id"]] if work["state"] == "running")
        state = FACT_STATE.get(status, "idle")
        urgency = 5 if state == "done" else 0 if state == "owner" else 1 if running else 2
        return {"id": row["id"], "key": f"goal:{row['id']}", "status": status, "state": state, "urgency": urgency,
                "is_running": urgency < 3, "place": "live", "attention_reasons": [], "done_at": None,
                "active_worker_count": running}

    def live(self) -> list[dict]:
        """The requests still open, each with whose move it is (Admin's work list)."""
        rows = []
        for row in self.requests:
            fact = self.fact(row)
            kind = "blocked" if fact["status"] == "blocked" else fact["state"]
            if kind != "done":
                rows.append({**self.request_row(row), "status_bucket": "in_progress", "is_live": True,
                             "is_terminal": False, "state": {"kind": kind, "label": ASK_STATE[kind]}})
        return rows

    def agents(self) -> list[dict]:
        lead = self.server.home.lead
        saying = bool(lead and lead.saying)
        rows = [{"id": "lead", "title": settings(self.server, {})["lead"]["name"], "role": "lead", "host": HOST,
                 "status": "active", "busy": saying, "network_state": "running" if saying else "idle",
                 "goal_id": None, "project_id": None, "parent_id": None, "created_at": None, "last_turn_at": None}]
        return rows + [owner.worker_agent(work["run_id"], work["agent"], work["started"], None, work)
                       for work in self.work if work["run_id"] and work["ended"] is None]

    def host(self) -> dict:
        busy = sum(1 for work in self.work if work["state"] == "running")
        disk = shutil.disk_usage(self.server.home.paths.root)
        load = os.getloadavg()[0] if hasattr(os, "getloadavg") else 0.0
        return {"id": 1, "kind": "host", "key": HOST, "label": "This computer", "at": now(), "state": "online",
                "label_text": "Online", "health": "ok", "online": True, "muted": False, "last_report_at": now(),
                "occupancy": {"active": busy + 1, "busy": busy}, "running_jobs": sum(
                    1 for job in self.ledger.jobs() if job["ended"] is None),
                "data": {"cpus": os.cpu_count() or 1, "load": round(load, 2), "mem_free_gb": memory_free_gb(),
                         "disk_used_pct": round(100 * disk.used / disk.total, 1)}}

    def today(self) -> list[dict]:
        since = time.time() - DAY_S
        rows = [row for row in self.ledger.latest_events(200) if row["at"] >= since]
        return [{"id": row["id"], "at": iso(row["at"]), "kind": row["kind"], "actor": row["role"],
                 "goal_id": row["request_id"], "project_id": row["task_id"], "agent_id": None,
                 "summary": row["detail"], "data": {}} for row in rows]

    def pending(self) -> list[dict]:
        """The approvals waiting for the person, as GET /approvals/:id gives each."""
        return [owner.approval_json(self.ledger, card, reqs=self.reqs, task_requests=self.task_requests)
                for card in self.cards if card["kind"] in INTERRUPTS and card["state"] == "waiting"]

    def approvals(self) -> dict:
        week = time.time() - 7 * DAY_S
        asks = [card for card in self.cards if card["kind"] in INTERRUPTS]
        return {"pending_all": sum(card["state"] == "waiting" for card in asks),
                "pending_owner": sum(card["state"] == "waiting" for card in asks),
                "decided_7d": sum(bool(card["decided"]) and card["decided"] >= week for card in asks),
                "decided_since": iso(week)}


def memory_free_gb() -> float | None:
    """Free memory where the system tells it without another package (Linux); None elsewhere."""
    try:
        return round(os.sysconf("SC_AVPHYS_PAGES") * os.sysconf("SC_PAGE_SIZE") / 2 ** 30, 1)
    except (ValueError, OSError, AttributeError):
        return None


def dashboard(server, query) -> dict:
    home = Home(server)
    goals = [home.goal(row) for row in home.requests]
    requests = [home.request_row(row) for row in home.requests]
    agents = home.agents()
    host = home.host()
    busy = sum(agent["busy"] for agent in agents)
    turn, groups = owner.turn(home.ledger), owner.groups(home.ledger)
    facts, live = [home.fact(row) for row in home.requests], home.live()
    statuses = sorted({fact["status"] for fact in facts})
    return {"ok": True, "error": None, "fetched_at": now(), "dashboard": {
        "generated_at": now(), "presence": {"state": "awake", "updated_at": now(), "source": "local"},
        "goals": goals, "requests": requests, "approvals": home.pending(), "owner_turn": turn, "owner_groups": groups,
        "completed": owner.completed_payload(home.ledger),
        "agents": agents, "resources": {"hosts": [host], "seats": [], "gpu": [], "codex": None, "api": None,
                                        "antigravity": []},
        "owner_resources": {"source": "local", "host_counts": {"total": 1, "online": 1},
                            "populations": {"active": len(agents), "busy": busy}},
        "owner_work": {"source": "home", "as_of": now(), "owner_groups": groups, "requests": live,
                       "request_count": len(live),
                       "work_groups": [{"key": f"goal:{row['id']}", "kind": "goal", "id": row["id"],
                                        "request_ids": [row["id"]]} for row in live],
                       "work_group_count": len(live), "goals": facts, "goal_statuses": statuses,
                       "goal_counts": {status: sum(fact["status"] == status for fact in facts) for status in statuses},
                       "running_goal_count": sum(fact["state"] == "running" for fact in facts),
                       "attention": [], "attention_count": 0, "handling": [], "handling_count": 0,
                       "approvals": home.approvals()},
        "today": home.today(), "day": {**home.ledger.counts(start_of_day()), "since": iso(start_of_day())},
        "host_labels": {HOST: "This computer"}}}


def owner_views(server, query) -> dict | None:
    """The Workspace's view of the ledger; only a stream that asked for it (ide=...) gets it."""
    if "ide" not in query:
        return None
    home = Home(server)
    server.views_revision = getattr(server, "views_revision", 0) + 1
    host = home.host()
    return {"ok": True, "version": 1, "epoch": EPOCH, "revision": server.views_revision, "fetched_at": now(),
            "state": "ready", "error": None, "ledgers": {
                "goals": [{"id": row["id"], "title": home.goal(row)["title"], "status": home.status(row["id"]),
                           "state": home.fact(row)["state"], "place": "live",
                           "updated_at": iso(home.updated(row["id"])), "created_at": iso(home.asked[row["id"]])}
                          for row in home.requests],
                "requests": [{"id": row["id"], "at": iso(home.asked[row["id"]]), "owner_text": row["text"],
                              "status": home.request_row(row)["status"], "goal_ids": [row["id"]]}
                             for row in home.requests],
                "approvals": home.pending(),
                "resources": [{"kind": "host", "key": HOST, "label": host["label"], "status": "ok", "at": host["at"],
                               "state": "online", "state_text": "Online", "state_en": "Online", "online": True,
                               "available": True, "controller": True, "occupancy": host["occupancy"],
                               "running_jobs": host["running_jobs"], "eco": False}]},
            "turn": owner.turn(home.ledger), "owner_groups": owner.groups(home.ledger)}


ROUTES = ()
FRAMES = {"home.settings": settings, "status.labels": labels, "dashboard": dashboard, "owner_views": owner_views}
REFRESH = {"": ("dashboard", "owner_views"),    # any change in the ledger can change what the home is doing
           "setup.changed": ("home.settings",)}
