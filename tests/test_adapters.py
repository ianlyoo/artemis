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
import unittest
from unittest.mock import patch

from artemis.agents import pick
from artemis.api_worker import apply_edits
from artemis.codex_tools import call
from artemis.config import Config
from artemis.roles import WorkflowError
from artemis.worker_adapters import codex_claim, opencode_claim
from artemis.worker_files import snapshot

from helpers import git, isolated_env, repository


class Adapters(unittest.TestCase):
    def setUp(self):
        self.scratch = Path(self.enterContext(TemporaryDirectory()))
        self.repo = repository(self.scratch / "repo")
        home = self.scratch / "home"
        home.mkdir()
        self.bin = self.scratch / "bin"
        self.bin.mkdir()
        self.env = isolated_env(home)
        self.env["PATH"] = f"{self.bin}{os.pathsep}{self.env['PATH']}"
        self.env["ARTEMIS_LEAD"] = "chat"
        self.artemis("init")

    def artemis(self, *args):
        result = subprocess.run(
            (sys.executable, "-m", "artemis.cli", *args), cwd=self.repo,
            text=True, env=self.env, capture_output=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def configure(self, worker, extra=""):
        (self.repo / "artemis.toml").write_text(
            f'[agents]\nworker = "{worker}"\n[ship]\nchecks = [["{sys.executable}", "-m", "unittest"]]\n'
            f'{extra}', encoding="utf-8",
        )

    def fake_cli(self, name, script):
        body = self.bin / f"{name}.py"
        body.write_text(script, encoding="utf-8")
        entry = self.bin / name
        entry.write_text(f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(body))} "$@"\n',
                         encoding="utf-8")
        entry.chmod(0o755)

    def ship(self, worker, claim):
        request = self.artemis("request", "Write an adapter result")
        task = self.artemis("task", request, "Write a result", "--file", "result.txt",
                            "--check", f"{shlex.quote(sys.executable)} -m unittest")
        deadline = time.monotonic() + 15
        while "1 done" not in self.artemis("statusline") and time.monotonic() < deadline:
            time.sleep(0.1)
        evidence = self.artemis("show", "--task", task)
        self.assertIn(f"{worker} worker", evidence)
        self.assertIn(claim, evidence)
        self.assertIn("applied", evidence)
        self.assertNotIn("ignore this event", evidence)
        self.assertEqual(git(self.repo, "show", "main:result.txt"), "done")
        self.assertEqual(git(self.repo, "log", "-1", "--format=%s", "artemis/task-1"), "Write a result")

    def test_codex_stream_and_argv_ship_through_the_supervisor(self):
        self.configure("codex")
        self.fake_cli("codex", """
import json
from pathlib import Path
import sys

argv = sys.argv[1:]
assert argv[:2] == ["-a", "never"]
exec_at = argv.index("exec")
assert argv[exec_at + 1:] == ["-C", str(Path.cwd()), "--sandbox", "workspace-write",
                              "--ephemeral", "--ignore-user-config", "--ignore-rules", "--json", "-"]
assert "features.shell_tool=false" in argv
assert "mcp_servers.artemis_worktree.required=true" in argv
assert 'mcp_servers.artemis_worktree.default_tools_approval_mode="approve"' in argv
assert "Write a result" in sys.stdin.read()
Path("result.txt").write_text("done")
for kind, text in [("reasoning", "ignore this event"), ("agent_message", "Codex final claim")]:
    print(json.dumps({"type": "item.completed", "item": {"type": kind, "text": text}}))
""")
        self.ship("codex", "Codex final claim")

    def test_opencode_profile_and_json_stream_ship_through_the_supervisor(self):
        self.configure("opencode", '\n[opencode]\nmodel = "test/model"\n')
        self.fake_cli("opencode", """
import json
import os
from pathlib import Path
import shlex
import sys

assert sys.argv[1:] == ["run", "--standalone", "--format", "json", "--agent", "artemis-worker",
                        "--model", "test/model"]
assert Path(os.environ["PWD"]) == Path.cwd()
profile = json.loads(os.environ["OPENCODE_CONFIG_CONTENT"])["agents"]["artemis-worker"]
rules = profile["permissions"]
assert rules[0] == {"action": "*", "resource": "*", "effect": "deny"}
assert {"action": "edit", "resource": "*", "effect": "allow"} in rules
assert {"action": "edit", "resource": ".git", "effect": "deny"} in rules
assert [rule["resource"] for rule in rules if rule["action"] == "shell" and rule["effect"] == "allow"] == [
    shlex.join([sys.executable, "-m", "unittest"])]
assert "Write a result" in sys.stdin.read()
Path("result.txt").write_text("done")
print(json.dumps({"type": "tool", "part": {"text": "ignore this event"}}))
for text in ("OpenCode ", "final claim"):
    print(json.dumps({"type": "text", "part": {"messageID": "last", "text": text}}))
""")
        self.ship("opencode", "OpenCode final claim")

    def test_api_stub_ships_edits_and_receives_a_bounded_snapshot(self):
        key = secrets.token_hex(16)
        requests = []

        class Endpoint(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                requests.append((self.path, self.headers.get("Authorization") == "Bearer " + key, body))
                message = json.dumps({"claim": "API final claim",
                                      "edits": [{"path": "result.txt", "content": "done\n"}]})
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"choices": [{"message": {"content": message}}]}).encode())

            def log_message(self, *args):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), Endpoint) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                self.configure("api", f'\n[api]\nbase_url = "http://127.0.0.1:{server.server_port}/v1"\n'
                                      'model = "test-model"\nkey_env = "ARTEMIS_TEST_API_KEY"\n')
                self.env["ARTEMIS_TEST_API_KEY"] = key
                self.ship("api", "API final claim")
            finally:
                server.shutdown()
                thread.join()
        path, authenticated, body = requests[0]
        self.assertEqual(path, "/v1/chat/completions")
        self.assertTrue(authenticated)
        self.assertEqual(body["model"], "test-model")
        self.assertFalse(key in json.dumps(body))
        self.assertEqual(json.loads(body["messages"][1]["content"])["files"]["app.py"], "VALUE = 1\n")

    def test_auto_takes_installed_clis_and_never_the_separately_billed_api(self):
        self.configure("auto", '\n[api]\nmodel = "test-model"\nkey_env = "CUSTOM_API_KEY"\n')
        config = Config.load(self.repo)
        for binary in ("claude", "codex", "opencode", None):
            with self.subTest(binary=binary), patch("artemis.agents.shutil.which", side_effect=lambda exe: exe if exe == binary else None):
                with patch.dict(os.environ, {"CUSTOM_API_KEY": secrets.token_hex(16)}):
                    self.assertEqual(pick("auto", "worker", config).name, binary or "mock")
                    self.assertEqual(pick("api", "worker", config).name, "api")
        with patch("artemis.agents.shutil.which", return_value=None), patch.dict(os.environ, {"CUSTOM_API_KEY": ""}):
            with self.assertRaises(WorkflowError):
                pick("api", "worker", config)

    def test_api_rejects_entire_plan_before_writes(self):
        (self.repo / "outside").symlink_to(self.scratch, target_is_directory=True)
        for invalid in ("/absolute", "../outside", ".git/config", ".artemis/ledger.db", "outside/escaped",
                        "folder/../escape", "RESULT.txt", "result.txt/nested"):
            edits = [{"path": "result.txt", "content": "would write"}, {"path": invalid, "content": "invalid"}]
            with self.subTest(path=invalid), self.assertRaises(WorkflowError):
                apply_edits(self.repo, json.dumps({"claim": "report", "edits": edits}))
            self.assertFalse((self.repo / "result.txt").exists())

    def test_snapshot_skips_binary_untracked_symlink_and_oversized_files(self):
        for name, data in (("binary", b"\0"), ("large", b"x" * (64 * 1024 + 1)), ("untracked", b"local")):
            (self.repo / name).write_bytes(data)
        (self.repo / "link").symlink_to(self.repo / "app.py")
        git(self.repo, "add", "binary", "large", "link")
        self.assertEqual(set(snapshot(self.repo, exclude=secrets.token_hex(16))), {"app.py", "test_app.py"})

    def test_codex_tools_accept_only_worktree_files_and_declared_checks(self):
        checks = ((sys.executable, "-c", "print('checked')"),)
        self.assertEqual(call(self.repo, checks, "read_file", {"path": "app.py"}), "VALUE = 1\n")
        self.assertIn("Exit code 0\nchecked", call(self.repo, checks, "run_check", {"number": 1}))
        for tool, args in (("read_file", {"path": "../repo/app.py"}), ("run_check", {"number": 2}),
                           ("run_check", {"command": "git status"}), ("shell", {})):
            with self.subTest(tool=tool, args=args), self.assertRaises(WorkflowError):
                call(self.repo, checks, tool, args)

    def test_claim_parsers_drop_preliminary_and_tool_messages(self):
        events = [json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": text}})
                  for text in ("first", "last")]
        self.assertEqual(codex_claim(events + ['{"type":"turn.completed"}']), "last")
        self.assertEqual(opencode_claim([
            '{"type":"text","part":{"messageID":"first","text":"first"}}',
            '{"type":"text","part":{"messageID":"last","text":"last"}}',
            '{"type":"text","part":{"messageID":"last","text":" claim"}}',
        ]), "last claim")
        with self.assertRaises(WorkflowError):
            opencode_claim(['{"type":"error"}'])
