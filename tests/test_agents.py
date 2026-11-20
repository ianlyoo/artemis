from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from harness.agents import CommandRunner
from harness.config import RoleSettings
from harness.roles import WorkflowError


class CommandRunnerTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory()))
        self.card = self.root / "worker.toml"
        self.card.write_text('instructions = "Use the supplied criterion."\n', encoding="utf-8")

    def test_passes_runbook_brief_and_task_argument(self):
        command = (
            sys.executable, "-c",
            "import sys; sys.stdout.buffer.write(sys.argv[1].encode() + b'\\n' + sys.stdin.buffer.read())",
            "{task}",
        )
        runner = CommandRunner(RoleSettings(self.card, command))
        self.assertEqual(
            runner.claim(self.root, 7, "Task brief"),
            "7\nUse the supplied criterion.\n\nTask brief",
        )

    def test_a_failed_command_has_no_claim(self):
        command = (sys.executable, "-c", "print('Ready'); raise SystemExit(6)")
        runner = CommandRunner(RoleSettings(self.card, command))
        with self.assertRaisesRegex(WorkflowError, "exited 6"):
            runner.claim(self.root, 7, "Task brief")
