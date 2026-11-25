"""Load project settings and install the bundled templates without overwriting edits."""

from dataclasses import dataclass, field, replace
from importlib.resources import files
import json
import os
import re
from pathlib import Path
import tomllib
from urllib.parse import urlsplit

from .ledger import SECRET_NAME
from .roles import Interrupt, WorkflowError


CONFIG_NAME = "artemis.toml"
STATE = Path(".artemis")
DEFAULT_LEDGER = STATE / "ledger.db"


def command(value: object, field_name: str) -> tuple[str, ...]:
    if (not isinstance(value, list) or not value or not value[0]
            or not all(isinstance(arg, str) and "\0" not in arg for arg in value)):
        raise WorkflowError(f"{field_name} needs a command argument array.")
    return tuple(value)


def ledger_path(root: Path) -> Path:
    return root.resolve() / DEFAULT_LEDGER


def repo_name(root: Path) -> str:
    """A project name made from a folder name: letters, digits, '.', '-' and '_'."""
    return re.sub(r"[^\w.-]+", "-", root.resolve().name).strip("-")[:64] or "project"


def repo_project(ledger, root: Path) -> int:
    """The ledger's project for this checkout, registered on first use."""
    from .roles import Role
    return ledger.add_project(Role.OWNER, repo_name(root), "repo", root.resolve())


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
        return cls(model, base_url_setting(base_url), key_env)


def base_url_setting(base_url: str) -> str:
    """An API base URL: HTTPS, or HTTP to this machine only; no credentials, query or fragment."""
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
    return base_url.rstrip("/")


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
    pass_env: tuple[str, ...] = ()

    @classmethod
    def load(cls, root: Path) -> "Config":
        root = root.resolve()
        try:
            with (root / CONFIG_NAME).open("rb") as stream:
                data = tomllib.load(stream)
        except FileNotFoundError:
            raise WorkflowError(f"{root.name} has no {CONFIG_NAME}. Add it: artemis project add {root}") from None
        except (ValueError, OSError):
            raise WorkflowError(f"Could not read {CONFIG_NAME} as TOML.") from None

        asks = _table(data.get("interrupts", {}), "interrupts").get("ask", [])
        if not isinstance(asks, list) or any(item not in list(Interrupt) for item in asks):
            raise WorkflowError(f"interrupts.ask lists only: {', '.join(Interrupt)}.")
        ship = _table(data.get("ship"), "ship")
        checks = ship.get("checks", [])
        if not isinstance(checks, list):
            raise WorkflowError("ship.checks needs a list of commands.")
        pass_env = ship.get("pass_env", [])
        if not isinstance(pass_env, list) or not all(isinstance(name, str) and name for name in pass_env):
            raise WorkflowError("ship.pass_env needs a list of environment variable names.")
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
                   opencode_model, api, tuple(pass_env))

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


# The home's settings: ARTEMIS_HOME/config.toml, seeded from templates/config.toml on first use.

PROVIDERS = ("claude", "codex", "gemini", "opencode", "api", "mock")
LEADS = ("claude", "codex", "api", "mock")
TASK_KINDS = ("code", "host", "review", "research", "docs")


@dataclass(frozen=True)
class ServeSettings:
    port: int = 7411


@dataclass(frozen=True)
class AgentSettings:
    lead: str = "auto"
    worker: str = "auto"
    max_workers: int = 4
    worker_minutes: int = 20
    caps: dict[str, int] = field(default_factory=lambda: {"claude": 2, "codex": 2, "gemini": 1, "opencode": 1,
                                                           "api": 2, "mock": 4})

    def cap(self, provider: str) -> int:
        return self.caps.get(provider, self.max_workers)


@dataclass(frozen=True)
class PlacementSettings:
    """Task kind -> providers in order of preference. Read as placement.code or placement["code"]. A task waits
    when every listed provider is busy; it never moves to a provider that is not listed."""
    code: tuple[str, ...] = ("codex", "claude", "opencode")
    review: tuple[str, ...] = ("claude", "codex", "gemini")
    research: tuple[str, ...] = ("gemini", "claude", "codex")
    docs: tuple[str, ...] = ("claude", "gemini", "codex")
    host: tuple[str, ...] = ("claude", "codex", "api")

    def __getitem__(self, kind: str) -> tuple[str, ...]:
        if kind not in TASK_KINDS:
            raise KeyError(kind)
        return getattr(self, kind)


@dataclass(frozen=True)
class LeadSettings:
    wake_per_hour: int = 6
    history: int = 20
    max_turn_minutes: int = 5


@dataclass(frozen=True)
class RunSettings:
    timeout_s: int = 600
    wrap: tuple[str, ...] = ()
    batch_ok: tuple[str, ...] = ("npm", "npx", "pnpm", "yarn")   # Windows .cmd/.bat programs `run` may start


@dataclass(frozen=True)
class VaultSettings:
    unlock: str = "keyring"   # keyring | passphrase | env (ARTEMIS_VAULT_PASSPHRASE, for CI and headless machines)


@dataclass(frozen=True)
class CardSettings:
    phone_only: tuple[str, ...] = ("money out",)   # card kinds only a paired phone may approve


@dataclass(frozen=True)
class EndpointSettings:
    base_url: str = "https://api.openai.com/v1"
    model: str = ""
    key: str = "OPENAI_API_KEY"   # the NAME of a vault secret, never a value


@dataclass(frozen=True)
class ModelSettings:
    model: str = ""


@dataclass(frozen=True)
class InterruptSettings:
    ask: tuple[str, ...] = tuple(Interrupt)


LIMITS = {"port": (1, 65535), "max_workers": (1, 64), "worker_minutes": (1, 24 * 60), "wake_per_hour": (0, 3600),
          "history": (1, 1000), "max_turn_minutes": (1, 24 * 60), "timeout_s": (1, 24 * 3600)}
UNLOCKS = ("keyring", "passphrase", "env")


def _section(name: str, kind: type, table: object):
    """Read one [section] into its dataclass. Every key is known and has the default's type."""
    table = _table(table, name)
    defaults = kind()
    known = {item.name for item in kind.__dataclass_fields__.values()}
    for key in table:
        if key not in known:
            raise WorkflowError(f"config.toml: unknown field {name}.{key}.")
    values = {}
    for key, value in table.items():
        default, where = getattr(defaults, key), f"{name}.{key}"
        if isinstance(default, int):
            low, high = LIMITS[key]
            if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
                raise WorkflowError(f"config.toml: {where} needs a whole number from {low} to {high}.")
        elif isinstance(default, str):
            if not isinstance(value, str) or "\0" in value:
                raise WorkflowError(f"config.toml: {where} needs a string.")
        elif isinstance(default, tuple):
            if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
                raise WorkflowError(f"config.toml: {where} needs a list of names.")
            value = tuple(value)
        elif isinstance(default, dict):
            value = _table(value, where)
            if not all(isinstance(v, int) and not isinstance(v, bool) and v >= 1 for v in value.values()):
                raise WorkflowError(f"config.toml: {where} needs whole numbers of at least 1.")
            value = dict(value)
        values[key] = value
    return kind(**values)


def _providers(names, where: str, extra: tuple[str, ...] = ()) -> None:
    for name in names:
        if name not in PROVIDERS + extra:
            raise WorkflowError(f"config.toml: {where} names {name!r}; choose from {', '.join(PROVIDERS + extra)}.")


@dataclass(frozen=True)
class HomeConfig:
    serve: ServeSettings = field(default_factory=ServeSettings)
    agents: AgentSettings = field(default_factory=AgentSettings)
    placement: PlacementSettings = field(default_factory=PlacementSettings)
    lead: LeadSettings = field(default_factory=LeadSettings)
    run: RunSettings = field(default_factory=RunSettings)
    vault: VaultSettings = field(default_factory=VaultSettings)
    cards: CardSettings = field(default_factory=CardSettings)
    api: EndpointSettings = field(default_factory=EndpointSettings)
    gemini: ModelSettings = field(default_factory=ModelSettings)
    opencode: ModelSettings = field(default_factory=ModelSettings)
    interrupts: InterruptSettings = field(default_factory=InterruptSettings)

    @classmethod
    def load(cls, paths) -> "HomeConfig":
        """Read ARTEMIS_HOME/config.toml, writing the commented template there first if it is missing.

        ARTEMIS_LEAD and ARTEMIS_WORKER override [agents]; ARTEMIS_WORKER also puts that one worker first
        for every task kind, which is how a demo or a test runs on the mock alone.
        """
        _write_sample(paths.config, files("artemis.templates").joinpath("config.toml").read_text(encoding="utf-8"))
        try:
            with paths.config.open("rb") as stream:
                data = tomllib.load(stream)
        except (ValueError, OSError):
            raise WorkflowError(f"Could not read {paths.config} as TOML.") from None
        sections = {item.name: item.default_factory for item in cls.__dataclass_fields__.values()}
        for name in data:
            if name not in sections:
                raise WorkflowError(f"config.toml: unknown section [{name}].")
        parts = {name: _section(name, kind, data.get(name, {})) for name, kind in sections.items()}
        agents = parts["agents"]
        for role in ("lead", "worker"):
            chosen = os.environ.get(f"ARTEMIS_{role.upper()}")
            if chosen:
                agents = replace(agents, **{role: chosen})
        if agents.lead not in ("auto", *LEADS):
            raise WorkflowError(f"config.toml: agents.lead names {agents.lead!r}; choose from auto, {', '.join(LEADS)}.")
        _providers([agents.worker], "agents.worker", ("auto",))
        _providers(agents.caps, "agents.caps")
        placement = parts["placement"]
        for kind in TASK_KINDS:
            _providers(placement[kind], f"placement.{kind}")
        if os.environ.get("ARTEMIS_WORKER"):
            placement = PlacementSettings(**{kind: (agents.worker,) for kind in TASK_KINDS})
        for where, kinds in (("interrupts.ask", parts["interrupts"].ask), ("cards.phone_only", parts["cards"].phone_only)):
            if any(item not in list(Interrupt) for item in kinds):
                raise WorkflowError(f"config.toml: {where} lists only: {', '.join(Interrupt)}.")
        if parts["vault"].unlock not in UNLOCKS:
            raise WorkflowError(f"config.toml: vault.unlock is one of {', '.join(UNLOCKS)}.")
        api = parts["api"]
        if not SECRET_NAME.fullmatch(api.key):
            raise WorkflowError("config.toml: api.key names a vault secret in capitals, like OPENAI_API_KEY.")
        api = replace(api, base_url=base_url_setting(api.base_url))
        return cls(**{**parts, "agents": agents, "placement": placement, "api": api})


_TABLE = re.compile(r"\s*\[([^\]]*)\]\]?\s*(#.*)?")            # [agents], [agents.caps], [[x]]
_LEAD = re.compile(r"""(\s*lead\s*=\s*)("(?:[^"\\\r\n]|\\.)*"|'[^'\r\n]*')(.*)""", re.S)


def write_lead(path: Path, name: str) -> None:
    """Set [agents] lead in a home's config.toml to name, changing that one line: every comment and every other
    line stays as it is. Without the line, it goes first under [agents]; without [agents], that table goes at the
    end. The file is replaced whole, so a reader never sees half of it."""
    if name not in ("auto", *LEADS):
        raise WorkflowError(f"agents.lead is one of: auto, {', '.join(LEADS)}.")
    raw = path.read_bytes() if path.exists() else b""
    lines = raw.decode("utf-8").splitlines(keepends=True)
    newline = "\r\n" if lines and lines[0].endswith("\r\n") else "\n"
    if lines and not lines[-1].endswith(("\n", "\r")):
        lines[-1] += newline
    table, start, found = None, None, False
    for index, line in enumerate(lines):
        header = _TABLE.fullmatch(line.rstrip("\r\n"))
        if header:
            table = header.group(1).strip()
            start = index if table == "agents" else start
            continue
        setting = _LEAD.fullmatch(line.rstrip("\r\n")) if table == "agents" else None
        if setting:
            ending = line[len(line.rstrip("\r\n")):]
            lines[index] = f'{setting.group(1)}"{name}"{setting.group(3)}{ending}'
            found = True
            break
    if not found and start is not None:
        lines.insert(start + 1, f'lead = "{name}"{newline}')
    elif not found:
        lines.append(f'{newline}[agents]{newline}lead = "{name}"{newline}')
    text = "".join(lines)
    try:
        written = tomllib.loads(text).get("agents", {}).get("lead")
    except tomllib.TOMLDecodeError:
        written = None
    if written != name:
        raise WorkflowError(f"Could not set the lead in {path}: its [agents] lead line is written in a way this "
                            "edit does not know. Set it there by hand.")
    scratch = path.with_name(path.name + ".new")
    scratch.write_bytes(text.encode("utf-8"))
    os.replace(scratch, path)
