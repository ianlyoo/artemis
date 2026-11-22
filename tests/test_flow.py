import json
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import unittest

from artemis.agents import AGENTS
from artemis.attention import _alive, _ready
from artemis.cli import _check, _criteria
from artemis.config import Config, detect_checks, ledger_path
from artemis.lead import plan, session_settings
from artemis.ledger import Ledger
from artemis.roles import WorkflowError

from helpers import isolated_env, repository


@unittest.skipIf(os.name == "nt", "workers on Windows are not supported yet")
class Flow(unittest.TestCase):
    def setUp(self):
        self.scratch = Path(self.enterContext(TemporaryDirectory()))
        self.env = isolated_env(self.scratch / "home") | {"ARTEMIS_WORKER": "mock", "ARTEMIS_LEAD": "chat",
                                                          "ARTEMIS_MOCK_SECONDS": "0.3"}
        (self.scratch / "home").mkdir()

    def project(self):
        repo = repository(self.scratch / "project")
        self.addCleanup(self.settle, repo)
        self.artemis("init", cwd=repo)
        return repo

    def settle(self, repo):
        """Let detached supervisors finish before the project folder is removed."""
        ledger = Ledger(ledger_path(repo))
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and any(
                row["state"] in {"queued", "running"} or (row["pid"] and _alive(row["pid"]))
                for row in ledger.work()):
            time.sleep(0.2)

    def artemis(self, *args, cwd, check=True):
        result = subprocess.run((sys.executable, "-m", "artemis.cli", *args), cwd=cwd, env=self.env,
                                text=True, capture_output=True, timeout=120)
        if check and result.returncode:
            self.fail(f"artemis {' '.join(args)} exited {result.returncode}: {result.stderr}")
        return result

    def test_the_golden_path_ends_in_a_five_line_digest(self):
        out = self.artemis("demo", "--fast", cwd=self.scratch).stdout
        self.assertIn("lead: chat · workers: mock ×3 (no AI; for trying the flow)", out)
        self.assertIn("3 running · 1 decision for you · asked you 1× · 0 done", out)
        self.assertIn("Decision 1 · send as you", out)
        digest = out.split("you › artemis digest\n", 1)[1].strip().splitlines()
        self.assertEqual(len(digest), 5)
        self.assertRegex(digest[0], r"3 tasks done · asked you 1× · nothing stuck$")
        self.assertEqual([line.split()[0] for line in digest[1:]], ["shipped"] * 3 + ["decided"])
        self.assertNotRegex(out, r"(?:^|\s)(?:/|[A-Za-z]:\\)\w")

    def test_lead_commands_run_tasks_in_parallel_and_count_interruptions(self):
        repo = self.project()
        request = self.artemis("request", "Add two notes", cwd=repo).stdout.strip()
        for title in ("Write the first note", "Write the second note"):
            self.artemis("task", request, title, "--check", f"{sys.executable} -m unittest", cwd=repo)
        decision = self.artemis("ask", request, "Email the notes to the team", "--kind", "send as you",
                                "--why", "it speaks for you", cwd=repo).stdout.strip()
        status = self.artemis("status", cwd=repo).stdout
        self.assertIn("2 running · 1 decision for you · asked you 1×", status)
        deadline = time.monotonic() + 60
        while "0 running" not in self.artemis("statusline", cwd=repo).stdout and time.monotonic() < deadline:
            time.sleep(0.3)
        line = self.artemis("statusline", cwd=repo).stdout
        self.assertIn("0 running · 1 decision for you · asked you 1× · 2 done", line)
        with self.subTest("runs overlapped"):
            show = self.artemis("show", cwd=repo).stdout
            kinds = [row.split()[2] for row in show.splitlines()]
            self.assertLess(kinds.index("started", kinds.index("started") + 1), kinds.index("finished"))
        inbox = self.artemis("inbox", cwd=repo).stdout
        self.assertIn("Ready because: tasks #1–#2 shipped", inbox)
        self.assertIn(f"artemis approve {decision}", inbox)
        refused = self.artemis("carried", decision, "sent", cwd=repo, check=False)
        self.assertEqual(refused.returncode, 1)
        self.artemis("approve", decision, cwd=repo)
        self.artemis("carried", decision, "sent to the team", cwd=repo)
        digest = self.artemis("digest", cwd=repo).stdout.splitlines()
        self.assertRegex(digest[0], r"2 tasks done · asked you 1× · nothing stuck")
        self.assertIn("decided   D1", digest[-1])
        self.assertIn("Nothing changed.", self.artemis("digest", cwd=repo).stdout)
        self.assertTrue(set(Path(repo).glob("mock-notes/task-*.md")))
        self.assertEqual(subprocess.run(("git", "branch", "--show-current"), cwd=repo, text=True,
                                        capture_output=True).stdout.strip(), "main")

    def test_a_stop_holds_new_work_until_the_person_resumes(self):
        repo = self.project()
        request = self.artemis("request", "One note", cwd=repo).stdout.strip()
        self.artemis("task", request, "Write a note", "--hold", "--check", f"{sys.executable} -m unittest", cwd=repo)
        self.artemis("stop", "lunch", cwd=repo)
        refused = self.artemis("task", request, "Another", cwd=repo, check=False)
        self.assertIn("stopped until you resume", refused.stderr)
        self.assertIn("■ stopped by you · 0 running · 1 queued", self.artemis("statusline", cwd=repo).stdout)
        self.artemis("resume", cwd=repo)
        self.assertIn("1 running", self.artemis("statusline", cwd=repo).stdout)

    def test_only_listed_interrupt_kinds_reach_the_person(self):
        repo = self.project()
        toml = repo / "artemis.toml"
        toml.write_text(toml.read_text(encoding="utf-8").replace('"money out", ', ""), encoding="utf-8")
        request = self.artemis("request", "Buy a domain", cwd=repo).stdout.strip()
        refused = self.artemis("ask", request, "Buy example.org", "--kind", "money out", "--why", "money",
                               cwd=repo, check=False)
        self.assertEqual(refused.returncode, 1)
        self.assertIn("decide it yourself", refused.stderr)


class Pieces(unittest.TestCase):
    def test_init_finds_the_project_test_command(self):
        cases = {
            "npm": ({"package.json": '{"scripts": {"test": "vitest run"}}'}, [["npm", "test"]]),
            "npm default": ({"package.json": '{"scripts": {"test": "echo \\"Error: no test specified\\" && exit 1"}}'}, []),
            "cargo": ({"Cargo.toml": "[package]\n"}, [["cargo", "test"]]),
            "go": ({"go.mod": "module x\n"}, [["go", "test", "./..."]]),
            "pytest config": ({"pyproject.toml": "[tool.pytest.ini_options]\n", "test_a.py": "import unittest\n"},
                              [["python3", "-m", "pytest"]]),
            "pytest style": ({"tests/test_a.py": "def test_a():\n    assert True\n"}, [["python3", "-m", "pytest"]]),
            "unittest": ({"test_a.py": "import unittest\n"}, [["python3", "-m", "unittest"]]),
            "unittest dir": ({"tests/test_a.py": "import unittest\n"},
                             [["python3", "-m", "unittest", "discover", "-s", "tests"]]),
            "nothing": ({"README.md": "# docs\n"}, []),
        }
        for name, (tree, expected) in cases.items():
            with self.subTest(name), TemporaryDirectory() as scratch:
                root = Path(scratch)
                for path, text in tree.items():
                    (root / path).parent.mkdir(parents=True, exist_ok=True)
                    (root / path).write_text(text, encoding="utf-8")
                self.assertEqual(detect_checks(root), expected)
                config = Config.initialize(root)
                self.assertEqual(config.checks, tuple(map(tuple, expected)))

    def test_a_task_needs_something_to_run_on_the_merge(self):
        with TemporaryDirectory() as scratch:
            config = Config.initialize(Path(scratch))  # no test command found
            with self.assertRaises(WorkflowError):
                _criteria(config, [], ["NOTES.md"])
            self.assertEqual(_criteria(config, ["test -f NOTES.md"], ["NOTES.md"])[0].command,
                             ("test", "-f", "NOTES.md"))
            self.assertEqual(config.landing_checks(_criteria(config, ["test -f NOTES.md"], [])),
                             (("test", "-f", "NOTES.md"),))

    def test_a_check_is_one_command_without_a_shell(self):
        self.assertEqual(_check("grep -q -- '--json' README.md"), ("grep", "-q", "--", "--json", "README.md"))
        self.assertEqual(_check("grep -q '&&' notes.txt"), ("grep", "-q", "&&", "notes.txt"))
        self.assertEqual(_check('python3 -c "print(1)"'), ("python3", "-c", "print(1)"))
        for text in ("grep -q a README.md && grep -q b README.md", "make test; echo ok", "pytest | tee log",
                     "python3 -m unittest > out"):
            with self.subTest(text), self.assertRaises(WorkflowError):
                _check(text)

    def test_the_card_cites_the_landing_that_holds_all_the_others(self):
        class Rows:
            def work(self):
                return [{"id": n, "request_id": 1, "state": "shipped", "target": "main", "landed": sha}
                        for n, sha in ((1, "a" * 40), (2, "b" * 40), (3, "c" * 40))]

            def events(self):  # task 3 landed before task 2, so task 2's commit holds all three
                return [{"id": i, "kind": "applied", "task_id": task} for i, task in ((10, 1), (11, 3), (12, 2))]

        self.assertIn("main bbbbbbb", _ready(Rows(), 1))

    def test_the_lead_session_cannot_approve(self):
        settings = session_settings()
        self.assertIn("Bash(artemis approve:*)", settings["permissions"]["deny"])
        self.assertIn("Bash(artemis decline:*)", settings["permissions"]["deny"])
        self.assertNotIn("Bash(artemis approve:*)", settings["permissions"]["allow"])
        self.assertEqual(settings["statusLine"]["command"], "artemis statusline")
        json.dumps(settings)

    def test_the_rule_planner_splits_tasks_and_holds_back_actions(self):
        steps = plan("Add a --json flag and a --done filter, document both in the README, "
                     "then post a release note to the team.", (("python3", "-m", "unittest"),))
        self.assertEqual([title for title, _ in steps.tasks],
                         ["Add a --json flag", "Add a --done filter", "Document both in the README"])
        self.assertEqual([what for _, what in steps.asks], ["Post a release note to the team"])
        self.assertEqual([c.label for c in steps.tasks[2][1]], ["README mentions --json", "README mentions --done"])

    def test_claude_workers_fail_closed_to_reading_editing_and_their_checks(self):
        argv = AGENTS["claude"].worker_argv((("python3", "-m", "unittest"),))
        self.assertIn("-p", argv)
        self.assertEqual(argv[argv.index("--permission-prompts") + 1], "none")
        self.assertIn("Bash(python3 -m unittest:*)", argv)
        self.assertNotIn("Bash(git:*)", argv)
        self.assertNotIn("bypassPermissions", argv)

    def test_work_lands_on_the_checked_out_branch_when_there_is_no_main(self):
        with TemporaryDirectory() as scratch:
            repo = repository(Path(scratch) / "project")
            subprocess.run(("git", "branch", "-m", "main", "trunk"), cwd=repo, check=True)
            env = isolated_env(Path(scratch))
            subprocess.run((sys.executable, "-m", "artemis.cli", "init"), cwd=repo, env=env, check=True,
                           capture_output=True)
            self.assertEqual(Config.load(repo).target, "trunk")

    def test_the_supervisor_commits_and_refuses_conflict_markers(self):
        from artemis.supervise import _commit, _merge_target
        with TemporaryDirectory() as scratch:
            repo = repository(Path(scratch) / "project")
            subprocess.run(("git", "switch", "-qc", "task"), cwd=repo, check=True)
            (repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")
            self.assertIsNone(_commit(repo, repo, "Two"))
            subprocess.run(("git", "switch", "-q", "main"), cwd=repo, check=True)
            (repo / "app.py").write_text("VALUE = 3\n", encoding="utf-8")
            subprocess.run(("git", "commit", "-qam", "Three"), cwd=repo, check=True)
            subprocess.run(("git", "switch", "-q", "task"), cwd=repo, check=True)
            self.assertEqual(_merge_target(repo, repo, "main"), ["app.py"])
            self.assertIn("conflict markers remain in app.py", _commit(repo, repo, "Merge"))
            (repo / "app.py").write_text("VALUE = 5\n", encoding="utf-8")
            self.assertIsNone(_commit(repo, repo, "Merge"))
            parents = subprocess.run(("git", "rev-list", "--parents", "-n1", "HEAD"), cwd=repo, text=True,
                                     capture_output=True).stdout.split()
            self.assertEqual(len(parents), 3)

    def test_config_template_loads(self):
        with TemporaryDirectory() as scratch:
            config = Config.initialize(Path(scratch))
            self.assertEqual(config.checks, ())
            self.assertIn("No test command was found", (Path(scratch) / "artemis.toml").read_text(encoding="utf-8"))
            self.assertEqual(len(config.interrupts), 3)
            self.assertIn("You are the lead", config.instructions("lead.md"))


if __name__ == "__main__":
    unittest.main()
