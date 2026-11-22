from hashlib import sha256
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from artemis.judge import ArtifactEvidence, Case, CommandEvidence, Criterion, RuleJudge


class JudgeTests(unittest.TestCase):
    def test_evidence_can_be_captured_and_checked(self):
        with TemporaryDirectory() as scratch:
            root = Path(scratch)
            (root / "result.txt").write_bytes(b"ready")
            artifact = ArtifactEvidence.capture(root, "result.txt")
            argv = (sys.executable, "-c", "print('ready')")
            command = CommandEvidence.capture(root, argv)
            with self.assertRaisesRegex(ValueError, "within the checkout"):
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
