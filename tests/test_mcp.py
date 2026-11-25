from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading
import time
import unittest
from unittest.mock import patch

from artemis import mcp

TOKEN = "demo-run-token"
TOOLS = [{"name": "read_file", "description": "Read a file.",
          "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}]


class StubHome(BaseHTTPRequestHandler):
    """mock of the home's POST /broker/call: answers from a table instead of a broker."""

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])).decode("utf-8"))
        self.server.seen.append((self.path, self.headers["X-Artemis-Run"], body))
        if self.headers["X-Artemis-Run"] != TOKEN:
            return self.reply(403, {"error": "This run has ended."})
        tool, args = body["tool"], body["args"]
        if tool == "tools/list":
            return self.reply(200, {"tools": TOOLS})
        if tool == "read_file":
            return self.reply(200, {"content": f"contents of {args.get('path')}", "truncated": False})
        if tool == "slow":
            time.sleep(0.5)
            return self.reply(200, {"slow": True})
        if tool == "hello":
            return self.reply(200, {"text": "안녕"})
        if tool == "broken":
            return self.reply(500, None)
        return self.reply(400, {"error": f"{tool} is not one of your tools."})

    def reply(self, status, data):
        raw = b"oops" if data is None else json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args):
        pass


class ShimTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), StubHome)
        self.server.seen = []
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.port = self.server.server_address[1]

    def exchange(self, *messages, token=TOKEN, port=None):
        """Feed lines to a shim and return the JSON answers, in the order they were written."""
        out = io.BytesIO()
        lines = b"".join(item if isinstance(item, bytes) else (json.dumps(item) + "\n").encode("utf-8")
                         for item in messages)
        mcp.Shim(token, self.port if port is None else port, out).serve(io.BytesIO(lines))
        raw = out.getvalue()
        raw.decode("ascii")         # every answer is plain ASCII on the wire
        return [json.loads(line) for line in raw.splitlines()]

    def test_a_session_from_initialize_to_a_tool_call(self):
        answers = self.exchange(
            {"jsonrpc": "2.0", "id": 1, "method": "initialize",
             "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                        "clientInfo": {"name": "demo-client", "version": "1"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
             "params": {"name": "read_file", "arguments": {"path": "hello.txt"}}},
            {"jsonrpc": "2.0", "id": "four", "method": "ping"})
        self.assertEqual(sorted(str(answer["id"]) for answer in answers), ["1", "2", "3", "four"])
        answers = sorted(answers, key=lambda answer: str(answer["id"]))     # a tool call is answered when it ends
        init = answers[0]["result"]
        self.assertEqual(init["protocolVersion"], "2025-06-18")
        self.assertEqual(init["capabilities"], {"tools": {}})
        self.assertEqual(init["serverInfo"]["name"], "artemis")
        self.assertIn("held", init["instructions"])
        self.assertEqual(answers[1]["result"], {"tools": TOOLS})
        call = answers[2]["result"]
        self.assertFalse(call["isError"])
        self.assertEqual(json.loads(call["content"][0]["text"]), {"content": "contents of hello.txt",
                                                                  "truncated": False})
        self.assertEqual(answers[3], {"jsonrpc": "2.0", "id": "four", "result": {}})
        self.assertEqual([(path, token, body["tool"]) for path, token, body in self.server.seen],
                         [("/broker/call", TOKEN, "tools/list"), ("/broker/call", TOKEN, "read_file")])

    def test_protocol_versions(self):
        for asked, answered in (("2025-03-26", "2025-03-26"), ("2024-11-05", "2024-11-05"),
                                ("1999-01-01", mcp.PROTOCOL), (None, mcp.PROTOCOL)):
            with self.subTest(asked=asked):
                answer = self.exchange({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                                        "params": {"protocolVersion": asked}})[0]
                self.assertEqual(answer["result"]["protocolVersion"], answered)

    def test_a_refusal_is_a_tool_error_the_model_reads(self):
        answers = self.exchange(
            {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "run", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "broken", "arguments": None}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "read_file"}})
        answers = sorted(answers, key=lambda answer: answer["id"])
        self.assertEqual(answers[0]["result"], {"content": [{"type": "text", "text": "run is not one of your tools."}],
                                                "isError": True})
        self.assertEqual(answers[1]["result"]["content"][0]["text"], "The Artemis home refused the call (HTTP 500).")
        self.assertFalse(answers[2]["result"]["isError"])       # no arguments is an empty object
        self.assertIn(("/broker/call", TOKEN, {"tool": "read_file", "args": {}}), self.server.seen)
        ended = self.exchange({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                               "params": {"name": "read_file", "arguments": {"path": "a"}}}, token="old-token")
        self.assertEqual(ended[0]["result"]["content"][0]["text"], "This run has ended.")

    def test_protocol_errors(self):
        answers = self.exchange(
            b"{not json\n",
            {"id": 1, "method": "ping"},
            [1, 2],
            {"jsonrpc": "2.0", "id": 2, "method": "resources/list"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"arguments": {}}},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "read_file", "arguments": [1]}},
            {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 9}},
            {"jsonrpc": "2.0", "id": 9, "result": {}},
            b"\n")
        self.assertEqual([(answer["id"], answer["error"]["code"]) for answer in answers],
                         [(None, -32700), (None, -32600), (None, -32600), (2, -32601), (3, -32602), (4, -32602)])

    def test_tool_calls_run_side_by_side(self):
        answers = self.exchange(
            {"jsonrpc": "2.0", "id": "slow", "method": "tools/call", "params": {"name": "slow", "arguments": {}}},
            {"jsonrpc": "2.0", "id": "fast", "method": "tools/call", "params": {"name": "hello", "arguments": {}}})
        self.assertEqual([answer["id"] for answer in answers], ["fast", "slow"])
        self.assertEqual(json.loads(answers[0]["result"]["content"][0]["text"]), {"text": "안녕"})

    def test_a_home_that_is_not_running_is_said_plainly(self):
        self.server.shutdown()
        self.server.server_close()
        answer = self.exchange({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                                "params": {"name": "read_file", "arguments": {"path": "a"}}})[0]
        self.assertTrue(answer["result"]["isError"])
        self.assertIn("not running", answer["result"]["content"][0]["text"])
        listed = self.exchange({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})[0]
        self.assertEqual(listed["error"]["code"], -32603)

    def test_a_proxy_in_the_environment_is_not_used_for_the_home(self):
        with patch.dict(os.environ, {"HTTP_PROXY": "http://127.0.0.1:9", "http_proxy": "http://127.0.0.1:9",
                                     "NO_PROXY": "", "no_proxy": ""}):
            answer = self.exchange({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})[0]
        self.assertEqual(answer["result"], {"tools": TOOLS})

    def test_artemis_mcp_runs_as_its_own_process(self):
        with TemporaryDirectory() as scratch:
            token = Path(scratch) / "run.token"
            token.write_text(TOKEN + "\n", encoding="utf-8")
            lines = "".join(json.dumps(message) + "\n" for message in (
                {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
                {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                 "params": {"name": "read_file", "arguments": {"path": "hello.txt"}}}))
            done = subprocess.run([sys.executable, "-m", "artemis.mcp", "--run", str(token), "--port", str(self.port)],
                                  input=lines.encode("utf-8"), capture_output=True, timeout=60)
            missing = subprocess.run([sys.executable, "-m", "artemis.mcp", "--run", str(Path(scratch) / "none")],
                                     input=b"", capture_output=True, timeout=60)
        self.assertEqual(done.returncode, 0, done.stderr)
        answers = [json.loads(line) for line in done.stdout.decode("ascii").splitlines()]
        self.assertEqual([answer["id"] for answer in answers], [1, 2])
        self.assertIn("contents of hello.txt", answers[1]["result"]["content"][0]["text"])
        self.assertEqual(missing.returncode, 2)
        self.assertIn(b"cannot read the token file", missing.stderr)


if __name__ == "__main__":
    unittest.main()
