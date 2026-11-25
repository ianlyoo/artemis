"""The home: one always-on process per ARTEMIS_HOME that holds the ledger, runs the agents and serves the App.

open() takes the home's lock first, so a second home for the same ARTEMIS_HOME fails and says where the first
one listens; then it binds the port, unlocks the vault and writes the learned rules. It ends runs a previous home
left open (stuck: home restarted) and runs four loops: the dispatcher (queued tasks become supervisor threads), the
scheduler, the card dispatcher (the broker carries out an approved card exactly once) and the event follower
(lessons see every event; the lead is woken by stuck tasks and cards). `serve` is open() plus a wait for Ctrl-C.
CLI verbs write the same ledger directly; the loops pick up what they write.
"""

from collections import defaultdict
from dataclasses import dataclass
import hashlib
import hmac
import importlib
import json
import os
from pathlib import Path
import queue
import secrets
import signal
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import webbrowser

from . import process, schedule, supervise
from .config import HomeConfig
from .ledger import Ledger
from .roles import Role, WorkflowError


PAIR_S = 600            # a pairing link works once, within ten minutes
PAIR_TRIES = 5          # wrong pairing tokens that void every open link
SUBSCRIBER_QUEUE = 256  # items an App connection may fall behind by before it is dropped
READY = "Home ready"    # the line `serve` prints once its loops run; `serve --background` waits for it
STOP = "home.stop"      # the person's request, in the ledger, that the running home close (`serve --stop`)
ANSWERED = {"card.approved", "card.declined", "card.answered", "secret.set"}   # the person answered a card
ENDINGS = {"finished", "stuck", "stopped", "dropped"}                          # a task stopped moving


@dataclass(frozen=True)
class Paths:
    """Every file and folder of one home: ARTEMIS_HOME, else ~/.artemis (%USERPROFILE%\\.artemis on Windows)."""
    root: Path
    ledger: Path
    vault: Path
    config: Path
    rules: Path
    token: Path
    tls: Path
    logs: Path
    undo: Path
    work: Path
    runs: Path
    lead: Path
    lock: Path
    address: Path

    @classmethod
    def at(cls, root: Path) -> "Paths":
        root = root.expanduser().resolve()  # real path: a worker's cwd and the paths given to it must agree
        return cls(root, root / "ledger.db", root / "vault.db", root / "config.toml",
                   root / "rules.toml", root / "home.token", root / "tls", root / "logs", root / "undo",
                   root / "work", root / "runs", root / "lead", root / "home.lock", root / "home.port")

    @classmethod
    def from_env(cls) -> "Paths":
        return cls.at(Path(os.environ.get("ARTEMIS_HOME") or Path.home() / ".artemis"))

    def log(self, task: int) -> Path:
        return self.logs / f"task-{task}.log"

    def worktree(self, project: str, task: int) -> Path:
        return self.work / project / f"task-{task}"


@dataclass(frozen=True)
class Grant:
    """What one run's broker token allows."""
    run: int
    task: int | None
    project: int
    role: str           # "worker" | "lead"
    root: Path          # the project folder (folder) or the task worktree (repo)
    kind: str           # "repo" | "folder"


def write_private(path: Path, text: str) -> None:
    """Create path afresh, readable by this user only (0600; on Windows the user profile's permissions)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as stream:
        stream.write(text)


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def part(module: str, name: str):
    """A piece of Artemis that this build may not include, or None. A real import error still raises."""
    try:
        found = importlib.import_module(f"{__package__}.{module}")
    except ModuleNotFoundError as error:
        if error.name != f"{__package__}.{module}":
            raise
        return None
    return getattr(found, name, None)


@dataclass
class Parts:
    """The pieces of Artemis the home uses through their interfaces. None: missing, and the home runs without."""
    vault: object = None          # Vault(paths, unlock); its .scrubber scrubs every output
    broker: object = None         # Broker(home): carries out approved cards, commands and web requests
    lead: object = None           # LeadRunner(home)
    web_start: object = None      # start(home, port, lan, tls) -> server
    place: object = None          # place(kind, config, busy, *, vault, ledger, project) -> provider, "" to wait
    launch: object = None         # launch(provider, *, role, mode, cwd, prompt, mcp, config, vault, scratch)
    observe: object = None        # lessons.observe(home, event)
    prompt_lines: object = None   # lessons.prompt_lines(ledger, project) -> [str]
    sync_rules: object = None     # lessons.sync_rules(ledger, rules path): learned rules into rules.toml
    review: object = None         # review(home, task, sha, doer) -> (verdict, gaps)
    qualify: object = None        # at_start(ledger, config, vault, say): re-probe the CLIs that changed version

    @classmethod
    def of_this_build(cls) -> "Parts":
        return cls(vault=part("vault", "Vault"), broker=part("broker", "Broker"), lead=part("lead", "LeadRunner"),
                   web_start=part("web", "start"), place=part("agents", "place"), launch=part("agents", "launch"),
                   observe=part("lessons", "observe"), prompt_lines=part("lessons", "prompt_lines"),
                   sync_rules=part("lessons", "sync_rules"), review=part("review", "review"),
                   qualify=part("qualify", "at_start"))

    def missing(self) -> list[str]:
        return [name for name, value in self.__dict__.items() if value is None]


class _Plain:
    """The scrubber stream when there is no vault: no secret values are known, so text passes as it is."""

    def feed(self, text: str) -> str:
        return text

    def flush(self) -> str:
        return ""


class Home:
    """Everything one ARTEMIS_HOME holds while its process runs."""

    DISPATCH_S = 0.5
    TICK_S = 30.0
    FOLLOW_S = 0.5

    def __init__(self, paths: Paths, port: int | None = None, parts: Parts | None = None):
        self.paths = paths
        paths.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        for folder in (paths.logs, paths.runs, paths.work):
            folder.mkdir(exist_ok=True)
        self.parts = Parts.of_this_build() if parts is None else parts
        self.config = HomeConfig.load(paths)
        self.port = self.config.serve.port if port is None else port
        self.ledger = Ledger(paths.ledger)
        self.ledger.initialize()
        self.closing = threading.Event()
        self.stop_asked = threading.Event()                  # serve() closes the home once this is set
        self.supervisors: dict[int, threading.Thread] = {}   # task -> its supervisor thread
        self.retries: set[int] = set()                       # stuck tasks someone asked to run again
        self._lock = threading.Lock()
        self._grants: dict[int, tuple[str, Grant]] = {}
        self._lanes: defaultdict[int, threading.Lock] = defaultdict(threading.Lock)
        self._subscribers: list[queue.Queue] = []
        self._pairs: dict[str, float] = {}
        self._pair_misses = 0
        self._carrying: set[int] = set()
        self._cursor = 0
        self._told: set[str] = set()
        self._settled: set[int] = set()
        self._threads: list[threading.Thread] = []            # what _spawn started; close() waits for each
        self.server = None                                   # what open() bound: the App, or a bare socket
        self._held: sqlite3.Connection | None = None         # the home's lock, when open() took it
        self.vault = self.parts.vault(paths, self.config.vault.unlock) if self.parts.vault else None
        self.broker = self.parts.broker(self) if self.parts.broker else None
        self.lead = self.parts.lead(self) if self.parts.lead else None

    @staticmethod
    def log(text: str) -> None:
        print(f"{time.strftime('%H:%M:%S')} {text}", flush=True)

    def log_once(self, text: str) -> None:
        """Log a condition the first time only; loops meet the same one twice a second."""
        if text not in self._told:
            self._told.add(text)
            self.log(text)

    # Broker tokens: one per run, in a 0600 file the run's MCP shim reads

    def grant(self, run: int, task: int | None, project: int, role: str, root: Path, kind: str) -> Path:
        token = secrets.token_urlsafe(32)
        path = self.paths.runs / f"{run}.token"
        write_private(path, token)
        with self._lock:
            self._grants[run] = (token, Grant(run, task, project, role, Path(root), kind))
        return path

    def revoke(self, run: int) -> None:
        with self._lock:
            self._grants.pop(run, None)
        (self.paths.runs / f"{run}.token").unlink(missing_ok=True)

    def grant_for(self, token: str) -> Grant | None:
        with self._lock:
            grants = list(self._grants.values())
        found = None
        for known, grant in grants:   # compare every one, so the time taken says nothing about the token
            if hmac.compare_digest(known.encode(), token.encode()):
                found = grant
        return found

    def mcp_command(self, token_file: Path) -> list[str]:
        return [sys.executable, "-m", "artemis.mcp", "--run", str(token_file), "--port", str(self.port)]

    # The App: pairing links and live items that are not ledger events

    def new_pair_token(self) -> str:
        """A link token that pairs one browser, once, within PAIR_S; kept here only as its hash."""
        token = secrets.token_urlsafe(24)
        now = time.time()
        with self._lock:
            self._pairs = {key: expiry for key, expiry in self._pairs.items() if expiry > now}
            self._pairs[_digest(token)] = now + PAIR_S
        return token

    def redeem_pair(self, token: str) -> bool:
        """Use up a pairing token. Every PAIR_TRIES wrong ones void all open links, so guessing gains nothing;
        a link made after that works."""
        with self._lock:
            if self._pairs.pop(_digest(token), 0.0) > time.time():
                return True
            self._pair_misses += 1
            if self._pair_misses >= PAIR_TRIES:
                self._pairs.clear()
                self._pair_misses = 0
            return False

    def publish(self, kind: str, data: dict) -> None:
        """Send {"kind", "at", "data"} to every App connection. One that has fallen behind is dropped:
        its queue is emptied and gets None, which tells its reader to close the stream."""
        item = {"kind": kind, "at": time.time(), "data": data}
        with self._lock:
            for subscriber in list(self._subscribers):
                try:
                    subscriber.put_nowait(item)
                except queue.Full:
                    self._subscribers.remove(subscriber)
                    while not subscriber.empty():
                        subscriber.get_nowait()
                    subscriber.put_nowait(None)

    def subscribe(self) -> queue.Queue:
        subscriber: queue.Queue = queue.Queue(maxsize=SUBSCRIBER_QUEUE)
        with self._lock:
            self._subscribers.append(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: queue.Queue) -> None:
        """An App connection closed: stop feeding its queue."""
        with self._lock:
            if subscriber in self._subscribers:
                self._subscribers.remove(subscriber)

    # What supervisors use

    def lane(self, project: int) -> threading.Lock:
        """The ship lane of one project: one landing at a time."""
        with self._lock:
            return self._lanes[project]

    def place(self, kind: str, busy: dict[str, int], project: int) -> str:
        """The provider for a task of this kind in this project, given how many runs each provider has now; ""
        when none can take it now, so the task waits."""
        if self.parts.place is None:
            raise WorkflowError("this build has no placement, so no worker can be chosen")
        return self.parts.place(kind, self.config, busy, vault=self.vault, ledger=self.ledger, project=project)

    def scrub(self, text: str) -> str:
        return text if self.vault is None else self.vault.scrubber.scrub(text)

    def scrub_stream(self):
        return _Plain() if self.vault is None else self.vault.scrubber.stream()

    # The loops

    def start(self) -> None:
        """End what a previous home left open, then start the loops. Returns at once."""
        events = self.ledger.events()
        for event in events:
            self._watch(event)
        self._cursor = events[-1]["id"] if events else 0
        if self.parts.sync_rules is not None:
            self.parts.sync_rules(self.ledger, self.paths.rules)
        self.reap()
        left = self.ledger.end_orphans("home restarted")
        if left:
            self.log(f"{left} run(s) left open by the previous home are stuck: home restarted")
        if self.broker is not None:
            self.broker.recover()
        self.ledger.record(Role.HOME, "home.started", "with a lead" if self.lead else "without a lead: stuck work "
                           "is yours to retry", data={"lead": self.lead is not None})
        if self.parts.qualify is not None:      # a CLI that changed version is probed again, once, off the start
            self._spawn("qualify", self.parts.qualify, self.ledger, self.config, self.vault, self.log)
        self._every("dispatcher", self.DISPATCH_S, lambda: supervise.dispatch(self))
        self._every("scheduler", self.TICK_S, lambda: schedule.tick(self.ledger))
        self._every("cards", self.DISPATCH_S, self.run_cards)
        self._every("events", self.FOLLOW_S, self.follow)

    def reap(self) -> None:
        """End the workers a previous home left running, each only while its process id still names the process
        that started for its run (same id, same start time), so a process that got the id later is left alone."""
        for row in self.ledger.work():
            if row["state"] != "running":
                continue
            seen = [json.loads(event["data"]) for event in self.ledger.events(task=row["id"])
                    if event["kind"] == "worker.process" and event["data"]]
            mine = [data for data in seen if data.get("run") == row["run_id"] and data.get("start")]
            if not mine:
                continue
            pid, start = mine[-1]["pid"], mine[-1]["start"]
            if process.end_if_same(pid, start):
                self.log(f"task #{row['id']}: ended its worker (process {pid}), which the previous home left running")
            elif process.started(pid) is not None:
                self.log(f"task #{row['id']}: process {pid} is another program now; left alone")

    def _every(self, name: str, seconds: float, step) -> None:
        def loop():
            last = ""
            while not self.closing.is_set():
                try:
                    step()
                    last = ""
                except Exception as error:  # a loop outlives one bad step; the same error is told once
                    text = f"{name}: {type(error).__name__}: {error}"
                    if text != last:
                        self.log(text)
                    last = text
                self.closing.wait(seconds)

        self._spawn(name, loop)

    def _spawn(self, name: str, work, *args) -> None:
        """Run work on a thread of the home's, which close() waits for. An error ends it with one log line."""
        def run():
            try:
                work(*args)
            except Exception as error:
                self.log(f"{name}: {type(error).__name__}: {error}")

        thread = threading.Thread(target=run, name=f"artemis-{name}", daemon=True)
        with self._lock:
            self._threads = [*(alive for alive in self._threads if alive.is_alive()), thread]
        thread.start()

    def run_cards(self) -> None:
        """Expire cards nobody answered in time, then hand each approved card that has something to carry out (a
        command, or a web request Artemis sends itself) to the broker, which claims it (exactly one claim wins) and
        carries it out once. A card that uses a stored key stays approved while the vault is locked."""
        self.ledger.expire_cards()
        if self.ledger.stopped() or self.closing.is_set():
            return
        for card in self.ledger.cards(state="approved"):
            if card["command"] is None or card["id"] in self._carrying:
                continue
            if self.broker is None:
                self.log_once(f"card {card['id']}: waits, because this build has no broker to carry it out")
                continue
            self._carrying.add(card["id"])
            self._spawn(f"card-{card['id']}", self._carry, card["id"])

    def _carry(self, card: int) -> None:
        try:
            self.broker.run_card(card)
        finally:
            self._carrying.discard(card)

    def follow(self) -> None:
        """Give each new ledger event to the lessons, note retry requests and a stop asked from the terminal, and
        wake the lead for exactly three things: a request settles, a task gets stuck, a card is answered. Work a schedule made never wakes it by
        settling. The lead keeps its wakes within [lead] wake_per_hour."""
        events = self.ledger.events(after=self._cursor)
        reasons, touched = [], set()
        for event in events:
            self._cursor = event["id"]
            self._watch(event)
            if self.parts.observe is not None:
                try:
                    self.parts.observe(self, event)
                except Exception as error:
                    self.log(f"lessons, event {event['id']}: {type(error).__name__}: {error}")
            kind = event["kind"]
            if kind == STOP and event["role"] == Role.OWNER:    # only one made after this home started counts
                self.stop_asked.set()
            if kind == "stuck" and event["task_id"]:
                reasons.append(f"task #{event['task_id']} is stuck: {event['detail'][:200]}")
            elif kind in ANSWERED:
                reasons.append(f"card {event['card_id']} was answered ({kind}): {event['detail'][:200]}")
            if kind == "started":
                self._settled.discard(event["request_id"])
            elif kind in ENDINGS and event["request_id"]:
                touched.add(event["request_id"])
        reasons += [f"request {request} settled" for request in sorted(touched) if self._settles(request)]
        if reasons and self.lead is not None and not self.ledger.stopped() and not self.closing.is_set():
            self._spawn("wake", self.lead.wake, "; ".join(reasons)[:2000])

    def _settles(self, request: int) -> bool:
        """True the first time every task of a person's or the lead's request has come to rest: shipped,
        verified, dropped, or stuck other than waiting for a card."""
        rows = [row for row in self.ledger.work() if row["request_id"] == request]
        if not rows or any(row["schedule_id"] for row in rows) or request in self._settled:
            return False
        if all(row["state"] in ("shipped", "verified", "dropped")
               or (row["state"] == "stuck" and not supervise.WAITING.fullmatch(row["note"] or "")) for row in rows):
            self._settled.add(request)
            return True
        return False

    def _watch(self, event) -> None:
        """A retrying event by anyone but a worker asks the home to run a stuck task again."""
        if event["kind"] == "retrying" and event["task_id"] and event["role"] != Role.WORKER:
            self.retries.add(event["task_id"])
        elif event["kind"] == "started":
            self.retries.discard(event["task_id"])

    def close(self, wait_s: float = 20) -> None:
        """Stop the loops and wait, up to wait_s, for every thread the home started: supervisors end their workers'
        trees and record the run as stuck, and a lead turn or a card still running ends before its files go."""
        self.closing.set()
        deadline = time.monotonic() + wait_s
        while time.monotonic() < deadline:      # a loop's last step may start a thread, so look again until none
            with self._lock:
                running = [thread for thread in [*self._threads, *self.supervisors.values()] if thread.is_alive()]
            if not running:
                break
            running[0].join(max(0.0, deadline - time.monotonic()))
        with self._lock:
            runs = list(self._grants)
        for run in runs:
            self.revoke(run)
        if isinstance(self.server, socket.socket):
            self.server.close()
        elif self.server is not None:
            self.server.shutdown()
            self.server.server_close()
        if self._held is not None:
            self.paths.address.unlink(missing_ok=True)
            self._held.close()
            self._held = None


def hold(paths: Paths, wait_s: float = 2.0) -> sqlite3.Connection | None:
    """Take the home's lock, or None when another process holds it. The lock is an exclusive SQLite lock on
    home.lock, so the operating system releases it when the holder ends, however it ends."""
    paths.root.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(paths.lock, timeout=wait_s, isolation_level=None, check_same_thread=False)
    try:
        db.execute("BEGIN EXCLUSIVE")
    except sqlite3.OperationalError:
        db.close()
        return None
    return db


def running(paths: Paths) -> int | None:
    """The port of the home that runs for these paths (0 if it has not said yet), or None when none runs."""
    if not paths.lock.exists():
        return None
    probe = hold(paths, 0)
    if probe is not None:
        probe.close()
        return None
    try:
        return int(paths.address.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return 0


def listening(port: int) -> bool:
    """Whether something accepts connections on this computer's port (a running home, usually)."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def open(paths: Paths, port: int | None = None, lan: bool = False, tls: tuple[Path, Path] | None = None,
         parts: Parts | None = None) -> Home:
    """Open the home for these paths and start it, without signals: take its lock, bind its port (the App's server
    when this build has it), write its address and token, unlock the vault, write the learned rules and start the
    loops. Returns the running Home at once; Home.close() undoes all of it."""
    held = hold(paths)
    if held is None:
        where = running(paths)
        raise WorkflowError(f"A home is already running for {paths.root}"
                            + (f" at http://127.0.0.1:{where}" if where else "") + ". Stop it first, or set "
                            "ARTEMIS_HOME to start another home.")
    try:
        home = Home(paths, port, parts)
        web_start = home.parts.web_start
        try:
            # Without the App, a bare socket holds the port, so the address the home gives is really its own.
            home.server = (web_start(home, home.port, lan, tls) if web_start
                           else socket.create_server(("127.0.0.1", home.port)))
        except OSError:
            raise WorkflowError(f"Port {home.port} is taken by another program; choose another with --port or "
                                f"[serve] port in {paths.config}.") from None
    except BaseException:
        held.close()
        raise
    home._held = held
    try:
        server = home.server
        home.port = server.getsockname()[1] if isinstance(server, socket.socket) else server.server_address[1]
        paths.address.write_text(str(home.port), encoding="utf-8")
        write_private(paths.token, secrets.token_urlsafe(32))
        _open_vault(home)
        home.start()
    except BaseException:
        home.close(0)
        raise
    return home


def serve(paths: Paths, port: int | None, lan: bool, open_browser: bool, tls: tuple[Path, Path] | None) -> int:
    """Run the home until Ctrl-C or a termination signal. Returns the exit status."""
    try:
        home = open(paths, port, lan, tls)
    except WorkflowError as error:
        print(f"artemis: {error}", file=sys.stderr)
        return 1
    missing = home.parts.missing()
    if missing:
        home.log(f"not in this build, running without: {', '.join(missing)}")
    if home.parts.web_start:   # before the ready line, so `serve --background` shows it too
        url = f"{'https' if lan or tls else 'http'}://127.0.0.1:{home.port}/#pair={home.new_pair_token()}"
        print(f"App: {url}\n(The link pairs one browser and works once, for ten minutes.)", flush=True)
        if open_browser:
            webbrowser.open(url)
    home.log(f"{READY} · {paths.root} · port {home.port}")
    done = home.stop_asked
    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), lambda *_: done.set())
    try:
        while not done.wait(1.0):
            pass
    finally:
        home.log("stopping: ending running workers")
        home.close()
    return 0


def stop(paths: Paths, wait_s: float = 60) -> int:
    """Ask the home that runs for these paths to close, through its ledger, and wait until its lock is free: the
    same stop on every OS, for a home in a terminal or in the background."""
    if running(paths) is None:
        print(f"No home is running for {paths.root}.")
        return 0
    ledger = Ledger(paths.ledger)
    ledger.initialize()
    ledger.record(Role.OWNER, STOP, "asked to stop from the terminal (artemis serve --stop)")
    deadline = time.monotonic() + wait_s
    while running(paths) is not None:
        if time.monotonic() > deadline:
            print(f"artemis: the home for {paths.root} has not stopped within {wait_s:.0f} s; it may still be "
                  f"ending a worker. Its log is {paths.logs / 'home.log'}.", file=sys.stderr)
            return 1
        time.sleep(0.2)
    print(f"The home for {paths.root} has stopped.")
    return 0


def _open_vault(home: Home) -> None:
    """Unlock the vault before work starts: by the keychain or the environment as [vault] unlock says, else at the
    terminal. Without a terminal it stays locked and the home says how to open it; cards that send a stored key
    wait until then."""
    if home.vault is None:
        return
    from .vault import VaultError, unlock_at_terminal   # present whenever the vault part is
    if not home.vault.unlocked:
        try:
            unlock_at_terminal(home.vault)
        except VaultError as error:
            home.log(str(error))
    if home.vault.notice:
        home.log(home.vault.notice)


def background(paths: Paths, argv: list[str], wait_s: float = 30) -> int:
    """Start `artemis serve <argv>` detached from this terminal and wait until it is ready or has failed. A home
    that is not ready within wait_s is stopped, so a failed start leaves nothing behind that holds the home."""
    paths.logs.mkdir(parents=True, exist_ok=True)
    log = paths.logs / "home.log"
    if not log.exists():
        write_private(log, "")
    offset = log.stat().st_size
    with log.open("ab") as stream:
        child = subprocess.Popen([sys.executable, "-m", "artemis.cli", "serve", "--no-open", *argv],
                                 stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT,
                                 cwd=paths.root, env=os.environ | {"ARTEMIS_HOME": str(paths.root)},
                                 **process.detached())
    deadline = time.monotonic() + wait_s
    while True:
        with log.open(encoding="utf-8", errors="replace") as stream:
            stream.seek(offset)
            said = stream.read().rstrip()   # the App's links come before the ready line
        if READY in said and child.poll() is None:
            print(said)
            print(f"The home runs in the background (process {child.pid}); its log is {log}.")
            return 0
        if child.poll() is not None:
            print(said, file=sys.stderr)
            return child.returncode or 1
        if time.monotonic() > deadline:
            break
        time.sleep(0.1)
    process.kill_tree(child)
    print(said, file=sys.stderr)
    print(f"artemis: the home did not get ready within {wait_s:.0f} s, so it was stopped; its log is {log}.",
          file=sys.stderr)
    return 1
