"""The throwaway demo project: a tiny to-do CLI with tests, made fresh for each demo."""

from pathlib import Path

from .ship import git


SENTENCE = ("Add a --json flag and a --done filter, document both in the README, "
            "then post a release note to the team.")

TODO = '''\
"""A tiny to-do list for the Artemis demo."""

import argparse

ITEMS = [
    {"title": "Water the basil", "done": False},
    {"title": "Repot the mint", "done": True},
    {"title": "Buy seeds", "done": False},
]


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Show the to-do list.")
    add_output_options(parser)
    add_filter_options(parser)
    return parser.parse_args(argv)


def add_output_options(parser):
    """Options that change how the list is printed."""


def add_filter_options(parser):
    """Options that choose which items are printed."""


def select(items, args):
    return items


def render(items, args):
    return "\\n".join(("[x] " if item["done"] else "[ ] ") + item["title"] for item in items)


def main(argv=None):
    args = parse_args(argv)
    print(render(select(ITEMS, args), args))


if __name__ == "__main__":
    main()
'''

TESTS = '''\
import unittest

import todo


class PlainOutput(unittest.TestCase):
    def test_lists_every_item(self):
        text = todo.render(todo.select(todo.ITEMS, todo.parse_args([])), todo.parse_args([]))
        self.assertEqual(text.splitlines()[0], "[ ] Water the basil")
        self.assertEqual(len(text.splitlines()), 3)


if __name__ == "__main__":
    unittest.main()
'''

NOTIFY = '''\
"""Post a message to the team. In this demo the team channel is a local file: nothing leaves the machine."""

from pathlib import Path
import sys

outbox = Path("outbox")
outbox.mkdir(exist_ok=True)
with (outbox / "team.md").open("a", encoding="utf-8") as stream:
    stream.write(" ".join(sys.argv[1:]) + "\\n")
print("posted to the demo outbox (outbox/team.md); nothing left this machine")
'''

README = """\
# todo

A tiny to-do list, used by the Artemis demo.
"""

GITIGNORE = ".artemis/\noutbox/\n__pycache__/\n"


def create(path: Path) -> None:
    """Make the demo repository at path, with one commit on main."""
    path.mkdir(parents=True)
    git(path, "init", "--quiet", "-b", "main", "--template=")
    git(path, "config", "user.name", "Demo User")
    git(path, "config", "user.email", "demo@example.invalid")
    git(path, "config", "commit.gpgsign", "false")
    for name, text in (("todo.py", TODO), ("test_todo.py", TESTS), ("notify.py", NOTIFY),
                       ("README.md", README), (".gitignore", GITIGNORE)):
        (path / name).write_text(text, encoding="utf-8", newline="\n")
    git(path, "add", "--", ".")
    git(path, "commit", "--quiet", "-m", "Start the to-do list")
