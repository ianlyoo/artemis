"""A stand-in for the outside world in end-to-end tests (a mock): a loopback HTTP server that records what it gets.

It answers an OpenAI-style chat completion with a fixed reply, and any other request with 200. What it records stays
in this process for the test to compare; it never prints a header or a body.
"""

from dataclasses import dataclass
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading

REPLY = "stand-in reply (mock)"


@dataclass(frozen=True)
class Received:
    method: str
    path: str
    headers: dict
    body_sha256: str

    def carries(self, value: str) -> bool:
        """Whether any header holds value; the test asks this rather than reading the header."""
        return any(value in header for header in self.headers.values())


class StandIn:
    def __init__(self):
        self.received: list[Received] = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _handler(self))
        self.thread = threading.Thread(target=self.server.serve_forever, name="stand-in", daemon=True)

    @property
    def origin(self) -> str:
        return f"http://127.0.0.1:{self.server.server_address[1]}"

    def __enter__(self) -> "StandIn":
        self.thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self.server.shutdown()
        self.server.server_close()


def _handler(stand_in: StandIn) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            stand_in.received.append(Received(self.command, self.path, dict(self.headers), sha256(body).hexdigest()))
            answer = {"ok": True}
            if self.path.endswith("/chat/completions"):
                answer = {"id": "mock", "object": "chat.completion", "model": "stand-in",
                          "choices": [{"index": 0, "finish_reason": "stop",
                                       "message": {"role": "assistant", "content": REPLY}}]}
            data = json.dumps(answer).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        do_PUT = do_PATCH = do_POST

        def log_message(self, *args) -> None:
            pass

    return Handler
