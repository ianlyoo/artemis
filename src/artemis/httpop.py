"""The http_request tool: Artemis makes a web request for an agent and adds a website key itself.

A key goes only to the origin it was stored for, over HTTPS (plain HTTP only to this computer). Redirects are
returned, not followed. The response is size-bounded and scrubbed before the agent sees it, and no agent process
receives the value. A `send` key on a method that changes something (anything but GET and HEAD) waits for the
person's yes on a "send as you" card unless a standing approval covers that exact request for the task's schedule;
a `spend` key waits for a "money out" card on every use. Approving the card runs dispatch(), which sends the
recorded request once. The card stores the body's digest; the body itself waits in a 0600 file under runs/.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import socket
import ssl
import time
from typing import TYPE_CHECKING
import urllib.error
import urllib.request
from urllib.parse import urlsplit, urlunsplit

from .roles import Interrupt, Role
from .vault import LOCKED, VaultError, VaultLocked, _loopback, origin

if TYPE_CHECKING:
    from .home import Grant, Home, Paths


TOOL = "http_request"
METHODS = ("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
SAFE = ("GET", "HEAD")
REFUSED = ("host", "content-length", "transfer-encoding", "connection")
TOKEN = re.compile(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+")
MAX_URL = 8000
MAX_SEND = 8 << 20      # request body
MAX_BODY = 256 << 10    # response body returned to the agent
MAX_SAVE = 64 << 20     # response body written to save_to
MAX_PURPOSE = 200       # a card's title, the words the person reads first
TIMEOUT = 30
HOLD = 24 * 3600        # a held request's card expires after a day
EXCERPT = 2000          # response text kept in a card's result


class HttpError(ValueError):
    """The request did not complete; a plain sentence for the agent (the broker returns ValueError as ToolError).
    `sent` says whether the request may have reached the server."""

    def __init__(self, text: str, sent: bool = True):
        super().__init__(text)
        self.sent = sent


@dataclass(frozen=True)
class Call:
    method: str
    url: str
    origin: str
    headers: dict[str, str]
    body: bytes | None
    secret: str | None
    save_to: Path | None
    purpose: str | None = None   # what the request is for, in the agent's words: the title of the card that asks


def request(home: Home, grant: Grant, args: dict) -> dict:
    """Carry out one http_request for the run `grant` belongs to: {state: done | held | denied | unknown, ...}.

    args: method, url, headers?, body?, secret? (a NAME), save_to? (a path in the project), purpose? (what it is for,
    the title of a card that asks). A locked vault raises
    VaultLocked when the request needs a key's value."""
    try:
        call = _call(home, grant, args)
    except VaultLocked:
        raise
    except VaultError as refused:
        return {"state": "denied", "reason": str(refused)}
    if call.secret:
        kind = home.vault.info(call.secret).kind
        if kind == "spend" or (kind == "send" and call.method not in SAFE and not _standing(home, grant, call)):
            return _hold(home, grant, call, Interrupt.SPEND if kind == "spend" else Interrupt.SEND)
    return _send(home, call, project=grant.project, task=grant.task, run=grant.run)


def is_http(card) -> bool:
    """Whether a card's recorded command is a web request (dispatch) rather than a command (the broker's run)."""
    try:
        command = json.loads(card["command"] or "null")
    except ValueError:
        return False
    return isinstance(command, dict) and "method" in command and "url" in command


def earlier(home: Home, grant: Grant, command: str, cwd: str | None = None, options: object = None) -> dict | None:
    """The answer to a request or command a card already put to the person for this task, instead of a second card:
    a restarted worker has a new run but the same task, and asking again could send or run it twice. None when a new
    card may open: it was never asked, or its card failed or expired. Work no task started reuses only a card still
    open on its own run."""
    row = home.ledger.asked(task=grant.task, run=grant.run, command=command, cwd=cwd, options=options)
    if row is None:
        return None
    card, state = row["id"], row["state"]
    if state in ("waiting", "approved", "running") and (row["expires"] is None or row["expires"] > time.time()):
        return {"state": "held", "card": card, "reason": f"{row['why']} Card {card} is still open; do not retry it, "
                                                         "report it."}
    if grant.task is None or state not in ("done", "declined", "unknown"):
        return None
    what, did, do = ("request", "sent", "send") if is_http(row) else ("command", "run", "run")
    if state == "declined":
        return {"state": "denied", "card": card,
                "reason": f"The person said no to this exact {what} on card {card}; do not ask again, report it."}
    if state == "done":
        return {"state": "done", "card": card, "result": row["result"],
                "reason": f"This exact {what} was already approved and {did} on card {card}; do not {do} it again."}
    return {"state": "unknown", "card": card, "result": row["result"],
            "reason": f"This exact {what} was {did} on card {card}, and whether it took effect is unknown. Do not "
                      f"{do} it again, which could do it twice; report it."}


def dispatch(home: Home, card: int) -> tuple[str, str]:
    """Send an approved card's recorded request once: (done | failed | unknown, result text for finish_card).
    The broker's run_card calls it for http cards after claim_card. A locked vault raises VaultLocked before
    anything is sent, so check home.vault.unlocked before claiming a card that names a secret."""
    row = home.ledger.card(card)
    command = json.loads(row["command"])
    names = json.loads(row["secrets"])
    secret = names[0] if names else None
    if secret and not home.vault.unlocked:
        raise VaultLocked(LOCKED[home.vault.mode])
    if row["state"] != "running":  # claim_card moved it there; a finished card is never sent again
        raise HttpError(f"Card {card} is {row['state']}, not claimed to run; nothing was sent.", sent=False)
    kept = body_file(home.paths, card)
    try:
        body = None
        if command["body_sha256"] is not None:
            try:
                body = kept.read_bytes()
            except FileNotFoundError:
                return "failed", "The request body kept for this card is gone; nothing was sent."
            if hashlib.sha256(body).hexdigest() != command["body_sha256"]:
                return "failed", "The kept request body no longer matches the card; nothing was sent."
        try:
            url = command["url"]
            call = Call(command["method"], url, origin(url), command["headers"], body, secret,
                        _still_new(command["save_to"]))
            if secret:
                _bound(home, secret, call.origin)
        except VaultError as refused:
            return "failed", f"{refused} Nothing was sent."
        try:
            result = _send(home, call, project=row["project_id"], task=row["task_id"], run=row["run_id"],
                           card=card)
        except HttpError as error:
            if not error.sent:
                return "failed", f"{error} Nothing was sent."
            return "unknown", f"{error} Check whether it took effect at {call.origin} before asking again."
    finally:
        kept.unlink(missing_ok=True)
    said = f"{result['status']} {result['reason']}".rstrip()
    if result.get("saved"):
        said += f"\nsaved {result['saved']} ({result['bytes']} bytes)"
    elif result.get("body"):
        said += "\n" + result["body"][:EXCERPT]
    return ("done" if result["status"] < 400 else "failed"), said


def body_file(paths: Paths, card: int) -> Path:
    """Where a held request's body waits for its card: only the home reads it."""
    return paths.runs / f"card-{card}.body"


# Checking a request

def _call(home: Home, grant: Grant, args: dict) -> Call:
    method = args.get("method")
    if not isinstance(method, str) or method.upper() not in METHODS:
        raise VaultError(f"method is one of: {', '.join(METHODS)}.")
    method = method.upper()
    url = args.get("url")
    if not isinstance(url, str) or len(url) > MAX_URL or any(ord(char) < 33 or char == "\x7f" for char in url):
        raise VaultError("url is one web address without spaces, like https://api.example.com/v1/items.")
    target = origin(url)  # HTTPS, or HTTP to this computer; no user:password@
    url = urlunsplit(urlsplit(url)._replace(fragment=""))
    secret = args.get("secret")
    field = None
    if secret is not None:
        field = _bound(home, secret, target)
    headers = args.get("headers") or {}
    if not isinstance(headers, dict):
        raise VaultError("headers is an object of header names and values.")
    for name, value in headers.items():
        if not isinstance(value, str) or not TOKEN.fullmatch(name) or any(char in value for char in "\r\n\0"):
            raise VaultError(f"The header {name!r} is not a valid header name and one-line value.")
        if name.lower() in REFUSED:
            raise VaultError(f"Artemis sets {name} itself.")
        if field and name.lower() == field.lower():
            raise VaultError(f"Artemis adds {field} from {secret}; leave it out of headers.")
    body = args.get("body")
    if body is not None:
        if not isinstance(body, str):
            raise VaultError("body is text.")
        if method in SAFE:
            raise VaultError(f"A {method} request has no body.")
        body = body.encode("utf-8")
        if len(body) > MAX_SEND:
            raise VaultError(f"A request body is at most {MAX_SEND >> 20} MiB.")
    save_to = args.get("save_to")
    purpose = args.get("purpose")
    if purpose is not None and not (isinstance(purpose, str) and purpose.strip() and "\n" not in purpose
                                    and len(purpose) <= MAX_PURPOSE):
        raise VaultError(f"purpose is one line of at most {MAX_PURPOSE} characters: what the request does, "
                         "like Post the weekly summary to the team channel.")
    return Call(method, url, target, dict(headers), body, secret,
                None if save_to is None else _save_path(home, grant, save_to),
                None if purpose is None else " ".join(purpose.split()))


def _bound(home: Home, secret: object, target: str) -> str:
    """The header field a website key goes in, once it is known to belong to `target`."""
    info = home.vault.info(secret) if isinstance(secret, str) else None
    if info is None:
        raise VaultError(f"There is no secret named {secret}. Ask the person for it with secret_request.")
    if info.use != "http":
        raise VaultError(f"{secret} is for commands: run gives it to a command by name.")
    if info.origin != target:
        raise VaultError(f"{secret} is sent only to {info.origin}, not to {target}.")
    return info.header.split(":", 1)[0]


def _save_path(home: Home, grant: Grant, raw: object) -> Path:
    """A new file in the project, as the file tools allow: relative, inside the root, not in ARTEMIS_HOME, not .env."""
    if not isinstance(raw, str) or not raw or "\0" in raw or PurePosixPath(raw).is_absolute() \
            or PureWindowsPath(raw).anchor:
        raise VaultError("save_to is a path relative to the project, like downloads/report.pdf.")
    base = Path(grant.root).resolve()
    target = (base / raw).resolve()
    if not target.is_relative_to(base) or target == base:
        raise VaultError(f"{raw} is outside the project.")
    home_root = Path(home.paths.root).resolve()
    if target.is_relative_to(home_root) and not base.is_relative_to(home_root):
        raise VaultError(f"{raw} is inside Artemis's own folder, which agents do not touch.")
    if target.name.lower().startswith(".env"):
        raise VaultError("Artemis does not write .env files.")
    if not target.parent.is_dir():
        raise VaultError(f"{PurePosixPath(raw).parent} is not a folder in the project.")
    return _still_new(str(target))


def _still_new(saved: str | None) -> Path | None:
    """A recorded save_to path that is still free and still reached without a link."""
    if saved is None:
        return None
    path = Path(saved)
    if path.parent.resolve() / path.name != path:
        raise VaultError(f"{path.name}'s folder moved since the request was made.")
    if path.exists() or path.is_symlink():
        raise VaultError(f"{path.name} already exists; save_to only makes new files.")
    return path


def _standing(home: Home, grant: Grant, call: Call) -> bool:
    """A standing approval is bound to one schedule: requests from a task no schedule made always ask."""
    schedule = home.ledger.work(grant.task)[0]["schedule_id"] if grant.task is not None else None
    return schedule is not None and home.ledger.standing(
        kind=Interrupt.SEND, schedule=schedule, url=call.url, method=call.method, secret=call.secret) is not None


def _hold(home: Home, grant: Grant, call: Call, kind: str) -> dict:
    """Open the card that asks the person, keeping the body where only the home reads it, unless this task already
    asked for this exact request."""
    digest = None if call.body is None else hashlib.sha256(call.body).hexdigest()
    command = json.dumps({"method": call.method, "url": call.url, "headers": call.headers, "body_sha256": digest,
                          "save_to": None if call.save_to is None else str(call.save_to)})
    answer = earlier(home, grant, command)
    if answer is not None:
        return answer
    why = (f"{call.secret} spends money: every use waits for your yes." if kind == Interrupt.SPEND else
           f"{call.secret} sends as you, and a {call.method} request changes something at {call.origin}.")
    what = call.purpose or f"{call.method} {urlsplit(call.origin).netloc}"    # the exact request is in its details
    pending = None
    if call.body is not None:
        home.paths.runs.mkdir(parents=True, exist_ok=True)
        pending = home.paths.runs / f"card-pending-{os.urandom(8).hex()}.body"
        _write_private(pending, call.body)
    try:
        card = home.ledger.open_card(Role.HOME, kind, what, why, project=grant.project, task=grant.task,
                                     run=grant.run, command=command, secrets=(call.secret,),
                                     expires=time.time() + HOLD)
    except BaseException:
        if pending:
            pending.unlink(missing_ok=True)
        raise
    if pending:
        os.replace(pending, body_file(home.paths, card))
    return {"state": "held", "card": card, "reason": f"Waiting for the person's yes on card {card}: {what}."}


# Sending

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect is returned to the agent as the response; following it could carry the key elsewhere."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _send(home: Home, call: Call, *, project: int | None, task: int | None, run: int | None,
          card: int | None = None) -> dict:
    request = urllib.request.Request(call.url, data=call.body, method=call.method)
    for name, value in call.headers.items():
        request.add_header(name, value)
    if call.secret:
        field, value = home.vault.http(call.secret, call.origin)
        request.add_header(field, value)
        home.ledger.secret_used(call.secret, TOOL, task=task, run=run, card=card)
    handlers = [_NoRedirect()]
    if _loopback(urlsplit(call.url).hostname or ""):
        handlers.append(urllib.request.ProxyHandler({}))  # a request to this computer never goes through a proxy
    limit = MAX_SAVE if call.save_to else MAX_BODY
    scrubber = home.vault.scrubber
    try:
        try:
            with urllib.request.build_opener(*handlers).open(request, timeout=TIMEOUT) as response:
                status, reason, got = response.status, response.reason, response.headers
                data = response.read(limit + 1)
        except urllib.error.HTTPError as error:  # 3xx (not followed), 4xx, 5xx: still the server's answer
            with error:
                status, reason, got = error.code, error.reason, error.headers
                data = error.read(limit + 1) if error.fp else b""
    except (urllib.error.URLError, http.client.HTTPException, OSError, ValueError) as error:
        sent = not _before_sending(error)
        _recorded(home, call, f"did not complete ({_why(error)})", project, task, card, run, None, 0)
        raise HttpError(scrubber.scrub(f"{call.method} {call.url} did not complete: {_why(error)}."), sent) from None
    truncated = len(data) > limit
    data = scrubber.scrub_bytes(data[:limit])
    _recorded(home, call, str(status), project, task, card, run, status, len(data))
    answer = {"state": "done", "status": status, "reason": scrubber.scrub(str(reason or "")),
              "headers": _headers(scrubber, got)}
    if call.save_to is None:
        return answer | {"body": data.decode("utf-8", "replace"), "truncated": truncated}
    if truncated:
        return answer | {"truncated": True, "saved": None,
                         "note": f"The response is over {MAX_SAVE >> 20} MiB; nothing was saved."}
    with call.save_to.open("xb") as file:
        file.write(data)
    return answer | {"saved": str(call.save_to), "bytes": len(data), "truncated": False}


def _recorded(home: Home, call: Call, outcome: str, project, task, card, run, status, size) -> None:
    home.ledger.record(Role.HOME, "http.request", home.vault.scrubber.scrub(f"{call.method} {call.url} → {outcome}"),
                       project=project, task=task, card=card,
                       data={"run": run, "secret": call.secret, "status": status, "bytes": size})


def _headers(scrubber, got) -> dict[str, str]:
    joined: dict[str, str] = {}
    for name, value in (got.items() if got is not None else ()):
        joined[name] = f"{joined[name]}, {value}" if name in joined else value
    return {name: scrubber.scrub(value) for name, value in joined.items()}


def _before_sending(error: BaseException) -> bool:
    """Whether the request surely never reached the server: no address, refused, or a certificate not trusted."""
    reason = getattr(error, "reason", None)
    return isinstance(reason, (socket.gaierror, ConnectionRefusedError, ssl.SSLCertVerificationError)) or \
        isinstance(error, ValueError)  # http.client refused a header or URL before connecting


def _why(error: BaseException) -> str:
    """A short reason that never quotes a header: http.client's own errors can contain the header they reject."""
    reason = getattr(error, "reason", error)
    if isinstance(reason, ssl.SSLCertVerificationError):
        return f"the server's certificate is not trusted ({reason.verify_message})"
    if isinstance(reason, TimeoutError):
        return f"no answer within {TIMEOUT} seconds"
    if isinstance(reason, OSError):
        return reason.strerror or type(reason).__name__
    if isinstance(reason, str):
        return reason
    return type(reason).__name__


def _write_private(path: Path, data: bytes) -> None:
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600),
                   "wb") as file:
        file.write(data)
