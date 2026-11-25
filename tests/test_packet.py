from pathlib import Path
from tempfile import TemporaryDirectory
import time
import unittest

from artemis.judge import Criterion
from artemis.ledger import Ledger
from artemis.packet import focus, packet
from artemis.roles import Role

from fakes import two_projects


class Packet(unittest.TestCase):
    """What a cold lead turn starts from: the thread, its notes, every project, the focus in detail, cards, due work."""

    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        self.ledger = Ledger(root / "ledger.db")
        self.ledger.initialize()
        self.ids = two_projects(self.ledger, root)

    def test_it_carries_both_projects_and_the_focus_in_detail(self):
        ledger, ids = self.ledger, self.ids
        ledger.open_card(Role.LEAD, "choice", "Which currency first?", "the brief leaves it open",
                         project=ids["shop"], options=["EUR", "USD"])
        ledger.say(Role.OWNER, "Anything new in the shop?", project=ids["shop"])
        ledger.note(Role.WORKER, "rounded the total\nto two places", task=ids["fix"])
        ledger.note(Role.LEAD, "a note about no project")
        now = time.time()
        for title, at in (("Nightly backup", now + 3600), ("Monthly report", now + 3 * 24 * 3600)):
            ledger.add_schedule(Role.LEAD, ids["notes"], title, "Copy the notes.", "host",
                                (Criterion("copied", artifact="backup.zip"),), "daily 02:00", at)
        text = packet(ledger, ids["shop"], ["Prefer small commits"], now=now)
        self.assertTrue(text.startswith("<artemis-context at="))
        self.assertTrue(text.endswith("</artemis-context>"))
        self.assertIn("Projects (2):", text)
        self.assertRegex(text, r"#\d+ shop · repo · .*shop · running 1")
        self.assertRegex(text, r"#\d+ notes · folder · .*notes · queued 1")
        self.assertIn(f"Focus: #{ids['shop']} shop (repo)", text)
        self.assertIn(f"#{ids['fix']} Fix the cart total · code · codex · running · checks: tests pass · codex working",
                      text)
        self.assertNotIn("Focus: #2", text)
        recent = text.split("Recent in shop:\n", 1)[1].split("Cards open", 1)[0]
        self.assertIn(f"note #{ids['fix']} rounded the total to two places", recent)
        self.assertNotIn("said", recent)
        self.assertNotIn("no project", recent)
        self.assertRegex(text, r"card \d+ · choice · waiting · Which currency first\? · shop")
        self.assertIn("Lessons in force (1):\n  Prefer small commits", text)
        self.assertIn("Nightly backup · notes", text)
        self.assertNotIn("Monthly report", text)
        both = packet(ledger, [ids["shop"], ids["notes"]], [], now=now)
        self.assertIn("Focus: #2 notes (folder)", both)
        self.assertIn(f"#{ids['tidy']} Tidy the notes · docs · queued · checks: index written · waiting for a worker",
                      both)

    def test_the_thread_holds_the_messages_before_this_one_and_only_the_leads_notes(self):
        ledger = self.ledger
        for number in range(5):
            ledger.say(Role.OWNER, f"message {number}")
            ledger.say(Role.LEAD, f"answer {number}\nsecond line")
        current = ledger.say(Role.OWNER, "the message being answered")
        ledger.note(Role.LEAD, "the owner prefers euros")
        ledger.note(Role.WORKER, "a worker's note")
        text = packet(self.ledger, None, [], history=3, before=current)
        self.assertIn("Conversation so far (last 3 messages):", text)
        self.assertRegex(text, r"  lead \(message #\d+, [\d-]+ [\d:]+\): answer 3\n    second line")
        self.assertIn("you (message #9", text)
        self.assertNotIn("message 3", text)
        self.assertNotIn("the message being answered", text)
        self.assertIn("Your notes (newest last; your own reading, not evidence):", text)
        self.assertIn("the owner prefers euros", text)
        self.assertNotIn("a worker's note", text)

    def test_an_empty_ledger_says_so(self):
        with TemporaryDirectory() as folder:
            ledger = Ledger(Path(folder) / "ledger.db")
            ledger.initialize()
            text = packet(ledger, None, [])
        self.assertIn("Conversation so far (last 0 messages):\n  none yet", text)
        self.assertIn("Projects (0):\n  none yet", text)
        self.assertIn("Cards open (0):", text)
        self.assertNotIn("Your notes", text)


class Focus(unittest.TestCase):
    """Which projects a message is about."""

    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        self.root = root
        self.ledger = Ledger(root / "ledger.db")
        self.ledger.initialize()

    def about(self, text, project=None):
        self.ledger.say(Role.OWNER, text, project)
        return focus(self.ledger, text, project)

    def test_the_project_it_was_sent_in_then_what_it_names_then_what_the_thread_was_about(self):
        ids = two_projects(self.ledger, self.root)
        self.assertEqual(self.about("How is it going?", ids["notes"]), [ids["notes"]])
        self.assertEqual(self.about("How are shop and notes doing?"), [ids["shop"], ids["notes"]])
        self.assertEqual(self.about("Which of them needs me?"), [ids["shop"], ids["notes"]])
        self.assertEqual(self.about("the shopping list"), [ids["shop"], ids["notes"]])
        self.assertEqual(focus(self.ledger, f"Task #{ids['tidy']} is stuck: index written is missing."),
                         [ids["notes"]])
        self.assertEqual(focus(self.ledger, "Task #99 is stuck."), [ids["shop"], ids["notes"]])

    def test_without_a_thread_the_last_project_worked_on_or_the_only_one(self):
        self.assertEqual(focus(self.ledger, "hello"), [])
        only = self.ledger.add_project(Role.OWNER, "solo", "folder", self.root / "solo")
        self.assertEqual(focus(self.ledger, "hello"), [only])
        other = self.ledger.add_project(Role.OWNER, "other", "folder", self.root / "other")
        self.assertEqual(focus(self.ledger, "hello"), [])
        self.ledger.add_task(Role.LEAD, self.ledger.request(Role.OWNER, "Sort it", other), "Sort it", "",
                             (Criterion("sorted", artifact="summary.csv"),))
        self.assertEqual(focus(self.ledger, "hello"), [other])
