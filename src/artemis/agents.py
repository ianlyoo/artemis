"""The agents Artemis drives: which ones are ready here, which one takes a task, and how each one starts fenced.

Every provider starts headless with the Artemis tools over MCP as its only way to run anything. Its own shell and
code-running tools are switched off, and its file tools are read-only unless it works in a repo worktree.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from functools import cache
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys
from threading import Thread
import time
from urllib.parse import urlsplit

from .process import checkout_env
from .roles import WorkflowError
from . import worker_adapters
from .worker_adapters import Launch, Spec, section, setting


PROVIDERS = ("claude", "codex", "gemini", "opencode", "api", "mock")
LABELS = {"claude": "Claude Code", "codex": "Codex", "gemini": "Gemini CLI", "opencode": "OpenCode",
          "api": "OpenAI-compatible API", "mock": "mock (no AI)"}
# What each model is good at, in order; [placement] in config.toml replaces a kind's list.
PLACEMENT = {
    "code": ("codex", "claude", "opencode"),
    "review": ("claude", "codex", "gemini"),
    "research": ("gemini", "claude", "codex"),
    "docs": ("claude", "gemini", "codex"),
    "host": ("claude", "codex", "api"),
}
CAPS = {"claude": 2, "codex": 2, "gemini": 1, "opencode": 1, "api": 2, "mock": 4}
WORKER_AUTO = ("claude", "codex", "opencode", "gemini", "mock")
LEAD_AUTO = ("claude", "codex", "mock")
LEADS = ("claude", "codex", "api", "mock")
METERED = {"api"}       # billed per call, apart from the CLI plans: taken only when no plan-backed provider is ready
FAMILY_HOSTS = {"openai.com": "openai", "googleapis.com": "google", "anthropic.com": "anthropic"}
OS_NAME = platform.system().casefold()


def _has_key(name: str, vault) -> bool:
    return bool(os.environ.get(name)) or (vault is not None and vault.info(name) is not None)


@cache
def _signed_in_claude(path: Path, stamp: float) -> bool:
    try:
        return "oauthAccount" in path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False


def _claude_ready() -> bool:
    folder = os.environ.get("CLAUDE_CONFIG_DIR")
    credentials = Path(folder or Path.home() / ".claude") / ".credentials.json"
    profile = Path(folder) / ".claude.json" if folder else Path.home() / ".claude.json"
    stamp = profile.stat().st_mtime if profile.exists() else 0.0
    return (credentials.exists() or _signed_in_claude(profile, stamp)
            or any(os.environ.get(name) for name in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN")))


def _opencode_ready(config, vault) -> bool:
    data = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "opencode"
    names = worker_adapters.opencode_keys(setting(config, "opencode", "model", ""))
    return (data / "auth.json").exists() or any(_has_key(vault_name, vault) for vault_name, _ in names)


def ready(name: str, config, vault) -> bool:
    """Installed and signed in (or its key is in the vault). Read from files, so it is a fair guess, not a login."""
    if name == "mock":
        return True
    if name == "api":
        base = setting(config, "api", "base_url", "https://api.openai.com/v1")
        loopback = urlsplit(base).hostname in {"localhost", "127.0.0.1", "::1"}
        return bool(setting(config, "api", "model")) and (
            loopback or _has_key(setting(config, "api", "key", "OPENAI_API_KEY"), vault))
    if name not in PROVIDERS or shutil.which(name) is None:
        return False
    if name == "claude":
        return _claude_ready()
    if name == "codex":
        return (Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex") / "auth.json").exists()
    if name == "gemini":
        return _has_key("GEMINI_API_KEY", vault)        # its run has a home of its own, so a Google sign-in is not seen
    return _opencode_ready(config, vault)


def family(name: str, config) -> str:
    """The model maker behind a provider, so a review can come from a different one."""
    if name == "opencode":
        model = setting(config, "opencode", "model", "")
        return model.split("/", 1)[0] if "/" in model else "opencode"
    if name == "api":
        host = urlsplit(setting(config, "api", "base_url", "https://api.openai.com/v1")).hostname or ""
        return next((maker for suffix, maker in FAMILY_HOSTS.items()
                     if host == suffix or host.endswith("." + suffix)), host)
    return {"claude": "anthropic", "codex": "openai", "gemini": "google"}.get(name, name)


def cap(name: str, config) -> int:
    caps = section(config, "agents").get("caps") or {}
    return int((caps if isinstance(caps, Mapping) else vars(caps)).get(name, CAPS.get(name, 1)))


def status(name: str, role: str, ledger) -> str | None:
    """What qualification found for this provider in this role (lead, code or host) on this OS, if it ran."""
    rows = ledger.adapters() if ledger is not None else []
    return next((row["status"] for row in rows if (row["provider"], row["role"], row["os"]) == (name, role, OS_NAME)),
                None)


def qualified(name: str, role: str, ledger) -> bool:
    """Host work, and Codex as the lead, need a live qualification; anything found unqualified is never used."""
    if name == "mock":
        return True
    found = status(name, role, ledger)
    if role == "host" or (role == "lead" and name == "codex"):
        return found == "live"
    return found != "unqualified"


def available(name: str, config, vault, *, role: str = "code", ledger=None) -> bool:
    """Whether this provider can take work here now: ready, and qualified for the role (lead, code or host)."""
    return ready(name, config, vault) and qualified(name, role, ledger)


def place(kind: str, config, busy: dict[str, int], avoid_family: str | None = None, *,
          vault=None, ledger=None, project: int | None = None) -> str:
    """The provider for a task of this kind: the first in [placement] that is ready, qualified and under its cap.

    Lessons may reorder a project's list; [agents] worker is used only when nothing in it is ready. The metered
    API is taken only when no plan-backed provider is ready. Returns "" when every candidate is at its cap, so the
    task waits.
    """
    order = list(section(config, "placement").get(kind) or PLACEMENT.get(kind, PLACEMENT["code"]))
    if ledger is not None:
        try:
            from .lessons import placement_for
        except ImportError:
            pass
        else:
            order = list(placement_for(ledger, project, kind, order))
    role = "host" if kind == "host" else "code"

    def takers(names) -> list[str]:
        return [name for name in dict.fromkeys(names) if name in PROVIDERS
                and available(name, config, vault, role=role, ledger=ledger)
                and (avoid_family is None or family(name, config) != avoid_family)]

    fallback = setting(config, "agents", "worker", "auto")
    candidates = takers(order) or takers(WORKER_AUTO if fallback == "auto" else [fallback])
    candidates = [name for name in candidates if name not in METERED] or candidates
    return next((name for name in candidates if busy.get(name, 0) < cap(name, config)), "")


def lead_provider(config, vault, ledger=None) -> str:
    """[agents] lead, or for auto the first of Claude Code, Codex and the mock that can lead here now. The one place
    auto is resolved; without the ledger, Codex is not taken, since it leads only once qualified live."""
    name = setting(config, "agents", "lead", "auto")
    if name == "auto":
        return next(name for name in LEAD_AUTO if available(name, config, vault, role="lead", ledger=ledger))
    if name not in LEADS:
        raise WorkflowError(f"Unknown lead {name!r}. Choose one of: auto, {', '.join(LEADS)}.")
    if not qualified(name, "lead", ledger):
        raise WorkflowError(f"{LABELS[name]} has not qualified to lead on this computer. "
                            "Run `artemis doctor providers`, or set [agents] lead to another provider.")
    return name


def launch(name: str, *, role: str, mode: str, cwd: Path, prompt: str, mcp: list[str], config, vault,
           scratch: Path, instructions: str = "", session: str | None = None) -> Launch:
    """The argv, added environment, stdin and reply decoder for one headless turn.

    role is worker or lead; mode is repo (file edits in the worktree) or host (no file edits; changes go through
    the broker). The lead always runs in host mode. Every turn starts cold: everything an agent knows is in its
    prompt, and no vendor session is resumed, so session must be None. Per-run config files go in scratch.
    """
    if session is not None:
        raise WorkflowError("Artemis starts every agent turn cold; it resumes no saved session.")
    if name not in PROVIDERS:
        raise WorkflowError(f"Unknown agent {name!r}. Choose one of: {', '.join(PROVIDERS)}.")
    if role not in ("worker", "lead") or mode not in ("repo", "host"):
        raise WorkflowError("An agent runs as a worker or the lead, in a repo or on the host.")
    if role == "lead" and name not in LEADS:
        raise WorkflowError(f"{LABELS[name]} runs as a worker only.")
    scratch.mkdir(parents=True, exist_ok=True)
    spec = Spec(role, "host" if role == "lead" else mode, Path(cwd), prompt, list(mcp), config, vault,
                Path(scratch), instructions)
    start = worker_adapters.BUILDERS[name](spec)
    return replace(start, env=start.env | {"PWD": str(Path(cwd).absolute())})    # some CLIs (OpenCode) trust PWD


@dataclass(frozen=True)
class Outcome:
    exit_code: int | None     # None: the deadline passed or it was stopped, and the process tree was killed
    stdout: str
    stderr: str


def run_turn(start: Launch, cwd: Path, timeout_s: float, on_line: Callable[[str], None] | None = None,
             stopped: Callable[[], bool] = lambda: False) -> Outcome:
    """Run one launch to its end in its own process group, streaming stdout lines to on_line."""
    options = ({"start_new_session": True} if os.name != "nt"
               else {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP})
    argv = [shutil.which(start.argv[0]) or start.argv[0], *start.argv[1:]]     # finds npm's .cmd shims on Windows
    env = checkout_env() | start.env
    with subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
                          errors="replace", **options) as process:
        lines: list[str] = []
        errors: list[str] = []

        def read_out():
            for line in process.stdout:
                lines.append(line)
                if on_line is not None:
                    on_line(line)

        readers = [Thread(target=read_out, daemon=True),
                   Thread(target=lambda: errors.extend(process.stderr), daemon=True)]
        for reader in readers:
            reader.start()
        try:
            process.stdin.write(start.stdin)
            process.stdin.close()
        except OSError:
            pass          # it exited before reading; its output says why
        deadline = time.monotonic() + timeout_s
        killed = False
        while process.poll() is None:
            if stopped() or time.monotonic() > deadline:
                kill_tree(process)
                killed = True
                break
            time.sleep(0.2)
        for reader in readers:
            reader.join(timeout=5)
        return Outcome(None if killed else process.returncode, "".join(lines), "".join(errors)[-4000:])


def answer(start: Launch, outcome: Outcome) -> str:
    """A finished turn's reply. Without one, the reason: the error the agent wrote in its own output when it wrote
    one, else its exit code and the end of its stderr. Callers name the provider."""
    if outcome.exit_code is None:
        raise WorkflowError("it was stopped before it answered")
    reply = start.decode(outcome.stdout)
    if outcome.exit_code != 0 or not reply:
        detail = " ".join(outcome.stderr.split())[-300:]
        raise WorkflowError(f"it ended (exit {outcome.exit_code}) without an answer" + (f": {detail}" if detail else ""))
    return reply


def kill_tree(process: subprocess.Popen) -> None:
    try:
        if os.name == "nt":
            subprocess.run(("taskkill", "/PID", str(process.pid), "/T", "/F"), capture_output=True, check=False)
        else:
            os.killpg(process.pid, 15)
        process.wait(timeout=5)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        if os.name != "nt":
            try:
                os.killpg(process.pid, 9)
            except ProcessLookupError:
                pass
        process.kill()
        process.wait()


class _Unscrubbed:
    """With no vault there are no values to hide."""

    def scrub(self, text: str) -> str:
        return text

    def stream(self):
        return self

    def feed(self, text: str) -> str:
        return text

    def flush(self) -> str:
        return ""


def scrubber(vault):
    """What hides vault values in an agent's output before anyone sees it: the vault's own scrubber."""
    return _Unscrubbed() if vault is None else vault.scrubber


# v0.2 surface, used by cli.py and supervise.py until they move to the home; delete it then.

@dataclass(frozen=True)
class Agent:
    name: str
    label: str
    worker: tuple[str, ...] | None    # headless command; the task prompt arrives on stdin
    lead: bool = False                # has an interactive session Artemis can start as the lead
    executable: str | None = None     # found on PATH when installed
    mock: bool = False

    def available(self, config=None) -> bool:
        if self.name == "api":
            return bool(config and config.api and os.environ.get(config.api.key_env))
        if self.executable is not None:
            return shutil.which(self.executable) is not None
        return True

    def worker_argv(self, checks: tuple[tuple[str, ...], ...], override: tuple[str, ...] | None = None) -> list[str]:
        if override is not None:
            return list(override)
        if self.worker is None:
            raise WorkflowError(f"{self.label} cannot run as a worker.")
        argv = list(self.worker)
        if self.name == "claude":
            allowed = ["Edit", "Write", "Read", "Glob", "Grep", "Bash(git status:*)", "Bash(git diff:*)",
                       "Bash(git log:*)"]
            allowed += [f"Bash({shlex.join(check)}:*)" for check in checks]
            argv += ["--permission-prompts", "none", "--allowedTools", *allowed]
        return argv

    def worker_launch(self, config, tree: Path, checks: tuple[tuple[str, ...], ...]):
        """The supervisor's fallback when this build has no launch(): the mock, or a command artemis.toml names.
        Every agent CLI starts only through launch(), which fences it."""
        override = config.commands.get(self.name)
        if override is None and not self.mock:
            raise WorkflowError(f"{self.label} starts only through agents.launch, which fences it.")
        return self.worker_argv(checks, override), {}, None


AGENTS = {
    agent.name: agent for agent in (
        Agent("claude", "Claude Code", ("claude", "-p", "--output-format", "text", "--permission-mode", "acceptEdits"),
              lead=True, executable="claude"),
        Agent("codex", "Codex", ("codex", "-a", "never"), executable="codex"),
        Agent("opencode", "OpenCode", ("opencode", "run", "--standalone", "--format", "json",
                                    "--agent", "artemis-worker"), executable="opencode"),
        Agent("api", "OpenAI-compatible API", (sys.executable, "-m", "artemis.api_worker", "--mode", "repo")),
        Agent("mock", "mock (no AI)", (sys.executable, "-m", "artemis.mock_worker"), mock=True),
        Agent("chat", "built-in chat", None, lead=True),
    )
}
WORKER_ORDER = ("claude", "codex", "opencode", "api", "mock")
NOT_AUTO = {"api"}


def pick(name: str, role: str, config=None) -> Agent:
    """Resolve a configured worker name, where auto takes the first one installed. For the lead, the one
    lead_provider resolves from config."""
    if role == "lead":
        return AGENTS[lead_provider(config, None)]
    if name == "auto":
        return next(AGENTS[key] for key in WORKER_ORDER if key not in NOT_AUTO and AGENTS[key].available(config))
    agent = AGENTS.get(name)
    if agent is None or name not in WORKER_ORDER:
        raise WorkflowError(f"Unknown worker agent {name!r}. Choose one of: auto, {', '.join(WORKER_ORDER)}.")
    if not agent.available(config):
        raise WorkflowError(f"{agent.label} is not installed or not configured here.")
    return agent
