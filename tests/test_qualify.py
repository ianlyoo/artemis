import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from artemis import agents, qualify
from artemis.ledger import Ledger
from artemis.qualify import _judge, native_tools, outdated
from artemis.roles import WorkflowError
from artemis.worker_adapters import LEAD_TOOLS, WORKER_TOOLS

from fakes import FakeVault, config, fake_cli

# A model stand-in for the probe. It reads the probe's steps from its prompt and either keeps to its fence (fenced),
# breaks it (leaky: a shell command, the outside marker, the web page, a Bash tool), or never calls Artemis (silent).
PROBE_AGENT = r'''
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.request import ProxyHandler, build_opener

argv = sys.argv[1:]
if argv == ["--version"]:
    print(os.environ.get("FAKE_PROBE_VERSION", "9.9.9 (fake)"))
    raise SystemExit(0)
prompt, behaviour = sys.stdin.read(), os.environ["FAKE_PROBE"]
nonce = re.search(r'with the text "(\w+)"', prompt).group(1)
if behaviour != "silent":
    server = json.loads(Path(argv[argv.index("--mcp-config") + 1]).read_text(encoding="utf-8"))["mcpServers"]["artemis"]
    mcp = subprocess.Popen([server["command"], *server["args"]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    for number, (method, params) in enumerate((("initialize", {}),
                                               ("tools/call", {"name": "note", "arguments": {"text": nonce}}))):
        mcp.stdin.write(json.dumps({"jsonrpc": "2.0", "id": number, "method": method, "params": params}) + "\n")
        mcp.stdin.flush()
        mcp.stdout.readline()
    mcp.stdin.close()
    mcp.wait()
tools, steps = ["Read", "Glob"], {"2": "called note"}
if behaviour == "leaky":
    os.mkdir(re.search(r"mkdir (\S+)", prompt).group(1))
    steps["4"] = Path(re.search(r"Read the file (\S+) and", prompt).group(1)).read_text(encoding="utf-8").strip()
    build_opener(ProxyHandler({})).open(re.search(r"Fetch the web page (\S+)", prompt).group(1)).read()
    tools.append("Bash")
print(json.dumps({"type": "system", "subtype": "init", "tools": tools + ["mcp__artemis__note"]}))
print(json.dumps({"type": "result", "subtype": "success", "is_error": False,
                  "result": json.dumps({"tools": tools + ["note"], "steps": steps})}))
'''


def ledger_in(test) -> Ledger:
    ledger = Ledger(Path(test.enterContext(TemporaryDirectory())) / "ledger.db")
    ledger.initialize()
    return ledger


@unittest.skipIf(os.name == "nt", "the fake agent is a POSIX shell shim")
class Probes(unittest.TestCase):
    """A provider is live only if what can be seen afterwards shows its fence held and one Artemis call went through."""

    def setUp(self):
        bin_ = Path(self.enterContext(TemporaryDirectory()))
        fake_cli(bin_, "claude", PROBE_AGENT)
        self.enterContext(patch.dict(os.environ, {"PATH": f"{bin_}{os.pathsep}{os.environ['PATH']}"}))
        self.enterContext(patch.object(agents, "ready", side_effect=lambda name, config, vault: name == "claude"))
        self.ledger = ledger_in(self)
        self.settings = config()

    def run_probe(self, behaviour, role):
        with patch.dict(os.environ, {"FAKE_PROBE": behaviour}):
            return qualify.qualify("claude", role, self.ledger, self.settings, None)

    def row(self, role):
        return next(row for row in self.ledger.adapters() if (row["provider"], row["role"]) == ("claude", role))

    def test_a_fenced_provider_qualifies_live(self):
        result = self.run_probe("fenced", "lead")
        self.assertEqual(result.status, "live", result.receipt)
        self.assertIn("every check held", result.receipt)
        for check in ("artemis call", "shell refused", "out-of-scope read refused", "web fetch refused",
                      "subagent refused", "no command tool"):
            self.assertIn(f"{check}: held", result.receipt)
        self.assertIn("native tools seen: Glob, Read", result.receipt)
        self.assertIn("the model's own report", result.receipt)
        row = self.row("lead")
        self.assertEqual((row["os"], row["version"], row["status"], row["auth"]),
                         (agents.OS_NAME, "9.9.9 (fake)", "live", "Claude Code sign-in"))

    def test_a_leaky_provider_is_unqualified_by_what_it_left_behind(self):
        result = self.run_probe("leaky", "code")
        self.assertEqual(result.status, "unqualified")
        for check in ("shell refused", "out-of-scope read refused", "web fetch refused"):
            self.assertIn(f"{check}: FAILED", result.receipt)
        for check in ("write outside refused", "git hooks write refused"):
            self.assertIn(f"{check}: held", result.receipt)
        self.assertEqual(self.row("code")["status"], "unqualified")

    def test_a_provider_that_never_reaches_artemis_stays_at_contract(self):
        result = self.run_probe("silent", "host")
        self.assertEqual(result.status, "contract")
        self.assertTrue(result.receipt.startswith("no Artemis call went through"))

    def test_doctor_probes_each_ready_provider_in_each_role_and_skips_the_rest(self):
        said = []
        with patch.dict(os.environ, {"FAKE_PROBE": "fenced"}):
            qualify.doctor(self.ledger, self.settings, None, ["claude", "codex"], ["lead", "host"], said.append)
        self.assertEqual([line.split(" · ")[0] for line in said],
                         ["Claude Code as lead: probing…", "Claude Code as lead: live", "Claude Code as host: probing…",
                          "Claude Code as host: live", "Codex: not ready here (not installed or not signed in); skipped"])
        self.assertEqual(sorted(row["role"] for row in self.ledger.adapters()), ["host", "lead"])
        with self.assertRaises(WorkflowError):
            qualify.doctor(self.ledger, self.settings, None, ["unknown"])

    def test_a_new_version_moves_live_back_to_contract_and_the_start_probes_it_once(self):
        with patch.dict(os.environ, {"FAKE_PROBE": "fenced"}):
            self.run_probe("fenced", "lead")
            self.run_probe("fenced", "code")
            self.assertEqual(outdated(self.ledger, self.settings), [])
            with patch.dict(os.environ, {"FAKE_PROBE_VERSION": "10.0.0 (fake)"}):
                self.assertEqual(outdated(self.ledger, self.settings), [("claude", "code"), ("claude", "lead")])
                self.assertEqual(self.row("lead")["status"], "contract")
                self.assertIn("changed since qualified: 9.9.9 (fake) -> 10.0.0 (fake)", self.row("lead")["receipt"])
                said = []
                qualify.at_start(self.ledger, self.settings, None, said.append)
                self.assertEqual(said, ["requalifying Claude Code as code: live", "requalifying Claude Code as lead: live"])
                self.assertEqual(self.row("lead")["version"], "10.0.0 (fake)")
                self.assertEqual(outdated(self.ledger, self.settings), [])


class Matrix(unittest.TestCase):
    def test_the_sign_in_is_named_by_the_key_the_run_used_never_its_value(self):
        settings, vault = config(opencode={"model": "google/demo"}), FakeVault({"GEMINI_API_KEY": "fake-key-0000"})
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            self.assertEqual(qualify.auth("opencode", settings, vault), "vault secret GEMINI_API_KEY")
            self.assertEqual(qualify.auth("gemini", settings, vault), "vault secret GEMINI_API_KEY")
            self.assertEqual(qualify.auth("opencode", settings, FakeVault({})), "OpenCode sign-in or provider key")

    def test_the_probe_that_cannot_run_or_build_its_fence_says_why(self):
        ledger = ledger_in(self)
        result = qualify.qualify("api", "code", ledger, config(), None)
        self.assertEqual(result.status, "contract")
        self.assertIn("the probe could not run: Set model under [api]", result.receipt)
        with TemporaryDirectory() as policies:
            (Path(policies) / "site.toml").write_text("", encoding="utf-8")
            with patch.dict(qualify.GEMINI_POLICIES, {agents.OS_NAME: Path(policies)}), \
                 patch.object(qualify, "probe", side_effect=AssertionError("no probe when blocked")):
                result = qualify.qualify("gemini", "host", ledger, config(), None)
        self.assertEqual(result.status, "unqualified")
        self.assertIn("override the per-run admin policy", result.receipt)

    def test_the_doctor_command_runs_against_the_home(self):
        parser = argparse.ArgumentParser()
        qualify.add_commands(parser.add_subparsers())
        args = parser.parse_args(["providers", "--provider", "codex", "--role", "lead"])
        home = SimpleNamespace(ledger="L", config="C", vault="V")
        with patch.object(qualify, "doctor", return_value=0) as doctor:
            self.assertEqual(args.run(home, args), 0)
        doctor.assert_called_once_with("L", "C", "V", ["codex"], ["lead"])


class Judging(unittest.TestCase):
    HELD = {"artemis call": True, "shell refused": True, "out-of-scope read refused": True, "web fetch refused": True,
            "subagent refused": True}

    def judge(self, name, role, **changed):
        return _judge(name, role, self.HELD | changed, 0, set(), {}, "")

    def test_codex_writing_code_may_read_outside_but_nothing_else_may(self):
        loose_reads = {"out-of-scope read refused": False}
        code = self.judge("codex", "code", **loose_reads)
        self.assertEqual(code.status, "live")
        self.assertTrue(code.receipt.startswith("OS sandbox; reads not confined."))
        self.assertEqual(self.judge("codex", "lead", **loose_reads).status, "unqualified")
        self.assertEqual(self.judge("claude", "code", **loose_reads).status, "unqualified")
        self.assertEqual(self.judge("codex", "code", **loose_reads, **{"shell refused": False}).status, "unqualified")

    def test_native_tools_are_read_from_each_providers_stream(self):
        lines = lambda *events: "\n".join(json.dumps(event) for event in events)
        claude = lines({"type": "system", "subtype": "init", "tools": ["Read", "mcp__artemis__note"]},
                       {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash"},
                                                                     {"type": "tool_use", "name": "mcp__artemis__run"}]}})
        self.assertEqual(native_tools("claude", claude), ({"Read"}, {"Bash"}))
        codex = lines({"type": "item.started", "item": {"type": "command_execution"}},
                      {"type": "item.completed", "item": {"type": "mcp_tool_call"}},
                      {"type": "item.completed", "item": {"type": "agent_message"}})
        self.assertEqual(native_tools("codex", codex), (set(), {"command_execution"}))
        gemini = lines({"type": "tool_use", "tool_name": "run_shell_command"}, {"type": "tool_use", "tool_name": "mcp_artemis_note"})
        self.assertEqual(native_tools("gemini", gemini), (set(), {"run_shell_command"}))
        opencode = lines({"type": "tool_use", "part": {"tool": "bash"}}, {"type": "tool_use", "part": {"tool": "artemis_note"}})
        self.assertEqual(native_tools("opencode", opencode), (set(), {"bash"}))


class StandIn(unittest.TestCase):
    """The probe's stand-in for the broker: the role's tool names, every call recorded, run refused."""

    def test_it_lists_the_role_tools_records_calls_and_refuses_run(self):
        with TemporaryDirectory() as folder:
            log = Path(folder) / "calls.jsonl"
            requests = [{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
                        {"jsonrpc": "2.0", "method": "notifications/initialized"},
                        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "note", "arguments": {"text": "x"}}},
                        {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "run", "arguments": {}}}]
            answers = {}
            for role, names in (("worker", WORKER_TOOLS), ("lead", LEAD_TOOLS)):
                done = subprocess.run([sys.executable, "-m", "artemis.qualify", "--serve", str(log), "--role", role],
                                      input="\n".join(map(json.dumps, requests)) + "\nnot json\n", capture_output=True,
                                      text=True, encoding="utf-8", timeout=30, check=True)
                answers[role] = {reply["id"]: reply["result"] for reply in map(json.loads, done.stdout.splitlines())}
                listed = answers[role][2]["tools"]
                self.assertEqual([tool["name"] for tool in listed], list(names))
                self.assertTrue(all(tool["inputSchema"]["additionalProperties"] is False for tool in listed))
            self.assertEqual(answers["worker"][1]["serverInfo"]["name"], "artemis")
            self.assertFalse(answers["worker"][3]["isError"])
            self.assertTrue(answers["worker"][4]["isError"])
            self.assertTrue(answers["lead"][4]["isError"])
            recorded = [json.loads(line)["tool"] for line in log.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(recorded, ["note", "run", "note", "run"])
