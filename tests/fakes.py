"""Fakes for the agent tests: agent CLIs on PATH, a vault, a home config, a home, and an MCP server that records
every call and answers from a table (its env_names tool, when listed, answers the names in its environment)."""

import json
import os
from pathlib import Path
import shlex
import sys
from threading import Event
from types import SimpleNamespace

from artemis.ledger import Ledger
from artemis.scrub import Scrubber

MCP_SERVER = '''
import json
import os
import sys

log, table = sys.argv[1], json.loads(open(sys.argv[2], encoding="utf-8").read())
for line in sys.stdin:
    message = json.loads(line)
    if "id" not in message:
        continue
    method, params = message["method"], message.get("params") or {}
    result = {}
    if method == "initialize":
        result = {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}}, "serverInfo": {"name": "fake"}}
    elif method == "tools/list":
        result = {"tools": [{"name": name, "description": "fake " + name,
                             "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}}
                            for name in table]}
    elif method == "tools/call":
        with open(log, "a", encoding="utf-8") as file:
            file.write(json.dumps({"tool": params["name"], "arguments": params.get("arguments")}) + "\\n")
        answer = table.get(params["name"], {"error": "no such tool"})
        if params["name"] == "env_names":
            answer = sorted(os.environ)
        result = {"content": [{"type": "text", "text": json.dumps(answer)}], "isError": "error" in answer}
    print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": result}), flush=True)
'''


# An agent CLI stand-in, installed as claude, codex, gemini or opencode by fake_cli. It records its argv, prompt and
# working folder, calls the Artemis tools it is told to through the MCP server its argv names, and answers in its
# provider's output format. FAKE_AGENT_<KEY> variables steer it, and FAKE_AGENT_<KEY>_<NAME> steers one provider.
FAKE_AGENT = r"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

name, argv = Path(__file__).stem.removesuffix("_fake"), sys.argv[1:]
told = lambda key, default: os.environ.get(f"FAKE_AGENT_{key}_{name.upper()}", os.environ.get(f"FAKE_AGENT_{key}", default))
if argv[:2] == ["features", "list"]:
    print("shell_tool    stable  true")
    print("apps          stable  true")
    raise SystemExit(0)
prompt = sys.stdin.read()
with open(os.environ["FAKE_AGENT_RECORD"], "a", encoding="utf-8") as file:
    file.write(json.dumps({"name": name, "argv": argv, "prompt": prompt, "cwd": os.getcwd()}) + "\n")
command = None
if "--mcp-config" in argv:
    server = json.loads(Path(argv[argv.index("--mcp-config") + 1]).read_text(encoding="utf-8"))["mcpServers"]["artemis"]
    command = [server["command"], *server["args"]]
overrides = dict(argv[at + 1].split("=", 1) for at, arg in enumerate(argv) if arg == "-c")
if "mcp_servers.artemis.command" in overrides:
    command = [json.loads(overrides["mcp_servers.artemis.command"]), *json.loads(overrides["mcp_servers.artemis.args"])]
wanted = json.loads(told("CALLS", "[]"))
if command and wanted:
    server = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
    for number, (method, params) in enumerate([("initialize", {})] + [("tools/call", {"name": tool, "arguments": args})
                                                                       for tool, args in wanted]):
        server.stdin.write(json.dumps({"jsonrpc": "2.0", "id": number, "method": method, "params": params}) + "\n")
        server.stdin.flush()
        server.stdout.readline()
    server.stdin.close()
    server.wait()
time.sleep(float(told("SLEEP", "0")))
code = int(told("EXIT", "0"))
if code:
    print(told("STDERR", "it failed"), file=sys.stderr)
    raise SystemExit(code)
reply = told("REPLY", "done")
half = len(reply) // 2
show = lambda event: print(json.dumps(event), flush=True)
if name == "claude":
    show({"type": "system", "subtype": "init", "tools": ["mcp__artemis__note"]})
    for piece in (reply[:half], reply[half:]):
        show({"type": "stream_event", "event": {"type": "content_block_delta",
                                                "delta": {"type": "text_delta", "text": piece}}})
    show({"type": "result", "subtype": "success", "is_error": False, "result": reply})
elif name == "codex":
    show({"type": "thread.started"})
    show({"type": "item.completed", "item": {"type": "agent_message", "text": reply}})
    show({"type": "turn.completed", "usage": {"input_tokens": 10}})
elif name == "gemini":
    show({"type": "init"})
    for piece in (reply[:half], reply[half:]):
        show({"type": "message", "role": "assistant", "content": piece, "delta": True})
    show({"type": "result", "status": "success"})
else:
    show({"type": "text", "part": {"messageID": "m1", "text": reply}})
"""


def records(path: Path) -> list[dict]:
    """What each fake agent run recorded: name, argv, prompt and working folder."""
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []


def fake_cli(folder: Path, name: str, script: str) -> Path:
    """An executable called name on PATH that runs script with this Python."""
    body = folder / f"{name}_fake.py"
    body.write_text(script, encoding="utf-8")
    if os.name == "nt":
        entry = folder / f"{name}.cmd"
        entry.write_text(f'@"{sys.executable}" "{body}" %*\r\n', encoding="utf-8")
    else:
        entry = folder / name
        entry.write_text(f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(body))} "$@"\n',
                         encoding="utf-8")
        entry.chmod(0o755)
    return entry


def mcp_server(folder: Path, table: dict) -> tuple[list[str], Path]:
    """The command of a fake Artemis tool server, and the file its calls are recorded in."""
    script, replies, log = folder / "fake_mcp.py", folder / "fake_mcp.json", folder / "fake_mcp.log"
    script.write_text(MCP_SERVER, encoding="utf-8")
    replies.write_text(json.dumps(table), encoding="utf-8")
    log.touch()
    return [sys.executable, str(script), str(log), str(replies)], log


def calls(log: Path) -> list[dict]:
    return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if line.strip()]


class FakeVault:
    """The vault's interface over a dict. The values are made up for the tests."""

    def __init__(self, values: dict[str, str] | None = None):
        self.held = dict(values or {})
        self.version, self.unlocked = 1, True
        self.scrubber = Scrubber(self)

    def info(self, name: str):
        return SimpleNamespace(name=name, kind="none", note="") if name in self.held else None

    def env(self, names: list[str]) -> dict[str, str]:
        return {name: self.held[name] for name in names}

    def values(self) -> list[tuple[str, str]]:
        return list(self.held.items())

    def master_key(self) -> bytes:
        return b"fake-vault-key-for-tests-0000000"


def config(**sections) -> SimpleNamespace:
    """A home config whose sections are plain tables, as config.toml would give them."""
    base = {name: {} for name in ("agents", "placement", "lead", "api", "gemini", "opencode")}
    return SimpleNamespace(**(base | sections))


class FakeHome:
    """What LeadRunner and review use of the home: paths, ledger, config, vault, grants, the tool command,
    publish and the closing flag."""

    def __init__(self, root: Path, settings: SimpleNamespace, vault=None, table: dict | None = None):
        self.paths = SimpleNamespace(root=root, lead=root / "lead", runs=root / "runs")
        self.paths.runs.mkdir(parents=True, exist_ok=True)
        self.ledger = Ledger(root / "ledger.db")
        self.ledger.initialize()
        self.config, self.vault = settings, vault
        self.mcp, self.log = mcp_server(root, table or {})
        self.grants: dict[int, tuple] = {}         # in force
        self.granted: list[tuple] = []             # every grant ever given
        self.published: list[tuple[str, dict]] = []
        self.closing = Event()

    def grant(self, run, task, project, role, root, kind) -> Path:
        self.grants[run] = (task, project, role, Path(root), kind)
        self.granted.append((run, *self.grants[run]))
        path = self.paths.runs / f"{run}.token"
        path.write_text("fake-token", encoding="utf-8")
        return path

    def revoke(self, run) -> None:
        self.grants.pop(run, None)

    def mcp_command(self, token_file: Path) -> list[str]:
        return list(self.mcp)

    def publish(self, kind: str, data: dict) -> None:
        self.published.append((kind, data))


def two_projects(ledger, root: Path) -> dict[str, int]:
    """A repo project with a running task and a folder project with a queued one, as the lead would find them."""
    from artemis.judge import Criterion
    from artemis.roles import Role

    shop = ledger.add_project(Role.OWNER, "shop", "repo", root / "shop")
    notes = ledger.add_project(Role.OWNER, "notes", "folder", root / "notes")
    checks = (Criterion("tests pass", command=("python", "-m", "unittest")),)
    fix = ledger.add_task(Role.LEAD, ledger.request(Role.OWNER, "Fix the cart total", shop), "Fix the cart total",
                          "Rounding is off by a cent.", checks)
    tidy = ledger.add_task(Role.LEAD, ledger.request(Role.OWNER, "Tidy the notes", notes), "Tidy the notes",
                           "Sort them by date.", (Criterion("index written", artifact="index.md"),), kind="docs")
    ledger.claim_run(Role.HOME, fix, "codex")
    return {"shop": shop, "notes": notes, "fix": fix, "tidy": tidy}
