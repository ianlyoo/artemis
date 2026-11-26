"""Boards stored in the ledger and content-addressed assets under the home's data folder.

A board is structured content the lead or a worker publishes for the App's board screens: headings, prose, tables,
charts, timelines, code (including mermaid), footnotes, answer slots the person can edit, owner step references and
vault secret references (by secret name only, never a value). Every publish or answer bumps a monotonic revision
and records a `board.*` ledger event so open App streams refresh automatically.
"""

from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import tempfile
import time

from .ledger import Ledger, SECRET_NAME, _event
from .roles import Role


BLOCK_TYPES = ("heading", "text", "table", "chart", "timeline", "code", "notes", "answer", "step", "secret")
TONES = ("default", "accent", "muted")
WIDTHS = ("narrow", "wide", "full")
CHART_KINDS = ("bar", "line")

BOARD_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
SLOT_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
ASSET_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
MAX_BLOCKS = 200
MAX_TITLE = 200
MAX_ANSWER_CHARS = 100_000
MAX_ASSET_BYTES = 25 * 1024 * 1024
MAX_STEP = 999_999_999_999

ASSET_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".json": "application/json; charset=utf-8",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
}

_COMMON_KEYS = frozenset({"id", "type", "title", "tone"})
_TYPE_KEYS = {
    "heading": frozenset({"text", "level"}),
    "text": frozenset({"text"}),
    "table": frozenset({"columns", "rows"}),
    "chart": frozenset({"kind", "labels", "series", "unit"}),
    "timeline": frozenset({"items"}),
    "code": frozenset({"text", "lang"}),
    "notes": frozenset({"items"}),
    "answer": frozenset({"slot", "text"}),
    "step": frozenset({"step"}),
    "secret": frozenset({"key", "label", "template"}),
}


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _plain_str(value, where: str, *, non_empty: bool = False, max_len: int | None = None) -> str:
    if not isinstance(value, str) or "\0" in value:
        raise ValueError(f"{where} must be a string without NUL characters.")
    if non_empty and not value.strip():
        raise ValueError(f"{where} must be a non-empty string.")
    if max_len is not None and len(value) > max_len:
        raise ValueError(f"{where} must be at most {max_len} characters.")
    return value


def _check_keys(item: dict, allowed: frozenset[str], where: str, kind: str) -> None:
    for key in item:
        if key not in allowed:
            raise ValueError(f"{where}.{key} is not a field of a {kind}.")


def _validate_layout(layout) -> dict | None:
    if layout is None:
        return None
    if not isinstance(layout, dict):
        raise ValueError("layout must be an object.")
    for key in layout:
        if key != "width":
            raise ValueError(f"layout.{key} is not a layout field.")
    if "width" not in layout:
        return None
    width = layout["width"]
    if width not in WIDTHS:
        raise ValueError(f"layout.width must be one of: {', '.join(WIDTHS)}.")
    return {"width": width}


def _validate_board_id(board_id: str | None) -> str:
    if board_id is None:
        return f"board-{secrets.token_hex(6)}"
    if not isinstance(board_id, str) or ".." in board_id or not BOARD_ID.fullmatch(board_id):
        raise ValueError("id must be 1 to 96 letters, digits, '.', '-' or '_', starting with a letter or digit.")
    return board_id


def validate_blocks(blocks) -> list[dict]:
    """Check every block against the App's board renderers and return normalized copies."""
    if not isinstance(blocks, list):
        raise ValueError("blocks must be a list of block objects.")
    if not 1 <= len(blocks) <= MAX_BLOCKS:
        raise ValueError(f"blocks needs 1 to {MAX_BLOCKS} items.")

    claimed: set[str] = set()
    for block in blocks:
        if isinstance(block, dict) and isinstance(block.get("id"), str) and block["id"].strip():
            claimed.add(block["id"])

    seen_ids: set[str] = set()
    seen_slots: set[str] = set()
    normalized: list[dict] = []
    auto = 1

    for index, raw in enumerate(blocks):
        where = f"blocks[{index}]"
        if not isinstance(raw, dict):
            raise ValueError(f"{where} must be an object.")
        btype = raw.get("type")
        if not isinstance(btype, str):
            raise ValueError(f"{where}.type is required.")
        if btype not in BLOCK_TYPES:
            raise ValueError(f"{where}.type must be one of: {', '.join(BLOCK_TYPES)}.")

        if btype == "secret" and "value" in raw:
            raise ValueError(f"{where}.value is not allowed: a secret block names a vault secret in key, never its value.")
        _check_keys(raw, _COMMON_KEYS | _TYPE_KEYS[btype], where, f"{btype} block")

        if "id" in raw:
            bid = _plain_str(raw["id"], f"{where}.id", non_empty=True, max_len=128)
            if bid in seen_ids:
                raise ValueError(f"{where}.id duplicates an earlier block id {bid!r}.")
        else:
            while f"b{auto}" in claimed or f"b{auto}" in seen_ids:
                auto += 1
            bid = f"b{auto}"
            auto += 1
        seen_ids.add(bid)

        clean: dict = {"id": bid, "type": btype}
        if "title" in raw:
            clean["title"] = _plain_str(raw["title"], f"{where}.title", max_len=MAX_TITLE)
        if "tone" in raw:
            tone = raw["tone"]
            if tone not in TONES:
                raise ValueError(f"{where}.tone must be one of: {', '.join(TONES)}.")
            clean["tone"] = tone

        if btype == "heading":
            clean["text"] = _plain_str(raw.get("text"), f"{where}.text", non_empty=True)
            level = raw.get("level", 2)
            if not _is_int(level) or level not in (1, 2, 3):
                raise ValueError(f"{where}.level must be 1, 2 or 3.")
            clean["level"] = level
        elif btype == "text":
            clean["text"] = _plain_str(raw.get("text"), f"{where}.text")
        elif btype == "table":
            clean.update(_validate_table(raw, where))
        elif btype == "chart":
            clean.update(_validate_chart(raw, where))
        elif btype == "timeline":
            clean["items"] = _validate_timeline(raw.get("items"), where)
        elif btype == "code":
            clean["text"] = _plain_str(raw.get("text"), f"{where}.text")
            if "lang" in raw:
                clean["lang"] = _plain_str(raw["lang"], f"{where}.lang", max_len=64)
        elif btype == "notes":
            clean["items"] = _validate_notes(raw.get("items"), where)
        elif btype == "answer":
            slot = raw.get("slot")
            if not isinstance(slot, str) or not SLOT_NAME.fullmatch(slot):
                raise ValueError(f"{where}.slot must be 1 to 64 letters, digits, '.', '-' or '_'.")
            if slot in seen_slots:
                raise ValueError(f"{where}.slot duplicates an earlier answer slot {slot!r}.")
            seen_slots.add(slot)
            clean["slot"] = slot
            clean["text"] = _plain_str(raw.get("text", ""), f"{where}.text", max_len=MAX_ANSWER_CHARS)
        elif btype == "step":
            step = raw.get("step")
            if not _is_int(step) or not 1 <= step <= MAX_STEP:
                raise ValueError(f"{where}.step must be a positive integer.")
            clean["step"] = step
        elif btype == "secret":
            key = raw.get("key")
            if not isinstance(key, str) or not SECRET_NAME.fullmatch(key):
                raise ValueError(f"{where}.key must be a vault secret name (A-Z, 0-9 and _), never a value.")
            clean["key"] = key
            if "label" in raw:
                clean["label"] = _plain_str(raw["label"], f"{where}.label", non_empty=True, max_len=MAX_TITLE)
            if "template" in raw:
                template = _plain_str(raw["template"], f"{where}.template", max_len=MAX_TITLE)
                if "{value}" not in template:
                    raise ValueError(f"{where}.template must contain '{{value}}'.")
                clean["template"] = template

        normalized.append(clean)

    return normalized


def _validate_table(raw: dict, where: str) -> dict:
    columns = raw.get("columns")
    if not isinstance(columns, list) or not columns:
        raise ValueError(f"{where}.columns must be a non-empty list of column names.")
    clean_cols = [_plain_str(col, f"{where}.columns[{i}]") for i, col in enumerate(columns)]
    rows = raw.get("rows")
    if not isinstance(rows, list):
        raise ValueError(f"{where}.rows must be a list of rows.")
    clean_rows = []
    for r, row in enumerate(rows):
        if not isinstance(row, list):
            raise ValueError(f"{where}.rows[{r}] must be a list.")
        if len(row) != len(clean_cols):
            raise ValueError(f"{where}.rows[{r}] must have {len(clean_cols)} cells to match columns.")
        clean_row = []
        for c, cell in enumerate(row):
            if cell is None or isinstance(cell, bool) or _is_number(cell):
                clean_row.append(cell)
            elif isinstance(cell, str) and "\0" not in cell:
                clean_row.append(cell)
            else:
                raise ValueError(f"{where}.rows[{r}][{c}] must be text, a finite number, a boolean or null.")
        clean_rows.append(clean_row)
    return {"columns": clean_cols, "rows": clean_rows}


def _validate_chart(raw: dict, where: str) -> dict:
    kind = raw.get("kind", "line")
    if kind not in CHART_KINDS:
        raise ValueError(f"{where}.kind must be 'bar' or 'line'.")
    labels = raw.get("labels")
    if not isinstance(labels, list) or not labels:
        raise ValueError(f"{where}.labels must be a non-empty list of strings.")
    clean_labels = [_plain_str(label, f"{where}.labels[{i}]") for i, label in enumerate(labels)]
    series = raw.get("series")
    if not isinstance(series, list) or not series:
        raise ValueError(f"{where}.series must be a non-empty list of series.")
    clean_series = []
    for s, item in enumerate(series):
        sw = f"{where}.series[{s}]"
        if not isinstance(item, dict):
            raise ValueError(f"{sw} must be an object.")
        _check_keys(item, frozenset({"name", "values"}), sw, "chart series")
        name = _plain_str(item.get("name"), f"{sw}.name", non_empty=True, max_len=MAX_TITLE)
        values = item.get("values")
        if not isinstance(values, list):
            raise ValueError(f"{sw}.values must be a list of numbers.")
        if len(values) != len(clean_labels):
            raise ValueError(f"{sw}.values must have {len(clean_labels)} numbers to match labels.")
        clean_values = []
        for j, value in enumerate(values):
            if not _is_number(value):
                raise ValueError(f"{sw}.values[{j}] must be a finite number.")
            clean_values.append(value)
        clean_series.append({"name": name, "values": clean_values})
    result: dict = {"kind": kind, "labels": clean_labels, "series": clean_series}
    if "unit" in raw:
        result["unit"] = _plain_str(raw["unit"], f"{where}.unit", max_len=32)
    return result


def _validate_timeline(items, where: str) -> list[dict]:
    if not isinstance(items, list) or not items:
        raise ValueError(f"{where}.items must be a non-empty list of timeline items.")
    clean = []
    for i, item in enumerate(items):
        iw = f"{where}.items[{i}]"
        if not isinstance(item, dict):
            raise ValueError(f"{iw} must be an object.")
        _check_keys(item, frozenset({"when", "label", "detail"}), iw, "timeline item")
        entry = {
            "when": _plain_str(item.get("when"), f"{iw}.when", non_empty=True, max_len=128),
            "label": _plain_str(item.get("label"), f"{iw}.label", non_empty=True, max_len=MAX_TITLE),
        }
        if "detail" in item:
            entry["detail"] = _plain_str(item["detail"], f"{iw}.detail")
        clean.append(entry)
    return clean


def _validate_notes(items, where: str) -> list[dict]:
    if not isinstance(items, list) or not items:
        raise ValueError(f"{where}.items must be a non-empty list of notes.")
    seen: set[int] = set()
    clean = []
    for i, item in enumerate(items):
        iw = f"{where}.items[{i}]"
        if not isinstance(item, dict):
            raise ValueError(f"{iw} must be an object.")
        _check_keys(item, frozenset({"n", "text"}), iw, "note item")
        number = item.get("n")
        if not _is_int(number) or number < 1:
            raise ValueError(f"{iw}.n must be a positive integer.")
        if number in seen:
            raise ValueError(f"{iw}.n duplicates an earlier note number {number}.")
        seen.add(number)
        clean.append({"n": number, "text": _plain_str(item.get("text"), f"{iw}.text", non_empty=True)})
    return clean


def _board_dict(row) -> dict:
    board = {
        "id": row["id"],
        "title": row["title"],
        "createdAt": _iso(row["created_at"]),
        "updatedAt": _iso(row["updated_at"]),
        "blocks": json.loads(row["blocks"]),
    }
    if row["layout"]:
        board["layout"] = json.loads(row["layout"])
    return board


def _summary_dict(row) -> dict:
    return {"id": row["id"], "title": row["title"], "updatedAt": _iso(row["updated_at"])}


# Ledger store

def publish(ledger: Ledger, actor: Role, title: str, blocks: list[dict], *, board_id: str | None = None,
            layout: dict | None = None, project: int | None = None, task: int | None = None) -> dict:
    """Publish a new board or replace an existing one by id, recording `board.published` (id and title only)."""
    bid = _validate_board_id(board_id)
    clean_title = _plain_str(title, "title", non_empty=True, max_len=MAX_TITLE).strip()
    clean_layout = _validate_layout(layout)
    clean_blocks = validate_blocks(blocks)
    now = time.time()
    layout_json = None if clean_layout is None else json.dumps(clean_layout, ensure_ascii=False)
    blocks_json = json.dumps(clean_blocks, ensure_ascii=False)

    with ledger._write(actor, Role.LEAD, Role.WORKER, Role.OWNER, Role.HOME,
                       intervention=(actor == Role.OWNER)) as db:
        rev = db.execute("SELECT COALESCE(MAX(rev), 0) FROM boards").fetchone()[0] + 1
        existing = db.execute("SELECT created_at FROM boards WHERE id = ?", (bid,)).fetchone()
        if existing is None:
            db.execute(
                "INSERT INTO boards(id, title, layout, blocks, created_at, updated_at, rev) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (bid, clean_title, layout_json, blocks_json, now, now, rev),
            )
        else:
            db.execute(
                "UPDATE boards SET title = ?, layout = ?, blocks = ?, updated_at = ?, rev = ? WHERE id = ?",
                (clean_title, layout_json, blocks_json, now, rev, bid),
            )
        _event(db, actor, "board.published", clean_title, project=project, task=task,
               data={"id": bid, "title": clean_title})
    return {"id": bid, "title": clean_title, "rev": rev}


def get(ledger: Ledger, board_id: str) -> dict | None:
    """Return one stored board in the wire shape, or None when absent."""
    with ledger._read() as db:
        row = db.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
    return None if row is None else _board_dict(row)


def list_boards(ledger: Ledger) -> list[dict]:
    """Return board summaries ordered newest revision first."""
    with ledger._read() as db:
        rows = db.execute("SELECT id, title, updated_at FROM boards ORDER BY rev DESC").fetchall()
    return [_summary_dict(row) for row in rows]


def active_state(ledger: Ledger, *, listing: bool = False) -> dict:
    """The `/canvas/active` and `canvas` frame payload; `listing=True` leaves out the active board's blocks."""
    with ledger._read() as db:
        rows = db.execute("SELECT * FROM boards ORDER BY rev DESC").fetchall()
    if not rows:
        return {"rev": 0, "active_id": None, "boards": []} if listing else {"rev": 0, "active": None, "boards": []}
    rev = rows[0]["rev"]
    summaries = [_summary_dict(row) for row in rows]
    if listing:
        return {"rev": rev, "active_id": rows[0]["id"], "boards": summaries}
    return {"rev": rev, "active": _board_dict(rows[0]), "boards": summaries}


def catalog(ledger: Ledger) -> dict:
    """The `/ide/catalog` response listing every board with its revision for client body caching."""
    with ledger._read() as db:
        rows = db.execute("SELECT id, title, rev FROM boards ORDER BY rev DESC").fetchall()
    items = [
        {"id": f"board:{row['id']}", "board_id": row["id"], "title": row["title"],
         "visibility_revision": row["rev"], "archived": False}
        for row in rows
    ]
    return {"schema_version": 1, "boards": items, "reports": []}


def answer(ledger: Ledger, board_id, slot, text, *, actor: Role = Role.OWNER) -> dict:
    """Update one `answer` block's text on a stored board and bump rev."""
    bid = _plain_str(board_id, "board", non_empty=True, max_len=96)
    slot_name = _plain_str(slot, "slot", non_empty=True, max_len=64)
    clean_text = _plain_str(text, "text", max_len=MAX_ANSWER_CHARS)
    now = time.time()

    with ledger._write(actor, Role.OWNER, intervention=True) as db:
        row = db.execute("SELECT * FROM boards WHERE id = ?", (bid,)).fetchone()
        if row is None:
            raise LookupError(f"Board {bid!r} does not exist.")
        blocks = json.loads(row["blocks"])
        updated = False
        for block in blocks:
            if block.get("type") == "answer" and block.get("slot") == slot_name:
                block["text"] = clean_text
                updated = True
                break
        if not updated:
            raise LookupError(f"Answer slot {slot_name!r} does not exist on board {bid!r}.")
        rev = db.execute("SELECT COALESCE(MAX(rev), 0) FROM boards").fetchone()[0] + 1
        db.execute(
            "UPDATE boards SET blocks = ?, updated_at = ?, rev = ? WHERE id = ?",
            (json.dumps(blocks, ensure_ascii=False), now, rev, bid),
        )
        _event(db, actor, "board.answered", f"{bid} ({slot_name})", data={"id": bid, "slot": slot_name})
    return {"ok": True, "board": bid, "rev": rev}


# Content-addressed assets under the home's data folder

def assets_dir(home_root: Path) -> Path:
    return Path(home_root) / "board_assets"


def put_asset(home_root: Path, data: bytes, suffix: str) -> str:
    """Store immutable bytes under `<home>/board_assets/<sha256><suffix>` and return the asset name."""
    if not isinstance(data, (bytes, bytearray)) or not data:
        raise ValueError("data must be non-empty bytes.")
    if len(data) > MAX_ASSET_BYTES:
        raise ValueError(f"data must be at most {MAX_ASSET_BYTES} bytes.")
    if not isinstance(suffix, str) or not suffix.strip():
        raise ValueError("suffix must be a file extension.")
    ext = suffix.strip().lower()
    if not ext.startswith("."):
        ext = "." + ext
    if ext not in ASSET_TYPES:
        raise ValueError(f"suffix {ext!r} is not an allowed board asset type.")

    folder = assets_dir(home_root)
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{hashlib.sha256(data).hexdigest()}{ext}"
    target = folder / name
    if not target.exists():
        fd, tmp = tempfile.mkstemp(prefix=".asset-", dir=folder)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
            os.replace(tmp, target)
        except Exception:
            Path(tmp).unlink(missing_ok=True)
            raise
    return name


def resolve_asset(home_root: Path, name: str) -> tuple[Path, str]:
    """Return `(path, content_type)` for a stored asset, refusing any path outside the asset folder."""
    if (not isinstance(name, str) or not name or "/" in name or "\\" in name or "\0" in name
            or ".." in name or not ASSET_NAME.fullmatch(name)):
        raise PermissionError("Board asset paths must stay inside the asset folder.")
    folder = assets_dir(home_root).resolve()
    candidate = folder / name
    if candidate.is_symlink():
        raise PermissionError("Board asset paths must stay inside the asset folder.")
    resolved = candidate.resolve()
    if not resolved.is_relative_to(folder) or resolved.parent != folder:
        raise PermissionError("Board asset paths must stay inside the asset folder.")
    content_type = ASSET_TYPES.get(resolved.suffix.lower())
    if content_type is None:
        raise PermissionError("That board asset type is not served.")
    if not resolved.is_file():
        raise FileNotFoundError(f"Board asset {name!r} does not exist.")
    return resolved, content_type


def read_asset(home_root: Path, name: str) -> tuple[bytes, str]:
    """Read one stored asset's bytes and content type."""
    path, content_type = resolve_asset(home_root, name)
    return path.read_bytes(), content_type
