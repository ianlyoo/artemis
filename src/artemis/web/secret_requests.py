"""Secret-request cards for the Artemis App (`/secret-requests/*`).

Each external id is an opaque 32-hex identifier mapped to a `cards(kind='secret')` row in the `secret_requests`
table. Values go directly through `handler.store_secret` and `handler.vault` into the encrypted vault; only the
character length is recorded in the ledger, and no value is ever returned, logged, or stored in SQLite.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import re
import secrets
import threading
import time

from ..ledger import SECRET_NAME
from ..roles import Role, WorkflowError
from .wire import Refused


DEFAULT_TTL_S = 24 * 3600
_LOCK = threading.Lock()
LABEL_MAX = 60
HEX32 = re.compile(r"[0-9a-f]{32}")
SECRET_PREFIXES = ("sk-", "pk_", "ghp_", "gho_", "ghu_", "ghs_", "github_pat_", "akia", "xoxb-", "xoxp-",
                   "aiza", "glpat-", "-----begin ")


def _iso(stamp: float) -> str:
    return datetime.fromtimestamp(stamp, timezone.utc).isoformat()


@contextmanager
def _tx(ledger, write: bool = False):
    with ledger._connect() as db, db:
        db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield db


def _card_options(card) -> dict:
    return json.loads(card["options"]) if card["options"] else {}


def _looks_like_secret(label: str) -> bool:
    """Catch a secret value pasted into the name field by mistake."""
    lowered = label.lower()
    if any(lowered.startswith(prefix) for prefix in SECRET_PREFIXES):
        return True
    if " " not in label and len(label) >= 24:
        has_lower = any(ch.islower() for ch in label)
        has_upper = any(ch.isupper() for ch in label)
        has_digit = any(ch.isdigit() for ch in label)
        if has_lower and (has_upper or has_digit):
            return True
    return False


def _derive_name(label: str) -> str:
    """Derive a valid uppercase vault SECRET_NAME from a human label."""
    parts = re.findall(r"[A-Za-z0-9]+", label.upper())
    candidate = "_".join(parts)[:64]
    if candidate and candidate[0].isalpha() and SECRET_NAME.fullmatch(candidate):
        return candidate
    suffix = hashlib.sha256(label.encode("utf-8")).hexdigest()[:8].upper()
    if candidate:
        return f"SECRET_{candidate[:55]}_{suffix}"[:64]
    return f"SECRET_{suffix}"


def _serialize(row, card) -> dict:
    options = _card_options(card)
    state = row["state"]
    status = "deleted" if row["deleted_at"] is not None else state
    payload = {
        "id": row["id"],
        "key": options["name"],
        "label": row["label"],
        "reason": card["why"],
        "state": state,
        "status": status,
        "created_at": _iso(row["created_at"]),
        "expires_at": _iso(row["expires_at"]),
    }
    if row["length"] is not None and state != "deleted":
        payload["length"] = row["length"]
    if row["saved_at"] is not None:
        payload["saved_at"] = _iso(row["saved_at"])
    if row["deleted_at"] is not None:
        payload["deleted_at"] = _iso(row["deleted_at"])
    if state == "superseded":
        payload["superseded"] = True
    return payload


def _sync_row(db, row, card, now: float):
    """Keep an open secret request aligned with card expiry, cancellation, or a direct secret save."""
    state = row["state"]
    if state != "open":
        return row
    if card["state"] == "expired" or row["expires_at"] <= now:
        db.execute("UPDATE secret_requests SET state = 'expired' WHERE id = ?", (row["id"],))
        return db.execute("SELECT * FROM secret_requests WHERE id = ?", (row["id"],)).fetchone()
    if card["state"] == "declined":
        db.execute("UPDATE secret_requests SET state = 'cancelled' WHERE id = ?", (row["id"],))
        return db.execute("SELECT * FROM secret_requests WHERE id = ?", (row["id"],)).fetchone()
    if row["replaces_id"] is None and card["state"] == "done":
        saved_at = card["decided"] or now
        db.execute("UPDATE secret_requests SET saved_at = ?, state = 'saved' WHERE id = ?", (saved_at, row["id"]))
        return db.execute("SELECT * FROM secret_requests WHERE id = ?", (row["id"],)).fetchone()
    return row


def _ensure_card_row(db, card, now: float):
    existing = db.execute(
        "SELECT * FROM secret_requests WHERE card_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
        (card["id"],),
    ).fetchone()
    if existing is not None:
        return _sync_row(db, existing, card, now)
    options = _card_options(card)
    label = str(options.get("note") or options["name"])[:LABEL_MAX]
    created = float(card["created"])
    expires = float(card["expires"]) if card["expires"] is not None else created + DEFAULT_TTL_S
    state = {"waiting": "open", "done": "saved", "expired": "expired", "declined": "cancelled"}.get(
        card["state"], "expired"
    )
    if state == "open" and expires <= now:
        state = "expired"
    saved_at = card["decided"] if state == "saved" else None
    req_id = secrets.token_hex(16)
    db.execute(
        "INSERT INTO secret_requests(id, card_id, label, state, created_at, expires_at, saved_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (req_id, card["id"], label, state, created, expires, saved_at),
    )
    return db.execute("SELECT * FROM secret_requests WHERE id = ?", (req_id,)).fetchone()


def request_for_card(ledger, card_id: int) -> dict:
    """Return (creating if needed) the opaque 32-hex secret request mapped to a secret card."""
    ledger.expire_cards()
    now = time.time()
    with _tx(ledger, write=True) as db:
        card = db.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        if card is None or card["kind"] != "secret":
            raise WorkflowError("There is no such secret card.")
        row = _ensure_card_row(db, card, now)
    return _serialize(row, card)


def chat_links(ledger) -> dict[int, str]:
    """Where each secret card is answered: the App's address of its ```secret fence in the lead's chat, by the request
    the fence names. A card no fence names has no such place."""
    with ledger._read() as db:
        rows = db.execute("SELECT card_id, id FROM secret_requests ORDER BY created_at, rowid").fetchall()
    return {row["card_id"]: f"/#/lead/secret/{row['id']}" for row in rows}


def _load_request(handler, req_id: str):
    if not HEX32.fullmatch(req_id):
        raise Refused(404, "not_found", line="There is no such secret request.")
    handler.ledger.expire_cards()
    now = time.time()
    with _tx(handler.ledger, write=True) as db:
        row = db.execute("SELECT * FROM secret_requests WHERE id = ?", (req_id,)).fetchone()
        if row is None:
            raise Refused(404, "not_found", line="There is no such secret request.")
        card = db.execute("SELECT * FROM cards WHERE id = ?", (row["card_id"],)).fetchone()
        if card is None or card["kind"] != "secret":
            raise Refused(404, "not_found", line="There is no such secret request.")
        row = _sync_row(db, row, card, now)
    return row, card


def list_requests(handler) -> None:
    """GET /secret-requests: metadata for all secret requests, ensuring every secret card has an id."""
    handler.ledger.expire_cards()
    now = time.time()
    with _tx(handler.ledger, write=True) as db:
        cards = db.execute("SELECT * FROM cards WHERE kind = 'secret' ORDER BY id").fetchall()
        by_card = {card["id"]: card for card in cards}
        for card in cards:
            _ensure_card_row(db, card, now)
        rows = db.execute("SELECT * FROM secret_requests ORDER BY created_at ASC, rowid ASC").fetchall()
        items = [_serialize(_sync_row(db, row, by_card[row["card_id"]], now), by_card[row["card_id"]])
                 for row in rows if row["card_id"] in by_card]
    handler.send_json({"items": items})


def create_request(handler) -> None:
    """POST /secret-requests: create an owner-initiated secret request and its backing secret card."""
    data = handler.body()
    label = str(data.get("label", "")).strip()
    if not label or len(label) > LABEL_MAX:
        raise Refused(400, "invalid_label", line=f"Give this secret a name up to {LABEL_MAX} characters.")
    if _looks_like_secret(label):
        handler.hidden = (label,)
        raise Refused(422, "secret_detected", line="Enter only a short name here; put the value in the next step.")
    explicit = str(data.get("key") or data.get("name") or "").strip()
    if explicit:
        if not SECRET_NAME.fullmatch(explicit):
            raise Refused(400, "invalid_name", line="A secret's name uses capital letters, digits and _.")
        name = explicit
    else:
        name = _derive_name(label)
    use = str(data.get("use") or "env")
    kind = str(data.get("kind") or "none")
    origin = str(data.get("origin") or "").strip() or None
    if use not in ("env", "http"):
        raise Refused(400, "invalid_use", line="use must be env or http.")
    if kind not in ("none", "send", "spend"):
        raise Refused(400, "invalid_kind", line="kind must be none, send or spend.")
    if use == "http" and not origin:
        raise Refused(400, "invalid_origin", line="A website secret needs its origin.")
    if use == "env" and origin:
        raise Refused(400, "invalid_origin", line="Only a website secret has an origin.")
    reason = str(data.get("reason") or "").strip()
    now = time.time()
    expires = now + DEFAULT_TTL_S
    options = {"name": name, "use": use, "origin": origin, "kind": kind, "note": label}
    card_id = handler.ledger.open_card(Role.HOME, "secret", f"Add the secret {name}", reason,
                                       options=options, expires=expires)
    req_id = secrets.token_hex(16)
    with _tx(handler.ledger, write=True) as db:
        db.execute(
            "INSERT INTO secret_requests(id, card_id, label, state, created_at, expires_at) "
            "VALUES (?, ?, ?, 'open', ?, ?)",
            (req_id, card_id, label, now, expires),
        )
        row = db.execute("SELECT * FROM secret_requests WHERE id = ?", (req_id,)).fetchone()
        card = db.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    handler.send_json(_serialize(row, card), 201)


def get_request(handler, req_id: str) -> None:
    """GET /secret-requests/:id: return metadata without any secret value."""
    row, card = _load_request(handler, req_id)
    handler.send_json(_serialize(row, card))


def save_request(handler, req_id: str) -> None:
    """POST /secret-requests/:id/save: seal value into the vault via handler.store_secret, return only its length."""
    data = handler.body()
    raw_value = data.get("value")
    value = raw_value if isinstance(raw_value, str) else ""
    handler.hidden = (value,) if value else ()
    with _LOCK:
        row, card = _load_request(handler, req_id)
        if row["state"] != "open":
            raise Refused(409, "not_open", line="This secret request is no longer open.")
        if not (handler.server.tls or handler.loopback):
            raise Refused(403, "A secret is entered on this computer or over HTTPS only.")
        vault = handler.vault()
        wanted = _card_options(card)
        if row["replaces_id"] is None and vault.info(wanted["name"]) is not None:
            raise Refused(409, "key_taken", line="A secret with this name already exists in the vault.")
        handler.store_secret(wanted["name"], value, wanted.get("kind", "none"), str(wanted.get("note") or ""),
                             wanted.get("use") or "env", wanted.get("origin"))
        if card["state"] == "waiting":
            handler.ledger.secret_set(Role.OWNER, card["id"])
        else:
            handler.ledger.record(Role.OWNER, "secret.set", wanted["name"], project=card["project_id"],
                                  request=card["request_id"], task=card["task_id"], card=card["id"])
        now = time.time()
        length = len(value)
        with _tx(handler.ledger, write=True) as db:
            db.execute("UPDATE secret_requests SET state = 'saved', length = ?, saved_at = ? WHERE id = ?",
                       (length, now, row["id"]))
            if row["replaces_id"] is not None:
                db.execute("UPDATE secret_requests SET state = 'superseded' WHERE id = ?", (row["replaces_id"],))
            updated = db.execute("SELECT * FROM secret_requests WHERE id = ?", (row["id"],)).fetchone()
            card = db.execute("SELECT * FROM cards WHERE id = ?", (card["id"],)).fetchone()
    handler.send_json(_serialize(updated, card))


def replace_request(handler, req_id: str) -> None:
    """POST /secret-requests/:id/replace: reopen a saved secret request under a fresh opaque id."""
    row, card = _load_request(handler, req_id)
    if row["state"] == "superseded":
        raise Refused(409, "superseded", line="This secret request was already replaced.")
    if row["state"] != "saved":
        raise Refused(409, "not_saved", line="Only a saved secret request can be replaced.")
    now = time.time()
    expires = now + DEFAULT_TTL_S
    fresh_id = secrets.token_hex(16)
    with _tx(handler.ledger, write=True) as db:
        db.execute("UPDATE secret_requests SET state = 'cancelled' WHERE replaces_id = ? AND state = 'open'",
                   (row["id"],))
        db.execute(
            "INSERT INTO secret_requests(id, card_id, label, state, replaces_id, created_at, expires_at) "
            "VALUES (?, ?, ?, 'open', ?, ?, ?)",
            (fresh_id, card["id"], row["label"], row["id"], now, expires),
        )
        fresh = db.execute("SELECT * FROM secret_requests WHERE id = ?", (fresh_id,)).fetchone()
    handler.send_json(_serialize(fresh, card), 201)


def delete_request(handler, req_id: str) -> None:
    """POST /secret-requests/:id/delete: remove the secret from the vault and mark this request deleted."""
    with _LOCK:
        row, card = _load_request(handler, req_id)
        if row["state"] == "superseded":
            raise Refused(409, "superseded", line="This secret request was replaced by a newer value.")
        if row["state"] != "saved":
            raise Refused(409, "not_saved", line="Only a saved secret request can be deleted.")
        vault = handler.vault()
        wanted = _card_options(card)
        if vault.info(wanted["name"]) is not None:
            vault.remove(wanted["name"])
        now = time.time()
        with _tx(handler.ledger, write=True) as db:
            db.execute("UPDATE secret_requests SET state = 'deleted', deleted_at = ? WHERE id = ?", (now, row["id"]))
            db.execute("UPDATE secret_requests SET state = 'cancelled' WHERE replaces_id = ? AND state = 'open'",
                       (row["id"],))
            updated = db.execute("SELECT * FROM secret_requests WHERE id = ?", (row["id"],)).fetchone()
        handler.ledger.record(Role.OWNER, "secret.removed", wanted["name"], project=card["project_id"],
                              request=card["request_id"], task=card["task_id"], card=card["id"])
    handler.send_json(_serialize(updated, card))


ROUTES = (
    ("GET", r"/secret-requests", list_requests),
    ("POST", r"/secret-requests", create_request),
    ("GET", r"/secret-requests/([^/]+)", get_request),
    ("POST", r"/secret-requests/([^/]+)/save", save_request),
    ("POST", r"/secret-requests/([^/]+)/replace", replace_request),
    ("POST", r"/secret-requests/([^/]+)/delete", delete_request),
)
FRAMES = {}
REFRESH = {}
