"""The App's board endpoints and `canvas` live frame (wire.py says how feature modules plug in)."""

from urllib.parse import unquote

from .. import boards
from .wire import Refused


IMMUTABLE_CACHE = "private, max-age=31536000, immutable"


def active(handler) -> None:
    handler.send_json(boards.active_state(handler.ledger, listing=False))


def board(handler, raw_id: str) -> None:
    found = boards.get(handler.ledger, unquote(raw_id))
    if found is None:
        raise Refused(404, "That board does not exist.")
    handler.send_json(found)


def asset(handler, raw_name: str) -> None:
    from . import HEADERS

    try:
        body, content_type = boards.read_asset(handler.server.home.paths.root, unquote(raw_name))
    except PermissionError as exc:
        raise Refused(403, str(exc)) from None
    except FileNotFoundError as exc:
        raise Refused(404, str(exc)) from None
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


def answer(handler) -> None:
    data = handler.body()
    try:
        result = boards.answer(handler.ledger, data.get("board"), data.get("slot"), data.get("text"))
    except LookupError as exc:
        raise Refused(404, str(exc)) from None
    handler.send_json(result)


def catalog(handler) -> None:
    handler.send_json(boards.catalog(handler.ledger))


def canvas_frame(server, query: dict) -> dict:
    return boards.active_state(server.home.ledger, listing=query.get("canvas") == "listing")


ROUTES = (
    ("GET", r"/canvas/active", active),
    ("GET", r"/canvas/boards/([^/]+)", board),
    ("GET", r"/canvas/assets/(.+)", asset),
    ("POST", r"/canvas/answer", answer),
    ("GET", r"/ide/catalog", catalog),
)
FRAMES = {"canvas": canvas_frame}
REFRESH = {"board.": ("canvas",)}
