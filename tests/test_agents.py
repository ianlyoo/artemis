import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import time
import unittest
from unittest.mock import patch

from artemis import agents
from artemis.agents import Outcome, available, cap, family, lead_provider, place, run_turn, scrubber
from artemis.ledger import Ledger
from artemis.roles import WorkflowError
from artemis.worker_adapters import Launch

from fakes import FakeVault, config, fake_cli

FAKE_KEY = "fake-key-for-tests-0000"


def ready(*names):
    """Patch readiness so exactly these providers (and the mock) look installed and signed in."""
    return patch.object(agents, "ready", side_effect=lambda name, config, vault: name in names or name == "mock")


class Availability(unittest.TestCase):
    """Whether each provider is installed and signed in, read from files and keys only."""

    def setUp(self):
        self.home = Path(self.enterContext(TemporaryDirectory()))
        self.bin = self.home / "bin"
        self.bin.mkdir()
        for name in ("claude", "codex", "gemini", "opencode"):
            fake_cli(self.bin, name, "")
        clean = {key: value for key, value in os.environ.items()
                 if key not in ("CLAUDE_CONFIG_DIR", "CODEX_HOME", "XDG_DATA_HOME", "ANTHROPIC_API_KEY",
                                "CLAUDE_CODE_OAUTH_TOKEN", "GEMINI_API_KEY", "OPENAI_API_KEY",
                                "GOOGLE_GENERATIVE_AI_API_KEY")}
        self.enterContext(patch.dict(os.environ, clean | {"HOME": str(self.home), "USERPROFILE": str(self.home),
                                                          "PATH": str(self.bin)}, clear=True))
        self.settings = config(opencode={"model": "google/gemini-test"}, api={"model": "test-model"})

    def test_installed_but_signed_out_is_not_ready(self):
        for name in ("claude", "codex", "gemini", "opencode", "api"):
            with self.subTest(name=name):
                self.assertFalse(available(name, self.settings, FakeVault()))
        self.assertTrue(available("mock", self.settings, None))

    def test_a_sign_in_file_or_a_vault_key_makes_it_ready(self):
        (self.home / ".claude").mkdir()
        (self.home / ".claude.json").write_text('{"oauthAccount": {}}', encoding="utf-8")
        (self.home / ".codex").mkdir()
        (self.home / ".codex" / "auth.json").write_text("{}", encoding="utf-8")
        vault = FakeVault({"GEMINI_API_KEY": FAKE_KEY, "GOOGLE_GENERATIVE_AI_API_KEY": FAKE_KEY,
                           "OPENAI_API_KEY": FAKE_KEY})
        for name in ("claude", "codex", "gemini", "opencode", "api"):
            with self.subTest(name=name):
                self.assertTrue(available(name, self.settings, vault))

    def test_not_on_path_is_not_ready_and_a_loopback_api_needs_no_key(self):
        os.environ["PATH"] = str(self.home)
        (self.home / ".codex").mkdir()
        (self.home / ".codex" / "auth.json").write_text("{}", encoding="utf-8")
        self.assertFalse(available("codex", self.settings, None))
        self.settings.api["base_url"] = "http://127.0.0.1:8080/v1"
        self.assertTrue(available("api", self.settings, None))
        self.settings.api["model"] = ""
        self.assertFalse(available("api", self.settings, None))

    def test_given_the_ledger_it_must_also_be_qualified_for_the_role(self):
        ledger = Ledger(Path(self.enterContext(TemporaryDirectory())) / "ledger.db")
        ledger.initialize()
        self.settings.api["base_url"] = "http://127.0.0.1:8080/v1"
        self.assertTrue(available("api", self.settings, None, ledger=ledger))
        self.assertFalse(available("api", self.settings, None, role="host", ledger=ledger))
        ledger.set_adapter("api", "host", agents.OS_NAME, "1.0", [], "test", "live", "test receipt")
        ledger.set_adapter("api", "code", agents.OS_NAME, "1.0", [], "test", "unqualified", "test receipt")
        self.assertTrue(available("api", self.settings, None, role="host", ledger=ledger))
        self.assertFalse(available("api", self.settings, None, ledger=ledger))


class Families(unittest.TestCase):
    def test_each_provider_names_its_model_maker(self):
        settings = config(opencode={"model": "google/gemini-test"},
                          api={"base_url": "https://generativelanguage.googleapis.com/v1beta/openai/"})
        self.assertEqual([family(name, settings) for name in ("claude", "codex", "gemini", "opencode", "api")],
                         ["anthropic", "openai", "google", "google", "google"])
        self.assertEqual(family("api", config()), "openai")
        self.assertEqual(family("api", config(api={"base_url": "http://127.0.0.1:8080/v1"})), "127.0.0.1")
        self.assertEqual(family("opencode", config()), "opencode")

    def test_caps_come_from_config_or_the_defaults(self):
        settings = config(agents={"caps": {"codex": 5}})
        self.assertEqual((cap("codex", settings), cap("claude", settings), cap("unknown", settings)), (5, 2, 1))


class Placement(unittest.TestCase):
    """Which provider takes a task: by kind and strength, under its cap, qualified, and never metered by default."""

    def setUp(self):
        self.ledger = Ledger(Path(self.enterContext(TemporaryDirectory())) / "ledger.db")
        self.ledger.initialize()
        self.settings = config(api={"model": "test-model"})

    def qualify(self, name, role, status):
        self.ledger.set_adapter(name, role, agents.OS_NAME, "1.0", [], "test", status, "test receipt")

    def test_each_kind_takes_its_strongest_ready_provider(self):
        with ready("claude", "codex", "gemini", "opencode"):
            chosen = {kind: place(kind, self.settings, {}, ledger=self.ledger)
                      for kind in ("code", "review", "research", "docs")}
        self.assertEqual(chosen, {"code": "codex", "review": "claude", "research": "gemini", "docs": "claude"})

    def test_a_provider_at_its_cap_passes_to_the_next_and_all_at_cap_waits(self):
        with ready("claude", "codex"):
            self.assertEqual(place("code", self.settings, {"codex": 2}), "claude")
            self.assertEqual(place("code", self.settings, {"codex": 2, "claude": 2}), "")

    def test_an_unqualified_adapter_is_skipped(self):
        self.qualify("codex", "code", "unqualified")
        self.qualify("claude", "code", "contract")
        with ready("claude", "codex"):
            self.assertEqual(place("code", self.settings, {}, ledger=self.ledger), "claude")

    def test_host_work_goes_only_to_a_live_qualified_adapter(self):
        with ready("claude", "codex"):
            self.assertEqual(place("host", self.settings, {}, ledger=self.ledger), "mock")
            self.qualify("codex", "host", "live")
            self.assertEqual(place("host", self.settings, {}, ledger=self.ledger), "codex")

    def test_the_metered_api_is_taken_only_when_no_plan_backed_provider_is_ready(self):
        self.qualify("api", "host", "live")
        self.qualify("claude", "host", "live")
        with ready("claude", "api"):
            self.assertEqual(place("host", self.settings, {}, ledger=self.ledger), "claude")
            self.assertEqual(place("host", self.settings, {"claude": 2}, ledger=self.ledger), "")
        with ready("api"):
            self.assertEqual(place("host", self.settings, {}, ledger=self.ledger), "api")

    def test_a_review_avoids_the_doers_family(self):
        with ready("claude", "codex", "gemini"):
            self.assertEqual(place("review", self.settings, {}, avoid_family="anthropic"), "codex")
            self.assertEqual(place("review", self.settings, {}, avoid_family="openai"), "claude")

    def test_config_replaces_the_order_and_the_worker_setting_is_the_fallback(self):
        settings = config(placement={"code": ["opencode"]}, agents={"worker": "gemini"})
        with ready("opencode", "gemini"):
            self.assertEqual(place("code", settings, {}), "opencode")
        with ready("gemini"):
            self.assertEqual(place("code", settings, {}), "gemini")
        with ready():
            self.assertEqual(place("code", config(), {}), "mock")


class Leads(unittest.TestCase):
    def setUp(self):
        self.ledger = Ledger(Path(self.enterContext(TemporaryDirectory())) / "ledger.db")
        self.ledger.initialize()

    def test_auto_takes_claude_then_a_qualified_codex_then_the_mock(self):
        with ready("claude", "codex"):
            self.assertEqual(lead_provider(config(agents={"lead": "auto"}), None, self.ledger), "claude")
        with ready("codex"):
            self.assertEqual(lead_provider(config(), None, self.ledger), "mock")
            self.ledger.set_adapter("codex", "lead", agents.OS_NAME, "1.0", [], "test", "live", "test receipt")
            self.assertEqual(lead_provider(config(), None, self.ledger), "codex")

    def test_the_v02_pick_takes_the_lead_lead_provider_resolves(self):
        with ready("claude"):
            self.assertEqual(agents.pick("auto", "lead").name, "claude")
        with ready():
            self.assertEqual(agents.pick("auto", "lead").name, "mock")

    def test_a_named_lead_must_be_known_and_qualified(self):
        with self.assertRaisesRegex(WorkflowError, "doctor providers"):
            lead_provider(config(agents={"lead": "codex"}), None, self.ledger)
        with self.assertRaisesRegex(WorkflowError, "Unknown lead"):
            lead_provider(config(agents={"lead": "gemini"}), None, self.ledger)
        self.assertEqual(lead_provider(config(agents={"lead": "claude"}), None, self.ledger), "claude")


class Turns(unittest.TestCase):
    """One headless turn: stdin in, stdout streamed line by line, the whole process tree ended at the deadline."""

    def setUp(self):
        self.folder = Path(self.enterContext(TemporaryDirectory()))

    def start(self, script, stdin="", env=None):
        path = self.folder / "agent.py"
        path.write_text(script, encoding="utf-8")
        return Launch([sys.executable, str(path)], env or {}, stdin, lambda text: text)

    def test_streams_stdout_lines_and_keeps_stderr(self):
        seen = []
        start = self.start("import os, sys\nfor line in sys.stdin: print(line.strip().upper(), flush=True)\n"
                           "print(os.environ['ARTEMIS_TEST_ADDED'], flush=True)\nprint('oops', file=sys.stderr)\n",
                           "one\ntwo\n", {"ARTEMIS_TEST_ADDED": "added"})
        outcome = run_turn(start, self.folder, 30, on_line=seen.append)
        self.assertEqual(outcome, Outcome(0, "ONE\nTWO\nadded\n", "oops\n"))
        self.assertEqual(seen, ["ONE\n", "TWO\n", "added\n"])

    def test_the_child_is_told_the_folder_it_runs_in_not_the_one_it_was_started_from(self):
        made = agents.launch("mock", role="worker", mode="host", cwd=self.folder, prompt="", mcp=[], config=config(),
                             vault=None, scratch=self.folder / "scratch")
        start = self.start("import os\nprint(os.environ['PWD'])\n", env=made.env)
        with patch.dict(os.environ, {"PWD": str(self.folder.parent)}):
            outcome = run_turn(start, self.folder, 30)
        self.assertEqual(outcome.stdout, f"{self.folder.absolute()}\n")

    def test_the_deadline_or_a_stop_kills_the_process_tree(self):
        child = self.folder / "child.pid"
        script = ("import subprocess, sys, time\n"
                  f"child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\n"
                  f"open({str(child)!r}, 'w').write(str(child.pid))\nprint('started', flush=True)\ntime.sleep(60)\n")
        began = time.monotonic()
        outcome = run_turn(self.start(script), self.folder, 1.5)
        self.assertIsNone(outcome.exit_code)
        self.assertEqual(outcome.stdout, "started\n")
        self.assertLess(time.monotonic() - began, 15)
        if os.name != "nt":
            pid = int(child.read_text())
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(0.1)
            else:
                self.fail("the agent's child outlived the turn")
        stops = iter([False, False, True])
        self.assertIsNone(run_turn(self.start("import time\ntime.sleep(60)\n"), self.folder, 60,
                                   stopped=lambda: next(stops, True)).exit_code)

    def test_the_command_is_found_on_path(self):
        fake_cli(self.folder, "artemis-test-agent", "print('found')\n")
        with patch.dict(os.environ, {"PATH": f"{self.folder}{os.pathsep}{os.environ['PATH']}"}):
            outcome = run_turn(Launch(["artemis-test-agent"], {}, "", str), self.folder, 30)
        self.assertEqual((outcome.exit_code, outcome.stdout), (0, "found\n"))

    def test_without_a_vault_nothing_is_hidden(self):
        self.assertEqual(scrubber(None).scrub("plain"), "plain")
