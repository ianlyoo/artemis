"""The conversation with the lead in the App: the chat.* frames on GET /events and the /chat/* paths.

The App shows one thread, the person's with their lead. The lead's reply streams into it while it is written (the
lead runner's `saying` and its said.delta items) under the key the finished message keeps, so the streamed text is
replaced, not repeated. The chat's model picker chooses who leads: [agents] lead in the home's config.toml.
"""

from datetime import datetime, timezone
import json
import os
import time

from .. import agents
from ..config import HomeConfig, write_setting
from ..roles import Role
from . import chat_files
from .fences import segments
from .wire import Refused

LEAD = "lead"                 # the lead's agent id in the App
PAGE = 50                     # messages in a snapshot or one page of history
RECENT_S = 24 * 3600          # a worker that ended this long ago still shows in the roster
ROLES = {"you": ("user", "owner"), "lead": ("assistant", "lead"), "artemis": ("note", "system")}
IDLE = {"running": False, "phase": "idle", "activity": None, "line": None, "at": None, "turnKey": None}


def iso(at: float | None) -> str | None:
    return datetime.fromtimestamp(at, timezone.utc).isoformat() if at else None


def lead_name(home) -> str:
    return home.config.lead.name or "Lead"


def agent(home) -> dict:
    return {"id": LEAD, "title": lead_name(home)}


def item(server, row) -> dict:
    """One message as the App's chat item. A lead reply keeps its turn's key, the key it streamed under."""
    role, source = ROLES[row["role"]]
    found = {"key": f"turn:{row['turn']}" if row["turn"] else f"m{row['id']}", "role": role, "text": row["text"],
             "at": iso(row["at"]), "messageId": row["client"] or f"m{row['id']}", "source": source,
             "fromHome": row["role"] == "you", "streaming": False, "turnKey": row["turn"]}
    found["images"], found["attachments"] = chat_files.message_media(row["id"], row["attachments"])
    if role == "assistant":
        found["segments"] = segments(row["text"])
    return found


def writing(server) -> dict | None:
    """The lead's reply while it is being written, or None."""
    saying = server.home.lead.saying if server.home.lead else None
    if not saying or not saying["text"]:
        return None
    return {"key": f"turn:{saying['turn']}", "role": "assistant", "text": saying["text"], "at": iso(saying["at"]),
            "messageId": None, "source": "lead", "fromHome": False, "streaming": True, "turnKey": saying["turn"],
            "images": [], "attachments": [], "segments": segments(saying["text"], streaming=True)}


def turn(server) -> dict:
    saying = server.home.lead.saying if server.home.lead else None
    if not saying:
        return IDLE
    return {"running": True, "phase": "activity" if saying["text"] else "started",
            "activity": None if saying["text"] else {"kind": "thinking", "tool": None}, "line": None,
            "at": iso(saying["at"]), "turnKey": saying["turn"]}


def state(server, query=None) -> dict:
    running = turn(server)["running"]
    return {"state": "ready", "line": None, "agent": agent(server.home), "canSend": True,
            "controls": {"cancel": running, "rewind": False, "renew": False}, "renewing": False}


def page(server, before: int | None = None) -> dict:
    rows = server.home.ledger.messages(before=before, limit=PAGE)
    older = bool(rows) and bool(server.home.ledger.messages(before=rows[0]["id"], limit=1))
    return {"items": [item(server, row) for row in rows], "before": str(rows[0]["id"]) if older else None,
            "hasOlder": older}


def snapshot(server, query=None) -> dict:
    shown = page(server)
    streaming = writing(server)
    return {"reason": "connect", "agent": agent(server.home), "items": shown["items"] + ([streaming] if streaming else []),
            "before": shown["before"], "hasOlder": shown["hasOlder"], "turn": turn(server), "state": state(server),
            "queue": None}


# Who leads: the chat's model picker

def lead_choices(home) -> dict:
    """Who leads, how it was chosen, and every agent that could, each with why it cannot lead here yet."""
    chosen = home.config.agents.lead
    provider = agents.lead_provider(home.config, home.vault, home.ledger) if chosen == "auto" else chosen
    return {"chosen": chosen, "provider": provider, "label": agents.LABELS.get(provider, provider),
            "fixed": bool(os.environ.get("ARTEMIS_LEAD")),
            "choices": [{"provider": name, "label": agents.LABELS.get(name, name), "why": cannot_lead(home, name)}
                        for name in agents.LEADS]}


def cannot_lead(home, name: str) -> str | None:
    """Why this agent cannot lead here now, in a few words; None when it can (the rules lead_provider uses)."""
    if not agents.ready(name, home.config, home.vault):
        return ("needs a model and its key: Settings, API (or [api] in config.toml)" if name == "api"
                else "not installed or not signed in on this computer")
    if not agents.qualified(name, "lead", home.ledger):
        if agents.status(name, "lead", home.ledger) == "unqualified":
            return "did not qualify to lead here; run `artemis doctor providers` to try again"
        return "not qualified to lead yet: run `artemis doctor providers`"
    return None


def choose_lead(home, name: str) -> None:
    """Make name the lead: the [agents] lead line of the home's config.toml, read again so the next turn uses it."""
    if os.environ.get("ARTEMIS_LEAD"):
        raise Refused(409, "ARTEMIS_LEAD was set when Artemis started, and it decides who leads. "
                           "Start Artemis without it to choose here.")
    if name != "auto" and name not in agents.LEADS:
        raise Refused(400, f"There is no lead called {name!r}. Choose auto or one of: {', '.join(agents.LEADS)}.")
    why = None if name == "auto" else cannot_lead(home, name)
    if why:
        raise Refused(409, f"{agents.LABELS.get(name, name)} cannot lead yet: {why}.")
    if name != home.config.agents.lead:
        write_setting(home.paths.config, "agents", "lead", name)
        home.config = HomeConfig.load(home.paths)
        provider = agents.lead_provider(home.config, home.vault, home.ledger)
        label = agents.LABELS.get(provider, provider)
        said = f"Lead switched to {label}" if name != "auto" else f"Lead set to automatic, which is {label} now"
        home.ledger.record(Role.OWNER, "lead.switched", said, data={"lead": name, "provider": provider})


def settings(server, query=None) -> dict:
    lead = lead_choices(server.home)
    models = [{"id": "auto", "label": "Automatic", "thinking": []}] + [
        {"id": choice["provider"], "label": choice["label"], "thinking": []}
        for choice in lead["choices"] if choice["why"] is None]
    shown = next((model for model in models if model["id"] == lead["chosen"]), models[0])
    return {"agentId": LEAD, "model": {"id": shown["id"], "label": shown["label"]}, "thinking": None, "mode": None,
            "models": models, "modes": [], "loading": False, "canChange": not lead["fixed"]}


def roster(server, query=None) -> dict:
    """The lead and the workers running now or lately, newest first after the lead."""
    home, ledger = server.home, server.home.ledger
    said = [row for row in ledger.messages(limit=20) if row["role"] == "lead"]
    lead = lead_choices(home)
    rows = [{"id": LEAD, "displayName": lead_name(home), "role": "lead", "projectId": None, "goalId": None,
             "parentId": None, "provider": lead["provider"], "state": "running" if turn(server)["running"] else "idle",
             "lastActivityAt": iso(said[-1]["at"]) if said else None,
             "preview": said[-1]["text"][:120] if said else None, "unread": 0}]
    since = time.time() - RECENT_S
    for work in sorted(ledger.work(), key=lambda row: row["started"] or 0, reverse=True):
        if work["run_id"] is None or (work["ended"] is not None and work["ended"] < since):
            continue
        rows.append({"id": f"run-{work['run_id']}", "displayName": work["title"], "role": "worker",
                     "projectId": work["id"], "goalId": work["request_id"], "parentId": LEAD,
                     "provider": work["agent"], "state": "running" if work["ended"] is None else "ended",
                     "lastActivityAt": iso(work["ended"] or work["started"]), "preview": work["note"], "unread": 0})
    return {"agents": rows, "device": None}


# The paths

def number(handler, name: str) -> int | None:
    value = handler.query.get(name, [""])[0]
    if value and not value.isdigit():
        raise Refused(400, f"{name} is a message number.")
    return int(value) if value else None


def send(handler) -> None:
    """A message from the person to the lead. The App's id makes a repeat of the same send a no-op."""
    data = handler.body()
    text = str(data.get("text", "")).strip()
    client = str(data.get("id", "")).strip()[:64]
    if data.get("agentId") not in (None, "", LEAD):
        raise Refused(409, "Messages go to the lead; it directs the workers.")
    if not text or len(text) > 20000:
        raise Refused(400, "A message is between 1 and 20000 characters.")
    server = handler.server
    shown = f"home-{client}" if client else None
    if shown and handler.ledger.sent_by(shown) is not None:
        return handler.send_json({"ok": True, "messageId": shown})
    attachments = chat_files.prepare_attachments(server.home.paths, upload_ids=data.get("attachments"),
                                                 images=data.get("images"))
    message = server.say(text, attachments, client=shown)
    handler.send_json({"ok": True, "messageId": shown or f"m{message}"})


def cancel(handler) -> None:
    lead = handler.server.home.lead
    if lead is not None and lead.saying:
        lead.cancel.set()
    handler.send_json({"ok": True})


def history(handler) -> None:
    handler.send_json(page(handler.server, number(handler, "before")))


def one(handler) -> None:
    key = handler.query.get("key", [""])[0]
    for row in handler.ledger.messages(limit=500):
        if item(handler.server, row)["key"] == key:
            return handler.send_json(item(handler.server, row))
    raise Refused(404, "There is no such message.")


def thread(handler) -> None:
    """The lead's thread, or what one worker's run has done so far, as notes."""
    wanted = handler.query.get("agentId", [LEAD])[0] or LEAD
    server = handler.server
    if wanted == LEAD:
        shown = snapshot(server)
        return handler.send_json({"agentId": LEAD, **{key: shown[key] for key in
                                                       ("items", "before", "hasOlder", "turn", "state", "queue")}})
    if not wanted.startswith("run-") or not wanted[4:].isdigit():
        raise Refused(404, "There is no such agent.")
    work = next((row for row in handler.ledger.work() if row["run_id"] == int(wanted[4:])), None)
    if work is None:
        raise Refused(404, "There is no such agent.")
    notes = [{"key": f"e{row['id']}", "role": "note", "text": row["detail"], "at": iso(row["at"]), "messageId": None,
              "source": "system", "fromHome": False, "streaming": False, "turnKey": None, "images": [],
              "attachments": []} for row in handler.ledger.events(task=work["id"], limit=500)]
    handler.send_json({"agentId": wanted, "items": notes, "before": None, "hasOlder": False, "turn": IDLE,
                       "state": {**state(server), "agent": {"id": wanted, "title": work["title"]}, "canSend": False},
                       "queue": None})


def get_roster(handler) -> None:
    handler.send_json(roster(handler.server))


def get_settings(handler) -> None:
    handler.send_json(settings(handler.server))


def set_settings(handler) -> None:
    data = handler.body()
    if set(data) - {"model", "agentId"} or "model" not in data:
        raise Refused(400, "Only the model, which is who leads, is chosen here.")
    choose_lead(handler.server.home, str(data["model"]))
    handler.send_json({"ok": True, "settings": settings(handler.server)})


def said(server, row, query) -> list:
    message = json.loads(row["data"] or "{}").get("message")
    if not message:
        return []
    return [("chat.item", item(server, server.home.ledger.message(message)))]


def delta(server, data, query) -> list:
    streaming = writing(server)
    return [("chat.item", streaming)] if streaming else []


def turned(server, data, query) -> list:
    return [("chat.turn", turn(server)), ("chat.state", state(server)), ("chat.roster", roster(server))]


def earlier(handler) -> None:
    """Conversations from before this one: a home keeps one conversation, so /chat/history holds it all."""
    handler.send_json({"items": [], "next": None})


def agent_lists(key: str):
    """What the lead's own session offers beside the conversation: no commands, and no permission prompts of the
    provider's, since an action that needs the person's yes is an approval card here (My turn)."""
    def answer(handler) -> None:
        handler.send_json({"agentId": handler.query.get("agentId", [LEAD])[0], key: []})
    return answer


def no_permission(handler) -> None:
    raise Refused(409, "There is no such permission: approvals are cards in My turn.")


ROUTES = (
    ("POST", r"/chat/send", send), ("POST", r"/chat/cancel", cancel), ("GET", r"/chat/history", history),
    ("GET", r"/chat/item", one), ("GET", r"/chat/thread", thread), ("GET", r"/chat/roster", get_roster),
    ("GET", r"/chat/settings", get_settings), ("POST", r"/chat/settings", set_settings),
    ("GET", r"/chat/ledger", earlier), ("GET", r"/chat/commands", agent_lists("commands")),
    ("GET", r"/chat/permissions", agent_lists("permissions")), ("POST", r"/chat/permissions/decide", no_permission),
)
FRAMES = {"chat.state": state, "chat.snapshot": snapshot, "chat.settings": settings,
          "chat.notices": lambda server, query: {"notices": []}, "chat.roster": roster}
REFRESH = {"lead.switched": ("chat.settings", "chat.roster"), "started": ("chat.roster",),
           "reported": ("chat.roster",), "stuck": ("chat.roster",), "dropped": ("chat.roster",),
           "run": ("chat.roster",)}
EVENTS = {"said": said}
FEED = {"said.delta": delta, "turn.started": turned, "turn.ended": turned}
