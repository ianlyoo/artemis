"""The agents Artemis can drive, as a lead you talk to or as a headless worker."""

from dataclasses import dataclass
import os
from pathlib import Path
import shlex
import shutil
import sys

from .config import Config
from .roles import WorkflowError
from . import worker_adapters


@dataclass(frozen=True)
class Agent:
    name: str
    label: str
    worker: tuple[str, ...] | None    # headless command; the task prompt arrives on stdin
    lead: bool = False                # has an interactive session Artemis can start as the lead
    executable: str | None = None     # found on PATH when installed
    mock: bool = False

    def available(self, config: Config | None = None) -> bool:
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
            # The worker may read and edit files, look at Git, and run its task's checks. Anything else is
            # refused without asking anyone (fail closed): Artemis commits, and nobody is there to approve.
            allowed = ["Edit", "Write", "Read", "Glob", "Grep", "Bash(git status:*)", "Bash(git diff:*)",
                       "Bash(git log:*)"]
            allowed += [f"Bash({shlex.join(check)}:*)" for check in checks]
            argv += ["--permission-prompts", "none", "--allowedTools", *allowed]
        return argv

    def worker_launch(self, config: Config, tree: Path, checks: tuple[tuple[str, ...], ...]):
        override = config.commands.get(self.name)
        argv = self.worker_argv(checks, override)
        if override is not None:
            return argv, {}, None
        match self.name:
            case "codex":
                worker_adapters.codex(config, tree, checks, argv)
                return argv, {}, worker_adapters.codex_claim
            case "opencode":
                env = worker_adapters.opencode(config, tree, checks, argv)
                return argv, env, worker_adapters.opencode_claim
            case "api":
                worker_adapters.api(config, argv)
        return argv, {}, None


AGENTS = {
    agent.name: agent for agent in (
        Agent("claude", "Claude Code", ("claude", "-p", "--output-format", "text", "--permission-mode", "acceptEdits"),
              lead=True, executable="claude"),
        Agent("codex", "Codex", ("codex", "-a", "never"), executable="codex"),
        Agent("opencode", "OpenCode", ("opencode", "run", "--standalone", "--format", "json",
                                    "--agent", "artemis-worker"), executable="opencode"),
        Agent("api", "OpenAI-compatible API", (sys.executable, "-m", "artemis.api_worker")),
        Agent("mock", "mock (no AI)", (sys.executable, "-m", "artemis.mock_worker"), mock=True),
        Agent("chat", "built-in chat", None, lead=True),
    )
}
WORKER_ORDER = ("claude", "codex", "opencode", "api", "mock")
LEAD_ORDER = ("claude", "chat")
# The API worker is billed separately from the CLIs' plans, so it runs only when named, never by auto.
NOT_AUTO = {"api"}


def pick(name: str, role: str, config: Config | None = None) -> Agent:
    """Resolve a configured agent name, where auto takes the first one installed."""
    order = WORKER_ORDER if role == "worker" else LEAD_ORDER
    if name == "auto":
        return next(AGENTS[key] for key in order if key not in NOT_AUTO and AGENTS[key].available(config))
    agent = AGENTS.get(name)
    if agent is None or name not in order:
        raise WorkflowError(f"Unknown {role} agent {name!r}. Choose one of: auto, {', '.join(order)}.")
    if not agent.available(config):
        raise WorkflowError(f"{agent.label} is not installed or not configured here.")
    return agent
