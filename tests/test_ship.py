from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from artemis.judge import CommandEvidence, Criterion, RuleJudge
from artemis.ledger import Ledger
from artemis.roles import Role, WorkflowError
from artemis.ship import ship

from helpers import commit, git, repository


CHECK = (sys.executable, "-m", "unittest")


class ShipTests(unittest.TestCase):
    def setUp(self):
        self.repo = repository(Path(self.enterContext(TemporaryDirectory())) / "project")
        (self.repo / ".artemis").mkdir()
        (self.repo / ".git" / "info" / "exclude").write_text(".artemis/\n", encoding="utf-8")
        self.ledger = Ledger(self.repo / ".artemis" / "ledger.db")
        self.ledger.initialize()
        project = self.ledger.add_project(Role.OWNER, "repo", "repo", self.repo)
        self.request = self.ledger.request(Role.OWNER, "Two changes", project=project)

    def passed(self, sha: str) -> int:
        task = self.ledger.add_task(Role.LEAD, self.request, "Change", "", (Criterion("tests", command=CHECK),))
        self.ledger.submit(Role.WORKER, task, sha, "Done", {1: CommandEvidence(CHECK, 0, "OK")})
        self.assertEqual(self.ledger.judge(Role.JUDGE, task, RuleJudge()).kind, "pass")
        return task

    def land(self, task: int, sha: str):
        return ship(self.ledger, task, sha, self.repo, "Change", commands=(CHECK,))

    def test_parallel_branches_each_land_through_a_checked_merge(self):
        first = commit(self.repo, "one", "one.txt", "1\n")
        second = commit(self.repo, "two", "two.txt", "2\n")
        a, b = self.passed(first), self.passed(second)
        self.assertEqual(self.land(a, first).state, "applied")
        self.assertEqual(git(self.repo, "rev-parse", "main"), first)
        landing = self.land(b, second)
        self.assertEqual(landing.state, "applied")
        main = git(self.repo, "rev-parse", "main")
        self.assertEqual(landing.candidate, main)
        self.assertEqual(git(self.repo, "rev-list", "--parents", "-n1", main).split()[1:], [first, second])
        self.assertTrue((self.repo / "one.txt").exists() and (self.repo / "two.txt").exists())
        self.assertEqual([row["state"] for row in self.ledger.work()], ["shipped", "shipped"])
        with self.assertRaisesRegex(WorkflowError, "already has a ship receipt"):
            self.land(b, second)

    def test_a_conflict_leaves_main_alone_and_records_no_receipt(self):
        first = commit(self.repo, "one", "app.py", "VALUE = 2\n")
        second = commit(self.repo, "two", "app.py", "VALUE = 3\n")
        a, b = self.passed(first), self.passed(second)
        self.land(a, first)
        landing = self.land(b, second)
        self.assertEqual(landing.state, "conflict")
        self.assertEqual(git(self.repo, "rev-parse", "main"), first)
        self.assertEqual(self.ledger.work(b)[0]["state"], "verified")
        self.assertEqual(git(self.repo, "worktree", "list").count("\n"), 0)

    def test_red_checks_on_the_merge_keep_main(self):
        broken = commit(self.repo, "bad", "app.py", "VALUE = 0\n")
        task = self.passed(broken)
        before = git(self.repo, "rev-parse", "main")
        landing = self.land(task, broken)
        self.assertEqual(landing.state, "red")
        self.assertIn("exited 1", landing.detail)
        self.assertEqual(git(self.repo, "rev-parse", "main"), before)
        self.assertEqual(self.ledger.work(task)[0]["state"], "stuck")

    def test_a_commit_that_tracks_artemis_state_is_refused(self):
        git(self.repo, "switch", "-q", "-c", "sneaky")
        (self.repo / ".artemis" / "notes").write_text("x", encoding="utf-8")
        git(self.repo, "add", "-f", ".artemis/notes")
        git(self.repo, "commit", "-qm", "Track local state")
        sneaky = git(self.repo, "rev-parse", "HEAD")
        git(self.repo, "switch", "-q", "main")
        task = self.passed(sneaky)
        self.assertEqual(self.land(task, sneaky).state, "blocked")
        self.assertEqual(self.ledger.work(task)[0]["state"], "stuck")

    def test_main_moves_by_compare_and_swap_when_another_branch_is_checked_out(self):
        sha = commit(self.repo, "one", "one.txt", "1\n")
        task = self.passed(sha)
        git(self.repo, "switch", "-q", "-c", "elsewhere")
        self.assertEqual(self.land(task, sha).state, "applied")
        self.assertEqual(git(self.repo, "rev-parse", "main"), sha)
        self.assertEqual(git(self.repo, "symbolic-ref", "--short", "HEAD"), "elsewhere")

    def test_local_edits_in_the_way_block_without_losing_them(self):
        sha = commit(self.repo, "one", "app.py", "VALUE = 5\n")
        task = self.passed(sha)
        (self.repo / "app.py").write_text("VALUE = 9  # mine\n", encoding="utf-8")
        landing = self.land(task, sha)
        self.assertEqual(landing.state, "blocked")
        self.assertEqual((self.repo / "app.py").read_text(encoding="utf-8"), "VALUE = 9  # mine\n")


if __name__ == "__main__":
    unittest.main()
