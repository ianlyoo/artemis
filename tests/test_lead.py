import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Timer
import time
import unittest
from unittest.mock import patch

from artemis.agents import OS_NAME
from artemis.lead import LeadRunner, instructions
from artemis.roles import Role, WorkflowError

from fakes import FAKE_AGENT, FakeHome, FakeVault, calls, config, fake_cli, records, two_projects

SECRET = "fake-shop-token-5f3a9c"


@unittest.skipIf(os.name == "nt", "the fake agents are POSIX shell shims")
class LeadTurns(unittest.TestCase):
    """One cold headless lead turn per message: packet in, Artemis tools out, the reply scrubbed into the thread."""

    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory()))
        bin_ = self.root / "bin"
        bin_.mkdir()
        for name in ("claude", "codex"):
            fake_cli(bin_, name, FAKE_AGENT)
        self.record = self.root / "agents.jsonl"
        self.enterContext(patch.dict(os.environ, {"PATH": f"{bin_}{os.pathsep}{os.environ['PATH']}",
                                                  "FAKE_AGENT_RECORD": str(self.record)}))
        table = {"projects": {"projects": []}, "status": {"tasks": []}, "task_create": {"task": 3, "state": "queued"},
                 "read_file": {"error": "no such file"}, "ask": {"card": 4, "state": "waiting"}}
        self.home = FakeHome(self.root, config(agents={"lead": "claude"}), FakeVault({"SHOP_TOKEN": SECRET}), table)
        self.ids = two_projects(self.home.ledger, self.root)
        self.lead = LeadRunner(self.home)

    def agent(self, **settings):
        return patch.dict(os.environ, {f"FAKE_AGENT_{key.upper()}": value if isinstance(value, str) else json.dumps(value)
                                       for key, value in settings.items()})

    def ask(self, text):
        return self.home.ledger.say(Role.OWNER, text)

    def lead_messages(self):
        return [row for row in self.home.ledger.messages() if row["role"] == "lead"]

    def test_a_claude_turn_reads_both_projects_creates_a_task_and_answers_scrubbed(self):
        message = self.ask("How are shop and notes doing? Add a receipt export to shop.")
        wanted = [["projects", {}], ["task_create", {"project": self.ids["shop"], "title": "Add a receipt export",
                                                     "brief": "CSV of each order.", "kind": "code",
                                                     "checks": ["python -m unittest"]}]]
        reply = f"Shop has the cart fix running and notes waits for a worker. Task #3 is queued. {SECRET} stays out."
        with self.agent(calls=wanted, reply=reply):
            self.lead.turn(message)
        (run,) = records(self.record)
        argv, prompt = run["argv"], run["prompt"]
        self.assertEqual(run["name"], "claude")
        self.assertEqual(Path(run["cwd"]).resolve(), self.home.paths.lead.resolve())
        for flag in ("--no-session-persistence", "--restricted", "--strict-mcp-config", "--include-partial-messages"):
            self.assertIn(flag, argv)
        self.assertEqual(argv[argv.index("--tools") + 1], "")
        system = Path(argv[argv.index("--append-system-prompt-file") + 1]).read_text(encoding="utf-8")
        self.assertEqual(system, instructions())
        self.assertTrue(system.startswith("# You are the lead"))
        self.assertTrue(prompt.startswith("<artemis-context"))
        self.assertIn(f"Focus: #{self.ids['shop']} shop (repo)", prompt)
        self.assertIn(f"Focus: #{self.ids['notes']} notes (folder)", prompt)
        self.assertIn("Fix the cart total", prompt)
        self.assertIn("Tidy the notes", prompt)
        self.assertTrue(prompt.endswith(f"</artemis-context>\n\nyou (message #{message}): How are shop and notes "
                                        "doing? Add a receipt export to shop.\n"))
        self.assertEqual([[call["tool"], call["arguments"]] for call in calls(self.home.log)], wanted)
        self.assertEqual(self.home.granted, [(0, None, self.ids["shop"], "lead", self.home.paths.lead, "folder")])
        self.assertEqual(self.home.grants, {})
        scrubbed = reply.replace(SECRET, "[secret:SHOP_TOKEN]")
        (said,) = self.lead_messages()
        self.assertEqual(said["text"], scrubbed)
        self.assertEqual({kind for kind, _ in self.home.published}, {"said.delta"})
        self.assertEqual({data["turn"] for _, data in self.home.published}, {said["turn"]})
        self.assertEqual("".join(data["text"] for _, data in self.home.published), scrubbed)
        turns = [row for row in self.home.ledger.events() if row["kind"] == "lead.turn"]
        self.assertEqual(len(turns), 1)
        self.assertRegex(turns[0]["detail"], r"^Claude Code answered in \d+ s$")
        self.assertEqual(json.loads(turns[0]["data"])["provider"], "claude")

    def test_switching_the_lead_to_codex_between_turns_needs_no_session(self):
        with self.agent(reply="Shop has one task running; notes has one queued."):
            self.lead.turn(self.ask("Where are shop and notes?"))
        self.home.config.agents["lead"] = "codex"
        with self.assertRaisesRegex(WorkflowError, "doctor providers"):
            self.lead.turn(self.ask("Same question, Codex."))
        self.home.ledger.set_adapter("codex", "lead", OS_NAME, "1.0", [], "test", "live", "test receipt")
        second = self.ask("And which of them needs me?")
        with self.agent(calls=[["status", {}]], reply="Neither needs you; both are moving."):
            self.lead.turn(second)
        first, run = records(self.record)
        argv = run["argv"]
        self.assertEqual(run["name"], "codex")
        self.assertEqual(argv[argv.index("exec"):argv.index("exec") + 5],
                         ["exec", "--json", "--ephemeral", "--sandbox", "read-only"])
        self.assertNotIn("resume", argv)
        self.assertEqual(argv[argv.index("--disable") + 1], "shell_tool")
        self.assertTrue(run["prompt"].startswith("# You are the lead"))
        self.assertIn("Shop has one task running; notes has one queued.", run["prompt"])
        self.assertIn("Focus: #1 shop (repo)", run["prompt"])
        self.assertIn("Focus: #2 notes (folder)", run["prompt"])
        self.assertTrue(run["prompt"].endswith(f"you (message #{second}): And which of them needs me?\n"))
        self.assertEqual([call["tool"] for call in calls(self.home.log)], ["status"])
        self.assertEqual([row["text"] for row in self.lead_messages()],
                         ["Shop has one task running; notes has one queued.", "Neither needs you; both are moving."])
        self.assertEqual([json.loads(row["data"])["provider"] for row in self.home.ledger.events()
                          if row["kind"] == "lead.turn" and "answered" in row["detail"]], ["claude", "codex"])

    def test_a_failed_turn_raises_the_reason_scrubbed_and_records_it(self):
        with self.agent(exit="3", stderr=f"the login for {SECRET} expired"):
            with self.assertRaises(WorkflowError) as raised:
                self.lead.turn(self.ask("Anything new?"))
        self.assertRegex(str(raised.exception), r"^Claude Code did not answer after \d+ s: it ended \(exit 3\) without "
                                                r"an answer: the login for \[secret:SHOP_TOKEN\] expired$")
        self.assertNotIn(SECRET, str(raised.exception))
        failed = [row["detail"] for row in self.home.ledger.events() if row["kind"] == "lead.turn"]
        self.assertEqual(len(failed), 1)
        self.assertEqual(failed[0], str(raised.exception))
        self.assertNotIn(SECRET, failed[0])
        self.assertEqual(self.lead_messages(), [])
        self.assertEqual(self.home.grants, {})

    def test_closing_the_home_or_a_halt_stops_the_turn(self):
        for stop in (self.home.closing.set, lambda: self.home.ledger.stop(Role.OWNER, "stop everything")):
            with self.subTest(stop=stop), self.agent(sleep="30"):
                self.home.closing.clear()
                began = time.monotonic()
                Timer(0.5, stop).start()
                with self.assertRaisesRegex(WorkflowError, "was stopped before it answered"):
                    self.lead.turn(self.ask("Take your time."))
                self.assertLess(time.monotonic() - began, 15)
        self.assertEqual(self.lead_messages(), [])

    def test_a_wake_turn_answers_what_happened(self):
        with self.agent(reply="Task #1 is stuck on its tests; I retried it with the failing case named."):
            self.lead.wake("Task #1 is stuck: tests pass exited 1.")
        (run,) = records(self.record)
        self.assertTrue(run["prompt"].endswith("\n\nartemis (system): Task #1 is stuck: tests pass exited 1.\n"))
        self.assertIn("Focus: #1 shop (repo)", run["prompt"])
        (said,) = self.lead_messages()
        self.assertIsNone(said["project_id"])
        self.assertEqual([row["kind"] for row in self.home.ledger.events() if row["kind"].startswith("lead.")],
                         ["lead.wake"])

    def test_wakes_stop_at_the_hourly_cap_and_zero_turns_them_off(self):
        with self.agent(reply="Looked at it."):
            self.home.config.lead = {"wake_per_hour": 0}
            self.lead.wake("Card #4 answered.")
            self.assertFalse(self.record.exists())
            self.home.config.lead = {"wake_per_hour": 2}
            for number in range(3):
                self.lead.wake(f"Request #{number} settled.")
            self.assertEqual(len(records(self.record)), 2)
            self.lead.turn(self.ask("Anything new?"))               # a message from the person is never capped
        self.assertEqual(len(records(self.record)), 3)
        self.assertEqual(len(self.home.ledger.events(kind="lead.wake")), 2)


class MockLead(unittest.TestCase):
    def test_the_mock_lead_creates_tasks_and_cards_through_the_lead_tools(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        table = {"read_file": {"error": "no such file"}, "task_create": {"task": 7, "state": "queued"},
                 "ask": {"card": 4, "state": "waiting"}}
        home = FakeHome(root, config(agents={"lead": "mock"}), None, table)
        ids = two_projects(home.ledger, root)
        LeadRunner(home).turn(home.ledger.say(Role.OWNER, "Add a --json flag to shop, then post it to the blog"))
        made = calls(home.log)
        self.assertEqual([call["tool"] for call in made], ["read_file", "task_create", "ask"])
        self.assertEqual(made[1]["arguments"], {"project": ids["shop"], "title": "Add a --json flag to shop",
                                                "brief": "Add a --json flag to shop", "kind": "code", "checks": [],
                                                "files": []})
        self.assertEqual(made[2]["arguments"]["kind"], "choice")
        self.assertEqual(made[2]["arguments"]["options"], ["Go ahead", "Not now"])
        said = home.ledger.messages()[-1]
        self.assertEqual(said["role"], "lead")
        self.assertTrue(said["text"].startswith("mock lead (no AI): 1 task(s) for shop:"))
        self.assertIn("#7 Add a --json flag to shop", said["text"])
        self.assertEqual("".join(data["text"] for _, data in home.published).strip(), said["text"])
        self.assertIn("Post it to the blog waits for you (card 4)", said["text"])
