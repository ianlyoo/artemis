"""Load project settings and install the bundled samples without overwriting edits."""

from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path
import tomllib

from .roles import OwnerAction, Role, WorkflowError


CONFIG_NAME = "harness.toml"
DEFAULT_LEDGER = Path(".harness/ledger.db")


def command(value: object, field: str) -> tuple[str, ...]:
    if (not isinstance(value, list) or not value or not value[0]
            or not all(isinstance(arg, str) and "\0" not in arg for arg in value)):
        raise WorkflowError(f"{field} needs a command argument array.")
    return tuple(value)


def check_plan(value: object, field: str) -> tuple[tuple[str, ...], ...]:
    if not isinstance(value, list) or not value:
        raise WorkflowError(f"{field} needs at least one command.")
    return tuple(command(item, field) for item in value)


def _inside(root: Path, value: object, field: str) -> Path:
    if isinstance(value, str) and value and "\0" not in value:
        path = Path(value)
        target = (root / path).resolve()
        if not path.is_absolute() and target != root and target.is_relative_to(root):
            return target
    raise WorkflowError(f"{field} needs a relative path inside the project.")


def _table(value: object, field: str) -> dict:
    if not isinstance(value, dict):
        raise WorkflowError(f"{field} needs a TOML table.")
    return value


@dataclass(frozen=True)
class RoleSettings:
    runbook: Path
    run: tuple[str, ...] | None = None

    def instructions(self) -> str:
        try:
            text = tomllib.loads(self.runbook.read_text(encoding="utf-8")).get("instructions")
        except (ValueError, OSError):
            raise WorkflowError("The role needs a readable TOML runbook.") from None
        if not isinstance(text, str) or not text.strip():
            raise WorkflowError("The role runbook needs an instructions string.")
        return text


@dataclass(frozen=True)
class Config:
    root: Path
    ledger: Path
    owner_actions: frozenset[OwnerAction]
    checks: tuple[tuple[str, ...], ...]
    roles: dict[Role, RoleSettings]

    @classmethod
    def load(cls, root: Path) -> "Config":
        root = root.resolve()
        try:
            with (root / CONFIG_NAME).open("rb") as stream:
                data = tomllib.load(stream)
        except FileNotFoundError:
            raise WorkflowError("Run harness init in this project first.") from None
        except (ValueError, OSError):
            raise WorkflowError("Could not read harness.toml as TOML.") from None

        ledger = _inside(root, data.get("ledger"), "ledger")
        kinds = data.get("owner_actions")
        if not isinstance(kinds, list) or any(item not in list(OwnerAction) for item in kinds):
            raise WorkflowError("owner_actions needs a list of known owner action kinds.")
        ship = _table(data.get("ship"), "ship")
        roles = _table(data.get("roles"), "roles")
        if roles.keys() != set(Role):
            raise WorkflowError("roles needs one entry for each harness role.")
        settings = {}
        for role in Role:
            source = _table(roles[role], f"roles.{role}")
            book = _inside(root, source.get("runbook"), f"roles.{role}.runbook")
            run = None
            if "run" in source:
                if role is not Role.WORKER:
                    raise WorkflowError("Only roles.worker can configure a submission command.")
                run = command(source["run"], "roles.worker.run")
            settings[role] = RoleSettings(book, run)
        return cls(root, ledger, frozenset(map(OwnerAction, kinds)),
                   check_plan(ship.get("checks"), "ship.checks"), settings)

    @classmethod
    def initialize(cls, root: Path) -> "Config":
        root.mkdir(parents=True, exist_ok=True)
        template = files("harness.examples").joinpath(CONFIG_NAME)
        _write_sample(root / CONFIG_NAME, template.read_text(encoding="utf-8"))
        config = cls.load(root)
        cards = files("harness.runbooks")
        for role, settings in config.roles.items():
            content = cards.joinpath(f"{role}.toml").read_text(encoding="utf-8")
            _write_sample(settings.runbook, content)
        return config


def _write_sample(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as stream:
            stream.write(content)
    except FileExistsError:
        pass
