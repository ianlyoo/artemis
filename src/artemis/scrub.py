"""Replace every vault value and the vault's own key, and the common encodings of each, with [secret:NAME]
before text leaves Artemis."""

from __future__ import annotations

import base64
from contextlib import closing
from dataclasses import dataclass
import json
import math
from pathlib import Path
import re
import sqlite3
from typing import TYPE_CHECKING, Callable, Iterator
from urllib.parse import quote, quote_plus

if TYPE_CHECKING:
    from .home import Paths
    from .vault import Vault


PLACEHOLDER = "[secret:{}]"
MASTER = "vault key"  # the name the vault's own key is scrubbed and audited under; never a secret's NAME
CHUNK = 1 << 20


def forms(value: str | bytes) -> dict[str, str]:
    """Each way the value commonly shows up in output, with a label for the audit; the raw value first. A bytes
    value (the vault key) has its raw bytes as surrogate escapes, base64 and hex."""
    data = value if isinstance(value, bytes) else value.encode("utf-8")
    found: dict[str, str] = {}
    found[_text(data)] = "raw"
    for label, encode in (("base64", base64.b64encode), ("base64url", base64.urlsafe_b64encode)):
        text = encode(data).decode("ascii")
        for form in (text, text.rstrip("=")):
            found.setdefault(form, label)
        for shift in (0, 1, 2):
            found.setdefault(_inside(encode, data, shift), f"{label} inside")
    for form in (data.hex(), data.hex().upper()):
        found.setdefault(form, "hex")
    if isinstance(value, bytes):
        return found
    found.setdefault(value.replace("\r\n", "\n").replace("\r", "\n"), "line ends")  # as `run` output reads
    for form in (quote(value), quote(value, safe=""), quote_plus(value)):
        found.setdefault(form, "percent")
    for form in (json.dumps(value)[1:-1], json.dumps(value, ensure_ascii=False)[1:-1]):
        found.setdefault(form, "json")
    return found


def _inside(encode: Callable[[bytes], bytes], data: bytes, shift: int) -> str:
    """The part of the value's base64 that is the same wherever it sits in a longer encoded text (an HTTP Basic
    header, `echo VALUE | base64`): the value starts `shift` bytes into a 3-byte group, and the characters that
    also carry bits of the bytes before or after it are left off."""
    text = encode(bytes(shift) + data).decode("ascii")
    return text[math.ceil(shift * 4 / 3):(shift + len(data)) * 4 // 3]


def _text(data: bytes) -> str:
    """Bytes as text that encodes back to the same bytes; how job output and files are read for scrubbing."""
    return data.decode("utf-8", "surrogateescape")


def _known(vault: Vault) -> list[tuple[str, str | bytes]]:
    """(name, value) for every secret, then the vault key; nothing while the vault is locked."""
    return [*vault.values(), (MASTER, vault.master_key())] if vault.unlocked else []


def _index(secrets: list[tuple[str, str | bytes]]) -> dict[str, tuple[str, str]]:
    """form → (secret name, form label) for every value; where two secrets share a form, the first keeps it."""
    index: dict[str, tuple[str, str]] = {}
    for name, value in secrets:
        for form, label in forms(value).items():
            index.setdefault(form, (name, label))
    return index


class Scrubber:
    """Locked, the vault has handed out no value and the scrubber passes text through; it rebuilds on unlock."""

    def __init__(self, vault: Vault):
        self.vault = vault
        self._built: tuple[tuple | None, re.Pattern | None, dict[str, str], int] = (None, None, {}, 0)
        self._bytes: tuple[tuple | None, re.Pattern | None, dict[bytes, str]] = (None, None, {})

    def scrub(self, text: str) -> str:
        _, pattern, names, _ = self._table()
        if pattern is None:
            return text
        return pattern.sub(lambda match: PLACEHOLDER.format(names[match.group()]), text)

    def scrub_bytes(self, data: bytes) -> bytes:
        """The same for bytes that may not be UTF-8 (a download), matched byte for byte, so a value next to stray
        bytes is still found; bytes outside any value come back unchanged."""
        version, _, names, _ = self._table()
        if self._bytes[0] != version:
            raw = {form.encode("utf-8", "surrogateescape"): name for form, name in names.items()}
            ordered = sorted(raw, key=len, reverse=True)
            self._bytes = (version, re.compile(b"|".join(map(re.escape, ordered))) if ordered else None, raw)
        _, pattern, raw = self._bytes
        if pattern is None:
            return data
        return pattern.sub(lambda match: PLACEHOLDER.format(raw[match.group()]).encode("utf-8"), data)

    def stream(self) -> Stream:
        return Stream(self)

    def _table(self) -> tuple[tuple | None, re.Pattern | None, dict[str, str], int]:
        """((vault version, unlocked), one pattern of every form longest first, form → name, longest form's length)."""
        version = (self.vault.version, self.vault.unlocked)  # read before the values: a change in between rebuilds
        if self._built[0] != version:
            names = {form: name for form, (name, _) in _index(_known(self.vault)).items()}
            ordered = sorted(names, key=len, reverse=True)
            pattern = re.compile("|".join(map(re.escape, ordered))) if ordered else None
            self._built = (version, pattern, names, len(ordered[0]) if ordered else 0)
        return self._built


class Stream:
    """Scrubs text that arrives in pieces. It holds back the last (longest form - 1) characters, which could be
    the start of a value, until the next piece or flush()."""

    def __init__(self, scrubber: Scrubber):
        self._scrubber = scrubber
        self._tail = ""

    def feed(self, text: str) -> str:
        _, pattern, names, longest = self._scrubber._table()
        text, self._tail = self._tail + text, ""
        if pattern is None:
            return text
        safe = max(0, len(text) - (longest - 1))  # every form that starts before here is wholly in view
        out, done = [], 0
        for match in pattern.finditer(text):
            if match.start() >= safe:
                break
            out += (text[done:match.start()], PLACEHOLDER.format(names[match.group()]))
            done = match.end()
        cut = max(done, safe)
        out.append(text[done:cut])
        self._tail = text[cut:]
        return "".join(out)

    def flush(self) -> str:
        text, self._tail = self._tail, ""
        return self._scrubber.scrub(text)


@dataclass(frozen=True)
class AuditResult:
    values: int
    files: int
    hits: list[tuple[str, str, str]]  # (where, relative to ARTEMIS_HOME; secret name; form label)


def audit(vault: Vault, paths: Paths) -> AuditResult:
    """Search what Artemis writes (the ledger, logs/, undo/, runs/, lead/) for every value and the vault key, each
    in every form; `values` counts the vault key as one. The vault must be unlocked (VaultLocked otherwise).

    The ledger is read twice: its files as bytes (rows deleted but not yet overwritten included) and each text
    column through SQLite. vault.db is not read; it sits outside the searched folders."""
    secrets = [*vault.values(), (MASTER, vault.master_key())]
    table = _index(secrets)
    files = list(_searched(paths))
    hits: set[tuple[str, str, str]] = set()
    encoded = sorted((form.encode("utf-8", "surrogateescape") for form in table), key=len, reverse=True)
    byte_pattern = re.compile(b"|".join(map(re.escape, encoded)))
    for path in files:
        where = path.relative_to(paths.root).as_posix()
        hits |= {(where, *table[_text(form)]) for form in _found(path, byte_pattern, len(encoded[0]))}
    text_pattern = re.compile("|".join(map(re.escape, sorted(table, key=len, reverse=True))))
    if paths.ledger.is_file():
        for where, text in _columns(paths.ledger):
            hits |= {(f"{paths.ledger.name} {where}", *table[match.group()])
                     for match in text_pattern.finditer(text)}
    return AuditResult(len(secrets), len(files), sorted(hits))


def _searched(paths: Paths) -> Iterator[Path]:
    for name in ("", "-wal", "-journal"):
        if (path := paths.ledger.with_name(paths.ledger.name + name)).is_file():
            yield path
    for folder in (paths.logs, paths.undo, paths.runs, paths.lead):
        if folder.is_dir():
            yield from sorted(path for path in folder.rglob("*") if path.is_file())


def _found(path: Path, pattern: re.Pattern, longest: int) -> Iterator[bytes]:
    """Every form in the file, read a megabyte at a time with an overlap so no form is cut in two. A file that is
    gone by the time it is read (SQLite's -wal and -journal come and go with a running home) holds nothing."""
    tail = b""
    try:
        file = path.open("rb")
    except FileNotFoundError:
        return
    with file:
        while chunk := file.read(CHUNK):
            data = tail + chunk
            yield from (match.group() for match in pattern.finditer(data))
            tail = data[max(0, len(data) - longest + 1):]


def _columns(ledger: Path) -> Iterator[tuple[str, str]]:
    """("table.column", text) for every text value in the ledger. A plain connection, like any CLI verb's: a
    read-only one would leave its -wal and -shm files behind."""
    with closing(sqlite3.connect(ledger)) as db:
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
        for table in tables:
            columns = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
            for column in columns:
                for (text,) in db.execute(f'SELECT "{column}" FROM "{table}" WHERE typeof("{column}") = \'text\''):
                    yield f"{table}.{column}", text
