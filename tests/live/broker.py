"""A stand-in for the Artemis broker for live runs: the lead and worker tools over a real ledger, every call logged.

It serves MCP over stdio for one grant (a JSON token file naming the role, task, project and root). It covers what
the live runs need, and no more: the lead reads projects, tasks and files and creates tasks, notes and choice
cards; a worker reads and writes files under its root, leaves notes and runs its task's checks (any other command
is denied).

    python tests/live/broker.py --ledger DB --token FILE --log FILE
"""

import argparse
import json
from pathlib import Path
import shlex
import subprocess
import sys

from artemis.api_worker import local
from artemis.judge import Criterion
from artemis.ledger import Ledger
from artemis.roles import Role, WorkflowError

TEXT, NUMBER = {"type": "string"}, {"type": "integer"}
LIST = {"type": "array", "items": TEXT}


def schema(properties: dict, *required: str) -> dict:
    return {"type": "object", "properties": properties, "required": list(required), "additionalProperties": False}


LEAD = {
    "projects": ("Every project with its kind, path and task counts.", schema({})),
    "status": ("The open tasks of one project (or all) with their state and checks.", schema({"project": NUMBER})),
    "read_file": ("Read a text file of a project.", schema({"project": NUMBER, "path": TEXT}, "project", "path")),
    "list_dir": ("List a folder of a project.", schema({"project": NUMBER, "path": TEXT}, "project", "path")),
    "task_create": ("Create a task for a worker. checks are commands that must pass; files must exist after.",
                    schema({"project": NUMBER, "title": TEXT, "brief": TEXT, "kind": TEXT, "checks": LIST,
                            "files": LIST}, "project", "title", "brief")),
    "ask": ("Put a choice to the person as a card.", schema({"kind": TEXT, "what": TEXT, "why": TEXT, "options": LIST},
                                                          "kind", "what", "why", "options")),
    "note": ("Keep a note for your next turn.", schema({"text": TEXT, "project": NUMBER}, "text")),
}
WORKER = {
    "run": ("Run one of the task's checks by its argv. Other commands are denied here.",
            schema({"argv": LIST, "cwd": TEXT, "timeout_s": NUMBER}, "argv")),
    "check": ("Run every check of the task.", schema({})),
    "read_file": ("Read a text file of your working folder.", schema({"path": TEXT}, "path")),
    "list_dir": ("List a folder of your working folder.", schema({"path": TEXT}, "path")),
    "write_file": ("Create or replace a file of your working folder.", schema({"path": TEXT, "content": TEXT},
                                                                            "path", "content")),
    "note": ("Leave a note on the task.", schema({"text": TEXT}, "text")),
}


class Broker:
    def __init__(self, ledger: Ledger, grant: dict):
        self.ledger, self.grant = ledger, grant
        self.role = grant["role"]
        self.root = Path(grant["root"]).resolve()

    def tools(self) -> dict:
        return LEAD if self.role == "lead" else WORKER

    def checks(self) -> list[list[str]]:
        criteria = json.loads(self.ledger.task_brief(self.grant["task"])["criteria"])
        return [list(item["command"]) for item in criteria if item.get("command")]

    def project_root(self, project: int) -> Path:
        return Path(self.ledger.project(project)["path"]).resolve()

    def call(self, name: str, args: dict):
        ledger = self.ledger
        if self.role != "lead":
            if name in ("run", "check"):
                wanted = self.checks() if name == "check" else [list(args["argv"])]
                if any(argv not in self.checks() for argv in wanted):
                    return {"state": "denied", "why": "only the task's checks run here: " + json.dumps(self.checks())}
                results = []
                for argv in wanted:
                    done = subprocess.run(argv, cwd=self.root, capture_output=True, text=True, encoding="utf-8",
                                          errors="replace", timeout=min(int(args.get("timeout_s") or 300), 600))
                    results.append({"argv": argv, "exit_code": done.returncode,
                                    "output": (done.stdout + done.stderr)[-3000:]})
                return {"state": "done", "results": results}
            if name == "note":
                ledger.note(Role.WORKER, args["text"], task=self.grant["task"])
                return {"noted": True}
            return {"result": local(self.root, name, args)}
        if name == "projects":
            return [dict(id=row["id"], name=row["name"], kind=row["kind"], path=row["path"],
                         counts={key: value for key, value in ledger.counts(project=row["id"]).items() if value})
                    for row in ledger.projects()]
        if name == "status":
            rows = ledger.work(project=args.get("project"))
            return [dict(task=row["id"], project=row["project_id"], title=row["title"], state=row["state"],
                         checks=[item["label"] for item in json.loads(ledger.task_brief(row["id"])["criteria"])])
                    for row in rows]
        if name in ("read_file", "list_dir"):
            return {"result": local(self.project_root(args["project"]), name, {"path": args["path"]})}
        if name == "task_create":
            criteria = tuple(Criterion(check, command=tuple(shlex.split(check))) for check in args.get("checks") or [])
            criteria += tuple(Criterion(f"{path} exists", artifact=path) for path in args.get("files") or [])
            request = ledger.request(Role.HOME, args["title"], args["project"], source="chat")
            task = ledger.add_task(Role.LEAD, request, args["title"], args["brief"], criteria, project=args["project"],
                                   kind=args.get("kind") or "code")
            return {"task": task, "state": "queued"}
        if name == "ask":
            if args["kind"] != "choice":
                return {"state": "denied", "why": "the lead asks only choices; Artemis cards the rest itself"}
            card = ledger.open_card(Role.LEAD, "choice", args["what"], args["why"], options=list(args["options"]))
            return {"card": card, "state": "waiting"}
        if name == "note":
            ledger.note(Role.LEAD, args["text"], project=args.get("project"))
            return {"noted": True}
        raise WorkflowError(f"there is no tool called {name}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", type=Path, required=True)
    parser.add_argument("--token", type=Path, required=True)
    parser.add_argument("--log", type=Path, required=True)
    args = parser.parse_args(argv)
    broker = Broker(Ledger(args.ledger), json.loads(args.token.read_text(encoding="utf-8")))
    for line in sys.stdin:
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if not isinstance(message, dict) or "id" not in message:
            continue
        method, params = message.get("method"), message.get("params") or {}
        result: dict = {}
        if method == "initialize":
            result = {"protocolVersion": params.get("protocolVersion", "2025-06-18"), "capabilities": {"tools": {}},
                      "serverInfo": {"name": "artemis", "version": "live-stand-in"}}
        elif method == "tools/list":
            result = {"tools": [{"name": name, "description": text, "inputSchema": shape}
                                for name, (text, shape) in broker.tools().items()]}
        elif method == "tools/call":
            name, arguments = params.get("name", ""), params.get("arguments") or {}
            try:
                if name not in broker.tools():
                    raise WorkflowError(f"there is no tool called {name}")
                answer, failed = broker.call(name, arguments), False
            except Exception as error:      # the tool boundary: any failure is the model's answer, not a crash
                answer, failed = {"error": f"{type(error).__name__}: {error}"}, True
            text = json.dumps(answer)
            with args.log.open("a", encoding="utf-8") as file:
                file.write(json.dumps({"run": broker.grant.get("run"), "role": broker.role, "tool": name, "arguments": arguments,
                                       "answer": text[:400]}) + "\n")
            result = {"content": [{"type": "text", "text": text}], "isError": failed}
        elif method == "ping":
            result = {}
        sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": result}) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
