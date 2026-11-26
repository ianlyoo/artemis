"""Server-side chat fence splitter and choices-spec parser for the App.

Splits an assistant message into the segment shapes Home's front-end renders
(markdown prose, validated visual/secret blocks, code blocks, streaming pending
fences, board open links, and file attachments) in one linear pass over lines.
Malformed typed fences degrade to code segments with a short reason rather than
failing the rest of the reply.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
import re
from typing import Any
import unicodedata

CHAT_FENCES = ("chart", "table", "timeline", "diagram", "sketch")
ATTACH_FENCE = "attach"
SECRET_FENCE = "secret"

MAX_SAFE_INT = (1 << 53) - 1
_LABEL_LIMIT = 60
_TEMPLATE_LIMIT = 500
SKETCH_PATH_BYTES = 8192
SKETCH_BLOCK_BYTES = 65536

OPTION_MAX = 20
ROW_MAX = 100
Q_MAX = 200
LINE_MAX = 200
YES = "예"
NO = "아니오"

_CHOICE_KEYS = frozenset({
    "q", "options", "guess", "rows", "step", "permission",
    "plan", "replaces", "supersedes", "supersede_phrases", "project",
})
_PERMIT_KINDS = frozenset({"send_as_owner", "delete", "payment"})

_JS_WS = (
    " \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006"
    "\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)
_JS_WS_RE = re.compile(f"[{re.escape(_JS_WS)}]")
_SLOT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")
_SLOT_INFO_RE = re.compile(rf"^answer[{re.escape(_JS_WS)}]+([^{re.escape(_JS_WS)}]+)\Z")
_STEP_INFO_RE = re.compile(rf"^step[{re.escape(_JS_WS)}]+#?([1-9][0-9]{{0,11}})\Z")
_ONE_LINE_FENCE_RE = re.compile(rf"^ {{0,3}}(`{{3,}})([^`]+?)\1[{re.escape(_JS_WS)}]*\Z")
_FENCE_OPEN_RE = re.compile(r"^ {0,3}(`{3,}(?=[^`]*\Z)|~{3,})(.*)\Z")
_SECRET_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._@-]{0,79}\Z")
_SECRET_TEMP_RE = re.compile(r"\.(tmp|prev)\Z")
_LINE_BREAK_RE = re.compile(r"[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]")
_CTRL_RE = re.compile(r"[\x00-\x1f]")
_SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
_TEMPLATE_START_RE = re.compile(r"^[A-Za-z0-9{]")
_HEX64_RE = re.compile(r"^[0-9a-f]{64}\Z")
_CURRENCY_RE = re.compile(r"^[A-Z]{3}\Z")
_PAGE_URL_RE = re.compile(r"^https://[a-z0-9.-]+(?::[0-9]+)?/")
_ABS_PATH_RE = re.compile(r"^(?:[a-z][a-z0-9-]*:)?(/.*)\Z")
_SKETCH_BAD_CHAR_RE = re.compile(r"[^MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]")
_SKETCH_TOKEN_RE = re.compile(
    r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:[0-9]*\.[0-9]+|[0-9]+\.?[0-9]*)(?:[eE][-+]?[0-9]+)?"
)
_SKETCH_ARITY = {"m": 2, "l": 2, "h": 1, "v": 1, "c": 6, "s": 4, "q": 4, "t": 2, "a": 7, "z": 0}
_SHAPE_FIELDS = {
    "path": ("d",),
    "line": ("from", "to", "label"),
    "arrow": ("from", "to", "label"),
    "circle": ("c", "r", "fill"),
    "rect": ("at", "size", "r", "fill"),
    "text": ("at", "text", "size"),
}
_UNDEF = object()


class _FenceError(Exception):
    """Validation failure turned into a short code-segment reason."""

    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class _Fence:
    marker: str
    kind: str
    info: str
    content: list[str]
    closed: bool
    next_index: int


def _fail(code: str, detail: str) -> Any:
    raise _FenceError(code, detail)


def _trim(value: str) -> str:
    return value.strip(_JS_WS)


def _ltrim(value: str) -> str:
    return value.lstrip(_JS_WS)


def _first_token(value: str) -> str:
    return _JS_WS_RE.split(value, maxsplit=1)[0]


def _utf16_len(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def _reject_json_constant(token: str) -> Any:
    raise ValueError(f"invalid JSON constant: {token}")


def _parse_json(raw: str) -> Any:
    return json.loads(raw, parse_constant=_reject_json_constant)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_safe_int(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return -MAX_SAFE_INT <= value <= MAX_SAFE_INT
    if isinstance(value, float):
        return math.isfinite(value) and value.is_integer() and -MAX_SAFE_INT <= value <= MAX_SAFE_INT
    return False


def _is_positive_int(value: Any) -> bool:
    return _is_safe_int(value) and value > 0


def _strict_equal(a: Any, b: Any) -> bool:
    """Deep equality distinguishing booleans from numbers."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if type(a) is not type(b):
        return False
    if isinstance(a, list):
        return len(a) == len(b) and all(_strict_equal(x, y) for x, y in zip(a, b))
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(_strict_equal(a[k], b[k]) for k in a)
    return a == b


def _slot_of(info: str) -> str | None:
    match = _SLOT_INFO_RE.match(_trim(info))
    return match.group(1) if match and _SLOT_ID_RE.match(match.group(1)) else None


def _step_of(info: str) -> str | None:
    match = _STEP_INFO_RE.match(_trim(info))
    return match.group(1) if match else None


def _is_typed(kind: str) -> bool:
    return (
        kind in CHAT_FENCES
        or kind in ("open", ATTACH_FENCE, SECRET_FENCE)
        or _step_of(kind) is not None
        or _slot_of(kind) is not None
    )


def _fence_at(lines: list[str], index: int) -> _Fence | None:
    """Read a one-line typed backtick fence or a multi-line CommonMark fence at lines[index]."""
    line = lines[index]
    one = _ONE_LINE_FENCE_RE.match(line)
    if one:
        info = _trim(one.group(2))
        named = _step_of(info) is not None or _slot_of(info) is not None
        kind = info if named else _first_token(info)
        body = "" if named else _trim(info[len(kind):])
        if _is_typed(kind):
            return _Fence(one.group(1), kind, info, [body] if body else [], True, index + 1)

    opened = _FENCE_OPEN_RE.match(line)
    if not opened:
        return None
    marker = opened.group(1)
    info = _trim(opened.group(2))
    end_re = re.compile(rf"^ {{0,3}}{re.escape(marker[0])}{{{len(marker)},}}[{re.escape(_JS_WS)}]*\Z")
    content: list[str] = []
    at = index + 1
    while at < len(lines) and not end_re.match(lines[at]):
        content.append(lines[at])
        at += 1
    closed = at < len(lines)
    return _Fence(marker, info, info, content, closed, at + 1 if closed else at)


def _require_object(value: Any, detail: str = "object") -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail("invalid_value", detail)
    return value


def _require_fields(value: dict[str, Any], allowed: tuple[str, ...] | list[str], detail: str) -> None:
    allowed_set = set(allowed)
    for key in value:
        if key not in allowed_set:
            _fail("unknown_field", f"{detail}.{key}")


def _require_text(value: Any, detail: str) -> str:
    if not isinstance(value, str):
        _fail("invalid_value", detail)
    return value


def _require_id(value: Any, detail: str = "id") -> str:
    if not _trim(_require_text(value, detail)):
        _fail("invalid_value", detail)
    return value


def _require_number(value: Any, detail: str, low: float | None = None, high: float | None = None,
                    positive: bool = False) -> int | float:
    if not _is_number(value):
        _fail("invalid_value", detail)
    if positive and value <= 0:
        _fail("invalid_value", detail)
    if low is not None and value < low:
        _fail("invalid_value", detail)
    if high is not None and value > high:
        _fail("invalid_value", detail)
    return value


def _require_choice(value: Any, options: tuple[str, ...], detail: str) -> str:
    if not isinstance(value, str) or value not in options:
        _fail("invalid_value", detail)
    return value


def _require_array(value: Any, detail: str) -> list[Any]:
    if not isinstance(value, list):
        _fail("invalid_value", detail)
    return value


def _require_strings(value: Any, detail: str) -> list[str]:
    return [_require_text(item, f"{detail}[{i}]") for i, item in enumerate(_require_array(value, detail))]


def _require_pair(value: Any, detail: str, positive: bool = False) -> list[int | float]:
    items = _require_array(value, detail)
    if len(items) != 2:
        _fail("invalid_value", detail)
    return [_require_number(item, detail, positive=positive) for item in items]


def _merge_aliases(obj: dict[str, Any], canonical_name: str, alt_names: tuple[str, ...]) -> None:
    present = [k for k in (canonical_name, *alt_names) if k in obj]
    if not present:
        return
    first = obj[present[0]]
    if any(not _strict_equal(obj[k], first) for k in present[1:]):
        _fail("invalid_value", f"conflicting {canonical_name} aliases")
    obj[canonical_name] = first
    for alt in alt_names:
        obj.pop(alt, None)


def _format_table_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float) and math.isfinite(value):
        if value == 0:
            return "0"
        if value.is_integer() and abs(value) < 1e21:
            return str(int(value))
        return str(value)
    return value


def _normalize_visual(kind: str, raw: dict[str, Any]) -> dict[str, Any]:
    """Rewrite accepted visual field aliases to canonical block keys before validation."""
    value = dict(raw)
    if kind == "chart":
        if value.get("type") in ("bar", "line"):
            _merge_aliases(value, "kind", ("type",))
        if isinstance(value.get("xAxis"), dict):
            axis = dict(value["xAxis"])
            _merge_aliases(axis, "categories", ("data",))
            if len(axis) == 1 and "categories" in axis:
                value["xAxis"] = axis["categories"]
        _merge_aliases(value, "labels", ("x", "categories", "xAxis"))
        if isinstance(value.get("series"), list):
            series = []
            for item in value["series"]:
                if isinstance(item, dict):
                    entry = dict(item)
                    _merge_aliases(entry, "values", ("data", "y"))
                    series.append(entry)
                else:
                    series.append(item)
            value["series"] = series
    elif kind == "table":
        _merge_aliases(value, "columns", ("headers",))
        rows = value.get("rows")
        cols = value.get("columns")
        if (
            isinstance(rows, list)
            and any(isinstance(row, dict) for row in rows)
            and isinstance(cols, list)
            and all(isinstance(col, str) for col in cols)
        ):
            normalized_rows = []
            for row in rows:
                rec = _require_object(row, "table.row")
                if len(rec) != len(cols) or not all(col in rec for col in cols):
                    _fail("invalid_value", "table.row keys must match columns")
                normalized_rows.append([_format_table_cell(rec[col]) for col in cols])
            value["rows"] = normalized_rows
    elif kind == "timeline":
        _merge_aliases(value, "items", ("events",))
        if isinstance(value.get("items"), list):
            items = []
            for item in value["items"]:
                if isinstance(item, dict):
                    entry = dict(item)
                    _merge_aliases(entry, "when", ("date",))
                    _merge_aliases(entry, "label", ("text",))
                    items.append(entry)
                else:
                    items.append(item)
            value["items"] = items
    return value


def _encode_mermaid_label(text: str) -> str:
    lines = re.split(r"\r\n?|\n", text)
    encoded = []
    for line in lines:
        chars = []
        for ch in line:
            if unicodedata.category(ch)[0] in ("L", "N") or ch in " .,_-":
                chars.append(ch)
            else:
                chars.append(f"#{ord(ch)};")
        encoded.append("".join(chars))
    return "<br/>".join(encoded)


def _normalize_diagram_block(blk: dict[str, Any]) -> dict[str, Any]:
    if blk.get("type") != "diagram":
        return blk
    nodes, edges = blk["nodes"], blk["edges"]
    rest = {k: v for k, v in blk.items() if k not in ("nodes", "edges")}
    id_map = {node["id"]: f"n{i}" for i, node in enumerate(nodes)}
    lines = ["flowchart TD"]
    for node in nodes:
        lines.append(f' {id_map[node["id"]]}["{_encode_mermaid_label(node["label"])}"]')
    for edge in edges:
        edge_label = edge.get("label")
        tag = f'|"{_encode_mermaid_label(edge_label)}"|' if edge_label else ""
        lines.append(f' {id_map[edge["from"]]} -->{tag} {id_map[edge["to"]]}')
    return {**rest, "type": "code", "lang": "mermaid", "text": "\n".join(lines)}


def _validate_sketch_path(raw: Any) -> str:
    d = _require_text(raw, "sketch.d")
    if not _trim(d) or len(d.encode("utf-8")) > SKETCH_PATH_BYTES or _SKETCH_BAD_CHAR_RE.search(d):
        _fail("invalid_path", "sketch.d")
    tokens = _SKETCH_TOKEN_RE.findall(d)
    if "".join(tokens) != re.sub(r"[\s,]", "", d) or not tokens or tokens[0] not in ("M", "m"):
        _fail("invalid_path", "sketch.d")
    idx = 0
    while idx < len(tokens):
        cmd = tokens[idx].lower()
        idx += 1
        if cmd not in _SKETCH_ARITY:
            _fail("invalid_path", "sketch.d")
        count = 0
        while idx < len(tokens) and not (len(tokens[idx]) == 1 and tokens[idx].isalpha()):
            try:
                num = float(tokens[idx])
            except ValueError:
                _fail("invalid_path", "sketch.d")
            idx += 1
            if not math.isfinite(num):
                _fail("invalid_path", "sketch.d")
            if cmd == "a" and (count % 7) in (3, 4) and num not in (0, 1):
                _fail("invalid_path", "sketch.arc_flag")
            count += 1
        arity = _SKETCH_ARITY[cmd]
        if (arity == 0 and count != 0) or (arity != 0 and (count == 0 or count % arity != 0)):
            _fail("invalid_path", "sketch.d")
    return d


def _validate_shape(raw: Any) -> dict[str, Any]:
    s = _require_object(raw, "shape")
    k = _require_choice(s.get("k"), tuple(_SHAPE_FIELDS), "shape.k")
    _require_fields(s, ("k", "ink", "width", *_SHAPE_FIELDS[k]), "shape")
    ink_raw = s.get("ink")
    ink = _require_choice("gold" if ink_raw is None else ink_raw, ("gold", "warm", "dim", "cool", "alert"), "shape.ink")
    result = {**s, "k": k, "ink": ink}
    if "width" in s:
        _require_number(s["width"], "shape.width", positive=True)
    if k == "path":
        result["d"] = _validate_sketch_path(s.get("d"))
    elif k in ("line", "arrow"):
        result["from"] = _require_pair(s.get("from"), "shape.from")
        result["to"] = _require_pair(s.get("to"), "shape.to")
        if "label" in s:
            _require_text(s["label"], "shape.label")
    elif k == "circle":
        result["c"] = _require_pair(s.get("c"), "shape.c")
        _require_number(s.get("r"), "shape.r", positive=True)
    elif k == "rect":
        result["at"] = _require_pair(s.get("at"), "shape.at")
        result["size"] = _require_pair(s.get("size"), "shape.size", positive=True)
        if "r" in s:
            _require_number(s["r"], "shape.r", low=0)
    if k in ("rect", "circle") and "fill" in s and not isinstance(s["fill"], bool):
        _fail("invalid_value", "shape.fill")
    if k == "text":
        result["at"] = _require_pair(s.get("at"), "shape.at")
        _require_text(s.get("text"), "shape.text")
        size_raw = s.get("size")
        result["size"] = _require_choice("m" if size_raw is None else size_raw, ("s", "m", "l"), "shape.size")
    return result


def _secret_template_allowed(template: str) -> bool:
    if not _TEMPLATE_START_RE.match(template):
        return False
    return not _SCHEME_RE.match(template)   # text around the value, never a link that carries it somewhere


def _validate_block(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize a typed chat block (table, chart, timeline, diagram, sketch, secret)."""
    b = _require_object(raw, "block")
    bid = _require_id(b.get("id"), "block.id")
    if "title" in b:
        _require_text(b["title"], "block.title")
    if "tone" in b:
        _require_choice(b["tone"], ("default", "accent", "muted"), "block.tone")
    btype = b.get("type")
    out = json.loads(json.dumps(b))
    common = ("id", "type", "title", "tone")

    if btype == "secret":
        _require_fields(b, ("id", "type", "key", "label", "template"), bid)
        key = _require_text(b.get("key"), "secret.key")
        if not _SECRET_KEY_RE.match(key) or _SECRET_TEMP_RE.search(key):
            _fail("invalid_value", "secret.key: invalid store key")
        label = _require_text(b.get("label"), "secret.label")
        if not _trim(label) or len(label) > _LABEL_LIMIT or _LINE_BREAK_RE.search(label):
            _fail("invalid_value", f"secret.label: one line up to {_LABEL_LIMIT} chars")
        if "template" in b:
            tpl = _require_text(b["template"], "secret.template")
            if len(tpl) > _TEMPLATE_LIMIT or len(tpl.split("{value}")) != 2:
                _fail("invalid_value", f"secret.template: one {{value}} within {_TEMPLATE_LIMIT} chars")
            if not _secret_template_allowed(tpl):
                _fail("invalid_value", "secret.template: disallowed scheme or origin")
    elif btype == "timeline":
        _require_fields(b, (*common, "items"), bid)
        for item in _require_array(b.get("items"), "timeline.items"):
            rec = _require_object(item)
            _require_fields(rec, ("when", "label", "detail"), "timeline.item")
            _require_text(rec.get("when"), "timeline.when")
            _require_text(rec.get("label"), "timeline.label")
            if "detail" in rec:
                _require_text(rec["detail"], "timeline.detail")
    elif btype == "table":
        _require_fields(b, (*common, "columns", "rows"), bid)
        cols = _require_strings(b.get("columns"), "table.columns")
        for row in _require_array(b.get("rows"), "table.rows"):
            cells = _require_strings(row, "table.row")
            if len(cells) != len(cols):
                _fail("invalid_value", "table.row_width")
    elif btype == "chart":
        _require_fields(b, (*common, "kind", "labels", "series"), bid)
        _require_choice(b.get("kind"), ("line", "bar"), "chart.kind")
        labels = _require_strings(b.get("labels"), "chart.labels")
        for entry in _require_array(b.get("series"), "chart.series"):
            rec = _require_object(entry)
            _require_fields(rec, ("name", "values"), "chart.series")
            _require_text(rec.get("name"), "chart.name")
            vals = _require_array(rec.get("values"), "chart.values")
            for val in vals:
                _require_number(val, "chart.value")
            if len(vals) != len(labels):
                _fail("invalid_value", "chart.series_length")
    elif btype == "diagram":
        _require_fields(b, (*common, "nodes", "edges"), bid)
        node_ids: set[str] = set()
        for node in _require_array(b.get("nodes"), "diagram.nodes"):
            rec = _require_object(node)
            _require_fields(rec, ("id", "label", "x", "y"), "diagram.node")
            nid = _require_id(rec.get("id"))
            if nid in node_ids:
                _fail("duplicate_id", nid)
            node_ids.add(nid)
            _require_text(rec.get("label"), "diagram.label")
            if "x" in rec:
                _require_number(rec["x"], "diagram.x")
            if "y" in rec:
                _require_number(rec["y"], "diagram.y")
        for edge in _require_array(b.get("edges"), "diagram.edges"):
            rec = _require_object(edge)
            _require_fields(rec, ("from", "to", "label"), "diagram.edge")
            src_id, dst_id = rec.get("from"), rec.get("to")
            if src_id not in node_ids or dst_id not in node_ids:
                _fail("unknown_node", f"{src_id}/{dst_id}")
            if "label" in rec:
                _require_text(rec["label"], "diagram.label")
    elif btype == "sketch":
        _require_fields(b, (*common, "w", "h", "shapes"), bid)
        _require_number(b.get("w"), "sketch.w", high=1600, positive=True)
        _require_number(b.get("h"), "sketch.h", high=900, positive=True)
        shapes = _require_array(b.get("shapes"), "sketch.shapes")
        if len(shapes) > 400:
            _fail("limit", "sketch.shapes")
        out["shapes"] = [_validate_shape(item) for item in shapes]
        encoded = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(encoded) > SKETCH_BLOCK_BYTES:
            _fail("limit", "sketch.block")
    else:
        _fail("unknown_type", str(btype))

    return _normalize_diagram_block(out)


def _fence_block(kind: str, body: str, block_id: str) -> dict[str, Any]:
    where = f"{kind} fence"
    try:
        parsed = _parse_json(body)
        if not isinstance(parsed, dict):
            raise ValueError("not an object")
    except Exception:
        _fail("invalid_json", f"{where}: invalid JSON object")
    fields = _normalize_visual(kind, parsed)
    if "type" in fields and fields["type"] != kind:
        _fail("invalid_fence", f"{where}: mismatched type")
    return _validate_block({**fields, "type": kind, "id": block_id})


def _open_fence(body: str) -> dict[str, Any]:
    try:
        value = _parse_json(body)
    except Exception:
        _fail("invalid_json", "open fence: invalid JSON object")
    if not isinstance(value, dict):
        _fail("invalid_json", "open fence: invalid JSON object")
    if "url" in value:
        _fail("unsupported_target", "open.url: boards only")
    if "file" in value:
        _fail("unsupported_target", "open.file: use attach for files")
    for key in value:
        if key not in ("board", "title"):
            _fail("unknown_field", f"open.{key}")
    if "title" in value:
        title = value["title"]
        if not isinstance(title, str) or not _trim(title) or _utf16_len(title) > 200:
            _fail("invalid_value", "open.title: non-empty string up to 200 chars")
    board = value.get("board")
    if not isinstance(board, str) or not _trim(board):
        _fail("invalid_value", "open.board: a non-empty string")
    if _utf16_len(board) > 200 or _CTRL_RE.search(board):
        _fail("invalid_value", "open.board: at most 200 characters")
    segment: dict[str, Any] = {"type": "open", "target": {"kind": "board", "id": board}}
    if "title" in value:
        segment["title"] = value["title"]
    return segment


def _attach_fence(body: str) -> dict[str, Any]:
    paths = [_trim(line) for line in body.split("\n") if _trim(line)]
    if not paths:
        _fail("invalid_value", "attach: one file path a line")
    return {"type": "attach", "paths": paths}


def _clip_reason(err: _FenceError) -> str:
    text = f"{err.code}: {err.detail}"
    return text[:159] + "…" if len(text) > 160 else text


def segments(text: str, streaming: bool = False) -> list[dict[str, Any]]:
    """Split an assistant message into chat segments for Home's front-end."""
    lines = re.sub(r"\r\n?", "\n", text).split("\n")
    out: list[dict[str, Any]] = []
    run: list[str] = []
    index = 0
    blocks = 0

    def flush() -> None:
        nonlocal run
        start, end = 0, len(run)
        while start < end and not _trim(run[start]):
            start += 1
        while end > start and not _trim(run[end - 1]):
            end -= 1
        if end > start:
            out.append({"type": "md", "text": "\n".join(run[start:end])})
        run = []

    while index < len(lines):
        fence = _fence_at(lines, index)
        if fence is None:
            run.append(lines[index])
            index += 1
            continue
        index = fence.next_index
        kind = fence.kind
        lang = _first_token(kind)
        named = {"info": fence.info} if fence.info != lang else {}
        flush()
        body = "\n".join(fence.content)

        if not fence.closed and streaming:
            out.append({"type": "pending", "lang": lang, "text": body, **named})
            break

        secret_ref = kind == SECRET_FENCE and _ltrim(body).startswith("{")
        if kind not in CHAT_FENCES and kind not in ("open", ATTACH_FENCE) and not secret_ref:
            out.append({"type": "code", "lang": lang, "text": body, **named})
            continue

        if not fence.closed:
            out.append({"type": "code", "lang": lang, "text": body, "reason": "missing closing fence"})
            continue

        try:
            if kind == "open":
                out.append(_open_fence(body))
            elif kind == ATTACH_FENCE:
                out.append(_attach_fence(body))
            else:
                blk = _fence_block(kind, body, f"chat{blocks + 1}")
                seg: dict[str, Any] = {"type": "block", "block": blk}
                if kind == "diagram":
                    seg["legacyKind"] = "diagram"
                out.append(seg)
                blocks += 1
        except _FenceError as err:
            out.append({"type": "code", "lang": lang, "text": body, "reason": _clip_reason(err)})

    flush()
    return out


def _label(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    word = _trim(value)
    return word if word and _utf16_len(word) <= limit else None


def _one_line(value: Any, limit: int) -> str | None:
    word = _label(value, limit)
    return word if word and not _LINE_BREAK_RE.search(word) else None


def _is_plain(value: str) -> bool:
    return all(unicodedata.category(ch) not in ("Cc", "Cf") for ch in value)


def _is_text(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    for ch in value:
        code = ord(ch)
        if unicodedata.category(ch) == "Cf":
            return False
        if (code <= 0x1F and ch not in "\t\n\r") or code == 0x7F:
            return False
    return True


def _is_digest(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and bool(_HEX64_RE.match(value))


def _exact_keys(value: Any, names: tuple[str, ...]) -> bool:
    return isinstance(value, dict) and set(value.keys()) == set(names)


def _is_absolute_path(value: Any) -> bool:
    if not isinstance(value, str) or _utf16_len(value) > 300 or _trim(value) != value or not _is_plain(value):
        return False
    match = _ABS_PATH_RE.match(value)
    if not match:
        return False
    return all(part not in ("", ".", "..") for part in match.group(1).split("/")[1:])


def _is_page_url(value: Any) -> bool:
    return isinstance(value, str) and bool(_PAGE_URL_RE.match(value)) and _is_plain(value)


def _is_named(value: Any) -> bool:
    return _is_text(value) and bool(_trim(value))


def _is_chosen(value: Any) -> bool:
    if isinstance(value, bool):
        return True
    if _is_named(value):
        return True
    return isinstance(value, list) and len(value) > 0 and all(_is_named(item) for item in value)


def _parse_shown_content(value: dict[str, Any]) -> dict[str, Any] | None:
    if "form" in value:
        form = value["form"]
        if not (
            _exact_keys(form, ("page", "entries", "files", "choices", "publish"))
            and _is_page_url(form["page"])
            and _is_named(form["publish"])
            and isinstance(form["entries"], list)
            and all(
                _is_text(e) or (isinstance(e, list) and len(e) > 0 and all(_is_text(x) for x in e))
                for e in form["entries"]
            )
            and isinstance(form["files"], list)
            and all(_is_digest(f) for f in form["files"])
            and isinstance(form["choices"], list)
            and all(
                (
                    _exact_keys(c, ("name", "value"))
                    or _exact_keys(c, ("name", "group", "value"))
                )
                and _is_named(c["name"])
                and ("group" not in c or _is_named(c["group"]))
                and _is_chosen(c["value"])
                for c in form["choices"]
            )
        ):
            return None
        return {"form": form}
    edits = value.get("edits")
    if not (
        isinstance(edits, list)
        and len(edits) > 0
        and all(_exact_keys(e, ("page", "text")) and _is_page_url(e["page"]) and _is_text(e["text"]) for e in edits)
    ):
        return None
    return {"edits": edits}


def _parse_permission_target(kind: str, value: Any) -> dict[str, Any] | None:
    if kind == "send_as_owner" and isinstance(value, dict):
        content_key = next((k for k in ("form", "edits") if k in value), None)
        if content_key and (
            _exact_keys(value, ("to", content_key)) or _exact_keys(value, ("to", content_key, "sha256"))
        ):
            to = _trim(value["to"]) if isinstance(value["to"], str) else ""
            shown = _parse_shown_content(value)
            if not to or _utf16_len(to) > 80 or not _is_plain(to) or shown is None:
                return None
            if "sha256" in value and not _is_digest(value["sha256"]):
                return None
            res: dict[str, Any] = {"to": to, **shown}
            if "sha256" in value:
                res["sha256"] = value["sha256"]
            return res

        if (
            _exact_keys(value, ("to", "sha256"))
            or _exact_keys(value, ("to", "sha256", "attachments"))
            or _exact_keys(value, ("to", "sha256", "entries"))
        ):
            to = _trim(value["to"]) if isinstance(value["to"], str) else ""
            digest = value["sha256"]
            if not to or _utf16_len(to) > 80 or not _is_plain(to) or not _is_digest(digest):
                return None
            if "entries" in value:
                return {"to": to, "sha256": digest, "entries": int(value["entries"])} if _is_positive_int(value["entries"]) else None
            attachments = value["attachments"] if "attachments" in value else []
            if (
                not isinstance(attachments, list)
                or len(attachments) > 10
                or not all(_is_digest(item) for item in attachments)
                or len(set(attachments)) != len(attachments)
            ):
                return None
            res = {"to": to, "sha256": digest}
            if attachments:
                res["attachments"] = sorted(attachments)
            return res
        return None

    if kind == "delete" and _exact_keys(value, ("paths",)) and isinstance(value["paths"], list):
        paths = value["paths"]
        if 1 <= len(paths) <= 10 and all(_is_absolute_path(p) for p in paths) and len(set(paths)) == len(paths):
            return {"paths": list(paths)}
        return None

    if kind == "payment" and _exact_keys(value, ("payee", "cap")) and _exact_keys(value["cap"], ("amount", "currency")):
        payee = _trim(value["payee"]) if isinstance(value["payee"], str) else ""
        amount = value["cap"]["amount"]
        currency = value["cap"]["currency"]
        if (
            payee
            and _utf16_len(payee) <= 80
            and _is_plain(payee)
            and _is_number(amount)
            and 0 < amount <= 1e12
            and isinstance(currency, str)
            and bool(_CURRENCY_RE.match(currency))
        ):
            return {"payee": payee, "cap": {"amount": amount, "currency": currency}}
        return None

    return None


def _parse_permission(value: Any) -> dict[str, Any] | None:
    if (
        not _exact_keys(value, ("kind", "goal", "target"))
        or value["kind"] not in _PERMIT_KINDS
        or not _is_positive_int(value["goal"])
    ):
        return None
    aim = _parse_permission_target(value["kind"], value["target"])
    if aim is None:
        return None
    return {"kind": value["kind"], "goal": int(value["goal"]), "target": aim}


def _parse_option(value: Any) -> dict[str, str] | None:
    if isinstance(value, str):
        word = _label(value, OPTION_MAX)
        return {"label": word} if word else None
    if not isinstance(value, dict) or any(k not in ("label", "line", "media") for k in value):
        return None
    word = _label(value.get("label"), OPTION_MAX)
    under = _one_line(value["line"], LINE_MAX) if "line" in value else ""
    media_ok = "media" not in value or (isinstance(value["media"], list) and 1 <= len(value["media"]) <= 6)
    return {"label": word, "line": under} if word and under is not None and media_ok else None


def _valid_revokes(spec: dict[str, Any]) -> bool:
    supersedes = spec.get("supersedes")
    phrases = spec.get("supersede_phrases")
    if supersedes is None:
        return phrases is None
    if not isinstance(supersedes, list) or not all(isinstance(i, str) and _trim(i) for i in supersedes):
        return False
    if phrases is None:
        return True
    return (
        isinstance(phrases, list)
        and len(phrases) <= 3
        and all(isinstance(p, str) and 3 <= _utf16_len(_trim(p)) <= 40 for p in phrases)
    )


def choice_spec(body: str) -> dict[str, Any] | None:
    """Parse a ```choices fence body the way the front-end's choices parser does."""
    if body is None:
        return None
    try:
        spec = _parse_json(str(body))
    except Exception:
        return None
    if (
        not isinstance(spec, dict)
        or ("options" in spec) == ("rows" in spec)
        or any(k not in _CHOICE_KEYS for k in spec)
        or (spec.get("replaces") is not None and not _is_positive_int(spec["replaces"]))
        or ("project" in spec and not _is_positive_int(spec["project"]))
        or not _valid_revokes(spec)
    ):
        return None

    routing: dict[str, Any] = {}
    if _is_positive_int(spec.get("step")):
        routing["step"] = int(spec["step"])
    if "project" in spec:
        routing["project"] = int(spec["project"])

    if "options" in spec:
        raw_options = spec["options"]
        given = [_parse_option(item) for item in raw_options] if isinstance(raw_options, list) else []
        labels = [item["label"] for item in given if item is not None]
        if (
            not (2 <= len(given) <= 6)
            or len(labels) != len(given)
            or len(set(labels)) != len(labels)
            or "permission" in spec
        ):
            return None
        q = _one_line(spec["q"], Q_MAX) if "q" in spec else ""
        if (
            q is None
            or ("guess" in spec and spec["guess"] not in labels)
            or ("plan" in spec and not _is_positive_int(spec["plan"]))
        ):
            return None
        lines = [item.get("line", "") for item in given]
        out: dict[str, Any] = {"options": labels}
        if any(lines):
            out["lines"] = lines
        if q:
            out["q"] = q
        if "guess" in spec:
            out["guess"] = spec["guess"]
        if spec.get("plan"):
            out["plan"] = int(spec["plan"])
        out.update(routing)
        return out

    if any(key in spec for key in ("q", "guess", "plan")):
        return None
    raw_rows = spec["rows"]
    if not isinstance(raw_rows, list) or not (1 <= len(raw_rows) <= 8):
        return None
    rows: list[dict[str, str]] = []
    for item in raw_rows:
        if not isinstance(item, dict) or any(k not in ("q", "guess") for k in item):
            return None
        rq = _label(item.get("q"), ROW_MAX)
        guess = item.get("guess")
        if not rq or guess not in (YES, NO):
            return None
        rows.append({"q": rq, "guess": guess})

    if "permission" not in spec:
        return {"rows": rows, **routing}
    permission = _parse_permission(spec["permission"])
    if permission is None or len(rows) != 1:
        return None
    return {"rows": rows, **routing, "permission": permission}


def _js_truthy(value: Any) -> bool:
    if value is None or value is _UNDEF or value is False or value == "":
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0 and not math.isnan(value)
    return True


def _js_eq(a: Any, b: Any) -> bool:
    if a is _UNDEF or b is _UNDEF:
        return a is b
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    return type(a) is type(b) and a == b


def _get_field(obj: Any, key: str) -> Any:
    return obj[key] if isinstance(obj, dict) and key in obj else _UNDEF


def _same_list(a: Any, b: Any, pred) -> bool:
    return isinstance(a, list) and isinstance(b, list) and len(a) == len(b) and all(pred(x, y) for x, y in zip(a, b))


def _same_value(x: Any, y: Any) -> bool:
    return _same_list(x, y, _same_value) if isinstance(x, list) else _js_eq(x, y)


def _same_content(a: Any, b: Any) -> bool:
    ta, tb = _js_truthy(a), _js_truthy(b)
    if ta != tb:
        return False
    if not ta:
        return True
    if isinstance(a, list):
        return _same_list(a, b, lambda x, y: _js_eq(_get_field(x, "page"), _get_field(y, "page"))
                          and _js_eq(_get_field(x, "text"), _get_field(y, "text")))
    return (
        _js_eq(_get_field(a, "page"), _get_field(b, "page"))
        and _js_eq(_get_field(a, "publish"), _get_field(b, "publish"))
        and _same_list(_get_field(a, "entries"), _get_field(b, "entries"), _same_value)
        and _same_list(_get_field(a, "files"), _get_field(b, "files"), _same_value)
        and _same_list(
            _get_field(a, "choices"),
            _get_field(b, "choices"),
            lambda x, y: _js_eq(_get_field(x, "name"), _get_field(y, "name"))
            and _js_eq(_get_field(x, "group"), _get_field(y, "group"))
            and _same_value(_get_field(x, "value"), _get_field(y, "value")),
        )
    )


def _same_permission(a: Any, b: Any) -> bool:
    ta, tb = _js_truthy(a), _js_truthy(b)
    if not ta or not tb:
        return ta == tb
    at, bt = _get_field(a, "target"), _get_field(b, "target")
    a_sha, b_sha = _get_field(at, "sha256"), _get_field(bt, "sha256")
    a_form, b_form = _get_field(at, "form"), _get_field(bt, "form")
    a_edits, b_edits = _get_field(at, "edits"), _get_field(bt, "edits")
    sha_ok = _js_eq(a_sha, b_sha) or (
        (_js_truthy(a_form) or _js_truthy(a_edits)) and not (_js_truthy(a_sha) and _js_truthy(b_sha))
    )
    a_att = _get_field(at, "attachments")
    b_att = _get_field(bt, "attachments")
    a_att = [] if a_att in (_UNDEF, None) else a_att
    b_att = [] if b_att in (_UNDEF, None) else b_att
    a_cap, b_cap = _get_field(at, "cap"), _get_field(bt, "cap")
    return (
        _js_eq(_get_field(a, "kind"), _get_field(b, "kind"))
        and _js_eq(_get_field(a, "goal"), _get_field(b, "goal"))
        and _js_eq(_get_field(at, "to"), _get_field(bt, "to"))
        and sha_ok
        and _same_content(a_form, b_form)
        and _same_content(a_edits, b_edits)
        and _same_list(a_att, b_att, _js_eq)
        and (_get_field(a, "kind") != "delete" or _same_list(_get_field(at, "paths"), _get_field(bt, "paths"), _js_eq))
        and _js_eq(_get_field(at, "payee"), _get_field(bt, "payee"))
        and _js_eq(_get_field(a_cap, "amount"), _get_field(b_cap, "amount"))
        and _js_eq(_get_field(a_cap, "currency"), _get_field(b_cap, "currency"))
    )


def _nullish(obj: Any, key: str) -> Any:
    val = _get_field(obj, key)
    return None if val in (_UNDEF, None) else val


def same_spec(a: Any, b: Any) -> bool:
    """True when two parsed choices specs describe the same question record."""
    if not (_js_truthy(a) and _js_truthy(b)):
        return False
    if not (
        _js_eq(_nullish(a, "step"), _nullish(b, "step"))
        and _same_permission(_get_field(a, "permission"), _get_field(b, "permission"))
        and _js_eq(_nullish(a, "project"), _nullish(b, "project"))
    ):
        return False
    a_opts, b_opts = _get_field(a, "options"), _get_field(b, "options")
    if _js_truthy(a_opts) or _js_truthy(b_opts):
        return _same_list(a_opts, b_opts, _js_eq)
    return _same_list(
        _get_field(a, "rows"),
        _get_field(b, "rows"),
        lambda x, y: _js_eq(_get_field(x, "q"), _get_field(y, "q"))
        and _js_eq(_get_field(x, "guess"), _get_field(y, "guess")),
    )
