"""The secret vault: values kept encrypted on disk, used by name.

Artemis does not put a secret's value into a prompt, a command line, the ledger or a log, and it scrubs known
encodings of it from tool output. A key stored for a website is sent only by Artemis, only to that website; no
program an agent starts receives it. A key stored for a command is given to that command, which can do what it
likes with it, including print it in a form the scrubber does not recognise. Agents that can run programs run them
as you, and any program of yours can ask your OS keychain for Artemis's key. Passphrase unlock removes that route;
a sandbox (`[run] wrap`) or a project added with `--no-run` closes it.

vault.db holds one row per secret, sealed with AES-256-GCM under a fresh 96-bit nonce, with the name, use, kind and
origin as associated data so a row cannot be relabelled. The 32-byte key lives in the OS keychain (`keyring`,
service "artemis"), read once per process. With no working keychain, or `[vault] unlock = "passphrase"`, it is kept
in vault.db wrapped under a key derived from your passphrase with scrypt, and asked for once per start.
`[vault] unlock = "env"` (CI, headless) takes that passphrase from ARTEMIS_VAULT_PASSPHRASE. There is no key file.
"""

from __future__ import annotations

import argparse
import base64
from contextlib import closing, contextmanager
from dataclasses import dataclass
import getpass
import hashlib
import ipaddress
import os
from pathlib import Path
import sqlite3
import sys
import time
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import keyring

from .ledger import SECRET_NAME, Ledger
from .scrub import Scrubber, audit

if TYPE_CHECKING:
    from .home import Paths


KINDS = ("none", "send", "spend")
USES = ("http", "env")
UNLOCKS = ("keyring", "passphrase", "env")
PASSPHRASE_ENV = "ARTEMIS_VAULT_PASSPHRASE"
SERVICE = "artemis"
MIN_LENGTH = 8
MIN_PASSPHRASE = 12
SCRYPT = {"n": 2 ** 17, "r": 8, "p": 1}  # about 128 MiB and a fraction of a second, once per start
DEFAULT_HEADER = "Authorization: Bearer {}"
WRAP_LABEL = b"artemis vault key"
LOCKED = {
    "env": f"The vault is locked: set {PASSPHRASE_ENV} to its passphrase.",
    "keyring": "The vault is locked. Unlock it with its passphrase in the App on this computer or at the terminal.",
    "passphrase": "The vault is locked. Unlock it with its passphrase in the App on this computer or at the terminal.",
}
LOST = ("The key that locked vault.db is neither in the OS keychain nor kept under a passphrase. Restore it, or "
        "move vault.db aside to start an empty vault.")
SCHEMA = """
CREATE TABLE IF NOT EXISTS secrets (
    name TEXT PRIMARY KEY, use TEXT NOT NULL CHECK(use IN ('http', 'env')),
    kind TEXT NOT NULL CHECK(kind IN ('none', 'send', 'spend')), origin TEXT, header TEXT,
    note TEXT NOT NULL DEFAULT '', nonce BLOB NOT NULL, ciphertext BLOB NOT NULL,
    created REAL NOT NULL, updated REAL NOT NULL,
    CHECK ((use = 'http') = (origin IS NOT NULL AND header IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS revision (id INTEGER PRIMARY KEY CHECK(id = 1), n INTEGER NOT NULL);
INSERT OR IGNORE INTO revision VALUES (1, 0);
CREATE TABLE IF NOT EXISTS wrapped (
    id INTEGER PRIMARY KEY CHECK(id = 1), salt BLOB NOT NULL, n INTEGER NOT NULL, r INTEGER NOT NULL,
    p INTEGER NOT NULL, nonce BLOB NOT NULL, key BLOB NOT NULL
);
"""
FIELDS = "name, use, kind, origin, nonce, ciphertext"


class VaultError(ValueError):
    """A plain sentence for the person. It never carries a value, a key or a passphrase."""


class VaultLocked(VaultError):
    """The vault's key is not open in this process yet; the App answers 423."""


@dataclass(frozen=True)
class SecretInfo:
    name: str
    use: str            # http: Artemis sends it to `origin` | env: commands get it as an environment variable
    kind: str           # none | send | spend
    origin: str | None  # https://host[:port], for http
    header: str | None  # "Authorization: Bearer {}", for http
    note: str
    created: float
    updated: float


class Vault:
    def __init__(self, paths: Paths, unlock: str = "keyring"):
        if unlock not in UNLOCKS:
            raise VaultError(f"[vault] unlock is one of: {', '.join(UNLOCKS)}.")
        self.mode = unlock
        self.path = paths.vault
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(mode=0o600, exist_ok=True)
        with self._connect() as db:
            db.executescript(SCHEMA)
        self._account = _account(paths.root)
        self._key: bytes | None = None
        self.backend = {"keyring": "keychain", "passphrase": "passphrase", "env": "env"}[unlock]
        self.scrubber = Scrubber(self)
        if unlock == "keyring":
            self._from_keychain()
        elif unlock == "env" and (passphrase := os.environ.get(PASSPHRASE_ENV)):
            self.unlock(passphrase)

    @property
    def unlocked(self) -> bool:
        return self._key is not None

    @property
    def state(self) -> str:
        """open; locked (unlock(passphrase) opens it); or new (unlock(passphrase) sets the passphrase)."""
        if self._key:
            return "open"
        with self._connect() as db:
            return "locked" if db.execute("SELECT 1 FROM wrapped").fetchone() else "new"

    @property
    def notice(self) -> str:
        """A line for `artemis doctor` and the App header about how the vault was opened; often empty."""
        if self.backend == "env" and self.unlocked:
            return "vault unlocked from environment"
        if self.mode == "keyring" and self.backend == "passphrase":
            return ("No working OS keychain was found, so the vault key is kept under a passphrase, asked once each "
                    "time Artemis starts.")
        return ""

    @property
    def version(self) -> int:
        """Counts every set and remove, from any process, so a scrubber knows when to rebuild."""
        with self._connect() as db:
            return db.execute("SELECT n FROM revision").fetchone()[0]

    def unlock(self, passphrase: str) -> None:
        """Open the vault with its passphrase, or set the passphrase on a vault that has none yet. Called once per
        start: by the terminal prompt, by the App on loopback, or from ARTEMIS_VAULT_PASSPHRASE."""
        if self._key:
            return
        with self._connect() as db, db:
            db.execute("BEGIN IMMEDIATE")  # one process at a time may set the passphrase
            row = db.execute("SELECT salt, n, r, p, nonce, key FROM wrapped").fetchone()
            held = None
            if row:
                salt, n, r, p, nonce, wrapped = row
                try:
                    key = AESGCM(_derive(passphrase, salt, n, r, p)).decrypt(nonce, wrapped, WRAP_LABEL)
                except InvalidTag:
                    raise VaultError("That passphrase does not unlock the vault.") from None
            else:
                if len(passphrase) < MIN_PASSPHRASE:
                    raise VaultError(f"Choose a passphrase of at least {MIN_PASSPHRASE} characters.")
                sample, (_, held) = _sample(db), _keychain_get(self._account)  # once, when the passphrase is set
                if held and _opens(held, sample):
                    key = held  # a vault moving off the keychain keeps its key
                elif sample is None:
                    key = AESGCM.generate_key(bit_length=256)
                else:
                    raise VaultError(LOST)
                salt, nonce = os.urandom(16), os.urandom(12)
                sealed = AESGCM(_derive(passphrase, salt, **SCRYPT)).encrypt(nonce, key, WRAP_LABEL)
                db.execute("INSERT INTO wrapped VALUES (1, ?, ?, ?, ?, ?, ?)",
                           (salt, SCRYPT["n"], SCRYPT["r"], SCRYPT["p"], nonce, sealed))
            if self.mode == "keyring" and _keychain_put(self._account, key) == key:
                db.execute("DELETE FROM wrapped")  # the keychain works again: no passphrase next start
                self.backend = "keychain"
            elif self.mode != "keyring" and held == key:
                _keychain_forget(self._account, key)
        self._key = key

    def names(self) -> list[SecretInfo]:
        with self._connect() as db:
            rows = db.execute("SELECT name, use, kind, origin, header, note, created, updated FROM secrets "
                              "ORDER BY name").fetchall()
        return [SecretInfo(*row) for row in rows]

    def info(self, name: str) -> SecretInfo | None:
        return next((info for info in self.names() if info.name == name), None)

    def set(self, name: str, value: str, *, use: str, kind: str = "none", origin: str | None = None,
            header: str | None = None, note: str = "") -> None:
        if not SECRET_NAME.fullmatch(name):
            raise VaultError("A secret's name is capital letters, digits and _, starting with a letter, "
                             "like OPENAI_API_KEY.")
        if use not in USES:
            raise VaultError("A secret is used by Artemis for a website (http) or by commands (env).")
        if kind not in KINDS:
            raise VaultError(f"A secret's kind is one of: {', '.join(KINDS)}.")
        if len(value) < MIN_LENGTH:
            raise VaultError(f"A secret's value needs at least {MIN_LENGTH} characters: shorter ones would be "
                             "scrubbed out of ordinary output.")
        if value in note:
            raise VaultError("The note contains the value. Notes are shown to agents; keep the value out of it.")
        if use == "http":
            origin, header = _stored_origin(origin or ""), _header(header or DEFAULT_HEADER)
            if any(char in value for char in "\r\n\0"):
                raise VaultError("A key for a website is one line: it is sent in a header.")
        elif origin or header:
            raise VaultError("Only a key for a website has an origin and a header.")
        aead = self._aead()
        nonce = os.urandom(12)
        sealed = aead.encrypt(nonce, value.encode("utf-8"), _label(name, use, kind, origin))
        now = time.time()
        with self._write() as db:
            db.execute("INSERT INTO secrets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET "
                       "use = excluded.use, kind = excluded.kind, origin = excluded.origin, "
                       "header = excluded.header, note = excluded.note, nonce = excluded.nonce, "
                       "ciphertext = excluded.ciphertext, updated = excluded.updated",
                       (name, use, kind, origin, header, note, nonce, sealed, now, now))

    def remove(self, name: str) -> None:
        with self._write() as db:
            if not db.execute("DELETE FROM secrets WHERE name = ?", (name,)).rowcount:
                raise VaultError(f"The vault has no secret named {name}.")

    def env(self, names: list[str]) -> dict[str, str]:
        """Values of `env` secrets for a child process's environment or stdin; never a website key."""
        rows = self._rows(names)
        for name, use, _, origin, _, _ in rows.values():
            if use == "http":
                raise VaultError(f"{name} is sent only by Artemis, only to {origin}; commands never receive it.")
        return {name: self._open(rows[name]) for name in names}

    def http(self, name: str, origin: str) -> tuple[str, str]:
        """(header name, header value) for Artemis itself to send `name` to `origin`; for httpop only."""
        row = self._rows([name])[name]
        if row[1] != "http" or row[3] != origin:
            raise VaultError(f"{name} is not sent to {origin}.")
        with self._connect() as db:
            field, template = db.execute("SELECT header FROM secrets WHERE name = ?", (name,)).fetchone()[0] \
                .split(":", 1)
        return field.strip(), template.strip().replace("{}", self._open(row))

    def values(self) -> list[tuple[str, str]]:
        """Every (name, value); for the scrubber and the audit only."""
        with self._connect() as db:
            rows = db.execute(f"SELECT {FIELDS} FROM secrets ORDER BY name").fetchall()
        return [(row[0], self._open(row)) for row in rows]

    def master_key(self) -> bytes:
        """The vault's own key; for the scrubber and the audit only, so it is scrubbed like a value."""
        self._aead()
        return self._key

    def _rows(self, names: list[str]) -> dict[str, tuple]:
        with self._connect() as db:
            rows = {row[0]: row for row in db.execute(
                f"SELECT {FIELDS} FROM secrets WHERE name IN ({','.join('?' * len(names))})", names)}
        missing = [name for name in names if name not in rows]
        if missing:
            raise VaultError(f"The vault has no secret named {', '.join(missing)}.")
        return rows

    def _aead(self) -> AESGCM:
        if self._key is None:
            raise VaultLocked(LOCKED[self.mode])
        return AESGCM(self._key)

    def _open(self, row: tuple) -> str:
        name, use, kind, origin, nonce, sealed = row
        try:
            return self._aead().decrypt(nonce, sealed, _label(name, use, kind, origin)).decode("utf-8")
        except InvalidTag:
            raise VaultError(f"The secret {name} does not open with this vault's key; set it again.") from None

    def _from_keychain(self) -> None:
        with self._connect() as db, db:
            db.execute("BEGIN IMMEDIATE")  # one process at a time may make a vault's first key
            sample, under_passphrase = _sample(db), db.execute("SELECT 1 FROM wrapped").fetchone() is not None
            working, held = _keychain_get(self._account)
            if held and (_opens(held, sample) if sample else not under_passphrase):
                self._key = held
            elif working and sample is None and not under_passphrase:
                self._key = _keychain_put(self._account, AESGCM.generate_key(bit_length=256))
            if self._key is None:
                self.backend = "passphrase"  # no working keychain, or the key is kept under a passphrase

    @contextmanager
    def _connect(self):
        with closing(sqlite3.connect(self.path, isolation_level=None, timeout=30)) as db:
            yield db

    @contextmanager
    def _write(self):
        with self._connect() as db, db:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.execute("UPDATE revision SET n = n + 1")


def origin(url: str) -> str:
    """scheme://host[:port] of a web address, the form a website key is bound to. HTTPS only; plain HTTP only to
    this computer."""
    parts = urlsplit(url)
    try:
        port = parts.port
    except ValueError:
        raise VaultError(f"{url} has a port that is not a number.") from None
    host = parts.hostname
    if parts.scheme not in ("https", "http") or not host or parts.username is not None or parts.password is not None:
        raise VaultError(f"{url} is not a web address like https://api.example.com.")
    if parts.scheme == "http" and not _loopback(host):
        raise VaultError("Keys travel only over HTTPS (plain HTTP only to this computer).")
    default = {"https": 443, "http": 80}[parts.scheme]
    return f"{parts.scheme}://{f'[{host}]' if ':' in host else host}" + (f":{port}" if port not in (None, default)
                                                                         else "")


def _stored_origin(text: str) -> str:
    parts = urlsplit(text)
    if parts.path.strip("/") or parts.query or parts.fragment:
        raise VaultError("An origin is only the scheme and host, like https://api.example.com.")
    return origin(text)


def _header(template: str) -> str:
    field, colon, value = template.partition(":")
    if not colon or not field.strip() or any(c in field for c in " \t\r\n") or "\r" in value or "\n" in value \
            or value.count("{}") != 1:
        raise VaultError('A header is a name, a colon and a value with one {} for the key, like '
                         '"Authorization: Bearer {}".')
    return f"{field.strip()}: {value.strip()}"


def _loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _account(root: Path) -> str:
    """The keychain entry's account name: one per ARTEMIS_HOME."""
    return "home-" + hashlib.sha256(str(root.resolve()).encode("utf-8")).hexdigest()[:16]


def _label(name: str, use: str, kind: str, origin: str | None) -> bytes:
    return "\0".join((name, use, kind, origin or "")).encode("utf-8")


def _sample(db: sqlite3.Connection) -> tuple | None:
    """One sealed row, to tell the key that opens this vault from a stale one."""
    return db.execute(f"SELECT {FIELDS} FROM secrets LIMIT 1").fetchone()


def _opens(key: bytes, sample: tuple | None) -> bool:
    if sample is None:
        return True
    name, use, kind, origin, nonce, sealed = sample
    try:
        AESGCM(key).decrypt(nonce, sealed, _label(name, use, kind, origin))
    except InvalidTag:
        return False
    return True


def _derive(passphrase: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=256 * 1024 * 1024, dklen=32)


def _keychain_get(account: str) -> tuple[bool, bytes | None]:
    """(whether the keychain answered, the key it holds for this home)."""
    try:
        text = keyring.get_password(SERVICE, account)
    except Exception:  # no usable keychain: no backend, locked, no session bus
        return False, None
    try:
        key = base64.b64decode(text or "", validate=True)
    except ValueError:
        key = b""
    return True, key if len(key) == 32 else None


def _keychain_put(account: str, key: bytes) -> bytes | None:
    """Store the key; returns what the keychain then holds (a racing writer's key, or None without a keychain)."""
    try:
        keyring.set_password(SERVICE, account, base64.b64encode(key).decode("ascii"))
    except Exception:  # as in _keychain_get
        return None
    return _keychain_get(account)[1]


def _keychain_forget(account: str, key: bytes) -> None:
    """Remove the keychain entry once the same key is kept under a passphrase, so programs cannot fetch it."""
    if _keychain_get(account)[1] == key:
        try:
            keyring.delete_password(SERVICE, account)
        except Exception:  # as in _keychain_get
            pass


def unlock_at_terminal(vault: Vault) -> None:
    """Ask for the passphrase once (twice when choosing one); for `serve` and the CLI. Without a terminal the vault
    stays locked and this says how to open it."""
    if vault.unlocked:
        return
    if not sys.stdin.isatty():
        raise VaultLocked(LOCKED[vault.mode])
    if vault.state == "new":
        print(f"The vault needs a passphrase (at least {MIN_PASSPHRASE} characters). It is asked once each time "
              "Artemis starts, and cannot be recovered if you forget it.", file=sys.stderr)
        chosen = getpass.getpass("Choose a vault passphrase: ")
        if getpass.getpass("Type it again: ") != chosen:
            raise VaultError("The two passphrases differ; nothing was set.")
        vault.unlock(chosen)
    else:
        vault.unlock(getpass.getpass("Vault passphrase: "))


# `artemis secret …`; the CLI calls args.func(args, paths, unlock) with [vault] unlock and exits with its result.

def add_commands(sub: argparse._SubParsersAction) -> None:
    secret = sub.add_parser("secret", help="Keep API keys and passwords encrypted; agents use them by name.")
    verbs = secret.add_subparsers(dest="verb", required=True, metavar="VERB")
    put = verbs.add_parser("set", help="Store a value, typed into a hidden prompt or piped with --stdin.")
    put.add_argument("name", help="Capitals, digits and _, like OPENAI_API_KEY.")
    goes = put.add_mutually_exclusive_group()
    goes.add_argument("--origin", metavar="URL", help="The website this key belongs to, like https://api.example.com. "
                      "Only Artemis sends it, only there.")
    goes.add_argument("--env", action="store_true", help="A key for commands: given to a command as an environment "
                      "variable or on stdin, never in its arguments.")
    put.add_argument("--header", metavar="TEMPLATE", help=f'How the key is sent, {{}} marking it (default: '
                     f'"{DEFAULT_HEADER}").')
    put.add_argument("--kind", choices=KINDS, help="none (default): used freely. send: changes made with it count as "
                     "sending as you. spend: every use counts as money out. Those two wait for your yes.")
    put.add_argument("--note", help="What it is for. Agents read the note, never the value.")
    put.add_argument("--stdin", action="store_true", help="Read the value from one line of standard input.")
    verbs.add_parser("list", help="Names, where each goes, kinds, notes and last use. Values are never shown.")
    drop = verbs.add_parser("remove", help="Delete a secret from the vault.")
    drop.add_argument("name")
    drop.add_argument("--yes", action="store_true", help="Do not ask to type the name (for scripts).")
    verbs.add_parser("audit", help="Look for every value and the vault key, in their common encodings, in the "
                     "ledger, logs, undo journal and run files; exits 1 if any is found.")
    secret.set_defaults(func=command)


def command(args: argparse.Namespace, paths: Paths, unlock: str = "keyring") -> int:
    vault = Vault(paths, unlock)
    match args.verb:
        case "set":
            current = vault.info(args.name)
            if args.origin:
                use, where = "http", args.origin
                header = args.header or (current.header if current and current.use == "http" else None)
            elif args.env or (current and current.use == "env"):
                use, where, header = "env", None, args.header
            elif current:
                use, where, header = "http", current.origin, args.header or current.header
            else:
                raise VaultError(f"Say where {args.name} goes: --origin https://api.example.com for a website, or "
                                 "--env for commands.")
            unlock_at_terminal(vault)
            value = _typed(args.name, args.stdin)
            kind = args.kind or (current.kind if current else "none")
            note = current.note if args.note is None and current else args.note or ""
            vault.set(args.name, value, use=use, kind=kind, origin=where, header=header, note=note)
            goes = f"only Artemis sends it, only to {vault.info(args.name).origin}" if use == "http" else \
                "commands get it by name, never in their arguments"
            print(f"Saved {args.name} ({kind}): {goes}.")
        case "list":
            print(_listing(vault, paths))
        case "remove":
            if not args.yes:
                if not sys.stdin.isatty():
                    raise VaultError("Add --yes to remove a secret without a prompt.")
                if input(f"Removing {args.name} cannot be undone. Type the name to confirm: ").strip() != args.name:
                    print("Nothing removed.")
                    return 1
            vault.remove(args.name)
            print(f"Removed {args.name}.")
        case "audit":
            unlock_at_terminal(vault)
            result = audit(vault, paths)
            for where, name in sorted({(where, name) for where, name, _ in result.hits}):
                print(f"  {where}  {name}")
            stored = result.values - 1
            print(f"{len({name for _, name, _ in result.hits})} of {result.values} values found in {result.files} "
                  f"files ({stored} secret{'' if stored == 1 else 's'} and the vault key)")
            return 1 if result.hits else 0
    if vault.notice:
        print(vault.notice, file=sys.stderr)
    return 0


def _typed(name: str, piped: bool) -> str:
    if piped:
        return sys.stdin.readline().rstrip("\r\n")
    if not sys.stdin.isatty():
        raise VaultError("There is no terminal to type the value in; pipe it in with --stdin.")
    return getpass.getpass(f"Value for {name} (hidden): ")


def _listing(vault: Vault, paths: Paths) -> str:
    secrets = vault.names()
    if not secrets:
        return "No secrets yet. Add one: artemis secret set OPENAI_API_KEY --origin https://api.openai.com"
    uses: dict[str, list[float]] = {}
    if paths.ledger.is_file():
        for row in Ledger(paths.ledger).secret_uses():
            uses.setdefault(row["name"], []).append(row["at"])
    rows = [("NAME", "KIND", "GOES TO", "LAST USED", "NOTE")]
    for info in secrets:
        times = uses.get(info.name, [])
        last = f"{time.strftime('%Y-%m-%d %H:%M', time.localtime(max(times)))} ({len(times)}x)" if times else "never"
        rows.append((info.name, info.kind, info.origin or "commands (env)", last, info.note))
    widths = [max(len(row[column]) for row in rows) for column in range(4)]
    return "\n".join(("  ".join(cell.ljust(width) for cell, width in zip(row, widths)) + "  " + row[4]).rstrip()
                     for row in rows)
