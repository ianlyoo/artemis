import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import secrets
import shlex
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import time
import tomllib
import unittest
from unittest.mock import patch

from artemis import worker_adapters
from artemis.agents import launch, pick
from artemis.config import Config
from artemis.roles import WorkflowError
from artemis.worker_adapters import (GEMINI_FILE_TOOLS, LEAD_TOOLS, WORKER_TOOLS, claude_turn, codex_features,
                                     codex_turn, delta, gemini_turn, opencode_turn)
from artemis.worker_files import snapshot

from fakes import FakeVault, config, fake_cli
from helpers import git, isolated_env, repository, serve

FAKE_KEY = "fake-key-for-tests-0000"
MCP = ["python3", "-m", "artemis.mcp", "--run", "/tmp/run/1.token", "--port", "7411"]


class Builders(unittest.TestCase):
    """Each provider's argv, environment and per-run files, per role and mode (CONTRACTS §13 A–C)."""

    def setUp(self):
        self.scratch = Path(self.enterContext(TemporaryDirectory()))
        self.cwd = self.scratch / "tree"
        self.cwd.mkdir()
        self.settings = config(gemini={"model": "gemini-test"}, opencode={"model": "google/gemini-test"},
                               api={"base_url": "http://127.0.0.1:9/v1", "model": "test-model", "key": "TEST_API_KEY"})
        self.vault = FakeVault({"GEMINI_API_KEY": FAKE_KEY, "TEST_API_KEY": FAKE_KEY})

    def build(self, name, role="worker", mode="repo", run="run", instructions="Be brief."):
        return launch(name, role=role, mode=mode, cwd=self.cwd, prompt="Task #1: demo", mcp=MCP,
                      config=self.settings, vault=self.vault, scratch=self.scratch / run, instructions=instructions)

    def test_claude_is_cold_restricted_and_reaches_only_the_artemis_tools(self):
        for role, mode, tools in (("lead", "repo", ""), ("worker", "host", ""),
                                  ("worker", "repo", "Read,Glob,Grep,Edit,Write")):
            with self.subTest(role=role, mode=mode):
                start = self.build("claude", role, mode, run=f"{role}-{mode}")
                argv = start.argv
                self.assertEqual(argv[argv.index("--tools") + 1], tools)
                for flag in ("--no-session-persistence", "--restricted", "--strict-mcp-config", "--no-chrome",
                             "--disable-slash-commands"):
                    self.assertIn(flag, argv)
                self.assertEqual(argv[argv.index("--permission-prompts") + 1], "none")
                self.assertEqual(argv[argv.index("--allowedTools") + 1], "mcp__artemis__*")
                servers = json.loads(Path(argv[argv.index("--mcp-config") + 1]).read_text(encoding="utf-8"))
                self.assertEqual(Path(argv[argv.index("--mcp-config") + 1]).name, "mcp.json")
                self.assertEqual(servers["mcpServers"]["artemis"], {"command": MCP[0], "args": MCP[1:]})
                prompt_file = Path(argv[argv.index("--append-system-prompt-file") + 1])
                self.assertEqual(prompt_file.read_text(encoding="utf-8"), "Be brief.")
                self.assertNotIn("--resume", argv)
                self.assertNotIn("--session-id", argv)
                self.assertEqual("--include-partial-messages" in argv, role == "lead")
                self.assertEqual("acceptEdits" in argv, tools != "")
                self.assertEqual(start.stdin, "Task #1: demo")

    def test_codex_disables_only_listed_features_and_picks_the_sandbox_by_mode(self):
        listed = {"shell_tool": True, "apps": True, "code_mode": False, "code_mode_host": True, "goals": False,
                  "unified_exec": True, "web_search": True}
        with patch.object(worker_adapters, "codex_features", return_value=listed):
            code, lead = self.build("codex"), self.build("codex", "lead", run="lead")
        for argv in (code.argv, lead.argv):
            disabled = [argv[at + 1] for at, arg in enumerate(argv) if arg == "--disable"]
            self.assertEqual(disabled, ["shell_tool", "apps", "code_mode", "goals"])
            self.assertIn('mcp_servers.artemis.env_vars=["PYTHONPATH"]', argv)
            self.assertEqual(argv[:3], ["codex", "-a", "never"])
            self.assertIn('web_search="disabled"', argv)
            self.assertIn(f"mcp_servers.artemis.command={json.dumps(MCP[0])}", argv)
            self.assertIn("mcp_servers.artemis.required=true", argv)
        tail = ["--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "-"]
        self.assertEqual(code.argv[code.argv.index("exec"):],
                         ["exec", "--json", "--ephemeral", "--sandbox", "workspace-write", "-C",
                          os.path.realpath(self.cwd), *tail])
        self.assertEqual(lead.argv[lead.argv.index("exec"):],
                         ["exec", "--json", "--ephemeral", "--sandbox", "read-only", *tail])
        self.assertEqual(code.stdin, "Be brief.\n\nTask #1: demo")
        self.assertFalse(any("Be brief." in arg for arg in code.argv))

    @unittest.skipIf(os.name == "nt", "the fake prints through a POSIX shell shim")
    def test_codex_features_are_read_from_the_installed_binary(self):
        entry = fake_cli(self.scratch, "codex", """
print("shell_tool                       stable            true")
print("browser_use                      under development false")
print("old_thing                        removed           false")
print("unified_exec                     stable            true")
""")
        self.assertEqual(codex_features(str(entry)), {"shell_tool": True, "browser_use": False, "unified_exec": True})

    def test_gemini_denies_every_tool_but_the_artemis_verbs(self):
        for role, mode, verbs, native in (("worker", "repo", WORKER_TOOLS, GEMINI_FILE_TOOLS),
                                          ("worker", "host", WORKER_TOOLS, ()), ("lead", "host", LEAD_TOOLS, ())):
            with self.subTest(role=role, mode=mode):
                if role == "lead":
                    with self.assertRaises(WorkflowError):
                        self.build("gemini", role, mode)
                    continue
                start = self.build("gemini", role, mode, run=f"{role}-{mode}")
                argv = start.argv
                self.assertEqual(argv[:7], ["gemini", "-p", "Use the task on stdin", "--output-format", "stream-json",
                                            "--allowed-mcp-server-names", "artemis"])
                policy = tomllib.loads(Path(argv[argv.index("--admin-policy") + 1]).read_text(encoding="utf-8"))
                rules = policy["rule"]
                self.assertEqual(rules[0], {"toolName": "*", "decision": "deny", "priority": 100})
                allowed = [rule["toolName"] for rule in rules if rule.get("mcpName") == "artemis"]
                self.assertEqual(allowed, list(verbs))
                self.assertTrue(all(rule["priority"] == 200 for rule in rules[1:]))
                self.assertEqual([rule["toolName"] for rule in rules[1:] if "mcpName" not in rule], list(native))
                home = Path(start.env["GEMINI_CLI_HOME"])
                self.assertTrue(home.is_relative_to(self.scratch))
                settings = json.loads((home / ".gemini" / "settings.json").read_text(encoding="utf-8"))
                self.assertEqual(settings["tools"], {"core": list(native)})
                self.assertEqual(settings["hooksConfig"], {"enabled": False})
                self.assertIn("--skip-trust", argv)
                self.assertEqual(settings["mcpServers"]["artemis"]["command"], MCP[0])
                self.assertEqual(settings["security"]["auth"]["selectedType"], "gemini-api-key")
                self.assertEqual(start.env["GEMINI_API_KEY"], FAKE_KEY)
                self.assertEqual(argv[argv.index("-m") + 1], "gemini-test")
                self.assertEqual(start.stdin, "Be brief.\n\nTask #1: demo")

    def test_opencode_runs_a_deny_first_agent_from_its_config_content(self):
        for mode in ("repo", "host"):
            with self.subTest(mode=mode):
                start = self.build("opencode", mode=mode, run=mode)
                self.assertEqual(start.argv, ["opencode", "run", "--format", "json", "--agent", "artemis-worker",
                                              "--pure", "--title", "Artemis turn", "-m", "google/gemini-test"])
                self.assertEqual(start.env["OPENCODE_DISABLE_PROJECT_CONFIG"], "1")
                self.assertEqual(start.env["GOOGLE_GENERATIVE_AI_API_KEY"], FAKE_KEY)
                profile = json.loads(start.env["OPENCODE_CONFIG_CONTENT"])
                self.assertEqual(profile["small_model"], "google/gemini-test")
                rules = profile["agent"]["artemis-worker"]["permission"]
                self.assertEqual(list(rules)[0], "*")
                self.assertEqual(rules["*"], "deny")
                self.assertEqual({key for key, value in rules.items() if value == "allow"},
                                 {"read", "glob", "grep", "list", "artemis_*"} | ({"edit"} if mode == "repo" else set()))
                self.assertEqual(profile["mcp"]["artemis"]["command"], MCP)

    def test_api_and_mock_run_as_artemis_processes(self):
        start = self.build("api", "lead", run="api")
        self.assertEqual(start.argv[1:3], ["-m", "artemis.api_worker"])
        self.assertEqual(start.argv[start.argv.index("--mode") + 1], "host")
        self.assertEqual(start.argv[start.argv.index("--key-env") + 1], "TEST_API_KEY")
        self.assertEqual(start.argv[start.argv.index("--") + 1:], MCP)
        self.assertEqual(start.env, {"TEST_API_KEY": FAKE_KEY, "PWD": str(self.cwd.absolute())})
        self.assertNotIn(FAKE_KEY, " ".join(start.argv))
        self.settings.api["model"] = ""
        with self.assertRaisesRegex(WorkflowError, "model"):
            self.build("api", run="api-empty")
        mock = self.build("mock", "lead", run="mock")
        self.assertEqual(mock.argv[1:], ["-m", "artemis.mock_worker", "--role", "lead", "--mode", "host", "--", *MCP])

    def test_launch_refuses_unknown_providers_roles_and_worker_only_leads(self):
        for name, role, mode in (("unknown", "worker", "repo"), ("claude", "judge", "repo"),
                                 ("claude", "worker", "folder"), ("opencode", "lead", "host")):
            with self.subTest(name=name, role=role, mode=mode), self.assertRaises(WorkflowError):
                self.build(name, role, mode)
        with self.assertRaisesRegex(WorkflowError, "resumes no saved session"):
            launch("claude", role="worker", mode="repo", cwd=self.cwd, prompt="Task #1: demo", mcp=MCP,
                   config=self.settings, vault=self.vault, scratch=self.scratch / "resume", session="abc123")


class Readers(unittest.TestCase):
    """The final reply of each provider's output stream, and the text each line adds while it is written."""

    def lines(self, *events):
        return "\n".join(json.dumps(event) for event in events) + "\n"

    def test_claude_takes_the_result_and_raises_on_an_error_result(self):
        text = self.lines({"type": "system", "subtype": "init"},
                          {"type": "assistant", "message": {"usage": {"input_tokens": 5, "cache_read_input_tokens": 7}}},
                          {"type": "result", "subtype": "success", "is_error": False, "result": " Done. "})
        self.assertEqual(claude_turn(text).reply, "Done.")
        self.assertEqual(claude_turn(text).tokens, 12)
        with self.assertRaisesRegex(WorkflowError, "error_max_turns"):
            claude_turn(self.lines({"type": "result", "subtype": "error_max_turns", "is_error": True}))

    def test_codex_takes_the_last_message_and_raises_on_a_failed_turn(self):
        message = lambda text: {"type": "item.completed", "item": {"type": "agent_message", "text": text}}
        self.assertEqual(codex_turn(self.lines(message("first"), {"type": "error", "message": "retrying"},
                                               message("last"), {"type": "turn.completed"})).reply, "last")
        with self.assertRaisesRegex(WorkflowError, "usage limit"):
            codex_turn(self.lines({"type": "turn.failed", "error": {"message": "usage limit"}}))
        with self.assertRaises(WorkflowError):
            codex_turn(self.lines({"type": "error", "message": "stream closed"}))

    def test_gemini_takes_what_it_said_after_its_last_tool_call(self):
        text = self.lines({"type": "init"}, {"type": "message", "role": "assistant", "content": "Let me look", "delta": True},
                          {"type": "tool_use", "tool_name": "mcp_artemis_note"}, {"type": "tool_result"},
                          {"type": "message", "role": "assistant", "content": "All ", "delta": True},
                          {"type": "message", "role": "assistant", "content": "done.", "delta": True},
                          {"type": "result", "status": "success"})
        self.assertEqual(gemini_turn(text).reply, "All done.")
        with self.assertRaisesRegex(WorkflowError, "quota"):
            gemini_turn(self.lines({"type": "result", "status": "error", "error": {"message": "quota"}}))

    def test_opencode_takes_the_last_message_and_raises_on_an_error(self):
        part = lambda message, text: {"type": "text", "part": {"messageID": message, "text": text}}
        self.assertEqual(opencode_turn(self.lines(part("a", "first"), {"type": "tool_use"}, part("b", "last"),
                                                  part("b", " claim"))).reply, "last claim")
        with self.assertRaises(WorkflowError):
            opencode_turn(self.lines({"type": "error", "error": {"name": "ProviderAuthError"}}))

    def test_delta_shows_only_reply_text(self):
        claude = {"type": "stream_event", "event": {"type": "content_block_delta",
                                                    "delta": {"type": "text_delta", "text": "Hel"}}}
        self.assertEqual(delta("claude", json.dumps(claude)), "Hel")
        self.assertEqual(delta("codex", json.dumps({"type": "item.completed",
                                                    "item": {"type": "agent_message", "text": "Hi"}})), "Hi\n")
        self.assertEqual(delta("gemini", json.dumps({"type": "message", "role": "assistant", "content": "x"})), "x")
        self.assertEqual(delta("claude", json.dumps({"type": "result", "result": "no"})), "")
        self.assertEqual(delta("claude", "not json"), "")
        self.assertEqual(delta("api", "42\n"), "42\n")


class Project:
    """A throwaway repository with Artemis initialized, and fake agent CLIs on PATH."""

    def setUp(self):
        self.scratch = Path(self.enterContext(TemporaryDirectory()))
        self.repo = repository(self.scratch / "repo")
        home = self.scratch / "home"
        home.mkdir()
        self.bin = self.scratch / "bin"
        self.bin.mkdir()
        self.env = isolated_env(home)
        self.env["PATH"] = f"{self.bin}{os.pathsep}{self.env['PATH']}"
        self.env["ARTEMIS_LEAD"] = "mock"
        self.artemis("init")

    def artemis(self, *args, stdin=None):
        result = subprocess.run(
            (sys.executable, "-m", "artemis.cli", *args), cwd=self.repo, input=stdin,
            text=True, env=self.env, capture_output=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def configure(self, worker, extra="", home=""):
        """The project's worker and checks; home is added to the home's config.toml."""
        self.env["ARTEMIS_WORKER"] = worker
        (self.repo / "artemis.toml").write_text(
            f'[agents]\nworker = "{worker}"\n[ship]\nchecks = [[{json.dumps(sys.executable)}, "-m", "unittest"]]\n'
            f'{extra}', encoding="utf-8",
        )
        with (Path(self.env["ARTEMIS_HOME"]) / "config.toml").open("a", encoding="utf-8") as config:
            config.write(home)

    def ship(self, worker, claim):
        serve(self, self.env)
        request = self.artemis("request", "Write an adapter result")
        task = self.artemis("task", request, "Write a result", "--file", "result.txt",
                            "--check", f"{shlex.quote(sys.executable)} -m unittest")
        deadline = time.monotonic() + 30
        while "1 done" not in self.artemis("statusline") and time.monotonic() < deadline:
            time.sleep(0.1)
        evidence = self.artemis("show", "--task", task)
        self.assertIn(f"{worker} worker", evidence)
        self.assertIn(claim, evidence)
        self.assertIn("applied", evidence)
        self.assertNotIn("ignore this event", evidence.split("\nLast lines")[0])
        self.assertEqual(git(self.repo, "show", "main:result.txt"), "done")
        self.assertEqual(git(self.repo, "log", "-1", "--format=%s", "artemis/task-1"), "Write a result")


@unittest.skipIf(os.name == "nt", "serve() reads the home's output as UTF-8; on Windows it comes in the console code page")
class Shipping(Project, unittest.TestCase):
    """Each CLI starts from agents.launch inside a running home, and its edits ship through the supervisor."""

    def test_codex_runs_fenced_and_its_last_message_ships(self):
        self.configure("codex")
        (Path(self.env["HOME"]) / ".codex").mkdir()
        (Path(self.env["HOME"]) / ".codex" / "auth.json").write_text("{}", encoding="utf-8")
        fake_cli(self.bin, "codex", """
import json
import os
from pathlib import Path
import sys

argv = sys.argv[1:]
if argv == ["features", "list"]:
    print("shell_tool  stable  true\\nunknown_tool  stable  true\\nview_image  removed  false")
    sys.exit(0)
assert argv[:4] == ["-a", "never", "--disable", "shell_tool"], argv
assert argv.count("--disable") == 1, argv
assert argv[argv.index("exec"):] == ["exec", "--json", "--ephemeral", "--sandbox", "workspace-write", "-C",
                                     os.path.realpath(os.getcwd()), "--skip-git-repo-check", "--ignore-user-config",
                                     "--ignore-rules", "-"], argv
assert any(item.startswith("mcp_servers.artemis.args=") and "artemis.mcp" in item for item in argv), argv
assert os.path.realpath(os.environ["PWD"]) == os.path.realpath(os.getcwd())
assert "Write a result" in sys.stdin.read()
Path("result.txt").write_text("done")
for kind, text in [("reasoning", "ignore this event"), ("agent_message", "Codex final claim")]:
    print(json.dumps({"type": "item.completed", "item": {"type": kind, "text": text}}))
""")
        self.ship("codex", "Codex final claim")

    def test_opencode_runs_a_deny_first_agent_and_its_text_ships(self):
        data = self.scratch / "data"
        (data / "opencode").mkdir(parents=True)
        (data / "opencode" / "auth.json").write_text("{}", encoding="utf-8")
        self.env["XDG_DATA_HOME"] = str(data)
        self.configure("opencode", home='\n[opencode]\nmodel = "test/model"\n')
        fake_cli(self.bin, "opencode", """
import json
import os
from pathlib import Path
import sys

assert sys.argv[1:] == ["run", "--format", "json", "--agent", "artemis-worker", "--pure", "--title", "Artemis turn",
                        "-m", "test/model"], sys.argv
assert os.path.realpath(os.environ["PWD"]) == os.path.realpath(os.getcwd())
assert os.environ["OPENCODE_DISABLE_PROJECT_CONFIG"] == "1"
profile = json.loads(os.environ["OPENCODE_CONFIG_CONTENT"])
rules = profile["agent"]["artemis-worker"]["permission"]
assert list(rules.items())[0] == ("*", "deny"), rules
assert {name for name, value in rules.items() if value == "allow"} == {"read", "glob", "grep", "list", "edit",
                                                                       "artemis_*"}, rules
assert "artemis.mcp" in profile["mcp"]["artemis"]["command"]
assert "Write a result" in sys.stdin.read()
Path("result.txt").write_text("done")
print(json.dumps({"type": "tool_use", "part": {"text": "ignore this event"}}))
for text in ("OpenCode ", "final claim"):
    print(json.dumps({"type": "text", "part": {"messageID": "last", "text": text}}))
""")
        self.ship("opencode", "OpenCode final claim")

    def test_api_tool_loop_takes_its_key_from_the_vault_and_ships_edits(self):
        key = secrets.token_hex(16)
        requests = []

        class Endpoint(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                requests.append((self.path, self.headers.get("Authorization") == "Bearer " + key, body))
                if len(requests) == 1:
                    arguments = json.dumps({"path": "result.txt", "content": "done"})
                    message = {"role": "assistant", "content": None, "tool_calls": [
                        {"id": "call-1", "type": "function", "function": {"name": "write_file", "arguments": arguments}}]}
                else:
                    message = {"role": "assistant", "content": "API final claim"}
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"choices": [{"message": message}]}).encode())

            def log_message(self, *args):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), Endpoint) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                self.configure("api", home=f'\n[api]\nbase_url = "http://127.0.0.1:{server.server_port}/v1"\n'
                                           'model = "test-model"\nkey = "DEMO_API_KEY"\n')
                self.artemis("secret", "set", "DEMO_API_KEY", "--env", "--stdin", stdin=key + "\n")
                self.ship("api", "API final claim")
            finally:
                server.shutdown()
                thread.join()
        path, authenticated, body = requests[0]
        self.assertEqual(path, "/v1/chat/completions")
        self.assertTrue(authenticated)
        self.assertEqual(body["model"], "test-model")
        self.assertNotIn(key, json.dumps(body))
        self.assertIn("write_file", [tool["function"]["name"] for tool in body["tools"]])
        self.assertEqual(requests[1][2]["messages"][-1],
                         {"role": "tool", "tool_call_id": "call-1", "content": "wrote result.txt"})


class Pieces(Project, unittest.TestCase):
    def test_auto_takes_installed_clis_and_never_the_separately_billed_api(self):
        self.configure("auto", '\n[api]\nmodel = "test-model"\nkey_env = "CUSTOM_API_KEY"\n')
        settings = Config.load(self.repo)
        for binary in ("claude", "codex", "opencode", None):
            with self.subTest(binary=binary), patch("artemis.agents.shutil.which", side_effect=lambda exe: exe if exe == binary else None):
                with patch.dict(os.environ, {"CUSTOM_API_KEY": secrets.token_hex(16)}):
                    self.assertEqual(pick("auto", "worker", settings).name, binary or "mock")
                    self.assertEqual(pick("api", "worker", settings).name, "api")
        with patch("artemis.agents.shutil.which", return_value=None), patch.dict(os.environ, {"CUSTOM_API_KEY": ""}):
            with self.assertRaises(WorkflowError):
                pick("api", "worker", settings)

    def test_snapshot_skips_binary_untracked_symlink_and_oversized_files(self):
        for name, data in (("binary", b"\0"), ("large", b"x" * (64 * 1024 + 1)), ("untracked", b"local")):
            (self.repo / name).write_bytes(data)
        (self.repo / "link").symlink_to(self.repo / "app.py")
        git(self.repo, "add", "binary", "large", "link")
        self.assertEqual(set(snapshot(self.repo, exclude=secrets.token_hex(16))), {"app.py", "test_app.py"})
