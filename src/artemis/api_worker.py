"""A worker or lead that is one model behind an OpenAI-compatible /chat/completions endpoint.

Artemis owns every tool this model has. The Artemis tools come from the MCP command given after `--`; in a repo
worktree the file tools are local and confined to the worktree, as the CLIs' own file tools are. Progress goes to
stderr and the final reply to stdout.

    python -m artemis.api_worker --base-url URL --model NAME --key-env NAME --mode repo|host [-- MCP COMMAND]
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from .roles import WorkflowError
from .worker_files import RESERVED, read_text, worker_path

RESPONSE_BYTES = 4 * 1024 * 1024
RESULT_CHARS = 20000
PROTOCOL = "2025-06-18"
INSTRUCTIONS = ("Do the task with the tools you have. Use run for any command. When you are done, reply with a "
                "short report of what you did and how you know it worked; that reply is your result.")
# In a repo the worktree's own files are read and edited here; the broker's file tools are for host folders.
BROKER_FILE_TOOLS = {"read_file", "list_dir", "write_file", "move", "trash"}


class McpClient:
    """A minimal MCP client over stdio: initialize, list tools, call tools."""

    def __init__(self, argv: list[str], env: dict[str, str]):
        self.process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                                        encoding="utf-8", errors="replace", env=env)
        self.last = 0
        self.request("initialize", {"protocolVersion": PROTOCOL, "capabilities": {},
                                    "clientInfo": {"name": "artemis-api-worker", "version": "1"}})
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _send(self, message: dict) -> None:
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()

    def request(self, method: str, params: dict) -> dict:
        self.last += 1
        self._send({"jsonrpc": "2.0", "id": self.last, "method": method, "params": params})
        for line in self.process.stdout:
            try:
                message = json.loads(line)
            except ValueError:
                continue
            if isinstance(message, dict) and message.get("id") == self.last:
                if "error" in message:
                    raise WorkflowError(f"The Artemis tools refused {method}: {message['error'].get('message')}")
                return message.get("result") or {}
        raise WorkflowError("The Artemis tools stopped answering.")

    def tools(self) -> list[dict]:
        return self.request("tools/list", {}).get("tools", [])

    def call(self, name: str, arguments: dict) -> str:
        result = self.request("tools/call", {"name": name, "arguments": arguments})
        text = "\n".join(item.get("text", "") for item in result.get("content", []) if item.get("type") == "text")
        return f"error: {text}" if result.get("isError") else text

    def close(self) -> None:
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()


def _schema(properties: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


TEXT = {"type": "string"}
LOCAL_TOOLS = [
    {"name": "read_file", "description": "Read one text file of the worktree.",
     "inputSchema": _schema({"path": TEXT}, ["path"])},
    {"name": "list_dir", "description": "List one folder of the worktree ('.' for the top).",
     "inputSchema": _schema({"path": TEXT}, ["path"])},
    {"name": "write_file", "description": "Create or replace one file of the worktree with the full content.",
     "inputSchema": _schema({"path": TEXT, "content": TEXT}, ["path", "content"])},
    {"name": "edit_file", "description": "Replace the one occurrence of old with new in a worktree file.",
     "inputSchema": _schema({"path": TEXT, "old": TEXT, "new": TEXT}, ["path", "old", "new"])},
]


def _folder(root: Path, name: str) -> Path:
    parts = [part for part in name.replace("\\", "/").split("/") if part not in ("", ".")]
    target = root.joinpath(*parts).resolve()
    if ".." in parts or any(part.casefold() in RESERVED for part in parts) or not target.is_relative_to(root):
        raise WorkflowError("Folders are named relative to the worktree, outside Git and Artemis state.")
    return target


def local(root: Path, name: str, args: dict) -> str:
    """The worktree file tools. Paths stay inside the worktree, outside .git and .artemis, and skip symlinks."""
    if name == "list_dir":
        folder = _folder(root, args.get("path", "."))
        entries = [f"{item.name}/" if item.is_dir() else item.name for item in sorted(folder.iterdir())
                   if item.name.casefold() not in RESERVED and not item.is_symlink()]
        return "\n".join(entries) or "(empty)"
    path = worker_path(root, str(args["path"]))
    if name == "read_file":
        return read_text(path, RESULT_CHARS)
    if name == "write_file":
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(args["content"]), encoding="utf-8", newline="")
        return f"wrote {args['path']}"
    text = read_text(path, 1024 * 1024)
    if text.count(str(args["old"])) != 1:
        raise WorkflowError("old must occur exactly once in the file; read it and quote a unique piece.")
    path.write_text(text.replace(str(args["old"]), str(args["new"])), encoding="utf-8", newline="")
    return f"edited {args['path']}"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def complete(base_url: str, key: str, payload: dict) -> dict:
    headers = {"Content-Type": "application/json"} | ({"Authorization": "Bearer " + key} if key else {})
    request = Request(base_url.rstrip("/") + "/chat/completions", data=json.dumps(payload).encode("utf-8"),
                      headers=headers)
    handlers = [NoRedirect()] + ([ProxyHandler({})] if base_url.startswith("http://") else [])
    try:
        with build_opener(*handlers).open(request, timeout=300) as response:
            data = response.read(RESPONSE_BYTES + 1)
    except HTTPError as error:
        detail = error.read(2000).decode("utf-8", "replace")
        raise WorkflowError(f"The API answered HTTP {error.code}: {' '.join(detail.split())[:300]}") from None
    except (URLError, OSError, ValueError) as error:
        raise WorkflowError(f"The API could not be reached: {error}") from None
    if len(data) > RESPONSE_BYTES:
        raise WorkflowError("The API reply exceeds the size limit.")
    try:
        message = json.loads(data)["choices"][0]["message"]
        if not isinstance(message, dict):
            raise TypeError
        return message
    except (ValueError, KeyError, IndexError, TypeError):
        raise WorkflowError("The API reply has no message.") from None


def work(args: argparse.Namespace, prompt: str, key: str, tools: McpClient | None) -> str:
    root = Path.cwd().resolve()
    offered = [tool for tool in (tools.tools() if tools else [])
               if args.mode == "host" or tool["name"] not in BROKER_FILE_TOOLS]
    offered += LOCAL_TOOLS if args.mode == "repo" else []
    functions = [{"type": "function", "function": {"name": tool["name"], "description": tool.get("description", ""),
                                                   "parameters": tool.get("inputSchema") or _schema({}, [])}}
                 for tool in offered]
    system = Path(args.instructions).read_text(encoding="utf-8") if args.instructions else INSTRUCTIONS
    messages: list[dict] = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    for _ in range(args.max_turns):
        payload = {"model": args.model, "messages": messages} | ({"tools": functions} if functions else {})
        message = complete(args.base_url, key, payload)
        messages.append(message)
        calls = message.get("tool_calls") or []
        if not calls:
            return str(message.get("content") or "")
        for call in calls:
            name = call.get("function", {}).get("name", "")
            print(f"api: {name}", file=sys.stderr, flush=True)
            try:
                arguments = json.loads(call["function"].get("arguments") or "{}")
                if args.mode == "repo" and name in {tool["name"] for tool in LOCAL_TOOLS}:
                    result = local(root, name, arguments)
                elif tools is not None and any(tool["name"] == name for tool in offered):
                    result = tools.call(name, arguments)
                else:
                    result = f"error: there is no tool called {name}"
            except (WorkflowError, OSError, ValueError, KeyError, TypeError, UnicodeError) as error:
                result = f"error: {error}"
            messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": result[:RESULT_CHARS]})
    raise WorkflowError(f"No final answer after {args.max_turns} model turns.")


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    split = argv.index("--") if "--" in argv else len(argv)
    parser = argparse.ArgumentParser(prog="artemis.api_worker")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--key-env", required=True)
    parser.add_argument("--mode", choices=("repo", "host"), default="host")
    parser.add_argument("--instructions")
    parser.add_argument("--max-turns", type=int, default=30)
    args = parser.parse_args(argv[:split])
    mcp = argv[split + 1:]
    key = os.environ.get(args.key_env, "")
    child_env = {name: value for name, value in os.environ.items() if name != args.key_env}
    tools = None
    try:
        tools = McpClient(mcp, child_env) if mcp else None
        print(work(args, sys.stdin.read(), key, tools).strip())
        return 0
    except (WorkflowError, OSError) as error:
        print(f"api worker: {error}", file=sys.stderr)
        return 1
    finally:
        if tools is not None:
            tools.close()


if __name__ == "__main__":
    sys.exit(main())
