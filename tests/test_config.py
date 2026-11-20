from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from harness.config import Config, DEFAULT_LEDGER
from harness.roles import OwnerAction, Role, WorkflowError


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory())) / "project"
        self.config = Config.initialize(self.root)
        self.file = self.root / "harness.toml"
        self.sample = self.file.read_text(encoding="utf-8")

    def test_samples_and_project_relative_settings(self):
        self.assertEqual(self.config.ledger, self.root.resolve() / DEFAULT_LEDGER)
        self.assertEqual(self.config.checks, (("python", "check.py"),))
        self.assertEqual(self.config.owner_actions, frozenset(OwnerAction))
        self.assertEqual(set(self.config.roles), set(Role))
        for settings in self.config.roles.values():
            self.assertTrue(settings.instructions())

    def test_init_preserves_edited_config_and_runbooks(self):
        updated = self.sample.replace(".harness/ledger.db", "state/other.db")
        self.file.write_text(updated, encoding="utf-8")
        card = self.config.roles[Role.WORKER].runbook
        card.write_text('instructions = "Keep the sample small."\n', encoding="utf-8")
        config = Config.initialize(self.root)
        self.assertEqual(self.file.read_text(encoding="utf-8"), updated)
        self.assertEqual(config.ledger, self.root.resolve() / "state/other.db")
        self.assertEqual(config.roles[Role.WORKER].instructions(), "Keep the sample small.")

    def test_reports_invalid_settings_at_load(self):
        changes = [
            (".harness/ledger.db", "../other.db", "relative path inside the project"),
            ('"money out"', '"erase everything"', "known owner action kinds"),
            ('[["python", "check.py"]]', "[]", "at least one command"),
            ("[roles.cqo]", "[roles.other]", "one entry for each harness role"),
        ]
        for original, replacement, error in changes:
            with self.subTest(original=original):
                self.file.write_text(self.sample.replace(original, replacement), encoding="utf-8")
                with self.assertRaisesRegex(WorkflowError, error):
                    Config.load(self.root)
