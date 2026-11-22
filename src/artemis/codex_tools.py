"""Expose scoped worktree reads and task checks to a shell-disabled Codex worker."""

import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryFile

from .process import check_env, executable
from .roles import WorkflowError
from .worker_files import read_text, tracked_paths, worker_path

TOOLS = [
    {"name": "list_files", "description": "List tracked files in this task's worktree.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "read_file", "description": "Read a UTF-8 file inside this task's worktree.",
     "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "run_check", "description": "Run one of the task's configured checks by its 1-based index.",
     "inputSchema": {"type": "object", "properties": {"number": {"type": "integer"}}, "required": ["number"]}},
]


def call(root: Path, checks: tuple[tuple[str, ...], ...], name: str, args: dict, pass_env: tuple[str, ...] = ()) -> str:
    match name:
        case "list_files":
            return "\n".join(tracked_paths(root))[:64_000]
        case "read_file" if isinstance(args.get("path"), str):
            return read_text(worker_path(root, args["path"]))
        case "run_check" if type(args.get("number")) is int and 1 <= args["number"] <= len(checks):
            command = checks[args["number"] - 1]
            with TemporaryFile() as output:
                result = subprocess.run(
                    command, executable=executable(command), cwd=root, env=check_env(pass_env),
                    stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, timeout=90, check=False,
                )
                output.seek(max(0, output.tell() - 8_000))
                return f"Exit code {result.returncode}\n{output.read().decode('utf-8', errors='replace')}"
        case _:
            raise WorkflowError("Use a worktree path or the number of an available task check.")


def serve(root: Path, checks: tuple[tuple[str, ...], ...], pass_env: tuple[str, ...] = ()) -> None:
    for line in sys.stdin:
        request = json.loads(line)
        if "id" not in request:
            continue
        envelope = {"jsonrpc": "2.0", "id": request["id"]}
        params = request.get("params", {})
        match request.get("method"):
            case "initialize":
                result = {"protocolVersion": params.get("protocolVersion", "2024-11-05"),
                          "capabilities": {"tools": {}}, "serverInfo": {"name": "artemis-worktree", "version": "1"}}
            case "ping":
                result = {}
            case "tools/list":
                result = {"tools": TOOLS}
            case "tools/call":
                try:
                    text = call(root, checks, params.get("name"), params.get("arguments", {}), pass_env)
                except (OSError, ValueError, subprocess.SubprocessError, WorkflowError):
                    result = {"isError": True, "content": [{"type": "text", "text": "Worktree tool refused or failed."}]}
                else:
                    result = {"content": [{"type": "text", "text": text}]}
            case _:
                print(json.dumps(envelope | {"error": {"code": -32601, "message": "Unknown method"}}), flush=True)
                continue
        print(json.dumps(envelope | {"result": result}), flush=True)


if __name__ == "__main__":
    serve(Path(sys.argv[1]), tuple(map(tuple, json.loads(sys.argv[2]))), tuple(json.loads(sys.argv[3])))
