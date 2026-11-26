from contextlib import closing
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import threading
import time
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

# mock: schedule.py is another builder's module; a stand-in only until it is on this branch
if importlib.util.find_spec("artemis.schedule") is None:
    sys.modules["artemis.schedule"] = ModuleType("artemis.schedule")
    sys.modules["artemis.schedule"].next_after = lambda spec, after: after.timestamp() + 3600

from artemis import broker, undo, vault as vault_module  # noqa: E402
from artemis.broker import Broker, ToolError  # noqa: E402
from artemis.judge import ContainsEvidence, Criterion, RuleJudge  # noqa: E402
from artemis.ledger import Ledger  # noqa: E402
from artemis.roles import Interrupt, Role  # noqa: E402
from artemis.vault import PASSPHRASE_ENV, Vault, VaultLocked  # noqa: E402

TOKEN_VALUE = "demo-value-not-a-real-secret-0001"      # fake values, made up for these tests
OTHER_VALUE = "demo-value-not-a-real-secret-0002"
PASSPHRASE = "demo passphrase for tests"                # fake
CHEAP = {"n": 2 ** 10, "r": 8, "p": 1}                  # scrypt parameters that keep the tests fast
RULES = """
[match."send as you"]
argv = [["python*", "notify.py"]]
[match."irreversible delete"]
argv = [["python*", "wipe.py"]]
[match."money out"]
argv = [["python*", "pay.py"]]
[opaque]
argv = [["python*", "build.py"]]
[deny]
argv = [["python*", "leak.py"]]
"""
SCRIPT = """import os, sys
from pathlib import Path
name, rest = Path(sys.argv[0]).name, " ".join(sys.argv[1:])
with open("ran.log", "a", encoding="utf-8") as record:
    record.write(f"{name} {rest}\\n")
print("ran", " ".join(sys.argv[1:]))
"""


@dataclass(frozen=True)
class Grant:
    """mock of home.Grant: what one run's token allows."""
    run: int | None
    task: int | None
    project: int
    role: str
    root: Path
    kind: str


class FakeHome:
    """mock of the home: its paths, ledger, config and tokens, with a real ledger and a real vault unlocked the
    way CI unlocks it (from ARTEMIS_VAULT_PASSPHRASE)."""

    def __init__(self, root: Path):
        base = root / "artemis-home"
        self.paths = SimpleNamespace(root=base, ledger=base / "ledger.db", vault=base / "vault.db",
                                     rules=base / "rules.toml", undo=base / "undo", work=base / "work",
                                     runs=base / "runs")
        base.mkdir()
        self.ledger = Ledger(self.paths.ledger)
        self.ledger.initialize()
        self.vault = Vault(self.paths, "env")
        self.config = SimpleNamespace(
            run=SimpleNamespace(timeout_s=60, wrap=(), batch_ok=("npm", "npx", "pnpm", "yarn")),
            interrupts=SimpleNamespace(ask=(Interrupt.SPEND, Interrupt.DELETE, Interrupt.SEND)))
        self.grants: dict[str, Grant] = {}

    def grant_for(self, token):
        return self.grants.get(token)


def set_flags(ledger: Ledger, project: int, shell=False, no_run=False, allowed_roots=()):
    """A project's flags. The columns are the ones the home builder's ledger change adds; until that change is on
    this branch they are added here the same way (mock)."""
    if hasattr(ledger, "set_project_flags"):
        ledger.set_project_flags(Role.OWNER, project, shell=shell, no_run=no_run, allowed_roots=tuple(allowed_roots))
        return
    with closing(sqlite3.connect(ledger.path)) as db, db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(projects)")}
        if "shell" not in columns:
            db.executescript("ALTER TABLE projects ADD COLUMN shell INTEGER NOT NULL DEFAULT 0;"
                             "ALTER TABLE projects ADD COLUMN no_run INTEGER NOT NULL DEFAULT 0;"
                             "ALTER TABLE projects ADD COLUMN allowed_roots TEXT NOT NULL DEFAULT '[]';")
        db.execute("UPDATE projects SET shell = ?, no_run = ?, allowed_roots = ? WHERE id = ?",
                   (int(shell), int(no_run), json.dumps([str(root) for root in allowed_roots]), project))


class BrokerCase(unittest.TestCase):
    def setUp(self):
        self.base = Path(os.path.realpath(self.enterContext(TemporaryDirectory())))
        self.enterContext(patch.dict(os.environ, {PASSPHRASE_ENV: PASSPHRASE}))
        self.enterContext(patch.object(vault_module, "SCRYPT", CHEAP))
        self.home = FakeHome(self.base)
        self.ledger = self.home.ledger
        self.home.paths.rules.write_text(RULES, encoding="utf-8", newline="")
        self.folder = self.base / "photos"
        self.folder.mkdir()
        for name in ("notify", "wipe", "pay", "build", "leak", "show"):
            (self.folder / f"{name}.py").write_text(SCRIPT, encoding="utf-8", newline="")
        self.project = self.ledger.add_project(Role.OWNER, "photos", "folder", self.folder)
        self.task = self.add_task((Criterion("notes.txt says done", contains=("notes.txt", "done")),
                                   Criterion("two photos", count=("*.jpg", 2)),
                                   Criterion("show runs", command=("python3", "show.py"))))
        self.run_id = self.ledger.claim_run(Role.HOME, self.task, "mock")
        self.broker = Broker(self.home)
        self.broker.handoff_s = 5
        self.addCleanup(self.settle)
        self.grant("worker-token", Grant(self.run_id, self.task, self.project, "worker", self.folder, "folder"))
        self.grant("lead-token", Grant(None, None, self.project, "lead", self.folder, "folder"))

    def settle(self):
        """Stop what a test left running and let each job record its end before the folder goes."""
        for process in list(self.broker._jobs.values()):
            process.stop("the test ended")
        for _ in range(500):
            if not self.broker._jobs:
                return
            time.sleep(0.01)

    def add_task(self, criteria, title="Tidy the photos"):
        request = self.ledger.request(Role.OWNER, "Tidy the photos", project=self.project)
        return self.ledger.add_task(Role.LEAD, request, title, "Sort them.", criteria, project=self.project,
                                    kind="host")

    def grant(self, token, grant):
        self.home.grants[token] = grant

    def secret(self, name, value, use="env", kind="none", origin=None, note=""):
        self.home.vault.set(name, value, use=use, kind=kind, origin=origin, note=note)

    def scheduled(self):
        """A task a schedule made, with a running run: (its token, the schedule)."""
        schedule = self.ledger.add_schedule(Role.LEAD, self.project, "Nightly", "Tidy.", "host",
                                            (Criterion("notes", exists="notes.txt"),), "daily 02:00", 1000.0)
        task = self.ledger.fire(schedule, 1000.0, 2000.0, False)
        run = self.ledger.claim_run(Role.HOME, task, "mock")
        self.grant("scheduled-token", Grant(run, task, self.project, "worker", self.folder, "folder"))
        return "scheduled-token", schedule

    def call(self, tool, token="worker-token", **args):
        return self.broker.call(token, tool, args)

    def python(self, *argv, token="worker-token", **args):
        return self.call("run", token, argv=[sys.executable, *argv], **args)

    def ran(self) -> list[str]:
        log = self.folder / "ran.log"
        return log.read_text(encoding="utf-8").splitlines() if log.exists() else []

    def events(self, kind):
        return [row for row in self.ledger.events() if row["kind"] == kind]


class ToolSetTests(BrokerCase):
    def test_each_role_sees_its_own_tools(self):
        worker = {tool["name"] for tool in self.call("tools/list")["tools"]}
        lead = {tool["name"] for tool in self.call("tools/list", "lead-token")["tools"]}
        self.assertEqual(worker, {"run", "job", "job_stop", "http_request", "read_file", "list_dir", "search",
                                  "write_file", "move", "trash", "secret_names", "secret_request", "ask", "note",
                                  "board", "check"})
        self.assertEqual(lead, {"projects", "status", "evidence", "read_file", "list_dir", "search", "task_create",
                                "task_retry", "task_drop", "schedule", "ask", "secret_request", "lesson", "note",
                                "board"})
        for name in ("run", "write_file", "http_request", "project_add"):
            with self.subTest(name=name), self.assertRaisesRegex(ToolError, "not one of your tools"):
                self.call(name, "lead-token")
        for tool in self.broker.tools("worker") + self.broker.tools("lead"):
            self.assertEqual(set(tool), {"name", "description", "inputSchema"})
            self.assertEqual(tool["inputSchema"]["type"], "object")

    def test_a_no_run_project_has_no_run_or_job(self):
        set_flags(self.ledger, self.project, no_run=True)
        names = {tool["name"] for tool in self.call("tools/list")["tools"]}
        self.assertFalse(names & {"run", "job", "job_stop"})
        self.assertIn("read_file", names)
        with self.assertRaisesRegex(ToolError, "not one of your tools"):
            self.python("show.py")
        self.assertEqual(self.ran(), [])

    def test_arguments_are_checked_against_the_schema(self):
        for tool, args, message in (("run", {}, "needs 'argv'"), ("run", {"argv": "ls"}, "must be array"),
                                    ("read_file", {"path": "a", "extra": 1}, "no field 'extra'"),
                                    ("run", {"argv": ["x"], "env_secrets": {"lower": "X"}}, "right form"),
                                    ("ask", {"kind": "approve", "what": "a", "why": "b", "options": []},
                                     "must be one of")):
            with self.subTest(tool=tool, args=args), self.assertRaisesRegex(ToolError, message):
                self.broker.call("worker-token", tool, args)

    def test_an_ended_run_has_no_tools(self):
        with self.assertRaisesRegex(ToolError, "This run has ended"):
            self.call("read_file", "no-such-token", path="show.py")


class ScopeTests(BrokerCase):
    def setUp(self):
        super().setUp()
        (self.base / "outside.txt").write_text("not yours", encoding="utf-8", newline="")
        (self.folder / "inside.txt").write_text("yours", encoding="utf-8", newline="")

    def test_paths_stay_inside_the_project(self):
        self.assertEqual(self.call("read_file", path="inside.txt")["content"], "yours")
        self.assertEqual(self.call("read_file", path=str(self.folder / "inside.txt"))["content"], "yours")
        (self.folder / "link.txt").symlink_to(self.base / "outside.txt")
        (self.folder / "away").symlink_to(self.base, target_is_directory=True)
        for path in ("../outside.txt", str(self.base / "outside.txt"), "link.txt", "away/outside.txt",
                     "sub/../../outside.txt", str(self.home.paths.ledger)):
            with self.subTest(path=path), self.assertRaisesRegex(ToolError, "outside the project"):
                self.call("read_file", path=path)
        listed = [entry["path"] for entry in self.call("list_dir", path=".")["entries"]]
        self.assertNotIn("link.txt", listed)
        self.assertNotIn("away", listed)
        self.assertEqual(self.call("search", pattern="not yours")["matches"], [])
        with self.assertRaisesRegex(ToolError, "outside the project"):
            self.python("show.py", cwd="..")
        with self.assertRaisesRegex(ToolError, "outside the project"):
            self.call("write_file", path="../outside.txt", content="mine now")
        self.assertEqual((self.base / "outside.txt").read_text(encoding="utf-8"), "not yours")

    def test_artemis_home_env_files_and_keys_are_off_limits_even_inside_an_allowed_root(self):
        user = self.base / "user"
        (user / ".ssh").mkdir(parents=True)
        (user / ".ssh" / "id_demo").write_text("demo key", encoding="utf-8", newline="")
        (self.folder / ".env").write_text(f"OPENAI_API_KEY={OTHER_VALUE}", encoding="utf-8", newline="")
        (self.folder / ".env.local").write_text("X=1", encoding="utf-8", newline="")
        set_flags(self.ledger, self.project, allowed_roots=(self.base,))
        with patch.dict(os.environ, {"HOME": str(user), "USERPROFILE": str(user)}):
            self.assertEqual(self.call("read_file", path=str(self.base / "outside.txt"))["content"], "not yours")
            for path, message in ((str(self.home.paths.ledger), "Artemis's own folder"),
                                  (str(self.home.paths.rules), "Artemis's own folder"),
                                  (".env", "a .env file"), (".env.local", "a .env file"),
                                  (str(user / ".ssh" / "id_demo"), "SSH keys")):
                with self.subTest(path=path), self.assertRaisesRegex(ToolError, message):
                    self.call("read_file", path=path)
            listed = [entry["path"] for entry in self.call("list_dir", path=".")["entries"]]
            self.assertFalse([path for path in listed if ".env" in path])
            self.assertEqual(self.call("search", pattern="OPENAI_API_KEY")["matches"], [])
            for args in ([".env"], ["~/.ssh/id_demo", "copy"], [f"--config={self.home.paths.ledger}"]):
                with self.subTest(args=args):
                    result = self.python("show.py", *args)
                    self.assertEqual(result["state"], "denied")
        self.assertEqual(len(self.events("run.denied")), 3)
        self.assertEqual(self.ran(), [])

    def test_a_repo_worktree_inside_the_home_is_the_task_s_own_folder(self):
        worktree = self.home.paths.work / "photos" / f"task-{self.task}"
        worktree.mkdir(parents=True)
        (worktree / "README.md").write_text("# Demo\n", encoding="utf-8", newline="")
        self.grant("repo-token", Grant(self.run_id, self.task, self.project, "worker", worktree, "repo"))
        self.assertEqual(self.call("read_file", "repo-token", path="README.md")["content"], "# Demo\n")
        for path in ("../../../ledger.db", str(self.home.paths.ledger)):
            with self.subTest(path=path), self.assertRaises(ToolError):
                self.call("read_file", "repo-token", path=path)
        with self.assertRaisesRegex(ToolError, "repo project"):
            self.call("write_file", "repo-token", path="README.md", content="x")

    def test_read_list_and_search_have_limits(self):
        (self.folder / "big.txt").write_text("line\n" * 1000, encoding="utf-8", newline="")
        (self.folder / "blob.bin").write_bytes(b"\0\1\2line")
        read = self.call("read_file", path="big.txt", max_bytes=10)
        self.assertEqual((read["content"], read["truncated"]), ("line\nline\n", True))
        with self.assertRaisesRegex(ToolError, "not a text file"):
            self.call("read_file", path="blob.bin")
        found = self.call("search", pattern="^line$")
        self.assertEqual((len(found["matches"]), found["truncated"]), (200, True))
        self.assertEqual(found["matches"][0], {"path": "big.txt", "line": 1, "text": "line"})
        with self.assertRaisesRegex(ToolError, "not a regular expression"):
            self.call("search", pattern="(")
        self.assertEqual([entry["path"] for entry in self.call("list_dir", path=".", glob="*.txt")["entries"]],
                         ["big.txt", "inside.txt"])
        with self.assertRaisesRegex(ToolError, "glob names files inside"):
            self.call("list_dir", path=".", glob="../*")

    def test_files_keep_their_own_line_ends(self):
        (self.folder / "crlf.md").write_bytes(b"one\r\ntwo\r\n")
        self.assertEqual(self.call("read_file", path="crlf.md")["content"], "one\r\ntwo\r\n")
        self.assertEqual(self.call("read_file", path="crlf.md", max_bytes=5),     # the limit counts bytes
                         {"content": "one\r\n", "truncated": True})
        self.assertEqual(self.call("search", pattern="^two$", path="crlf.md")["matches"][0]["text"], "two")
        self.call("write_file", path="mixed.md", content="a\r\nb\n")
        self.assertEqual((self.folder / "mixed.md").read_bytes(), b"a\r\nb\n")


class RunTests(BrokerCase):
    def test_output_has_the_same_line_ends_on_every_os(self):
        (self.folder / "ends.py").write_text(
            "import sys, time\nout = sys.stdout.buffer\nout.write(b'one\\r\\ntwo\\rthree\\nfour\\r')\n"
            "out.flush()\ntime.sleep(0.3)\nout.write(b'\\nfive\\r\\n')\n", encoding="utf-8", newline="")
        self.assertEqual(self.python("ends.py")["output"], "one\ntwo\nthree\nfour\nfive\n")

    def test_a_plain_command_runs_and_is_recorded(self):
        result = self.python("show.py", "a b")
        self.assertEqual((result["state"], result["exit_code"]), ("done", 0))
        self.assertIn("ran a b", result["output"])
        event = self.events("run.command")[-1]
        self.assertEqual(json.loads(event["data"])["argv"], [sys.executable, "show.py", "a b"])

    def test_each_rules_kind(self):
        result = self.python("build.py")
        self.assertEqual(result["state"], "done")
        self.assertEqual(json.loads(self.events("run.opaque")[-1]["data"])["rule"], "python* build.py")
        denied = self.python("leak.py")
        self.assertEqual(denied["state"], "denied")
        self.assertIn("python* leak.py", denied["reason"])
        for script, kind in (("notify.py", Interrupt.SEND), ("wipe.py", Interrupt.DELETE),
                             ("pay.py", Interrupt.SPEND)):
            with self.subTest(script=script):
                held = self.python(script)
                self.assertEqual(held["state"], "held")
                card = self.ledger.card(held["card"])
                self.assertEqual((card["kind"], card["state"], card["rule"]), (kind, "waiting", f"python* {script}"))
                self.assertEqual(json.loads(card["command"]), [sys.executable, script])
                self.assertAlmostEqual(card["expires"] - card["created"], 7 * 24 * 3600, delta=5)
                self.assertIn("do not retry", held["reason"])
        self.assertEqual(self.ran(), ["build.py "])
        self.assertEqual(len(self.events("run.held")), 3)

    def test_asking_again_returns_the_open_card(self):
        first, second = self.python("notify.py"), self.python("notify.py")
        self.assertEqual(first["card"], second["card"])
        self.assertNotEqual(self.python("notify.py", "--other")["card"], first["card"])
        self.ledger.decide_card(Role.OWNER, first["card"], False)
        self.assertNotEqual(self.python("notify.py")["card"], first["card"])

    def test_a_kind_the_config_does_not_ask_about_runs(self):
        self.home.config.interrupts.ask = (Interrupt.SPEND,)
        self.assertEqual(self.python("notify.py")["state"], "done")
        self.assertEqual(self.python("pay.py")["state"], "held")

    def test_inline_shells_need_the_project_s_shell_flag(self):
        argv = ["sh", "-c", "echo hi"] if os.name != "nt" else ["cmd", "/c", "echo hi"]
        denied = self.call("run", argv=argv)
        self.assertEqual(denied["state"], "denied")
        self.assertIn("inline command", denied["reason"])
        set_flags(self.ledger, self.project, shell=True)
        result = self.call("run", argv=argv)
        self.assertEqual((result["state"], result["output"].strip()), ("done", "hi"))
        if os.name != "nt":
            held = self.call("run", argv=["sh", "-c", f"echo x; '{sys.executable}' notify.py"])
            self.assertEqual(held["state"], "held")

    def test_the_program_is_found_on_path(self):
        with self.assertRaisesRegex(ToolError, "not found on PATH"):
            self.call("run", argv=["no-such-program-for-artemis-tests"])
        found = self.call("run", argv=["python3" if os.name != "nt" else "python", "show.py"])
        self.assertEqual(found["state"], "done")

    def test_batch_files_run_only_when_named_and_with_plain_arguments(self):
        for name in ("tool.cmd", "npm.cmd"):
            (self.folder / name).write_text("@echo off\n", encoding="utf-8", newline="")
        refused = self.call("run", argv=["./tool.cmd", "install"])
        self.assertEqual(refused["state"], "denied")
        self.assertIn("batch_ok", refused["reason"])
        for arg in ("a&b", "100%", "x|y", 'say "hi"'):
            with self.subTest(arg=arg):
                result = self.call("run", argv=["./npm.cmd", "run", arg])
                self.assertEqual(result["state"], "denied")
                self.assertIn("batch file", result["reason"])

    def test_a_long_command_becomes_a_job(self):
        self.broker.handoff_s = 0.3
        (self.folder / "slow.py").write_text("import time\nprint('start', flush=True)\ntime.sleep(1.5)\n"
                                             "print('end')\n", encoding="utf-8", newline="")
        started = time.monotonic()
        result = self.python("slow.py")
        self.assertLess(time.monotonic() - started, 1.2)
        self.assertEqual(result["state"], "running")
        finished = self.call("job", job=result["job"], wait_s=10)
        self.assertEqual((finished["state"], finished["exit_code"]), ("done", 0))
        self.assertIn("end", finished["output"])
        for _ in range(100):
            if self.ledger.job(result["job"])["ended"] is not None:
                break
            time.sleep(0.05)
        self.assertEqual(self.ledger.job(result["job"])["exit_code"], 0)
        background = self.python("slow.py", background=True)
        self.assertEqual(background["state"], "running")
        stopped = self.call("job_stop", job=background["job"])
        self.assertEqual(stopped["state"], "done")
        self.assertIn("the agent stopped it", stopped["output"])

    def test_a_command_past_its_limit_is_stopped(self):
        (self.folder / "forever.py").write_text("import time\ntime.sleep(60)\n", encoding="utf-8", newline="")
        result = self.python("forever.py", timeout_s=1)
        self.assertEqual(result["state"], "done")
        self.assertIn("ran past its 1 s limit", result["output"])

    def test_stopping_work_refuses_new_commands_and_ends_running_ones(self):
        (self.folder / "forever.py").write_text("import time\ntime.sleep(60)\n", encoding="utf-8", newline="")
        job = self.python("forever.py", background=True)["job"]
        self.ledger.stop(Role.OWNER, "enough")
        with self.assertRaisesRegex(ToolError, "stopped"):
            self.python("show.py")
        finished = self.call("job", job=job, wait_s=10)
        self.assertIn("you stopped work", finished["output"])

    def test_jobs_belong_to_their_task(self):
        self.broker.handoff_s = 0.1
        (self.folder / "slow.py").write_text("import time\ntime.sleep(0.5)\n", encoding="utf-8", newline="")
        job = self.python("slow.py")["job"]
        other = self.add_task((Criterion("x", exists="x"),), "Other")
        run = self.ledger.claim_run(Role.HOME, other, "mock")
        self.grant("other-token", Grant(run, other, self.project, "worker", self.folder, "folder"))
        with self.assertRaisesRegex(ToolError, "another task"):
            self.call("job", "other-token", job=job)
        self.call("job", job=job, wait_s=10)


class SecretTests(BrokerCase):
    def setUp(self):
        super().setUp()
        self.secret("DEMO_TOKEN", TOKEN_VALUE, note="for the demo service")
        (self.folder / "env.py").write_text(
            "import os, sys\nprint(sorted(os.environ))\nprint('token', os.environ.get('SERVICE_TOKEN'))\n"
            "print('stdin', sys.stdin.read())\nprint('args', sys.argv[1:])\n", encoding="utf-8", newline="")

    def test_a_secret_reaches_the_program_only_through_its_environment(self):
        with patch.dict(os.environ, {"UNRELATED_SETTING": "kept-out"}):
            result = self.python("env.py", "{DEMO_TOKEN}", env_secrets={"DEMO_TOKEN": "SERVICE_TOKEN"})
        output = result["output"]
        self.assertNotIn(TOKEN_VALUE, output)
        self.assertIn("token [secret:DEMO_TOKEN]", output)
        self.assertIn("'SERVICE_TOKEN'", output)
        self.assertIn("'ARTEMIS_RUN_TOKEN'", output)
        self.assertNotIn("UNRELATED_SETTING", output)
        self.assertIn("stdin \n", output)
        self.assertIn("args ['{DEMO_TOKEN}']", output)
        self.assertEqual(self.ran(), [])
        uses = self.ledger.secret_uses("DEMO_TOKEN")
        self.assertEqual([(use["tool"], use["task_id"]) for use in uses], [("run", self.task)])
        self.assertNotIn(TOKEN_VALUE, json.dumps([dict(row) for row in self.ledger.events()]))

    def test_a_secret_can_go_on_stdin(self):
        result = self.python("env.py", stdin_secret="DEMO_TOKEN")
        self.assertIn("stdin [secret:DEMO_TOKEN]", result["output"])
        self.assertIn("token None", result["output"])

    def test_secrets_must_exist_and_be_for_programs(self):
        self.secret("SITE_KEY", OTHER_VALUE, use="http", origin="https://api.example.com")
        for args, message in (({"env_secrets": {"MISSING_KEY": "X"}}, "secret_request"),
                              ({"env_secrets": {"SITE_KEY": "X"}}, "http_request"),
                              ({"stdin_secret": "SITE_KEY"}, "http_request"),
                              ({"env_secrets": {"DEMO_TOKEN": "ARTEMIS_HOME"}}, "not put in"),
                              ({"env_secrets": {"DEMO_TOKEN": "PATH"}}, "not put in")):
            with self.subTest(args=args), self.assertRaisesRegex(ToolError, message):
                self.python("env.py", **args)
        self.assertEqual(self.ledger.secret_uses(), [])

    def test_a_secret_s_kind_decides_whether_its_use_asks(self):
        self.secret("POST_TOKEN", OTHER_VALUE, kind="send")
        self.secret("PAY_TOKEN", "demo-value-not-a-real-secret-0003", kind="spend")
        self.assertEqual(self.python("show.py", env_secrets={"DEMO_TOKEN": "T"})["state"], "done")
        held = self.python("show.py", env_secrets={"POST_TOKEN": "T"})
        card = self.ledger.card(held["card"])
        self.assertEqual((card["kind"], card["rule"], json.loads(card["secrets"])),
                         (Interrupt.SEND, "secret:POST_TOKEN", ["POST_TOKEN"]))
        self.assertEqual(json.loads(card["options"]), {"env_secrets": {"POST_TOKEN": "T"}})
        both = self.ledger.card(self.python("notify.py", env_secrets={"PAY_TOKEN": "T"})["card"])
        self.assertEqual(both["kind"], Interrupt.SPEND)
        self.assertEqual(self.ran(), ["show.py "])

    def test_secret_names_and_requests(self):
        self.secret("SITE_KEY", OTHER_VALUE, use="http", kind="send", origin="https://api.example.com")
        self.assertEqual(self.call("secret_names"), [
            {"name": "DEMO_TOKEN", "use": "env", "kind": "none", "note": "for the demo service"},
            {"name": "SITE_KEY", "use": "http", "kind": "send", "note": "", "origin": "https://api.example.com"}])
        for args, message in (({"use": "http"}, "needs its origin"),
                              ({"use": "http", "origin": "https://api.example.com/v1"}, "needs its origin"),
                              ({"use": "env", "origin": "https://api.example.com"}, "Only a secret for a website")):
            with self.subTest(args=args), self.assertRaisesRegex(ToolError, message):
                self.call("secret_request", name="NEW_KEY", why="to call the API", **args)
        with self.assertRaisesRegex(ToolError, "already in the vault"):
            self.call("secret_request", name="DEMO_TOKEN", why="x", use="env")
        first = self.call("secret_request", name="NEW_KEY", why="to call the API", use="http",
                          origin="https://api.example.com", kind="send")
        again = self.call("secret_request", "lead-token", name="NEW_KEY", why="same", use="env")
        self.assertEqual(first, again)
        from_worker = [row["text"] for row in self.ledger.messages() if row["card_id"] == first["card"]]
        self.assertEqual(len(from_worker), 1, "a worker's request is answered in the conversation too, once")
        self.assertRegex(from_worker[0], r"^to call the API\n\n```secret [0-9a-f]{32}\n```$")
        asked = self.call("secret_request", "lead-token", name="LEAD_KEY", why="for the mail service", use="env")
        said = [row["text"] for row in self.ledger.messages() if row["card_id"] == asked["card"]]
        self.assertEqual(len(said), 1)
        self.assertRegex(said[0], r"^for the mail service\n\n```secret [0-9a-f]{32}\n```$")
        card = self.ledger.card(first["card"])
        self.assertEqual(json.loads(card["options"]), {"name": "NEW_KEY", "use": "http",
                                                       "origin": "https://api.example.com", "kind": "send"})

    def test_results_errors_and_records_are_scrubbed(self):
        (self.folder / "config.txt").write_text(f"token = {TOKEN_VALUE}\n", encoding="utf-8", newline="")
        self.assertEqual(self.call("read_file", path="config.txt")["content"], "token = [secret:DEMO_TOKEN]\n")
        self.assertEqual(self.call("search", pattern="token")["matches"][0]["text"], "token = [secret:DEMO_TOKEN]")
        with self.assertRaises(ToolError) as caught:
            self.call("read_file", path=f"{TOKEN_VALUE}.txt")
        self.assertIn("[secret:DEMO_TOKEN]", str(caught.exception))
        self.assertNotIn(TOKEN_VALUE, str(caught.exception))
        result = self.python("show.py", TOKEN_VALUE)
        self.assertIn("ran [secret:DEMO_TOKEN]", result["output"])
        self.call("note", text=f"saw {TOKEN_VALUE}")
        self.call("write_file", path="copy.txt", content=TOKEN_VALUE)
        self.assertEqual((self.folder / "copy.txt").read_text(encoding="utf-8"), "[secret:DEMO_TOKEN]")
        self.assertNotIn(TOKEN_VALUE, json.dumps([dict(row) for row in self.ledger.events()]))


class SiteHandler(BaseHTTPRequestHandler):
    """A website on this computer that records each request it gets (stand-in for a real service)."""

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        self.server.got.append((self.command, self.path, self.headers.get("Authorization"), body))
        raw = f"created; key was {self.headers.get('Authorization')}".encode("utf-8")
        self.send_response(201)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args):
        pass


class CardTests(BrokerCase):
    def held(self, script="notify.py", **args):
        result = self.python(script, **args)
        self.assertEqual(result["state"], "held")
        return result["card"]

    def test_an_approved_card_runs_its_recorded_command_exactly_once(self):
        card = self.held(script="notify.py")
        self.ledger.decide_card(Role.OWNER, card, True)
        callers = [threading.Thread(target=self.broker.run_card, args=(card,)) for _ in range(2)]
        for caller in callers:
            caller.start()
        for caller in callers:
            caller.join(30)
        self.assertEqual(self.ran(), ["notify.py "])
        row = self.ledger.card(card)
        self.assertEqual(row["state"], "done")
        self.assertIn("ran", row["result"])
        self.assertEqual([job["card_id"] for job in self.ledger.jobs()], [card])
        self.broker.run_card(card)
        self.assertEqual(self.ran(), ["notify.py "])

    def test_a_card_waits_while_work_is_stopped_and_fails_when_its_secret_is_gone(self):
        self.secret("POST_TOKEN", OTHER_VALUE, kind="send")
        card = self.held("show.py", env_secrets={"POST_TOKEN": "T"})
        self.ledger.decide_card(Role.OWNER, card, True)
        self.ledger.stop(Role.OWNER, "pause")
        self.broker.run_card(card)
        self.assertEqual(self.ledger.card(card)["state"], "approved")
        self.ledger.resume(Role.OWNER, "go")
        self.home.vault.remove("POST_TOKEN")
        self.broker.run_card(card)
        row = self.ledger.card(card)
        self.assertEqual(row["state"], "failed")
        self.assertIn("no secret named POST_TOKEN", row["result"])
        self.assertEqual(self.ran(), [])

    def test_a_card_runs_with_its_secret_and_records_its_use(self):
        self.secret("POST_TOKEN", OTHER_VALUE, kind="send")
        (self.folder / "post.py").write_text("import os\nprint('posted with', os.environ['T'])\n",
                                             encoding="utf-8", newline="")
        card = self.held("post.py", env_secrets={"POST_TOKEN": "T"})
        self.ledger.decide_card(Role.OWNER, card, True)
        self.broker.run_card(card)
        row = self.ledger.card(card)
        self.assertEqual(row["state"], "done")
        self.assertIn("posted with [secret:POST_TOKEN]", row["result"])
        self.assertEqual([(use["tool"], use["card_id"]) for use in self.ledger.secret_uses("POST_TOKEN")],
                         [("card", card)])

    def test_a_standing_approval_covers_only_the_same_command_from_the_same_schedule(self):
        token, schedule = self.scheduled()
        self.assertIsNone(self.broker.standing_for(self.held("notify.py")))    # a task no schedule made
        for script in ("notify.py", "wipe.py"):
            with self.subTest(script=script):
                card = self.held(script, token=token)
                standing = self.broker.standing_for(card)
                self.assertEqual(standing, {"schedule": schedule, "argv": [sys.executable, script],
                                            "cwd": str(self.folder), "secret": None})
                self.ledger.decide_card(Role.OWNER, card, True, standing=standing)
                self.assertEqual(self.python(script, token=token)["state"], "done")
                self.assertEqual(self.python(script, "--more", token=token)["state"], "held")
                self.assertEqual(self.python(script)["state"], "held")      # same command, not from the schedule
                (self.folder / "sub").mkdir(exist_ok=True)
                (self.folder / "sub" / script).write_text(SCRIPT, encoding="utf-8", newline="")
                self.assertEqual(self.python(script, cwd="sub", token=token)["state"], "held")
        event = self.events("run.command")[-1]
        self.assertIsNotNone(json.loads(event["data"])["standing"])

    def test_money_out_never_has_a_standing_approval(self):
        card = self.held("pay.py")
        self.assertIsNone(self.broker.standing_for(card))
        with self.assertRaisesRegex(Exception, "Money out"):
            self.ledger.decide_card(Role.OWNER, card, True, standing={"argv": [sys.executable, "pay.py"],
                                                                      "cwd": str(self.folder)})
        self.ledger.decide_card(Role.OWNER, card, True)
        self.broker.run_card(card)
        self.assertEqual(self.ran(), ["pay.py "])
        self.assertNotEqual(self.held("pay.py"), card)

    def test_recover_marks_what_the_last_home_left_running_unknown(self):
        card = self.held()
        self.ledger.decide_card(Role.OWNER, card, True)
        self.assertTrue(self.ledger.claim_card(Role.HOME, card))
        job = self.ledger.start_job("[]", str(self.folder), "sh", run=self.run_id, task=self.task)
        self.broker.recover()
        self.assertEqual(self.ledger.card(card)["state"], "unknown")
        self.assertIsNotNone(self.ledger.job(job)["ended"])
        self.assertEqual(self.call("job", job=job)["exit_code"], None)



class VaultCardTests(BrokerCase):
    held = CardTests.held

    def site(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), SiteHandler)
        server.got = []
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server, f"http://127.0.0.1:{server.server_address[1]}"

    def lock(self):
        """The home as it starts with no passphrase in its environment: the vault is there, but locked."""
        os.environ.pop(PASSPHRASE_ENV)
        self.home.vault = Vault(self.home.paths, "env")
        self.broker = Broker(self.home)

    def test_a_locked_vault_keeps_secret_cards_approved_and_is_raised_for_the_home(self):
        self.secret("POST_TOKEN", OTHER_VALUE, kind="send")
        self.secret("DEMO_TOKEN", TOKEN_VALUE)
        with_secret = self.held("notify.py", env_secrets={"POST_TOKEN": "T"})
        without = self.held("wipe.py")
        for card in (with_secret, without):
            self.ledger.decide_card(Role.OWNER, card, True)
        self.lock()
        self.broker.run_card(with_secret)
        self.broker.run_card(without)
        self.assertEqual(self.ledger.card(with_secret)["state"], "approved")
        self.assertEqual(self.ledger.card(without)["state"], "done")
        with self.assertRaises(VaultLocked):
            self.python("show.py", env_secrets={"DEMO_TOKEN": "T"})
        self.assertEqual(self.ran(), ["wipe.py "])
        self.home.vault.unlock(PASSPHRASE)
        self.broker.run_card(with_secret)
        self.assertEqual(self.ledger.card(with_secret)["state"], "done")
        self.assertEqual(self.ran(), ["wipe.py ", "notify.py "])
        self.assertEqual([use["tool"] for use in self.ledger.secret_uses()], ["card"])

    def test_an_approved_web_request_is_sent_exactly_once(self):
        server, address = self.site()
        self.secret("SITE_KEY", OTHER_VALUE, use="http", kind="send", origin=address)
        token, schedule = self.scheduled()
        held = self.call("http_request", token, method="POST", url=f"{address}/v1/items", secret="SITE_KEY",
                         body='{"title": "demo"}')
        self.assertEqual(held["state"], "held")
        card = held["card"]
        self.assertEqual(self.broker.standing_for(card), {"schedule": schedule, "url": f"{address}/v1/items",
                                                          "method": "POST", "secret": "SITE_KEY"})
        self.assertEqual(server.got, [])
        self.ledger.decide_card(Role.OWNER, card, True)
        callers = [threading.Thread(target=self.broker.run_card, args=(card,)) for _ in range(2)]
        for caller in callers:
            caller.start()
        for caller in callers:
            caller.join(30)
        self.assertEqual(server.got, [("POST", "/v1/items", f"Bearer {OTHER_VALUE}", b'{"title": "demo"}')])
        row = self.ledger.card(card)
        self.assertEqual(row["state"], "done")
        self.assertIn("201", row["result"])
        self.assertIn("[secret:SITE_KEY]", row["result"])
        self.assertNotIn(OTHER_VALUE, row["result"])
        self.broker.run_card(card)
        self.assertEqual(len(server.got), 1)

    def test_a_web_request_card_waits_for_a_locked_vault(self):
        server, address = self.site()
        self.secret("SITE_KEY", OTHER_VALUE, use="http", kind="send", origin=address)
        card = self.call("http_request", method="POST", url=f"{address}/v1/items", secret="SITE_KEY")["card"]
        self.assertIsNone(self.broker.standing_for(card))      # a task no schedule made
        self.ledger.decide_card(Role.OWNER, card, True)
        self.lock()
        self.broker.run_card(card)
        self.assertEqual((self.ledger.card(card)["state"], server.got), ("approved", []))
        with self.assertRaises(VaultLocked):    # a request that would go out now needs the key
            self.call("http_request", method="GET", url=f"{address}/v1/items", secret="SITE_KEY")

    def test_recover_ends_a_web_request_card_left_running_as_unknown(self):
        self.secret("SITE_KEY", OTHER_VALUE, use="http", kind="send", origin="https://api.example.com")
        card = self.call("http_request", method="POST", url="https://api.example.com/v1", secret="SITE_KEY")["card"]
        self.ledger.decide_card(Role.OWNER, card, True)
        self.assertTrue(self.ledger.claim_card(Role.HOME, card))
        self.broker.recover()
        self.assertEqual(self.ledger.card(card)["state"], "unknown")

class FileToolTests(BrokerCase):
    def test_write_move_and_trash_are_undone(self):
        (self.folder / "notes.txt").write_text("first\n", encoding="utf-8", newline="")
        (self.folder / "old").mkdir()
        (self.folder / "old" / "a.jpg").write_text("A", encoding="utf-8", newline="")
        self.call("write_file", path="notes.txt", content="done\n")
        self.call("write_file", path="new/index.md", content="# Index\n")
        self.assertEqual(self.call("move", src="notes.txt", dst="archive/notes.txt"),
                         {"state": "done", "src": "notes.txt", "dst": "archive/notes.txt"})
        trashed = self.call("trash", path="old")
        self.assertIn(f"artemis undo {self.task}", trashed["undo"])
        self.assertFalse((self.folder / "old").exists())
        self.assertTrue(any(path.name == "a.jpg" for path in self.home.paths.undo.rglob("*")))
        self.assertEqual(len(self.events("file.changed")), 4)
        undo.restore(self.home.paths, self.task)
        self.assertEqual((self.folder / "notes.txt").read_text(encoding="utf-8"), "first\n")
        self.assertTrue((self.folder / "old" / "a.jpg").exists())
        self.assertFalse((self.folder / "new" / "index.md").exists())
        self.assertFalse((self.folder / "archive" / "notes.txt").exists())

    def test_the_project_folder_itself_cannot_be_moved_or_trashed(self):
        for tool, args in (("trash", {"path": "."}), ("move", {"src": ".", "dst": "x"}),
                           ("trash", {"path": "missing.txt"})):
            with self.subTest(tool=tool, args=args), self.assertRaisesRegex(ToolError, "can be changed"):
                self.broker.call("worker-token", tool, args)


class CheckTests(BrokerCase):
    def test_a_worker_runs_its_own_checks(self):
        self.call("write_file", path="notes.txt", content="all done\n")
        self.assertEqual(self.call("check", number=1),
                         {"number": 1, "label": "notes.txt says done", "passed": True, "gap": None})
        missing = self.call("check", number=2)
        self.assertFalse(missing["passed"])
        self.assertIn("2", missing["gap"])
        command = self.call("check", number=3)
        self.assertEqual((command["state"], command["passed"]), ("done", True))
        with self.assertRaisesRegex(ToolError, "has 3 checks"):
            self.call("check", number=4)


class OtherWorkerToolTests(BrokerCase):
    def test_http_requests_go_to_the_http_operation(self):
        seen = []
        with patch.object(broker.httpop, "request", lambda home, grant, args: seen.append(args) or {"status": 200}):
            self.assertEqual(self.call("http_request", method="GET", url="https://api.example.com/v1"),
                             {"status": 200})
            with self.assertRaisesRegex(ToolError, "outside the project"):
                self.call("http_request", method="GET", url="https://api.example.com", save_to="../x.json")
        self.assertEqual(seen, [{"method": "GET", "url": "https://api.example.com/v1"}])

    def test_ask_and_note(self):
        card = self.call("ask", kind="choice", what="Which folder?", why="Two look alike.",
                         options=[{"id": "a", "label": "2024"}, {"id": "b", "label": "2025"}])["card"]
        self.assertEqual(self.ledger.card(card)["kind"], "choice")
        said = [row["text"] for row in self.ledger.messages() if row["card_id"] == card]
        self.assertEqual(len(said), 1, "a worker's choice is answered in the conversation")
        self.assertIn("Which folder?", said[0])
        with self.assertRaisesRegex(ToolError, r"options\[1\]\.label is too long"):
            self.call("ask", kind="choice", what="?", why="?", options=[
                {"id": "a", "label": "Same"}, {"id": "b", "label": "The accountant's new template"}])
        lined = self.call("ask", kind="choice", what="Which layout?", why="?", options=[
            {"id": "a", "label": "Same"}, {"id": "b", "label": "New template", "line": "The accountant's new one"}])
        self.assertEqual(json.loads(self.ledger.card(lined["card"])["options"])[1]["line"], "The accountant's new one")
        with self.assertRaisesRegex(ToolError, "own id"):
            self.call("ask", kind="choice", what="?", why="?", options=[{"id": "a", "label": "x"},
                                                                       {"id": "a", "label": "y"}])
        self.call("note", text="Half the photos have no date.")
        self.assertEqual(self.events("note")[-1]["task_id"], self.task)


class LeadToolTests(BrokerCase):
    def lead(self, tool, **args):
        return self.call(tool, "lead-token", **args)

    def test_projects_status_and_files(self):
        (self.folder / "readme.txt").write_text("hello\n", encoding="utf-8", newline="")
        projects = self.lead("projects")
        self.assertEqual([(row["name"], row["kind"]) for row in projects], [("photos", "folder")])
        status = self.lead("status", project="photos")
        self.assertEqual(status["tasks"][0]["state"], "running")
        self.assertEqual(self.lead("read_file", project="photos", path="readme.txt")["content"], "hello\n")
        self.assertIn("readme.txt", [entry["path"] for entry in
                                     self.lead("list_dir", project=self.project, path=".")["entries"]])
        self.assertEqual(self.lead("search", project="photos", pattern="hel+o")["matches"][0]["path"], "readme.txt")
        with self.assertRaisesRegex(ToolError, "outside the project"):
            self.lead("read_file", project="photos", path="../x")

    def test_tasks_with_host_checks(self):
        made = self.lead("task_create", project="photos", title="Sort", brief="By year.", kind="host",
                         host_checks=[{"type": "exists", "path": "2024"},
                                      {"type": "contains", "path": "index.md", "text": "2024"},
                                      {"type": "count", "path": "2024/*.jpg", "min": 3},
                                      {"type": "preserved", "path": "*.jpg", "to": "2024"}])
        criteria = json.loads(self.ledger.task_brief(made["task"])["criteria"])
        self.assertEqual([next(key for key in ("exists", "contains", "count", "preserved") if item[key])
                          for item in criteria], ["exists", "contains", "count", "preserved"])
        self.assertEqual(criteria[3]["preserved"], ["*.jpg", "2024"])
        for host, message in (([{"type": "contains", "path": "a"}], "needs its text"),
                              ([{"type": "preserved", "path": "a"}], "needs `to`")):
            with self.subTest(host=host), self.assertRaisesRegex(ToolError, message):
                self.lead("task_create", project="photos", title="x", brief="x", kind="host", host_checks=host)
        with self.assertRaisesRegex(ToolError, "one command without a shell"):
            self.lead("task_create", project="photos", title="x", brief="x", kind="code", checks=["make && test"])
        with self.assertRaisesRegex(ToolError, "only a stuck task"):
            self.lead("task_retry", task=made["task"], feedback="again")
        self.assertEqual(self.lead("task_drop", task=made["task"], reason="not needed")["state"], "dropped")
        self.assertEqual(self.ledger.work(task=made["task"])[0]["state"], "dropped")
        downloads = self.folder.resolve().parent / "Downloads"
        downloads.mkdir(exist_ok=True)
        far = [{"type": "preserved", "path": downloads.as_posix(), "to": "2024"}]
        with self.assertRaisesRegex(ToolError, "a folder it reaches"):   # the judge could never look there
            self.lead("task_create", project="photos", title="x", brief="x", kind="host", host_checks=far)
        self.ledger.set_project_flags(Role.OWNER, self.project, shell=False, no_run=False, allowed_roots=(downloads,))
        self.assertIn("task", self.lead("task_create", project="photos", title="x", brief="x", kind="host",
                                        host_checks=far))

    def test_a_new_task_carries_the_checks_its_project_learned(self):
        other = self.ledger.add_project(Role.OWNER, "other", "folder", self.base)
        learned = ["python3", "-m", "unittest"]
        self.ledger.add_lesson(Role.HOME, "check", "unit tests pass", {"argv": learned}, project=self.project)
        self.ledger.add_lesson(Role.HOME, "check", "lint passes", {"argv": ["ruff", "check"]}, project=other)
        self.ledger.add_lesson(Role.HOME, "check", "docs build", {"argv": ["make", "docs"]}, project=self.project,
                               state="proposed")
        made = self.lead("task_create", project="photos", title="Sort", brief="By year.", kind="host",
                         host_checks=[{"type": "exists", "path": "2024"}])
        self.assertEqual(made["checks"][1:], ["unit tests pass"])
        criteria = json.loads(self.ledger.task_brief(made["task"])["criteria"])
        self.assertEqual([item["command"] for item in criteria], [[], learned])
        again = self.lead("task_create", project="photos", title="Test", brief="Run them.", kind="code",
                          checks=[" ".join(learned)])
        self.assertEqual(again["checks"], ["python3 -m unittest"])     # the same command is checked once

    def test_evidence_shows_the_claim_and_verdict(self):
        (self.folder / "notes.txt").write_text("done\n", encoding="utf-8", newline="")
        self.ledger.submit(Role.WORKER, self.task, "host:" + "0" * 64, "Sorted.",
                           {1: ContainsEvidence.capture(self.folder, "notes.txt", "done")})
        self.ledger.end_run(Role.HOME, self.run_id, "done", "reported")
        self.ledger.judge(Role.JUDGE, self.task, RuleJudge())
        shown = self.lead("evidence", task=self.task)
        self.assertEqual((shown["claim"], shown["verdict"], shown["state"]), ("Sorted.", "reject", "stuck"))
        self.assertEqual(shown["checks"][0]["evidence"]["kind"], "contains")
        self.assertIsNone(shown["checks"][1]["evidence"])
        self.assertTrue(shown["gaps"])
        retried = self.lead("task_retry", task=self.task, feedback="Count the photos too.")
        self.assertEqual(retried["state"], "retrying")
        self.assertIn("Count the photos too.", self.ledger.task_brief(self.task)["brief"])

    def test_schedules_lessons_and_cards(self):
        with patch.object(broker, "next_after", lambda spec, after: after.timestamp() + 60):
            made = self.lead("schedule", project="photos", title="Weekly tidy", brief="Tidy.", kind="host",
                             spec="weekly fri 18:00", host_checks=[{"type": "count", "path": "*.jpg"}])
        self.assertEqual(self.ledger.schedules()[0]["id"], made["schedule"])
        with patch.object(broker, "next_after", lambda spec, after: None), \
                self.assertRaisesRegex(ToolError, "never comes again"):
            self.lead("schedule", project="photos", title="x", brief="x", kind="host", spec="at 2000-01-01T00:00",
                      host_checks=[{"type": "count", "path": "*.jpg"}])
        lesson = self.lead("lesson", kind="rule", text="Name photo folders by year.")
        self.assertEqual(lesson["state"], "proposed")
        self.assertEqual(self.ledger.lessons(state="proposed")[0]["text"], "Name photo folders by year.")
        card = self.lead("ask", kind="choice", what="Keep duplicates?", why="Some differ slightly.",
                         options=[{"id": "keep", "label": "Keep"}, {"id": "drop", "label": "Drop"}])["card"]
        self.assertIsNone(self.ledger.card(card)["task_id"])


if __name__ == "__main__":
    unittest.main()
