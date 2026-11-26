from contextlib import closing
import json
import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory
import time
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
        self.project = self.ledger.add_project(Role.OWNER, "todo", "repo", root)
        self.request = self.ledger.request(Role.OWNER, "Export the list as JSON", project=self.project)

    def task(self, title="Add JSON output"):
        return self.ledger.add_task(Role.LEAD, self.request, title, "", (Criterion("tests", command=CHECK),))

    def state(self, task):
        return self.ledger.work(task)[0]["state"]

    def test_events_are_append_only(self):
        with closing(sqlite3.connect(self.ledger.path)) as db, db:
            for statement in ("UPDATE events SET detail = ''", "DELETE FROM events"):
                with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                    db.execute(statement)

    def test_events_by_kind_since_a_time(self):
        before = time.time()
        self.ledger.record(Role.HOME, "lead.wake", "first")
        self.ledger.record(Role.HOME, "lead.turn", "a turn")
        self.ledger.record(Role.HOME, "lead.wake", "second")
        self.assertEqual([row["detail"] for row in self.ledger.events(kind="lead.wake", since=before)],
                         ["first", "second"])
        self.assertEqual(self.ledger.events(kind="lead.wake", since=time.time() + 60), [])

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
        decision = self.ledger.open_card(Role.LEAD, Interrupt.SEND, "Post it", "it speaks for you", request=self.request)
        with self.assertRaisesRegex(WorkflowError, "Only the you"):
            self.ledger.decide_card(Role.LEAD, decision, True)

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

    def test_cards_wait_for_the_person_and_are_used_once(self):
        card = self.ledger.open_card(Role.LEAD, Interrupt.SEND, "Post the note", "it speaks for you",
                                     request=self.request)
        self.assertEqual(self.ledger.card(card)["project_id"], self.project)
        with self.assertRaisesRegex(WorkflowError, "approved"):
            self.ledger.finish_card(Role.LEAD, card, "done", "posted")
        self.ledger.decide_card(Role.OWNER, card, True)
        with self.assertRaisesRegex(WorkflowError, "no longer waiting"):
            self.ledger.decide_card(Role.OWNER, card, False)
        self.ledger.finish_card(Role.LEAD, card, "done", "posted")
        self.assertEqual(self.ledger.cards()[0]["state"], "done")
        declined = self.ledger.open_card(Role.LEAD, Interrupt.SPEND, "Buy a domain", "it spends money",
                                         request=self.request)
        self.ledger.decide_card(Role.OWNER, declined, False)
        with self.assertRaisesRegex(WorkflowError, "approved"):
            self.ledger.finish_card(Role.LEAD, declined, "done", "bought")

    def test_an_approved_command_runs_exactly_once(self):
        card = self.ledger.open_card(Role.HOME, Interrupt.SEND, "Push to origin", "it publishes as you",
                                     request=self.request, command="git push origin main", cwd="/repo",
                                     shell="sh", rule="git push*")
        self.assertFalse(self.ledger.claim_card(Role.HOME, card))
        self.ledger.decide_card(Role.OWNER, card, True, standing={"argv": ["git", "push", "origin", "main"],
                                                                  "cwd": "/repo"})
        self.assertTrue(self.ledger.claim_card(Role.HOME, card))
        self.assertFalse(self.ledger.claim_card(Role.HOME, card))
        self.ledger.finish_card(Role.HOME, card, "done", "pushed")
        found = self.ledger.standing(kind=Interrupt.SEND, argv=["git", "push", "origin", "main"], cwd="/repo")
        self.assertEqual(found["card_id"], card)
        self.assertIsNone(self.ledger.standing(kind=Interrupt.SEND, argv=["git", "push", "origin", "x"], cwd="/repo"))
        self.ledger.revoke_standing(Role.OWNER, found["id"])
        self.assertIsNone(self.ledger.standing(kind=Interrupt.SEND, argv=["git", "push", "origin", "main"], cwd="/repo"))
        spend = self.ledger.open_card(Role.HOME, Interrupt.SPEND, "Buy", "money", request=self.request, command="x")
        with self.assertRaisesRegex(WorkflowError, "never gets a standing"):
            self.ledger.decide_card(Role.OWNER, spend, True, standing={"argv": ["x"]})
        late = self.ledger.open_card(Role.HOME, Interrupt.SEND, "Late", "send", request=self.request, expires=1.0)
        with self.assertRaisesRegex(WorkflowError, "expired"):
            self.ledger.decide_card(Role.OWNER, late, True)
        self.assertEqual(self.ledger.card(late)["state"], "expired")
        self.assertEqual(self.ledger.counts()["asked"], 3)

    def test_choice_and_secret_cards(self):
        choice = self.ledger.open_card(Role.LEAD, "choice", "Which name?", "it is yours to pick",
                                       request=self.request, options=[{"id": "a", "label": "Atlas"},
                                                                      {"id": "b", "label": "Bolt"}])
        with self.assertRaisesRegex(WorkflowError, "Choose one of"):
            self.ledger.choose(Role.OWNER, choice, "c")
        self.ledger.choose(Role.OWNER, choice, "b")
        self.assertEqual(self.ledger.card(choice)["answer"], "b")
        secret = self.ledger.open_card(Role.WORKER, "secret", "Mail password", "the task sends mail",
                                       request=self.request, options={"name": "SMTP_PASSWORD", "kind": "send"})
        self.assertEqual(self.ledger.secret_set(Role.OWNER, secret), "SMTP_PASSWORD")
        self.assertEqual(self.ledger.card(secret)["answer"], "set")

    def test_project_flags_are_the_owners_and_default_off(self):
        row = self.ledger.project(self.project)
        self.assertEqual((row["shell"], row["no_run"], row["allowed_roots"]), (0, 0, "[]"))
        with self.assertRaisesRegex(WorkflowError, "Only the you"):
            self.ledger.set_project_flags(Role.LEAD, self.project, shell=True, no_run=False)
        with self.assertRaises(WorkflowError):
            self.ledger.set_project_flags(Role.OWNER, self.project, shell=False, no_run=False,
                                          allowed_roots=("relative/path",))
        extra = Path(self.ledger.path).parent.resolve()
        self.ledger.set_project_flags(Role.OWNER, self.project, shell=False, no_run=True, allowed_roots=(extra,))
        row = self.ledger.project(self.project)
        self.assertEqual((row["shell"], row["no_run"], json.loads(row["allowed_roots"])), (0, 1, [str(extra)]))
        self.assertEqual(self.ledger.events()[-1]["kind"], "project.flags")

    def test_a_request_reads_back_with_its_project(self):
        request = self.ledger.request(Role.OWNER, "Tidy the notes", project=self.project)
        row = self.ledger.request_row(request)
        self.assertEqual((row["text"], row["project_id"], row["source"]), ("Tidy the notes", self.project, "cli"))
        with self.assertRaises(WorkflowError):
            self.ledger.request_row(request + 1)

    def test_devices_and_adapters(self):
        device = self.ledger.add_device("phone", "h" * 64, "1234", phone=True)
        self.assertEqual(self.ledger.device("h" * 64)["state"], "pending")
        self.ledger.set_device(Role.OWNER, device, "allowed")
        self.assertEqual(self.ledger.device("h" * 64)["state"], "allowed")
        self.ledger.set_adapter("claude", "worker", "darwin", "2.1", [], "plan", "live", "run 7")
        self.ledger.set_adapter("claude", "worker", "darwin", "2.2", [], "plan", "contract", "version changed")
        self.assertEqual([row["status"] for row in self.ledger.adapters()], ["contract"])

    def test_messages_schedules_and_lessons(self):
        said = self.ledger.say(Role.OWNER, "Back up the reports every Friday")
        self.ledger.say(Role.LEAD, "Scheduled.")
        self.assertEqual([m["role"] for m in self.ledger.messages()], ["you", "lead"])
        self.assertEqual(self.ledger.message(said)["text"], "Back up the reports every Friday")
        with self.assertRaises(WorkflowError):
            self.ledger.message(said + 9)
        for number in range(3):
            self.ledger.note(Role.LEAD, f"lead note {number}")
        self.ledger.note(Role.WORKER, "worker note")
        self.assertEqual([row["detail"] for row in self.ledger.notes(Role.LEAD, limit=2)], ["lead note 1", "lead note 2"])
        schedule = self.ledger.add_schedule(Role.LEAD, self.project, "Back up reports", "", "host",
                                            (Criterion("zip", command=CHECK),), "every 7d", 100.0)
        self.assertEqual([row["id"] for row in self.ledger.due(150.0)], [schedule])
        task = self.ledger.fire(schedule, 100.0, 704900.0, late=False)
        self.assertIsNotNone(task)
        self.assertIsNone(self.ledger.fire(schedule, 100.0, 704900.0, late=False))
        self.assertEqual(self.ledger.work(task)[0]["schedule_id"], schedule)
        lesson = self.ledger.add_lesson(Role.HOME, "rule", "List every new flag in the README", source=[1],
                                        project=self.project)
        self.assertEqual([row["id"] for row in self.ledger.lessons(self.project)], [lesson])
        self.ledger.set_lesson(Role.OWNER, lesson, "retired")
        self.assertEqual(self.ledger.lessons(self.project), [])
        with self.assertRaisesRegex(WorkflowError, "Only the you"):
            self.ledger.set_lesson(Role.LEAD, lesson, "active")

    def test_submissions_and_a_message_by_number(self):
        task = self.task()
        for exit_code, sha in ((1, "a" * 40), (0, "b" * 40)):
            self.ledger.submit(Role.WORKER, task, sha, "done", {1: CommandEvidence(CHECK, exit_code, "")})
            self.ledger.judge(Role.JUDGE, task, RuleJudge())
        self.ledger.submit(Role.WORKER, task, "c" * 40, "again", {})
        self.assertEqual([(row["sha"][0], row["verdict"]) for row in self.ledger.submissions(task)],
                         [("a", "reject"), ("b", "pass"), ("c", None)])
        said = self.ledger.say(Role.OWNER, "List every flag in the README")
        self.ledger.say(Role.LEAD, "Noted")
        self.assertEqual((self.ledger.message(said)["role"], self.ledger.message(said)["text"]),
                         ("you", "List every flag in the README"))
        with self.assertRaisesRegex(WorkflowError, "does not exist"):
            self.ledger.message(99)

    def test_requests_are_found_by_project_and_message(self):
        said = self.ledger.say(Role.OWNER, "Tidy the downloads folder")
        chat = self.ledger.request(Role.HOME, "Tidy the downloads folder", project=self.project, source="chat",
                                   message=said)
        self.assertEqual([row["id"] for row in self.ledger.requests(project=self.project)], [self.request, chat])
        self.assertEqual([row["id"] for row in self.ledger.requests(message=said)], [chat])
        self.assertEqual(self.ledger.requests(project=self.project, message=said + 1), [])

    def test_a_stop_holds_every_automatic_step_until_the_person_resumes(self):
        task = self.task()
        self.ledger.stop(Role.OWNER, "Pause")
        self.assertTrue(self.ledger.stopped())
        with self.assertRaisesRegex(WorkflowError, "stopped"):
            self.ledger.claim_run(Role.LEAD, task, "mock")
        self.ledger.resume(Role.OWNER, "Go on")
        self.assertFalse(self.ledger.stopped())
        self.ledger.claim_run(Role.LEAD, task, "mock")

    def test_the_newest_events(self):
        task = self.task()
        other = self.ledger.add_project(Role.OWNER, "notes", "folder", self.ledger.path.parent / "notes")
        self.ledger.note(Role.LEAD, "elsewhere", project=other)
        run = self.ledger.claim_run(Role.LEAD, task, "mock")
        self.ledger.submit(Role.WORKER, task, COMMIT, "Tests recorded", {1: CommandEvidence(CHECK, 0, "OK")})
        self.ledger.judge(Role.JUDGE, task, RuleJudge())
        self.ledger.end_run(Role.WORKER, run, "done", "verified")
        self.assertEqual([row["kind"] for row in self.ledger.latest_events(2)], ["pass", "finished"])
        self.assertEqual([row["kind"] for row in self.ledger.latest_events(5, kinds=("task", "pass"))],
                         ["task", "pass"])
        self.assertEqual([row["detail"] for row in self.ledger.latest_events(5, project=other)][-1], "elsewhere")

    def test_an_older_ledger_is_refused(self):
        other = self.ledger.path.with_name("old.db")
        with closing(sqlite3.connect(other)) as db, db:
            db.execute("CREATE TABLE requests (id INTEGER PRIMARY KEY, text TEXT)")
        with self.assertRaisesRegex(WorkflowError, "another Artemis version"):
            Ledger(other).initialize()


    def test_evidence_reads_the_latest_submission_and_its_verdict(self):
        task = self.task()
        self.assertEqual(self.ledger.evidence(task), (None, {}))
        self.ledger.claim_run(Role.LEAD, task, "mock")
        self.ledger.submit(Role.WORKER, task, COMMIT, "Ready", {})
        self.ledger.judge(Role.JUDGE, task, RuleJudge())
        self.ledger.submit(Role.WORKER, task, COMMIT, "Tests recorded", {1: CommandEvidence(CHECK, 0, "OK")})
        row, items = self.ledger.evidence(task)
        self.assertEqual((row["claim"], row["verdict"]), ("Tests recorded", None))
        self.assertEqual(items, {1: CommandEvidence(CHECK, 0, "OK")})
        self.ledger.judge(Role.JUDGE, task, RuleJudge())
        self.assertEqual(self.ledger.evidence(task)[0]["verdict"], "pass")


if __name__ == "__main__":
    unittest.main()
