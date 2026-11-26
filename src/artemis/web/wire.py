"""What the App's feature modules share with its server: the refusal, and how a module plugs in.

The App is the front-end in app/ (built from its source by tools/build_web). It talks to the home over one live
stream, GET /events, which sends frames {"kind": ..., "payload": ...}, and over plain JSON paths. A feature module
(boards, chat files, ...) plugs into both by defining, at module level:

    ROUTES = (("GET", r"/canvas/active", function), ...)
        function(handler, *groups) answers one request; handler is the request's web.Handler: handler.body(),
        handler.send_json(data, status), handler.send_raw(status, bytes), handler.query, handler.ledger,
        handler.server.home, handler.loopback, handler.device. Raise Refused for a refusal.
    FRAMES = {"canvas": function}
        function(server, query) -> payload, or None to send nothing: a frame sent when a stream opens. query is
        the stream's query string as a dict of single values.
    REFRESH = {"board.": ("canvas",)}
        after a ledger event whose kind starts with a key, its frames are built and sent again.

    EVENTS = {"said": function}
        function(server, row, query) -> [(kind, payload), ...]: frames for one ledger event of that exact kind.
    FEED = {"said.delta": function}
        function(server, data, query) -> [(kind, payload), ...]: frames for one item the home published
        (home.publish(kind, data)) that is not kept in the ledger, such as the lead's reply while it is written.

    body_limit(method, path) -> (bytes, refusal) or None
        a path that takes more than the 1 MiB a request body may be (uploads) says how much, and what a body
        over it is refused with.

A module that changes something no ledger event records sends a frame itself: server.frame(kind, payload).
"""


class Refused(Exception):
    """A request the App answers with an HTTP error status and one plain sentence."""

    def __init__(self, status: int, message: str, **extra):
        super().__init__(message)
        self.status, self.extra = status, extra


def refresh_kinds(modules, event_kind: str) -> set[str]:
    """The frames to send again after a ledger event of this kind."""
    return {frame for module in modules for prefix, frames in getattr(module, "REFRESH", {}).items()
            if event_kind.startswith(prefix) for frame in frames}


def module_frames(modules, table: str, kind: str, *args) -> list:
    """The frames every module's EVENTS or FEED handler for this kind gives."""
    return [frame for module in modules for frame in
            (getattr(module, table, {}).get(kind, lambda *_: [])(*args) or [])]
