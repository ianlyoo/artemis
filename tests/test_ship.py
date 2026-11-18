from hashlib import sha256
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from harness.demo import _change, _commit, _sample
from harness.judge import ArtifactEvidence, CommandEvidence, Criterion, RuleJudge
from harness.ledger import Ledger
from harness.roles import Role, WorkflowError
from harness.ship import git, ship


class ShipTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        self.repo = root / "project"
        self.repo.mkdir()
        _sample(self.repo)
        self.base = git(self.repo, "rev-parse", "HEAD")
        self.ledger = Ledger(root / "ledger.db")
        self.ledger.initialize()
        request = self.ledger.request(Role.OWNER, "Export a list")
        goal = self.ledger.set_goal(Role.LEAD, request, "Add structured output")
        self.ledger.plan(Role.CTO, goal, "Add a JSON flag")
        project = self.ledger.open_project(Role.PM, goal, "Todo CLI")
        self.task = self.ledger.assign(Role.PM, project, "Add JSON output",
                                       (Criterion("Source", artifact="todo.py"),))

    def candidate(self, *, check_plan=None):
        commit, artifact = _change(self.repo)
        if check_plan is not None:
            (self.repo / "ship.toml").write_text(check_plan, encoding="utf-8")
            commit = _commit(self.repo, "Change the check plan")
        git(self.repo, "switch", "main")
        self.ledger.submit(Role.WORKER, self.task, commit, "Ready", {1: artifact})
        self.assertEqual(self.ledger.judge(Role.CQO, self.task, RuleJudge()).kind, "pass")
        return commit

    def ship(self):
        return ship(self.ledger, self.task, self.repo, "json-output")

    def test_checks_in_disposable_worktree_and_rerun_is_idempotent(self):
        commit = self.candidate()
        result = self.ship()
        self.assertEqual(result.state, "applied")
        self.assertEqual(result.commit, commit)
        self.assertEqual(git(self.repo, "rev-parse", "main"), commit)
        self.assertEqual(self.ledger.open_work(), [])
        self.assertEqual(git(self.repo, "worktree", "list", "--porcelain").count("worktree "), 1)
        timeline = list(self.ledger.timeline())
        with patch("harness.ship.CommandEvidence.capture", side_effect=AssertionError("check rerun")):
            self.assertEqual(self.ship(), result)
        self.assertEqual(timeline, self.ledger.timeline())

    def test_red_check_keeps_main_and_records_the_failure(self):
        self.candidate(check_plan="""checks = [["python3", "-c", "print('broken'); raise SystemExit(7)"]]\n""")
        result = self.ship()
        self.assertEqual(result.state, "red")
        self.assertEqual(git(self.repo, "rev-parse", "main"), self.base)
        self.assertEqual(self.ledger.open_work()[0]["state"], "checks failed")
        self.assertEqual(result.checks[0].exit_code, 7)
        self.assertEqual(result.checks[0].output_sha256, sha256(b"broken\n").hexdigest())
        self.assertEqual(self.ledger.timeline()[-1]["kind"], "red")
        self.assertEqual(self.ship(), result)

    def test_branch_movement_requires_judging_the_new_commit(self):
        original = self.candidate()
        with self.assertRaisesRegex(WorkflowError, "Finish shipping"):
            self.ledger.submit(Role.WORKER, self.task, original, "Already passed", {})
        git(self.repo, "switch", "json-output")
        (self.repo / "extra.txt").write_text("more work", encoding="utf-8")
        updated = _commit(self.repo, "Add another change")
        artifact = ArtifactEvidence.capture(self.repo, "todo.py")
        git(self.repo, "switch", "main")
        with self.assertRaisesRegex(WorkflowError, "exact commit"):
            self.ship()
        self.assertEqual(git(self.repo, "rev-parse", "main"), self.base)

        self.ledger.submit(Role.WORKER, self.task, updated, "Updated candidate", {1: artifact})
        with self.assertRaisesRegex(WorkflowError, "exact commit"):
            self.ship()
        self.assertEqual(self.ledger.judge(Role.CQO, self.task, RuleJudge()).kind, "pass")
        receipt = self.ship()
        self.assertEqual((receipt.state, receipt.commit), ("applied", updated))
        self.assertEqual(git(self.repo, "rev-parse", "main"), updated)

    def test_invalid_check_plan_records_red_and_a_corrected_candidate_ships(self):
        valid_plan = (self.repo / "ship.toml").read_text(encoding="utf-8")
        original = self.candidate(check_plan="checks = []\n")
        receipt = self.ship()
        self.assertEqual((receipt.state, receipt.commit, receipt.checks), ("red", original, ()))
        event = self.ledger.timeline(self.task)[-1]
        self.assertEqual(event["kind"], "red")
        self.assertIn("ship.toml", event["detail"])
        self.assertEqual(git(self.repo, "rev-parse", "main"), self.base)

        git(self.repo, "switch", "json-output")
        (self.repo / "ship.toml").write_text(valid_plan, encoding="utf-8")
        corrected = _commit(self.repo, "Restore the check plan")
        artifact = ArtifactEvidence.capture(self.repo, "todo.py")
        git(self.repo, "switch", "main")
        self.ledger.submit(Role.WORKER, self.task, corrected, "Corrected check plan", {1: artifact})
        self.assertEqual(self.ledger.judge(Role.CQO, self.task, RuleJudge()).kind, "pass")
        receipt = self.ship()
        self.assertEqual((receipt.state, receipt.commit), ("applied", corrected))
        self.assertEqual(git(self.repo, "rev-parse", "main"), corrected)

    def test_divergent_main_leaves_a_receipt_and_allows_a_new_submission(self):
        self.candidate()
        (self.repo / "extra.txt").write_text("another change", encoding="utf-8")
        advanced = _commit(self.repo, "Advance main separately")
        self.assertEqual(self.ship().state, "stale")
        self.assertEqual(git(self.repo, "rev-parse", "main"), advanced)
        self.ledger.submit(Role.WORKER, self.task, advanced, "Updated candidate", {})
        self.assertEqual(self.ledger.open_work()[0]["state"], "reported")

    def test_stop_during_checks_prevents_apply(self):
        commit = self.candidate()

        def stop_during_check(tree, argv):
            self.assertNotEqual(tree, self.repo)
            self.assertTrue((tree / "test_todo.py").is_file())
            self.ledger.stop(Role.OWNER, "Pause before apply")
            return CommandEvidence(argv, 0, "OK")

        with patch("harness.ship.CommandEvidence.capture", side_effect=stop_during_check):
            with self.assertRaisesRegex(WorkflowError, "stopped"):
                self.ship()
        self.assertEqual(git(self.repo, "rev-parse", "main"), self.base)
        self.ledger.resume(Role.OWNER, "Resume delivery")
        self.assertEqual(self.ship().commit, commit)

    def test_retry_recovers_a_git_apply_without_a_final_receipt(self):
        commit = self.candidate()
        with sqlite3.connect(self.ledger.path) as db:
            db.execute("""
                CREATE TRIGGER fail_apply BEFORE INSERT ON events WHEN NEW.kind = 'applied'
                BEGIN SELECT RAISE(ABORT, 'cannot append apply event'); END
            """)
        with self.assertRaises(sqlite3.IntegrityError):
            self.ship()
        self.assertEqual(git(self.repo, "rev-parse", "main"), commit)
        self.assertEqual(self.ledger.timeline()[-1]["kind"], "checked")
        with self.assertRaisesRegex(WorkflowError, "Finish shipping"):
            self.ledger.submit(Role.WORKER, self.task, "b" * 40, "New candidate", {})
        with sqlite3.connect(self.ledger.path) as db:
            db.execute("DROP TRIGGER fail_apply")
        with patch("harness.ship.CommandEvidence.capture", side_effect=AssertionError("check rerun")):
            self.assertEqual(self.ship().state, "applied")
        self.assertEqual(self.ledger.timeline()[-1]["kind"], "applied")
