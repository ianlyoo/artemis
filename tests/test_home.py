"""The home process, its paths, settings, process control and the CLI verbs that manage it."""

from contextlib import closing, redirect_stderr, redirect_stdout
import http.client
import io
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import stat
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading
import time
import unittest
from unittest import mock

from artemis import agents, cli, home as homes, process
from artemis.config import HomeConfig
from artemis.home import PAIR_S, PAIR_TRIES, SUBSCRIBER_QUEUE, Home, Parts, Paths
from artemis.judge import Criterion
from artemis.ledger import Ledger
from artemis.roles import Role, WorkflowError

from fakes import fake_cli
from helpers import Broker, Lead, home_settings, isolated_env, repository, serve, stop_home, vault_env, wait_for


CHECK = (Criterion("notes", artifact="notes.md"),)


def orphan(test: unittest.TestCase) -> int:
    """A sleeping worker whose parent has already exited, as a crashed home leaves it. Ended at cleanup."""
    started = subprocess.run([sys.executable, "-c", "import subprocess, sys\nfrom artemis import process\n"
                              "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'], "
                              "stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, "
                              "**process.group())\nprint(child.pid)"],
                             capture_output=True, text=True, timeout=60, check=True)
    pid = int(started.stdout)
    start = process.started(pid)
    test.assertIsNotNone(start)
    test.addCleanup(process.end_if_same, pid, start, 2)
    return pid


class Scratch(unittest.TestCase):
    def setUp(self):
        self.scratch = Path(self.enterContext(TemporaryDirectory())).resolve()
        self.enterContext(vault_env())
        self.paths = Paths.at(home_settings(self.scratch / "home"))

    def home(self, config: str = "", **parts) -> Home:
        if config:
            self.paths.config.write_text('[vault]\nunlock = "env"\n' + config, encoding="utf-8")
        home = Home(self.paths, 0, Parts(**parts))
        self.addCleanup(home.close, 10)
        return home


class ProcessControl(unittest.TestCase):
    """Both branches run on every OS: the operating system is a fake here."""

    def test_children_get_a_group_of_their_own(self):
        with mock.patch.object(process, "WINDOWS", True):
            self.assertEqual(process.group(), {"creationflags": 0x200})
            self.assertEqual(process.detached(), {"creationflags": 0x200 | 0x8})
            self.assertEqual(process.shell(), "powershell")
        with mock.patch.object(process, "WINDOWS", False):
            self.assertEqual(process.group(), {"start_new_session": True})
            self.assertEqual(process.detached(), {"start_new_session": True})
            self.assertEqual(process.shell(), "sh")

    def test_a_command_line_splits_and_joins_as_this_system_does(self):
        self.assertEqual(process._windows_split(r"C:\tools\python.exe -m unittest"),
                         [r"C:\tools\python.exe", "-m", "unittest"])
        for argv in ([r"C:\Program Files\Python\python.exe", "-m", "unittest"],
                     ['a"b', "c\\", "d e\\", "", 'x\\\\"y', "\\\\server\\share", "tab\there"]):
            self.assertEqual(process._windows_split(subprocess.list2cmdline(argv)), argv)
        with mock.patch.object(process, "WINDOWS", True):
            self.assertEqual(cli._check(r"C:\tools\lint.exe --fix ."), (r"C:\tools\lint.exe", "--fix", "."))
            self.assertEqual(process.join_command([r"C:\Program Files\x.exe", "a"]), r'"C:\Program Files\x.exe" a')
        with mock.patch.object(process, "WINDOWS", False):
            self.assertEqual(cli._check("python3 -c 'print(1)'"), ("python3", "-c", "print(1)"))
            self.assertEqual(process.join_command(["say", "two words"]), "say 'two words'")

    def test_a_bare_python_check_runs_a_python_that_works_here(self):
        alias = r"C:\Users\demo\AppData\Local\Microsoft\WindowsApps\python3.exe"
        for windows, found, exit_code, expected in (
                (True, alias, 9009, sys.executable),               # the Store's alias, before Python is installed
                (True, alias, 0, None),                            # the alias of a Store Python
                (True, r"C:\Python313\python.exe", 9009, None),    # a real install is never tried
                (False, "/usr/bin/python3", 9009, None),
                (False, None, 0, sys.executable)):                 # not on PATH
            process._runs_python.cache_clear()
            with (self.subTest(windows=windows, found=found, exit_code=exit_code),
                  mock.patch.object(process, "WINDOWS", windows),
                  mock.patch.object(process.shutil, "which", return_value=found),
                  mock.patch.object(process.subprocess, "run", return_value=mock.Mock(returncode=exit_code)) as run):
                self.assertEqual(process.executable(("python3", "-m", "unittest")), expected)
                self.assertEqual(run.called, windows and found == alias)
        process._runs_python.cache_clear()
        self.assertIsNone(process.executable(("node", "test.js")))

    def test_windows_ends_the_tree_with_taskkill(self):
        child = mock.Mock(pid=4242)
        with mock.patch.object(process, "WINDOWS", True), mock.patch.object(process.subprocess, "run") as run:
            process.kill_tree(child)
        self.assertEqual(run.call_args.args[0], ["taskkill", "/PID", "4242", "/T", "/F"])
        child.wait.assert_called_once()
        child.wait.side_effect = subprocess.TimeoutExpired("x", 1)
        with mock.patch.object(process, "WINDOWS", True), mock.patch.object(process.subprocess, "run"):
            process.kill_tree(child, grace_s=0)
        child.kill.assert_called_once()

    def test_posix_asks_the_group_to_end_then_kills_what_is_left(self):
        sent = []
        child = mock.Mock(pid=4242)
        child.wait.side_effect = [subprocess.TimeoutExpired("x", 1), 0]
        with mock.patch.object(process, "WINDOWS", False), \
                mock.patch.object(process.signal, "SIGTERM", 15, create=True), \
                mock.patch.object(process.signal, "SIGKILL", 9, create=True), \
                mock.patch.object(process.os, "killpg", lambda pid, sig: sent.append((pid, sig)), create=True):
            process.kill_tree(child, grace_s=0)
        self.assertEqual(sent, [(4242, 15), (4242, 9)])

    def test_a_group_that_is_already_gone_is_fine(self):
        def gone(pid, sig):
            raise ProcessLookupError

        child = mock.Mock(pid=4242)
        with mock.patch.object(process, "WINDOWS", False), \
                mock.patch.object(process.signal, "SIGKILL", 9, create=True), \
                mock.patch.object(process.os, "killpg", gone, create=True):
            process.kill_tree(child, grace_s=0)

    def test_a_process_is_known_by_its_id_and_the_time_it_started(self):
        mine = process.started(os.getpid())
        self.assertTrue(mine)
        self.assertEqual(process.started(os.getpid()), mine)
        ended = subprocess.run([sys.executable, "-c", "import os; print(os.getpid())"], capture_output=True,
                               text=True, check=True)
        self.assertIsNone(process.started(int(ended.stdout)))

    def test_a_worker_left_running_is_ended_only_while_its_id_names_the_same_process(self):
        pid = orphan(self)
        start = process.started(pid)
        self.assertFalse(process.end_if_same(pid, start + " (another process)"))
        self.assertEqual(process.started(pid), start)
        self.assertTrue(process.end_if_same(pid, start))
        wait_for(lambda: process.started(pid) is None, 10, what="the worker to end")

    def test_windows_checks_the_start_time_while_it_holds_the_process(self):
        kernel32 = mock.Mock()
        kernel32.OpenProcess.return_value = 7
        with mock.patch.object(process, "WINDOWS", True), mock.patch.object(process, "_kernel32", lambda: kernel32), \
                mock.patch.object(process, "_created", lambda handle: "133000000000000000"), \
                mock.patch.object(process.subprocess, "run") as run:
            self.assertEqual(process.started(4242), "133000000000000000")
            self.assertFalse(process.end_if_same(4242, "133999999999999999"))
            run.assert_not_called()
            self.assertTrue(process.end_if_same(4242, "133000000000000000"))
            self.assertEqual(run.call_args.args[0], ["taskkill", "/PID", "4242", "/T", "/F"])
            kernel32.WaitForSingleObject.assert_called_once_with(7, 5000)   # until it has exited, or the grace
            self.assertEqual(kernel32.CloseHandle.call_count, 3)
            kernel32.OpenProcess.return_value = None          # no such process
            self.assertIsNone(process.started(4242))
            self.assertFalse(process.end_if_same(4242, "133000000000000000"))
        self.assertEqual(kernel32.OpenProcess.call_args.args, (0x1000 | 0x00100000, False, 4242))

    def test_linux_reads_the_start_from_proc_and_others_ask_ps(self):
        with TemporaryDirectory() as folder:
            proc = Path(folder)
            (proc / "4242").mkdir()
            (proc / "4242" / "stat").write_text("4242 (a (b) c) S 1 4242 4242 0 -1 4194560 " + " ".join(
                str(n) for n in range(10, 30)) + "\n", encoding="utf-8")
            (proc / "sys" / "kernel" / "random").mkdir(parents=True)
            (proc / "sys" / "kernel" / "random" / "boot_id").write_text("fake-boot\n", encoding="utf-8")
            self.assertEqual(process._proc_started(4242, proc), "fake-boot:22")
            self.assertIsNone(process._proc_started(4343, proc))
        said = subprocess.CompletedProcess([], 0, "Wed Nov 25  9:00:32 2026\n", "")
        with mock.patch.object(process.subprocess, "run", return_value=said) as run:
            self.assertEqual(process._ps_started(4242), "Wed Nov 25 9:00:32 2026")
        self.assertEqual(run.call_args.args[0], ["ps", "-o", "lstart=", "-p", "4242"])
        self.assertEqual(run.call_args.kwargs["env"]["LC_ALL"], "C")
        with mock.patch.object(process.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", "")):
            self.assertIsNone(process._ps_started(4242))

    @unittest.skipIf(os.name == "nt", "a real process group is a POSIX check")
    def test_a_real_tree_ends(self):
        child = subprocess.Popen([sys.executable, "-c", "import subprocess, sys, time\n"
                                  "subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\n"
                                  "print('up', flush=True)\ntime.sleep(60)"], stdout=subprocess.PIPE,
                                 text=True, **process.group())
        self.assertEqual(child.stdout.readline().strip(), "up")
        process.kill_tree(child, grace_s=2)
        child.stdout.close()
        self.assertIsNotNone(child.poll())

        def group_gone() -> bool:
            try:
                os.killpg(child.pid, 0)
            except ProcessLookupError:
                return True
            return False
        # The killed grandchild counts as a member until init reaps it, which a busy machine does a little later.
        wait_for(group_gone, timeout_s=10, what="the whole group to be gone")


class Layout(unittest.TestCase):
    def test_one_folder_holds_everything_of_a_home(self):
        paths = Paths.at(Path("/tmp/example-home"))
        self.assertEqual(paths.ledger.name, "ledger.db")
        self.assertEqual(paths.worktree("todo", 7), paths.work / "todo" / "task-7")
        self.assertEqual(paths.log(7), paths.logs / "task-7.log")
        self.assertEqual({paths.lock.name, paths.address.name, paths.token.name},
                         {"home.lock", "home.port", "home.token"})
        with mock.patch.dict(os.environ, {"ARTEMIS_HOME": "/tmp/elsewhere"}):
            self.assertEqual(Paths.from_env().root, Path("/tmp/elsewhere").resolve())
        with mock.patch.dict(os.environ, {"ARTEMIS_HOME": ""}), \
                mock.patch.object(Path, "home", return_value=Path("/tmp/someone")):
            self.assertEqual(Paths.from_env().root, Path("/tmp/someone/.artemis").resolve())


class Settings(Scratch):
    def write(self, text: str) -> None:
        self.paths.config.write_text(text, encoding="utf-8")

    def test_the_template_is_the_defaults(self):
        self.paths.config.unlink()
        config = HomeConfig.load(self.paths)
        self.assertEqual(config, HomeConfig())
        self.assertIn("[placement]", self.paths.config.read_text(encoding="utf-8"))
        self.assertEqual(config.placement["code"], ("codex", "claude", "opencode"))
        self.assertEqual(config.run.batch_ok, ("npm", "npx", "pnpm", "yarn"))
        self.assertEqual(config.cards.phone_only, ("money out",))

    def test_an_unknown_name_fails_naming_its_path(self):
        for text, named in (("[agents]\nmax_worker = 3\n", "agents.max_worker"), ("[serve]\nport = 0\n", "port"),
                            ("[sever]\nport = 1\n", "[sever]"), ('[vault]\nunlock = "maybe"\n', "unlock"),
                            ('[api]\nkey = "sk-not-a-name"\n', "key"), ("[lead]\nwake_per_hour = -1\n", "wake")):
            with self.subTest(text):
                self.write(text)
                with self.assertRaises(WorkflowError) as caught:
                    HomeConfig.load(self.paths)
                self.assertIn(named, str(caught.exception))

    def test_zero_wakes_is_allowed(self):
        self.write("[lead]\nwake_per_hour = 0\n")
        self.assertEqual(HomeConfig.load(self.paths).lead.wake_per_hour, 0)

    def test_one_named_worker_takes_every_kind(self):
        with mock.patch.dict(os.environ, {"ARTEMIS_WORKER": "mock"}):
            config = HomeConfig.load(self.paths)
        self.assertEqual(config.agents.worker, "mock")
        self.assertEqual({config.placement[kind] for kind in ("code", "host", "review")}, {("mock",)})


class Tokens(Scratch):
    def test_a_run_token_is_private_matched_and_revoked(self):
        home = self.home()
        path = home.grant(3, 9, 1, "worker", self.scratch, "folder")
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        token = path.read_text(encoding="utf-8")
        self.assertEqual(home.grant_for(token).task, 9)
        self.assertIsNone(home.grant_for(token[:-1] + "x"))
        self.assertIn(str(path), home.mcp_command(path))
        home.revoke(3)
        self.assertIsNone(home.grant_for(token))
        self.assertFalse(path.exists())

    def test_a_pairing_link_works_once_and_not_after_ten_minutes(self):
        home = self.home()
        token = home.new_pair_token()
        self.assertTrue(home.redeem_pair(token))
        self.assertFalse(home.redeem_pair(token))
        late = home.new_pair_token()
        with mock.patch.object(homes.time, "time", return_value=time.time() + PAIR_S + 1):
            self.assertFalse(home.redeem_pair(late))

    def test_five_wrong_pairing_tokens_void_every_open_link(self):
        home = self.home()
        open_link = home.new_pair_token()
        for guess in range(PAIR_TRIES):
            self.assertFalse(home.redeem_pair(f"guess-{guess}"))
        self.assertFalse(home.redeem_pair(open_link))
        self.assertTrue(home.redeem_pair(home.new_pair_token()))

    def test_a_subscriber_that_falls_behind_is_dropped(self):
        home = self.home()
        slow, live = home.subscribe(), home.subscribe()
        for n in range(SUBSCRIBER_QUEUE):
            home.publish("tick", {"n": n})
            live.get_nowait()
        home.publish("tick", {"n": "one too many"})
        self.assertIsNone(slow.get_nowait())
        self.assertEqual(live.get_nowait()["data"], {"n": "one too many"})
        home.unsubscribe(live)
        home.publish("tick", {})
        self.assertTrue(live.empty())


class Loops(Scratch):
    def project(self, home, kind="folder"):
        project = home.ledger.add_project(Role.OWNER, "notes", kind, self.scratch)
        return home.ledger.request(Role.OWNER, "Write notes", project=project)

    def test_a_restart_ends_runs_left_open_as_stuck(self):
        first = self.home()
        request = self.project(first)
        task = first.ledger.add_task(Role.LEAD, request, "Write", "", CHECK, kind="host")
        first.ledger.claim_run(Role.HOME, task, "mock")      # the old home dies here, mid-run
        second = Home(self.paths, 0, Parts(broker=Broker))
        self.addCleanup(second.close, 10)
        said = io.StringIO()
        with redirect_stdout(said):
            second.start()
        row = second.ledger.work(task)[0]
        self.assertEqual((row["state"], row["note"]), ("stuck", "home restarted"))
        self.assertIn("1 run(s) left open by the previous home are stuck: home restarted", said.getvalue())
        self.assertEqual(second.broker.recovered, 1)

    def test_a_restart_ends_the_workers_left_running_and_no_process_that_took_an_id_later(self):
        first = self.home()
        request = self.project(first)
        left, reused = (first.ledger.add_task(Role.LEAD, request, title, "", CHECK, kind="host")
                        for title in ("Write", "Sort"))
        pid = orphan(self)
        for task, (worker, start) in ((left, (pid, process.started(pid))),
                                      (reused, (os.getpid(), "the start of a process gone long ago"))):
            run = first.ledger.claim_run(Role.HOME, task, "mock")
            first.ledger.record(Role.HOME, "worker.process", f"process {worker}", task=task,
                                data={"run": run, "pid": worker, "start": start})
        second = Home(self.paths, 0, Parts())
        self.addCleanup(second.close, 10)
        said = io.StringIO()
        with redirect_stdout(said):
            second.start()
        self.assertIsNone(process.started(pid))
        self.assertIn(f"task #{left}: ended its worker (process {pid}), which the previous home left running",
                      said.getvalue())
        self.assertIn(f"task #{reused}: process {os.getpid()} is another program now; left alone", said.getvalue())
        self.assertEqual([second.ledger.work(task)[0]["note"] for task in (left, reused)], ["home restarted"] * 2)

    def test_the_lead_wakes_for_a_stuck_task_and_its_settled_request(self):
        home = self.home(lead=Lead)
        task = home.ledger.add_task(Role.LEAD, self.project(home), "Write", "", CHECK, kind="host")
        home.ledger.end_run(Role.HOME, home.ledger.claim_run(Role.HOME, task, "mock"), "stuck", "no disk")
        home.follow()
        wait_for(lambda: home.lead.wakes)
        self.assertEqual(len(home.lead.wakes), 1)
        self.assertIn("task #1 is stuck: no disk", home.lead.wakes[0])
        self.assertIn("request 1 settled", home.lead.wakes[0])

    def test_the_lead_wakes_when_a_card_is_answered(self):
        home = self.home(lead=Lead)
        card = home.ledger.open_card(Role.LEAD, "send as you", "Post it", "it speaks for you",
                                     request=self.project(home))
        home.follow()
        time.sleep(0.2)
        self.assertEqual(home.lead.wakes, [])                 # asking is not an answer
        home.ledger.decide_card(Role.OWNER, card, False)
        home.follow()
        wait_for(lambda: home.lead.wakes)
        self.assertIn("card 1 was answered (card.declined)", home.lead.wakes[0])

    def test_scheduled_work_never_wakes_the_lead(self):
        home = self.home(lead=Lead)
        self.project(home)
        schedule = home.ledger.add_schedule(Role.OWNER, 1, "Sort", "", "host", CHECK, "every 30m", 1.0)
        task = home.ledger.fire(schedule, 1.0, time.time() + 1800, late=True)
        home.ledger.end_run(Role.HOME, home.ledger.claim_run(Role.HOME, task, "mock"), "done", "sorted")
        home.follow()
        time.sleep(0.2)
        self.assertEqual(home.lead.wakes, [])

    def test_placement_reads_this_home_so_host_work_goes_to_a_live_qualified_claude(self):
        home = self.home(place=agents.place)
        home.ledger.set_adapter("claude", "host", agents.OS_NAME, "1.0", [], "test", "live", "test receipt")
        project = home.ledger.add_project(Role.OWNER, "notes", "folder", self.scratch)
        with mock.patch.object(agents, "ready", side_effect=lambda name, config, vault: name in ("claude", "mock")):
            self.assertEqual(home.place("host", {}, project), "claude")
            self.assertEqual(home.place("host", {"claude": 2}, project), "")    # at its cap: the task waits

    def test_only_the_persons_stop_asked_after_the_home_started_closes_it(self):
        home = self.home()
        home.ledger.record(Role.OWNER, homes.STOP, "a stop from before this home")
        with redirect_stdout(io.StringIO()):
            home.start()
        home.follow()
        self.assertFalse(home.stop_asked.is_set())
        home.ledger.record(Role.LEAD, homes.STOP, "not the person")
        home.follow()
        self.assertFalse(home.stop_asked.is_set())
        home.ledger.record(Role.OWNER, homes.STOP, "asked to stop")
        home.follow()
        self.assertTrue(home.stop_asked.is_set())

    def test_closing_waits_for_a_wake_that_is_still_running(self):
        ended = threading.Event()

        class Slow(Lead):
            def wake(self, reason):
                time.sleep(0.5)
                ended.set()

        home = self.home(lead=Slow)
        task = home.ledger.add_task(Role.LEAD, self.project(home), "Write", "", CHECK, kind="host")
        home.ledger.end_run(Role.HOME, home.ledger.claim_run(Role.HOME, task, "mock"), "stuck", "no disk")
        home.follow()
        home.close(10)
        self.assertTrue(ended.is_set())

    def test_starting_requalifies_what_changed_once_and_off_the_start(self):
        calls = []
        home = self.home(qualify=lambda ledger, config, vault, say: calls.append((ledger, config, vault)))
        with redirect_stdout(io.StringIO()):
            home.start()
            wait_for(lambda: calls)
            home.close(10)
        self.assertEqual(calls, [(home.ledger, home.config, home.vault)])

    def test_cards_expire_and_an_approved_command_runs_once(self):
        home = self.home(broker=Broker)
        request = self.project(home)
        stale = home.ledger.open_card(Role.LEAD, "send as you", "Old post", "x", request=request,
                                      expires=time.time() - 1)
        card = home.ledger.open_card(Role.LEAD, "send as you", "Post it", "x", request=request,
                                     command="python3 notify.py", cwd=str(self.scratch), shell="sh")
        home.ledger.decide_card(Role.OWNER, card, True)
        home.run_cards()
        home.run_cards()
        wait_for(lambda: home.ledger.card(card)["state"] == "done")
        home.run_cards()
        self.assertEqual(home.broker.ran, [card])
        self.assertEqual(home.ledger.card(stale)["state"], "expired")

    def test_an_approved_web_request_goes_to_the_broker_like_a_command(self):
        home = self.home(broker=Broker)
        request = self.project(home)
        web = json.dumps({"method": "POST", "url": "https://api.example.com/notes", "headers": {},
                          "body_sha256": None, "save_to": None})
        card = home.ledger.open_card(Role.HOME, "send as you", "POST https://api.example.com/notes", "x",
                                     request=request, command=web, secrets=("DEMO_API_KEY",))
        home.ledger.decide_card(Role.OWNER, card, True)
        home.run_cards()
        wait_for(lambda: home.ledger.card(card)["state"] == "done")
        self.assertEqual(home.broker.ran, [card])

    def test_the_learned_rules_are_written_when_the_home_starts(self):
        synced = []
        home = self.home(sync_rules=lambda ledger, path: synced.append((ledger.path, path)))
        home.start()
        self.assertEqual(synced, [(home.ledger.path, self.paths.rules)])


class OneHome(unittest.TestCase):
    def setUp(self):
        self.scratch = Path(self.enterContext(TemporaryDirectory())).resolve()
        self.env = isolated_env(self.scratch)
        self.paths = Paths.at(Path(self.env["ARTEMIS_HOME"]))

    def artemis(self, *args, timeout=60):
        return subprocess.run((sys.executable, "-m", "artemis.cli", *args), env=self.env, text=True,
                              capture_output=True, timeout=timeout)

    def test_a_second_home_for_the_same_folder_is_refused(self):
        first = serve(self, self.env)
        port = int(re.search(r"port (\d+)", "".join(first.said))[1])
        self.assertEqual(homes.running(self.paths), port)
        second = self.artemis("serve", "--port", "0", "--no-open")
        self.assertEqual(second.returncode, 1)
        self.assertIn(f"A home is already running for {self.paths.root} at http://127.0.0.1:{port}", second.stderr)
        stop_home(first)
        self.assertIsNone(homes.running(self.paths))
        self.assertFalse(self.paths.address.exists())

    def test_the_cli_prints_utf8_whatever_its_streams_start_in(self):
        done = subprocess.run((sys.executable, "-m", "artemis.cli", "statusline"), capture_output=True, timeout=60,
                              env=self.env | {"PYTHONIOENCODING": "cp1252"})   # as a Windows console's code page
        self.assertEqual(done.stdout.decode("utf-8"), "0 running \u00b7 asked you 0\u00d7 \u00b7 0 done\n".replace(
            "\n", os.linesep))

    def test_a_taken_port_is_named(self):
        with closing(socket.socket()) as taken:
            taken.bind(("127.0.0.1", 0))
            taken.listen()
            port = taken.getsockname()[1]
            refused = self.artemis("serve", "--port", str(port), "--no-open")
        self.assertEqual(refused.returncode, 1)
        self.assertIn(f"Port {port} is taken by another program", refused.stderr)
        self.assertIsNone(homes.running(self.paths))

    def test_the_lock_is_held_in_this_process_too(self):
        held = homes.hold(self.paths)
        self.addCleanup(held.close)
        self.assertIsNone(homes.hold(self.paths, 0))
        self.assertEqual(homes.running(self.paths), 0)
        self.paths.address.write_text("7411", encoding="utf-8")
        self.assertEqual(homes.running(self.paths), 7411)

    def test_open_starts_a_home_in_this_process_and_close_gives_back_its_lock_and_port(self):
        with mock.patch.dict(os.environ, self.env, clear=True):
            home = homes.open(self.paths, 0, parts=Parts(broker=Broker))
            self.addCleanup(home.close, 10)
            self.assertEqual(home.broker.recovered, 1)
            self.assertTrue(home.port and homes.listening(home.port))
            self.assertEqual(homes.running(self.paths), home.port)
            self.assertTrue(self.paths.token.read_text(encoding="utf-8").strip())
            with self.assertRaisesRegex(WorkflowError, f"already running for .* at http://127.0.0.1:{home.port}"):
                homes.open(self.paths, 0, parts=Parts())
            home.close(10)
            self.assertIsNone(homes.running(self.paths))
            self.assertFalse(homes.listening(home.port))
            again = homes.open(self.paths, 0, parts=Parts())
            again.close(10)

    def test_a_background_home_starts_detached_and_serve_stop_closes_it(self):
        out = io.StringIO()
        with mock.patch.dict(os.environ, self.env, clear=True), redirect_stdout(out):
            code = homes.background(self.paths, ["--port", "0"])
        said = out.getvalue()
        pid = int(re.search(r"process (\d+)", said)[1])
        self.addCleanup(process.end_if_same, pid, process.started(pid))    # ends it only if the stop failed
        self.assertEqual(code, 0, said)
        self.assertIn("Home ready", said)
        self.assertIsNotNone(homes.running(self.paths))
        stopped = self.artemis("serve", "--stop")
        self.assertEqual(stopped.returncode, 0, stopped.stderr)
        self.assertIn(f"The home for {self.paths.root} has stopped.", stopped.stdout)
        self.assertIsNone(homes.running(self.paths))
        self.assertFalse(self.paths.address.exists())          # close() ran: it removes the address
        self.assertIn("stopping: ending running workers", (self.paths.logs / "home.log").read_text(encoding="utf-8"))
        self.assertIn(f"No home is running for {self.paths.root}.", self.artemis("serve", "--stop").stdout)

    def test_serve_lan_passes_the_name_a_phone_opens_to_the_background_home(self):
        with mock.patch.object(homes, "background", return_value=0) as started, \
                mock.patch.dict(os.environ, self.env, clear=True):
            self.assertEqual(cli.main(["serve", "--background", "--lan", "artemis.tailnet.ts.net"]), 0)
            self.assertEqual(cli.main(["serve", "--background", "--lan", "--port", "0"]), 0)
        self.assertEqual([call.args[1] for call in started.call_args_list],
                         [["--lan", "artemis.tailnet.ts.net"], ["--port", "0", "--lan"]])
        refused = self.artemis("serve", "--lan", "my server", "--no-open")
        self.assertEqual(refused.returncode, 1, refused.stderr)
        self.assertIn("--lan takes a host name or an IPv4 address", refused.stderr)

    def test_no_browser_is_opened_on_a_linux_machine_without_a_display(self):
        with mock.patch.object(homes.sys, "platform", "linux"), mock.patch.dict(os.environ, {}, clear=True):
            self.assertFalse(homes._display())
            with mock.patch.dict(os.environ, {"WAYLAND_DISPLAY": "wayland-0"}):
                self.assertTrue(homes._display())
        with mock.patch.object(homes.sys, "platform", "darwin"), mock.patch.dict(os.environ, {}, clear=True):
            self.assertTrue(homes._display())

    def test_device_link_prints_a_new_link_that_pairs_a_browser(self):
        first = serve(self, self.env)
        port = int(re.search(r"port (\d+)", "".join(first.said))[1])
        made = self.artemis("device", "link")
        self.assertEqual(made.returncode, 0, made.stderr)
        token = re.fullmatch(rf"App: http://127\.0\.0\.1:{port}/#pair=(\S+)\n"
                             r"\(The link pairs one browser and works once, for ten minutes\.\)\n", made.stdout)[1]
        self.assertNotIn(token, "".join(first.said))
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        connection.request("POST", "/api/pair", json.dumps({"token": token}),
                           {"Host": f"127.0.0.1:{port}", "Origin": f"http://127.0.0.1:{port}"})
        self.assertEqual(connection.getresponse().status, 200)
        connection.close()

    def test_a_background_home_not_ready_in_time_is_stopped_and_its_words_shown(self):
        err = io.StringIO()
        with (mock.patch.dict(os.environ, self.env, clear=True), mock.patch.object(homes, "READY", "never said"),
              redirect_stderr(err)):
            code = homes.background(self.paths, ["--port", "0"], wait_s=3)
        self.assertEqual(code, 1)
        self.assertIn("did not get ready within 3 s, so it was stopped; its log is", err.getvalue())
        self.assertIsNone(homes.running(self.paths))



class Verbs(Scratch):
    """The CLI, called in this process with ARTEMIS_HOME pointing at a scratch home."""

    def setUp(self):
        super().setUp()
        self.enterContext(mock.patch.dict(os.environ, {"ARTEMIS_HOME": str(self.paths.root)}))
        os.environ.pop("ARTEMIS_RUN_TOKEN", None)
        self.addCleanup(os.chdir, os.getcwd())

    def artemis(self, *args, cwd: Path | None = None) -> tuple[int, str, str]:
        os.chdir(cwd or self.scratch)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            try:
                code = cli.main([str(arg) for arg in args])
            except SystemExit as exit:
                code = exit.code
        return code, out.getvalue(), err.getvalue()

    def ok(self, *args, cwd: Path | None = None) -> str:
        code, out, err = self.artemis(*args, cwd=cwd)
        self.assertEqual(code, 0, err)
        return out

    def refused(self, *args, cwd: Path | None = None) -> str:
        code, _, err = self.artemis(*args, cwd=cwd)
        self.assertEqual(code, 1)
        return err

    @property
    def ledger(self) -> Ledger:
        ledger = Ledger(self.paths.ledger)
        ledger.initialize()
        return ledger

    def folder(self, name="film") -> Path:
        path = self.scratch / name
        path.mkdir()
        return path

    def test_project_add_tells_a_repository_from_a_folder(self):
        repo = repository(self.scratch / "todo")
        film = self.folder()
        said = self.ok("project", "add", repo)
        self.assertIn(f"Added todo: a Git repository. Tasks run in their own worktrees under "
                      f"{self.paths.work / 'todo'}; only checked work lands on main.", said)
        self.assertIn("Next: artemis serve", said)
        self.assertTrue((repo / "artemis.toml").exists())
        exclude = repo / ".git" / "info" / "exclude"
        self.assertIn(".artemis/", exclude.read_text(encoding="utf-8").splitlines())
        self.assertIn("Added film: a folder.", self.ok("project", "add", film))
        self.assertIn("already a project", self.ok("project", "add", film))
        listing = self.ok("project", "list")
        self.assertRegex(listing, r"1  todo\s+repo\s+.*\(defaults\)")
        self.assertRegex(listing, r"2  film\s+folder")
        sub = repo / "src"
        sub.mkdir()
        self.assertIn("Added src: a folder.", self.ok("project", "add", sub))   # inside a repo, not its top

    def test_project_flags_are_set_when_given(self):
        film, extra = self.folder(), self.folder("archive")
        said = self.ok("project", "add", film, "--no-run", "--root", extra)
        self.assertIn(f"Flags: no run tool, may reach {extra}.", said)
        row = self.ledger.project("film")
        self.assertEqual((row["no_run"], row["shell"], json.loads(row["allowed_roots"])), (1, 0, [str(extra)]))
        self.assertIn("contradict", self.refused("project", "add", self.folder("x"), "--no-run", "--shell"))
        self.assertIn("is not a folder", self.refused("project", "add", self.scratch / "missing"))

    def test_a_folder_inside_or_holding_the_home_is_refused(self):
        (self.paths.root / "logs").mkdir(exist_ok=True)
        self.assertIn("inside the Artemis home", self.refused("project", "add", self.paths.root / "logs"))
        self.assertIn("holds the Artemis home", self.refused("project", "add", self.scratch))
        self.assertIn("holds the Artemis home", self.refused("project", "add", self.folder(), "--root",
                                                             self.scratch))

    def test_a_v02_ledger_is_reported_and_its_stop_honoured(self):
        repo = repository(self.scratch / "old")
        (repo / ".artemis").mkdir()
        with closing(sqlite3.connect(repo / ".artemis" / "ledger.db")) as db, db:
            db.execute("CREATE TABLE events (id INTEGER PRIMARY KEY, role TEXT, kind TEXT)")
            db.execute("INSERT INTO events(role, kind) VALUES ('you', 'halt')")
        said = self.ok("project", "add", repo)
        self.assertIn("It has a v0.2 ledger (.artemis/ledger.db). That file stays as it is", said)
        self.assertIn("Its last word is a stop", said)

    def test_verbs_take_the_project_of_the_folder_they_run_in(self):
        film = self.folder()
        self.assertIn("Add it first: artemis project add .", self.refused("request", "Sort the files"))
        self.ok("project", "add", film)
        (film / "incoming").mkdir()
        request = self.ok("request", "Sort the files", cwd=film / "incoming").strip()
        self.assertIn("needs a --check or a --file", self.refused("task", request, "Sort", cwd=film))
        code, out, err = self.artemis("task", request, "Sort", "--file", "summary.csv", cwd=film)
        self.assertEqual(code, 0, err)
        self.assertIn("No home is running", err)
        row = self.ledger.work(int(out))[0]
        self.assertEqual((row["kind"], row["state"], row["project_id"]), ("host", "queued", 1))
        self.assertEqual(self.ok("request", "Another", "--project", "film", cwd=self.scratch).strip(), "2")

    def test_person_verbs_refuse_a_shell_with_a_run_token(self):
        film = self.folder()
        self.ok("project", "add", film)
        with mock.patch.dict(os.environ, {"ARTEMIS_RUN_TOKEN": "fake-run-token"}):
            for verb in (("approve", "1"), ("decline", "1"), ("resume",), ("device", "list"),
                         ("project", "add", film, "--shell"), ("lesson", "accept", "1"), ("undo", "1")):
                with self.subTest(verb=verb[0]):
                    self.assertIn("is for the person", self.refused(*verb))
            self.ok("status")
        self.assertEqual(self.ledger.project("film")["shell"], 0)

    def test_the_modules_verbs_are_wired(self):
        self.ok("project", "add", self.folder())
        self.assertIn("Nothing to undo for task 1.", self.ok("undo", "1"))
        self.ok("lesson", "list")
        code, _, err = self.artemis("mcp", "--run", self.scratch / "no-such-token")
        self.assertEqual(code, 2)
        self.assertIn("cannot read the token file", err)

    def test_phone_only_kinds_are_not_approved_from_here(self):
        self.ok("project", "add", self.folder())
        request = self.ledger.request(Role.OWNER, "Renew", project=1)
        card = self.ledger.open_card(Role.LEAD, "money out", "Renew the domain", "it spends money",
                                     request=request)
        self.assertIn("only a paired phone approves", self.refused("approve", card))
        self.assertIn("declined: 1 · nothing happens", self.ok("decline", card))

    def test_approving_says_who_carries_it_out(self):
        self.ok("project", "add", self.folder())
        request = self.ledger.request(Role.OWNER, "Post", project=1)
        plain = self.ledger.open_card(Role.LEAD, "send as you", "Post it", "x", request=request)
        command = self.ledger.open_card(Role.LEAD, "send as you", "Post it", "x", request=request,
                                        command="python3 notify.py", cwd=str(self.scratch), shell="sh")
        self.assertIn("approved: 1 · the lead carries it out", self.ok("approve", plain))
        self.assertIn("approved: 2 · Artemis runs it once", self.ok("approve", command))

    def test_only_listed_kinds_can_be_asked(self):
        self.paths.config.write_text('[vault]\nunlock = "env"\n[interrupts]\nask = ["send as you"]\n',
                                     encoding="utf-8")
        film = self.folder()
        self.ok("project", "add", film)
        request = self.ok("request", "Buy a domain", cwd=film).strip()
        self.assertIn("decide it yourself", self.refused("ask", request, "Buy example.org", "--kind", "money out",
                                                         "--why", "money", cwd=film))

    def test_devices_are_allowed_by_their_code_and_revoked(self):
        device = self.ledger.add_device("phone browser", "f" * 64, "4821", phone=True)
        listing = self.ok("device", "list")
        self.assertIn("pending  phone   phone browser", listing)
        self.assertNotIn("4821", listing)                     # the code is read off the device, not from here
        self.assertIn("No device waits with code 0000", self.refused("device", "allow", "0000"))
        self.assertIn("Allowed: phone browser.", self.ok("device", "allow", "4821"))
        self.assertEqual(self.ledger.devices()[0]["state"], "allowed")
        self.ok("device", "revoke", device)
        self.assertEqual(self.ledger.devices()[0]["state"], "revoked")

    def test_retry_asks_the_home_to_run_a_stuck_task_again(self):
        self.ok("project", "add", self.folder())
        request = self.ledger.request(Role.OWNER, "Notes", project=1)
        task = self.ledger.add_task(Role.LEAD, request, "Write", "", CHECK, kind="host")
        self.ledger.end_run(Role.HOME, self.ledger.claim_run(Role.HOME, task, "mock"), "stuck", "gave up")
        self.assertIn("Task 1 runs again with the new brief.", self.ok("retry", task, "--brief", "Use notes.md"))
        home = self.home()
        home.follow()
        self.assertIn(task, home.retries)
        self.assertEqual(self.ledger.task_brief(task)["brief"], "Use notes.md")

    def test_stop_and_resume_say_what_they_did(self):
        self.ok("project", "add", self.folder())
        request = self.ledger.request(Role.OWNER, "Notes", project=1)
        task = self.ledger.add_task(Role.LEAD, request, "Write", "", CHECK, kind="host")
        run = self.ledger.claim_run(Role.HOME, task, "mock")
        self.assertIn("nothing new starts until artemis resume", self.ok("stop", "lunch"))
        self.ledger.end_run(Role.HOME, run, "stopped", "stopped by you")
        self.assertIn("Resumed. The stop ended #1; run one again with artemis retry 1.", self.ok("resume"))

    def test_after_adding_a_project_the_next_step_is_the_app(self):
        self.assertIn("Next: artemis serve. It keeps running, does the work and prints a link to the App; tell the "
                      "lead there what you want done.", self.ok("project", "add", self.folder()))
        with mock.patch.object(homes, "running", return_value=8765):
            self.assertIn("Next: tell the lead in the App what you want done. artemis device link prints a new "
                          "link to it.", self.ok("project", "add", self.folder("notes")))

    def test_device_link_needs_a_running_home_and_shows_a_phone_its_link_on_the_lan(self):
        self.assertIn(f"No home is running for {self.paths.root}.", self.refused("device", "link"))
        lan = {"url": "https://192.0.2.7:8765/#pair=fake-token", "lan": True, "fingerprint": "AB:CD", "qr": ""}
        with mock.patch.object(homes, "running", return_value=8765), \
                mock.patch.object(cli, "_new_link", return_value=lan):
            out = self.ok("device", "link")
        self.assertTrue(out.startswith("App: https://127.0.0.1:8765/#pair=fake-token\nOn your phone  "
                                       "https://192.0.2.7:8765/#pair=fake-token\nCertificate SHA-256  AB:CD\n"), out)
        self.assertIn("allow it in the App on this computer or with `artemis device allow <code>`.", out)

    def test_an_agents_shell_may_not_start_or_stop_the_home(self):
        with mock.patch.dict(os.environ, {"ARTEMIS_RUN_TOKEN": "fake-run-token"}):
            self.assertIn("serve is for the person", self.refused("serve", "--stop"))

    def test_doctor_reads_versions_from_the_clis_on_path(self):
        bin_dir = self.scratch / "bin"
        bin_dir.mkdir()
        fakes = {"git": "git version 2.99.0 (fake)", "claude": "9.9.9 (fake Claude Code)", "codex": "codex 0.0.1",
                 "gemini": None}
        for name, version in fakes.items():
            if os.name == "nt":
                body = f"@echo {version}\r\n" if version else "@exit /b 3\r\n"
                (bin_dir / f"{name}.cmd").write_text(body, encoding="utf-8")
            else:
                (bin_dir / name).write_text(f"#!/bin/sh\necho '{version}'\n" if version else "#!/bin/sh\nexit 3\n",
                                            encoding="utf-8")
                (bin_dir / name).chmod(0o755)
        with mock.patch.dict(os.environ, {"PATH": str(bin_dir)}), \
                mock.patch.object(cli, "_keychain", return_value=(True, "fake keychain")):
            out = self.ok("doctor")
        self.assertIn("ok       Git: git version 2.99.0 (fake)", out)
        self.assertIn("ok       Claude Code: 9.9.9 (fake Claude Code)", out)
        self.assertIn("ok       Codex: codex 0.0.1", out)
        self.assertIn("problem  Gemini CLI: installed, but --version failed", out)
        self.assertIn("missing  OpenCode: not installed", out)
        self.assertIn("ok       keychain: fake keychain (vault unlock: env)", out)
        self.assertIn("missing  home: not running", out)

    def test_doctor_in_a_shell_without_the_vault_passphrase_says_a_home_has_its_own(self):
        self.paths.vault.parent.mkdir(parents=True, exist_ok=True)
        self.paths.vault.touch()                                  # a vault exists; this shell has no passphrase
        with mock.patch.dict(os.environ, {"ARTEMIS_VAULT_PASSPHRASE": ""}), \
                mock.patch.object(cli, "_keychain", return_value=(False, "fail Keyring")):
            out = self.ok("doctor")
        self.assertIn("missing  vault: locked in this shell: ARTEMIS_VAULT_PASSPHRASE is not set here, and a home "
                      "started with it has the vault open", out)

    def test_doctor_providers_probes_each_ready_cli_and_records_what_it_saw(self):
        bin_dir = self.scratch / "bin"
        bin_dir.mkdir()
        fake_cli(bin_dir, "claude", "import sys\nprint('9.9.9 (fake Claude Code)' if '--version' in sys.argv "
                                    "else 'a fake that calls no tool')\n")
        fake_cli(bin_dir, "codex", "print('codex 0.0.1')\n")         # installed, never signed in
        (self.scratch / ".claude.json").write_text('{"oauthAccount": {}}', encoding="utf-8")   # signed in
        signed_out = {name: "" for name in ("CLAUDE_CONFIG_DIR", "CODEX_HOME", "XDG_DATA_HOME", "ANTHROPIC_API_KEY",
                                            "CLAUDE_CODE_OAUTH_TOKEN", "GEMINI_API_KEY", "OPENAI_API_KEY")}
        path = os.pathsep.join([str(bin_dir), str(Path(shutil.which("git")).parent)])   # the probe makes a repo
        with mock.patch.dict(os.environ, signed_out | {"PATH": path, "HOME": str(self.scratch),
                                                       "USERPROFILE": str(self.scratch)}):
            for name in signed_out:
                del os.environ[name]
            out = self.ok("doctor", "providers")
            again = self.ok("doctor", "providers", "--provider", "claude", "--role", "host")
        for role in ("lead", "code", "host"):
            self.assertIn(f"Claude Code as {role}: contract · no Artemis call went through", out)
        self.assertIn("Codex: not ready here (not installed or not signed in); skipped", out)
        rows = {(row["provider"], row["role"]): row for row in self.ledger.adapters()}
        self.assertEqual(set(rows), {("claude", "lead"), ("claude", "code"), ("claude", "host")})
        self.assertEqual({(row["status"], row["version"]) for row in rows.values()},
                         {("contract", "9.9.9 (fake Claude Code)")})
        self.assertEqual(again.count("probing"), 1)
        self.assertIn("Claude Code as host: contract · ", again)


if __name__ == "__main__":
    unittest.main()
