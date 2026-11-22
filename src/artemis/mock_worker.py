"""A worker with no AI: canned edits for the demo project, so the flow can be tried without an account.

It reads the task prompt on stdin, waits a few seconds so parallel runs overlap, edits files in its worktree,
and prints a claim that says it is a mock. Artemis commits, as it does for every worker.
"""

import os
from pathlib import Path
import re
import sys
import time



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


def main() -> int:
    prompt = sys.stdin.read()
    tree = Path.cwd()
    found = re.search(r"^Task #(\d+): (.+)$", prompt, re.MULTILINE)
    number, title = (int(found.group(1)), found.group(2)) if found else (0, "task")
    if "conflict markers" in prompt:
        print("mock: I cannot resolve merge conflicts; this needs a real agent.")
        return 1
    seconds = os.environ.get("ARTEMIS_MOCK_SECONDS")
    time.sleep(float(seconds) if seconds is not None else 8 + 7 * ((number - 1) % 3))
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
    print(f"mock: {claim} Ran nothing; the judge runs the checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
