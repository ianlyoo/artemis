"""The agents Artemis can drive, as a lead you talk to or as a headless worker."""

from dataclasses import dataclass
import os
import shlex
import shutil
import sys

from .roles import WorkflowError


@dataclass(frozen=True)
class Agent:
    name: str
    label: str
    worker: tuple[str, ...] | None    # headless command; the task prompt arrives on stdin
    lead: bool = False                # has an interactive session Artemis can start as the lead
    executable: str | None = None     # found on PATH when installed
    keys: tuple[str, ...] = ()        # any of these set in the environment makes it available
    mock: bool = False

    def available(self) -> bool:
        if self.executable is not None:
            return shutil.which(self.executable) is not None
        if self.keys:
            return any(os.environ.get(key) for key in self.keys)
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


AGENTS = {
    agent.name: agent for agent in (
        Agent("claude", "Claude Code", ("claude", "-p", "--output-format", "text", "--permission-mode", "acceptEdits"),
              lead=True, executable="claude"),
        Agent("mock", "mock (no AI)", (sys.executable, "-m", "artemis.mock_worker"), mock=True),
        Agent("chat", "built-in chat", None, lead=True),
    )
}
WORKER_ORDER = ("claude", "mock")
LEAD_ORDER = ("claude", "chat")


def pick(name: str, role: str) -> Agent:
    """Resolve a configured agent name, where auto takes the first one installed."""
    order = WORKER_ORDER if role == "worker" else LEAD_ORDER
    if name == "auto":
        return next(AGENTS[key] for key in order if AGENTS[key].available())
    agent = AGENTS.get(name)
    if agent is None or name not in order:
        raise WorkflowError(f"Unknown {role} agent {name!r}. Choose one of: auto, {', '.join(order)}.")
    if not agent.available():
        raise WorkflowError(f"{agent.label} is not installed or not configured here.")
    return agent
