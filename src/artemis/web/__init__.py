"""The Artemis App: its server (the JSON API, live events and these static files) on the home's port.

Who may call it: a device paired through a one-time link and then allowed on this computer (it holds a session
cookie, of which the ledger keeps only a hash), or the CLI with the home token. Every request must name a host this
home answers to, every write from a browser must come from the App's own origin, and a write that carries an
X-Request-Id is done once however often it is sent. A secret's value travels from the secret form to the vault and
nowhere else: it is never echoed, logged or put on the event stream.
"""

from collections import OrderedDict
from dataclasses import dataclass, field
import hashlib
import hmac
import http.server
import ipaddress
import json
import os
from pathlib import Path
import queue
import re
import secrets
import select
import shlex
import socket
import socketserver
import ssl
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit

from cryptography import x509
import segno

from .. import __version__, agents, attention, demo_receiver, httpop, lessons
from ..broker import ToolError
from ..config import HomeConfig, repo_name, write_lead
from ..home import PAIR_S
from ..roles import Interrupt, Role, WorkflowError
from ..scrub import audit
from ..tls import address, ensure_cert, fingerprint, lan_names, qr_text
from ..vault import VaultLocked


STATIC = Path(__file__).parent
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
         ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8"}
HEADERS = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                               "connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; "
                               "frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}
LOOPBACK = frozenset({"127.0.0.1", "::1", "::ffff:127.0.0.1"})
LOCAL_NAMES = frozenset({"127.0.0.1", "localhost", "::1"})
COOKIE = "artemis_session"
PAIR_TRIES = 5                    # wrong pairing tokens before the App takes none until a new link is made
SESSION_SECONDS = 30 * 86400      # a device unseen this long pairs again
POLL_SECONDS = 0.5
POLL_WAIT = 25.0                  # a long poll answers within this
HEARTBEAT_SECONDS = 15.0
MAX_STREAMS = 32                  # live streams; past this the App polls, and writes always find a thread
MAX_BODY = 1 << 20                # the most the App ever sends
DRAIN_MAX = 16 << 20              # a longer body is read off and dropped up to this, so its sender gets the 413
LOG_TAIL = 8192
REPLIES = 2000                    # answers kept for repeated X-Request-Ids
TURN_WAIT = 20.0                  # closing waits this long for a lead that is still answering
TURN_RECORD_SECONDS = 3600        # a lead turn's record comes at most this long before the reply it names
OPEN_CARDS = ("waiting", "approved", "running")
STANDING_KINDS = (Interrupt.SEND, Interrupt.DELETE)
# Ledger events that read as a quiet line in the conversation.
UPDATE_KINDS = ("project.added", "task", "started", "reported", "pass", "reject", "red", "stale", "applied", "stuck",
                "stopped", "dropped", "card.opened", "card.approved", "card.declined", "card.done", "card.failed",
                "card.unknown", "card.answered", "card.expired", "secret.set", "secret.requested", "run.held",
                "run.denied", "lesson.added", "lesson.active", "lesson.retired", "lesson.unproven", "schedule.fired",
                "schedule.late", "review", "undo", "halt", "resume", "device.pending", "device.allowed",
                "device.revoked", "standing.revoked", "lead.switched")
SYSTEMS = (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"), ("Windows", "Windows"),
           ("Macintosh", "Mac"), ("CrOS", "ChromeOS"), ("Linux", "Linux"))
BROWSERS = (("Edg/", "Edge"), ("FxiOS", "Firefox"), ("Firefox/", "Firefox"), ("CriOS", "Chrome"),
            ("Chrome/", "Chrome"), ("Safari/", "Safari"))


class Refused(Exception):
    """A request the App answers with an HTTP error status and one plain sentence."""

    def __init__(self, status: int, message: str, **extra):
        super().__init__(message)
        self.status, self.extra = status, extra


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _device_name(agent: str) -> tuple[str, bool]:
    """A name a person recognises for the browser that paired, and whether it looks like a phone."""
    system = next((label for key, label in SYSTEMS if key in agent), None)
    browser = next((label for key, label in BROWSERS if key in agent), "A browser")
    return f"{browser} on {system}" if system else browser, any(key in agent for key in ("iPhone", "Android", "Mobile"))


class Auth:
    """Pairing links, which are the home's (the one `artemis serve` prints, and those made in Settings), and the
    devices they create (in the ledger)."""

    def __init__(self, home):
        self.home, self.ledger, self.token_file = home, home.ledger, home.paths.token
        self.lock = threading.Lock()
        self.misses = 0

    def new_link(self) -> str:
        """A pairing token that works once within ten minutes."""
        with self.lock:
            self.misses = 0
        return self.home.new_pair_token()

    def redeem(self, token: str) -> bool:
        """Use up a pairing token. After five wrong tries no link works until a paired device makes a new one."""
        with self.lock:
            if self.misses >= PAIR_TRIES:
                return False
        if self.home.redeem_pair(token):
            return True
        with self.lock:
            self.misses += 1
        return False

    def device(self, cookie: str | None):
        """The device this cookie belongs to, unless it was revoked or has not been seen for thirty days."""
        row = self.ledger.device(_digest(cookie)) if cookie else None
        if row is None or row["state"] == "revoked":
            return None
        return row if time.time() - (row["last_seen"] or row["created"]) <= SESSION_SECONDS else None

    def bearer(self, header: str | None) -> bool:
        if not header or not header.startswith("Bearer ") or not self.token_file.exists():
            return False
        expected = self.token_file.read_text(encoding="utf-8").strip()
        return bool(expected) and hmac.compare_digest(header[7:].strip().encode(), expected.encode())


@dataclass
class Reply:
    """The first answer to a request id, for every repeat of it."""
    done: threading.Event = field(default_factory=threading.Event)
    status: int = 0
    body: bytes = b""
    cookie: str | None = None


@dataclass(frozen=True)
class Tls:
    context: ssl.SSLContext
    fingerprint: str
    names: frozenset[str]


def _tls(home, lan: bool | str, given: tuple[Path, Path] | None) -> Tls:
    """The App's TLS: the home's own certificate (made for this machine's LAN names and the name the phone opens,
    when one is given) or the one given, which must cover that name."""
    named = [address(lan)] if isinstance(lan, str) else []
    cert, key = given if given is not None else ensure_cert(home.paths, named)[:2]
    loaded = x509.load_pem_x509_certificate(cert.read_bytes())
    try:
        alt = loaded.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        covered = {name.lower() for name in alt.get_values_for_type(x509.DNSName)} | {
            str(ip) for ip in alt.get_values_for_type(x509.IPAddress)}
    except x509.ExtensionNotFound:
        covered = set()
    if named and not {named[0], "*." + named[0].partition(".")[2]} & covered:
        raise WorkflowError(f"The certificate given with --tls-cert does not cover {named[0]}, the name --lan gives.")
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(cert, key)
    return Tls(context, fingerprint(loaded), frozenset(covered | set(named) | (set(lan_names()) if lan else set())))


def _host(value: str) -> str:
    value = value.strip().lower()
    if value.startswith("["):
        return value[1:value.find("]")]
    return value.rsplit(":", 1)[0] if value.count(":") == 1 else value


def _today() -> float:
    now = time.localtime()
    return time.mktime((now.tm_year, now.tm_mon, now.tm_mday, 0, 0, 0, 0, 0, -1))


def _loads(text: str | None, default=None):
    return default if text is None else json.loads(text)


def _argv(command: str | None) -> list[str] | None:
    """A card's command as the broker keeps it, a JSON argv; None for none, or for a command written as text."""
    try:
        argv = json.loads(command) if command else None
    except ValueError:
        return None
    return argv if isinstance(argv, list) and argv and all(isinstance(word, str) for word in argv) else None


def _label(name: str | None) -> str | None:
    """What a person calls an agent: Claude Code, Codex, mock (no AI)..."""
    return agents.LABELS.get(name, name) if name else name


class AppServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False
    allow_reuse_address = sys.platform != "win32"   # on Windows it would let a second home take the same port

    def __init__(self, address: tuple[str, int], home, tls: Tls | None, name: str | None = None):
        self.home, self.tls, self.name = home, tls, name   # name: what a phone opens, when it is not on this LAN
        self.lan = address[0] == "0.0.0.0"
        self.scheme = "https" if tls else "http"
        self.hosts = LOCAL_NAMES | (tls.names if tls else frozenset())
        self.auth = Auth(home)
        self.closing = threading.Event()
        self.titles: dict[int, str] = {}
        self.replies: OrderedDict[tuple[str, str], Reply] = OrderedDict()
        self.replies_lock = threading.Lock()
        self.streams = 0
        self.streams_lock = threading.Lock()
        self.turns: set[threading.Thread] = set()
        self.turns_lock = threading.Lock()
        self.scrub = home.vault.scrubber.scrub if home.vault is not None else str
        super().__init__(address, Handler)

    def server_bind(self) -> None:
        """Bind without HTTPServer's reverse lookup of the address (socket.getfqdn), which can take half a minute
        where the resolver is slow; nothing here reads server_name."""
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = str(self.server_address[0]), self.server_address[1]

    def finish_request(self, request, client_address) -> None:
        """Speak TLS when the home has a certificate, except to a plain request from this computer: an agent's
        broker call and the CLI come as plain HTTP to 127.0.0.1 whether or not the App also serves the LAN, and a
        browser that does is sent to https (Handler.to_https). The handshake runs in the request's own thread, so a
        slow client holds up no one."""
        if self.tls is None:
            return super().finish_request(request, client_address)
        request.settimeout(10)
        try:
            if client_address[0] in LOOPBACK and request.recv(1, socket.MSG_PEEK) not in (b"\x16", b""):
                request.settimeout(None)
                return super().finish_request(request, client_address)
            secure = self.tls.context.wrap_socket(request, server_side=True)
        except (OSError, ssl.SSLError):
            return
        with secure:
            secure.settimeout(None)
            super().finish_request(secure, client_address)

    def handle_error(self, request, client_address) -> None:
        """A client that hangs up between requests (a phone that sleeps, a closed tab) is not an error to print."""
        if not isinstance(sys.exc_info()[1], (ConnectionError, ssl.SSLError)):
            super().handle_error(request, client_address)

    def shutdown(self) -> None:
        self.closing.set()
        super().shutdown()
        deadline = time.monotonic() + TURN_WAIT
        with self.turns_lock:
            turns = list(self.turns)
        for thread in turns:
            thread.join(max(0.0, deadline - time.monotonic()))

    def answer(self, message: int) -> None:
        """The lead answers a message in a thread of its own, and shutdown waits for it: a home that closes does not
        cut a reply off while it is being written."""
        thread = threading.Thread(target=self._turn, args=(message,), name=f"lead-turn-{message}", daemon=True)
        with self.turns_lock:
            self.turns.add(thread)
        thread.start()

    def _turn(self, message: int) -> None:
        try:
            self.home.lead.turn(message)
        except Exception as exc:   # the person hears why there is no answer, in the thread where they asked
            self.home.ledger.say(Role.HOME, self.scrub(f"The lead stopped before answering: {exc}"))
        finally:
            with self.turns_lock:
                self.turns.discard(threading.current_thread())

    def url(self, host: str) -> str:
        return f"{self.scheme}://{host}:{self.server_address[1]}/"

    def lan_host(self) -> str | None:
        """The address a phone should open, if this home serves the network: the name given with --lan, else this
        machine's home-network address."""
        if not self.lan:
            return None
        if self.name:
            return self.name
        found = sorted((name for name in self.hosts - LOCAL_NAMES if re.fullmatch(r"[\d.]+", name)),
                       key=lambda name: (not ipaddress.ip_address(name).is_private, name))  # home network first
        return found[0] if found else next(iter(sorted(self.hosts - LOCAL_NAMES)), None)

    def pair_url(self, host: str = "127.0.0.1") -> str:
        return f"{self.url(host)}#pair={self.auth.new_link()}"

    def banner(self) -> str | None:
        """For a home on the local network, the phone's own link and how to trust its certificate. The link for
        this computer is the one `artemis serve` prints."""
        lan = self.lan_host()
        if lan is None:
            return None
        link = self.pair_url(lan)
        return "\n".join([f"On your phone  {link}",
                          f"Certificate SHA-256  {self.tls.fingerprint}",
                          "Your phone warns once about this certificate. Compare the fingerprint before you go on.",
                          qr_text(link),
                          "The phone then shows a 4-digit code: allow it in the App on this computer "
                          "or with `artemis device allow <code>`."])

    def title(self, task: int | None) -> str | None:
        if task is None:
            return None
        if task not in self.titles:
            self.titles[task] = self.home.ledger.task_brief(task)["title"]
        return self.titles[task]

    def envelope(self, row) -> dict:
        """One ledger event as the App receives it: the C2 envelope, the task's title, and whether it reads as an
        update line in the conversation."""
        return {"id": row["id"], "at": row["at"], "kind": row["kind"], "role": row["role"],
                "project_id": row["project_id"], "task_id": row["task_id"], "card_id": row["card_id"],
                "detail": row["detail"], "data": _loads(row["data"]), "title": self.title(row["task_id"]),
                "update": row["kind"] in UPDATE_KINDS}


class Handler(http.server.BaseHTTPRequestHandler):
    server: AppServer
    server_version = "Artemis"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    ROUTES = (
        ("GET", r"/api/me", "me"), ("GET", r"/api/state", "state"),
        ("GET", r"/api/messages", "messages"), ("POST", r"/api/messages", "say"),
        ("GET", r"/api/updates", "updates"), ("GET", r"/api/events", "events"),
        ("GET", r"/api/projects/(\d+)", "project"), ("POST", r"/api/projects", "add_project"),
        ("GET", r"/api/tasks/(\d+)", "task"),
        ("GET", r"/api/digest", "digest"), ("POST", r"/api/digest/read", "digest_read"),
        ("POST", r"/api/cards/(\d+)/(approve|decline|choose|secret)", "card"),
        ("GET", r"/api/secrets", "secrets"), ("POST", r"/api/secrets", "add_secret"),
        ("POST", r"/api/secrets/([A-Z][A-Z0-9_]*)/remove", "remove_secret"),
        ("GET", r"/api/secrets/audit", "secrets_audit"), ("POST", r"/api/vault/unlock", "unlock"),
        ("GET", r"/api/lessons", "lessons"), ("POST", r"/api/lessons/(\d+)/(retire|accept)", "lesson"),
        ("POST", r"/api/stop", "stop"), ("POST", r"/api/resume", "resume"), ("POST", r"/api/undo/(\d+)", "undo"),
        ("GET", r"/api/settings", "settings"), ("POST", r"/api/settings/lead", "set_lead"),
        ("POST", r"/api/standing/(\d+)/revoke", "revoke_standing"),
        ("GET", r"/api/devices", "devices"), ("POST", r"/api/devices/(\d+)/(allow|revoke)", "device_action"),
        ("POST", r"/api/pair/new", "pair_link"), ("POST", r"/api/signout", "signout"),
    )

    def log_message(self, format, *args) -> None:
        """Requests are not logged: the conversation and the vault are nobody else's business."""

    def do_GET(self) -> None:
        self.handle_request("GET")

    def do_POST(self) -> None:
        self.handle_request("POST")

    # The gate

    def handle_request(self, method: str) -> None:
        """One request. A kept-alive connection reuses this handler, so everything a request sets starts here."""
        self.hidden: tuple[str, ...] = ()
        self.reply: Reply | None = None
        self.device = None
        try:
            self.raw = self.read_body()
            if _host(self.headers.get("Host", "")) not in self.server.hosts:
                raise Refused(403, "This address is not one Artemis answers to.")
            parts = urlsplit(self.path)
            self.query = parse_qs(parts.query)
            if (self.server.tls and not isinstance(self.connection, ssl.SSLSocket)
                    and parts.path != "/broker/call" and not self.headers.get("Authorization")):
                return self.to_https()   # plain HTTP is for programs on this computer: agents and the CLI
            if parts.path == "/broker/call" and method == "POST":
                return self.broker()
            if parts.path == "/api/pair" and method == "POST":
                self.same_origin()
                return self.pair()
            if parts.path.startswith("/api/"):
                return self.api(method, parts.path)
            if method != "GET":
                raise Refused(405, "Only the App's own pages are served here.")
            self.static(parts.path)
        except Refused as refused:
            self.send_json({"error": self.redact(str(refused)), **refused.extra}, refused.status)
        except (ConnectionError, ssl.SSLError):
            self.close_connection = True
        except Exception as exc:   # one sentence to the App and the terminal; never a request body
            message = self.redact(f"{type(exc).__name__}: {exc}")
            print(f"artemis app: {self.server.scrub(message)}", file=sys.stderr)
            self.send_json({"error": f"The home could not do that ({message})."}, 500)
        finally:
            if self.reply is not None and not self.reply.done.is_set():
                self.reply.done.set()   # answered nothing (the connection dropped); a repeat is told to look again

    def redact(self, text: str) -> str:
        for value in self.hidden:
            text = text.replace(value, "[hidden]")
        return text

    def to_https(self) -> None:
        """Send a browser on this computer that opened http:// to the App's https address. On a plain page every
        change it sent would carry an http origin, which the App refuses while it speaks HTTPS."""
        self.send_response(308)
        self.send_header("Location", f"https://{self.headers['Host']}{self.path}")
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        for name, value in HEADERS.items():
            self.send_header(name, value)
        self.end_headers()

    def same_origin(self) -> None:
        if self.headers.get("Origin", "").lower() != f"{self.server.scheme}://{self.headers['Host'].lower()}":
            raise Refused(403, "This request did not come from the Artemis App.")

    @property
    def loopback(self) -> bool:
        return self.client_address[0] in LOOPBACK

    def api(self, method: str, path: str) -> None:
        device = self.server.auth.device(self.cookie())
        if device is not None:
            self.device, caller = device, f"device {device['id']}"
            if method == "POST":
                self.same_origin()
            if device["state"] != "allowed" and path != "/api/me":
                raise Refused(403, "This device waits until you allow it on your computer.", waiting=True)
        elif self.server.auth.bearer(self.headers.get("Authorization")):
            caller = "cli"
        else:
            raise Refused(401, "Pair this browser first: open the link Artemis printed when it started.")
        for verb, pattern, name in self.ROUTES:
            found = re.fullmatch(pattern, path)
            if found and verb == method:
                if method == "POST" and self.repeated(caller):
                    return
                try:
                    return getattr(self, name)(*found.groups())
                except WorkflowError as exc:
                    raise Refused(409, str(exc)) from None
                except VaultLocked as exc:
                    raise Refused(423, str(exc)) from None
                except ValueError as exc:
                    raise Refused(400, str(exc)) from None
        raise Refused(404, "There is no such page in the App's API.")

    def repeated(self, caller: str) -> bool:
        """A write sent again with the same X-Request-Id gets the first answer instead of being done twice."""
        request_id = self.headers.get("X-Request-Id", "").strip()[:128]
        if not request_id:
            return False
        key = (caller, request_id)
        with self.server.replies_lock:
            first = self.server.replies.get(key)
            if first is None:
                self.reply = self.server.replies[key] = Reply()
                while len(self.server.replies) > REPLIES:
                    self.server.replies.popitem(last=False)
                return False
        first.done.wait(60)
        if not first.status:
            raise Refused(409, "The first try of this request did not finish. Look again before you retry.")
        self.send_raw(first.status, first.body, first.cookie)
        return True

    def cookie(self) -> str | None:
        for part in self.headers.get("Cookie", "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == COOKIE and value:
                return value
        return None

    # Plumbing

    def send_json(self, data: object, status: int = 200, cookie: str | None = None) -> None:
        body = self.server.scrub(json.dumps(data, ensure_ascii=False)).encode("utf-8")
        if self.reply is not None and not self.reply.done.is_set():
            self.reply.status, self.reply.body, self.reply.cookie = status, body, cookie
            self.reply.done.set()
        self.send_raw(status, body, cookie)

    def send_raw(self, status: int, body: bytes, cookie: str | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        if self.close_connection:
            self.send_header("Connection", "close")
        for name, value in HEADERS.items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def read_body(self) -> bytes:
        """This request's whole body, read off the connection before any answer. The next request on a kept-alive
        connection then starts where it should, and a refusal reaches a client that has finished sending: closing a
        socket with bytes still unread resets it on some systems (Windows does), and the client sees "connection
        aborted" in place of the answer. A body longer than the App sends is read off in pieces and dropped; one
        declared longer than DRAIN_MAX is not read, and its connection ends."""
        coding = self.headers.get("Transfer-Encoding", "").strip().lower()
        if coding not in ("", "chunked"):
            self.close_connection = True
            raise Refused(501, "Send the body as it is or chunked.")
        if coding:
            pieces = self.chunks()
        else:
            declared = self.headers.get("Content-Length", "0").strip()
            if not (declared.isascii() and declared.isdigit()):
                self.close_connection = True
                raise Refused(400, "Content-Length is not a size.")
            if int(declared) > DRAIN_MAX:
                self.close_connection = True
                raise Refused(413, "That is more than the App sends.")
            pieces = self.pieces(int(declared))
        kept, size = [], 0
        for piece in pieces:
            size += len(piece)
            if size > DRAIN_MAX:
                break
            if size <= MAX_BODY:
                kept.append(piece)
        if size > MAX_BODY:
            self.close_connection = True
            raise Refused(413, "That is more than the App sends.")
        return b"".join(kept)

    def pieces(self, length: int):
        while length > 0:
            piece = self.rfile.read(min(length, 1 << 16))
            if not piece:
                raise ConnectionAbortedError("The client hung up in the middle of its request.")
            length -= len(piece)
            yield piece

    def chunks(self):
        """A chunked body's data, piece by piece; the trailer lines after it are read off and dropped."""
        while True:
            size = self.rfile.readline(1 << 10).split(b";")[0].strip()
            if not re.fullmatch(rb"[0-9A-Fa-f]{1,8}", size):
                self.close_connection = True
                raise Refused(400, "A chunk's size is not a hex number.")
            if not int(size, 16):
                break
            yield from self.pieces(int(size, 16))
            self.rfile.readline(1 << 10)   # the line break after each chunk's data
        while self.rfile.readline(1 << 10).strip():
            pass

    def body(self) -> dict:
        try:
            data = json.loads(self.raw or b"{}")
        except ValueError:
            raise Refused(400, "The request body is not JSON.") from None
        if not isinstance(data, dict):
            raise Refused(400, "The request body is not a JSON object.")
        return data

    def number(self, name: str) -> float | None:
        value = self.query.get(name, [""])[0]
        try:
            return float(value) if value else None
        except ValueError:
            raise Refused(400, f"{name} must be a number.") from None

    def found(self, read, key: int):
        try:
            return read(key)
        except WorkflowError:
            raise Refused(404, "There is no such record.") from None

    def static(self, path: str) -> None:
        name = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
        target = (STATIC / name).resolve()
        if (not target.is_relative_to(STATIC.resolve()) or target.suffix not in TYPES or not target.is_file()):
            raise Refused(404, "There is no such page.")
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", TYPES[target.suffix])
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        for header, value in HEADERS.items():
            self.send_header(header, value)
        self.end_headers()
        self.wfile.write(body)

    @property
    def ledger(self):
        return self.server.home.ledger

    # Pairing and devices

    def pair(self) -> None:
        """Trade a pairing link for a device cookie. The device waits until this computer allows it, except the
        first browser on this computer itself, which is the one `artemis serve` opened."""
        if not self.server.auth.redeem(str(self.body().get("token", ""))):
            raise Refused(401, "This pairing link was used already or has expired. "
                               "Make a new one in Settings on a paired device, or restart Artemis.")
        cookie = secrets.token_urlsafe(32)
        name, phone = _device_name(self.headers.get("User-Agent", ""))
        device = self.ledger.add_device(name, _digest(cookie), f"{secrets.randbelow(10000):04d}", phone)
        if self.loopback and not any(row["state"] == "allowed" for row in self.ledger.devices()):
            self.ledger.set_device(Role.OWNER, device, "allowed")
        row = next(row for row in self.ledger.devices() if row["id"] == device)
        secure = "; Secure" if self.server.tls else ""
        header = f"{COOKIE}={cookie}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=Strict{secure}"
        self.send_json({"device": self.device_json(row, mine=True)}, 200, cookie=header)

    def me(self) -> None:
        self.send_json({"device": None if self.device is None else self.device_json(self.device, mine=True),
                        "loopback": self.loopback, "https": self.server.tls is not None})

    def devices(self) -> None:
        mine = None if self.device is None else self.device["id"]
        self.send_json([self.device_json(row, mine=row["id"] == mine) for row in self.ledger.devices()])

    def device_action(self, key: str, action: str) -> None:
        row = next((row for row in self.ledger.devices() if row["id"] == int(key)), None)
        if row is None:
            raise Refused(404, "There is no such device.")
        if action == "allow":
            if not self.loopback:
                raise Refused(403, "A new device is allowed from the App on the computer Artemis runs on.")
            if row["state"] != "pending":
                raise Refused(409, "Only a device that is waiting can be allowed. A removed one pairs again.")
        elif row["state"] == "revoked":
            raise Refused(409, "That device was removed already.")
        self.ledger.set_device(Role.OWNER, row["id"], "allowed" if action == "allow" else "revoked")
        self.send_json(self.device_json(next(item for item in self.ledger.devices() if item["id"] == row["id"]),
                                        mine=self.device is not None and self.device["id"] == row["id"]))

    def pair_link(self) -> None:
        lan = self.server.lan_host()
        url = self.server.pair_url(lan or "127.0.0.1")
        self.send_json({"url": url, "lan": lan is not None, "expires": time.time() + PAIR_S,
                        "fingerprint": self.server.tls.fingerprint if self.server.tls else None,
                        "qr": segno.make(url, error="m").svg_data_uri(scale=4, border=2)})

    def signout(self) -> None:
        if self.device is not None:
            self.ledger.set_device(Role.OWNER, self.device["id"], "revoked")
        self.send_json({"paired": False}, cookie=f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict")

    # Reading the ledger

    def state(self) -> None:
        home, ledger, since = self.server.home, self.ledger, _today()
        all_cards = ledger.cards()
        cards = [self.card_json(card) for card in all_cards if card["state"] in OPEN_CARDS]
        schedules = ledger.schedules()
        projects = [self.project_summary(project, since, schedules, all_cards) for project in ledger.projects()]
        chosen, running = home.config.agents, [row["agent"] for row in ledger.work() if row["state"] == "running"]
        workers = [{"provider": name, "label": _label(name),
                    "available": agents.available(name, home.config, home.vault, ledger=ledger),
                    "chosen": name == chosen.worker, "live": running.count(name)} for name in agents.PROVIDERS]
        lead = agents.lead_provider(home.config, home.vault, ledger) if chosen.lead == "auto" else chosen.lead
        wakes = sum(1 for row in ledger.latest_events(200, kinds=("lead.wake",)) if row["at"] >= since)
        cursor, read = ledger.latest_events(1), ledger.last_read()
        waiting = [self.device_json(row) for row in ledger.devices() if row["state"] == "pending"]
        self.send_json({
            "stopped": ledger.stopped(), "counts": {**ledger.counts(since), "wakes": wakes}, "since": since,
            "projects": projects, "cards": cards, "lessons": [self.lesson_json(row) for row in ledger.lessons()],
            "lead": {"provider": lead, "label": _label(lead), "answers": home.lead is not None},
            "workers": workers, "max_workers": chosen.max_workers,
            "agents": dict(agents.LABELS),
            "vault": self.vault_json(), "devices_waiting": waiting, "loopback": self.loopback,
            "lan": self.server.lan_host() is not None,
            "device": None if self.device is None else self.device_json(self.device, mine=True),
            "read_at": read["at"] if read else None, "cursor": cursor[0]["id"] if cursor else 0,
            "version": __version__,
        })

    def project_summary(self, project, since: float, schedules, cards) -> dict:
        """A project at a glance: what was last asked of it, its newest evidence, what is due and what blocks it."""
        key, ledger = project["id"], self.ledger
        last = ledger.latest_events(1, project=key)
        asked = ledger.latest_events(1, kinds=("request",), project=key)
        rows = [row for row in ledger.work(project=key) if row["state"] != "dropped"]
        done = sorted((row for row in rows if row["state"] in ("shipped", "verified")),
                      key=lambda row: row["ended"] or row["started"] or 0)
        due = sorted((row for row in schedules if row["project_id"] == key and row["active"]),
                     key=lambda row: row["next_at"])
        waiting = [card for card in cards if card["project_id"] == key and card["state"] == "waiting"]
        stuck = [row for row in rows if row["state"] == "stuck"]
        blocker = ({"kind": "card", "id": waiting[0]["id"], "text": waiting[0]["what"]} if waiting else
                   {"kind": "task", "id": stuck[0]["id"], "text": f"{stuck[0]['title']}: {stuck[0]['note'] or 'stuck'}"}
                   if stuck else None)
        return {**self.project_json(project), "counts": ledger.counts(since, project=key),
                "last": self.server.envelope(last[0]) if last else None,
                "objective": asked[0]["detail"] if asked else None,
                "evidence": {"task_id": done[-1]["id"], "title": done[-1]["title"], "label": done[-1]["state"],
                             "proof": self.proof(done[-1]), "at": done[-1]["ended"]} if done else None,
                "due": {"title": due[0]["title"], "at": due[0]["next_at"]} if due else None,
                "blocker": blocker}

    def messages(self) -> None:
        """The conversation; a lead's reply names the agent that wrote it, from its turn's record."""
        after = int(self.number("after") or 0)
        cards = {card["id"]: card for card in self.ledger.cards()}
        rows = self.ledger.messages(after)
        since = min((row["at"] for row in rows), default=0) - TURN_RECORD_SECONDS
        by = {data["turn"]: data.get("provider") for kind in ("lead.turn", "lead.wake")
              for data in (_loads(row["data"]) for row in self.ledger.events(kind=kind, since=since))
              if isinstance(data, dict) and data.get("turn")}
        self.send_json([{"id": row["id"], "at": row["at"], "role": row["role"], "text": row["text"],
                         "project_id": row["project_id"], "card_id": row["card_id"], "turn": row["turn"],
                         "by": _label(by.get(row["turn"])),
                         "card": self.card_json(cards[row["card_id"]]) if row["card_id"] in cards else None}
                        for row in rows])

    def updates(self) -> None:
        """The newest update lines; a card.opened line carries its card as it is now, so the thread can show it."""
        limit = min(int(self.number("limit") or 300), 1000)
        cards = {card["id"]: card for card in self.ledger.cards()}
        self.send_json([{**self.server.envelope(row),
                         "card": self.card_json(cards[row["card_id"]])
                         if row["kind"] == "card.opened" and row["card_id"] in cards else None}
                        for row in self.ledger.latest_events(limit, kinds=UPDATE_KINDS)])

    def project(self, key: str) -> None:
        project = self.found(self.ledger.project, int(key))
        self.send_json({
            "project": self.project_json(project),
            "tasks": [self.task_json(row) for row in self.ledger.work(project=project["id"])
                      if row["state"] != "dropped"],
            "schedules": [self.schedule_json(row) for row in self.ledger.schedules(project["id"])],
            "lessons": [self.lesson_json(row) for row in self.ledger.lessons(project["id"])],
        })

    def task(self, key: str) -> None:
        row = self.found(self.ledger.work, int(key))[0]
        task, history = self.ledger.task_brief(row["id"]), self.ledger.task_history(row["id"])
        labels = [item["label"] for item in json.loads(task["criteria"])]
        events = self.ledger.events(task=row["id"])
        reviews = [self.server.envelope(event) for event in events if event["kind"] == "review"]
        log = self.server.home.paths.logs / f"task-{row['id']}.log"
        tail = log.read_bytes()[-LOG_TAIL:].decode("utf-8", "replace") if log.is_file() else ""
        self.send_json({
            "task": {**self.task_json(row), "brief": task["brief"], "criteria": labels},
            "runs": [{"id": run["id"], "agent": run["agent"], "label": _label(run["agent"]),
                      "branch": run["branch"], "started": run["started"], "ended": run["ended"],
                      "outcome": run["outcome"], "note": run["note"]} for run in history["runs"]],
            "submissions": [{"id": item["id"], "sha": item["sha"], "claim": item["claim"]}
                            for item in history["submissions"]],
            "evidence": [evidence_json(item, labels) for item in history["evidence"]],
            "verdicts": [{"submission": item["submission_id"], "kind": item["kind"], "gaps": json.loads(item["gaps"])}
                         for item in history["verdicts"]],
            "review": reviews[-1] if reviews else None,
            "log_tail": tail,
            "files_changed": [event["detail"] for event in events if event["kind"] == "file.changed"],
            "undo": (self.server.home.paths.undo / f"task-{row['id']}").is_dir(),
        })

    def digest(self) -> None:
        project = self.number("project")
        found = attention.digest(self.ledger, project=None if project is None else int(project),
                                 since=self.number("since"))
        # A line's proof is written for the terminal, where a question ends with the command that answers it; the
        # App asks the question with a button instead, so the proof stops before it.
        self.send_json({"lines": [{"label": line.label, "ref": line.ref, "title": line.title,
                                   "proof": line.proof.partition(f" · {line.question}")[0] if line.question
                                   else line.proof, "project": line.project, "question": line.question}
                                  for line in found.lines],
                        "counts": found.counts, "text": found.text})

    def digest_read(self) -> None:
        """The person has read the digest: the next one starts from here."""
        self.ledger.mark_read(Role.OWNER)
        self.send_json({"read_at": self.ledger.last_read()["at"]})

    def secrets(self) -> None:
        vault = self.vault()
        uses: dict[str, list[float]] = {}
        for row in self.ledger.secret_uses():
            uses.setdefault(row["name"], []).append(row["at"])
        self.send_json([{"name": info.name, "kind": info.kind, "note": info.note,
                         "use": info.use, "origin": info.origin,
                         "last_used": max(uses.get(info.name, [0.0])) or None, "uses": len(uses.get(info.name, []))}
                        for info in vault.names()])

    def secrets_audit(self) -> None:
        """Search what Artemis wrote for any stored value. Only counts come back, never where or which."""
        found = audit(self.vault(), self.server.home.paths)
        self.send_json({"values": found.values, "files": found.files, "found": len(found.hits)})

    def lessons(self) -> None:
        self.send_json([self.lesson_json(row) for row in self.ledger.lessons(state=None)])

    def settings(self) -> None:
        ledger, cards = self.ledger, {card["id"]: card for card in self.ledger.cards()}
        names = {row["id"]: row["name"] for row in ledger.projects()}
        schedules = ledger.schedules()
        titles = {row["id"]: row["title"] for row in schedules}
        mine = None if self.device is None else self.device["id"]
        self.send_json({
            "adapters": [{"provider": row["provider"], "label": _label(row["provider"]),
                          "role": row["role"], "os": row["os"], "version": row["version"],
                          "features": json.loads(row["features"]), "auth": row["auth"], "status": row["status"],
                          "receipt": row["receipt"], "at": row["at"]} for row in ledger.adapters()],
            "standing": [{"id": row["id"], "kind": row["kind"], "what": cards[row["card_id"]]["what"]
                          if row["card_id"] in cards else None, "card_id": row["card_id"],
                          "schedule": titles.get(row["schedule_id"]), "method": row["method"], "url": row["url"],
                          "argv": _loads(row["argv"]), "cwd": row["cwd"], "secret": row["secret"],
                          "created": row["created"]} for row in ledger.standing_approvals()],
            "devices": [self.device_json(row, mine=row["id"] == mine) for row in ledger.devices()],
            "schedules": [{**self.schedule_json(row), "project": names.get(row["project_id"])} for row in schedules],
            "lan": self.server.lan_host(), "fingerprint": self.server.tls.fingerprint if self.server.tls else None,
            "vault": self.vault_json(), "version": __version__, "lead": self.lead_json(),
        })

    def lead_json(self) -> dict:
        """Who leads, how it was chosen, and every agent that could, each with why it cannot lead here yet."""
        home = self.server.home
        chosen = home.config.agents.lead
        provider = agents.lead_provider(home.config, home.vault, self.ledger) if chosen == "auto" else chosen
        return {"chosen": chosen, "provider": provider, "label": _label(provider),
                "fixed": bool(os.environ.get("ARTEMIS_LEAD")),
                "choices": [{"provider": name, "label": _label(name), "why": self.cannot_lead(name)}
                            for name in agents.LEADS]}

    def cannot_lead(self, name: str) -> str | None:
        """Why this agent cannot lead here now, in a few words; None when it can (the rules lead_provider uses)."""
        home = self.server.home
        if not agents.ready(name, home.config, home.vault):
            return ("needs a model and its key in config.toml's [api]" if name == "api"
                    else "not installed or not signed in on this computer")
        if not agents.qualified(name, "lead", self.ledger):
            if agents.status(name, "lead", self.ledger) == "unqualified":
                return "did not qualify to lead here; run `artemis doctor providers` to try again"
            return "not qualified to lead yet: run `artemis doctor providers`"
        return None

    # Acting

    def set_lead(self) -> None:
        """Choose who leads: the [agents] lead line of the home's config.toml, read again so the next turn uses it."""
        home = self.server.home
        name = str(self.body().get("lead", ""))
        if os.environ.get("ARTEMIS_LEAD"):
            raise Refused(409, "ARTEMIS_LEAD was set when Artemis started, and it decides who leads. "
                               "Start Artemis without it to choose here.")
        if name != "auto" and name not in agents.LEADS:
            raise Refused(400, f"There is no lead called {name!r}. Choose auto or one of: {', '.join(agents.LEADS)}.")
        why = None if name == "auto" else self.cannot_lead(name)
        if why:
            raise Refused(409, f"{_label(name)} cannot lead yet: {why}.")
        if name != home.config.agents.lead:
            write_lead(home.paths.config, name)
            home.config = HomeConfig.load(home.paths)
            provider = agents.lead_provider(home.config, home.vault, self.ledger)
            said = (f"Lead switched to {_label(provider)}" if name != "auto"
                    else f"Lead set to automatic, which is {_label(provider)} now")
            self.ledger.record(Role.OWNER, "lead.switched", said, data={"lead": name, "provider": provider})
        self.send_json(self.lead_json())

    def say(self) -> None:
        data = self.body()
        text = str(data.get("text", "")).strip()
        if not text or len(text) > 20000:
            raise Refused(400, "A message is between 1 and 20000 characters.")
        project = data.get("project_id")
        if project is not None:
            if not isinstance(project, int):
                raise Refused(400, "project_id is a project's number.")
            project = self.found(self.ledger.project, project)["id"]
        message = self.ledger.say(Role.OWNER, text, project=project)
        if self.server.home.lead is None:
            self.ledger.say(Role.HOME, "No lead runs in this home yet, so nobody answers here. Your message is "
                                       "kept; `artemis start` in a terminal talks to the lead.", project=project)
        else:
            self.server.answer(message)
        self.send_json({"id": message})

    def add_project(self) -> None:
        data = self.body()
        path = Path(str(data.get("path", "")).strip()).expanduser()
        if not path.is_absolute() or not path.is_dir():
            raise Refused(400, "Give the full path of a folder on this computer.")
        path = path.resolve()
        kind = "repo" if (path / ".git").exists() else "folder"
        name = str(data.get("name") or "").strip() or repo_name(path)
        self.send_json({"id": self.ledger.add_project(Role.OWNER, name, kind, path), "kind": kind, "name": name})

    def card(self, key: str, action: str) -> None:
        self.found(self.ledger.card, int(key))
        data = self.body()
        if action == "secret":
            self.hidden = (str(data.get("value", "")),) if data.get("value") else ()
        self.ledger.expire_cards()
        card = self.ledger.card(int(key))
        if card["state"] == "expired":
            raise Refused(409, "This card expired before you answered it. Nothing ran.")
        if card["state"] != "waiting":
            raise Refused(409, "This card is no longer waiting for you.")
        if action in ("approve", "decline"):
            if card["kind"] not in tuple(Interrupt):
                raise Refused(400, f"This is a {card['kind']} card; it is answered, not approved.")
            approve = action == "approve"
            if approve and card["kind"] in self.phone_only() and not (self.device is not None and self.device["phone"]):
                raise Refused(403, "This one is approved on your paired phone. You can decline it here.")
            standing = None
            if approve and data.get("standing"):
                if card["kind"] not in STANDING_KINDS:
                    raise Refused(400, "Money out is asked every time; it never gets a standing approval.")
                standing = self.standing_for(card["id"])
                if standing is None:
                    raise Refused(400, "Only one exact operation from a scheduled task can be approved for good; "
                                       "this one is approved once.")
            self.ledger.decide_card(Role.OWNER, card["id"], approve, standing=standing)   # the home carries it out
        elif action == "choose":
            self.ledger.choose(Role.OWNER, card["id"], str(data.get("option", "")))
        else:
            if card["kind"] != "secret":
                raise Refused(400, f"This is a {card['kind']} card, not a secret card.")
            wanted = _loads(card["options"], {})
            self.store_secret(wanted["name"], str(data.get("value", "")), wanted.get("kind", "none"),
                              wanted.get("note", ""), wanted.get("use") or "env", wanted.get("origin"))
            self.ledger.secret_set(Role.OWNER, card["id"])
        self.send_json(self.card_json(self.ledger.card(card["id"])))

    def phone_only(self) -> tuple[str, ...]:
        """Card kinds approved only from a paired phone: [cards] phone_only in the home's config.toml."""
        return self.server.home.config.cards.phone_only

    def standing_for(self, card: int) -> dict | None:
        """What approving this card for good binds to, as the broker reads it; None when it can only be approved
        once (or this build has no broker)."""
        broker = self.server.home.broker
        return None if broker is None else broker.standing_for(card)

    def add_secret(self) -> None:
        data = self.body()
        value = str(data.get("value", ""))
        self.hidden = (value,) if value else ()
        name, kind = str(data.get("name", "")).strip(), str(data.get("kind") or "none")
        use, origin = str(data.get("use") or "env"), str(data.get("origin") or "").strip() or None
        info = self.store_secret(name, value, kind, str(data.get("note", "")).strip(), use, origin)
        self.send_json({"name": info.name, "kind": info.kind, "use": info.use, "origin": info.origin})

    def remove_secret(self, name: str) -> None:
        """Delete a secret from the vault, as `artemis secret remove` does; the App asks the person to confirm."""
        self.vault().remove(name)
        self.send_json({"removed": name})

    def store_secret(self, name: str, value: str, kind: str, note: str, use: str, origin: str | None):
        """The vault checks the name, kind, use, origin and length; this checks only how the value travelled."""
        if not (self.server.tls or self.loopback):
            raise Refused(403, "A secret is entered on this computer or over HTTPS only.")
        if not value:
            raise Refused(400, "Type the value to store.")
        vault = self.vault()
        vault.set(name, value, use=use, kind=kind, origin=origin, note=note)
        return vault.info(name)

    def vault(self):
        vault = self.server.home.vault
        if vault is None:
            raise Refused(423, "The vault is not set up on this home.")
        if not vault.unlocked:
            raise Refused(423, "The vault is locked. Unlock it in the App on this computer or where Artemis runs.")
        return vault

    def unlock(self) -> None:
        if not self.loopback:
            raise Refused(403, "The vault is unlocked on the computer Artemis runs on.")
        vault = self.server.home.vault
        if vault is None or vault.unlocked:
            raise Refused(409, "The vault is not locked.")
        passphrase = str(self.body().get("passphrase", ""))
        self.hidden = (passphrase,) if passphrase else ()
        vault.unlock(passphrase)   # approved cards that wait for a stored key go out on the home's next round
        self.send_json(self.vault_json())

    def vault_json(self) -> dict | None:
        vault = self.server.home.vault
        if vault is None:
            return None
        return {"backend": vault.backend, "notice": vault.notice, "locked": not vault.unlocked,
                "state": vault.state, "from_env": vault.backend == "env" and vault.unlocked}

    def lesson(self, key: str, action: str) -> None:
        if not any(row["id"] == int(key) for row in self.ledger.lessons(state=None)):
            raise Refused(404, "There is no such lesson.")
        (lessons.retire if action == "retire" else lessons.accept)(self.ledger, int(key))
        self.send_json(next(self.lesson_json(row) for row in self.ledger.lessons(state=None) if row["id"] == int(key)))

    def revoke_standing(self, key: str) -> None:
        if not any(row["id"] == int(key) for row in self.ledger.standing_approvals()):
            raise Refused(404, "There is no such standing approval, or it was revoked already.")
        self.ledger.revoke_standing(Role.OWNER, int(key))
        self.send_json({"revoked": int(key)})

    def stop(self) -> None:
        self.ledger.stop(Role.OWNER, str(self.body().get("reason") or "Stopped from the App"))
        self.send_json({"stopped": self.ledger.stopped()})

    def resume(self) -> None:
        self.ledger.resume(Role.OWNER, str(self.body().get("reason") or "Resumed from the App"))
        self.send_json({"stopped": self.ledger.stopped()})

    def undo(self, key: str) -> None:
        from ..undo import restore
        task = self.found(self.ledger.task_brief, int(key))
        self.send_json({"restored": restore(self.server.home.paths, task["id"])})

    # The live stream, and the long poll for when a stream cannot be held open

    def events(self) -> None:
        after = int(self.headers.get("Last-Event-ID") or self.number("after") or 0)
        if self.query.get("poll", [""])[0] == "1":
            return self.poll(after)
        with self.server.streams_lock:
            if self.server.streams >= MAX_STREAMS:
                raise Refused(503, "Too many live views are open; this one checks every few seconds instead.")
            self.server.streams += 1
        try:
            self.stream(after)
        finally:
            with self.server.streams_lock:
                self.server.streams -= 1

    def poll(self, after: int) -> None:
        """Answer as soon as there is a newer event, or after POLL_WAIT seconds with none."""
        deadline = time.monotonic() + POLL_WAIT
        rows = self.ledger.events(after, limit=500)
        while not rows and time.monotonic() < deadline and not self.server.closing.is_set():
            self.server.closing.wait(POLL_SECONDS)
            rows = self.ledger.events(after, limit=500)
        self.send_json({"events": [self.server.envelope(row) for row in rows],
                        "cursor": rows[-1]["id"] if rows else after})

    def stream(self, after: int) -> None:
        feed = self.server.home.subscribe()
        try:
            self.follow(feed, after)
        finally:
            self.server.home.unsubscribe(feed)

    def follow(self, feed: queue.Queue, after: int) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        self.wfile.write(b"retry: 2000\n\n")
        beat = time.monotonic()
        while not self.server.closing.is_set():
            for row in self.ledger.events(after, limit=500):
                self.emit(self.server.envelope(row), row["id"])
                after = row["id"]
            try:
                while True:   # transient items such as said.delta; None means this client fell behind
                    item = feed.get(timeout=POLL_SECONDS)
                    if item is None:
                        return
                    self.emit({"kind": item["kind"], "at": item.get("at"), "data": item["data"]})
            except queue.Empty:
                pass
            if self.hung_up():
                return
            if time.monotonic() - beat >= HEARTBEAT_SECONDS:
                self.wfile.write(b": still here\n\n")
                self.wfile.flush()
                beat = time.monotonic()

    def hung_up(self) -> bool:
        """Whether the client has closed its end. A stream only writes, so a write would find out too, but only when
        there is something to send; this looks between sends. Bytes a client sends on a stream are dropped."""
        if not select.select([self.connection], [], [], 0)[0]:
            return False
        before = self.connection.gettimeout()
        self.connection.settimeout(0)
        try:
            return not self.connection.recv(4096)
        except (BlockingIOError, ssl.SSLWantReadError):
            return False
        except OSError:
            return True
        finally:
            self.connection.settimeout(before)

    def emit(self, data: dict, key: int | None = None) -> None:
        text = self.server.scrub(json.dumps(data, ensure_ascii=False))
        self.wfile.write(((f"id: {key}\n" if key is not None else "") + f"data: {text}\n\n").encode("utf-8"))
        self.wfile.flush()

    # The broker's door for agents on this machine

    def broker(self) -> None:
        if not self.loopback:
            raise Refused(403, "The broker answers only this computer.")
        token = self.headers.get("X-Artemis-Run")
        if not token:
            raise Refused(401, "A broker call names its run.")
        data = self.body()
        if self.server.home.broker is None:
            raise Refused(503, "This build of Artemis has no broker, so agents have no Artemis tools.")
        try:
            result = self.server.home.broker.call(token, str(data.get("tool", "")), data.get("args") or {})
        except ToolError as exc:
            raise Refused(400, str(exc)) from None
        except VaultLocked as exc:
            raise Refused(423, str(exc)) from None
        self.send_json(result)

    # Shapes

    def project_json(self, row) -> dict:
        return {"id": row["id"], "name": row["name"], "kind": row["kind"], "path": row["path"]}

    def device_json(self, row, mine: bool = False) -> dict:
        """A device as the App lists it. Its comparison code shows only to itself and on this computer."""
        show = row["state"] == "pending" and (mine or self.loopback)
        return {"id": row["id"], "name": row["name"], "state": row["state"], "phone": bool(row["phone"]),
                "created": row["created"], "last_seen": row["last_seen"], "code": row["code"] if show else None,
                "this": mine}

    def card_json(self, row) -> dict:
        state = row["state"]
        if state == "waiting" and row["expires"] is not None and row["expires"] < time.time():
            state = "expired"
        task = self.ledger.work(row["task_id"]) if row["task_id"] is not None else []
        http = {key: json.loads(row["command"]).get(key) for key in ("method", "url", "save_to")} \
            if httpop.is_http(row) else None
        argv = None if http else _argv(row["command"])
        return {"id": row["id"], "kind": row["kind"], "what": row["what"], "why": row["why"],
                "command": None if http else shlex.join(argv) if argv is not None else row["command"],
                "argv": argv, "request": http,
                "cwd": row["cwd"], "shell": row["shell"],
                "secrets": json.loads(row["secrets"]), "rule": row["rule"], "options": _loads(row["options"]),
                "state": state, "answer": row["answer"], "result": row["result"], "expires": row["expires"],
                "allow_standing": row["kind"] in STANDING_KINDS and row["state"] == "waiting"
                and self.standing_for(row["id"]) is not None,
                "receiver": demo_receiver.NAME if http and demo_receiver.listening(self.ledger, http["url"]) else None,
                "phone_only": row["kind"] in self.phone_only(),
                "task": {"id": task[0]["id"], "title": task[0]["title"], "label": task[0]["state"],
                         "proof": self.proof(task[0])} if task else None,
                "project_id": row["project_id"], "task_id": row["task_id"], "created": row["created"],
                "decided": row["decided"]}

    def lesson_json(self, row) -> dict:
        return {"id": row["id"], "kind": row["kind"], "text": row["text"], "state": row["state"],
                "project_id": row["project_id"], "source": json.loads(row["source"]),
                "payload": json.loads(row["payload"]), "uses": row["uses"], "first_try": row["first_try"],
                "question": lessons.question(row), "from": lessons.source_text(row),
                "created": row["created"]}

    def proof(self, row) -> str:
        """A task's evidence in one line, in the digest's own words."""
        return attention._task_line(self.ledger, row, self.ledger.project(row["project_id"])["kind"])[1]

    def schedule_json(self, row) -> dict:
        return {"id": row["id"], "title": row["title"], "spec": row["spec"], "kind": row["kind"],
                "project_id": row["project_id"], "next_at": row["next_at"], "last_at": row["last_at"],
                "active": bool(row["active"])}

    def task_json(self, row) -> dict:
        provider = row["agent"] or row["provider"]
        return {"id": row["id"], "title": row["title"], "kind": row["kind"], "state": row["state"],
                "label": row["state"], "provider": provider, "provider_label": _label(provider),
                "proof": self.proof(row), "project_id": row["project_id"], "request_id": row["request_id"],
                "started": row["started"], "ended": row["ended"], "note": row["note"], "sha": row["sha"],
                "target": row["target"], "landed": row["landed"], "review": bool(row["review"]),
                "schedule_id": row["schedule_id"]}


def evidence_json(row, labels: list[str]) -> dict:
    data = json.loads(row["data"])
    label = labels[row["criterion"] - 1] if row["criterion"] <= len(labels) else f"check {row['criterion']}"
    said = "exit_code" in data and label == " ".join(data["argv"])   # a check named by its command shows its exit
    summary = f"{label} exit {data['exit_code']}" if said else label
    return {"submission": row["submission_id"], "criterion": row["criterion"], "label": label, "kind": row["kind"],
            "summary": summary, "exit_code": data.get("exit_code"), "output": data.get("output", "")[-2000:]}


def start(home, port: int, lan: bool | str, tls: tuple[Path, Path] | None) -> AppServer:
    """Serve the App and its API from a daemon thread; on the network, print the phone's link. HTTPS when lan or
    tls is given. lan is True for this machine's own network, or the name a phone opens (a Tailscale or DNS name, a
    public address), which the certificate covers and the phone's link uses."""
    server = AppServer(("0.0.0.0" if lan else "127.0.0.1", port), home,
                       _tls(home, lan, tls) if (lan or tls) else None, address(lan) if isinstance(lan, str) else None)
    threading.Thread(target=server.serve_forever, name="artemis-app", daemon=True).start()
    banner = server.banner()
    if banner:
        print(banner, flush=True)
    return server
