import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from artemis import agents
from artemis.judge import CommandEvidence, Criterion, RuleJudge
from artemis.review import read_verdict, review
from artemis.roles import Role, WorkflowError

from fakes import FAKE_AGENT, FakeHome, FakeVault, config, fake_cli, records
from helpers import commit, repository

SECRET = "fake-review-secret-77c1"
CHECK = ("python", "-m", "unittest")
PASS = json.dumps({"verdict": "pass", "gaps": []})


@unittest.skipIf(os.name == "nt", "the fake agents are POSIX shell shims")
class Review(unittest.TestCase):
    """A second opinion from another model maker, on a change the judge already passed."""

    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory()))
        bin_ = self.root / "bin"
        bin_.mkdir()
        for name in ("claude", "codex", "gemini"):
            fake_cli(bin_, name, FAKE_AGENT)
        self.record = self.root / "agents.jsonl"
        self.enterContext(patch.dict(os.environ, {"PATH": f"{bin_}{os.pathsep}{os.environ['PATH']}",
                                                  "FAKE_AGENT_RECORD": str(self.record)}))
        self.ready({"claude", "codex", "gemini"})
        self.home = FakeHome(self.root, config(), FakeVault({"SHOP_TOKEN": SECRET}))
        ledger = self.home.ledger
        repo = repository(self.root / "shop")
        self.sha = commit(repo, "artemis/task-1", "cart.py", "def total(items):\n    return round(sum(items), 2)\n")
        shop = ledger.add_project(Role.OWNER, "shop", "repo", repo)
        self.task = self.passed(shop, "Round the cart total", self.sha)

    def ready(self, names):
        patcher = patch.object(agents, "ready", side_effect=lambda name, config, vault: name in names)
        patcher.start()
        self.addCleanup(patcher.stop)

    def passed(self, project, title, sha, *, judged=True):
        ledger = self.home.ledger
        task = ledger.add_task(Role.LEAD, ledger.request(Role.OWNER, title, project), title, "Two decimals.",
                               (Criterion("tests pass", command=CHECK),), review=True)
        ledger.claim_run(Role.HOME, task, "codex")
        ledger.submit(Role.WORKER, task, sha, "Rounded it.", {1: CommandEvidence(CHECK, 0, "OK")})
        if judged:
            ledger.judge(Role.JUDGE, task, RuleJudge())
        return task

    def reviews(self):
        return [row for row in self.home.ledger.events(task=self.task) if row["kind"] == "review"]

    def test_another_family_reads_the_diff_and_passes_it(self):
        with patch.dict(os.environ, {"FAKE_AGENT_REPLY": f"Looks right.\n{PASS}"}):
            self.assertEqual(review(self.home, self.task, self.sha, "codex"), ("pass", []))
        (run,) = records(self.record)
        self.assertEqual(run["name"], "claude")
        self.assertIn(f"Task #{self.task}: Round the cart total", run["prompt"])
        self.assertIn("Checks that passed: tests pass", run["prompt"])
        self.assertIn("+    return round(sum(items), 2)", run["prompt"])
        self.assertEqual(run["argv"][run["argv"].index("--tools") + 1], "")
        self.assertNotIn("--mcp-config", run["argv"])
        (event,) = self.reviews()
        self.assertEqual(event["detail"], "Claude Code (anthropic): pass")
        self.assertEqual(json.loads(event["data"]) | {"gaps": None},
                         {"provider": "claude", "verdict": "pass", "gaps": None, "sha": self.sha, "doer": "codex"})

    def test_a_claude_change_goes_to_codex_and_its_gaps_are_scrubbed(self):
        answer = json.dumps({"verdict": "reject", "gaps": [f"total() logs {SECRET}", " "]})
        with patch.dict(os.environ, {"FAKE_AGENT_REPLY": answer}):
            verdict = review(self.home, self.task, self.sha, "claude")
        self.assertEqual(verdict, ("reject", ["total() logs [secret:SHOP_TOKEN]"]))
        (run,) = records(self.record)
        self.assertEqual(run["name"], "codex")
        self.assertIn("read-only", run["argv"])
        self.assertNotIn(SECRET, self.reviews()[0]["detail"])

    def test_a_reviewer_that_fails_or_rambles_passes_it_to_the_next(self):
        with patch.dict(os.environ, {"FAKE_AGENT_EXIT_CLAUDE": "2", "FAKE_AGENT_REPLY_GEMINI": "It seems fine to me.",
                                     "FAKE_AGENT_REPLY_CODEX": PASS}):
            self.assertEqual(review(self.home, self.task, self.sha, "opencode"), ("pass", []))
        self.assertEqual([run["name"] for run in records(self.record)], ["claude", "codex"])
        with patch.dict(os.environ, {"FAKE_AGENT_REPLY": "It seems fine to me."}):
            self.assertEqual(review(self.home, self.task, self.sha, "codex"), ("pass", []))
        self.assertEqual([run["name"] for run in records(self.record)], ["claude", "codex", "claude", "gemini"])
        skipped = self.reviews()[-1]
        self.assertTrue(skipped["detail"].startswith("skipped, the judge's pass stands: Claude Code: the reviewer did "
                                                     "not answer with a verdict; Gemini CLI: the reviewer did not"))

    def test_with_no_other_family_ready_or_qualified_the_judges_pass_stands(self):
        self.ready({"claude", "gemini"})
        self.home.ledger.set_adapter("gemini", "code", agents.OS_NAME, "1.0", [], "test", "unqualified", "probe")
        self.assertEqual(review(self.home, self.task, self.sha, "claude"), ("pass", []))
        self.assertEqual(records(self.record), [])
        self.assertEqual(self.reviews()[-1]["detail"],
                         "skipped, the judge's pass stands: no provider outside anthropic is ready")

    def test_nothing_is_reviewed_before_the_judge_passes_it(self):
        task = self.passed(self.home.ledger.project("shop")["id"], "Another change", self.sha, judged=False)
        self.assertEqual(review(self.home, task, self.sha, "codex"), ("reject", ["the judge has not passed this submission"]))
        self.assertEqual(review(self.home, self.task, "0" * 40, "codex"),
                         ("reject", ["the judge has not passed this submission"]))
        self.assertEqual(records(self.record), [])

    def test_a_folder_task_is_reviewed_from_its_recorded_events(self):
        notes = self.home.ledger.add_project(Role.OWNER, "notes", "folder", self.root / "notes")
        digest = "host:" + "a" * 64
        self.task = self.passed(notes, "Sort the notes", digest)
        self.home.ledger.note(Role.WORKER, "moved 4 files into md/", task=self.task)
        with patch.dict(os.environ, {"FAKE_AGENT_REPLY": PASS}):
            self.assertEqual(review(self.home, self.task, digest, "codex"), ("pass", []))
        (run,) = records(self.record)
        self.assertIn(f"What the worker did in the folder {self.root / 'notes'} (recorded events):", run["prompt"])
        self.assertIn("- note: moved 4 files into md/", run["prompt"])


class Verdicts(unittest.TestCase):
    def test_only_a_json_verdict_counts_and_a_bare_reject_names_its_gap(self):
        self.assertEqual(read_verdict('Sure.\n{"verdict": "pass", "gaps": []}'), ("pass", []))
        self.assertEqual(read_verdict('{"verdict": "reject"}'), ("reject", ["the reviewer rejected it without naming a gap"]))
        for reply in ("pass", '{"verdict": "maybe"}', "{not json}", "[]"):
            with self.subTest(reply=reply), self.assertRaises(WorkflowError):
                read_verdict(reply)
