import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from harness.ship import git


class CliTests(unittest.TestCase):
    def test_fictional_demo_and_timeline(self):
        with TemporaryDirectory() as scratch:
            cwd = Path(scratch)
            identity = "fixture-local-operator"
            env = os.environ | {"HOME": str(cwd), "USER": identity, "LOGNAME": identity}

            def run(*args):
                return subprocess.run(
                    (sys.executable, "-m", "harness.cli", *args), cwd=cwd, env=env,
                    text=True, capture_output=True, check=True, timeout=20,
                )

            self.assertEqual(run("init").stdout, "Ledger ready at .harness/ledger.db\n")
            demo = run("demo", "--fast")
            self.assertEqual(demo.stderr, "")
            self.assertIn("missing command evidence", demo.stdout)
            self.assertIn("receipt saved", demo.stdout)
            self.assertIn("Publish release note (send as owner)", demo.stdout)
            self.assertIn("simulated", demo.stdout)
            self.assertNotRegex(demo.stdout, r"(?:^|\s)(?:/|[A-Za-z]:\\)")
            self.assertNotIn(identity, demo.stdout)
            timeline = run("show", "--task", "1").stdout
            self.assertIn(timeline.removeprefix("Ledger timeline\n"), demo.stdout)
            with sqlite3.connect(cwd / ".harness" / "ledger.db") as db:
                self.assertEqual(db.execute("SELECT state FROM approvals").fetchone(), ("done",))
                self.assertEqual(db.execute("SELECT state FROM receipts").fetchone(), ("applied",))

    def test_demo_ignores_callers_git_repository(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        demo_dir = root / "demo"
        neighbor = root / "neighbor"
        demo_dir.mkdir()
        neighbor.mkdir()
        git(neighbor, "init", "-b", "main", "--template=")
        note = neighbor / "note.txt"
        note.write_text("Remember to water the basil.\n", encoding="utf-8")

        result = subprocess.run(
            (sys.executable, "-m", "harness.cli", "demo", "--fast"),
            cwd=demo_dir,
            env=os.environ | {"GIT_DIR": str(neighbor / ".git"), "GIT_WORK_TREE": str(neighbor)},
            text=True, capture_output=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("receipt saved", result.stdout)
        self.assertEqual(git(neighbor, "status", "--porcelain"), "?? note.txt")
        self.assertEqual(git(neighbor, "symbolic-ref", "--short", "HEAD"), "main")
        self.assertEqual(git(neighbor, "rev-list", "--all", "--count"), "0")
