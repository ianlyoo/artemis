"""End to end: `artemis serve` in a subprocess, the CLI as its client, and mock workers (no AI)."""

import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import unittest
from unittest import mock

from artemis import process
from artemis.agents import AGENTS
from artemis.attention import _joined, _one_line, _ready, _said, clip
from artemis.cli import _check, _criteria
from artemis.config import Config, detect_checks
from artemis.lead import plan, session_settings
from artemis.ledger import Ledger
from artemis.roles import Role, WorkflowError

from helpers import isolated_env, repository, serve, wait_for


class Flow(unittest.TestCase):
    def setUp(self):
        self.scratch = Path(self.enterContext(TemporaryDirectory())).resolve()
        self.env = isolated_env(self.scratch / "user") | {"ARTEMIS_WORKER": "mock", "ARTEMIS_LEAD": "mock",
                                                          "ARTEMIS_MOCK_SECONDS": "0.3"}
        self.ledger = Ledger(Path(self.env["ARTEMIS_HOME"]) / "ledger.db")

    def artemis(self, *args, cwd=None, check=True):
        result = subprocess.run((sys.executable, "-m", "artemis.cli", *map(str, args)), cwd=cwd or self.scratch,
                                env=self.env, text=True, encoding="utf-8", capture_output=True, timeout=120)
        if check and result.returncode:
            self.fail(f"artemis {' '.join(map(str, args))} exited {result.returncode}: {result.stderr}")
        return result

    def home(self, mock_seconds: str = "0.3"):
        self.env["ARTEMIS_MOCK_SECONDS"] = mock_seconds
        return serve(self, self.env)

    def project(self, name):
        repo = repository(self.scratch / name)
        self.artemis("project", "add", repo)
        return repo

    def state(self, task):
        return self.ledger.work(task)[0]["state"]

    def settled(self, *tasks):
        return all(self.state(task) in ("shipped", "verified", "stuck", "dropped") for task in tasks)

    def test_the_golden_path_ends_in_a_five_line_digest(self):
        out = self.artemis("demo", "--fast").stdout
        self.assertIn("lead: mock · workers: mock ×4 (no AI; for trying the flow)", out)
        self.assertIn("3 running · 1 decision for you · asked you 1× · 0 done", out)
        self.assertIn("Decision 1 · send as you", out)
        self.assertIn("approved: 1 · Artemis carries it out once", out)
        self.assertIn("lead (mock) › Decision 1: done; the local demo receiver got the body you approved", out)
        digest = out.split("you › artemis digest\n", 1)[1].strip().splitlines()
        self.assertEqual(len(digest), 5)
        self.assertRegex(digest[0], r"asked you 1× · 3 done · 0 stuck · 0 wakes$")
        self.assertEqual([line.split()[0] for line in digest[1:]], ["shipped"] * 3 + ["decided"])
        self.assertRegex(digest[-1], r"^decided   D1 POST to the local demo receiver  you approved · it got that exact "
                                     r"body \(sha256 [0-9a-f]{7}\)$")
        self.assertNotRegex(out, r"(?:^|\s)(?:/|[A-Za-z]:\\)\w")

    def test_the_team_post_you_approve_in_start_is_carried_out_once_by_the_home(self):
        self.home()
        said = subprocess.run((sys.executable, "-m", "artemis.cli", "start", "--demo"), cwd=self.scratch,
                              env=self.env, text=True, encoding="utf-8", capture_output=True, timeout=120,
                              input="Post a release note to the team\napprove 1\nquit\n").stdout
        self.assertIn("lead (mock) › Nothing to build for this; it is a decision for you:\n  Post a release note to "
                      "the team — it speaks in your name, so it waits in your inbox (decision 1).", said)
        self.assertIn("approved: 1 · Artemis carries it out once\nlead (mock) › Decision 1: done; exit 0 · posted to "
                      "the demo outbox (outbox/team.md); nothing left this machine.", said)
        outbox = self.scratch / "artemis-demo" / "outbox" / "team.md"
        self.assertEqual(outbox.read_text(encoding="utf-8"), "Post a release note to the team\n")
        [card] = self.ledger.cards()
        self.assertEqual((card["state"], card["kind"]), ("done", "send as you"))

    def test_a_message_in_the_app_gets_the_mock_leads_answer_and_the_settled_request_wakes_it(self):
        child = self.home()
        port, token = re.search(r"^App: http://127\.0\.0\.1:(\d+)/#pair=(\S+)$", "".join(child.said), re.M).groups()

        def post(path, body, cookie=""):
            connection = http.client.HTTPConnection("127.0.0.1", int(port), timeout=30)
            connection.request("POST", path, json.dumps(body), {"Host": f"127.0.0.1:{port}", "Cookie": cookie,
                                                                "Origin": f"http://127.0.0.1:{port}"})
            response = connection.getresponse()
            data = json.loads(response.read())
            connection.close()
            self.assertEqual(response.status, 200, data)
            return response, data

        folder = self.scratch / "film"
        (folder / "incoming").mkdir(parents=True)
        (folder / "incoming" / "a.mov").write_bytes(b"stand-in clip")
        self.artemis("project", "add", folder)
        [project] = self.ledger.projects()
        cookie = post("/api/pair", {"token": token})[0].getheader("Set-Cookie").split(";", 1)[0]
        sent = post("/api/messages", {"text": "Sort this week's files", "project_id": project["id"]}, cookie)[1]["id"]

        def said():
            return [row["text"] for row in self.ledger.messages() if row["role"] == Role.LEAD]

        wait_for(lambda: len(said()) >= 2, 90, what="the lead's answer, then its wake")
        answer, woken = said()[:2]
        self.assertRegex(answer, r"^mock lead \(no AI\): 1 task\(s\) for film:\n  #1 .* · check: summary\.csv exists$")
        self.assertEqual(woken, "mock lead (no AI): noted — request 1 settled. Nothing here needs you.")
        self.assertEqual(self.state(1), "verified")
        turns = [(event["kind"], json.loads(event["data"])) for event in self.ledger.events()
                 if event["kind"] in ("lead.turn", "lead.wake")]
        self.assertEqual([(kind, data["provider"], data["message"]) for kind, data in turns],
                         [("lead.turn", "mock", sent), ("lead.wake", "mock", None)])

    def test_two_projects_run_at_once_and_each_lands_on_its_own_main(self):
        self.home(mock_seconds="2")
        alpha, beta = self.project("alpha"), self.project("beta")
        tasks = []
        for repo in (alpha, beta):
            request = self.artemis("request", f"Add a note to {repo.name}", cwd=repo).stdout.strip()
            tasks.append(int(self.artemis("task", request, "Write the first note", "--check",
                                          f"{sys.executable} -m unittest", cwd=repo).stdout))
        card = self.artemis("ask", 1, "Email the notes to the team", "--kind", "send as you", "--why",
                            "it speaks for you", cwd=alpha).stdout.strip()
        wait_for(lambda: self.settled(*tasks), 90, what="both tasks")
        self.assertEqual([self.state(task) for task in tasks], ["shipped", "shipped"])
        kinds = [(e["kind"], e["task_id"]) for e in self.ledger.events() if e["kind"] in ("started", "finished")]
        first_end = next(i for i, (kind, _) in enumerate(kinds) if kind == "finished")
        self.assertEqual({task for kind, task in kinds[:first_end] if kind == "started"}, set(tasks))
        for repo, task in zip((alpha, beta), tasks):
            shown = subprocess.run(("git", "show", f"main:mock-notes/task-{task}.md"), cwd=repo, text=True,
                                   capture_output=True)
            self.assertIn("A mock worker left this note.", shown.stdout)
            self.assertEqual(subprocess.run(("git", "branch", "--show-current"), cwd=repo, text=True,
                                            capture_output=True).stdout.strip(), "main")
        self.assertIn("Last lines of the worker log (logs/task-1.log):", self.artemis("show", "--task", 1).stdout)
        self.assertIn("Ready because: task #1 shipped, checks green on main", self.artemis("inbox").stdout)
        self.assertEqual(self.artemis("carried", card, "sent", check=False).returncode, 1)
        self.assertIn("approved: 1 · the lead carries it out", self.artemis("approve", card).stdout)
        self.artemis("carried", card, "sent to the team")
        digest = self.artemis("digest").stdout.splitlines()
        self.assertRegex(digest[0], r"asked you 1× · 2 done · 0 stuck · \d+ wakes?")
        alpha_lines = digest[digest.index("alpha (repo)") + 1:digest.index("beta (repo)")]
        self.assertTrue(any(line.strip().startswith("decided   D1 ") for line in alpha_lines), digest)

    def test_a_folder_task_is_verified_in_the_folder(self):
        self.home()
        film = self.scratch / "film"
        (film / "incoming").mkdir(parents=True)
        (film / "incoming" / "clip.mov").write_bytes(b"stand-in")
        self.assertIn("Added film: a folder.", self.artemis("project", "add", film).stdout)
        request = self.artemis("request", "Sort this week's files", cwd=film).stdout.strip()
        task = int(self.artemis("task", request, "Sort the files", "--file", "summary.csv", cwd=film).stdout)
        wait_for(lambda: self.settled(task), 60, what="the folder task")
        self.assertEqual(self.state(task), "verified")
        self.assertTrue((film / "summary.csv").exists())
        self.assertFalse((film / ".git").exists())

    def test_a_stop_ends_running_work_and_holds_new_work_until_resume(self):
        self.home(mock_seconds="3")
        repo = self.project("notes")
        request = self.artemis("request", "One note", cwd=repo).stdout.strip()
        task = int(self.artemis("task", request, "Write a note", "--check", f"{sys.executable} -m unittest",
                                cwd=repo).stdout)
        wait_for(lambda: self.state(task) == "running", 30, step_s=0.05, what="the task to start")
        self.assertIn("Running workers are ended", self.artemis("stop", "lunch").stdout)
        wait_for(lambda: self.state(task) == "stuck", 30, what="the stop to end the worker")
        self.assertEqual(self.ledger.work(task)[0]["note"], "stopped by you")
        refused = self.artemis("task", request, "Another", "--check", "true", cwd=repo, check=False)
        self.assertIn("stopped until you resume", refused.stderr)
        self.assertIn("stopped", self.artemis("statusline").stdout)
        resumed = self.artemis("resume").stdout
        self.assertIn(f"The stop ended #{task}; run one again with artemis retry {task}.", resumed)
        time.sleep(1.5)
        self.assertEqual(self.state(task), "stuck")                # a resume does not rerun on its own
        self.artemis("retry", task)
        wait_for(lambda: self.state(task) == "shipped", 60, what="the retried task")

    def test_a_restart_marks_the_open_run_stuck_and_a_retry_finishes_it(self):
        first = self.home(mock_seconds="3")
        repo = self.project("notes")
        request = self.artemis("request", "One note", cwd=repo).stdout.strip()
        task = int(self.artemis("task", request, "Write a note", "--check", f"{sys.executable} -m unittest",
                                cwd=repo).stdout)
        wait_for(lambda: self.state(task) == "running", 30, step_s=0.05, what="the task to start")
        first.kill()                                               # no goodbye: the run stays open
        first.wait(30)
        self.assertEqual(self.state(task), "running")
        second = self.home(mock_seconds="0.3")
        self.assertIn("1 run(s) left open by the previous home are stuck: home restarted", "".join(second.said))
        row = self.ledger.work(task)[0]
        self.assertEqual((row["state"], row["note"]), ("stuck", "home restarted"))
        time.sleep(3)                                              # the orphaned mock finishes its sleep
        self.artemis("retry", task)
        wait_for(lambda: self.state(task) == "shipped", 60, what="the retried task")


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

    def test_checks_see_only_allowlisted_variables_and_pass_env(self):
        from unittest.mock import patch
        from artemis.judge import CommandEvidence
        with TemporaryDirectory() as scratch, patch.dict(os.environ, {"SOME_TOKEN": "x", "DATABASE_URL": "db"}):
            argv = (sys.executable, "-c", "import os; print(sorted(k for k in ('SOME_TOKEN', 'DATABASE_URL', 'PATH') if k in os.environ))")
            self.assertIn("['PATH']", CommandEvidence.capture(Path(scratch), argv).output)
            self.assertIn("['DATABASE_URL', 'PATH']",
                          CommandEvidence.capture(Path(scratch), argv, pass_env=("DATABASE_URL",)).output)
            (Path(scratch) / "artemis.toml").write_text('[ship]\nchecks = []\npass_env = ["DATABASE_URL"]\n', encoding="utf-8")
            self.assertEqual(Config.load(Path(scratch)).pass_env, ("DATABASE_URL",))

    def test_a_check_is_one_command_without_a_shell(self):
        for windows, quote in ((False, "'"), (True, '"')):   # each system quotes its own way
            with self.subTest(windows=windows), mock.patch.object(process, "WINDOWS", windows):
                self.assertEqual(_check(f"grep -q -- {quote}--json{quote} README.md"),
                                 ("grep", "-q", "--", "--json", "README.md"))
                self.assertEqual(_check(f"grep -q {quote}&&{quote} notes.txt"), ("grep", "-q", "&&", "notes.txt"))
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

    def test_a_decision_stays_on_one_line_cut_after_whole_words(self):
        what = "Post a release note to the team (python3 notify.py) announcing --json and --done"
        result = "you approved · Posted release note announcing --json and --done via notify.py to outbox/team.md"
        line = _one_line("decided   D1 ", what, result, 100)
        self.assertLessEqual(len(line), 100)
        self.assertRegex(line, r"^decided   D1 Post a release note to…  you approved · Posted release note .*\w…$")
        self.assertEqual(_one_line("decided   D1 ", "Post a note", "you declined", 100),
                         "decided   D1 Post a note  you declined")
        self.assertEqual(clip("one\ntwo  three", 9), "one two…")
        self.assertEqual(clip("unbreakable", 5), "unbr…")

    def test_evidence_reads_in_words_and_once_per_file(self):
        phrases = [_said(["grep", "-q", "--", "--json", "README.md"], 0), _said(["grep", "-q", "--done", "README.md"], 0),
                   "README.md recorded", _said(["python3", "-m", "unittest"], 0), _said(["grep", "-q", "x", "a"], 1)]
        self.assertEqual(_joined(phrases), "README.md mentions --json, --done · python3 -m unittest exit 0 · "
                                           "grep -q x a exit 1")
        self.assertEqual(_joined(["notes.md recorded"]), "notes.md recorded")
        self.assertEqual(_joined([]), "no evidence")

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
