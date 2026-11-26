"""The `artemis` command: the person's, the lead's and scripts' way into the home.

Every verb reads and writes the ledger of one home (ARTEMIS_HOME, else ~/.artemis) directly; the running home
(`artemis serve`) picks up what they write within a second. A verb about one project takes the project whose
folder it runs in.
"""

import argparse
import hmac
import http.client
import io
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
from types import SimpleNamespace
from urllib.parse import urlsplit

from . import __version__, attention, home as homes, process, sample
from .agents import AGENTS, lead_provider, pick
from .config import CONFIG_NAME, DEFAULT_LEDGER, PROVIDERS, TASK_KINDS, Config, HomeConfig, command
from .home import Paths, part
from .judge import Criterion
from .lead import start_cli
from .ledger import Ledger
from .roles import Interrupt, Role, WorkflowError
from .ship import git
from .supervise import legacy_stopped


# A shell that carries a run's token belongs to an agent; these verbs are the person's.
PERSON_ONLY = {"approve", "decline", "resume", "device", "project", "secret", "lesson", "undo", "serve"}
AGENT_CLIS = {"claude": "Claude Code", "codex": "Codex", "gemini": "Gemini CLI", "opencode": "OpenCode"}


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        self.exit(2, f"{self.prog}: {attention.visible(message)}\n")


def _parser() -> Parser:
    parser = Parser(prog="artemis", description="Talk to one lead while workers run in parallel. "
                    "You are asked only for real decisions.")
    parser.add_argument("--version", action="version", version=f"artemis {__version__}")
    commands = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")
    add = commands.add_parser

    serve = add("serve", help="Run the home: ledger, workers, schedules and the App. One per ARTEMIS_HOME.")
    serve.add_argument("--port", type=int, help="Default: [serve] port in config.toml; 0 picks a free port.")
    serve.add_argument("--lan", nargs="?", const=True, default=False, metavar="NAME",
                       help="Also serve the App to the network, for your phone. NAME is the address the phone opens "
                            "when it is not on this machine's own network: a Tailscale name, a DNS name or a "
                            "public address.")
    serve.add_argument("--no-open", action="store_true", help="Do not open the App in a browser.")
    serve.add_argument("--tls-cert", type=Path, metavar="FILE", help="Your own certificate for --lan.")
    serve.add_argument("--tls-key", type=Path, metavar="FILE", help="Its private key.")
    how = serve.add_mutually_exclusive_group()
    how.add_argument("--background", action="store_true",
                     help="Detach from this terminal; the home logs to logs/home.log.")
    how.add_argument("--stop", action="store_true",
                     help="Ask the home running for this ARTEMIS_HOME to close, and wait until it has.")

    project = add("project", help="The repositories and folders this home works in.")
    verbs = project.add_subparsers(dest="verb", required=True, metavar="VERB")
    added = verbs.add_parser("add", help="Add a Git repository (tasks run in worktrees and land on its branch) "
                             "or any folder (workers work in it through Artemis's tools).")
    added.add_argument("path", type=Path)
    added.add_argument("--name", help="Default: the folder's name.")
    added.add_argument("--no-run", action="store_true", help="Its workers get no tool that runs commands.")
    added.add_argument("--shell", action="store_true",
                       help="Its workers may run whole shell command lines, not only single programs.")
    added.add_argument("--root", action="append", default=[], type=Path, metavar="PATH",
                       help="Another folder its workers may reach. Repeat for more.")
    verbs.add_parser("list", help="Every project with its kind, folder and flags.")

    doctor = add("doctor", help="Check Python, Git, the agent CLIs, the keychain and the home on this computer.")
    providers = part("qualify", "add_commands")     # doctor providers: probe each ready agent CLI's fence
    if providers is not None:
        providers(doctor.add_subparsers(dest="what", metavar="WHAT"))

    device = add("device", help="The browsers and phones paired with the App.")
    devices = device.add_subparsers(dest="verb", required=True, metavar="VERB")
    devices.add_parser("list", help="Every device and whether it may use the App.")
    allow = devices.add_parser("allow", help="Let a waiting device in, by the 4-digit code it shows.")
    allow.add_argument("code")
    devices.add_parser("link", help="A new link that pairs one browser or phone with the App (the first one "
                       "works for ten minutes).")
    revoke = devices.add_parser("revoke", help="Shut a device out; it has to pair again.")
    revoke.add_argument("device", type=int)

    begin = add("start", help="Talk to the lead about the project in this folder (or --demo).")
    begin.add_argument("--demo", action="store_true", help="Create ./artemis-demo, a small project to try it on.")
    begin.add_argument("--agent", metavar="NAME", help="The worker for every task, if this starts the home "
                       "(mock: no AI).")
    play = add("demo", help="Run the whole path once, unattended, with mock workers.")
    play.add_argument("--fast", action="store_true", help="Make the mock workers near-instant.")
    play.add_argument("--agent", default="mock", metavar="NAME", help="Worker agent (default: mock).")
    play.add_argument("--keep", action="store_true", help="Leave ./artemis-demo in place to inspect it.")
    play.add_argument("--film", action="store_true",
                      help="Also stage ./film-demo: a folder of clips and a Friday schedule that sorts them.")
    add("init", help="Add the Git repository here as a project (artemis project add <its top folder>).")

    add("status", help="Running work, decisions for you, and the count of times you were asked.")
    add("inbox", help="The decisions waiting for you.")
    peek = add("digest", help="What happened since you last looked, one line each with its evidence label.")
    peek.add_argument("--peek", action="store_true", help="Do not mark it as read.")
    for name, text in (("approve", "You: say yes to one decision."), ("decline", "You: say no to one decision.")):
        add(name, help=text).add_argument("decision", type=int)

    words = add("request", help="Lead: record what the person asked for, in their words.")
    words.add_argument("text")
    words.add_argument("--project", metavar="NAME", help="Default: the project this folder is in.")
    task = add("task", help="Lead: add a task to a request; the home starts it when a worker is free.")
    task.add_argument("request", type=int)
    task.add_argument("title")
    task.add_argument("--brief", default="", help="What to change and why.")
    task.add_argument("--check", action="append", default=[], metavar="COMMAND", help="Must exit 0.")
    task.add_argument("--file", action="append", default=[], metavar="PATH", help="Must exist when it is done.")
    task.add_argument("--kind", choices=TASK_KINDS, help="Picks the provider (default: code, or host in a folder).")
    task.add_argument("--provider", choices=PROVIDERS, help="Run it with this provider instead.")
    task.add_argument("--review", action="store_true", help="Have another provider family review it first.")
    ask = add("ask", help="Lead: put one decision to the person.")
    ask.add_argument("request", type=int)
    ask.add_argument("what")
    ask.add_argument("--kind", required=True, choices=list(Interrupt))
    ask.add_argument("--why", required=True)
    done = add("carried", help="Lead: record that an approved decision was carried out.")
    done.add_argument("decision", type=int)
    done.add_argument("note")
    again = add("retry", help="Lead: run a stuck task again.")
    again.add_argument("task", type=int)
    again.add_argument("--brief", help="Replace the task's brief.")
    drop = add("drop", help="Lead: give up a task, with the reason.")
    drop.add_argument("task", type=int)
    drop.add_argument("reason")
    note = add("note", help="Lead: record its own reading (shown as inferred).")
    note.add_argument("text")
    pause = add("wait", help="Lead: block until something the person should hear about happens.")
    pause.add_argument("--timeout", type=float, default=600, metavar="SECONDS")
    show = add("show", help="The full record: every event, or one task's events and log tail.")
    show.add_argument("--task", type=int, metavar="N")
    add("statusline", help="One line for a status bar.")
    for name, text in (("stop", "You: stop all automatic work now."), ("resume", "You: release a stop.")):
        add(name, help=text).add_argument("reason", nargs="?", default="")

    for module in ("vault", "undo", "lessons", "mcp"):     # secret, undo, lesson and mcp: each module's own verbs
        add = part(module, "add_commands")
        if add is not None:
            add(commands)
    return parser


# Checks

SHELL_OPERATORS = set("();<>|&")


def _check(text: str) -> tuple[str, ...]:
    """One command run without a shell. Shell operators are refused rather than passed on as arguments."""
    lexer = shlex.shlex(text, posix=False, punctuation_chars=True)
    lexer.whitespace_split = True
    if any(token and set(token) <= SHELL_OPERATORS for token in lexer):
        raise WorkflowError(f"--check runs one command without a shell: {text!r}. "
                            "Give each command its own --check; every one must exit 0.")
    return command(process.split_command(text), "--check")


def _criteria(config: Config, checks: list[str], files: list[str], land: bool = True) -> tuple[Criterion, ...]:
    """The task's checks. A repository task without its own takes the project's; one that lands must leave
    something for the ship lane to run on the merged result."""
    items = [Criterion(text, command=_check(text)) for text in checks]
    for text in files:
        path = Path(text)
        if path.is_absolute() or ".." in path.parts or not path.parts:
            raise WorkflowError("--file needs a path inside the project.")
        items.append(Criterion(path.as_posix(), artifact=path.as_posix()))
    items = items or [Criterion(" ".join(c), command=c) for c in config.checks]
    if land:
        config.landing_checks(items)
    elif not items:
        raise WorkflowError("A folder task needs a --check or a --file the judge can test in the folder.")
    return tuple(items)


# Projects

def _ledger(paths: Paths) -> Ledger:
    paths.root.mkdir(mode=0o700, parents=True, exist_ok=True)
    ledger = Ledger(paths.ledger)
    ledger.initialize()
    return ledger


def _here(ledger: Ledger, name: str | None = None):
    """The named project, else the one whose folder holds the current directory (the innermost)."""
    if name is not None:
        return ledger.project(name)
    cwd = Path.cwd().resolve()
    inside = [row for row in ledger.projects() if cwd == Path(row["path"]) or Path(row["path"]) in cwd.parents]
    if not inside:
        raise WorkflowError("This folder is in no Artemis project. Add it first: artemis project add .")
    return max(inside, key=lambda row: len(Path(row["path"]).parts))


def _settings(project) -> Config:
    """A repository's own artemis.toml (its checks and target); a folder has none."""
    root = Path(project["path"])
    if project["kind"] == "repo" and (root / CONFIG_NAME).exists():
        return Config.load(root)
    return Config(root, frozenset(), ())


def _toplevel(path: Path) -> Path | None:
    try:
        return Path(git(path, "rev-parse", "--show-toplevel")).resolve()
    except (subprocess.CalledProcessError, OSError):
        return None


def _outside_home(paths: Paths, path: Path, what: str) -> None:
    home = paths.root.resolve()
    if path == home or home in path.parents:
        raise WorkflowError(f"{what} is inside the Artemis home ({home}); choose a folder outside it.")
    if path in home.parents:
        raise WorkflowError(f"{what} holds the Artemis home ({home}), so its workers would reach the vault and "
                            "the ledger. Choose a folder inside it, or move the home with ARTEMIS_HOME.")


def _prepare_repo(root: Path) -> str:
    """Write artemis.toml once and keep .artemis/ out of Git. Returns the branch work lands on: main, or else
    the branch checked out now."""
    if (root / CONFIG_NAME).exists():
        return Config.load(root).target
    target = "main"
    if not git(root, "rev-parse", "--verify", "--quiet", "refs/heads/main", check=False):
        target = git(root, "symbolic-ref", "--quiet", "--short", "HEAD", check=False)
        if not target or not git(root, "rev-parse", "--verify", "--quiet", "HEAD", check=False):
            raise WorkflowError("Check out a branch with at least one commit; Artemis lands work on it.")
    Config.initialize(root, target)
    exclude = Path(git(root, "rev-parse", "--git-path", "info/exclude"))
    exclude = exclude if exclude.is_absolute() else root / exclude
    lines = exclude.read_text(encoding="utf-8").splitlines() if exclude.exists() else []
    if ".artemis/" not in lines:
        exclude.parent.mkdir(parents=True, exist_ok=True)
        exclude.write_text("\n".join(lines + [".artemis/"]) + "\n", encoding="utf-8")
    return target


def _add(paths: Paths, ledger: Ledger, path: Path, name: str | None = None, *, no_run: bool = False,
         shell: bool = False, roots: tuple[Path, ...] = ()) -> int:
    path = path.expanduser().resolve()
    if not path.is_dir():
        raise WorkflowError(f"{path} is not a folder.")
    _outside_home(paths, path, "That folder")
    if no_run and shell:
        raise WorkflowError("--no-run and --shell contradict each other: without a run tool there is no shell.")
    extra = tuple(root.expanduser().resolve() for root in roots)
    for root in extra:
        if not root.is_dir():
            raise WorkflowError(f"--root {root} is not a folder.")
        _outside_home(paths, root, f"--root {root}")
    known = {row["path"]: row for row in ledger.projects(include_archived=True)}
    kind = "repo" if _toplevel(path) == path else "folder"
    target = _prepare_repo(path) if kind == "repo" else None
    name = name or re.sub(r"[^\w.-]+", "-", path.name).strip("-")[:64] or "project"
    project = ledger.add_project(Role.OWNER, name, kind, path)
    row = ledger.project(project)
    if str(path) in known:
        print(f"{row['name']} is already a project ({row['kind']}).")
    elif kind == "repo":
        print(f"Added {row['name']}: a Git repository. Tasks run in their own worktrees under "
              f"{paths.work / row['name']}; only checked work lands on {target}.")
    else:
        print(f"Added {row['name']}: a folder. Workers work in it through Artemis's tools, and the judge checks "
              "the folder afterwards.")
    if no_run or shell or extra:
        ledger.set_project_flags(Role.OWNER, project, shell=shell, no_run=no_run,
                                 allowed_roots=tuple(str(root) for root in extra))
        print(f"Flags: {_flags(ledger.project(project))}.")
    if kind == "repo" and (path / DEFAULT_LEDGER).is_file():
        print(f"It has a v0.2 ledger ({DEFAULT_LEDGER.as_posix()}). That file stays as it is and is only read "
              f"for a stop; 0.3 records this project in the home ledger ({paths.ledger}).")
        if legacy_stopped(path):
            print("Its last word is a stop, so nothing starts in this project until you move that file aside.")
    return project


def _flags(row) -> str:
    import json

    flags = [text for on, text in ((row["no_run"], "no run tool"), (row["shell"], "shell command lines")) if on]
    flags += [f"may reach {root}" for root in json.loads(row["allowed_roots"])]
    return ", ".join(flags) or "defaults"


def _project(args: argparse.Namespace, paths: Paths) -> int:
    ledger = _ledger(paths)
    if args.verb == "add":
        _add(paths, ledger, args.path, args.name, no_run=args.no_run, shell=args.shell, roots=tuple(args.root))
        _next(paths)
        return 0
    rows = ledger.projects()
    if not rows:
        print("No projects yet. Add one: artemis project add PATH")
    for row in rows:
        print(f"{row['id']:>3}  {row['name']:<20} {row['kind']:<6} {row['path']}  ({_flags(row)})")
    return 0


# The home

def _address(name: str) -> str | None:
    from .tls import address   # with the App part only: it needs cryptography
    return address(name)


def _serve(args: argparse.Namespace, paths: Paths) -> int:
    if (args.tls_cert is None) != (args.tls_key is None):
        raise WorkflowError("--tls-cert and --tls-key go together.")
    tls = (args.tls_cert.resolve(), args.tls_key.resolve()) if args.tls_cert else None
    if isinstance(args.lan, str) and not _address(args.lan):
        raise WorkflowError(f"--lan takes a host name or an IPv4 address, not {args.lan!r}.")
    if args.stop:
        return homes.stop(paths)
    if not args.background:
        return homes.serve(paths, args.port, args.lan, not args.no_open, tls)
    argv = ((["--port", str(args.port)] if args.port is not None else [])
            + (["--lan"] + ([args.lan] if isinstance(args.lan, str) else []) if args.lan else []))
    if tls:
        argv += ["--tls-cert", str(tls[0]), "--tls-key", str(tls[1])]
    return homes.background(paths, argv)


def _version(argv: list[str]) -> str | None:
    try:
        done = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=15, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    lines = (done.stdout or done.stderr).strip().splitlines()
    return attention.visible(lines[0])[:80] if done.returncode == 0 and lines else None


def _keychain() -> tuple[bool, str]:
    try:
        import keyring

        backend = keyring.get_keyring()
    except Exception as error:  # a missing or broken backend is what this line reports
        return False, f"unavailable ({type(error).__name__})"
    name = getattr(backend, "name", type(backend).__name__)
    usable = getattr(backend, "priority", 1) > 0
    return usable, str(name)


def _doctor(args: argparse.Namespace, paths: Paths) -> int:
    if getattr(args, "what", None) == "providers":
        config = HomeConfig.load(paths)
        vault = part("vault", "Vault")
        opened = vault(paths, config.vault.unlock) if vault is not None and paths.vault.is_file() else None
        return args.run(SimpleNamespace(ledger=_ledger(paths), config=config, vault=opened), args) or 0
    lines, healthy = [], True

    def line(ok: bool | None, text: str) -> None:
        lines.append(f"  {'ok' if ok else 'missing' if ok is None else 'problem':<8} {text}")

    good = sys.version_info >= (3, 11)
    healthy &= good
    line(good, f"Python {platform.python_version()}" + ("" if good else " (Artemis needs 3.11 or later)"))
    git_at = shutil.which("git")    # as the agent CLIs below are found: PATHEXT too, so a git.cmd counts
    found = _version([git_at, "--version"]) if git_at else None
    line(True if found else None, f"Git: {found or 'not found (repositories need it; folders do not)'}")
    for name, label in AGENT_CLIS.items():
        where = shutil.which(name)
        version = _version([where, "--version"]) if where else None
        line(True if version else None if not where else False,
             f"{label}: {version}" if version else f"{label}: " + ("installed, but --version failed" if where
                                                                   else "not installed"))
    try:
        config = HomeConfig.load(paths)
        line(True, f"settings: {paths.config}")
    except WorkflowError as error:
        healthy = False
        line(False, f"settings: {error}")
        config = None
    usable, backend = _keychain()
    unlock = config.vault.unlock if config else "keyring"
    line(usable or unlock != "keyring", f"keychain: {backend} (vault unlock: {unlock})")
    vault = part("vault", "Vault")
    if vault is not None and config is not None and paths.vault.is_file():
        from .vault import VaultError
        try:
            opened = vault(paths, unlock)
            said = {"open": "open", "new": "no passphrase chosen yet",
                    "locked": "locked until its passphrase is given when the home starts"}[opened.state]
            if opened.state != "open" and unlock == "env":   # this shell's view; a service has its own environment
                said = ("locked in this shell: ARTEMIS_VAULT_PASSPHRASE is not set here, and a home started with it "
                        "has the vault open")
            line(True if opened.state == "open" or unlock != "env" else None,
                 f"vault: {said}" + (f"; {opened.notice}" if opened.notice else ""))
        except VaultError as error:
            healthy = False
            line(False, f"vault: {error}")
    port = homes.running(paths)
    line(True if port is not None else None, f"home: running at http://127.0.0.1:{port}" if port else
         "home: running" if port is not None else "home: not running (start it with artemis serve)")
    print(f"Artemis {__version__} · home {paths.root}")
    print("\n".join(lines))
    return 0 if healthy else 1


def _device(args: argparse.Namespace, paths: Paths) -> int:
    ledger = _ledger(paths)
    match args.verb:
        case "list":
            rows = ledger.devices()
            if not rows:
                print("No device has asked to pair. Open the App link that artemis serve prints.")
            for row in rows:
                kind = "phone" if row["phone"] else "browser"
                print(f"{row['id']:>3}  {row['state']:<8} {kind:<7} {attention.visible(row['name'])}")
        case "allow":
            waiting = [row for row in ledger.devices() if row["state"] == "pending" and row["code"]
                       and hmac.compare_digest(row["code"], args.code)]
            if not waiting:
                raise WorkflowError(f"No device waits with code {args.code}. artemis device list shows them.")
            if len(waiting) > 1:
                raise WorkflowError("More than one waiting device shows that code. Revoke the ones you do not "
                                    "know (artemis device revoke N), then allow yours.")
            ledger.set_device(Role.OWNER, waiting[0]["id"], "allowed")
            print(f"Allowed: {attention.visible(waiting[0]['name'])}. It can use the App now.")
        case "revoke":
            ledger.set_device(Role.OWNER, args.device, "revoked")
            print(f"Revoked device {args.device}; it has to pair again.")
        case "link":
            port = homes.running(paths)
            if not port:
                raise WorkflowError(f"No home is running for {paths.root}. artemis serve starts one and prints a "
                                    "link to the App.")
            link = _new_link(paths, port)
            print(f"App: {urlsplit(link['url'])._replace(netloc=f'127.0.0.1:{port}').geturl()}")
            if link["lan"]:
                from .tls import qr_text
                print(f"On your phone  {link['url']}\nCertificate SHA-256  {link['fingerprint']}\n"
                      f"{qr_text(link['url'])}\nThe phone then shows a 4-digit code: allow it in the App on this "
                      "computer or with `artemis device allow <code>`.")
            print("(The link pairs one browser and works once, for ten minutes.)")
    return 0


def _new_link(paths: Paths, port: int) -> dict:
    """A new pairing link from the running home's App, asked over loopback with the home's own CLI token."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        connection.request("POST", "/api/pair/new", b"{}", {
            "Host": f"127.0.0.1:{port}", "Content-Type": "application/json",
            "Authorization": "Bearer " + paths.token.read_text(encoding="utf-8").strip()})
        response = connection.getresponse()
        answer = json.loads(response.read() or b"{}")
    except (OSError, ValueError, http.client.HTTPException) as error:
        raise WorkflowError(f"The home at port {port} gave no link ({type(error).__name__}); does this build "
                            "serve the App?") from None
    finally:
        connection.close()
    if response.status != 200:
        raise WorkflowError(f"The home gave no link: {answer.get('error', response.status)}")
    return answer


def _nudge(paths: Paths) -> None:
    if homes.running(paths) is None:
        print("No home is running, so this waits until one starts: artemis serve (or serve --background).",
              file=sys.stderr)


# Talking to the lead

def _start(args: argparse.Namespace, paths: Paths) -> int:
    if args.demo:
        target = Path.cwd() / "artemis-demo"
        if not target.exists():
            sample.create(target)
        os.chdir(target)
    ledger = _ledger(paths)
    try:
        project = _here(ledger)
    except WorkflowError:
        top = _toplevel(Path.cwd())
        if top is None:
            raise WorkflowError("Run this in a Git repository or in a folder you added (artemis project add .), "
                                "or try: artemis start --demo") from None
        project = ledger.project(_add(paths, ledger, top))
    if args.agent:
        os.environ["ARTEMIS_WORKER"] = pick(args.agent, "worker").name
    config = HomeConfig.load(paths)
    if homes.running(paths) is None:
        if homes.background(paths, []) != 0:
            return 1
    elif args.agent:
        print("A home is already running, so --agent does not change its workers.", file=sys.stderr)
    lead = config.agents.lead
    if lead == "auto":
        lead = lead_provider(config, None, ledger)
    if lead == "claude":
        return start_cli(_settings(project), AGENTS["claude"])
    if lead != "mock":
        raise WorkflowError(f"The {lead} lead talks to you in the App (the link artemis serve prints); in the "
                            "terminal the lead is claude or mock.")
    worker = os.environ.get("ARTEMIS_WORKER") or pick(config.agents.worker, "worker").name
    print(sample.header(config, project, worker))
    print("Type one sentence of what you want. Also: status, inbox, digest, approve N, decline N, quit.")

    def typed():
        while True:
            try:
                yield input("you › ")
            except EOFError:
                return

    try:
        sample.converse(ledger, config, project, typed(), print, live=sys.stdout.isatty())
    except KeyboardInterrupt:
        print()
    return 0


def _init(paths: Paths) -> int:
    top = _toplevel(Path.cwd())
    if top is None:
        raise WorkflowError("Run this inside a Git repository, or add any folder: artemis project add PATH")
    _add(paths, _ledger(paths), top)
    _next(paths)
    return 0


def _next(paths: Paths) -> None:
    if homes.running(paths) is None:
        print("Next: artemis serve. It keeps running, does the work and prints a link to the App; tell the lead "
              "there what you want done.")
    else:
        print("Next: tell the lead in the App what you want done. artemis device link prints a new link to it.")


# The ledger verbs

def _show(ledger: Ledger, paths: Paths, task: int | None) -> None:
    for row in ledger.events(task=task):
        scope = f"#{row['task_id']}" if row["task_id"] else (f"D{row['card_id']}" if row["card_id"] else "")
        print(f"{row['id']:03d}  {row['role']:<7} {row['kind']:<11} {scope:<4} {attention.visible(row['detail'])}")
    if task is not None:
        log = paths.log(task)
        if log.exists():
            tail = log.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-15:]
            print(f"\nLast lines of the worker log ({log.relative_to(paths.root).as_posix()}):")
            print("\n".join(attention.visible(line) for line in tail))


def _task_row(ledger: Ledger, task: int):
    rows = ledger.work(task)
    if not rows:
        raise WorkflowError(f"There is no task {task}.")
    return rows[0]


def _ledger_command(args: argparse.Namespace, paths: Paths) -> int:
    ledger = _ledger(paths)
    match args.command:
        case "status":
            print(attention.status(ledger))
        case "statusline":
            print(attention.statusline(ledger))
        case "inbox":
            print(attention.inbox(ledger))
        case "digest":
            print(attention.digest(ledger, mark=not args.peek))
        case "approve" | "decline":
            approve = args.command == "approve"
            card = ledger.card(args.decision)
            if approve and card["kind"] in HomeConfig.load(paths).cards.phone_only:
                raise WorkflowError(f"Decision {args.decision} is {card['kind']}: only a paired phone approves "
                                    f"that kind ([cards] phone_only in {paths.config}).")
            ledger.decide_card(Role.OWNER, args.decision, approve)
            after = ("Artemis runs it once" if card["command"] else "the lead carries it out") if approve \
                else "nothing happens"
            print(f"{args.command}d: {args.decision} · {after}")
        case "request":
            print(ledger.request(Role.OWNER, args.text, project=_here(ledger, args.project)["id"]))
        case "task":
            asked = ledger.request_row(args.request)
            project = ledger.project(asked["project_id"]) if asked["project_id"] else _here(ledger)
            repo = project["kind"] == "repo"
            criteria = _criteria(_settings(project), args.check, args.file, land=repo)
            print(ledger.add_task(Role.LEAD, args.request, args.title, args.brief, criteria, project=project["id"],
                                  kind=args.kind or ("code" if repo else "host"), provider=args.provider,
                                  review=args.review))
            _nudge(paths)
        case "ask":
            if Interrupt(args.kind) not in HomeConfig.load(paths).interrupts.ask:
                raise WorkflowError(f"{args.kind} is not in [interrupts] ask in {paths.config}; decide it yourself.")
            asked = ledger.request_row(args.request)
            print(ledger.open_card(Role.LEAD, Interrupt(args.kind), args.what, args.why, request=args.request,
                                   project=asked["project_id"]))
        case "carried":
            ledger.finish_card(Role.LEAD, args.decision, "done", args.note)
        case "retry":
            row = _task_row(ledger, args.task)
            if row["state"] not in {"stuck", "queued"}:
                raise WorkflowError(f"Task {args.task} is {row['state']}; only a stuck task is retried.")
            if args.brief:
                ledger.revise(Role.LEAD, args.task, args.brief)
            ledger.record(Role.LEAD, "retrying", "asked to run it again", project=row["project_id"],
                          request=row["request_id"], task=args.task)
            print(f"Task {args.task} runs again" + (" with the new brief." if args.brief else "."))
            _nudge(paths)
        case "drop":
            row = _task_row(ledger, args.task)
            ledger.drop(Role.LEAD, args.task, args.reason)
            project = ledger.project(row["project_id"])
            tree = paths.worktree(project["name"], args.task)
            if project["kind"] == "repo" and tree.exists():
                git(Path(project["path"]), "worktree", "remove", "--force", str(tree))
        case "note":
            ledger.note(Role.LEAD, args.text)
        case "wait":
            print(attention.wait(ledger, args.timeout))
        case "show":
            _show(ledger, paths, args.task)
        case "stop":
            ledger.stop(Role.OWNER, args.reason or "stopped")
            print("Stopped. Running workers are ended; nothing new starts until artemis resume.")
        case "resume":
            ledger.resume(Role.OWNER, args.reason or "resumed")
            ended = [row["id"] for row in ledger.work() if row["state"] == "stuck" and row["note"] == "stopped by you"]
            print("Resumed." + (" The stop ended " + ", ".join(f"#{n}" for n in ended) + "; run one again with "
                                f"artemis retry {ended[0]}." if ended else ""))
            _nudge(paths)
    return 0


def speak_utf8() -> None:
    """Read and write this terminal or pipe in UTF-8 on every OS, as Artemis asks of the processes it starts."""
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors=stream.errors)


def main(argv: list[str] | None = None) -> int:
    speak_utf8()
    args = _parser().parse_args(argv)
    paths = Paths.from_env()
    try:
        if os.environ.get("ARTEMIS_RUN_TOKEN") and args.command in PERSON_ONLY:
            raise WorkflowError(f"{args.command} is for the person, not for an agent (this shell carries a "
                                "run token).")
        if args.command == "secret":
            return args.func(args, paths, HomeConfig.load(paths).vault.unlock)
        if args.command == "lesson":
            return args.func(args, _ledger(paths))
        if hasattr(args, "func"):
            return args.func(args)
        match args.command:
            case "serve":
                return _serve(args, paths)
            case "project":
                return _project(args, paths)
            case "doctor":
                return _doctor(args, paths)
            case "device":
                return _device(args, paths)
            case "start":
                return _start(args, paths)
            case "demo":
                return sample.demo(args.fast, args.agent, args.keep, args.film)
            case "init":
                return _init(paths)
        return _ledger_command(args, paths)
    except (ValueError, WorkflowError) as error:
        print(f"artemis: {attention.visible(str(error))}", file=sys.stderr)
    except (sqlite3.Error, subprocess.SubprocessError, OSError) as error:
        print(f"artemis: a local database, Git or file operation failed ({type(error).__name__}).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
