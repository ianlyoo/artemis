from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from artemis.judge import (ArtifactEvidence, Case, CommandEvidence, ContainsEvidence, CountEvidence, Criterion,
                          ExistsEvidence, PreservedEvidence, RuleJudge, capture, snapshot)
from artemis.ledger import evidence_from


class JudgeTests(unittest.TestCase):
    def test_evidence_can_be_captured_and_checked(self):
        with TemporaryDirectory() as scratch:
            root = Path(scratch)
            (root / "result.txt").write_bytes(b"ready")
            artifact = ArtifactEvidence.capture(root, "result.txt")
            argv = (sys.executable, "-c", "print('ready')")
            command = CommandEvidence.capture(root, argv)
            with self.assertRaisesRegex(ValueError, "inside the project"):
                ArtifactEvidence.capture(root, "../result.txt")
        self.assertEqual(artifact.sha256, sha256(b"ready").hexdigest())
        self.assertEqual(command.output, "ready\n")
        case = Case("a" * 40, "Ready", (
            Criterion("File", artifact="result.txt"),
            Criterion("CLI", command=argv, output="ready"),
        ), (artifact, command))
        self.assertEqual(RuleJudge().assess(case).kind, "pass")

    def test_reports_each_open_gap(self):
        expected = ("check",)
        case = Case("a" * 40, "Ready", (
            Criterion("File", artifact="result.txt"),
            Criterion("Wrong", command=expected),
            Criterion("Red", command=expected),
            Criterion("Output", command=expected, output="expected"),
        ), (
            ArtifactEvidence("result.txt", "invalid digest"),
            CommandEvidence(("something-else",), 0, ""),
            CommandEvidence(expected, 3, ""),
            CommandEvidence(expected, 0, "different output"),
        ))
        verdict = RuleJudge().assess(case)
        self.assertEqual(verdict.kind, "reject")
        self.assertEqual(verdict.gaps, (
            "File: recorded evidence differs from the criterion",
            "Wrong: recorded command differs from the criterion",
            "Red: command exited 3",
            "Output: expected text is absent from the output",
        ))

    def test_host_criteria_pass_on_a_folder_that_meets_them(self):
        with TemporaryDirectory() as scratch:
            root = Path(scratch)
            (root / "report.md").write_text("# Summary\nAll invoices filed.\n", encoding="utf-8")
            (root / "invoices").mkdir()
            for number in range(3):
                (root / "invoices" / f"{number}.pdf").write_bytes(b"%PDF")
            criteria = (
                Criterion("report exists", exists="report.md"),
                Criterion("report says filed", contains=("report.md", "invoices filed")),
                Criterion("three invoices", count=("invoices/*.pdf", 3)),
            )
            evidence = capture(root, criteria)
        self.assertEqual(evidence, {1: ExistsEvidence("report.md", True),
                                    2: ContainsEvidence("report.md", "invoices filed", True),
                                    3: CountEvidence("invoices/*.pdf", 3)})
        case = Case("", "Filed the invoices", criteria, tuple(evidence.get(n) for n in (1, 2, 3)))
        self.assertEqual(RuleJudge().assess(case).kind, "pass")

    def test_host_criteria_reject_with_what_is_missing(self):
        with TemporaryDirectory() as scratch:
            root = Path(scratch)
            (root / "report.md").write_text("draft\n", encoding="utf-8")
            (root / "invoices").mkdir()
            (root / "invoices" / "0.pdf").write_bytes(b"%PDF")
            criteria = (
                Criterion("summary", exists="summary.md"),
                Criterion("report says filed", contains=("report.md", "invoices filed")),
                Criterion("three invoices", count=("invoices/*.pdf", 3)),
                Criterion("outside", exists="../elsewhere.md"),
            )
            evidence = capture(root, criteria)
        self.assertNotIn(4, evidence)       # a path that leaves the folder is not looked at
        verdict = RuleJudge().assess(Case("", "Filed", criteria, tuple(evidence.get(n) for n in (1, 2, 3, 4))))
        self.assertEqual(verdict.kind, "reject")
        self.assertEqual(verdict.gaps, (
            "summary: summary.md does not exist",
            "report says filed: report.md does not contain 'invoices filed'",
            "three invoices: 1 files match invoices/*.pdf, at least 3 needed",
            "outside: missing exists evidence",
        ))

    def test_changed_and_preserved_compare_with_the_snapshot_from_the_start(self):
        criteria = (Criterion("notes updated", exists="notes.md"), Criterion("index made", exists="index.md"),
                    Criterion("photos kept", preserved=("photos/*.jpg", "2024")),
                    Criterion("folder there", exists="photos"))
        with TemporaryDirectory() as scratch:
            root = Path(scratch)
            (root / "photos").mkdir()
            (root / "photos" / "a.jpg").write_bytes(b"photo a")
            (root / "photos" / "b.jpg").write_bytes(b"photo b")
            (root / "notes.md").write_text("old notes\n", encoding="utf-8")
            before = json.loads(json.dumps(snapshot(root, criteria)))     # kept by the supervisor as JSON
            self.assertEqual(set(before), {"notes.md", "index.md", "photos/*.jpg", "photos"})
            self.assertEqual(before["index.md"], {})
            (root / "2024").mkdir()
            (root / "photos" / "a.jpg").rename(root / "2024" / "a.jpg")
            (root / "photos" / "b.jpg").unlink()
            (root / "index.md").write_text("# 2024\n", encoding="utf-8")
            first = capture(root, criteria, before=before)
            (root / "notes.md").write_text("new notes\n", encoding="utf-8")
            (root / "2024" / "b.jpg").write_bytes(b"photo b")
            second = capture(root, criteria, before=before)
            without = capture(root, criteria)
        self.assertEqual(first[1], ExistsEvidence("notes.md", True, False))
        self.assertEqual(first[2], ExistsEvidence("index.md", True, True))
        self.assertEqual(first[3], PreservedEvidence("photos/*.jpg", "2024", 2, ("photos/b.jpg",)))
        self.assertEqual(first[4], ExistsEvidence("photos", True))
        verdict = RuleJudge().assess(Case("", "Sorted", criteria, tuple(first.get(n) for n in (1, 2, 3, 4))))
        self.assertEqual(verdict.gaps, ("notes updated: notes.md is unchanged since the task started",
                                        "photos kept: 1 of 2 files from photos/*.jpg have no identical copy in "
                                        "2024: photos/b.jpg"))
        verdict = RuleJudge().assess(Case("", "Sorted", criteria, tuple(second.get(n) for n in (1, 2, 3, 4))))
        self.assertEqual(verdict.kind, "pass")
        self.assertNotIn(3, without)                    # with no snapshot, preserved has no evidence
        self.assertEqual(without[1], ExistsEvidence("notes.md", True))
        self.assertEqual(PreservedEvidence("x/*", "y", 0).gap(Criterion("p", preserved=("x/*", "y"))),
                         "no files matched x/* when the task started")

    def test_host_evidence_must_answer_its_own_criterion(self):
        criterion = Criterion("report", contains=("report.md", "filed"))
        self.assertEqual(criterion.gap(ContainsEvidence("other.md", "filed", True)),
                         "recorded evidence differs from the criterion")
        self.assertEqual(criterion.gap(ExistsEvidence("report.md", True)),
                         "recorded evidence differs from the criterion")

    def test_a_criterion_names_exactly_one_kind(self):
        for fields in ({}, {"exists": "a.md", "artifact": "a.md"}, {"command": ("true",), "count": ("*.md", 1)}):
            with self.subTest(fields=fields), self.assertRaisesRegex(ValueError, "exactly one"):
                Criterion("x", **fields)
        for fields in ({"contains": ("a.md",)}, {"count": ("*.md", 0)}, {"count": ("*.md", True)}):
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                Criterion("x", **fields)

    def test_host_criteria_and_evidence_survive_the_ledger_round_trip(self):
        criterion = Criterion("three", count=("*.pdf", 3))
        stored = json.loads(json.dumps(asdict(criterion)))       # lists come back where tuples went in
        rebuilt = Criterion(**{key: tuple(value) if isinstance(value, list) else value
                               for key, value in stored.items()})
        self.assertEqual(rebuilt, criterion)
        evidence = ContainsEvidence("a.md", "x", True)
        self.assertEqual(evidence_from("contains", json.loads(json.dumps(asdict(evidence)))), evidence)
