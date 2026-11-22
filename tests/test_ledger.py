from contextlib import closing
import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from artemis.judge import CommandEvidence, Criterion, RuleJudge
from artemis.ledger import Check, Ledger
from artemis.roles import Interrupt, Role, WorkflowError


COMMIT = "a" * 40
CHECK = ("python3", "-m", "unittest")


class LedgerTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        self.ledger = Ledger(root / ".artemis" / "ledger.db")
        self.ledger.initialize()
        self.request = self.ledger.request(Role.OWNER, "Export the list as JSON")

    def task(self, title="Add JSON output"):
        return self.ledger.add_task(Role.LEAD, self.request, title, "", (Criterion("tests", command=CHECK),))

    def state(self, task):
        return self.ledger.work(task)[0]["state"]

    def test_events_are_append_only(self):
        with closing(sqlite3.connect(self.ledger.path)) as db, db:
            for statement in ("UPDATE events SET detail = ''", "DELETE FROM events"):
                with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                    db.execute(statement)

    def test_state_and_event_roll_back_together(self):
        with closing(sqlite3.connect(self.ledger.path)) as db, db:
            db.execute("CREATE TRIGGER fail BEFORE INSERT ON events WHEN NEW.kind = 'task' "
                       "BEGIN SELECT RAISE(ABORT, 'no'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.task()
        self.assertEqual(self.ledger.work(), [])

    def test_roles_are_enforced(self):
        task = self.task()
        with self.assertRaisesRegex(WorkflowError, "Only the judge"):
            self.ledger.judge(Role.WORKER, task, RuleJudge())
        with self.assertRaisesRegex(WorkflowError, "Only the lead"):
            self.ledger.add_task(Role.WORKER, self.request, "x", "", (Criterion("t", command=CHECK),))
        decision = self.ledger.ask(Role.LEAD, self.request, Interrupt.SEND, "Post it", "it speaks for you")
        with self.assertRaisesRegex(WorkflowError, "Only the you"):
            self.ledger.decide(Role.LEAD, decision, True)

    def test_task_states_follow_runs_verdicts_and_receipts(self):
        task = self.task()
        self.assertEqual(self.state(task), "queued")
        run = self.ledger.claim_run(Role.LEAD, task, "mock")
        self.assertEqual(self.state(task), "running")
        with self.assertRaisesRegex(WorkflowError, "running"):
            self.ledger.claim_run(Role.LEAD, task, "mock")
        self.ledger.submit(Role.WORKER, task, COMMIT, "Ready", {})
        self.ledger.judge(Role.JUDGE, task, RuleJudge())
        self.ledger.end_run(Role.WORKER, run, "stuck", "judge: tests: missing command evidence")
        self.assertEqual(self.state(task), "stuck")
        run = self.ledger.claim_run(Role.LEAD, task, "mock")
        self.ledger.submit(Role.WORKER, task, COMMIT, "Tests recorded", {1: CommandEvidence(CHECK, 0, "OK")})
        self.assertEqual(self.ledger.judge(Role.JUDGE, task, RuleJudge()).kind, "pass")
        self.ledger.end_run(Role.WORKER, run, "done", "verified")
        self.assertEqual(self.state(task), "verified")
        receipt = self.ledger.record_checks(task, COMMIT, "b" * 40, (Check(CHECK, 0, "0" * 64),))
        self.assertEqual(receipt.state, "checked")
        self.ledger.land(task, COMMIT, True)
        self.assertEqual(self.state(task), "shipped")
        self.assertEqual(self.ledger.work(task)[0]["landed"], "b" * 40)

    def test_decisions_wait_for_the_person_and_are_used_once(self):
        decision = self.ledger.ask(Role.LEAD, self.request, Interrupt.SEND, "Post the note", "it speaks for you")
        with self.assertRaisesRegex(WorkflowError, "approved"):
            self.ledger.carried_out(Role.LEAD, decision, "posted")
        self.ledger.decide(Role.OWNER, decision, True)
        with self.assertRaisesRegex(WorkflowError, "no longer waiting"):
            self.ledger.decide(Role.OWNER, decision, False)
        self.ledger.carried_out(Role.LEAD, decision, "posted")
        self.assertEqual(self.ledger.decisions()[0]["state"], "done")
        declined = self.ledger.ask(Role.LEAD, self.request, Interrupt.SPEND, "Buy a domain", "it spends money")
        self.ledger.decide(Role.OWNER, declined, False)
        with self.assertRaisesRegex(WorkflowError, "approved"):
            self.ledger.carried_out(Role.LEAD, declined, "bought")

    def test_a_stop_holds_every_automatic_step_until_the_person_resumes(self):
        task = self.task()
        self.ledger.stop(Role.OWNER, "Pause")
        self.assertTrue(self.ledger.stopped())
        with self.assertRaisesRegex(WorkflowError, "stopped"):
            self.ledger.claim_run(Role.LEAD, task, "mock")
        self.ledger.resume(Role.OWNER, "Go on")
        self.assertFalse(self.ledger.stopped())
        self.ledger.claim_run(Role.LEAD, task, "mock")

    def test_an_older_ledger_is_refused(self):
        other = self.ledger.path.with_name("old.db")
        with closing(sqlite3.connect(other)) as db, db:
            db.execute("CREATE TABLE requests (id INTEGER PRIMARY KEY, text TEXT)")
        with self.assertRaisesRegex(WorkflowError, "another Artemis version"):
            Ledger(other).initialize()


if __name__ == "__main__":
    unittest.main()
