"""Chat uploads, attachment serving, and the queued-message rail for the Artemis App.

Uploaded bytes are stored content-addressed under the home's data folder (`uploads/blobs/<sha[:2]>/<sha>`) with one
metadata file per upload id (`uploads/meta/<id>.json`). The message queue lives in the ledger's `chat_queue` table,
broadcasts `chat.queue` frames over GET /events on every change, and hands the oldest unheld item to the server's
`say` path via `drain(server)`.
"""

from __future__ import annotations

import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import time
from urllib.parse import quote
import uuid

from ..roles import Role, WorkflowError
from .wire import Refused


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_ATTACHMENTS = 5
MAX_TOTAL_BYTES = 50 * 1024 * 1024
MAX_IMAGES = 4
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_TEXT = 20_000
MAX_QUEUE = 20
DEFAULT_AGENT_ID = "lead"

HEX32 = re.compile(r"[0-9a-f]{32}")
HEX64 = re.compile(r"[0-9a-f]{64}")
MIME_RE = re.compile(r"[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*")

IMAGE_TYPES = frozenset({
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "image/avif", "image/heic", "image/heif", "image/bmp",
})
IMAGE_EXTS = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp",
    "image/avif": ".avif", "image/heic": ".heic", "image/heif": ".heif", "image/bmp": ".bmp",
}
ALLOWED_TYPES = IMAGE_TYPES | frozenset({
    "application/octet-stream",
    "application/pdf",
    "application/json",
    "application/rtf",
    "application/toml",
    "application/yaml",
    "application/zip",
    "application/gzip",
    "application/x-tar",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/tab-separated-values",
    "text/yaml",
    "audio/mpeg",
    "audio/wav",
    "audio/mp4",
    "audio/ogg",
    "audio/webm",
    "audio/x-m4a",
    "video/mp4",
    "video/quicktime",
    "video/webm",
})


def _iso(stamp: float) -> str:
    return datetime.fromtimestamp(stamp, timezone.utc).isoformat()


def _atomic_write(target: Path, data: bytes) -> None:
    """Write bytes to target through a sibling temporary file so readers never see partial content."""
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.parent / f".{target.name}.{secrets.token_hex(6)}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
        os.replace(tmp, target)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def _uploads_root(paths) -> Path:
    return paths.root / "uploads"


def blob_path(paths, digest: str) -> Path:
    """Path for a content-addressed blob under the home's data folder."""
    if not HEX64.fullmatch(digest):
        raise ValueError("Invalid content hash.")
    return _uploads_root(paths) / "blobs" / digest[:2] / digest


def _meta_path(paths, upload_id: str) -> Path:
    if not HEX32.fullmatch(upload_id):
        raise ValueError("Invalid upload id.")
    return _uploads_root(paths) / "meta" / f"{upload_id}.json"


def _clean_name(raw: str) -> str:
    name = raw.strip()
    if (not name or len(name) > 255 or name in (".", "..")
            or "/" in name or "\\" in name or any(ord(ch) < 32 or ord(ch) == 127 for ch in name)):
        raise Refused(400, "invalid_name", line="That filename is not allowed for upload.")
    return name


def _parse_mime(header: str) -> str:
    mime = header.split(";", 1)[0].strip().lower()
    if not MIME_RE.fullmatch(mime) or mime not in ALLOWED_TYPES:
        raise Refused(415, "invalid_type", line="That media type is not allowed for upload.")
    return mime


def _content_disposition(kind: str, name: str) -> str:
    ascii_name = "".join(ch if 32 <= ord(ch) < 127 and ch not in '"\\' else "_" for ch in name).strip() or "file"
    encoded = quote(name, safe="")
    return f'{kind}; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


def store_bytes(paths, data: bytes, *, name: str, mime_type: str, kind: str = "file") -> dict:
    """Store raw bytes by SHA-256 content hash under the home's data folder and register an upload id."""
    digest = hashlib.sha256(data).hexdigest()
    target = blob_path(paths, digest)
    if not target.is_file():
        _atomic_write(target, data)
    upload_id = secrets.token_hex(16)
    record = {
        "id": upload_id,
        "kind": kind,
        "sha256": digest,
        "name": name,
        "size": len(data),
        "mimeType": mime_type,
        "created_at": _iso(time.time()),
    }
    _atomic_write(_meta_path(paths, upload_id), json.dumps(record, ensure_ascii=False).encode("utf-8"))
    return record


def load_upload(paths, upload_id: str) -> dict | None:
    """Read one upload's metadata by id, or None if it does not exist or its blob is gone."""
    if not isinstance(upload_id, str) or not HEX32.fullmatch(upload_id):
        return None
    meta = _meta_path(paths, upload_id)
    if not meta.is_file():
        return None
    try:
        record = json.loads(meta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    digest = record.get("sha256")
    if not isinstance(digest, str) or not HEX64.fullmatch(digest) or not blob_path(paths, digest).is_file():
        return None
    return record


def prepare_attachments(paths, *, upload_ids=(), images=()) -> list[dict]:
    """Validate and resolve uploaded file ids and inline base64 images into message attachment records."""
    if upload_ids is None:
        upload_ids = ()
    if images is None:
        images = ()
    if not isinstance(upload_ids, (list, tuple)):
        raise Refused(400, "invalid_attachment", line="Attachments must be a list.")
    if not isinstance(images, (list, tuple)):
        raise Refused(400, "invalid_image", line="Images must be a list.")
    if len(upload_ids) > MAX_ATTACHMENTS:
        raise Refused(400, "too_many_attachments", line=f"Up to {MAX_ATTACHMENTS} files a message.")
    if len(images) > MAX_IMAGES:
        raise Refused(400, "too_many_images", line=f"Up to {MAX_IMAGES} images a message.")

    resolved: list[dict] = []
    for index, image in enumerate(images):
        if not isinstance(image, dict):
            raise Refused(400, "invalid_image", line="Each image needs data and mimeType.")
        mime = str(image.get("mimeType") or "").split(";", 1)[0].strip().lower()
        if mime not in IMAGE_TYPES:
            raise Refused(415, "image_type", line="This image type can't be sent.")
        raw_b64 = image.get("data")
        if not isinstance(raw_b64, str) or not raw_b64:
            raise Refused(400, "invalid_image", line="Image data must be base64.")
        try:
            decoded = base64.b64decode(raw_b64, validate=True)
        except ValueError:
            raise Refused(400, "invalid_image", line="Image data must be base64.") from None
        if not decoded:
            raise Refused(400, "invalid_image", line="Empty images can't be sent.")
        if len(decoded) > MAX_IMAGE_BYTES:
            raise Refused(413, "image_too_large", line="The image is too large.")
        name = f"image-{index + 1}{IMAGE_EXTS.get(mime, '.bin')}"
        stored = store_bytes(paths, decoded, name=name, mime_type=mime, kind="image")
        resolved.append({
            "kind": "image", "id": stored["id"], "sha256": stored["sha256"],
            "name": stored["name"], "size": stored["size"], "mimeType": stored["mimeType"],
        })

    total_bytes = 0
    for item in upload_ids:
        upload_id = item.get("id") if isinstance(item, dict) else item
        record = load_upload(paths, upload_id) if isinstance(upload_id, str) else None
        if record is None:
            raise Refused(400, "unknown_upload", line="The file expired. Attach it again.")
        total_bytes += int(record["size"])
        if total_bytes > MAX_TOTAL_BYTES:
            raise Refused(400, "attachments_too_large", line="Up to 50 MB of files in all.")
        resolved.append({
            "kind": "file", "id": record["id"], "sha256": record["sha256"],
            "name": record["name"], "size": int(record["size"]), "mimeType": record["mimeType"],
        })
    return resolved


def message_media(message_id: int, raw_attachments: str | list | None) -> tuple[list[dict], list[dict]]:
    """Project a message's stored attachments JSON into ChatItem (images, attachments) lists."""
    entries = json.loads(raw_attachments) if isinstance(raw_attachments, str) else list(raw_attachments or [])
    images, files = [], []
    for entry in entries:
        if entry.get("kind") == "image":
            images.append({"url": f"/chat/images/{message_id}/{len(images)}", "mimeType": entry["mimeType"]})
        else:
            files.append({
                "name": entry["name"], "size": entry.get("size"), "mimeType": entry.get("mimeType"),
                "url": f"/chat/files/{message_id}/{len(files)}",
            })
    return images, files


def body_limit(method: str, path: str) -> tuple[int, str] | None:
    """Allow uploads (and queued messages with inline images) up to MAX_UPLOAD_BYTES."""
    if method == "POST" and path == "/chat/upload":
        return MAX_UPLOAD_BYTES, "file_too_large"
    if method == "POST" and path in ("/chat/send", "/chat/queue/add", "/chat/queue/edit"):
        return MAX_UPLOAD_BYTES, "body_too_large"
    return None


def upload(handler) -> None:
    """POST /chat/upload?name=<str>: store raw bytes by content hash under the home's data folder."""
    name = _clean_name(handler.query.get("name", [""])[0])
    mime = _parse_mime(handler.headers.get("Content-Type", ""))
    data = handler.raw
    if not data:
        raise Refused(400, "empty_file", line="Empty files cannot be uploaded.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise Refused(413, "file_too_large", line="Files can be up to 25 MB.")
    record = store_bytes(handler.server.home.paths, data, name=name, mime_type=mime)
    info = {"id": record["id"], "name": record["name"], "size": record["size"], "mimeType": record["mimeType"]}
    handler.send_json({"ok": True, "file": info, **info})


def _entry_for(handler, item_id: str, idx: int, *, kind: str) -> dict:
    if idx < 0:
        raise Refused(404, "not_found", line="There is no such file.")
    if item_id.isdigit():
        try:
            row = handler.ledger.message(int(item_id))
        except WorkflowError:
            raise Refused(404, "not_found", line="There is no such file.") from None
        entries = json.loads(row["attachments"] or "[]")
        selected = [item for item in entries if (item.get("kind") == "image") == (kind == "image")]
        if idx >= len(selected):
            raise Refused(404, "not_found", line="There is no such file.")
        return selected[idx]
    if idx == 0 and HEX32.fullmatch(item_id):
        record = load_upload(handler.server.home.paths, item_id)
        if record is not None:
            return record
    raise Refused(404, "not_found", line="There is no such file.")


def _serve_media(handler, item_id: str, idx_text: str, *, kind: str) -> None:
    entry = _entry_for(handler, item_id, int(idx_text), kind=kind)
    mime = str(entry.get("mimeType") or "")
    if mime not in ALLOWED_TYPES or (kind == "image" and mime not in IMAGE_TYPES):
        raise Refused(404, "not_found", line="There is no such file.")
    digest = entry.get("sha256", "")
    if not isinstance(digest, str) or not HEX64.fullmatch(digest):
        raise Refused(404, "not_found", line="There is no such file.")
    target = blob_path(handler.server.home.paths, digest)
    if not target.is_file():
        raise Refused(404, "not_found", line="There is no such file.")
    data = target.read_bytes()
    disposition = _content_disposition("inline" if kind == "image" else "attachment", str(entry.get("name") or "file"))
    handler.send_response(200)
    handler.send_header("Content-Type", mime)
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Content-Disposition", disposition)
    handler.send_header("Cache-Control", "private, max-age=3600")
    handler.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
    handler.send_header("Referrer-Policy", "no-referrer")
    handler.send_header("X-Frame-Options", "DENY")
    handler.end_headers()
    handler.wfile.write(data)


def serve_image(handler, item_id: str, idx: str) -> None:
    _serve_media(handler, item_id, idx, kind="image")


def serve_file(handler, item_id: str, idx: str) -> None:
    _serve_media(handler, item_id, idx, kind="file")


# Message queue

@contextmanager
def _tx(ledger, write: bool = False):
    with ledger._connect() as db, db:
        db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield db


def _agent_id(data: dict, *, required: bool = False) -> str | None:
    raw = data.get("agentId")
    if raw is None or raw == "":
        return None if required else DEFAULT_AGENT_ID
    if not isinstance(raw, str) or len(raw.strip()) > 128:
        raise Refused(400, "invalid_agent", line="agentId must be a short string.")
    return raw.strip()


def _validate_text(data: dict) -> str:
    raw = data.get("text")
    if not isinstance(raw, str):
        raise Refused(422, "invalid_text", line="A message must be text.")
    if not raw.strip():
        raise Refused(422, "empty_message", line="Write a message first.")
    if len(raw) > MAX_TEXT:
        raise Refused(422, "text_too_long", line=f"The message is too long. Up to {MAX_TEXT} characters.")
    return raw


def _public_attachments(raw: str) -> list[dict]:
    entries = json.loads(raw or "[]")
    return [{"id": item["id"], "name": item["name"], "size": item["size"], "mimeType": item["mimeType"]}
            for item in entries]


def _queue_item(row) -> dict:
    held = bool(row["held"])
    state = row["state"]
    item = {
        "id": row["id"],
        "agentId": row["agent_id"],
        "position": row["position"],
        "text": row["text"],
        "revision": row["revision"],
        "state": state,
        "held": held,
        "status": "held" if state == "queued" and held else state,
        "at": _iso(row["created_at"]),
        "attachments": _public_attachments(row["attachments"]),
    }
    if row["message_id"] is not None:
        item["messageId"] = row["message_id"]
    return item


def queue_payload(server, agent_id: str = DEFAULT_AGENT_ID) -> dict:
    """Current active queue items for one agent, in FIFO position order."""
    with _tx(server.home.ledger, write=False) as db:
        rows = db.execute(
            "SELECT * FROM chat_queue WHERE agent_id = ? AND state IN ('queued', 'sending') ORDER BY position ASC",
            (agent_id,),
        ).fetchall()
    return {"agentId": agent_id, "items": [_queue_item(row) for row in rows]}


def queue_frame(server, query: dict) -> dict:
    """Initial `chat.queue` frame sent when GET /events opens."""
    return queue_payload(server, query.get("agentId") or DEFAULT_AGENT_ID)


def _broadcast_queue(server, agent_id: str) -> None:
    server.frame("chat.queue", queue_payload(server, agent_id))


def _load_queue_row(db, item_id: str, agent_id: str | None):
    row = db.execute("SELECT * FROM chat_queue WHERE id = ?", (item_id,)).fetchone()
    if row is None or (agent_id is not None and row["agent_id"] != agent_id):
        raise Refused(404, "not_found", line="There is no such queued message.")
    return row


def _deliver_claimed(server, row) -> dict:
    """Hand a row already claimed in state='sending' to the server's say path, then mark it sent."""
    try:
        message = server.say(row["text"], attachments=json.loads(row["attachments"] or "[]"))
    except BaseException:
        with _tx(server.home.ledger, write=True) as db:
            db.execute("UPDATE chat_queue SET state = 'queued', updated_at = ? WHERE id = ? AND state = 'sending'",
                       (time.time(), row["id"]))
        _broadcast_queue(server, row["agent_id"])
        raise
    with _tx(server.home.ledger, write=True) as db:
        db.execute("UPDATE chat_queue SET state = 'sent', message_id = ?, updated_at = ? WHERE id = ?",
                   (message, time.time(), row["id"]))
        sent = db.execute("SELECT * FROM chat_queue WHERE id = ?", (row["id"],)).fetchone()
    _broadcast_queue(server, row["agent_id"])
    return _queue_item(sent)


def drain(server, agent_id: str | None = None) -> dict | None:
    """Deliver the oldest queued message, unless it is held, to the server's say path exactly once."""
    with _tx(server.home.ledger, write=True) as db:
        if agent_id is None:
            row = db.execute("SELECT * FROM chat_queue WHERE state = 'queued' ORDER BY position ASC LIMIT 1").fetchone()
        else:
            row = db.execute("SELECT * FROM chat_queue WHERE agent_id = ? AND state = 'queued' "
                             "ORDER BY position ASC LIMIT 1", (agent_id,)).fetchone()
        if row is None or row["held"]:
            return None
        claimed = db.execute(
            "UPDATE chat_queue SET state = 'sending', updated_at = ? "
            "WHERE id = ? AND state = 'queued' AND held = 0",
            (time.time(), row["id"]),
        ).rowcount
        if not claimed:
            return None
    return _deliver_claimed(server, row)


def queue_add(handler) -> None:
    data = handler.body()
    agent_id = _agent_id(data)
    text = _validate_text(data)
    raw_id = data.get("id")
    if raw_id is None or raw_id == "":
        item_id = uuid.uuid4().hex
    elif isinstance(raw_id, str) and 1 <= len(raw_id.strip()) <= 128:
        item_id = raw_id.strip()
    else:
        raise Refused(400, "invalid_id", line="id must be a short string.")
    attached = prepare_attachments(handler.server.home.paths,
                                   upload_ids=data.get("attachments"), images=data.get("images"))
    attached_json = json.dumps(attached)
    now = time.time()
    with _tx(handler.ledger, write=True) as db:
        existing = db.execute("SELECT * FROM chat_queue WHERE id = ?", (item_id,)).fetchone()
        if existing is not None:
            prev_media = [(a.get("kind", "file"), a.get("sha256"), a.get("name"))
                          for a in json.loads(existing["attachments"] or "[]")]
            next_media = [(a.get("kind", "file"), a.get("sha256"), a.get("name")) for a in attached]
            if existing["agent_id"] != agent_id or existing["text"] != text or prev_media != next_media:
                raise Refused(409, "message_conflict", line="A different message was already queued with this id.")
            item = _queue_item(existing)
        else:
            active = db.execute(
                "SELECT COUNT(*) FROM chat_queue WHERE agent_id = ? AND state IN ('queued', 'sending')",
                (agent_id,),
            ).fetchone()[0]
            if active >= MAX_QUEUE:
                raise Refused(409, "queue_full", line=f"Up to {MAX_QUEUE} messages can wait in the queue.")
            pos = db.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM chat_queue").fetchone()[0]
            db.execute(
                "INSERT INTO chat_queue(agent_id, id, position, text, attachments, state, held, revision, "
                "created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', 0, 1, ?, ?)",
                (agent_id, item_id, pos, text, attached_json, now, now),
            )
            row = db.execute("SELECT * FROM chat_queue WHERE id = ?", (item_id,)).fetchone()
            item = _queue_item(row)
    _broadcast_queue(handler.server, agent_id)
    if handler.server.idle():
        drain(handler.server)      # nothing is being answered, so it need not wait
    handler.send_json({"ok": True, "item": item})


def queue_edit(handler) -> None:
    data = handler.body()
    agent_id = _agent_id(data, required=True)
    item_id = str(data.get("id") or "").strip()
    if not item_id:
        raise Refused(400, "invalid_id", line="id is required.")
    revision = data.get("revision")
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
        raise Refused(400, "invalid_revision", line="revision must be a positive integer.")
    text = _validate_text(data)
    replace_media = "attachments" in data or "images" in data
    new_media = (json.dumps(prepare_attachments(handler.server.home.paths,
                                                upload_ids=data.get("attachments"), images=data.get("images")))
                 if replace_media else None)
    with _tx(handler.ledger, write=True) as db:
        row = _load_queue_row(db, item_id, agent_id)
        if row["state"] != "queued":
            raise Refused(409, "not_queued", line="This message is no longer waiting in the queue.")
        if row["revision"] != revision:
            raise Refused(409, "revision_conflict", line="This message changed elsewhere. Reload and try again.")
        stored = row["attachments"] if new_media is None else new_media
        db.execute(
            "UPDATE chat_queue SET text = ?, attachments = ?, held = 0, revision = revision + 1, updated_at = ? "
            "WHERE id = ?",
            (text, stored, time.time(), item_id),
        )
        updated = db.execute("SELECT * FROM chat_queue WHERE id = ?", (item_id,)).fetchone()
    _broadcast_queue(handler.server, updated["agent_id"])
    handler.send_json({"ok": True, "item": _queue_item(updated)})


def queue_hold(handler) -> None:
    data = handler.body()
    agent_id = _agent_id(data, required=True)
    item_id = str(data.get("id") or "").strip()
    if not item_id:
        raise Refused(400, "invalid_id", line="id is required.")
    hold = data.get("hold", True)
    if not isinstance(hold, bool):
        raise Refused(400, "invalid_hold", line="hold must be true or false.")
    with _tx(handler.ledger, write=True) as db:
        row = _load_queue_row(db, item_id, agent_id)
        if row["state"] != "queued":
            raise Refused(409, "not_queued", line="This message is no longer waiting in the queue.")
        db.execute("UPDATE chat_queue SET held = ?, updated_at = ? WHERE id = ?",
                   (int(hold), time.time(), item_id))
        updated = db.execute("SELECT * FROM chat_queue WHERE id = ?", (item_id,)).fetchone()
    _broadcast_queue(handler.server, updated["agent_id"])
    if not hold and handler.server.idle():
        drain(handler.server)
        updated = db_row(handler.ledger, item_id)
    handler.send_json({"ok": True, "item": _queue_item(updated)})


def db_row(ledger, item_id: str):
    with _tx(ledger) as db:
        return db.execute("SELECT * FROM chat_queue WHERE id = ?", (item_id,)).fetchone()


def queue_cancel(handler) -> None:
    data = handler.body()
    agent_id = _agent_id(data, required=True)
    item_id = str(data.get("id") or "").strip()
    if not item_id:
        raise Refused(400, "invalid_id", line="id is required.")
    with _tx(handler.ledger, write=True) as db:
        row = _load_queue_row(db, item_id, agent_id)
        if row["state"] != "queued":
            raise Refused(409, "not_queued", line="This message is no longer waiting in the queue.")
        db.execute("UPDATE chat_queue SET state = 'canceled', held = 0, updated_at = ? WHERE id = ?",
                   (time.time(), item_id))
        updated = db.execute("SELECT * FROM chat_queue WHERE id = ?", (item_id,)).fetchone()
    _broadcast_queue(handler.server, updated["agent_id"])
    handler.send_json({"ok": True, "item": _queue_item(updated)})


def queue_send_now(handler) -> None:
    data = handler.body()
    agent_id = _agent_id(data, required=True)
    item_id = str(data.get("id") or "").strip()
    if not item_id:
        raise Refused(400, "invalid_id", line="id is required.")
    with _tx(handler.ledger, write=True) as db:
        row = _load_queue_row(db, item_id, agent_id)
        if row["state"] != "queued":
            raise Refused(409, "not_queued", line="This message is no longer waiting in the queue.")
        claimed = db.execute(
            "UPDATE chat_queue SET state = 'sending', held = 0, updated_at = ? WHERE id = ? AND state = 'queued'",
            (time.time(), item_id),
        ).rowcount
        if not claimed:
            raise Refused(409, "not_queued", line="This message is no longer waiting in the queue.")
    sent = _deliver_claimed(handler.server, row)
    handler.send_json({"ok": True, "item": sent, **({"messageId": sent["messageId"]} if "messageId" in sent else {})})


ROUTES = (
    ("POST", r"/chat/upload", upload),
    ("GET", r"/chat/images/([^/]+)/(\d+)", serve_image),
    ("GET", r"/chat/files/([^/]+)/(\d+)", serve_file),
    ("POST", r"/chat/queue/add", queue_add),
    ("POST", r"/chat/queue/edit", queue_edit),
    ("POST", r"/chat/queue/cancel", queue_cancel),
    ("POST", r"/chat/queue/send_now", queue_send_now),
    ("POST", r"/chat/queue/hold", queue_hold),
)
FRAMES = {"chat.queue": queue_frame}
REFRESH = {}
