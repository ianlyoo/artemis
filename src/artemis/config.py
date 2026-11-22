"""Load project settings and install the bundled templates without overwriting edits."""

from dataclasses import dataclass, field
from importlib.resources import files
import json
import os
import re
from pathlib import Path
import tomllib
from urllib.parse import urlsplit

from .roles import Interrupt, WorkflowError


CONFIG_NAME = "artemis.toml"
STATE = Path(".artemis")
DEFAULT_LEDGER = STATE / "ledger.db"
TEMPLATES = ("lead.md", "worker.md")


def command(value: object, field_name: str) -> tuple[str, ...]:
    if (not isinstance(value, list) or not value or not value[0]
            or not all(isinstance(arg, str) and "\0" not in arg for arg in value)):
        raise WorkflowError(f"{field_name} needs a command argument array.")
    return tuple(value)


def ledger_path(root: Path) -> Path:
    return root.resolve() / DEFAULT_LEDGER


def _table(value: object, field_name: str) -> dict:
    if not isinstance(value, dict):
        raise WorkflowError(f"{field_name} needs a TOML table.")
    return value


def _setting(table: dict, name: str, default: str | None, section: str) -> str | None:
    value = table.get(name, default)
    if value is not None and (not isinstance(value, str) or not value.strip() or "\0" in value):
        raise WorkflowError(f"{section}.{name} needs a nonempty string.")
    return value


@dataclass(frozen=True)
class ApiSettings:
    model: str
    base_url: str
    key_env: str

    @classmethod
    def load(cls, table: dict) -> "ApiSettings":
        model = _setting(table, "model", None, "api")
        base_url = _setting(table, "base_url", "https://api.openai.com/v1", "api")
        key_env = _setting(table, "key_env", "OPENAI_API_KEY", "api")
        if model is None:
            raise WorkflowError("api.model needs a model name.")
        if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", key_env):
            raise WorkflowError("api.key_env needs an environment variable name.")
        try:
            url = urlsplit(base_url)
            host = url.hostname
            valid_port = url.port != 0
        except ValueError:
            host = None
        if (not host or not valid_port or url.username is not None or "?" in base_url or "#" in base_url
                or any(char.isspace() for char in base_url)
                or not (url.scheme == "https" or (url.scheme == "http" and host in {"localhost", "127.0.0.1", "::1"}))):
            raise WorkflowError("api.base_url needs HTTPS or loopback HTTP, without credentials, query or fragment.")
        return cls(model, base_url.rstrip("/"), key_env)


@dataclass(frozen=True)
class Config:
    root: Path
    interrupts: frozenset[Interrupt]
    checks: tuple[tuple[str, ...], ...]
    target: str = "main"
    lead: str = "auto"
    worker: str = "auto"
    max_workers: int = 3
    worker_minutes: int = 20
    commands: dict[str, tuple[str, ...]] = field(default_factory=dict)
    opencode_model: str | None = None
    api: ApiSettings | None = None

    @classmethod
    def load(cls, root: Path) -> "Config":
        root = root.resolve()
        try:
            with (root / CONFIG_NAME).open("rb") as stream:
                data = tomllib.load(stream)
        except FileNotFoundError:
            raise WorkflowError("Run artemis init (or artemis start) in this project first.") from None
        except (ValueError, OSError):
            raise WorkflowError(f"Could not read {CONFIG_NAME} as TOML.") from None

        asks = _table(data.get("interrupts", {}), "interrupts").get("ask", [])
        if not isinstance(asks, list) or any(item not in list(Interrupt) for item in asks):
            raise WorkflowError(f"interrupts.ask lists only: {', '.join(Interrupt)}.")
        ship = _table(data.get("ship"), "ship")
        checks = ship.get("checks", [])
        if not isinstance(checks, list):
            raise WorkflowError("ship.checks needs a list of commands.")
        target = ship.get("target", "main")
        if not isinstance(target, str) or not target or target.startswith("-") or " " in target:
            raise WorkflowError("ship.target needs a branch name.")
        agents = _table(data.get("agents", {}), "agents")
        limits = {}
        for name, default in (("max_workers", 3), ("worker_minutes", 20)):
            value = agents.get(name, default)
            if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 32 * 60:
                raise WorkflowError(f"agents.{name} needs a positive whole number.")
            limits[name] = value
        commands = {name: command(argv, f"commands.{name}")
                    for name, argv in _table(data.get("commands", {}), "commands").items()}
        names = {}
        for role in ("lead", "worker"):
            value = os.environ.get(f"ARTEMIS_{role.upper()}") or agents.get(role, "auto")
            if not isinstance(value, str) or not value:
                raise WorkflowError(f"agents.{role} needs an agent name.")
            names[role] = value
        opencode = _table(data.get("opencode", {}), "opencode")
        opencode_model = _setting(opencode, "model", None, "opencode")
        api = ApiSettings.load(_table(data["api"], "api")) if "api" in data else None
        return cls(root, frozenset(map(Interrupt, asks)),
                   tuple(command(item, "ship.checks") for item in checks), target,
                   names["lead"], names["worker"], limits["max_workers"], limits["worker_minutes"], commands,
                   opencode_model, api)

    @classmethod
    def initialize(cls, root: Path, target: str = "main") -> "Config":
        root.mkdir(parents=True, exist_ok=True)
        templates = files("artemis.templates")
        sample = templates.joinpath(CONFIG_NAME).read_text(encoding="utf-8")
        checks = detect_checks(root)
        found = (f"checks = {json.dumps(checks)}" if checks else
                 '# No test command was found here. Name one, for example [["npm", "test"]], or every task\n'
                 "# needs its own --check.\nchecks = []")
        _write_sample(root / CONFIG_NAME, sample.replace('target = "main"', f'target = "{target}"')
                      .replace(CHECKS_LINE, found))
        for name in TEMPLATES:
            _write_sample(root / STATE / name, templates.joinpath(name).read_text(encoding="utf-8"))
        return cls.load(root)

    def landing_checks(self, criteria) -> tuple[tuple[str, ...], ...]:
        """What the ship lane runs on the merged result: the project's checks, else the task's own commands."""
        commands = self.checks or tuple(c.command for c in criteria if c.command)
        if not commands:
            raise WorkflowError("Nothing would check this task after merging: artemis.toml names no test command "
                                "and the task has no --check. Give it a --check.")
        return commands

    def instructions(self, name: str) -> str:
        path = self.root / STATE / name
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return files("artemis.templates").joinpath(name).read_text(encoding="utf-8")


CHECKS_LINE = 'checks = [["python3", "-m", "unittest"]]'


def detect_checks(root: Path) -> list[list[str]]:
    """The project's own test command, read from the files that usually name it; empty when none is found."""
    def text(name: str) -> str:
        try:
            return (root / name).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""

    try:
        script = json.loads(text("package.json") or "{}").get("scripts", {}).get("test", "")
    except (ValueError, AttributeError):
        script = ""
    if isinstance(script, str) and script and "no test specified" not in script:
        return [["npm", "test"]]
    if (root / "Cargo.toml").exists():
        return [["cargo", "test"]]
    if (root / "go.mod").exists():
        return [["go", "test", "./..."]]
    tests = sorted(root.glob("test*.py")) or sorted(root.glob("tests/test*.py"))
    if ((root / "pytest.ini").exists() or (root / "conftest.py").exists() or "[tool.pytest" in text("pyproject.toml")
            or "[tool:pytest]" in text("setup.cfg")
            or tests and not any("unittest" in path.read_text(encoding="utf-8", errors="replace") for path in tests)):
        return [["python3", "-m", "pytest"]]
    if not tests:
        return []
    if tests[0].parent == root or (root / "tests" / "__init__.py").exists():
        return [["python3", "-m", "unittest"]]
    return [["python3", "-m", "unittest", "discover", "-s", "tests"]]


def _write_sample(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as stream:
            stream.write(content)
    except FileExistsError:
        pass
