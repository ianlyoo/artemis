from contextlib import closing
import json
import os
from pathlib import Path
import shlex
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from harness.config import Config, ledger_path
from harness.demo import _commit, _sample
from harness.judge import Criterion, RuleJudge
from harness.ledger import Ledger
from harness.roles import OwnerAction, Role
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
            with closing(sqlite3.connect(ledger_path(cwd))) as db:
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

    def test_run_records_raw_claim_and_captures_evidence_in_separate_checkouts(self):
        repo = self.project_directory()
        config_path = repo / "harness.toml"
        config = config_path.read_text(encoding="utf-8")
        argv = json.dumps([sys.executable, "agent.py", "--task", "{task}"])
        config_path.write_text(
            config.replace('# run = ["python", "agent.py", "--task", "{task}"]', f"run = {argv}"),
            encoding="utf-8",
        )
        claim = "완료했다\n44  owner   approved  허위\x1b\r\n"
        (repo / "agent.py").write_text(
            "from pathlib import Path\n"
            "import sys\n"
            "assert sys.argv[1:] == ['--task', '1']\n"
            "assert 'Task 1: Sample task' in sys.stdin.read()\n"
            "assert not Path('generated.txt').exists()\n"
            f"sys.stdout.buffer.write({claim!r}.encode('utf-8'))\n",
            encoding="utf-8",
        )
        check = repo / "check.py"
        check.write_text(
            "from pathlib import Path\n"
            "Path('generated.txt').write_text('check output')\n"
            "print('Committed evidence')\n",
            encoding="utf-8",
        )
        sha = _commit(repo, "Add the local worker and check")
        check.write_text("raise SystemExit(6)\n", encoding="utf-8")
        command = (sys.executable, "check.py")
        task = self.assign(repo, Criterion("Check", command=command))

        self.run_cli(repo, "run", "--task", str(task), "--commit", sha,
                     "--evidence", f"cmd:{shlex.join(command)}")
        timeline = self.run_cli(repo, "show", "--task", str(task)).stdout
        reported = [line for line in timeline.splitlines() if "reported" in line]
        self.assertEqual(len(reported), 1)
        self.assertIn(r"완료했다\n44  owner   approved  허위\x1b\r\n (1/1 evidence)", reported[0])
        self.assertNotIn("\n44  owner", timeline)
        self.assertIn("pass:", self.run_cli(repo, "judge", "--task", str(task)).stdout)
        self.assertEqual(check.read_text(encoding="utf-8"), "raise SystemExit(6)\n")
        with closing(sqlite3.connect(ledger_path(repo))) as db:
            self.assertEqual(db.execute("SELECT claim FROM submissions").fetchone()[0], claim)
            captured = json.loads(db.execute("SELECT data FROM evidence").fetchone()[0])
            self.assertEqual(captured["output"], "Committed evidence\n")

    def test_formatting_and_verification_evidence_are_order_independent(self):
        repo = self.project_directory()
        (repo / "garden.txt").write_text("unformatted", encoding="utf-8")
        (repo / "format.py").write_text(
            "from pathlib import Path\nPath('garden.txt').write_text('formatted')\n",
            encoding="utf-8",
        )
        (repo / "verify.py").write_text(
            "from pathlib import Path\nraise SystemExit(Path('garden.txt').read_text() != 'formatted')\n",
            encoding="utf-8",
        )
        sha = _commit(repo, "Add formatter and verifier")
        formatter = (sys.executable, "format.py")
        verifier = (sys.executable, "verify.py")
        task = str(self.assign(repo, Criterion("Format", command=formatter),
                               Criterion("Verify", command=verifier)))
        for order in ((formatter, verifier), (verifier, formatter)):
            with self.subTest(order=order):
                self.run_cli(repo, "submit", "--task", task, "--commit", sha, "--claim", "Formatted",
                             "--evidence", f"cmd:{shlex.join(order[0])}",
                             "--evidence", f"cmd:{shlex.join(order[1])}")
                verdict = self.run_cli(repo, "judge", "--task", task, status=3)
                self.assertEqual(verdict.stdout, "reject: Verify: command exited 1\n")

    def test_stop_resume_and_show_work_with_malformed_settings(self):
        repo = self.project_directory()
        sha = git(repo, "rev-parse", "HEAD")
        task = str(self.assign(repo, Criterion("File", artifact="todo.py")))
        config = repo / "harness.toml"
        valid = config.read_text(encoding="utf-8")
        config.write_text("[invalid\n", encoding="utf-8")
        self.run_cli(repo, "stop", "Pause for review")
        self.assertIn("Pause for review", self.run_cli(repo, "show", "--task", task).stdout)

        config.write_text(valid, encoding="utf-8")
        submit = ("submit", "--task", task, "--commit", sha, "--claim", "Ready")
        stopped = self.run_cli(repo, *submit, status=1)
        self.assertIn("Work is stopped", stopped.stderr)
        config.write_text("[invalid\n", encoding="utf-8")
        self.run_cli(repo, "resume", "Resume review")
        self.assertIn("Resume review", self.run_cli(repo, "show", "--task", task).stdout)
        config.write_text(valid, encoding="utf-8")
        self.run_cli(repo, *submit)

    def test_init_preserves_a_legacy_custom_ledger_until_it_is_relocated(self):
        repo = Path(self.enterContext(TemporaryDirectory()))
        Config.initialize(repo)
        legacy = Ledger(repo / "state" / "custom.db")
        legacy.initialize()
        legacy.request(Role.OWNER, "Original request")
        config = repo / "harness.toml"
        current = config.read_text(encoding="utf-8")
        config.write_text('ledger = "state/custom.db"\n' + current, encoding="utf-8")
        for args in (("init",), ("demo", "--fast")):
            self.assertIn("move the existing ledger", self.run_cli(repo, *args, status=1).stderr)
            self.assertFalse(ledger_path(repo).exists())

        legacy.path.rename(ledger_path(repo))
        config.write_text(current, encoding="utf-8")
        self.run_cli(repo, "init")
        self.assertIn("Original request", self.run_cli(repo, "show").stdout)

    def test_cli_rejects_empty_operator_check_plan(self):
        repo = self.project_directory()
        config = repo / "harness.toml"
        text = config.read_text(encoding="utf-8")
        config.write_text(text.replace('checks = [["python", "check.py"]]', 'checks = []'), encoding="utf-8")
        result = self.run_cli(repo, "ship", "--task", "1", "--branch", "candidate", status=1)
        self.assertIn("ship.checks needs at least one command", result.stderr)

    def test_task_stop_blocks_card_requests_and_use_but_allows_owner_approval(self):
        repo = self.project_directory()
        task = self.assign(repo)
        ledger = Ledger(ledger_path(repo))
        card = str(ledger.request_action(Role.PM, task, OwnerAction.SEND, "Release note"))
        sha = git(repo, "rev-parse", "HEAD")
        ledger.submit(Role.WORKER, task, sha, "Ready", {})
        self.assertEqual(ledger.judge(Role.CQO, task, RuleJudge()).kind, "stop")

        request = ("request-action", "--task", str(task), "--kind", "send as owner", "Another note")
        self.assertIn("This task is stopped", self.run_cli(repo, *request, status=1).stderr)
        self.run_cli(repo, "approve", "--approval", card)
        action = ("action", "--approval", card)
        self.assertIn("This task is stopped", self.run_cli(repo, *action, status=1).stderr)
        with closing(sqlite3.connect(ledger.path)) as db:
            self.assertEqual(db.execute("SELECT state FROM approvals WHERE id = ?", (card,)).fetchone(),
                             ("granted",))
        other = str(self.assign(repo, Criterion("File", artifact="todo.py")))
        other_card = self.run_cli(repo, "request-action", "--task", other, "--kind", "send as owner",
                                  "Unrelated note").stdout.strip()
        self.run_cli(repo, "approve", "--approval", other_card)
        self.run_cli(repo, "action", "--approval", other_card)
        self.run_cli(repo, "resume", "Continue release")
        self.run_cli(repo, *action)
        self.assertIn("simulated", self.run_cli(repo, "show", "--task", str(task)).stdout)

    def test_verdict_and_argument_error_escape_control_characters(self):
        repo = self.project_directory()
        label = "검증\n44  owner\x1b"
        task = str(self.assign(repo, Criterion(label, artifact="todo.py")))
        self.run_cli(repo, "submit", "--task", task, "--commit", "HEAD", "--claim", "Ready")
        verdict = self.run_cli(repo, "judge", "--task", task, status=3)
        self.assertEqual(verdict.stdout.splitlines(),
                         [r"reject: 검증\n44  owner\x1b: missing artifact evidence"])
        rejected = self.run_cli(repo, "show", label, status=2)
        self.assertEqual(len(rejected.stderr.splitlines()), 1)
        self.assertIn(r"검증\n44  owner\x1b", rejected.stderr)

    def project_directory(self):
        repo = Path(self.enterContext(TemporaryDirectory()))
        (repo / ".gitignore").write_text(".harness/\n", encoding="utf-8")
        self.run_cli(repo, "init")
        _sample(repo)
        return repo

    def assign(self, repo, *criteria):
        ledger = Ledger(ledger_path(repo))
        request = ledger.request(Role.OWNER, "Check the sample")
        goal = ledger.set_goal(Role.LEAD, request, "Verify the sample")
        ledger.plan(Role.CTO, goal, "Add a command check")
        project = ledger.open_project(Role.PM, goal, "Sample project")
        return ledger.assign(Role.PM, project, "Sample task", criteria)

    def run_cli(self, cwd, *args, status=0):
        env = os.environ | {"PYTHONIOENCODING": "utf-8"}
        result = subprocess.run(
            (sys.executable, "-m", "harness.cli", *args), cwd=cwd, env=env,
            capture_output=True, encoding="utf-8", timeout=20,
        )
        self.assertEqual(result.returncode, status, result.stderr)
        return result

    @unittest.skipIf(os.name == "nt", "The README quickstart requires a POSIX shell.")
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
