from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import unittest

from artemis.api_worker import local
from artemis.roles import WorkflowError

from fakes import calls, mcp_server

FAKE_KEY = "fake-api-key-for-tests-31d0"
KEY_ENV = "ARTEMIS_TEST_API_KEY"


def tool_call(number, name, arguments):
    return {"id": f"call-{number}", "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}


class Endpoint:
    """A stub /chat/completions that answers a scripted list of messages (or one HTTP error) and records requests."""

    def __init__(self, test, replies, status=200):
        self.replies, self.requests = list(replies), []
        endpoint = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                endpoint.requests.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
                if status != 200:
                    self.send_response(status)
                    self.end_headers()
                    self.wfile.write(b'{"error": {"message": "slow down,\\n please"}}')
                    return
                message = endpoint.replies.pop(0) if len(endpoint.replies) > 1 else endpoint.replies[0]
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"choices": [{"message": message}]}).encode())

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        test.addCleanup(thread.join)
        test.addCleanup(server.server_close)
        test.addCleanup(server.shutdown)
        self.url = f"http://127.0.0.1:{server.server_port}/v1"


class ToolLoop(unittest.TestCase):
    """The API adapter: one model, a tool loop over the Artemis tools, local file tools only inside a worktree."""

    def setUp(self):
        self.folder = Path(self.enterContext(TemporaryDirectory()))
        self.tree = self.folder / "tree"
        self.tree.mkdir()
        table = {"note": {"noted": True}, "read_file": {"content": "broker file"}, "run": {"state": "held", "card": 2},
                 "env_names": {}}
        self.mcp, self.log = mcp_server(self.folder, table)

    def run_worker(self, endpoint, mode="host", key=FAKE_KEY, *extra):
        instructions = self.folder / "instructions.md"
        instructions.write_text("You are a worker.", encoding="utf-8")
        argv = [sys.executable, "-m", "artemis.api_worker", "--base-url", endpoint.url, "--model", "test-model",
                "--key-env", KEY_ENV, "--mode", mode, "--instructions", str(instructions), *extra, "--", *self.mcp]
        env = {name: value for name, value in os.environ.items() if name != KEY_ENV} | ({KEY_ENV: key} if key else {})
        return subprocess.run(argv, cwd=self.tree, input="Task #1: demo", capture_output=True, text=True,
                              encoding="utf-8", env=env, timeout=60)

    def test_on_the_host_it_offers_the_artemis_tools_and_keeps_the_key_from_them(self):
        endpoint = Endpoint(self, [
            {"role": "assistant", "content": None, "tool_calls": [
                tool_call(1, "note", {"text": "started"}), tool_call(2, "env_names", {}), tool_call(3, "shell", {})]},
            {"role": "assistant", "content": "  Host done.  "},
        ])
        result = self.run_worker(endpoint)
        self.assertEqual((result.returncode, result.stdout), (0, "Host done.\n"), result.stderr)
        self.assertIn("api: note", result.stderr)
        first, second = endpoint.requests
        self.assertEqual(first["path"], "/v1/chat/completions")
        self.assertEqual(first["auth"], "Bearer " + FAKE_KEY)
        self.assertNotIn(FAKE_KEY, json.dumps(first["body"]))
        self.assertEqual(first["body"]["model"], "test-model")
        self.assertEqual(first["body"]["messages"], [{"role": "system", "content": "You are a worker."},
                                                     {"role": "user", "content": "Task #1: demo"}])
        self.assertEqual({tool["function"]["name"] for tool in first["body"]["tools"]},
                         {"note", "read_file", "run", "env_names"})
        self.assertFalse(first["body"]["tools"][0]["function"]["parameters"]["additionalProperties"])
        answers = {message["tool_call_id"]: message["content"] for message in second["body"]["messages"]
                   if message["role"] == "tool"}
        self.assertEqual(json.loads(answers["call-1"]), {"noted": True})
        self.assertNotIn(KEY_ENV, json.loads(answers["call-2"]))
        self.assertEqual(answers["call-3"], "error: there is no tool called shell")
        self.assertEqual([call["tool"] for call in calls(self.log)], ["note", "env_names"])

    def test_in_a_worktree_the_file_tools_are_local_and_confined(self):
        endpoint = Endpoint(self, [
            {"role": "assistant", "tool_calls": [
                tool_call(1, "write_file", {"path": "src/result.txt", "content": "one\n"}),
                tool_call(2, "edit_file", {"path": "src/result.txt", "old": "one", "new": "two"}),
                tool_call(3, "read_file", {"path": "../outside.txt"}),
                tool_call(4, "list_dir", {"path": "."})]},
            {"role": "assistant", "content": "Wrote src/result.txt."},
        ])
        result = self.run_worker(endpoint, "repo", "")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.tree / "src" / "result.txt").read_text(encoding="utf-8"), "two\n")
        offered = {tool["function"]["name"] for tool in endpoint.requests[0]["body"]["tools"]}
        self.assertEqual(offered, {"note", "run", "env_names", "read_file", "list_dir", "write_file", "edit_file"})
        answers = [message["content"] for message in endpoint.requests[1]["body"]["messages"] if message["role"] == "tool"]
        self.assertEqual(answers[:2], ["wrote src/result.txt", "edited src/result.txt"])
        self.assertTrue(answers[2].startswith("error: "))
        self.assertEqual(answers[3], "src/")
        self.assertIsNone(endpoint.requests[0]["auth"])
        self.assertEqual(calls(self.log), [])

    def test_an_http_error_or_endless_tool_calls_end_the_turn_with_the_reason(self):
        result = self.run_worker(Endpoint(self, [], status=429))
        self.assertEqual(result.returncode, 1)
        self.assertIn('api worker: The API answered HTTP 429: {"error": {"message": "slow down,\\n please"}}',
                      result.stderr)
        busy = Endpoint(self, [{"role": "assistant", "tool_calls": [tool_call(1, "note", {"text": "again"})]}])
        result = self.run_worker(busy, "host", FAKE_KEY, "--max-turns", "2")
        self.assertEqual(result.returncode, 1)
        self.assertIn("No final answer after 2 model turns.", result.stderr)
        self.assertEqual(len(busy.requests), 2)


class LocalFiles(unittest.TestCase):
    def test_paths_stay_in_the_worktree_and_out_of_git_artemis_and_symlinks(self):
        root = Path(self.enterContext(TemporaryDirectory())).resolve()
        outside = root.parent / f"{root.name}-outside"
        outside.mkdir()
        self.addCleanup(outside.rmdir)
        (root / ".git").mkdir()
        (root / "app.py").write_text("VALUE = 1\n", encoding="utf-8", newline="\n")
        refused = [("read_file", {"path": "../x"}), ("read_file", {"path": "/etc/hosts"}),
                   ("write_file", {"path": ".git/config", "content": "x"}),
                   ("write_file", {"path": ".artemis/state", "content": "x"}),
                   ("list_dir", {"path": ".."}), ("list_dir", {"path": ".git"}),
                   ("edit_file", {"path": "app.py", "old": "missing", "new": "x"})]
        if os.name != "nt":
            (root / "link").symlink_to(outside)
            refused += [("write_file", {"path": "link/escape.txt", "content": "x"}), ("list_dir", {"path": "link"})]
        self.assertEqual(local(root, "read_file", {"path": "app.py"}), "VALUE = 1\n")
        self.assertEqual(local(root, "list_dir", {"path": "."}), "app.py")
        for name, args in refused:
            with self.subTest(name=name, args=args), self.assertRaises(WorkflowError):
                local(root, name, args)
        self.assertEqual(list(outside.iterdir()), [])
