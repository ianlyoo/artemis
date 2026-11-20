from contextlib import closing
from hashlib import sha256
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from harness.config import DEFAULT_LEDGER
from harness.demo import _change, _commit, _sample
from harness.judge import ArtifactEvidence, CommandEvidence, Criterion, RuleJudge
from harness.ledger import Ledger
from harness.roles import Role, WorkflowError
from harness.ship import checkout, git, ship


class ShipTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        self.repo = root / "project"
        self.repo.mkdir()
        _sample(self.repo)
        self.base = git(self.repo, "rev-parse", "HEAD")
        info = self.repo / ".git" / "info"
        info.mkdir(exist_ok=True)
        (info / "exclude").write_text(".harness/\nlocal-*.txt\n", encoding="utf-8")
        self.ledger = Ledger(self.repo / DEFAULT_LEDGER)
        self.ledger.initialize()
        request = self.ledger.request(Role.OWNER, "Export a list")
        goal = self.ledger.set_goal(Role.LEAD, request, "Add structured output")
        self.ledger.plan(Role.CTO, goal, "Add a JSON flag")
        project = self.ledger.open_project(Role.PM, goal, "Todo CLI")
        self.task = self.ledger.assign(Role.PM, project, "Add JSON output",
                                       (Criterion("Source", artifact="todo.py"),))

    def candidate(self):
        commit, artifact = _change(self.repo)
        git(self.repo, "switch", "main")
        self.pass_candidate(commit, artifact)
        return commit

    def pass_candidate(self, commit, artifact):
        self.ledger.submit(Role.WORKER, self.task, commit, "Ready", {1: artifact})
        self.assertEqual(self.ledger.judge(Role.CQO, self.task, RuleJudge()).kind, "pass")

    def ship(self, commands=((sys.executable, "test_todo.py"),)):
        return ship(self.ledger, self.task, self.repo, "json-output", commands=commands)

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
        self.candidate()
        result = self.ship(((sys.executable, "-c", "print('broken'); raise SystemExit(7)"),))
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

    def test_reserved_in_project_ledger_is_red_and_a_corrected_commit_ships(self):
        good = self.candidate()
        history = self.ledger.timeline(self.task)
        with checkout(self.repo, good) as tree:
            target = tree / DEFAULT_LEDGER
            target.parent.mkdir()
            target.write_bytes(b"fictional candidate content")
            git(tree, "add", "-f", DEFAULT_LEDGER.as_posix())
            blocked = _commit(tree, "Add a reserved local file")
            artifact = ArtifactEvidence.capture(tree, "todo.py")
        git(self.repo, "branch", "-f", "json-output", blocked)
        self.pass_candidate(blocked, artifact)

        with patch("harness.ship.CommandEvidence.capture", side_effect=AssertionError("ran checks")):
            receipt = self.ship()
        self.assertEqual((receipt.state, receipt.commit, receipt.checks), ("red", blocked, ()))
        timeline = self.ledger.timeline(self.task)
        self.assertEqual(timeline[:len(history)], history)
        self.assertEqual(timeline[-1]["kind"], "red")
        self.assertIn("reserved path .harness", timeline[-1]["detail"])
        self.assertEqual(git(self.repo, "rev-parse", "main"), self.base)

        git(self.repo, "branch", "-f", "json-output", good)
        self.pass_candidate(good, artifact)
        self.assertEqual(self.ship().state, "applied")
        self.assertEqual(git(self.repo, "rev-parse", "main"), good)

    def test_ignored_file_collision_preserves_local_data_and_allows_retry(self):
        self.candidate()
        name = "local-note.txt"
        git(self.repo, "switch", "json-output")
        (self.repo / name).write_text("candidate text", encoding="utf-8")
        git(self.repo, "add", "-f", name)
        commit = _commit(self.repo, "Add a note")
        artifact = ArtifactEvidence.capture(self.repo, "todo.py")
        git(self.repo, "switch", "main")
        self.pass_candidate(commit, artifact)
        local = self.repo / name
        local.write_text("local draft", encoding="utf-8")
        with self.assertRaises(subprocess.CalledProcessError):
            self.ship()
        self.assertEqual(local.read_text(encoding="utf-8"), "local draft")
        self.assertEqual(git(self.repo, "rev-parse", "main"), self.base)
        self.assertEqual(self.ledger.timeline()[-1]["kind"], "checked")

        saved = local.rename(self.repo / "local-saved.txt")
        self.assertEqual(self.ship().state, "applied")
        self.assertEqual(local.read_text(encoding="utf-8"), "candidate text")
        self.assertEqual(saved.read_text(encoding="utf-8"), "local draft")

    def test_ship_overrides_a_squash_preference_and_records_the_applied_commit(self):
        commit = self.candidate()
        git(self.repo, "config", "branch.main.mergeOptions", "--squash")
        receipt = self.ship()
        self.assertEqual((receipt.state, receipt.commit), ("applied", commit))
        self.assertEqual(git(self.repo, "rev-parse", "main"), commit)

    def test_unrelated_history_can_be_replaced_with_a_descendant_of_main(self):
        good = self.candidate()
        tree = git(self.repo, "rev-parse", f"{good}^{{tree}}")
        unrelated = git(
            self.repo, "-c", "user.name=Example", "-c", "user.email=example", "commit-tree",
            tree, "-m", "Create a second root",
        )
        git(self.repo, "branch", "-f", "json-output", unrelated)
        with checkout(self.repo, unrelated) as root:
            artifact = ArtifactEvidence.capture(root, "todo.py")
        self.pass_candidate(unrelated, artifact)
        self.assertEqual(self.ship().state, "stale")
        self.assertEqual(git(self.repo, "rev-parse", "main"), self.base)

        git(self.repo, "branch", "-f", "json-output", good)
        self.pass_candidate(good, artifact)
        receipt = self.ship()
        self.assertEqual((receipt.state, receipt.commit), ("applied", good))
        self.assertEqual(git(self.repo, "rev-parse", "main"), good)

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
        with closing(sqlite3.connect(self.ledger.path)) as db, db:
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
        with closing(sqlite3.connect(self.ledger.path)) as db, db:
            db.execute("DROP TRIGGER fail_apply")
        with patch("harness.ship.CommandEvidence.capture", side_effect=AssertionError("check rerun")):
            self.assertEqual(self.ship().state, "applied")
        self.assertEqual(self.ledger.timeline()[-1]["kind"], "applied")
