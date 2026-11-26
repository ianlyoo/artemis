"""The broker: every tool an agent uses on this computer, carried out inside the home process.

`artemis mcp` (mcp.py) forwards each tool call here over loopback HTTP with its run's token. The token names one
run, so the broker knows the task, the project and its folders, and whether the caller is a worker or the lead.
Each call is checked against that role's tools and the tool's schema, kept inside the project's folders and away
from Artemis's own folder, .env files, ~/.ssh and ~/.aws, recorded in the ledger, and scrubbed of every secret
value before its result leaves.

`run` follows one pipeline, in this order: stop → folder scope → deny list → rules.toml and the kinds of the secrets
it uses → a standing approval, or a card for the person when [interrupts] asks for that kind → the command, with
only the named secrets in its environment → scrubbed output → ledger record.
"""

import codecs
from dataclasses import asdict, dataclass
from datetime import datetime
import io
import json
import os
from pathlib import Path, PureWindowsPath
import re
import shutil
import subprocess
import threading
import time

from . import boards, guard, httpop, lessons, undo
from .judge import Criterion, capture, within
from .process import check_env, executable, group, join_command, kill_tree, split_command
from .roles import Interrupt, Role, WorkflowError
from .schedule import next_after
from .vault import VaultLocked

HANDOFF_S = 45                  # a command still running after this comes back as a job
OUTPUT_CAP = 64 * 1024          # characters of output kept: the tail
READ_CAP = 256 * 1024           # bytes read_file returns unless asked for fewer
LIST_CAP = 500                  # entries list_dir returns
SEARCH_CAP = 200                # lines search returns
SEARCH_FILE_CAP = 4 * 1024 * 1024
CARD_TTL_S = 7 * 24 * 3600      # a held command's card expires unanswered after a week
BATCH_OK = ("npm", "npx", "pnpm", "yarn")
BATCH_UNSAFE = re.compile(r'[%^&|<>"]')
ORIGIN = re.compile(r"https://[^/\s?#@]+|http://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?")
DOES = {Interrupt.SEND: "send as you", Interrupt.DELETE: "delete for good", Interrupt.SPEND: "spend money"}
ORDER = (Interrupt.SPEND, Interrupt.DELETE, Interrupt.SEND)     # the strongest kind first


class ToolError(Exception):
    """A refusal or failure the agent reads as one plain sentence."""


# Tool descriptors

def _object(required: tuple[str, ...] = (), **properties) -> dict:
    return {"type": "object", "properties": properties, "required": list(required), "additionalProperties": False}


STR, INT, BOOL = {"type": "string"}, {"type": "integer"}, {"type": "boolean"}
NAME = {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{0,63}$"}
PROJECT = {"type": ["integer", "string"], "description": "The project's number or name."}
LIST = {"type": "array", "items": STR, "maxItems": 20}
OPTIONS = {"type": "array", "minItems": 2, "maxItems": 8, "items": _object(
    ("id", "label"), id=STR,
    label={"type": "string", "maxLength": 20, "description": "The words on its button, at most 20 characters."},
    line={"type": "string", "maxLength": 200, "description": "One line under the button, for what the label cannot hold."})}
HOST_CHECKS = {"type": "array", "maxItems": 20, "items": _object(
    ("type", "path"), type={"enum": ["exists", "contains", "count", "preserved"]}, path=STR, text=STR,
    min={"type": "integer", "minimum": 1}, to=STR)}
TASK_KINDS = {"enum": ["code", "host", "review", "research", "docs"]}
MAX_BYTES = {"type": "integer", "minimum": 1, "maximum": 1024 * 1024}
SECRET_REQUEST = _object(("name", "why", "use"), name=NAME, why=STR, use={"enum": ["http", "env"]}, origin=STR,
                         kind={"enum": ["none", "send", "spend"]})
CHOICE = _object(("kind", "what", "why", "options"), kind={"enum": ["choice"]}, what=STR, why=STR, options=OPTIONS)
BOARD = _object(("title", "blocks"), id={"type": "string", "maxLength": 96},
                title={"type": "string", "maxLength": 200},
                layout=_object(width={"enum": ["narrow", "wide", "full"]}),
                blocks={"type": "array", "minItems": 1, "maxItems": 200, "items": {"type": "object"}})
BOARD_DESC = ("Publish or replace a board shown in the Artemis App. Give title and blocks (type in heading, text, "
              "table, chart, timeline, code, notes, answer, step, secret — secret names a vault secret in key, "
              "never its value). Pass the same id to replace a board, or omit id for a new one.")
LEAD_ASK = _object(("kind", "what", "why"), kind={"enum": ["choice", "step"]}, what=STR, why=STR,
                   options=OPTIONS, link=STR, project=PROJECT)
CHECKS_TEXT = ("checks are commands that must exit 0 (one command each, no shell); files must exist in the commit; "
               "host_checks look at a folder project: exists {path} (and changed since the start), contains "
               "{path, text}, count {path: a folder or glob, min}, preserved {path: the files at the start, to: "
               "where every one of them must be, byte for byte}. A path is relative to the project's folder; one in "
               "a folder the project reaches (project add --root) is given as its absolute path.")


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    schema: dict
    handler: str

    def descriptor(self) -> dict:
        return {"name": self.name, "description": self.description, "inputSchema": self.schema}


WORKER = (
    Tool("run", "Run one program on this computer, as the person. argv is the program and its arguments; no shell "
         "is started unless you name one, and inline shell commands are refused unless the project allows them. "
         "cwd is relative to the project. env_secrets maps a vault secret to an environment variable, "
         "{\"OPENAI_API_KEY\": \"OPENAI_API_KEY\"}; stdin_secret sends one secret on stdin. Returns within 45 s; a "
         "longer command returns state \"running\" with a job number. State \"held\" means the person was asked on "
         "a card: do not retry it or work around it, report it.",
         _object(("argv",), argv={"type": "array", "items": STR, "minItems": 1, "maxItems": 1000}, cwd=STR,
                 timeout_s={"type": "integer", "minimum": 1, "maximum": 24 * 3600},
                 env_secrets={"type": "object", "propertyNames": NAME, "maxProperties": 20,
                              "additionalProperties": {"type": "string", "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"}},
                 stdin_secret=NAME, background=BOOL), "_run"),
    Tool("job", "Wait up to wait_s seconds (at most 45) for a job and return its state and output so far.",
         _object(("job",), job=INT, wait_s={"type": "integer", "minimum": 0, "maximum": 45}), "_job"),
    Tool("job_stop", "Stop a job and everything it started.", _object(("job",), job=INT), "_job_stop"),
    Tool("http_request", "Make one HTTP request. Name a vault secret in `secret` and Artemis adds it to the request "
         "itself, only for the website it belongs to; you never see it. A request that sends as the person can come "
         "back \"held\": do not retry it, report it. save_to writes the response body to a file in the project. "
         "purpose says what the request does in plain words, like \"Post the weekly summary to the team channel\": "
         "it is the title of the card the person answers.",
         _object(("method", "url"), method={"enum": ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]}, url=STR,
                 headers={"type": "object", "additionalProperties": STR, "maxProperties": 50},
                 body={"type": "string", "maxLength": 1024 * 1024}, secret=NAME, save_to=STR,
                 purpose={"type": "string", "maxLength": 200}), "_http_request"),
    Tool("read_file", "Read a text file in the project (the first 256 KB, or max_bytes).",
         _object(("path",), path=STR, max_bytes=MAX_BYTES), "_read_file"),
    Tool("list_dir", "List a folder in the project (at most 500 entries), optionally only names matching glob.",
         _object(("path",), path=STR, glob=STR), "_list_dir"),
    Tool("search", "Find lines matching a regular expression in the project's text files (at most 200 lines).",
         _object(("pattern",), pattern=STR, path=STR), "_search"),
    Tool("write_file", "Write a text file in a folder project. What it replaces is kept for undo.",
         _object(("path", "content"), path=STR, content=STR), "_write_file"),
    Tool("move", "Move or rename a file or folder in a folder project. Undoable.",
         _object(("src", "dst"), src=STR, dst=STR), "_move"),
    Tool("trash", "Move a file or folder in a folder project to the task's undo folder. Nothing is deleted.",
         _object(("path",), path=STR), "_trash"),
    Tool("secret_names", "The secrets in the vault: name, use (http: Artemis sends it to its website; env: run can "
         "give it to a program), kind and note. Never their values.", _object(), "_secret_names"),
    Tool("secret_request", "Ask the person to add a secret the vault lacks. use is http (give the origin, like "
         "https://api.example.com) or env. Returns the card number.", SECRET_REQUEST, "_secret_request"),
    Tool("ask", "Put a choice to the person. Returns the card number; the answer arrives in a later attempt.", CHOICE,
         "_ask"),
    Tool("note", "Record a short note on this task.", _object(("text",), text=STR), "_note"),
    Tool("board", BOARD_DESC, BOARD, "_board"),
    Tool("check", "Run your task's check number `number` (from 1) now, the way the judge will, and say whether it "
         "passes.", _object(("number",), number={"type": "integer", "minimum": 1}), "_check"),
)

LEAD = (
    Tool("projects", "Every project: number, name, kind (repo or folder), path and counts.", _object(),
         "_projects"),
    Tool("status", "Counts, tasks and waiting cards, for one project or all.", _object(project=PROJECT),
         "_status"),
    Tool("evidence", "One task: brief, checks, state, the latest claim with its evidence and verdict, recent "
         "events and cards.", _object(("task",), task=INT), "_evidence"),
    Tool("read_file", "Read a text file in a project (the first 256 KB, or max_bytes).",
         _object(("project", "path"), project=PROJECT, path=STR, max_bytes=MAX_BYTES), "_lead_read_file"),
    Tool("list_dir", "List a folder in a project (at most 500 entries), optionally only names matching glob.",
         _object(("project", "path"), project=PROJECT, path=STR, glob=STR), "_lead_list_dir"),
    Tool("search", "Find lines matching a regular expression in a project's text files (at most 200 lines).",
         _object(("project", "pattern"), project=PROJECT, pattern=STR, path=STR), "_lead_search"),
    Tool("task_create", "Give workers a task. " + CHECKS_TEXT,
         _object(("project", "title", "brief", "kind"), project=PROJECT, title=STR, brief=STR, kind=TASK_KINDS,
                 checks=LIST, files=LIST, host_checks=HOST_CHECKS, provider=STR, review=BOOL), "_task_create"),
    Tool("task_retry", "Run a stuck task again with feedback for the next attempt.",
         _object(("task", "feedback"), task=INT, feedback=STR), "_task_retry"),
    Tool("task_drop", "Give up a task, with the reason.", _object(("task", "reason"), task=INT, reason=STR),
         "_task_drop"),
    Tool("schedule", "Repeat a task, in this computer's local time: 'at 2026-12-01T09:00', 'every 6h', "
         "'every 1d at 08:30', 'weekly fri 18:00'. " + CHECKS_TEXT,
         _object(("project", "title", "brief", "kind", "spec"), project=PROJECT, title=STR, brief=STR,
                 kind=TASK_KINDS, spec=STR, checks=LIST, files=LIST, host_checks=HOST_CHECKS), "_schedule"),
    Tool("ask", "Put a choice or a hand-done step to the person on a card. A choice needs options; a step is "
         "something only the person can do by hand (optionally with a link). Returns the card number.",
         LEAD_ASK, "_ask"),
    Tool("secret_request", "Ask the person to add a secret the vault lacks. use is http (give the origin) or env. "
         "Returns the card number.", SECRET_REQUEST, "_secret_request"),
    Tool("lesson", "Propose a lesson: a rule for prompts, a check, a guard pattern or a placement change. It applies "
         "once it is proven or the person agrees.",
         _object(("kind", "text"), kind={"enum": ["rule", "check", "guard", "placement"]},
                 text={"type": "string", "maxLength": 200}, payload={"type": "object"}, project=PROJECT),
         "_lesson"),
    Tool("note", "Record your own reading of the situation (shown as inferred).", _object(("text",), text=STR),
         "_note"),
    Tool("board", BOARD_DESC, BOARD, "_board"),
)

TOOLS = {"worker": {tool.name: tool for tool in WORKER}, "lead": {tool.name: tool for tool in LEAD}}
RUN_TOOLS = {"run", "job", "job_stop"}


def _validate(value, schema: dict, where: str) -> None:
    """The subset of JSON Schema the tool descriptors use."""
    types = schema.get("type")
    types = [types] if isinstance(types, str) else types or []
    if types and not any(_is(value, name) for name in types):
        raise ToolError(f"{where} must be {' or '.join(types)}.")
    if "enum" in schema and value not in schema["enum"]:
        raise ToolError(f"{where} must be one of: {', '.join(map(str, schema['enum']))}.")
    if isinstance(value, str):
        if "\0" in value or len(value) > schema.get("maxLength", len(value)):
            raise ToolError(f"{where} is too long or holds a NUL character.")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            raise ToolError(f"{where} does not have the right form: {_clip(value, 80)!r}.")
    elif _is(value, "integer"):
        if not schema.get("minimum", value) <= value <= schema.get("maximum", value):
            raise ToolError(f"{where} must be between {schema.get('minimum', '…')} and {schema.get('maximum', '…')}.")
    elif isinstance(value, list):
        if not schema.get("minItems", 0) <= len(value) <= schema.get("maxItems", len(value)):
            raise ToolError(f"{where} needs {schema.get('minItems', 0)} to {schema.get('maxItems', '…')} items.")
        for number, item in enumerate(value):
            _validate(item, schema.get("items", {}), f"{where}[{number}]")
    elif isinstance(value, dict):
        properties, extra = schema.get("properties", {}), schema.get("additionalProperties", True)
        if len(value) > schema.get("maxProperties", len(value)):
            raise ToolError(f"{where} has too many fields.")
        for name in schema.get("required", ()):
            if name not in value:
                raise ToolError(f"{where} needs {name!r}.")
        for name, item in value.items():
            if "propertyNames" in schema:
                _validate(name, schema["propertyNames"], f"{where} key")
            if name in properties:
                _validate(item, properties[name], f"{where}.{name}")
            elif extra is False:
                raise ToolError(f"{where} has no field {name!r}.")
            elif isinstance(extra, dict):
                _validate(item, extra, f"{where}.{name}")


def _is(value, name: str) -> bool:
    kinds = {"string": str, "array": list, "object": dict, "boolean": bool}
    if name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, kinds[name])


# Running commands

class _Process:
    """One command: the child, the tail of its output scrubbed as it streams, its time limit and the stop."""

    def __init__(self, command: list[str], cwd: Path, env: dict[str, str], stdin: str | None, timeout: int,
                 stream, halt):
        self.popen = subprocess.Popen(
            command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL if stdin is None else subprocess.PIPE, **group())
        self.output, self.exit_code, self.ended_by = "", None, ""
        self.done = threading.Event()
        self._stream, self._lock = stream, threading.Lock()
        if stdin is not None:
            threading.Thread(target=self._feed, args=(stdin,), daemon=True).start()
        threading.Thread(target=self._pump, daemon=True).start()
        threading.Thread(target=self._watch, args=(timeout, halt), daemon=True).start()

    def _feed(self, text: str) -> None:
        try:
            with self.popen.stdin as pipe:
                pipe.write(text.encode("utf-8"))
        except OSError:         # the child exited without reading it all
            pass

    def _pump(self) -> None:
        # the one place output becomes text: UTF-8, with every line end as \n on every OS (a Windows program
        # writes \r\n; a lone \r, as in a progress line, starts a new line), before the scrubber reads it
        decoder = io.IncrementalNewlineDecoder(codecs.getincrementaldecoder("utf-8")(errors="replace"), translate=True)
        while chunk := self.popen.stdout.read1(65536):
            self._add(self._stream.feed(decoder.decode(chunk)))
        self._add(self._stream.feed(decoder.decode(b"", final=True)) + self._stream.flush())
        self.popen.stdout.close()
        self.exit_code = self.popen.wait()
        self.done.set()

    def _add(self, text: str) -> None:
        with self._lock:
            self.output = (self.output + text)[-OUTPUT_CAP:]

    def _watch(self, timeout: int, halt) -> None:
        deadline = time.monotonic() + timeout
        while not self.done.wait(min(1.0, timeout)):
            reason = f"it ran past its {timeout} s limit" if time.monotonic() > deadline else halt()
            if reason:
                self.stop(reason)
                return

    def stop(self, reason: str) -> None:
        if not self.done.is_set():
            self.ended_by = self.ended_by or reason
            kill_tree(self.popen)

    def result(self) -> dict:
        if not self.done.is_set():
            return {"state": "running", "output": self.output}
        note = f"\n[Artemis stopped it: {self.ended_by}.]" if self.ended_by else ""
        return {"state": "done", "exit_code": self.exit_code, "output": (self.output + note)[-OUTPUT_CAP:]}


@dataclass(frozen=True)
class _Command:
    """A command exactly as a card records it and its approval runs it."""
    argv: list[str]
    cwd: Path
    env_secrets: dict[str, str]     # secret name -> environment variable
    stdin_secret: str | None

    @property
    def names(self) -> list[str]:
        return sorted({*self.env_secrets, *([self.stdin_secret] if self.stdin_secret else [])})

    def options(self) -> dict | None:
        mapped = {"env_secrets": self.env_secrets, "stdin_secret": self.stdin_secret}
        return {key: value for key, value in mapped.items() if value} or None

    @classmethod
    def from_card(cls, row) -> "_Command":
        options = json.loads(row["options"]) if row["options"] else {}
        return cls(json.loads(row["command"]), Path(row["cwd"]), options.get("env_secrets", {}),
                   options.get("stdin_secret"))


@dataclass(frozen=True)
class _Flags:
    """A project's settings beyond the defaults, from its ledger row."""
    shell: bool = False                 # a shell may be given an inline command
    no_run: bool = False                # its workers have no run or job tool
    allowed_roots: tuple[str, ...] = ()  # absolute folders its workers reach besides its own

    @classmethod
    def of(cls, row) -> "_Flags":
        keys = row.keys()
        return cls(bool(row["shell"]) if "shell" in keys else False,
                   bool(row["no_run"]) if "no_run" in keys else False,
                   tuple(json.loads(row["allowed_roots"])) if "allowed_roots" in keys else ())


def _clip(text: str, room: int = 160) -> str:
    return text if len(text) <= room else text[:room - 1] + "…"


def _shown(path: Path) -> str:
    try:
        return "~/" + path.relative_to(Path.home()).as_posix()
    except ValueError:
        return str(path)


def _real(path) -> Path:
    return Path(os.path.realpath(path))


def _under(path: Path, folder: Path) -> bool:
    """Whether `path` is `folder` or inside it, ignoring case: used only to refuse, so it may refuse more."""
    return Path(str(path).casefold()).is_relative_to(Path(str(folder).casefold()))


def _argv(text: str) -> tuple[str, ...]:
    words = split_command(text)
    if not words or any(word in {"|", "||", "&&", ";", "&", ">", ">>", "<"} for word in words):
        raise ToolError(f"A check is one command without a shell: {text!r}. Give each command its own check.")
    return tuple(words)


def _criteria(checks=(), files=(), host_checks=()) -> tuple[Criterion, ...]:
    items = [Criterion(text, command=_argv(text)) for text in checks]
    items += [Criterion(path, artifact=path) for path in files]
    for check in host_checks:
        path, kind = check["path"], check["type"]
        if kind == "contains" and not check.get("text"):
            raise ToolError(f"The contains check on {path} needs its text.")
        if kind == "preserved" and not check.get("to"):
            raise ToolError(f"The preserved check on {path} needs `to`: where the files must end up.")
        if kind == "exists":
            items.append(Criterion(f"{path} exists and changed", exists=path))
        elif kind == "contains":
            items.append(Criterion(f"{path} contains {check['text']!r}", contains=(path, check["text"])))
        elif kind == "count":
            items.append(Criterion(f"at least {check.get('min', 1)} files in {path}",
                                   count=(path, check.get("min", 1))))
        else:
            items.append(Criterion(f"every file of {path} kept in {check['to']}", preserved=(path, check["to"])))
    return tuple(items)


class Broker:
    handoff_s = HANDOFF_S

    def __init__(self, home):
        self.home = home
        self.scrubber = home.vault.scrubber     # the vault's one scrubber; it rebuilds when the vault changes
        self._jobs: dict[int, _Process] = {}
        self._lock = threading.Lock()

    def tools(self, role: str, run: bool = True) -> list[dict]:
        """The MCP descriptors of a role's tools; without `run` (a no-run project) there is no run or job."""
        return [tool.descriptor() for tool in TOOLS[role].values() if run or tool.name not in RUN_TOOLS]

    def call(self, token: str, tool: str, args: dict) -> dict | list:
        """Carry out one tool call for the run that holds `token`. Raises ToolError with a plain sentence, or
        VaultLocked when the call needs a secret while the vault is locked (the home answers that with 423)."""
        grant = self.home.grant_for(token)
        if grant is None:
            raise ToolError("This run has ended.")
        try:
            no_run = grant.role == "worker" and self._flags(grant.project).no_run
            if tool == "tools/list":        # the MCP shim learns this run's tools through the same door
                return {"tools": self.tools(grant.role, run=not no_run)}
            spec = TOOLS[grant.role].get(tool)
            if spec is None or (tool in RUN_TOOLS and no_run):
                raise ToolError(f"{tool} is not one of your tools.")
            if not isinstance(args, dict):
                raise ToolError(f"{tool} takes an object of arguments.")
            _validate(args, spec.schema, tool)
            # a value an agent somehow holds goes no further than this: not into a command, a file or the ledger
            return self._scrub(getattr(self, spec.handler)(grant, **self._scrub(args)))
        except VaultLocked:
            raise
        except (ToolError, WorkflowError, ValueError) as error:
            raise ToolError(self.scrubber.scrub(str(error))) from None
        except OSError as error:
            raise ToolError(self.scrubber.scrub(f"{tool} failed: {error.strerror or error}")) from None

    def standing_for(self, card: int) -> dict | None:
        """What a standing approval given on this card binds to, for ledger.decide_card(standing=...): its task's
        schedule, the exact request (method and URL) or command (argv and folder), and its one secret. None when the
        card cannot have one: money out, a card from a task no schedule made, or a command using several secrets."""
        row = self.home.ledger.card(card)
        schedule = self._schedule_of(row["task_id"])
        if row["kind"] == Interrupt.SPEND or row["command"] is None or schedule is None:
            return None
        if httpop.is_http(row):
            request, names = json.loads(row["command"]), json.loads(row["secrets"])
            return {"schedule": schedule, "url": request["url"], "method": request["method"],
                    "secret": names[0] if names else None}
        command = _Command.from_card(row)
        if len(command.names) > 1:
            return None
        return {"schedule": schedule, "argv": command.argv, "cwd": str(command.cwd),
                "secret": (command.names or [None])[0]}

    def run_card(self, card: int) -> None:
        """Carry out an approved card exactly once, a command or a web request; it ends done, failed or unknown.
        A card that uses a secret stays approved while the vault is locked, and so does every card while stopped."""
        ledger = self.home.ledger
        row = ledger.card(card)
        if row["command"] is None:      # a question or a secret request: there is nothing to carry out
            return
        if json.loads(row["secrets"]) and not self.home.vault.unlocked:
            return
        try:
            if not ledger.claim_card(Role.HOME, card):
                return
        except WorkflowError:
            return
        if httpop.is_http(row):
            try:
                state, result = httpop.dispatch(self.home, card)
            except VaultLocked as error:    # locked since the check above: it raises before sending
                state, result = "failed", f"{error} Nothing was sent."
            ledger.finish_card(Role.HOME, card, state, self.scrubber.scrub(result))
            return
        row = ledger.card(card)
        command = _Command.from_card(row)
        try:
            self._secrets(command.names)
            match = guard.classify(command.argv, row["shell"], self._rules(), cwd=command.cwd, shell_ok=True)
            if match.kind == "deny":
                raise ToolError(f"Artemis never runs this: {match.rule} (rules.toml).")
            process = self._start(command, self.home.config.run.timeout_s,
                                  lambda: "you stopped work" if ledger.stopped() else "")
        except (ToolError, ValueError, OSError) as error:
            ledger.finish_card(Role.HOME, card, "failed", self.scrubber.scrub(str(error)))
            return
        job = ledger.start_job(row["command"], row["cwd"], row["shell"], run=row["run_id"], task=row["task_id"],
                               card=card)
        for name in command.names:
            ledger.secret_used(name, "card", task=row["task_id"], run=row["run_id"], card=card)
        process.done.wait()
        result = process.result()
        ledger.end_job(job, result["exit_code"], result["output"])
        state = "unknown" if process.ended_by else "done" if result["exit_code"] == 0 else "failed"
        ledger.finish_card(Role.HOME, card, state, f"exit {result['exit_code']}\n{result['output']}"[-OUTPUT_CAP:])

    def recover(self) -> None:
        """On home start: cards and jobs the last home left running end as unknown. Nothing runs again."""
        ledger = self.home.ledger
        for row in ledger.cards(state="running"):
            if row["command"] is not None:
                ledger.finish_card(Role.HOME, row["id"], "unknown", "The home stopped while this ran. Check whether "
                                   "it took effect before asking for it again.")
        for row in ledger.jobs():
            if row["ended"] is None:
                ledger.end_job(row["id"], None, (row["output"] or "") + "\n[The home stopped while this ran.]")

    # Shared pieces

    def _scrub(self, value):
        if isinstance(value, str):
            return self.scrubber.scrub(value)
        if isinstance(value, list):
            return [self._scrub(item) for item in value]
        if isinstance(value, dict):
            return {key: self._scrub(item) for key, item in value.items()}
        return value

    def _record(self, grant, event: str, detail: str, *, card: int | None = None, **data) -> None:
        self.home.ledger.record(Role.HOME, event, self.scrubber.scrub(detail), project=grant.project,
                                task=grant.task, card=card, data=self._scrub({"run": grant.run, **data}))

    def _rules(self) -> guard.Rules:
        return guard.Rules.load(self.home.paths)

    def _flags(self, project: int) -> _Flags:
        return _Flags.of(self.home.ledger.project(project))

    def _roots(self, project: int, root=None) -> list[Path]:
        """The folders a project's agents reach, real: its own (or the task's worktree) first."""
        row = self.home.ledger.project(project)
        return [_real(row["path"] if root is None else root), *map(_real, _Flags.of(row).allowed_roots)]

    def _sensitive(self, roots: list[Path], target: Path) -> str:
        """Why `target` (a real path) is off limits to agents: "" when it is not."""
        worktree = roots[0] if _under(roots[0], _real(self.home.paths.work)) else None   # a repo task's own copy
        if _under(target, _real(self.home.paths.root)) and not (worktree and target.is_relative_to(worktree)):
            return "inside Artemis's own folder"
        user = _real(Path.home())
        for folder, what in ((".ssh", "your SSH keys"), (".aws", "your AWS credentials")):
            if _under(target, user / folder):
                return f"in {what} (~/{folder})"
        if any(part.casefold().startswith(".env") for part in target.parts):
            return "a .env file"
        return ""

    def _place(self, roots: list[Path], raw: str) -> Path:
        """`raw` as a real path inside one of `roots` (relative to the first), and not somewhere agents never go."""
        path = Path(raw or ".")
        if PureWindowsPath(raw).anchor and not path.is_absolute():
            raise ToolError(f"{raw} is not a path on this computer.")
        target = _real(path if path.is_absolute() else roots[0] / path)
        if not any(target.is_relative_to(root) for root in roots):
            raise ToolError(f"{raw} is outside the project.")
        if why := self._sensitive(roots, target):
            raise ToolError(f"{raw} is {why}, which agents do not touch.")
        return target

    def _named(self, roots: list[Path], target: Path) -> str:
        return target.relative_to(roots[0]).as_posix() if target.is_relative_to(roots[0]) else target.as_posix()

    def _project(self, project) -> tuple[int, list[Path]]:
        number = self.home.ledger.project(project)["id"]
        return number, self._roots(number)

    def _schedule_of(self, task: int | None) -> int | None:
        return None if task is None else self.home.ledger.work(task=task)[0]["schedule_id"]

    def _secrets(self, names: list[str]) -> dict:
        """The vault's record of each secret a command uses. Every one must exist and be for programs (env)."""
        found = {}
        for name in names:
            info = self.home.vault.info(name)
            if info is None:
                raise ToolError(f"There is no secret named {name}. Ask the person for it with secret_request.")
            if info.use != "env":
                raise ToolError(f"{name} is for a website: Artemis sends it itself with http_request, and no "
                                "program receives it.")
            found[name] = info
        return found

    def _halt(self, grant):
        """Why a command of this run must stop now: the person stopped work, or the run is over ("" if neither)."""
        ledger = self.home.ledger

        def reason() -> str:
            if ledger.stopped():
                return "you stopped work"
            row = ledger.work(task=grant.task)[0]
            return "its run ended" if row["run_id"] != grant.run or row["ended"] is not None else ""
        return reason

    def _program(self, word: str, cwd: Path, path: str | None) -> str:
        """The program file argv[0] names: a path relative to cwd, or a name looked up on PATH."""
        if re.search(r"[\\/]", word):
            named = Path(word)
            return str(named if named.is_absolute() else cwd / named)
        found = executable((word,)) or shutil.which(word, path=path)   # a bare python first: it may be a Store alias
        if found is None:
            raise ToolError(f"{word} was not found on PATH.")
        return found

    def _refusal(self, roots: list[Path], command: _Command, program: str) -> str:
        """Why Artemis never runs this command though the deny list passes it, or ""."""
        for arg in [program, *command.argv[1:]]:
            for text in {arg, arg.partition("=")[2]} - {""}:
                path = Path(os.path.expanduser(text))
                if why := self._sensitive(roots, _real(path if path.is_absolute() else command.cwd / path)):
                    return f"{_clip(arg, 80)} reaches {why}, which agents do not touch."
        if Path(program).suffix.lower() in (".cmd", ".bat"):
            allowed = [name.lower() for name in getattr(self.home.config.run, "batch_ok", BATCH_OK)]
            if Path(program).stem.lower() not in allowed:
                return f"{Path(program).name} is a batch file not named in [run] batch_ok."
            if any(BATCH_UNSAFE.search(arg) for arg in command.argv[1:]):
                return 'A batch file is not given arguments with % ^ & | < > or ".'
        return ""

    def _start(self, command: _Command, timeout: int, halt) -> _Process:
        values = self.home.vault.env(command.names) if command.names else {}
        env = check_env() | {variable: values[name] for name, variable in command.env_secrets.items()}
        env["ARTEMIS_RUN_TOKEN"] = "1"      # marks every child, so Artemis's own commands know an agent ran them
        argv = [self._program(command.argv[0], command.cwd, env.get("PATH")), *command.argv[1:]]
        wrap = list(self.home.config.run.wrap)
        if wrap:
            argv = [self._program(wrap[0], command.cwd, env.get("PATH")), *wrap[1:], *argv]
        stdin = values[command.stdin_secret] if command.stdin_secret else None
        return _Process(argv, command.cwd, env, stdin, timeout, self.scrubber.stream(), halt)

    def _interrupt(self, match: guard.Match, secrets: dict) -> tuple[str | None, str, str]:
        """The interrupt this command is (by rules.toml, then by the secrets it uses), why, and the rule."""
        found = []
        if match.kind in ORDER:
            found.append((match.kind, f"It matches {match.rule!r}, a rule for commands that {DOES[match.kind]}.",
                          match.rule))
        for name, info in secrets.items():
            if info.kind in guard.INTERRUPTS:
                found.append((guard.INTERRUPTS[info.kind], f"It uses {name}, a secret marked {info.kind}.",
                              f"secret:{name}"))
        return min(found, key=lambda item: ORDER.index(item[0])) if found else (None, "", "")

    # Worker tools

    def _run(self, grant, argv: list[str], cwd: str = ".", timeout_s: int | None = None,
             env_secrets: dict | None = None, stdin_secret: str | None = None, background: bool = False) -> dict:
        ledger, config = self.home.ledger, self.home.config
        ledger.allow_step()
        roots, flags = self._roots(grant.project, grant.root), self._flags(grant.project)
        folder = self._place(roots, cwd)
        if not folder.is_dir():
            raise ToolError(f"{cwd} is not a folder in the project.")
        for variable in (env_secrets or {}).values():
            if variable.upper().startswith("ARTEMIS_") or variable.upper() == "PATH":
                raise ToolError(f"A secret is not put in {variable}.")
        command = _Command(list(argv), folder, dict(env_secrets or {}), stdin_secret)
        secrets = self._secrets(command.names)
        text = _clip(join_command(argv))
        match = guard.classify(argv, guard.SHELL, self._rules(), cwd=folder, shell_ok=flags.shell)
        if match.kind == "deny":
            reason = f"Artemis never runs this: {match.rule} (rules.toml)."
        else:
            reason = self._refusal(roots, command, self._program(argv[0], folder, check_env().get("PATH")))
        if reason:
            self._record(grant, "run.denied", f"{text}: {reason}", argv=argv, rule=match.rule)
            return {"state": "denied", "reason": reason}
        kind, why, rule = self._interrupt(match, secrets)
        standing = None
        if kind is not None and kind in config.interrupts.ask:
            standing = self._standing(grant, kind, command)
            if standing is None:
                return self._hold(grant, command, kind, why, rule)
        timeout = timeout_s or config.run.timeout_s
        process = self._start(command, timeout, self._halt(grant))
        for name in command.names:
            ledger.secret_used(name, "run", task=grant.task, run=grant.run)
        event = "run.opaque" if match.kind == "opaque" else "run.command"
        facts = {"argv": argv, "cwd": str(folder), "secrets": command.names, "kind": kind, "rule": match.rule,
                 "standing": None if standing is None else standing["id"]}
        if process.done.wait(0 if background else min(self.handoff_s, timeout + 5)):     # room to stop it
            result = process.result()
            self._record(grant, event, f"{text} · exit {result['exit_code']}", exit_code=result["exit_code"], **facts)
            return result
        job = ledger.start_job(json.dumps(argv), str(folder), guard.SHELL, run=grant.run, task=grant.task)
        with self._lock:
            self._jobs[job] = process
        threading.Thread(target=self._finish, args=(grant, job, process), daemon=True).start()
        self._record(grant, event, f"{text} · running as job {job}", job=job, **facts)
        return {"state": "running", "job": job, "output": process.output}

    def _standing(self, grant, kind: str, command: _Command):
        """A standing approval for exactly this command, folder, secret and schedule. Only work a schedule started
        has one, and money out never does."""
        schedule = self._schedule_of(grant.task)
        if kind == Interrupt.SPEND or len(command.names) > 1 or schedule is None:
            return None
        return self.home.ledger.standing(kind=kind, argv=command.argv, cwd=str(command.cwd),
                                         secret=(command.names or [None])[0], schedule=schedule)

    def _hold(self, grant, command: _Command, kind: str, why: str, rule: str) -> dict:
        ledger, now = self.home.ledger, time.time()
        recorded, options = json.dumps(command.argv), command.options()
        for row in ledger.cards(project=grant.project):    # asked again while its card is still open
            if (row["run_id"] == grant.run and row["command"] == recorded and row["cwd"] == str(command.cwd)
                    and (json.loads(row["options"]) if row["options"] else None) == options
                    and row["state"] in ("waiting", "approved", "running")
                    and (row["expires"] is None or row["expires"] > now)):
                return {"state": "held", "card": row["id"],
                        "reason": f"{row['why']} Card {row['id']} is still open; do not retry it, report it."}
        what = f"Run: {_clip(join_command(command.argv))} in {_shown(command.cwd)}"
        card = ledger.open_card(Role.HOME, kind, what, why, project=grant.project, task=grant.task, run=grant.run,
                                command=recorded, cwd=str(command.cwd), shell=guard.SHELL,
                                secrets=tuple(command.names), rule=rule, options=options, expires=now + CARD_TTL_S)
        self._record(grant, "run.held", what, card=card, kind=kind, rule=rule)
        return {"state": "held", "card": card,
                "reason": f"{why} The person was asked on card {card}; do not retry it, report it."}

    def _finish(self, grant, job: int, process: _Process) -> None:
        process.done.wait()
        result = process.result()
        self.home.ledger.end_job(job, result["exit_code"], result["output"])
        self._record(grant, "job.ended", f"job {job} · exit {result['exit_code']}", job=job,
                     exit_code=result["exit_code"])
        with self._lock:
            self._jobs.pop(job, None)

    def _own_job(self, grant, job: int) -> _Process | None:
        if self.home.ledger.job(job)["task_id"] != grant.task:
            raise ToolError(f"Job {job} belongs to another task.")
        with self._lock:
            return self._jobs.get(job)

    def _job(self, grant, job: int, wait_s: int | None = None) -> dict:
        process = self._own_job(grant, job)
        if process is not None:
            process.done.wait(self.handoff_s if wait_s is None else wait_s)
            return {**process.result(), "job": job}
        row = self.home.ledger.job(job)
        if row["ended"] is not None:
            return {"state": "done", "job": job, "exit_code": row["exit_code"], "output": row["output"]}
        return {"state": "done", "job": job, "exit_code": None, "output": row["output"] or "",
                "reason": "The home restarted while this job ran; how it ended is unknown."}

    def _job_stop(self, grant, job: int) -> dict:
        process = self._own_job(grant, job)
        if process is not None:
            process.stop("the agent stopped it")
            process.done.wait(10)
        return self._job(grant, job, 0)

    def _http_request(self, grant, **args) -> dict:
        self.home.ledger.allow_step()
        if "save_to" in args:
            self._place(self._roots(grant.project, grant.root), args["save_to"])
        return httpop.request(self.home, grant, args)

    def _read_file(self, grant, path: str, max_bytes: int = READ_CAP) -> dict:
        return self._read(self._place(self._roots(grant.project, grant.root), path), path, max_bytes)

    def _list_dir(self, grant, path: str, glob: str | None = None) -> dict:
        return self._list(self._roots(grant.project, grant.root), path, glob)

    def _search(self, grant, pattern: str, path: str = ".") -> dict:
        return self._grep(self._roots(grant.project, grant.root), pattern, path)

    def _writable(self, grant) -> list[Path]:
        if grant.kind != "folder":
            raise ToolError("This is a repo project: edit files with your own file tools inside your worktree, and "
                            "Artemis commits them. write_file, move and trash are for folder projects.")
        self.home.ledger.allow_step()
        return self._roots(grant.project, grant.root)

    def _changeable(self, roots: list[Path], raw: str) -> Path:
        target = self._place(roots, raw)
        if target in roots or not target.exists() and not target.is_symlink():
            raise ToolError(f"{raw} is not a file or folder that can be changed.")
        return target

    def _write_file(self, grant, path: str, content: str) -> dict:
        roots = self._writable(grant)
        target = self._place(roots, path)
        if target.is_dir():
            raise ToolError(f"{path} is a folder.")
        undo.journal(self.home.paths, grant.task).write(target, content)
        shown = self._named(roots, target)
        self._record(grant, "file.changed", f"wrote {shown}", op="write", path=shown)
        return {"state": "done", "path": shown}

    def _move(self, grant, src: str, dst: str) -> dict:
        roots = self._writable(grant)
        source, target = self._changeable(roots, src), self._place(roots, dst)
        undo.journal(self.home.paths, grant.task).move(source, target)
        shown = (self._named(roots, source), self._named(roots, target))
        self._record(grant, "file.changed", f"moved {shown[0]} to {shown[1]}", op="move", src=shown[0],
                     dst=shown[1])
        return {"state": "done", "src": shown[0], "dst": shown[1]}

    def _trash(self, grant, path: str) -> dict:
        roots = self._writable(grant)
        target = self._changeable(roots, path)
        shown = self._named(roots, target)
        undo.journal(self.home.paths, grant.task).trash(target)
        self._record(grant, "file.changed", f"trashed {shown} (kept for undo)", op="trash", path=shown)
        return {"state": "done", "path": shown, "undo": f"artemis undo {grant.task} puts it back"}

    def _secret_names(self, grant) -> list[dict]:
        return [{"name": info.name, "use": info.use, "kind": info.kind, "note": info.note,
                 **({"origin": info.origin} if info.origin else {})} for info in self.home.vault.names()]

    def _secret_request(self, grant, name: str, why: str, use: str, origin: str | None = None,
                        kind: str = "none") -> dict:
        ledger = self.home.ledger
        if use == "http" and not (origin and ORIGIN.fullmatch(origin)):
            raise ToolError("A secret for a website needs its origin: https://host (or http://127.0.0.1:port), "
                            "with no path.")
        if use == "env" and origin:
            raise ToolError("Only a secret for a website (use http) has an origin.")
        if self.home.vault.info(name) is not None:
            raise ToolError(f"{name} is already in the vault: see secret_names.")
        for row in ledger.cards(state="waiting"):
            if row["kind"] == "secret" and json.loads(row["options"])["name"] == name:
                return {"card": row["id"]}
        options = {"name": name, "use": use, "origin": origin, "kind": kind}
        card = ledger.open_card(Role(grant.role), "secret", f"Add the secret {name}", why, project=grant.project,
                                task=grant.task, run=grant.run if grant.task else None, options=options)
        self._record(grant, "secret.requested", f"{name} ({use})", card=card)
        from .web.secret_requests import request_for_card    # the App's card, in the one conversation the person has
        asked = request_for_card(ledger, card)["id"]
        ledger.say(Role.LEAD, f"{why}\n\n```secret {asked}\n```", project=grant.project, card=card)
        return {"card": card}

    def _ask(self, grant, kind: str, what: str, why: str, options: list | None = None,
             link: str | None = None, project=None) -> dict:
        proj = grant.project if project is None else self._project(project)[0]
        if kind == "step":
            if grant.role != "lead":
                raise ToolError("Only the lead opens a step for the person.")
            if options is not None:
                raise ToolError("A step takes no options.")
            clean_link = link.strip() if isinstance(link, str) and link.strip() else None
            if clean_link and any(ord(char) < 32 for char in clean_link):
                raise ToolError("A step link cannot contain control characters.")
            card = self.home.ledger.open_card(Role.LEAD, "step", what, why, project=proj, task=grant.task,
                                              options={"link": clean_link} if clean_link else None)
            self.home.ledger.say(Role.LEAD, f"{what}\n\n```step {card}\n```", project=proj, card=card)
            return {"card": card}
        if not options:
            raise ToolError("A choice needs options.")
        if len({option["id"] for option in options}) != len(options):
            raise ToolError("Each option needs its own id.")
        card = self.home.ledger.open_card(Role(grant.role), kind, what, why, project=proj, task=grant.task,
                                          run=grant.run if grant.task else None, options=options)
        from .web.owner import choice_fence    # answered in the conversation, whichever agent asks
        self.home.ledger.say(Role.LEAD, choice_fence(what, options), project=proj, card=card)
        return {"card": card}

    def _note(self, grant, text: str) -> dict:
        self.home.ledger.note(Role(grant.role), text, project=grant.project, task=grant.task)
        return {"noted": True}

    def _board(self, grant, title: str, blocks: list[dict], id: str | None = None,
               layout: dict | None = None) -> dict:
        return boards.publish(self.home.ledger, Role(grant.role), title, blocks, board_id=id, layout=layout,
                              project=grant.project, task=grant.task)

    def _check(self, grant, number: int) -> dict:
        criteria = json.loads(self.home.ledger.task_brief(grant.task)["criteria"])
        if number > len(criteria):
            raise ToolError(f"This task has {len(criteria)} checks.")
        criterion = Criterion(**{key: tuple(value) if isinstance(value, list) else value
                                 for key, value in criteria[number - 1].items()})
        shown = {"number": number, "label": criterion.label}
        if criterion.kind == "command":
            if self._flags(grant.project).no_run:
                raise ToolError("This project runs no commands for its workers; the judge runs this check when you "
                                "finish.")
            result = self._run(grant, list(criterion.command))
            if result["state"] == "done":
                result["passed"] = result["exit_code"] == 0 and criterion.output in result["output"]
            return {**shown, **result}
        if criterion.kind == "preserved":
            return {**shown, "passed": None, "gap": "The judge compares these files with its snapshot from the "
                    "task's start; that comparison is made when you finish."}
        gap = criterion.gap(capture(Path(grant.root), (criterion,),
                                    extra=tuple(map(Path, self._flags(grant.project).allowed_roots))).get(1))
        note = {"note": "Whether it changed since the start is judged from the start's snapshot when you finish."}
        return {**shown, "passed": gap is None, "gap": gap, **(note if criterion.kind == "exists" else {})}

    # Lead tools

    def _projects(self, grant) -> list[dict]:
        ledger = self.home.ledger
        return [{"id": row["id"], "name": row["name"], "kind": row["kind"], "path": row["path"],
                 "counts": ledger.counts(project=row["id"])} for row in ledger.projects()]

    def _status(self, grant, project=None) -> dict:
        ledger = self.home.ledger
        number = None if project is None else self._project(project)[0]
        tasks = [{"task": row["id"], "title": row["title"], "state": row["state"], "kind": row["kind"],
                  "project": row["project_id"], "agent": row["agent"], "note": row["note"]}
                 for row in ledger.work(project=number)][-30:]
        cards = [{"card": row["id"], "kind": row["kind"], "what": row["what"]}
                 for row in ledger.cards(state="waiting", project=number)]
        return {"stopped": ledger.stopped(), "counts": ledger.counts(project=number), "tasks": tasks, "cards": cards}

    def _evidence(self, grant, task: int) -> dict:
        ledger = self.home.ledger
        row, state = ledger.task_brief(task), ledger.work(task=task)[0]
        submission, items = ledger.evidence(task)
        checks = [{"number": number, "label": item["label"],
                   "evidence": {"kind": items[number].KIND, **asdict(items[number])} if number in items else None}
                  for number, item in enumerate(json.loads(row["criteria"]), 1)]
        return {"task": task, "title": row["title"], "brief": row["brief"], "kind": row["kind"],
                "project": row["project_id"], "provider": row["provider"], "state": state["state"], "checks": checks,
                "claim": submission["claim"] if submission else None,
                "verdict": submission["verdict"] if submission else None,
                "gaps": json.loads(submission["gaps"]) if submission and submission["gaps"] else [],
                "events": [{"kind": event["kind"], "detail": event["detail"]}
                           for event in ledger.events(task=task)][-20:],
                "cards": [{"card": card["id"], "kind": card["kind"], "state": card["state"], "what": card["what"],
                           "result": card["result"]}
                          for card in ledger.cards(project=row["project_id"]) if card["task_id"] == task]}

    def _lead_read_file(self, grant, project, path: str, max_bytes: int = READ_CAP) -> dict:
        roots = self._project(project)[1]
        return self._read(self._place(roots, path), path, max_bytes)

    def _lead_list_dir(self, grant, project, path: str, glob: str | None = None) -> dict:
        return self._list(self._project(project)[1], path, glob)

    def _lead_search(self, grant, project, pattern: str, path: str = ".") -> dict:
        return self._grep(self._project(project)[1], pattern, path)

    def _read(self, target: Path, path: str, limit: int) -> dict:
        if not target.is_file():
            raise ToolError(f"{path} is not a file.")
        with target.open("rb") as stream:
            data = stream.read(limit + 1)
        if b"\0" in data[:8192]:
            raise ToolError(f"{path} is not a text file.")
        return {"content": data[:limit].decode("utf-8", errors="replace"), "truncated": len(data) > limit}

    def _visible(self, roots: list[Path], path: Path) -> Path | None:
        real = _real(path)
        if not any(real.is_relative_to(root) for root in roots) or self._sensitive(roots, real):
            return None
        return real

    def _list(self, roots: list[Path], path: str, glob: str | None) -> dict:
        folder = self._place(roots, path)
        if not folder.is_dir():
            raise ToolError(f"{path} is not a folder.")
        if glob is not None and (not glob or ".." in Path(glob).parts or Path(glob).is_absolute()):
            raise ToolError("A glob names files inside the folder, like *.csv or **/*.md.")
        entries, truncated = [], False
        for item in sorted(folder.glob(glob) if glob else folder.iterdir()):
            if self._visible(roots, item) is None:
                continue
            if len(entries) == LIST_CAP:
                truncated = True
                break
            kind = "dir" if item.is_dir() else "file"
            entries.append({"path": self._named(roots, item), "kind": kind,
                            "size": item.stat().st_size if kind == "file" else None})
        return {"entries": entries, "truncated": truncated}

    def _grep(self, roots: list[Path], pattern: str, path: str) -> dict:
        try:
            expression = re.compile(pattern)
        except re.error as error:
            raise ToolError(f"pattern is not a regular expression: {error}.") from None
        start = self._place(roots, path)
        found = []
        for file in [start] if start.is_file() else _walk(start):
            real = self._visible(roots, file)
            if real is None or not real.is_file() or real.stat().st_size > SEARCH_FILE_CAP:
                continue
            data = real.read_bytes()
            if b"\0" in data[:8192]:
                continue
            for number, line in enumerate(data.decode("utf-8", errors="replace").splitlines(), 1):
                if expression.search(line):
                    if len(found) == SEARCH_CAP:
                        return {"matches": found, "truncated": True}
                    found.append({"path": self._named(roots, real), "line": number, "text": _clip(line, 300)})
        return {"matches": found, "truncated": False}

    def _request(self, project: int, title: str) -> int:
        """The request a lead's task belongs to: the person's latest words, recorded once per project."""
        ledger = self.home.ledger
        said = [row for row in ledger.messages(limit=50) if row["role"] == "you"]
        if not said:
            return ledger.request(Role.HOME, title, project=project, source="cli")
        message = said[-1]
        found = ledger.requests(project=project, message=message["id"])
        return found[0]["id"] if found else ledger.request(Role.HOME, message["text"], project=project,
                                                            source="chat", message=message["id"])

    def _task_create(self, grant, project, title: str, brief: str, kind: str, checks=(), files=(),
                     host_checks=(), provider: str | None = None, review: bool = False) -> dict:
        number = self._project(project)[0]
        criteria = self._reachable(number, _criteria(checks, files, host_checks))
        # the checks this project learned from earlier rejections join every new task's own, each command once
        commands = {criterion.command for criterion in criteria}
        criteria += tuple(check for check in lessons.learned_checks(self.home.ledger, number)
                          if check.command not in commands)
        task = self.home.ledger.add_task(Role.LEAD, self._request(number, title), title, brief, criteria,
                                         project=number, kind=kind, provider=provider, review=review)
        return {"task": task, "checks": [criterion.label for criterion in criteria]}

    def _reachable(self, project: int, criteria: tuple[Criterion, ...]) -> tuple[Criterion, ...]:
        """Refuse a host check on a path none of the project's folders holds: the judge could never look at it."""
        row = self.home.ledger.project(project)
        extra = tuple(map(Path, _Flags.of(row).allowed_roots))
        for criterion in criteria:
            for path in criterion.paths:
                try:
                    within(Path(row["path"]), path, extra)
                except ValueError as error:
                    raise ToolError(f"{criterion.label}: {path}: {error}") from None
        return criteria

    def _task_retry(self, grant, task: int, feedback: str) -> dict:
        ledger = self.home.ledger
        state = ledger.work(task=task)[0]["state"]
        if state != "stuck":
            raise ToolError(f"Task {task} is {state}; only a stuck task is retried.")
        brief = ledger.task_brief(task)["brief"]
        ledger.revise(Role.LEAD, task, f"{brief}\n\nFeedback for the next attempt: {feedback}")
        ledger.retrying(Role.HOME, task, feedback)
        return {"task": task, "state": "retrying"}

    def _task_drop(self, grant, task: int, reason: str) -> dict:
        self.home.ledger.drop(Role.LEAD, task, reason)
        return {"task": task, "state": "dropped"}

    def _schedule(self, grant, project, title: str, brief: str, kind: str, spec: str, checks=(), files=(),
                  host_checks=()) -> dict:
        number = self._project(project)[0]
        first = next_after(spec, datetime.now().astimezone())
        if first is None:
            raise ToolError(f"{spec!r} never comes again.")
        schedule = self.home.ledger.add_schedule(Role.LEAD, number, title, brief, kind,
                                                 self._reachable(number, _criteria(checks, files, host_checks)),
                                                 spec, first)
        return {"schedule": schedule, "next_at": datetime.fromtimestamp(first).astimezone().isoformat()}

    def _lesson(self, grant, kind: str, text: str, payload: dict | None = None, project=None) -> dict:
        number = None if project is None else self._project(project)[0]
        lesson = lessons.propose(self.home.ledger, Role.LEAD, kind, text, payload, [{"from": "lead"}], project=number)
        if lesson is None:
            raise ToolError("That lesson is already there.")
        return {"lesson": lesson, "state": next(row["state"] for row in self.home.ledger.lessons(number, state=None)
                                                if row["id"] == lesson)}


def _walk(start: Path):
    """Every file under `start`, in order, without following links into other folders or entering .git."""
    for folder, folders, names in os.walk(start):
        folders[:] = sorted(name for name in folders if name != ".git")
        for name in sorted(names):
            yield Path(folder, name)
