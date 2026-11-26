"""The App's Workspace read side: project trees, file reading, name find, text search, hover previews,
reports and live file-watch frames, confined to the home's registered project roots (wire.py).

Every path is vetted lexically (absolute, no `..`, no control bytes, no denied credential store) and
again after resolving symlinks so nothing outside a project root can be listed, read, searched or
watched. No write route exists here.
"""

from __future__ import annotations

from collections import OrderedDict
import csv
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import threading
import time
import unicodedata
from urllib.parse import quote
import weakref

from .. import boards
from . import owner
from .wire import Refused

# Caps on listing, reading, indexing, searching and watching.
MAX_TREE_ENTRIES = 1000
MAX_TREE_SCAN = 20_000
MAX_TEXT_BYTES = 512 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_DOWNLOAD_BYTES = 16 * 1024 * 1024
MAX_PREVIEW_BYTES = 16 * 1024
MAX_TITLE_BYTES = 8 * 1024
MAX_PREVIEW_LINES = 8
MAX_LINE_CHARS = 200
MAX_DOC_BLOCKS = 2000
MAX_CSV_ROWS = 500
MAX_CSV_COLS = 50
MAX_INDEX_ENTRIES = 20_000
MAX_INDEX_DEPTH = 20
MAX_FIND_RESULTS = 50
MAX_SEARCH_HITS = 200
MAX_SEARCH_PER_FILE = 5
MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024
MAX_SEARCH_FILES = 10_000
MAX_SEARCH_SECONDS = 5.0
MAX_SNIPPET_CHARS = 240
MAX_CONCURRENT_SEARCHES = 2
MAX_REPORTS = 200
MAX_WATCH_TARGETS = 20
MAX_TARGET_LEN = 4200
MAX_ASSET_ENTRIES = 64
MAX_ASSET_CACHE_BYTES = 32 * 1024 * 1024
WATCH_POLL_SECONDS = 0.25

IMMUTABLE_CACHE = "private, max-age=31536000, immutable"
STREAM_ID_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}\Z")
ASSET_KEY_RE = re.compile(r"^[0-9a-f]{64}\.(?:png|jpe?g|webp|gif)\Z")
CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")
NUMBER_RE = re.compile(r"^(?:#|g)?([1-9]\d{0,14})\Z")
NATURAL_RE = re.compile(r"(\d+)")
HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t#]*\Z")
FENCE_OPEN_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)\Z")
TABLE_SEP_RE = re.compile(r"^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\Z")

# Listed folded in the Explorer and skipped during find, search and report scans.
FOLDED_DIRS = frozenset({
    "node_modules", ".git", "dist", "build", "target", "__pycache__",
    ".venv", "venv", ".next", ".nuxt", ".cache", ".scratch", ".turbo", "coverage",
})

# Credential stores and sensitive files that are never listed, read, searched or watched.
DENIED_NAMES = frozenset({
    ".ssh", ".gnupg", ".aws", ".kube", ".docker", ".artemis",
    ".claude", ".codex", ".config", ".local",
    ".npmrc", ".netrc", ".pgpass", ".htpasswd", ".s3cfg", ".boto",
    ".pypirc", ".my.cnf", "auth.json",
})
DENIED_PREFIXES = (".env", "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa")
DENIED_SUFFIXES = (
    ".pem", ".key", ".p12", ".pfx", ".p8", ".ppk", ".jks", ".keystore",
    ".sqlite", ".sqlite3", ".db", ".kdbx", ".env",
    "_rsa", "_dsa", "_ecdsa", "_ed25519", ".asc", ".gpg",
    ".tfstate", ".tfstate.backup", ".tfvars", "_history",
)
PROFILE_MARKERS = frozenset({
    "local state", "cookies", "login data", "logins.json", "key4.db", "cookies.sqlite",
})

IMAGE_EXTS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
MARKDOWN_EXTS = frozenset({".md", ".markdown"})
CSV_EXTS = frozenset({".csv"})
TEXT_EXTS = frozenset({
    ".txt", ".log", ".json", ".jsonl", ".yaml", ".yml", ".toml",
    ".py", ".pyi", ".pyw", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx",
    ".sh", ".bash", ".zsh", ".sql", ".css", ".html", ".htm", ".xml", ".svg",
    ".diff", ".patch", ".ini", ".cfg", ".conf", ".go", ".rs", ".c", ".h",
    ".cpp", ".cc", ".cxx", ".hpp", ".java", ".kt", ".rb", ".lua", ".swift",
    ".rst", ".tex", ".dockerfile", ".makefile", ".gitignore", ".editorconfig",
})
BINARY_EXTS = frozenset({
    ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".class", ".jar", ".war",
    ".wasm", ".pyc", ".pyo", ".whl", ".egg", ".zip", ".gz", ".tgz", ".bz2", ".xz",
    ".zst", ".7z", ".rar", ".tar", ".iso", ".dmg", ".img", ".deb", ".rpm", ".apk",
    ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".mp4", ".webm", ".mov",
    ".avi", ".mkv", ".ttf", ".otf", ".woff", ".woff2", ".eot", ".ico", ".bmp",
    ".tif", ".tiff", ".psd", ".heic", ".avif", ".pdf", ".doc", ".docx", ".xls",
    ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".parquet", ".feather",
    ".arrow", ".npy", ".npz", ".pkl", ".pickle", ".pt", ".pth", ".onnx",
    ".safetensors", ".h5", ".hdf5",
})

SEARCH_SCOPES: dict[str, frozenset[str]] = {
    "docs": frozenset({".md", ".txt", ".html", ".htm", ".csv"}),
    "files": frozenset({
        ".md", ".txt", ".csv", ".json", ".html", ".htm", ".py", ".ts", ".tsx",
        ".js", ".jsx", ".mjs", ".cjs", ".yaml", ".yml", ".toml", ".sh", ".sql",
        ".css", ".rs", ".go",
    }),
}

MIME_BY_EXT: dict[str, str] = {
    ".md": "text/markdown; charset=utf-8",
    ".markdown": "text/markdown; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

FIND_BONUS = {"goal": 30, "board": 25, "report": 20, "approval": 15, "request": 10, "dir": 5, "file": 0}


@dataclass(frozen=True)
class ProjectRoot:
    """One active project registered in the home's ledger."""
    name: str
    raw: str
    real: str


@dataclass(frozen=True)
class VettedPath:
    """A path confirmed to sit inside a registered project root with no denied component."""
    root: ProjectRoot
    path: str
    real: str
    is_dir: bool
    stat: os.stat_result


@dataclass
class _StreamWatches:
    """One open /events?ide= stream and the targets it asked to watch."""
    thread: threading.Thread
    targets: dict[str, tuple[str, object]] = field(default_factory=dict)


class _WorkspaceState:
    """Per-server runtime state: bounded image asset cache, search gate and watch poller."""

    def __init__(self, server):
        self.server = server
        self.lock = threading.Lock()
        self.assets: OrderedDict[str, tuple[bytes, str]] = OrderedDict()
        self.asset_bytes = 0
        self.streams: dict[str, _StreamWatches] = {}
        self.poller: threading.Thread | None = None
        self.search_gate = threading.BoundedSemaphore(MAX_CONCURRENT_SEARCHES)

    def put_asset(self, data: bytes, ext: str) -> str:
        digest = hashlib.sha256(data).hexdigest()
        clean_ext = ext.lstrip(".").lower()
        name = f"{digest}.{clean_ext}"
        content_type = MIME_BY_EXT.get(f".{clean_ext}", "application/octet-stream")
        with self.lock:
            if name in self.assets:
                self.assets.move_to_end(name)
                return name
            if len(data) <= MAX_ASSET_CACHE_BYTES:
                self.assets[name] = (data, content_type)
                self.asset_bytes += len(data)
                while len(self.assets) > MAX_ASSET_ENTRIES or self.asset_bytes > MAX_ASSET_CACHE_BYTES:
                    _, (evicted, _) = self.assets.popitem(last=False)
                    self.asset_bytes -= len(evicted)
        return name

    def get_asset(self, name: str) -> tuple[bytes, str] | None:
        with self.lock:
            found = self.assets.get(name)
            if found is not None:
                self.assets.move_to_end(name)
            return found

    def register_stream(self, stream_id: str, thread: threading.Thread) -> None:
        with self.lock:
            self._prune_locked()
            self.streams[stream_id] = _StreamWatches(thread=thread)

    def set_watches(self, stream_id: str, watched: dict[str, tuple[str, object]]) -> bool:
        with self.lock:
            self._prune_locked()
            entry = self.streams.get(stream_id)
            if entry is None:
                return False
            entry.targets = watched
            if watched and (self.poller is None or not self.poller.is_alive()):
                self.poller = threading.Thread(
                    target=self._poll_loop, name="artemis-workspace-watch", daemon=True,
                )
                self.poller.start()
            return True

    def _prune_locked(self) -> None:
        dead = [sid for sid, entry in self.streams.items() if not entry.thread.is_alive()]
        for sid in dead:
            del self.streams[sid]

    def _poll_loop(self) -> None:
        server = self.server
        while not server.closing.wait(WATCH_POLL_SECONDS):
            with self.lock:
                self._prune_locked()
                active = [
                    (sid, dict(entry.targets))
                    for sid, entry in self.streams.items()
                    if entry.targets
                ]
                if not active:
                    self.poller = None
                    return
            roots = _project_roots(server.home.ledger)
            updates: list[tuple[str, str, str, object, str | None]] = []
            for sid, targets in active:
                for target, (kind, previous) in targets.items():
                    current, mtime = _target_stamp(server.home.ledger, roots, kind, target)
                    if current != previous:
                        updates.append((sid, target, kind, current, mtime))
            if not updates:
                continue
            with self.lock:
                for sid, target, kind, current, mtime in updates:
                    entry = self.streams.get(sid)
                    if entry is not None and target in entry.targets:
                        entry.targets[target] = (kind, current)
            for sid, target, _, _, mtime in updates:
                server.home.publish("ide.changed", {"stream": sid, "target": target, "mtime": mtime})


_STATES: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()
_STATES_LOCK = threading.Lock()


def _state(server) -> _WorkspaceState:
    with _STATES_LOCK:
        found = _STATES.get(server)
        if found is None:
            found = _WorkspaceState(server)
            _STATES[server] = found
        return found


# --- Refusals & query parsing ---

def _refuse(status: int, code: str, detail: str) -> None:
    raise Refused(status, code, ok=False, detail=detail)


def _params(handler, allowed: tuple[str, ...], required: tuple[str, ...] = ()) -> dict[str, str | None]:
    for key, values in handler.query.items():
        if key not in allowed:
            _refuse(400, "bad_request", f"unknown parameter {key}")
        if len(values) > 1:
            _refuse(400, "bad_request", f"duplicate parameter {key}")
    for key in required:
        if key not in handler.query or not handler.query[key]:
            _refuse(400, "bad_request", f"missing parameter {key}")
    return {key: handler.query[key][0] if key in handler.query and handler.query[key] else None for key in allowed}


def _query_text(raw: str | None, min_len: int) -> str:
    if raw is None or len(raw) > 200 or CTRL_RE.search(raw):
        _refuse(400, "bad_request", f"q: {min_len} to 200 printable characters")
    text = raw.strip()
    if len(text) < min_len:
        _refuse(400, "bad_request", f"q: at least {min_len} character(s)")
    return text


def _iso(timestamp: float | None) -> str | None:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat() if timestamp is not None else None


def _sort_key(name: str) -> tuple:
    parts = [int(chunk) if chunk.isdigit() else chunk.casefold() for chunk in NATURAL_RE.split(name)]
    return (parts, name)


# --- Confinement, deny-list & safe reading ---

def _project_roots(ledger) -> list[ProjectRoot]:
    """Active registered projects whose directory currently exists on disk."""
    roots: list[ProjectRoot] = []
    seen_real: set[str] = set()
    for row in ledger.projects():
        raw_path = row["path"]
        if not raw_path:
            continue
        raw = os.path.normpath(os.path.abspath(raw_path))
        try:
            real = os.path.realpath(raw)
            if not os.path.isdir(real):
                continue
        except OSError:
            continue
        if real in seen_real:
            continue
        seen_real.add(real)
        roots.append(ProjectRoot(name=str(row["name"]), raw=raw, real=real))
    return roots


def _is_denied_name(name: str) -> bool:
    forms = (name.lower(), unicodedata.normalize("NFKC", name).lower())
    for folded in forms:
        if folded in DENIED_NAMES:
            return True
        if any(folded.startswith(prefix) for prefix in DENIED_PREFIXES):
            return True
        if any(folded.endswith(suffix) for suffix in DENIED_SUFFIXES):
            return True
    return False


def _is_profile_dir(directory: str, memo: dict[str, bool]) -> bool:
    cached = memo.get(directory)
    if cached is not None:
        return cached
    found = False
    try:
        with os.scandir(directory) as entries:
            for entry in entries:
                lower = entry.name.lower()
                if lower in PROFILE_MARKERS or unicodedata.normalize("NFKC", entry.name).lower() in PROFILE_MARKERS:
                    found = True
                    break
    except OSError:
        found = False
    memo[directory] = found
    return found


def _under(path: str, base: str) -> bool:
    return path == base or path.startswith(base + os.sep)


def _rel_parts(path: str, base: str) -> list[str]:
    if path == base:
        return []
    return path[len(base) + 1:].split(os.sep)


def _match_root(roots: list[ProjectRoot], path: str, *, real_only: bool = False) -> tuple[ProjectRoot, str] | None:
    """Return the deepest matching root and the matched prefix."""
    best: tuple[ProjectRoot, str] | None = None
    for root in roots:
        bases = (root.real,) if real_only else (root.real, root.raw)
        for base in bases:
            if _under(path, base) and (best is None or len(base) > len(best[1])):
                best = (root, base)
    return best


def _vet_path(roots: list[ProjectRoot], raw_path: str, memo: dict[str, bool] | None = None) -> VettedPath:
    """Confine a caller-supplied path to a registered project root and reject traversal, escapes and secrets."""
    if not isinstance(raw_path, str) or not raw_path or "\x00" in raw_path or "\r" in raw_path or "\n" in raw_path:
        _refuse(403, "forbidden", "invalid path")
    if not os.path.isabs(raw_path):
        _refuse(403, "forbidden", "path must be absolute")
    # Lexical check before touching the filesystem: reject any `..` component (POSIX or backslash).
    if ".." in re.split(r"[/\\]", raw_path):
        _refuse(403, "forbidden", "path traversal is not allowed")

    norm = os.path.normpath(raw_path)
    matched = _match_root(roots, norm, real_only=False)
    if matched is None:
        _refuse(403, "forbidden", "path is outside every project root")
    lex_root, lex_base = matched
    for part in _rel_parts(norm, lex_base):
        if _is_denied_name(part):
            _refuse(403, "forbidden", "path is restricted")

    # Resolve symlinks and re-verify containment before checking existence, so escapes always get 403.
    try:
        real = os.path.realpath(norm)
    except OSError:
        _refuse(403, "forbidden", "cannot resolve path")
    real_matched = _match_root(roots, real, real_only=True)
    if real_matched is None:
        _refuse(403, "forbidden", "symlink leaves every project root")
    real_root, real_base = real_matched
    real_parts = _rel_parts(real, real_base)
    for part in real_parts:
        if _is_denied_name(part):
            _refuse(403, "forbidden", "path is restricted")

    if memo is None:
        memo = {}
    walk = real_root.real
    if _is_profile_dir(walk, memo):
        _refuse(403, "forbidden", "path is inside a restricted profile")
    for part in real_parts[:-1]:
        walk = os.path.join(walk, part)
        if _is_profile_dir(walk, memo):
            _refuse(403, "forbidden", "path is inside a restricted profile")

    try:
        st = os.stat(real)
    except FileNotFoundError:
        _refuse(404, "not_found", "path does not exist")
    except PermissionError:
        _refuse(403, "forbidden", "cannot read path")
    except OSError:
        _refuse(404, "not_found", "cannot access path")

    is_dir = stat.S_ISDIR(st.st_mode)
    if is_dir:
        if _is_profile_dir(real, memo):
            _refuse(403, "forbidden", "folder is restricted")
    elif not stat.S_ISREG(st.st_mode):
        _refuse(403, "forbidden", "only regular files and folders are served")

    canonical = os.path.join(lex_root.real, *_rel_parts(norm, lex_base)) if lex_base == lex_root.raw else norm
    return VettedPath(root=real_root, path=canonical, real=real, is_dir=is_dir, stat=st)


def _read_regular_file(real: str, max_bytes: int, *, truncate: bool = False) -> tuple[bytes, os.stat_result, bool]:
    """Read bytes from an already-vetted real path without following symlinks or blocking on special files."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_BINARY", 0)
    try:
        fd = os.open(real, flags)
    except FileNotFoundError:
        _refuse(404, "not_found", "file not found")
    except PermissionError:
        _refuse(403, "forbidden", "cannot open file")
    except OSError:
        _refuse(403, "forbidden", "cannot open file")
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            _refuse(403, "forbidden", "not a regular file")
        if not truncate and st.st_size > max_bytes:
            _refuse(413, "too_large", f"file exceeds {max_bytes} bytes")
        chunks: list[bytes] = []
        total = 0
        limit = max_bytes + 1
        while total < limit:
            piece = os.read(fd, min(65536, limit - total))
            if not piece:
                break
            chunks.append(piece)
            total += len(piece)
        raw = b"".join(chunks)
        if len(raw) > max_bytes:
            if not truncate:
                _refuse(413, "too_large", f"file exceeds {max_bytes} bytes")
            return raw[:max_bytes], st, True
        return raw, st, False
    finally:
        os.close(fd)


def _vet_entry(entry: os.DirEntry, parent_real: str, roots: list[ProjectRoot],
               memo: dict[str, bool]) -> tuple[str, bool, os.stat_result] | None:
    """Return (kind, is_link, stat) if a directory entry may be shown, or None to omit it."""
    name = entry.name
    if _is_denied_name(name):
        return None
    is_link = entry.is_symlink()
    full = os.path.join(parent_real, name)
    if is_link:
        try:
            target = os.path.realpath(full)
        except OSError:
            return None
        matched = _match_root(roots, target, real_only=True)
        if matched is None:
            return None
        root, base = matched
        if any(_is_denied_name(part) for part in _rel_parts(target, base)):
            return None
        walk = root.real
        if _is_profile_dir(walk, memo):
            return None
        for part in _rel_parts(target, base)[:-1]:
            walk = os.path.join(walk, part)
            if _is_profile_dir(walk, memo):
                return None
        real = target
    else:
        real = full
    try:
        st = os.stat(real)
    except OSError:
        return None
    if stat.S_ISDIR(st.st_mode):
        if _is_profile_dir(real, memo):
            return None
        return "dir", is_link, st
    if stat.S_ISREG(st.st_mode):
        return "file", is_link, st
    return None


# --- Text classification, scrubbing & markdown rendering ---

def _scrub_count(scrub, text: str) -> tuple[str, int]:
    cleaned = scrub(text)
    if cleaned == text:
        return cleaned, 0
    return cleaned, max(1, cleaned.count("[secret:"))


def _is_textual(text: str) -> bool:
    if "\x00" in text:
        return False
    if not text:
        return True
    bad = sum(1 for ch in text if (ord(ch) < 32 and ch not in "\t\n\r\x1b") or ord(ch) == 127 or ch == "\ufffd")
    return bad <= len(text) / 100


def _file_kind(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in MARKDOWN_EXTS:
        return "md"
    if ext in CSV_EXTS:
        return "sheet"
    if ext in IMAGE_EXTS:
        return "image"
    if ext in BINARY_EXTS:
        return "binary"
    if ext in TEXT_EXTS:
        return "text"
    return "text?"


def _clip_line(line: str, limit: int = MAX_LINE_CHARS) -> str:
    compact = " ".join(line.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


def _preview_lines(text: str, scrub, max_lines: int = MAX_PREVIEW_LINES) -> list[str]:
    cleaned = scrub(text)
    out: list[str] = []
    for raw in cleaned.splitlines():
        line = _clip_line(raw)
        if not line:
            continue
        out.append(line)
        if len(out) >= max_lines:
            break
    return out


def _markdown_heading(text: str) -> str | None:
    for line in text.splitlines():
        match = HEADING_RE.match(line)
        if match and len(match.group(1)) == 1:
            return match.group(2).strip()
    return None


def _split_table_row(line: str) -> list[str]:
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _markdown_blocks(text: str, fallback_title: str) -> tuple[str, list[dict]]:
    """Turn Markdown text into board blocks (heading, text, code, table) for the App's document view."""
    lines = text.splitlines()
    blocks: list[dict] = []
    para: list[str] = []
    title: str | None = None
    index = 0

    def flush_para() -> None:
        if not para or len(blocks) >= MAX_DOC_BLOCKS:
            para.clear()
            return
        body = "\n".join(para).strip()
        para.clear()
        if body:
            blocks.append({"id": f"b{len(blocks) + 1}", "type": "text", "text": body})

    while index < len(lines) and len(blocks) < MAX_DOC_BLOCKS:
        line = lines[index]
        fence = FENCE_OPEN_RE.match(line)
        if fence:
            flush_para()
            marker = fence.group(1)
            char, width = marker[0], len(marker)
            lang = fence.group(2).strip().split(None, 1)[0] if fence.group(2).strip() else "text"
            code_lines: list[str] = []
            index += 1
            close_re = re.compile(rf"^ {{0,3}}{re.escape(char)}{{{width},}}[ \t]*\Z")
            while index < len(lines) and not close_re.match(lines[index]):
                code_lines.append(lines[index])
                index += 1
            if index < len(lines):
                index += 1
            blocks.append({"id": f"b{len(blocks) + 1}", "type": "code", "lang": lang, "text": "\n".join(code_lines)})
            continue

        heading = HEADING_RE.match(line)
        if heading:
            flush_para()
            level = min(3, len(heading.group(1)))
            heading_text = heading.group(2).strip()
            if title is None and len(heading.group(1)) == 1:
                title = heading_text
            blocks.append({"id": f"b{len(blocks) + 1}", "type": "heading", "level": level, "text": heading_text})
            index += 1
            continue

        if "|" in line and index + 1 < len(lines) and TABLE_SEP_RE.match(lines[index + 1].strip()):
            flush_para()
            columns = _split_table_row(line)
            index += 2
            rows: list[list[str]] = []
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                row = _split_table_row(lines[index])
                row = (row + [""] * len(columns))[:len(columns)]
                rows.append(row)
                index += 1
            blocks.append({"id": f"b{len(blocks) + 1}", "type": "table", "columns": columns, "rows": rows})
            continue

        if not line.strip():
            flush_para()
            index += 1
            continue

        para.append(line)
        index += 1

    flush_para()
    if not blocks:
        blocks.append({"id": "b1", "type": "text", "text": ""})
    return title or fallback_title, blocks


def _scrub_blocks(blocks: list[dict], scrub) -> tuple[list[dict], int]:
    total = 0
    out: list[dict] = []
    for block in blocks:
        copy = dict(block)
        for key in ("text", "title", "lang", "alt"):
            if isinstance(copy.get(key), str):
                copy[key], count = _scrub_count(scrub, copy[key])
                total += count
        if isinstance(copy.get("columns"), list):
            cols = []
            for cell in copy["columns"]:
                clean, count = _scrub_count(scrub, str(cell))
                cols.append(clean)
                total += count
            copy["columns"] = cols
        if isinstance(copy.get("rows"), list):
            cleaned_rows = []
            for row in copy["rows"]:
                cleaned_row = []
                for cell in row:
                    clean, count = _scrub_count(scrub, str(cell))
                    cleaned_row.append(clean)
                    total += count
                cleaned_rows.append(cleaned_row)
            copy["rows"] = cleaned_rows
        out.append(copy)
    return out, total


# --- Scoring & search helpers ---

def _name_score(needle: str, text: str) -> float:
    lower = text.lower()
    if lower == needle:
        base = 1000.0
    elif lower.startswith(needle):
        base = 800.0
    else:
        at = lower.find(needle)
        if at > 0:
            prev = text[at - 1]
            word_start = (not prev.isalnum()) or (prev.islower() and text[at].isupper())
            base = 600.0 if word_start else 400.0
        else:
            idx, gaps, last = 0, 0, -1
            for pos, ch in enumerate(lower):
                if ch == needle[idx]:
                    if last >= 0 and pos > last + 1:
                        gaps += 1
                    last = pos
                    idx += 1
                    if idx == len(needle):
                        break
            if idx < len(needle):
                return 0.0
            base = max(1.0, 200.0 - gaps * 20.0)
    return base - min(len(text), 200) / 10.0


def _make_snippet(line: str, match_start: int, scrub) -> str:
    clean_line = scrub(line.rstrip("\r\n"))
    if len(clean_line) <= MAX_SNIPPET_CHARS:
        return " ".join(clean_line.split())
    half = MAX_SNIPPET_CHARS // 2
    start = max(0, match_start - half)
    end = min(len(clean_line), start + MAX_SNIPPET_CHARS)
    start = max(0, end - MAX_SNIPPET_CHARS)
    piece = " ".join(clean_line[start:end].split())
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(clean_line) else ""
    return f"{prefix}{piece}{suffix}"


def _list_reports(roots: list[ProjectRoot], scrub) -> dict:
    """Discover REPORT.md, RESEARCH.md (root or 1 subfolder deep) and reports/*.md across project roots."""
    found: list[tuple[float, str, str, str, str]] = []
    memo: dict[str, bool] = {}
    skipped = 0

    def inspect_report(root: ProjectRoot, path: str, rel_label: str) -> None:
        nonlocal skipped
        try:
            vetted = _vet_path(roots, path, memo)
        except Refused:
            return
        if vetted.is_dir:
            return
        found.append((vetted.stat.st_mtime, vetted.path, vetted.real, root.name, rel_label))

    for root in roots:
        if _is_profile_dir(root.real, memo):
            continue
        for name in ("REPORT.md", "RESEARCH.md"):
            candidate = os.path.join(root.real, name)
            if os.path.lexists(candidate):
                inspect_report(root, candidate, f"{root.name}/{name}")
        try:
            with os.scandir(root.real) as top:
                for entry in top:
                    if entry.name in FOLDED_DIRS or _is_denied_name(entry.name):
                        continue
                    try:
                        vetted = _vet_entry(entry, root.real, roots, memo)
                    except PermissionError:
                        skipped += 1
                        continue
                    if vetted is None or vetted[0] != "dir":
                        continue
                    sub = os.path.join(root.real, entry.name)
                    if entry.name == "reports":
                        try:
                            with os.scandir(sub) as report_dir:
                                scanned = 0
                                for child in report_dir:
                                    scanned += 1
                                    if scanned > MAX_TREE_SCAN:
                                        break
                                    if Path(child.name).suffix.lower() == ".md":
                                        inspect_report(
                                            root, os.path.join(sub, child.name),
                                            f"{root.name}/reports/{child.name}",
                                        )
                        except PermissionError:
                            skipped += 1
                        except OSError:
                            pass
                    else:
                        for name in ("REPORT.md", "RESEARCH.md"):
                            candidate = os.path.join(sub, name)
                            if os.path.lexists(candidate):
                                inspect_report(root, candidate, f"{root.name}/{entry.name}/{name}")
        except PermissionError:
            skipped += 1
        except OSError:
            pass

    found.sort(key=lambda item: (-item[0], item[1]))
    truncated = len(found) > MAX_REPORTS
    items: list[dict] = []
    for mtime, path, real, root_name, rel_label in found[:MAX_REPORTS]:
        heading = None
        try:
            raw, _, _ = _read_regular_file(real, MAX_TITLE_BYTES, truncate=True)
            heading = _markdown_heading(raw.decode("utf-8", errors="replace").lstrip("\ufeff"))
        except Refused:
            heading = None
        title = _clip_line(scrub(heading)) if heading else rel_label
        items.append({"path": path, "title": title, "mtime": _iso(mtime), "root": root_name})

    digest = hashlib.sha256(json.dumps(items, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    return {"ok": True, "revision": digest, "items": items, "truncated": truncated, "skipped": skipped}


def _file_stamp(roots: list[ProjectRoot], raw_path: str) -> tuple[tuple | None, str | None]:
    """Re-vet a watched file and return its (identity-and-mtime tuple, ISO mtime) or (None, None)."""
    try:
        vetted = _vet_path(roots, raw_path)
    except Refused:
        return None, None
    st = vetted.stat
    return (vetted.real, st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns), _iso(st.st_mtime)


def _target_stamp(ledger, roots: list[ProjectRoot], kind: str, target: str) -> tuple[object, str | None]:
    if kind == "file":
        return _file_stamp(roots, target[5:])
    if kind == "board":
        found = boards.get(ledger, target[6:])
        if found is None:
            return None, None
        digest = hashlib.sha256(json.dumps(found, sort_keys=True).encode("utf-8")).hexdigest()
        return (found["updatedAt"], digest), found["updatedAt"]
    return None, None


# --- Route handlers ---

def tree(handler) -> None:
    """GET /ide/tree[?path=]: list project roots, or one vetted folder's immediate entries."""
    params = _params(handler, ("path",))
    roots = _project_roots(handler.ledger)
    requested = params["path"]
    if not requested:
        entries = []
        for root in roots:
            try:
                mtime = _iso(os.stat(root.real).st_mtime)
            except OSError:
                mtime = None
            entries.append({"name": root.name, "kind": "dir", "path": root.real, "size": None, "mtime": mtime})
        handler.send_json({"ok": True, "path": None, "entries": entries, "truncated": False, "skipped": 0})
        return

    memo: dict[str, bool] = {}
    vetted = _vet_path(roots, requested, memo)
    if not vetted.is_dir:
        _refuse(404, "not_found", "a file, not a folder")

    found: list[tuple[str, str, bool, os.stat_result]] = []
    scanned = 0
    cut = False
    skipped = 0
    try:
        with os.scandir(vetted.real) as listing:
            for entry in listing:
                scanned += 1
                if scanned > MAX_TREE_SCAN:
                    cut = True
                    break
                try:
                    checked = _vet_entry(entry, vetted.real, roots, memo)
                except PermissionError:
                    skipped += 1
                    continue
                if checked is not None:
                    kind, is_link, st = checked
                    found.append((entry.name, kind, is_link, st))
    except PermissionError:
        _refuse(403, "forbidden", "cannot read this folder")

    found.sort(key=lambda item: (0 if item[1] == "dir" else 1, _sort_key(item[0])))
    entries = []
    for name, kind, is_link, st in found[:MAX_TREE_ENTRIES]:
        row: dict = {
            "name": name,
            "kind": kind,
            "path": os.path.join(vetted.path, name),
            "size": None if kind == "dir" else st.st_size,
            "mtime": _iso(st.st_mtime),
        }
        if kind == "dir" and name in FOLDED_DIRS:
            row["folded"] = True
        if is_link:
            row["link"] = True
        entries.append(row)

    handler.send_json({
        "ok": True,
        "root": vetted.root.name,
        "path": vetted.path,
        "entries": entries,
        "truncated": cut or len(found) > MAX_TREE_ENTRIES,
        "total": len(found),
        "skipped": skipped,
    })


def doc(handler) -> None:
    """GET /chat/doc?path=: render one vetted project file into blocks for the App's document/code view."""
    params = _params(handler, ("path",), required=("path",))
    roots = _project_roots(handler.ledger)
    vetted = _vet_path(roots, params["path"] or "")
    if vetted.is_dir:
        _refuse(415, "unsupported", "cannot preview a folder as a document")

    name = os.path.basename(vetted.real)
    stem = Path(name).stem or name
    ext = Path(name).suffix.lower()
    kind = _file_kind(name)
    if kind == "binary":
        _refuse(415, "unsupported", "binary files cannot be previewed")

    scrub = handler.server.scrub
    download = f"/chat/doc/download?path={quote(vetted.path, safe='')}"

    if kind == "image":
        raw, st, _ = _read_regular_file(vetted.real, MAX_IMAGE_BYTES)
        asset_name = _state(handler.server).put_asset(raw, ext)
        clean_title, masked = _scrub_count(scrub, name)
        handler.send_json({
            "ok": True,
            "title": clean_title,
            "blocks": [{"id": "image1", "type": "image", "src": f"/chat/doc/assets/{asset_name}", "alt": clean_title}],
            "download": download,
            "path": vetted.path,
            "kind": "image",
            "mtime": _iso(st.st_mtime),
            "masked": masked,
        })
        return

    raw, st, _ = _read_regular_file(vetted.real, MAX_TEXT_BYTES)
    try:
        text = raw.decode("utf-8").lstrip("\ufeff")
    except UnicodeDecodeError:
        _refuse(415, "unsupported", "file is not UTF-8 text")
    if "\x00" in text or (kind == "text?" and not _is_textual(text)):
        _refuse(415, "unsupported", "binary file")

    if kind == "md":
        doc_title, blocks = _markdown_blocks(text, stem)
        out_kind = "md"
    elif kind == "sheet":
        parsed_rows = list(csv.reader(io.StringIO(text)))
        if parsed_rows and any(cell.strip() for cell in parsed_rows[0]):
            columns = parsed_rows[0][:MAX_CSV_COLS]
            width = len(columns)
            rows = [(row[:width] + [""] * width)[:width] for row in parsed_rows[1: MAX_CSV_ROWS + 1]]
            doc_title = stem
            blocks = [{"id": "table1", "type": "table", "columns": columns, "rows": rows}]
            out_kind = "sheet"
        else:
            doc_title = name
            blocks = [{"id": "text1", "type": "code", "lang": "csv", "text": text}]
            out_kind = "text"
    else:
        doc_title = name
        blocks = [{"id": "text1", "type": "code", "lang": ext.lstrip(".") or "text", "text": text}]
        out_kind = "text"

    clean_title, title_masked = _scrub_count(scrub, doc_title)
    clean_blocks, block_masked = _scrub_blocks(blocks, scrub)
    handler.send_json({
        "ok": True,
        "title": clean_title,
        "blocks": clean_blocks,
        "download": download,
        "path": vetted.path,
        "kind": out_kind,
        "mtime": _iso(st.st_mtime),
        "masked": title_masked + block_masked,
    })


def doc_download(handler) -> None:
    """GET /chat/doc/download?path=: serve a vetted project file's bytes as a download."""
    from . import HEADERS

    params = _params(handler, ("path",), required=("path",))
    roots = _project_roots(handler.ledger)
    vetted = _vet_path(roots, params["path"] or "")
    if vetted.is_dir:
        _refuse(415, "unsupported", "cannot download a folder")
    raw, _, _ = _read_regular_file(vetted.real, MAX_DOWNLOAD_BYTES)
    name = os.path.basename(vetted.real)
    ext = Path(name).suffix.lower()
    safe_ascii = re.sub(r'[^\x20-\x7e]|["\\]', "_", name)
    encoded_name = quote(name, safe="")
    handler.send_response(200)
    handler.send_header("Content-Type", MIME_BY_EXT.get(ext, "application/octet-stream"))
    handler.send_header("Content-Length", str(len(raw)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header(
        "Content-Disposition",
        f'attachment; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded_name}',
    )
    if handler.close_connection:
        handler.send_header("Connection", "close")
    for header, value in HEADERS.items():
        handler.send_header(header, value)
    handler.end_headers()
    handler.wfile.write(raw)


def doc_asset(handler, raw_name: str) -> None:
    """GET /chat/doc/assets/<sha256>.<ext>: serve an in-memory image asset rendered by /chat/doc."""
    from . import HEADERS

    if not ASSET_KEY_RE.fullmatch(raw_name):
        _refuse(404, "not_found", "unknown asset")
    found = _state(handler.server).get_asset(raw_name)
    if found is None:
        _refuse(404, "not_found", "asset is no longer cached")
    body, content_type = found
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", IMMUTABLE_CACHE)
    if handler.close_connection:
        handler.send_header("Connection", "close")
    for header, value in HEADERS.items():
        handler.send_header(header, value)
    handler.end_headers()
    handler.wfile.write(body)


def reports(handler) -> None:
    """GET /ide/reports: report markdown files across registered project roots, with a content revision."""
    _params(handler, ())
    roots = _project_roots(handler.ledger)
    handler.send_json(_list_reports(roots, handler.server.scrub))


def find(handler) -> None:
    """GET /ide/find?q=: match file/folder names across project roots plus boards, reports and ledger items."""
    started = time.monotonic()
    params = _params(handler, ("q",), required=("q",))
    raw_q = _query_text(params["q"], 1)
    needle = raw_q.lower()
    num_match = NUMBER_RE.match(needle)
    roots = _project_roots(handler.ledger)
    scrub = handler.server.scrub

    hits: dict[str, dict] = {}

    def add(kind: str, target: str, title: str, detail: str, score: float, catalog_id: str | None = None) -> None:
        if score <= 0:
            return
        total = round(score + FIND_BONUS.get(kind, 0))
        existing = hits.get(target)
        if existing is None or existing["score"] < total:
            row = {"kind": kind, "target": target, "title": title, "detail": detail, "score": total}
            if catalog_id:
                row["catalog_id"] = catalog_id
            hits[target] = row

    # Ledger requests (goals), pending approvals, boards and reports.
    reqs, task_reqs = owner.request_map(handler.ledger)
    work = handler.ledger.work()
    cards = handler.ledger.cards()
    waiting = {owner.goal_of(handler.ledger, card, task_reqs) for card in cards if card["state"] == "waiting"}
    for row in reqs.values():
        rid = row["id"]
        title = _clip_line(scrub(row["text"]), 160)
        tasks = [w for w in work if w["request_id"] == rid]
        status = owner.goal_status(tasks, rid in waiting)
        target = f"ledger:goal/{rid}"
        if num_match and int(num_match.group(1)) == rid:
            add("goal", target, f"#{rid} {title}", status, 1000.0)
        add("goal", target, f"#{rid} {title}", status, _name_score(needle, title))

    for card in cards:
        if card["state"] != "waiting":
            continue
        cid = card["id"]
        title = _clip_line(scrub(card["what"]), 160)
        target = f"ledger:approval/{cid}"
        if num_match and not needle.startswith("g") and int(num_match.group(1)) == cid:
            add("approval", target, f"approval #{cid} {title}", "pending", 900.0)
        add("approval", target, f"approval #{cid} {title}", "pending", _name_score(needle, title) - 50.0)

    for board_row in boards.list_boards(handler.ledger):
        title = _clip_line(scrub(board_row["title"]), 160)
        add(
            "board", f"board:{board_row['id']}", title, board_row["updatedAt"],
            _name_score(needle, title), catalog_id=f"board:{board_row['id']}",
        )

    report_data = _list_reports(roots, scrub)
    for rep in report_data["items"]:
        tail = "/".join(Path(rep["path"]).parts[-2:])
        best = max(_name_score(needle, rep["title"]), _name_score(needle, tail) - 50.0)
        add("report", f"file:{rep['path']}", rep["title"], rep["path"], best, catalog_id=f"report:{rep['path']}")

    # Walk project roots (no symlink following, folded & denied dirs skipped, bounded count & depth).
    memo: dict[str, bool] = {}
    indexed = 0
    truncated = False
    for root in roots:
        if _is_profile_dir(root.real, memo):
            continue
        stack: list[tuple[str, str, int]] = [(root.real, root.name, 0)]
        while stack and not truncated:
            current_dir, rel_dir, depth = stack.pop()
            try:
                with os.scandir(current_dir) as listing:
                    for entry in listing:
                        name = entry.name
                        if _is_denied_name(name) or entry.is_symlink():
                            continue
                        try:
                            is_dir = entry.is_dir(follow_symlinks=False)
                            is_file = not is_dir and entry.is_file(follow_symlinks=False)
                        except OSError:
                            continue
                        if not is_dir and not is_file:
                            continue
                        full = os.path.join(current_dir, name)
                        if is_dir:
                            if name in FOLDED_DIRS or _is_profile_dir(full, memo):
                                continue
                        indexed += 1
                        if indexed > MAX_INDEX_ENTRIES:
                            truncated = True
                            break
                        if len(name) >= len(needle):
                            score = _name_score(needle, name)
                            if score > 0:
                                add("dir" if is_dir else "file", f"file:{full}", name, rel_dir, score)
                        if is_dir and depth + 1 < MAX_INDEX_DEPTH:
                            stack.append((full, f"{rel_dir}/{name}", depth + 1))
            except OSError:
                continue

    ordered = sorted(hits.values(), key=lambda item: (-item["score"], item["title"]))[:MAX_FIND_RESULTS]
    elapsed_ms = round((time.monotonic() - started) * 1000.0, 1)
    handler.send_json({
        "ok": True,
        "q": raw_q,
        "items": ordered,
        "index": {"state": "ready", "count": min(indexed, MAX_INDEX_ENTRIES), "truncated": truncated},
        "revision": report_data["revision"],
        "ms": elapsed_ms,
    })


def search(handler) -> None:
    """GET /ide/search?q=&scope=: bounded case-insensitive text search across project roots."""
    params = _params(handler, ("q", "scope"), required=("q",))
    q = _query_text(params["q"], 2)
    scope = params["scope"] or "docs"
    allowed_exts = SEARCH_SCOPES.get(scope)
    if allowed_exts is None:
        _refuse(400, "bad_request", f"scope: {' or '.join(SEARCH_SCOPES)}")

    gate = _state(handler.server).search_gate
    if not gate.acquire(blocking=False):
        _refuse(429, "busy", "another search is already running")
    try:
        roots = _project_roots(handler.ledger)
        scrub = handler.server.scrub
        needle = q.lower()
        deadline = time.monotonic() + MAX_SEARCH_SECONDS
        items: list[dict] = []
        truncated = False
        timed_out = False
        files_scanned = 0
        memo: dict[str, bool] = {}

        for root in roots:
            if truncated or timed_out:
                break
            if _is_profile_dir(root.real, memo):
                continue
            stack: list[tuple[str, int]] = [(root.real, 0)]
            while stack and not truncated and not timed_out:
                if time.monotonic() >= deadline:
                    timed_out = True
                    break
                current_dir, depth = stack.pop()
                try:
                    with os.scandir(current_dir) as listing:
                        entries = sorted(listing, key=lambda e: _sort_key(e.name))
                except OSError:
                    continue
                for entry in entries:
                    if time.monotonic() >= deadline:
                        timed_out = True
                        break
                    name = entry.name
                    if _is_denied_name(name) or entry.is_symlink():
                        continue
                    try:
                        is_dir = entry.is_dir(follow_symlinks=False)
                        is_file = not is_dir and entry.is_file(follow_symlinks=False)
                    except OSError:
                        continue
                    full = os.path.join(current_dir, name)
                    if is_dir:
                        if name not in FOLDED_DIRS and depth + 1 < MAX_INDEX_DEPTH and not _is_profile_dir(full, memo):
                            stack.append((full, depth + 1))
                        continue
                    if not is_file or Path(name).suffix.lower() not in allowed_exts:
                        continue
                    files_scanned += 1
                    if files_scanned > MAX_SEARCH_FILES:
                        truncated = True
                        break
                    try:
                        st = entry.stat(follow_symlinks=False)
                    except OSError:
                        continue
                    if st.st_size == 0 or st.st_size > MAX_SEARCH_FILE_BYTES:
                        continue
                    try:
                        raw, _, _ = _read_regular_file(full, MAX_SEARCH_FILE_BYTES)
                    except Refused:
                        continue
                    if b"\x00" in raw:
                        continue
                    try:
                        text = raw.decode("utf-8")
                    except UnicodeDecodeError:
                        continue
                    file_hits = 0
                    for lineno, line in enumerate(text.splitlines(), 1):
                        pos = line.lower().find(needle)
                        if pos < 0:
                            continue
                        if len(items) >= MAX_SEARCH_HITS:
                            truncated = True
                            break
                        items.append({"path": full, "line": lineno, "snippet": _make_snippet(line, pos, scrub)})
                        file_hits += 1
                        if file_hits >= MAX_SEARCH_PER_FILE:
                            break
                    if truncated:
                        break

        handler.send_json({
            "ok": True,
            "q": q,
            "scope": scope,
            "items": items,
            "truncated": truncated,
            "timed_out": timed_out,
        })
    finally:
        gate.release()


def preview(handler) -> None:
    """GET /ide/preview?target=: hover card summary for a file:<path> or board:<id>."""
    params = _params(handler, ("target",), required=("target",))
    target = params["target"] or ""
    if len(target) > MAX_TARGET_LEN:
        _refuse(400, "bad_request", "target is too long")
    scrub = handler.server.scrub

    if target.startswith("file:") and len(target) > 5:
        roots = _project_roots(handler.ledger)
        memo: dict[str, bool] = {}
        vetted = _vet_path(roots, target[5:], memo)
        name = os.path.basename(vetted.real)
        if vetted.is_dir:
            children: list[tuple[str, str]] = []
            try:
                with os.scandir(vetted.real) as listing:
                    for count, entry in enumerate(listing):
                        if count >= MAX_TREE_SCAN:
                            break
                        checked = _vet_entry(entry, vetted.real, roots, memo)
                        if checked is not None:
                            children.append((entry.name, checked[0]))
            except PermissionError:
                _refuse(403, "forbidden", "cannot read folder")
            children.sort(key=lambda item: (0 if item[1] == "dir" else 1, _sort_key(item[0])))
            lines = [
                _clip_line(scrub(f"{child}/" if kind == "dir" else child))
                for child, kind in children[:MAX_PREVIEW_LINES]
            ]
            handler.send_json({
                "ok": True, "target": target, "title": name, "kind": "dir",
                "lines": lines, "mtime": _iso(vetted.stat.st_mtime),
            })
            return

        kind = _file_kind(name)
        if kind not in ("md", "sheet", "text", "text?"):
            handler.send_json({
                "ok": True, "target": target, "title": name, "kind": kind,
                "lines": [], "mtime": _iso(vetted.stat.st_mtime),
            })
            return
        raw, st, was_truncated = _read_regular_file(vetted.real, MAX_PREVIEW_BYTES, truncate=True)
        text = raw.decode("utf-8", errors="replace").lstrip("\ufeff")
        if was_truncated:
            text = re.sub(r"[^\n]*\Z", "", text)
        if kind == "text?":
            kind = "text" if _is_textual(text) else "binary"
        if kind == "binary":
            handler.send_json({
                "ok": True, "target": target, "title": name, "kind": "binary",
                "lines": [], "mtime": _iso(st.st_mtime),
            })
            return
        heading = _markdown_heading(text) if kind == "md" else None
        title = _clip_line(scrub(heading)) if heading else name
        handler.send_json({
            "ok": True, "target": target, "title": title, "kind": kind,
            "lines": _preview_lines(text, scrub), "mtime": _iso(st.st_mtime),
        })
        return

    if target.startswith("board:") and len(target) > 6:
        board_id = target[6:]
        found = boards.get(handler.ledger, board_id)
        if found is None:
            _refuse(404, "not_found", "no such board")
        parts: list[str] = []
        for block in found.get("blocks", []):
            if block.get("title"):
                parts.append(str(block["title"]))
            btype = block.get("type")
            if btype in ("heading", "text", "code") and block.get("text"):
                parts.append(str(block["text"]))
            elif btype == "table":
                cols = block.get("columns") or []
                if cols:
                    parts.append(" · ".join(str(cell) for cell in cols))
                for row in (block.get("rows") or [])[:4]:
                    parts.append(" · ".join(str(cell) for cell in row))
            elif btype == "timeline":
                for item in (block.get("items") or [])[:4]:
                    parts.append(f"{item.get('when', '')} {item.get('label', '')}".strip())
            if len(parts) >= 4 * MAX_PREVIEW_LINES:
                break
        title = _clip_line(scrub(found["title"])) or board_id
        handler.send_json({
            "ok": True, "target": target, "title": title, "kind": "board",
            "lines": _preview_lines("\n".join(parts), scrub), "mtime": found["updatedAt"],
        })
        return

    _refuse(400, "bad_request", "target: file:<path> or board:<id>")


def watch(handler) -> None:
    """POST /ide/watch: set the open targets (at most 20) watched for one /events?ide= stream."""
    _params(handler, ())
    data = handler.body()
    stream_id = data.get("stream")
    if not isinstance(stream_id, str) or not STREAM_ID_RE.fullmatch(stream_id):
        _refuse(400, "bad_request", "stream: the id given to /events?ide=")
    targets = data.get("targets")
    if not isinstance(targets, list) or any(not isinstance(t, str) or len(t) > MAX_TARGET_LEN for t in targets):
        _refuse(400, "bad_request", "targets: list of target strings")
    if len(targets) > MAX_WATCH_TARGETS:
        _refuse(400, "bad_request", f"at most {MAX_WATCH_TARGETS} targets")

    roots = _project_roots(handler.ledger)
    watching: list[str] = []
    refused: list[dict[str, str]] = []
    watched_map: dict[str, tuple[str, object]] = {}

    for target in dict.fromkeys(targets):
        if target.startswith("file:") and len(target) > 5:
            try:
                vetted = _vet_path(roots, target[5:])
            except Refused as exc:
                refused.append({"target": target, "error": str(exc)})
                continue
            st = vetted.stat
            stamp = (vetted.real, st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns)
            watched_map[target] = ("file", stamp)
            watching.append(target)
        elif target.startswith("board:") and len(target) > 6:
            found = boards.get(handler.ledger, target[6:])
            if found is None:
                refused.append({"target": target, "error": "not_found"})
                continue
            digest = hashlib.sha256(json.dumps(found, sort_keys=True).encode("utf-8")).hexdigest()
            watched_map[target] = ("board", (found["updatedAt"], digest))
            watching.append(target)
        else:
            refused.append({"target": target, "error": "unsupported"})

    if not _state(handler.server).set_watches(stream_id, watched_map):
        _refuse(404, "not_found", "no open /events stream with that id")

    handler.send_json({"ok": True, "watching": watching, "refused": refused})


def health(handler) -> None:
    """POST /ide/health: accept the front's health beacon with 204 and discard it."""
    from . import HEADERS

    handler.send_response(204)
    handler.send_header("Content-Length", "0")
    handler.send_header("Cache-Control", "no-store")
    if handler.close_connection:
        handler.send_header("Connection", "close")
    for header, value in HEADERS.items():
        handler.send_header(header, value)
    handler.end_headers()


# --- Live stream hooks (wire.py) ---

def _register_stream(server, query: dict) -> None:
    """Record an open /events?ide=<id> stream before initial frames flush, emitting no frame itself."""
    stream_id = query.get("ide")
    if isinstance(stream_id, str) and STREAM_ID_RE.fullmatch(stream_id):
        _state(server).register_stream(stream_id, threading.current_thread())
    return None


def _feed_changed(server, data: dict, query: dict) -> list:
    """Deliver an ide.changed frame only to the stream whose watch set observed the change."""
    if query.get("ide") != data.get("stream"):
        return []
    return [("ide.changed", {"target": data["target"], "mtime": data["mtime"]})]


ROUTES = (
    ("GET", r"/ide/tree", tree),
    ("GET", r"/chat/doc", doc),
    ("GET", r"/chat/doc/download", doc_download),
    ("GET", r"/chat/doc/assets/([^/]+)", doc_asset),
    ("GET", r"/ide/find", find),
    ("GET", r"/ide/search", search),
    ("GET", r"/ide/preview", preview),
    ("POST", r"/ide/watch", watch),
    ("GET", r"/ide/reports", reports),
    ("POST", r"/ide/health", health),
)
FRAMES = {"_workspace.stream": _register_stream}
REFRESH: dict[str, tuple[str, ...]] = {}
FEED = {"ide.changed": _feed_changed}
