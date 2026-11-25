"""The mock: a worker and a lead with no AI, so the whole flow can be tried without an account.

It is labelled mock everywhere it speaks. As a repo worker it makes canned edits for the demo project in its
worktree; as a host worker it sorts a folder or leaves a note through the Artemis tools; as the lead it splits
the person's sentence by a few rules and creates tasks and cards through the lead tools.

    python -m artemis.mock_worker --role worker|lead --mode repo|host [-- MCP COMMAND]
"""

import argparse
from dataclasses import dataclass
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import time
import tomllib

from .judge import Criterion
from .process import join_command
from .roles import Interrupt, WorkflowError


# The rule planner

ASKS = (
    (Interrupt.SEND, r"\b(post|publish|send|email|e-mail|tweet|announce|push|release it|message)\b"),
    (Interrupt.SPEND, r"\b(pay|buy|purchase|subscribe|order|upgrade the plan)\b"),
    (Interrupt.DELETE, r"\b(delete|wipe|erase|destroy|drop the database|remove for good)\b"),
)
WHY = {Interrupt.SEND: "it speaks in your name.", Interrupt.SPEND: "it spends money.",
       Interrupt.DELETE: "it cannot be undone."}


@dataclass(frozen=True)
class Plan:
    tasks: tuple[tuple[str, tuple[Criterion, ...]], ...]
    asks: tuple[tuple[Interrupt, str], ...]


def _title(clause: str) -> str:
    clause = clause.strip().rstrip(".!")
    return clause[:1].upper() + clause[1:]


def plan(sentence: str, checks: tuple[tuple[str, ...], ...]) -> Plan:
    """Split one sentence into parallel tasks and held-back actions, by its commas and conjunctions."""
    clauses = []
    for part in re.split(r",?\s+then\s+|;\s*|,\s+", sentence.strip()):
        pieces = re.split(r"\s+and\s+(?=a |an |the )", part)
        verb = pieces[0].split(" ", 1)[0]
        clauses.append(pieces[0])
        clauses.extend(f"{verb} {piece}" for piece in pieces[1:])
    tasks, asks = [], []
    for clause in filter(str.strip, clauses):
        kind = next((kind for kind, pattern in ASKS if re.search(pattern, clause, re.IGNORECASE)), None)
        if kind is not None:
            asks.append((kind, _title(clause)))
        elif re.search(r"\b(readme|document|docs?)\b", clause, re.IGNORECASE):
            flags = dict.fromkeys(re.findall(r"(?<!\w)--[a-z][\w-]*", sentence))
            checks_for_docs = tuple(Criterion(f"README mentions {flag}", command=("grep", "-q", "--", flag, "README.md"))
                                    for flag in flags) or (Criterion("README.md", artifact="README.md"),)
            tasks.append((_title(clause), checks_for_docs))
        else:
            tasks.append((_title(clause), tuple(Criterion(" ".join(c), command=c) for c in checks)))
    return Plan(tuple(tasks), tuple(asks))


def note_path(title: str) -> str:
    """Where a host mock leaves its note for a task, so the lead can name it as the check."""
    return "mock-notes/" + (re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48] or "task") + ".md"


def sorts(title: str) -> bool:
    return re.search(r"\b(sort|organi[sz]e|tidy)\b", title, re.IGNORECASE) is not None


# The repo worker's canned edits for the demo project

JSON_TEST = '''\
import json
import unittest

import todo


class JsonOutput(unittest.TestCase):
    def test_json_lists_every_item(self):
        args = todo.parse_args(["--json"])
        items = json.loads(todo.render(todo.select(todo.ITEMS, args), args))
        self.assertEqual([item["title"] for item in items][0], "Water the basil")


if __name__ == "__main__":
    unittest.main()
'''

DONE_TEST = '''\
import unittest

import todo


class DoneFilter(unittest.TestCase):
    def test_done_keeps_finished_items(self):
        args = todo.parse_args(["--done"])
        self.assertEqual(todo.render(todo.select(todo.ITEMS, args), args), "[x] Repot the mint")


if __name__ == "__main__":
    unittest.main()
'''

USAGE = """
## Usage

```sh
python3 todo.py           # the whole list
python3 todo.py --done    # only finished items
python3 todo.py --json    # the list as JSON, for scripts
```
"""


def _replace(path: Path, old: str, new: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        return False
    path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
    return True


def _json(tree: Path) -> str:
    todo = tree / "todo.py"
    if not (_replace(todo, "import argparse\n", "import argparse\nimport json\n")
            and _replace(todo, '    """Options that change how the list is printed."""\n',
                         '    """Options that change how the list is printed."""\n'
                         '    parser.add_argument("--json", action="store_true", help="print the list as JSON")\n')
            and _replace(todo, "def render(items, args):\n",
                         "def render(items, args):\n    if args.json:\n        return json.dumps(items)\n")):
        return ""
    (tree / "test_json.py").write_text(JSON_TEST, encoding="utf-8", newline="\n")
    return "Added --json to todo.py and test_json.py."


def _done(tree: Path) -> str:
    todo = tree / "todo.py"
    if not (_replace(todo, '    """Options that choose which items are printed."""\n',
                     '    """Options that choose which items are printed."""\n'
                     '    parser.add_argument("--done", action="store_true", help="only finished items")\n')
            and _replace(todo, "def select(items, args):\n",
                         'def select(items, args):\n    if args.done:\n'
                         '        return [item for item in items if item["done"]]\n')):
        return ""
    (tree / "test_done.py").write_text(DONE_TEST, encoding="utf-8", newline="\n")
    return "Added --done to todo.py and test_done.py."


def _readme(tree: Path) -> str:
    readme = tree / "README.md"
    if not readme.exists():
        return ""
    with readme.open("a", encoding="utf-8", newline="\n") as stream:
        stream.write(USAGE)
    return "Added a Usage section to README.md."


def repo_worker(tree: Path, number: int, title: str) -> str:
    lowered = title.lower()
    claim = ""
    if "json" in lowered:
        claim = _json(tree)
    elif "--done" in lowered or "done filter" in lowered:
        claim = _done(tree)
    elif "readme" in lowered or "document" in lowered:
        claim = _readme(tree)
    if not claim:
        notes = tree / "mock-notes"
        notes.mkdir(exist_ok=True)
        (notes / f"task-{number}.md").write_text(f"# {title}\n\nA mock worker left this note.\n", encoding="utf-8")
        claim = f"Wrote mock-notes/task-{number}.md (the mock has no canned change for this task)."
    return claim


# Host work and the lead, both through the Artemis tools

def _result(text: str) -> dict:
    if text.startswith("error: "):
        raise WorkflowError(text.removeprefix("error: "))
    try:
        value = json.loads(text)
    except ValueError:
        return {"text": text}
    return value if isinstance(value, dict) else {"items": value}


def host_worker(tools, title: str) -> str:
    """Sort a folder's top-level files into one folder per extension and write summary.csv, or leave a note."""
    if not sorts(title):
        path = note_path(title)
        _result(tools.call("write_file", {"path": path, "content": f"# {title}\n\nA mock worker left this note.\n"}))
        return f"Wrote {path} (the mock has no canned change for this task)."
    entries = _result(tools.call("list_dir", {"path": "."})).get("entries", [])
    rows = ["file,moved to"]
    for entry in entries:
        name = PurePosixPath(entry["path"]).name
        if entry.get("kind") != "file" or name == "summary.csv" or name.startswith("."):
            continue
        folder = (PurePosixPath(name).suffix.lstrip(".").lower() or "other")
        _result(tools.call("move", {"src": entry["path"], "dst": f"{folder}/{name}"}))
        rows.append(f"{name},{folder}/")
    _result(tools.call("write_file", {"path": "summary.csv", "content": "\n".join(rows) + "\n"}))
    return f"Moved {len(rows) - 1} files into folders by type and wrote summary.csv."


FOCUS = re.compile(r"^Focus: #(\d+) (\S+) \((repo|folder)\)", re.MULTILINE)
SAID = re.compile(r"^you \(message #\d+\): (.+)", re.MULTILINE | re.DOTALL)
WOKEN = re.compile(r"^artemis \(system\): (.+)", re.MULTILINE)


def _repo_checks(tools, project: int) -> tuple[tuple[str, ...], ...]:
    try:
        text = _result(tools.call("read_file", {"project": project, "path": "artemis.toml"})).get("content", "")
        return tuple(tuple(check) for check in tomllib.loads(text).get("ship", {}).get("checks", []))
    except (WorkflowError, ValueError, TypeError):
        return ()


def lead(tools, prompt: str) -> str:
    woken = WOKEN.search(prompt)
    if woken:
        return f"mock lead (no AI): noted — {woken.group(1).strip()}. Nothing here needs you."
    said = SAID.search(prompt)
    focus = FOCUS.search(prompt)
    if said is None or focus is None:
        return "mock lead (no AI): add a project first (a repo or a folder), then tell me what you want done."
    project, name, kind = int(focus.group(1)), focus.group(2), focus.group(3)
    steps = plan(said.group(1).strip(), _repo_checks(tools, project) if kind == "repo" else ())
    rows = []
    for title, criteria in steps.tasks:
        task = {"project": project, "title": title, "brief": title}
        if kind == "folder":
            path = "summary.csv" if sorts(title) else note_path(title)
            task |= {"kind": "host", "host_checks": [{"type": "exists", "path": path}]}
            label = f"{path} exists"
        else:
            task |= {"kind": "docs" if re.search(r"\b(readme|document|docs?)\b", title, re.I) else "code",
                     "checks": [join_command(c.command) for c in criteria if c.command],
                     "files": [c.artifact for c in criteria if c.artifact]}
            label = ", ".join(c.label for c in criteria) or "the project's checks"
        number = _result(tools.call("task_create", task)).get("task", "?")
        rows.append(f"#{number} {title} · check: {label}")
    for interrupt, what in steps.asks:
        card = _result(tools.call("ask", {"kind": "choice", "what": what, "why": f"{interrupt}: {WHY[interrupt]}",
                                          "options": ["Go ahead", "Not now"]})).get("card")
        rows.append(f"{what} waits for you (card {card}): {WHY[interrupt]}")
    head = f"mock lead (no AI): {len(steps.tasks)} task(s) for {name}" + (", in parallel" if len(steps.tasks) > 1 else "")
    return "\n".join([head + ":", *(f"  {row}" for row in rows)])


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    split = argv.index("--") if "--" in argv else len(argv)
    parser = argparse.ArgumentParser(prog="artemis.mock_worker")
    parser.add_argument("--role", choices=("worker", "lead"), default="worker")
    parser.add_argument("--mode", choices=("repo", "host"), default="repo")
    args = parser.parse_args(argv[:split])
    mcp = argv[split + 1:]
    prompt = sys.stdin.read()
    from .api_worker import McpClient
    tools = McpClient(mcp, dict(os.environ)) if mcp else None
    try:
        if args.role == "lead":
            if tools is None:
                raise WorkflowError("the mock lead needs the Artemis lead tools.")
            print(lead(tools, prompt))
            return 0
        found = re.search(r"^Task #(\d+): (.+)$", prompt, re.MULTILINE)
        number, title = (int(found.group(1)), found.group(2)) if found else (0, "task")
        if "conflict markers" in prompt:
            print("mock: I cannot resolve merge conflicts; this needs a real agent.")
            return 1
        seconds = os.environ.get("ARTEMIS_MOCK_SECONDS")
        time.sleep(float(seconds) if seconds is not None else 8 + 7 * ((number - 1) % 3))
        if args.mode == "repo":
            claim = repo_worker(Path.cwd(), number, title)
        elif tools is None:
            raise WorkflowError("host tasks need the Artemis tools.")
        else:
            claim = host_worker(tools, title)
        print(f"mock: {claim} Ran nothing; the judge runs the checks.")
        return 0
    except (WorkflowError, OSError, KeyError) as error:
        print(f"mock: {error}")
        return 1
    finally:
        if tools is not None:
            tools.close()


if __name__ == "__main__":
    raise SystemExit(main())
