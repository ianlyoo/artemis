"""The home's config.toml: the lines the App writes, one at a time."""

from importlib.resources import files
from pathlib import Path
import tempfile
import tomllib
import unittest

from artemis.config import name_setting, write_setting
from artemis.roles import WorkflowError


TEMPLATE = files("artemis.templates").joinpath("config.toml").read_text(encoding="utf-8")


class WriteLeadTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.path = Path(folder.name) / "config.toml"

    def written(self, before: str, name: str) -> str:
        self.path.write_bytes(before.encode("utf-8"))
        write_setting(self.path, "agents", "lead", name)
        return self.path.read_bytes().decode("utf-8")

    def test_only_the_lead_line_changes(self):
        after = self.written(TEMPLATE, "codex")
        changed = [(old, new) for old, new in zip(TEMPLATE.splitlines(), after.splitlines()) if old != new]
        self.assertEqual(changed, [('lead = "auto"', 'lead = "codex"')])
        self.assertEqual(len(after.splitlines()), len(TEMPLATE.splitlines()))
        self.assertEqual(tomllib.loads(after)["agents"]["lead"], "codex")
        self.assertEqual(tomllib.loads(after)["lead"], tomllib.loads(TEMPLATE)["lead"])   # the [lead] table too

    def test_a_comment_on_the_line_and_its_line_endings_stay(self):
        before = '# mine\r\n[agents]\r\nlead = \'claude\'   # who I talk to\r\nworker = "auto"\r\n'
        self.assertEqual(self.written(before, "auto"),
                         '# mine\r\n[agents]\r\nlead = "auto"   # who I talk to\r\nworker = "auto"\r\n')

    def test_a_missing_line_goes_under_agents_and_a_missing_table_at_the_end(self):
        self.assertEqual(self.written('[agents] # who works\nworker = "mock"\n[agents.caps]\nlead = 2\n', "mock"),
                         '[agents] # who works\nlead = "mock"\nworker = "mock"\n[agents.caps]\nlead = 2\n')
        self.assertEqual(self.written('[serve]\nport = 7411', "codex"),
                         '[serve]\nport = 7411\n\n[agents]\nlead = "codex"\n')

    def test_a_line_it_cannot_read_changes_nothing(self):
        odd = '[agents]\n"lead" = "auto"\n'
        self.path.write_text(odd, encoding="utf-8")
        with self.assertRaises(WorkflowError) as caught:
            write_setting(self.path, "agents", "lead", "codex")
        self.assertIn("by hand", str(caught.exception))
        self.assertEqual(self.path.read_text(encoding="utf-8"), odd)
        self.assertEqual([item.name for item in self.path.parent.iterdir()], ["config.toml"])


    def test_lists_and_names_from_the_first_run_setup(self):
        self.path.write_bytes(TEMPLATE.encode("utf-8"))
        write_setting(self.path, "interrupts", "ask", ["money out", "send as you"])
        write_setting(self.path, "cards", "phone_only", [])
        write_setting(self.path, "lead", "name", 'Juno "J" \\ 주노')
        write_setting(self.path, "lead", "you", "Sam")
        after = self.path.read_text(encoding="utf-8")
        self.assertEqual(len(after.splitlines()), len(TEMPLATE.splitlines()))
        data = tomllib.loads(after)
        self.assertEqual(data["interrupts"]["ask"], ["money out", "send as you"])
        self.assertEqual(data["cards"]["phone_only"], [])
        self.assertEqual((data["lead"]["name"], data["lead"]["you"]), ('Juno "J" \\ 주노', "Sam"))
        self.assertEqual(data["lead"]["wake_per_hour"], tomllib.loads(TEMPLATE)["lead"]["wake_per_hour"])
        self.assertIn('ask = ["money out", "send as you"]', after)

    def test_a_name_is_one_short_line(self):
        self.assertEqual(name_setting("  Juno \n ", "lead.name"), "Juno")
        self.assertEqual(name_setting(None, "lead.name"), "")
        for bad in ("x" * 41, "a\x07b", "a\x9fb"):
            with self.assertRaises(WorkflowError):
                name_setting(bad, "lead.name")


if __name__ == "__main__":
    unittest.main()
