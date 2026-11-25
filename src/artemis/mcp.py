"""`artemis mcp --run <token-file>`: the Artemis tools for any MCP client, over stdio.

Each line on stdin is one JSON-RPC 2.0 message, and each answer is one line on stdout. tools/list and tools/call
go to the home's broker (POST /broker/call on loopback, with the run's token); the rest is answered here. The shim
holds no state of its own: the token decides the tools, and the home carries them out.
"""

import argparse
import json
from pathlib import Path
import sys
import threading
import urllib.error
import urllib.request

from . import __version__

PROTOCOL = "2025-06-18"
KNOWN = (PROTOCOL, "2025-03-26", "2024-11-05")
PORT = 7411
TIMEOUT_S = 120             # a tool answers within 45 s; the rest is room for a busy home
INSTRUCTIONS = (
    "These are Artemis tools. Artemis carries each one out on this computer for the person you work for, inside "
    "one project, and records it. `run` takes argv, a program and its arguments, and starts no shell for it; a "
    "shell given an inline command is refused unless the project allows it. A result with state \"held\" means the "
    "person was asked on a card: do not retry it or work around it, report it. Paths are relative to the project "
    "folder.")


class Refused(Exception):
    """The home refused a call or could not be reached; the message is one plain sentence."""


class RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


class Shim:
    def __init__(self, token: str, port: int = PORT, out=None):
        self.token, self.url = token, f"http://127.0.0.1:{port}/broker/call"
        self._open = urllib.request.build_opener(urllib.request.ProxyHandler({})).open    # loopback: no proxy
        self._out = out if out is not None else sys.stdout.buffer
        self._lock = threading.Lock()

    def serve(self, stream) -> None:
        """Answer every message in `stream` (binary lines) until it ends. Tool calls run side by side."""
        calls = []
        for line in stream:
            if not line.strip():
                continue
            try:
                message = json.loads(line.decode("utf-8"))
            except ValueError:
                self._send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
                continue
            if isinstance(message, dict) and message.get("method") == "tools/call" and "id" in message:
                calls.append(threading.Thread(target=self.answer, args=(message,), daemon=True))
                calls[-1].start()
            else:
                self.answer(message)
        for call in calls:
            call.join()

    def answer(self, message) -> None:
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            self._send({"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request"}})
            return
        number, method = message.get("id"), message.get("method")
        if not isinstance(method, str) or "id" not in message:
            return      # a notification, or a client's reply to a request this shim never sends
        params = message.get("params")
        params = params if isinstance(params, dict) else {}
        try:
            reply = {"result": self._handle(method, params)}
        except Refused as error:
            reply = {"error": {"code": -32603, "message": str(error)}}
        except RpcError as error:
            reply = {"error": {"code": error.code, "message": str(error)}}
        self._send({"jsonrpc": "2.0", "id": number, **reply})

    def _handle(self, method: str, params: dict) -> dict:
        match method:
            case "initialize":
                asked = params.get("protocolVersion")
                return {"protocolVersion": asked if asked in KNOWN else PROTOCOL, "capabilities": {"tools": {}},
                        "serverInfo": {"name": "artemis", "version": __version__}, "instructions": INSTRUCTIONS}
            case "ping":
                return {}
            case "tools/list":
                return {"tools": self.post("tools/list", {})["tools"]}
            case "tools/call":
                name, arguments = params.get("name"), params.get("arguments")
                arguments = {} if arguments is None else arguments
                if not isinstance(name, str) or not isinstance(arguments, dict):
                    raise RpcError(-32602, "tools/call needs a tool name and an arguments object.")
                try:
                    text, failed = json.dumps(self.post(name, arguments), ensure_ascii=False), False
                except Refused as error:
                    text, failed = str(error), True
                return {"content": [{"type": "text", "text": text}], "isError": failed}
        raise RpcError(-32601, f"Method not found: {method}")

    def post(self, tool: str, args: dict):
        request = urllib.request.Request(
            self.url, data=json.dumps({"tool": tool, "args": args}).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json", "X-Artemis-Run": self.token})
        try:
            with self._open(request, timeout=TIMEOUT_S) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise Refused(_reason(error)) from None
        except TimeoutError:
            raise Refused("The Artemis home did not answer in time; the call may still be running.") from None
        except (urllib.error.URLError, ConnectionError):
            raise Refused("The Artemis home is not running, so no Artemis tool can be used now. Report it.") from None

    def _send(self, message: dict) -> None:
        line = (json.dumps(message, ensure_ascii=True) + "\n").encode("ascii")
        with self._lock:
            self._out.write(line)
            self._out.flush()


def _reason(error: urllib.error.HTTPError) -> str:
    try:
        data = json.loads(error.read().decode("utf-8"))
    except (ValueError, OSError):
        data = None
    said = data.get("error") or data.get("message") if isinstance(data, dict) else None
    return said if isinstance(said, str) and said else f"The Artemis home refused the call (HTTP {error.code})."


def _arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--run", required=True, type=Path, help="The run's token file, written by the home.")
    parser.add_argument("--port", type=int, default=PORT, help="The home's port on 127.0.0.1.")


def add_commands(sub) -> None:
    """`artemis mcp` for the CLI's subparsers."""
    parser = sub.add_parser("mcp", help="Serve one run's Artemis tools to an MCP client over stdin and stdout.")
    _arguments(parser)
    parser.set_defaults(func=_command)


def _command(args) -> int:
    try:
        token = args.run.read_text(encoding="utf-8").strip()
    except OSError as error:
        print(f"artemis mcp: cannot read the token file {args.run}: {error.strerror or error}", file=sys.stderr)
        return 2
    Shim(token, args.port).serve(sys.stdin.buffer)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="artemis mcp", description=__doc__.splitlines()[0])
    _arguments(parser)
    return _command(parser.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
