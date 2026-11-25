"""The supervisor and dispatcher, with a scripted stand-in worker: each run is `python -c <script>`."""

from contextlib import closing
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest import mock

from artemis import judge, process, supervise
from artemis.config import Config
from artemis.home import Home, Parts, Paths
from artemis.judge import Criterion
from artemis.roles import Interrupt, Role, WorkflowError

from helpers import git, home_settings, repository, vault_env, wait_for


class Worker:
    """Stand-in launcher. The script runs in the task's worktree or folder and reads the prompt on stdin;
    RUN and LEDGER tell it its run and the home's ledger."""

    def __init__(self, script: str):
        self.script, self.calls = script, []

    def __call__(self, provider, *, role, mode, cwd, prompt, mcp, config, vault, scratch, session):
        self.calls.append(SimpleNamespace(provider=provider, role=role, mode=mode, cwd=Path(cwd), prompt=prompt,
                                          mcp=mcp))
        run = Path(scratch).name.removeprefix("run-")
        return SimpleNamespace(argv=[sys.executable, "-c", self.script], stdin=prompt, decode=str.strip,
                               env={"RUN": run, "LEDGER": str(Path(scratch).parent.parent / "ledger.db")})


WRITE_SUMMARY = "from pathlib import Path\nPath('summary.csv').write_text('day,name\\n')\nprint('wrote summary.csv')"
SLEEP = ("import subprocess, sys, time\n"
         "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])\n"
         "open('grandchild.pid', 'w').write(str(child.pid))\n"
         "time.sleep(120)")


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def place_mock(kind, config, busy, *, vault, ledger, project):
    return "mock"


class Supervision(unittest.TestCase):
    def setUp(self):
        self.scratch = Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(vault_env())
        self.paths = Paths.at(home_settings(self.scratch / "home"))

    def home(self, worker, config: str = "", **parts) -> Home:
        if config:
            (self.paths.config).write_text('[vault]\nunlock = "env"\n' + config, encoding="utf-8")
        home = Home(self.paths, 0, Parts(**{"place": place_mock, "launch": worker, **parts}))
        self.addCleanup(home.close, 10)
        return home

    def folder(self, home, name="film", criteria=(Criterion("summary.csv", artifact="summary.csv"),), title="Sort"):
        root = self.scratch / name
        (root / "incoming").mkdir(parents=True, exist_ok=True)
        (root / "incoming" / "a.mov").write_bytes(b"stand-in clip")
        project = home.ledger.add_project(Role.OWNER, name, "folder", root.resolve())
        request = home.ledger.request(Role.OWNER, "Sort this week's files", project=project)
        return root, home.ledger.add_task(Role.LEAD, request, title, "", tuple(criteria), kind="host")

    def settle(self, home, timeout_s=60):
        """Dispatch until no task is ready, then wait for every supervisor to end."""
        supervise.dispatch(home)
        wait_for(lambda: not home.supervisors, timeout_s, what="the supervisors to end")

    def state(self, home, task):
        return home.ledger.work(task)[0]["state"]

    def test_a_folder_task_is_judged_against_the_folder_as_it_began_and_verified(self):
        seen = []

        def capture(root, criteria, pass_env=(), before=None, extra=()):
            seen.append(before)
            return judge.capture(root, criteria, pass_env, before=before, extra=extra)

        worker = Worker(WRITE_SUMMARY)
        home = self.home(worker)
        root, task = self.folder(home, criteria=(Criterion("summary.csv is rewritten", exists="summary.csv"),))
        (root / "summary.csv").write_bytes(b"old\n")
        with mock.patch.object(supervise, "capture", capture):
            self.settle(home)
        self.assertEqual(self.state(home, task), "verified")
        call = worker.calls[0]
        self.assertEqual((call.mode, call.role, call.cwd), ("host", "worker", root.resolve()))
        self.assertIn("Task #1: Sort", call.prompt)
        self.assertEqual(call.mcp[call.mcp.index("--run") + 1], str(self.paths.runs / "1.token"))
        start = {"summary.csv": {"summary.csv": [4, hashlib.sha256(b"old\n").hexdigest()]}}
        self.assertEqual(seen, [start])
        inputs = [e for e in home.ledger.events(task=task) if e["kind"] == "inputs"]
        self.assertEqual(json.loads(inputs[0]["data"])["files"], start)
        self.assertTrue(home.ledger.work(task)[0]["sha"].startswith("host:"))
        self.assertFalse((self.paths.runs / "1.token").exists())   # the run's broker token ends with it

    def test_files_moved_in_from_a_folder_the_project_reaches_are_judged_preserved(self):
        downloads = (self.scratch / "Downloads" / "invoices")
        downloads.mkdir(parents=True)
        for number in range(3):
            (downloads / f"invoice-{number}.pdf").write_bytes(f"invoice {number}".encode())
        source = downloads.resolve().as_posix()
        worker = Worker(f"import pathlib, shutil\nsource = pathlib.Path({source!r})\n"
                        "target = pathlib.Path('2026-11')\ntarget.mkdir(exist_ok=True)\n"
                        "for path in sorted(source.glob('*.pdf')):\n    shutil.move(str(path), target / path.name)\n"
                        "print('moved the invoices')")
        home = self.home(worker)
        root, task = self.folder(home, criteria=(Criterion("every invoice kept", preserved=(source, "2026-11")),
                                                 Criterion("three filed", count=("2026-11", 3))))
        home.ledger.set_project_flags(Role.OWNER, home.ledger.task_brief(task)["project_id"], shell=False,
                                      no_run=False, allowed_roots=(downloads.parent.resolve(),))
        self.settle(home)
        self.assertEqual(self.state(home, task), "verified", home.ledger.work(task)[0]["note"])
        self.assertEqual(sorted(path.name for path in (root / "2026-11").iterdir()),
                         ["invoice-0.pdf", "invoice-1.pdf", "invoice-2.pdf"])

    def test_a_host_check_on_a_file_the_worker_left_alone_is_a_gap(self):
        home = self.home(Worker("print('did nothing')"))
        root, task = self.folder(home, criteria=(Criterion("summary.csv is rewritten", exists="summary.csv"),))
        (root / "summary.csv").write_text("old\n", encoding="utf-8")
        self.settle(home)
        self.assertEqual(self.state(home, task), "stuck")
        self.assertIn("summary.csv is unchanged since the task started", home.ledger.work(task)[0]["note"])

    def test_a_failed_attempt_runs_again_with_what_went_wrong(self):
        worker = Worker("import sys\nprompt = sys.stdin.read()\n"
                        "if 'another attempt' not in prompt:\n    sys.exit('no disk space (stand-in)')\n"
                        + WRITE_SUMMARY)
        home = self.home(worker)
        _, task = self.folder(home)
        self.settle(home)
        self.assertEqual(self.state(home, task), "verified")
        self.assertEqual(len(worker.calls), 2)
        self.assertIn("no disk space (stand-in)", worker.calls[1].prompt)
        retrying = [e for e in home.ledger.events(task=task) if e["kind"] == "retrying"]
        self.assertEqual([e["role"] for e in retrying], [Role.WORKER])
        self.assertNotIn(task, home.retries)        # a worker's own retry is not a request to rerun

    def test_a_judged_gap_is_fed_back_and_three_attempts_end_stuck(self):
        worker = Worker("print('done, honestly')")
        home = self.home(worker)
        _, task = self.folder(home)
        self.settle(home)
        self.assertEqual(self.state(home, task), "stuck")
        self.assertEqual(len(worker.calls), supervise.ATTEMPTS)
        self.assertIn("The judge found these gaps", worker.calls[1].prompt)
        self.assertIn("judge:", home.ledger.work(task)[0]["note"])

    def test_a_repo_task_ships_from_its_own_worktree(self):
        repo = repository(self.scratch / "todo")
        Config.initialize(repo, "main")
        worker = Worker("from pathlib import Path\nPath('NOTES.md').write_text('notes\\n')\nprint('wrote NOTES.md')")
        home = self.home(worker)
        project = home.ledger.add_project(Role.OWNER, "todo", "repo", repo.resolve())
        request = home.ledger.request(Role.OWNER, "Add notes", project=project)
        task = home.ledger.add_task(Role.LEAD, request, "Write notes", "",
                                    (Criterion("NOTES.md", artifact="NOTES.md"),))
        self.settle(home)
        self.assertEqual(self.state(home, task), "shipped")
        tree = self.paths.worktree("todo", task)
        self.assertEqual(worker.calls[0].cwd, tree)
        self.assertEqual(worker.calls[0].mode, "repo")
        self.assertEqual(git(repo, "show", "main:NOTES.md"), "notes")
        self.assertFalse(tree.exists())
        self.assertEqual(git(repo, "branch", "--show-current"), "main")

    def test_a_conflicting_landing_merges_the_target_and_tries_again(self):
        repo = repository(self.scratch / "todo")
        Config.initialize(repo, "main")
        # The first attempt edits app.py; meanwhile main changes the same line, so the landing conflicts.
        script = ("import sys, subprocess\nfrom pathlib import Path\nprompt = sys.stdin.read()\n"
                  "if 'another attempt' not in prompt:\n"
                  "    Path('app.py').write_text('VALUE = 2\\n')\n"
                  "    subprocess.run(['git', '-C', sys.argv[1], 'commit', '-qam', 'Main moves'], check=True)\n"
                  "else:\n    Path('app.py').write_text('VALUE = 4\\n')\nprint('set VALUE')")
        worker = Worker(script)
        home = self.home(worker)
        project = home.ledger.add_project(Role.OWNER, "todo", "repo", repo.resolve())
        request = home.ledger.request(Role.OWNER, "Raise the value", project=project)
        task = home.ledger.add_task(Role.LEAD, request, "Raise VALUE", "",
                                    (Criterion("tests", command=(sys.executable, "-m", "unittest")),))
        (repo / "app.py").write_text("VALUE = 3\n", encoding="utf-8")
        original = Worker.__call__

        def launch(self_, *args, **kwargs):
            made = original(self_, *args, **kwargs)
            made.argv = made.argv + [str(repo)]
            return made

        with mock.patch.object(Worker, "__call__", launch):
            self.settle(home)
        self.assertEqual(self.state(home, task), "shipped")
        self.assertIn("conflict", worker.calls[1].prompt.lower())
        self.assertEqual(git(repo, "show", "main:app.py"), "VALUE = 4")

    @unittest.skipIf(os.name == "nt", "the process-tree check reads POSIX process ids")
    def test_a_stop_ends_the_whole_worker_tree(self):
        home = self.home(Worker(SLEEP))
        root, task = self.folder(home)
        supervise.dispatch(home)
        pid = int(wait_for(lambda: (root / "grandchild.pid").exists() and (root / "grandchild.pid").read_text(),
                           what="the worker's child"))
        home.ledger.stop(Role.OWNER, "lunch")
        wait_for(lambda: not home.supervisors, 30, what="the stop")
        row = home.ledger.work(task)[0]
        self.assertEqual((row["state"], row["note"]), ("stuck", "stopped by you"))
        wait_for(lambda: not alive(pid), 10, what="the grandchild to end")
        self.assertEqual(supervise.dispatch(home), [])

    def test_each_worker_is_recorded_by_its_process_id_and_start_time(self):
        home = self.home(Worker(SLEEP))
        _, task = self.folder(home)
        supervise.dispatch(home)
        event = wait_for(lambda: next((event for event in home.ledger.events(task=task)
                                       if event["kind"] == "worker.process"), None), what="the worker's process")
        recorded = json.loads(event["data"])
        self.assertEqual(recorded["run"], home.ledger.work(task)[0]["run_id"])
        self.assertEqual(process.started(recorded["pid"]), recorded["start"])
        home.ledger.stop(Role.OWNER, "lunch")
        wait_for(lambda: not home.supervisors, 30, what="the stop")

    def test_a_running_task_is_not_dropped_from_under_its_worker(self):
        home = self.home(Worker(SLEEP))
        root, task = self.folder(home)
        supervise.dispatch(home)
        wait_for(lambda: (root / "grandchild.pid").exists(), what="the worker to start")
        with self.assertRaises(WorkflowError):
            home.ledger.drop(Role.LEAD, task, "not needed")
        home.ledger.stop(Role.OWNER, "then stop it")
        wait_for(lambda: not home.supervisors, 30, what="the stop")
        home.ledger.resume(Role.OWNER, "back")
        home.ledger.drop(Role.LEAD, task, "not needed")
        self.assertEqual(self.state(home, task), "dropped")

    def test_the_deadline_ends_a_slow_worker(self):
        home = self.home(Worker("import time\ntime.sleep(120)"))
        home.config = replace(home.config, agents=replace(home.config.agents, worker_minutes=0.02))
        _, task = self.folder(home)
        self.settle(home, 30)
        row = home.ledger.work(task)[0]
        self.assertEqual(row["state"], "stuck")
        self.assertIn("no result after", row["note"])

    def test_a_run_that_asks_waits_and_the_next_run_hears_the_answer(self):
        script = ("import os, sys\nprompt = sys.stdin.read()\n"
                  "if 'Card 1' not in prompt:\n"
                  "    from artemis.ledger import Ledger\n    from artemis.roles import Role\n"
                  "    Ledger(os.environ['LEDGER']).open_card(Role.HOME, 'send as you', 'Post the summary', "
                  "'it speaks for you', run=int(os.environ['RUN']))\n    print('asked to post')\n"
                  "else:\n" + "\n".join("    " + line for line in WRITE_SUMMARY.splitlines()))
        worker = Worker(script)
        home = self.home(worker)
        _, task = self.folder(home)
        self.settle(home)
        row = home.ledger.work(task)[0]
        self.assertEqual((row["state"], row["note"]), ("stuck", "waiting for card 1"))
        self.assertEqual(supervise.dispatch(home), [])              # held while the card is open
        home.ledger.decide_card(Role.OWNER, 1, True)
        self.assertEqual(supervise.dispatch(home), [])              # approved, not yet carried out
        home.ledger.finish_card(Role.LEAD, 1, "done", "posted to the team")
        self.settle(home)
        self.assertEqual(self.state(home, task), "verified")
        self.assertIn("Card 1 (Post the summary): approved and carried out. Result: posted to the team",
                      worker.calls[1].prompt)

    def test_a_person_asked_retry_reruns_a_stuck_task_with_the_reason(self):
        worker = Worker("import sys\nprompt = sys.stdin.read()\n"
                        "if 'use the March folder' not in prompt:\n    print('nothing to do')\nelse:\n"
                        + "\n".join("    " + line for line in WRITE_SUMMARY.splitlines()))
        home = self.home(worker)
        _, task = self.folder(home)
        self.settle(home)
        self.assertEqual(self.state(home, task), "stuck")
        home.ledger.record(Role.LEAD, "retrying", "use the March folder", task=task)
        home.follow()
        self.assertIn(task, home.retries)
        self.settle(home)
        self.assertEqual(self.state(home, task), "verified")
        self.assertIn("Asked to try again: use the March folder", worker.calls[-1].prompt)

    def test_dispatch_keeps_to_the_worker_and_provider_caps(self):
        home = self.home(Worker(SLEEP.replace("open('grandchild.pid', 'w')", "open(f'pid-{id(child)}', 'w')")),
                         config="[agents]\nmax_workers = 2\ncaps = { mock = 1 }\n")
        tasks = [self.folder(home, name=f"f{n}")[1] for n in range(3)]
        self.assertEqual(len(supervise.dispatch(home)), 1)          # mock may run one at a time
        home.config = replace(home.config, agents=replace(home.config.agents, caps={"mock": 4}))
        self.assertEqual(len(supervise.dispatch(home)), 1)          # two in all
        self.assertEqual([self.state(home, task) for task in tasks].count("running"), 2)
        home.ledger.stop(Role.OWNER, "enough")
        wait_for(lambda: not home.supervisors, 30)

    def test_a_v02_stop_in_the_repository_holds_that_project_only(self):
        repo = repository(self.scratch / "old")
        Config.initialize(repo, "main")
        (repo / ".artemis").mkdir()
        with closing(sqlite3.connect(repo / ".artemis" / "ledger.db")) as db, db:
            db.execute("CREATE TABLE events (id INTEGER PRIMARY KEY, role TEXT, kind TEXT)")
            db.executemany("INSERT INTO events(role, kind) VALUES ('you', ?)", [("halt",), ("resume",), ("halt",)])
        logged = []
        home = self.home(Worker(WRITE_SUMMARY))
        home.log = logged.append
        project = home.ledger.add_project(Role.OWNER, "old", "repo", repo.resolve())
        request = home.ledger.request(Role.OWNER, "Notes", project=project)
        held = home.ledger.add_task(Role.LEAD, request, "Write notes", "", (Criterion("n", artifact="n.md"),))
        _, other = self.folder(home)
        self.assertEqual(supervise.dispatch(home), [other])
        self.assertEqual(supervise.dispatch(home), [])
        self.assertEqual(len([line for line in logged if "v0.2 ledger" in line]), 1)
        self.assertEqual(self.state(home, held), "queued")
        wait_for(lambda: not home.supervisors)

    def test_a_task_waits_while_no_provider_can_take_it(self):
        asked, answer = [], [""]

        def place(kind, config, busy, *, vault, ledger, project):
            asked.append((kind, vault is home.vault, ledger is home.ledger, project))
            return answer[0]

        home = self.home(Worker(WRITE_SUMMARY), place=place)
        _, task = self.folder(home)
        self.assertEqual(supervise.dispatch(home), [])
        self.assertEqual(self.state(home, task), "queued")
        self.assertEqual(asked, [("host", True, True, home.ledger.work(task)[0]["project_id"])])
        answer[0] = "mock"
        self.settle(home)
        self.assertEqual(self.state(home, task), "verified")

    def test_the_built_in_mock_runs_when_no_launcher_is_installed(self):
        with mock.patch.dict(os.environ, {"ARTEMIS_MOCK_SECONDS": "0.1"}):
            home = Home(self.paths, 0, Parts(place=place_mock))
            self.addCleanup(home.close, 10)
            root, task = self.folder(home, criteria=(Criterion("note", artifact="mock-notes/task-1.md"),))
            self.settle(home)
        self.assertEqual(self.state(home, task), "verified")
        self.assertIn("mock worker left this note", (root / "mock-notes" / "task-1.md").read_text(encoding="utf-8"))
        self.assertIn("--- mock worker:", self.paths.log(task).read_text(encoding="utf-8"))

    def test_workers_never_see_the_vault_passphrase_or_other_artemis_variables(self):
        script = ("import os\nopen('env.txt', 'w').write(' '.join(sorted(k for k in os.environ "
                  "if k.startswith(('ARTEMIS_', 'GIT_')) or k.endswith('_API_KEY'))))\n" + WRITE_SUMMARY)
        fake = {"ARTEMIS_HOME": "x", "ARTEMIS_VAULT_PASSPHRASE": "fake", "GIT_DIR": "x", "OPENAI_API_KEY": "fake-openai",
                "ANTHROPIC_API_KEY": "fake-anthropic", "ARTEMIS_MOCK_SECONDS": "0.1"}
        with mock.patch.dict(os.environ, fake):
            home = self.home(Worker(script))
            root, task = self.folder(home)
            self.settle(home)
        self.assertEqual(self.state(home, task), "verified")
        self.assertEqual((root / "env.txt").read_text(encoding="utf-8"), "ARTEMIS_MOCK_SECONDS")


class Environment(unittest.TestCase):
    def test_each_provider_gets_its_own_variables_and_none_of_artemis(self):
        fake = {"ARTEMIS_VAULT_PASSPHRASE": "fake", "ARTEMIS_PORT": "1", "GIT_DIR": "x", "PATH": "/bin",
                "HTTPS_PROXY": "http://proxy.example.com", "OPENAI_API_KEY": "fake", "ANTHROPIC_API_KEY": "fake",
                "XDG_CONFIG_HOME": "/tmp/x", "LC_ALL": "C", "AWS_SECRET_ACCESS_KEY": "fake"}
        with mock.patch.dict(os.environ, fake, clear=True):
            claude, codex = process.agent_env("claude"), process.agent_env("codex")
        self.assertEqual(sorted(claude), ["ANTHROPIC_API_KEY", "HTTPS_PROXY", "LC_ALL", "PATH", "PYTHONIOENCODING",
                                          "XDG_CONFIG_HOME"])
        self.assertIn("OPENAI_API_KEY", codex)
        self.assertNotIn("ANTHROPIC_API_KEY", codex)

    def test_checkouts_drop_git_and_artemis_variables(self):
        with mock.patch.dict(os.environ, {"ARTEMIS_VAULT_PASSPHRASE": "fake", "GIT_DIR": "x", "PATH": "/bin"}, clear=True):
            self.assertEqual(process.checkout_env(), {"PATH": "/bin", "PYTHONIOENCODING": "utf-8"})

    def test_every_child_is_asked_to_print_utf8(self):
        with mock.patch.dict(os.environ, {"PYTHONIOENCODING": "cp1252"}):   # as a Windows console's code page
            for env in (process.check_env(), process.agent_env("mock"), process.checkout_env()):
                self.assertEqual(env["PYTHONIOENCODING"], "utf-8")
            said = judge.CommandEvidence.capture(Path.cwd(), (sys.executable, "-c", "print('a \\u00b7 b')"))
        self.assertEqual(said.output, "a \u00b7 b\n")


class Evidence(unittest.TestCase):
    def test_the_folder_digest_is_stable(self):
        criteria = (Criterion("summary", artifact="summary.csv"),)
        with TemporaryDirectory() as scratch:
            (Path(scratch) / "summary.csv").write_text("day\n", encoding="utf-8")
            items = judge.capture(Path(scratch), criteria)
        digest = supervise.evidence_digest(items)
        self.assertRegex(digest, r"^host:[0-9a-f]{64}$")
        self.assertEqual(digest, supervise.evidence_digest(dict(items)))

    def test_a_card_outcome_reads_as_an_instruction(self):
        card = {"id": 4, "what": "Post the summary", "result": "", "kind": Interrupt.SEND, "options": None,
                "answer": None, "state": "expired"}
        self.assertIn("nobody answered it in time", supervise._card_outcome(card))
        self.assertIn("declined", supervise._card_outcome(card | {"state": "declined"}))


if __name__ == "__main__":
    unittest.main()
