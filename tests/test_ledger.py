import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from harness.agents import ScriptedRunner
from harness.judge import CommandEvidence, Criterion, RuleJudge
from harness.ledger import Ledger
from harness.roles import OwnerAction, Role, WorkflowError, runbook


COMMIT = "a" * 40
COMMAND = ("python3", "test_todo.py")


class LedgerTests(unittest.TestCase):
    def setUp(self):
        root = self.enterContext(TemporaryDirectory())
        self.ledger = Ledger(Path(root) / ".harness" / "ledger.db")
        self.ledger.initialize()
        self.request = self.ledger.request(Role.OWNER, "Export a list")
        self.goal = self.ledger.set_goal(Role.LEAD, self.request, "Support scripts")

    def task(self, criteria=(Criterion("Tests", command=COMMAND),)):
        self.ledger.plan(Role.CTO, self.goal, "Add an output flag")
        project = self.ledger.open_project(Role.PM, self.goal, "Todo CLI")
        return self.ledger.assign(Role.PM, project, "Add JSON output", criteria)

    def test_state_and_event_roll_back_together(self):
        with sqlite3.connect(self.ledger.path) as db:
            db.execute("""
                CREATE TRIGGER fail_event BEFORE INSERT ON events WHEN NEW.kind = 'plan'
                BEGIN SELECT RAISE(ABORT, 'cannot append plan'); END
            """)
        with self.assertRaises(sqlite3.IntegrityError):
            self.ledger.plan(Role.CTO, self.goal, "Add an output flag")
        with self.assertRaisesRegex(WorkflowError, "needs a CTO plan"):
            self.ledger.open_project(Role.PM, self.goal, "Todo CLI")
        self.assertEqual([row["kind"] for row in self.ledger.timeline()], ["request", "goal"])

    def test_events_are_append_only(self):
        with sqlite3.connect(self.ledger.path) as db:
            for statement in ("UPDATE events SET detail = ''", "DELETE FROM events"):
                with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                    db.execute(statement)

    def test_role_chain_and_independent_judge(self):
        task = self.task()
        with self.assertRaisesRegex(WorkflowError, "Only cqo"):
            self.ledger.judge(Role.WORKER, task, RuleJudge())
        with self.assertRaisesRegex(WorkflowError, "Only worker"):
            self.ledger.submit(Role.CQO, task, COMMIT, "Ready", {})
        with self.assertRaisesRegex(WorkflowError, "Only pm"):
            self.ledger.open_project(Role.WORKER, self.goal, "Todo CLI")
        self.assertIn("criteria", runbook(Role.CQO))

    def test_reject_then_pass_preserves_the_history(self):
        task = self.task()
        self.ledger.submit(Role.WORKER, task, COMMIT, "Ready", {})
        self.assertEqual(self.ledger.open_work()[0]["state"], "reported")
        verdict = self.ledger.judge(Role.CQO, task, RuleJudge())
        self.assertEqual(verdict.gaps, ("Tests: missing command evidence",))
        self.assertEqual(self.ledger.open_work()[0]["state"], "needs evidence")
        self.ledger.submit(Role.WORKER, task, COMMIT, "Tests recorded",
                           {1: CommandEvidence(COMMAND, 0, "OK")})
        self.assertEqual(self.ledger.judge(Role.CQO, task, RuleJudge()).kind, "pass")
        self.assertEqual(self.ledger.open_work()[0]["state"], "verified")
        self.ledger.request(Role.OWNER, "An unrelated request")
        self.assertEqual(
            [row["kind"] for row in self.ledger.timeline(task)],
            ["request", "goal", "plan", "project", "assigned", "reported", "reject", "reported", "pass"],
        )

    def test_restricted_actions_require_individual_owner_approval(self):
        task = self.task()
        for kind in OwnerAction:
            with self.subTest(kind=kind):
                card = self.ledger.request_action(Role.PM, task, kind, "Release action")
                another = self.ledger.request_action(Role.PM, task, kind, "Separate release action")
                with self.assertRaisesRegex(WorkflowError, "unused owner approval"):
                    self.ledger.simulate_action(Role.WORKER, card)
                with self.assertRaisesRegex(WorkflowError, "Only owner"):
                    self.ledger.approve(Role.PM, card)
                self.ledger.approve(Role.OWNER, card)
                with self.assertRaisesRegex(WorkflowError, "unused owner approval"):
                    self.ledger.simulate_action(Role.WORKER, another)
                self.ledger.simulate_action(Role.WORKER, card)
                with self.assertRaisesRegex(WorkflowError, "unused owner approval"):
                    self.ledger.simulate_action(Role.WORKER, card)

    def test_stop_blocks_runner_and_actions_even_after_approval(self):
        task = self.task()
        card = self.ledger.request_action(Role.PM, task, OwnerAction.SEND, "Release note")
        self.ledger.stop(Role.OWNER, "Pause")
        self.ledger.approve(Role.OWNER, card)
        with self.assertRaisesRegex(WorkflowError, "stopped"):
            self.ledger.submit(Role.WORKER, task, COMMIT, "Ready", {})
        with self.assertRaisesRegex(WorkflowError, "stopped"):
            self.ledger.simulate_action(Role.WORKER, card)
        with self.assertRaisesRegex(WorkflowError, "stopped"):
            ScriptedRunner(self.ledger).run(Role.WORKER, lambda _: self.fail("ran during stop"))
        with self.assertRaisesRegex(WorkflowError, "Only owner"):
            self.ledger.resume(Role.CTO, "Try again")
        self.ledger.resume(Role.OWNER, "Resume")
        self.ledger.simulate_action(Role.WORKER, card)

    def test_judge_stop_requires_owner_resume_for_that_task(self):
        task = self.task(())
        self.ledger.submit(Role.WORKER, task, COMMIT, "Ready", {})
        self.assertEqual(self.ledger.judge(Role.CQO, task, RuleJudge()).kind, "stop")
        self.assertEqual(self.ledger.open_work()[0]["state"], "stopped")
        request = self.ledger.request(Role.OWNER, "Another request")
        goal = self.ledger.set_goal(Role.LEAD, request, "Improve another command")
        self.ledger.plan(Role.CTO, goal, "Add a help example")
        with self.assertRaisesRegex(WorkflowError, "This task is stopped"):
            self.ledger.submit(Role.WORKER, task, COMMIT, "Ready", {})
        with self.assertRaisesRegex(WorkflowError, "This task is stopped"):
            self.ledger.judge(Role.CQO, task, RuleJudge())
        self.ledger.resume(Role.OWNER, "Continue")
        self.ledger.submit(Role.WORKER, task, COMMIT, "Ready again", {})
        self.assertEqual(self.ledger.judge(Role.CQO, task, RuleJudge()).kind, "stop")
        with self.assertRaisesRegex(WorkflowError, "This task is stopped"):
            self.ledger.submit(Role.WORKER, task, COMMIT, "Ready again", {})
