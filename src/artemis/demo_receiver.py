"""The local demo receiver: a loopback endpoint that `artemis demo` sends to in place of a team webhook.

It records every request it gets in the ledger as a `demo.received` event with the body's SHA-256 and keeps nothing
else, so the digest can show that what arrived is the body the card you approved described. `artemis demo` uses it:

    with DemoReceiver(ledger, project) as receiver:
        ...   # a worker's http_request POSTs to receiver.url with a `send` secret, which holds it on a card;
              # once you approve, Artemis sends the recorded body and the receiver records its digest
"""

from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading

from .ledger import Ledger
from .roles import Role


NAME = "local demo receiver"
PATH = "/hook"
LIMIT = 1 << 20


class DemoReceiver:
    def __init__(self, ledger: Ledger, project: int | None = None):
        self.ledger, self.project = ledger, project
        self.server: ThreadingHTTPServer | None = None
        self.thread: threading.Thread | None = None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_address[1]}{PATH}"

    def __enter__(self) -> "DemoReceiver":
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _handler(self))
        self.thread = threading.Thread(target=self.server.serve_forever, name="artemis-demo-receiver", daemon=True)
        self.thread.start()
        self.ledger.record(Role.HOME, "demo.listening", f"The {NAME} listens at {self.url} (it stands in for a "
                           "team webhook and only records what it gets)", project=self.project,
                           data={"url": self.url})
        return self

    def __exit__(self, *exc) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(5)

    def received(self, method: str, path: str, body: bytes) -> None:
        url = f"http://127.0.0.1:{self.server.server_address[1]}{path}"
        digest = sha256(body).hexdigest()
        self.ledger.record(Role.HOME, "demo.received", f"The {NAME} got {len(body)} bytes ({method} {path}), "
                           f"sha256 {digest[:12]}", project=self.project,
                           data={"method": method, "url": url, "sha256": digest, "bytes": len(body)})


def _handler(receiver: DemoReceiver) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _receive(self) -> None:
            # The body is read before any answer: a socket closed with unread bytes is reset on Windows, and the
            # sender then sees the connection aborted in place of the status.
            length = int(self.headers.get("Content-Length") or 0)
            if not 0 <= length <= LIMIT:
                self.close_connection = True
                return self._answer(413)
            body = self.rfile.read(length)
            if self.path != PATH:
                return self._answer(404)
            receiver.received(self.command, self.path, body)
            self._answer(204)

        do_POST = do_PUT = do_PATCH = _receive

        def do_GET(self) -> None:
            self._answer(405)

        def _answer(self, status: int) -> None:
            self.send_response(status)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *args) -> None:
            pass

    return Handler


def listening(ledger: Ledger, url: str) -> bool:
    """Whether url is a local demo receiver's, so a card to it can say so."""
    return any(event["kind"] == "demo.listening" and _data(event).get("url") == url for event in ledger.events())


def request_of(card) -> dict | None:
    """The HTTP request a held card carries: the JSON {method, url, headers, body_sha256, ...} kept in its command."""
    try:
        request = json.loads(card["command"] or "")
    except ValueError:
        return None
    return request if isinstance(request, dict) and request.get("url") else None


def arrived(ledger: Ledger, card) -> str | None:
    """For an approved http card: the SHA-256 of the body a receiver got at its URL, or None when none arrived."""
    request = request_of(card)
    if not (request and request.get("body_sha256")) or card["decided"] is None:
        return None
    for event in ledger.events(project=card["project_id"]):
        data = _data(event)
        if event["kind"] == "demo.received" and data.get("url") == request["url"] and event["at"] >= card["decided"]:
            return data["sha256"]
    return None


def compare(ledger: Ledger, card) -> str | None:
    """For an approved http card: whether a receiver got exactly the body the card described, in words."""
    got = arrived(ledger, card)
    if got is None:
        return None
    wanted = request_of(card)["body_sha256"]
    if got == wanted:
        return f"the {NAME} got the body you approved (sha256 {got[:7]})"
    return f"the {NAME} got a different body: sha256 {got[:7]}, the card said {wanted[:7]}"


def _data(event) -> dict:
    return json.loads(event["data"]) if event["data"] else {}
