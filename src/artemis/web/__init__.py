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
from pathlib import Path
import queue
import re
import secrets
import select
import socket
import socketserver
import ssl
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit

from cryptography import x509
import segno

from .. import __version__, agents, lessons
from ..broker import ToolError
from ..config import HomeConfig, base_url_setting, model_setting, name_setting, write_setting
from ..home import PAIR_S
from ..roles import Interrupt, Role, WorkflowError
from ..scrub import audit
from ..tls import address, ensure_cert, fingerprint, lan_names, qr_text
from ..vault import VaultLocked
from . import boards, chat_files, conversation, frames, owner, secret_requests, workspace
from .wire import Refused, module_frames, refresh_kinds

# The App's feature modules, each with ROUTES, FRAMES and REFRESH (wire.py says how); frames is the core one.
FEATURES = (workspace, frames, conversation, chat_files, boards, owner, secret_requests)


APP = Path(__file__).parent / "app"          # the App: its built front-end (tools/build_web)
CLIENT = Path(__file__).parent / "client.js"   # how the App reaches this home: its paths and its live stream
BUILT = re.compile(r"/static/[0-9a-f]{12}/(.+)")   # a file of one build, named by the build's id: cached for good
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
         ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
         ".webmanifest": "application/manifest+json", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
         ".wasm": "application/wasm", ".wav": "audio/wav", ".mp3": "audio/mpeg"}
ENCODINGS = (("br", ".br"), ("gzip", ".gz"))   # the build's own compressed copies, served when the browser takes them
HEADERS = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                               "img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; "
                               "connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; "
                               "form-action 'self'; frame-ancestors 'none'",
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
HEARTBEAT_SECONDS = 15.0
FRESH_SECONDS = 60.0     # the App calls data over 90 s old stale; a quiet home re-reads it at least this often
MAX_STREAMS = 32                  # live streams; past this, writes still find a thread
MAX_BODY = 1 << 20                # the most the App ever sends
DRAIN_MAX = 16 << 20              # a longer body is read off and dropped up to this, so its sender gets the 413
REPLIES = 2000                    # answers kept for repeated X-Request-Ids
TURN_WAIT = 20.0                  # closing waits this long for a lead still answering and streams still open
SYSTEMS = (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"), ("Windows", "Windows"),
           ("Macintosh", "Mac"), ("CrOS", "ChromeOS"), ("Linux", "Linux"))
BROWSERS = (("Edg/", "Edge"), ("FxiOS", "Firefox"), ("Firefox/", "Firefox"), ("CriOS", "Chrome"),
            ("Chrome/", "Chrome"), ("Safari/", "Safari"))


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


def _loads(text: str | None, default=None):
    return default if text is None else json.loads(text)


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
        self.replies: OrderedDict[tuple[str, str], Reply] = OrderedDict()
        self.replies_lock = threading.Lock()
        self.streams = 0
        self.streams_changed = threading.Condition()   # shutdown waits on it for the last stream
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
        with self.streams_changed:      # a stream reads the ledger until it sees the close
            self.streams_changed.wait_for(lambda: not self.streams, max(0.0, deadline - time.monotonic()))

    def frame(self, kind: str, payload) -> None:
        """Send one frame to every open App stream now (a change no ledger event records)."""
        self.home.publish("frame", {"kind": kind, "payload": payload})

    def say(self, text: str, attachments: list | None = None, client: str | None = None) -> int:
        """The person's message into the conversation, from the App's send or its queue; the lead answers it."""
        message = self.home.ledger.say(Role.OWNER, text, attachments=attachments, client=client)
        if self.home.lead is None:
            self.home.ledger.say(Role.HOME, "No lead runs in this home yet, so nobody answers here. Your message is "
                                            "kept; `artemis doctor providers` shows which agent can lead.")
        else:
            self.answer(message)
        return message

    def idle(self) -> bool:
        """No answer is being written: a queued message goes now."""
        with self.turns_lock:
            return not self.turns

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
            if not self.closing.is_set():
                chat_files.drain(self)     # the next message the person queued while this answer was written

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

class Handler(http.server.BaseHTTPRequestHandler):
    server: AppServer
    server_version = "Artemis"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    ROUTES = (
        ("GET", r"/api/me", "me"),
        ("GET", r"/api/secrets", "secrets"), ("POST", r"/api/secrets", "add_secret"),
        ("POST", r"/api/secrets/([A-Z][A-Z0-9_]*)/remove", "remove_secret"),
        ("GET", r"/api/secrets/audit", "secrets_audit"), ("POST", r"/api/vault/unlock", "unlock"),
        ("POST", r"/api/lessons/(\d+)/(retire|accept)", "lesson"),
        ("POST", r"/api/stop", "stop"), ("POST", r"/api/resume", "resume"),
        ("GET", r"/api/settings", "settings"),
        ("GET", r"/api/setup", "setup_state"), ("POST", r"/api/setup", "save_setup"),
        ("GET", r"/events", "live"),
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
            parts = urlsplit(self.path)
            self.raw = self.read_body(*self.body_limit(method, parts.path))
            if _host(self.headers.get("Host", "")) not in self.server.hosts:
                raise Refused(403, "This address is not one Artemis answers to.")
            self.query = parse_qs(parts.query)
            if (self.server.tls and not isinstance(self.connection, ssl.SSLSocket)
                    and parts.path != "/broker/call" and not self.headers.get("Authorization")):
                return self.to_https()   # plain HTTP is for programs on this computer: agents and the CLI
            if parts.path == "/broker/call" and method == "POST":
                return self.broker()
            if parts.path == "/api/pair" and method == "POST":
                self.same_origin()
                return self.pair()
            if parts.path.startswith("/api/") or self.routed(parts.path):
                return self.api(method, parts.path)
            if parts.path == "/healthz" and method == "GET":
                return self.send_json({"ok": True})
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
        for verb, pattern, answer in self.routes():
            found = re.fullmatch(pattern, path)
            if found and verb == method:
                if method == "POST" and self.repeated(caller):
                    return
                try:
                    return answer(*found.groups())
                except WorkflowError as exc:
                    raise Refused(409, str(exc)) from None
                except VaultLocked as exc:
                    raise Refused(423, str(exc)) from None
                except ValueError as exc:
                    raise Refused(400, str(exc)) from None
        raise Refused(404, "There is no such page in the App's API.")

    def routes(self):
        """(method, path pattern, answer) for every path the App's API answers: the server's own, then each
        feature module's."""
        for verb, pattern, name in self.ROUTES:
            yield verb, pattern, getattr(self, name)
        for module in FEATURES:
            for verb, pattern, function in getattr(module, "ROUTES", ()):
                yield verb, pattern, (lambda *groups, function=function: function(self, *groups))

    def routed(self, path: str) -> bool:
        return any(re.fullmatch(pattern, path) for _, pattern, _ in self.routes())

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

    def body_limit(self, method: str, path: str) -> tuple[int, int, str]:
        """(max bytes, drain cap, 413 error) for this route; feature modules may raise the cap for uploads."""
        for module in FEATURES:
            override = getattr(module, "body_limit", None)
            if override is not None:
                found = override(method, path)
                if found is not None:
                    limit, error = found
                    return limit, max(DRAIN_MAX, limit + (1 << 20)), error
        return MAX_BODY, DRAIN_MAX, "That is more than the App sends."

    def read_body(self, limit: int = MAX_BODY, drain: int = DRAIN_MAX,
                  too_large: str = "That is more than the App sends.") -> bytes:
        """This request's whole body, read off the connection before any answer. The next request on a kept-alive
        connection then starts where it should, and a refusal reaches a client that has finished sending: closing a
        socket with bytes still unread resets it on some systems (Windows does), and the client sees "connection
        aborted" in place of the answer. A body longer than the App sends is read off in pieces and dropped; one
        declared longer than drain is not read, and its connection ends."""
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
            if int(declared) > drain:
                self.close_connection = True
                raise Refused(413, too_large)
            pieces = self.pieces(int(declared))
        kept, size = [], 0
        for piece in pieces:
            size += len(piece)
            if size > drain:
                break
            if size <= limit:
                kept.append(piece)
        if size > limit:
            self.close_connection = True
            raise Refused(413, too_large)
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

    def found(self, read, key: int):
        try:
            return read(key)
        except WorkflowError:
            raise Refused(404, "There is no such record.") from None

    def static(self, path: str) -> None:
        """A file of the App: its page, a file of its build (/static/<build>/...), fonts and icons, and client.js.
        A build's files never change under their name, so they are cached for good; the rest is checked each time."""
        built = BUILT.fullmatch(path)
        name = "index.html" if path in ("/", "/index.html") else built.group(1) if built else path.lstrip("/")
        target = CLIENT if path == "/client.js" else (APP / name).resolve()
        if (target != CLIENT and not target.is_relative_to(APP.resolve())) or target.suffix not in TYPES \
                or not target.is_file():
            raise Refused(404, "There is no such page.")
        taken = self.headers.get("Accept-Encoding", "")
        encoding, suffix = next(((coding, ending) for coding, ending in ENCODINGS
                                 if coding in taken and target.with_name(target.name + ending).is_file()), (None, ""))
        body = target.with_name(target.name + suffix).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", TYPES[target.suffix])
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if built else "no-cache")
        if encoding:
            self.send_header("Content-Encoding", encoding)
            self.send_header("Vary", "Accept-Encoding")
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
        return conversation.lead_choices(self.server.home)

    # Acting

    def setup_state(self) -> None:   # not setup(): BaseRequestHandler.setup opens the connection
        """What the first-run setup and Settings show: whether the setup was finished, the names, what Artemis asks
        the person first, whether all automatic work is stopped (POST /api/stop and /api/resume), and where each step
        stands (who can lead, the API, the vault, paired devices, projects)."""
        home, ledger = self.server.home, self.ledger
        self.send_json({
            "done": bool(ledger.events(kind="setup.finished", limit=1)), "stopped": ledger.stopped(),
            "name": home.config.lead.name, "you": home.config.lead.you,
            "ask": list(home.config.interrupts.ask), "phone_only": list(home.config.cards.phone_only),
            "kinds": list(Interrupt), "here": self.loopback, "lead": self.lead_json(), "vault": self.vault_json(),
            "api": {"base_url": home.config.api.base_url, "model": home.config.api.model, "key": home.config.api.key},
            "devices": len(ledger.devices()), "projects": len(ledger.projects()),
        })

    def save_setup(self) -> None:
        """Keep what the person chose in the first-run setup (or later in Settings). Every field is optional:
        name and you (the lead's name and theirs), ask (the kinds of action put to them first), phone_only
        (the kinds only a paired phone approves) and api {base_url?, model?} (the OpenAI-compatible API that can lead),
        each a line of the home's config.toml; done ends the setup."""
        home, data = self.server.home, self.body()
        writes = [("lead", key, name_setting(data[key], "A name")) for key in ("name", "you") if key in data]
        if ("ask" in data or "phone_only" in data or "api" in data) and not self.loopback:
            raise Refused(403, "What Artemis asks you first, and the API it uses, change on the computer it runs on.")
        api = data.get("api", {})
        if not isinstance(api, dict) or set(api) - {"base_url", "model"}:
            raise Refused(400, "api takes base_url and model.")
        if "base_url" in api:
            writes.append(("api", "base_url", base_url_setting(str(api["base_url"]))))
        if "model" in api:
            writes.append(("api", "model", model_setting(api["model"])))
        if "ask" in data or "phone_only" in data:
            chosen = {}
            for key, now in (("ask", home.config.interrupts.ask), ("phone_only", home.config.cards.phone_only)):
                value = data.get(key, list(now))
                if not isinstance(value, list) or any(item not in list(Interrupt) for item in value):
                    raise Refused(400, f"{key} lists only: {', '.join(Interrupt)}.")
                chosen[key] = [kind for kind in Interrupt if kind in value]
            if not set(chosen["phone_only"]) <= set(chosen["ask"]):
                raise Refused(400, "A kind approved only from a phone is one Artemis asks you about first.")
            writes += [("interrupts", "ask", chosen["ask"]), ("cards", "phone_only", chosen["phone_only"])]
        for section, key, value in writes:
            write_setting(home.paths.config, section, key, value)
        if writes:
            home.config = HomeConfig.load(home.paths)
            self.ledger.record(Role.OWNER, "setup.changed", "Setup changed: " + ", ".join(
                f"{section}.{key}" for section, key, _ in writes), data={"changed": [key for _, key, _ in writes]})
        if data.get("done") is True and not self.ledger.events(kind="setup.finished", limit=1):
            self.ledger.record(Role.OWNER, "setup.finished", "First-run setup finished")
        self.setup_state()

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

    # The live stream

    def live(self) -> None:
        """The App's live stream: every feature's frames when it opens, then each frame again when a ledger event
        changes it (wire.py), frames modules send themselves, and a heartbeat. What the ledger recorded goes out
        before anything published after it (the person's message before the reply it starts), and the frames that
        follow the ledger go out again at least every FRESH_SECONDS, because time alone ages what they show."""
        query = {key: values[0] for key, values in self.query.items()}
        with self.server.streams_changed:
            if self.server.streams >= MAX_STREAMS:
                raise Refused(503, "Too many live views are open.")
            self.server.streams += 1
        feed = self.server.home.subscribe()
        try:
            self.send_response(200)
            for header, value in (("Content-Type", "text/event-stream; charset=utf-8"), ("Cache-Control", "no-cache"),
                                  ("X-Accel-Buffering", "no"), ("Connection", "close")):
                self.send_header(header, value)
            self.end_headers()
            self.close_connection = True
            self.wfile.write(b"retry: 2000\n\n")
            after = max([row["id"] for row in self.ledger.latest_events(1)], default=0)
            self.frames(query, [kind for module in FEATURES for kind in getattr(module, "FRAMES", {})])
            beat = fresh = time.monotonic()
            while not self.server.closing.is_set():
                try:
                    item = feed.get(timeout=POLL_SECONDS)
                except queue.Empty:
                    item = {}
                if item is None:
                    return
                kinds: set[str] = set()
                if time.monotonic() - fresh >= FRESH_SECONDS:
                    kinds, fresh = refresh_kinds(FEATURES, ""), time.monotonic()
                for row in self.ledger.events(after, limit=500):
                    kinds |= refresh_kinds(FEATURES, row["kind"])
                    self.sent(module_frames(FEATURES, "EVENTS", row["kind"], self.server, row, query))
                    after = row["id"]
                self.frames(query, sorted(kinds))
                if item.get("kind") == "frame":
                    self.emit(item["data"])
                elif item:
                    self.sent(module_frames(FEATURES, "FEED", item["kind"], self.server, item["data"], query))
                if self.hung_up():
                    return
                if time.monotonic() - beat >= HEARTBEAT_SECONDS:
                    self.emit({"kind": "heartbeat", "payload": {"fetched_at": frames.now()}})
                    beat = time.monotonic()
        finally:
            self.server.home.unsubscribe(feed)
            with self.server.streams_changed:
                self.server.streams -= 1
                self.server.streams_changed.notify_all()

    def sent(self, frames) -> None:
        for kind, payload in frames:
            self.emit({"kind": kind, "payload": payload})

    def frames(self, query: dict, kinds) -> None:
        """Build and send these frames, each from the module that has it."""
        for kind in kinds:
            for module in FEATURES:
                build = getattr(module, "FRAMES", {}).get(kind)
                payload = None if build is None else build(self.server, query)
                if payload is not None:
                    self.emit({"kind": kind, "payload": payload})

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

    def emit(self, data: dict) -> None:
        text = self.server.scrub(json.dumps(data, ensure_ascii=False))
        self.wfile.write(f"data: {text}\n\n".encode("utf-8"))
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

    def device_json(self, row, mine: bool = False) -> dict:
        """A device as the App lists it. Its comparison code shows only to itself and on this computer."""
        show = row["state"] == "pending" and (mine or self.loopback)
        return {"id": row["id"], "name": row["name"], "state": row["state"], "phone": bool(row["phone"]),
                "created": row["created"], "last_seen": row["last_seen"], "code": row["code"] if show else None,
                "this": mine}

    def lesson_json(self, row) -> dict:
        return {"id": row["id"], "kind": row["kind"], "text": row["text"], "state": row["state"],
                "project_id": row["project_id"], "source": json.loads(row["source"]),
                "payload": json.loads(row["payload"]), "uses": row["uses"], "first_try": row["first_try"],
                "question": lessons.question(row), "from": lessons.source_text(row),
                "created": row["created"]}

    def schedule_json(self, row) -> dict:
        return {"id": row["id"], "title": row["title"], "spec": row["spec"], "kind": row["kind"],
                "project_id": row["project_id"], "next_at": row["next_at"], "last_at": row["last_at"],
                "active": bool(row["active"])}

def start(home, port: int, lan: bool | str, tls: tuple[Path, Path] | None) -> AppServer:
    """Serve the App and its API from a daemon thread; on the network, print the phone's link. HTTPS when lan or
    tls is given. lan is True for this machine's own network, or the name a phone opens (a Tailscale or DNS name, a
    public address), which the certificate covers and the phone's link uses. Other devices reach the App only after
    its first-run setup is finished on this computer, so a new home never waits on a network without its settings."""
    if lan and not home.ledger.events(kind="setup.finished", limit=1):
        raise WorkflowError("Other devices can open the App (--lan) once its first-run setup is finished. Start "
                            "Artemis without --lan, open the link it prints on this computer (on a server, through "
                            "an SSH tunnel), finish the setup there, then start it again with --lan.")
    server = AppServer(("0.0.0.0" if lan else "127.0.0.1", port), home,
                       _tls(home, lan, tls) if (lan or tls) else None, address(lan) if isinstance(lan, str) else None)
    threading.Thread(target=server.serve_forever, name="artemis-app", daemon=True).start()
    banner = server.banner()
    if banner:
        print(banner, flush=True)
    return server
