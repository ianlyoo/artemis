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

    def test_run_submits_a_claim_and_captures_evidence_from_the_commit(self):
        repo = Path(self.enterContext(TemporaryDirectory()))
        git(repo, "init", "-b", "main", "--template=")
        self.assertEqual(self.run_cli(repo, "init").stdout, "Ledger ready at .harness/ledger.db\n")
        config_path = repo / "harness.toml"
        config = config_path.read_text(encoding="utf-8")
        config_path.write_text(config.replace("# run =", "run ="), encoding="utf-8")
        (repo / "agent.py").write_text(
            "import sys\n"
            "assert sys.argv[1:] == ['--task', '1']\n"
            "assert 'Task 1: Add a check' in sys.stdin.read()\n"
            "print('Worker claim from the command')\n",
            encoding="utf-8",
        )
        check = repo / "check.py"
        check.write_text("print('Committed evidence')\n", encoding="utf-8")
        git(repo, "add", "agent.py", "check.py")
        git(repo, "-c", "user.name=Example", "-c", "user.email=example", "-c", "commit.gpgsign=false",
            "commit", "-m", "Add the local worker and check")
        sha = git(repo, "rev-parse", "HEAD")
        check.write_text("raise SystemExit(6)\n", encoding="utf-8")

        request = self.run_cli(repo, "request", "Check the sample").stdout.strip()
        goal = self.run_cli(repo, "goal", request, "Verify the sample").stdout.strip()
        self.run_cli(repo, "plan", goal, "Add a command check")
        project = self.run_cli(repo, "project", goal, "Sample project").stdout.strip()
        task = self.run_cli(repo, "assign", project, "Add a check",
                            "--criterion", "Check=cmd:python check.py").stdout.strip()
        self.run_cli(repo, "run", "--task", task, "--commit", sha,
                     "--evidence", "cmd:python check.py")
        timeline = self.run_cli(repo, "show", "--task", task).stdout
        self.assertIn("Worker claim from the command (1/1 evidence)", timeline)
        self.assertIn("pass:", self.run_cli(repo, "judge", "--task", task).stdout)
        self.assertEqual(check.read_text(encoding="utf-8"), "raise SystemExit(6)\n")
        with sqlite3.connect(repo / ".harness" / "ledger.db") as db:
            captured = db.execute("SELECT data FROM evidence").fetchone()[0]
            self.assertIn("Committed evidence", captured)

    def run_cli(self, cwd, *args):
        env = os.environ | {
            "PATH": str(Path(sys.executable).parent) + os.pathsep + os.environ.get("PATH", ""),
        }
        result = subprocess.run(
            (sys.executable, "-m", "harness.cli", *args), cwd=cwd, env=env,
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def test_readme_drives_the_installed_cli(self):
        script = Path(__file__).with_name("readme_quickstart.sh")
        env = os.environ | {
            "PATH": str(Path(sys.executable).parent) + os.pathsep + os.environ.get("PATH", ""),
        }
        result = subprocess.run(("sh", str(script)), capture_output=True, text=True, env=env, timeout=90)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        timeline = result.stdout.split("Ledger timeline\n", 1)[1]
        events = [line.split(maxsplit=3)[2] for line in timeline.splitlines()]
        self.assertEqual(events, [
            "request", "goal", "plan", "project", "assigned", "waiting", "halt", "resume",
            "reported", "reject", "reported", "pass", "checked", "applied", "approved", "simulated",
        ])
        self.assertIn("receipt saved", timeline)
        self.assertIn("missing command evidence", timeline)
