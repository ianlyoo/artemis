import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from artemis import home, undo
from artemis.judge import Criterion
from artemis.ledger import Ledger
from artemis.roles import Role


class UndoTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        home = root / "home"
        self.paths = SimpleNamespace(root=home, ledger=home / "ledger.db", undo=home / "undo")
        home.mkdir()
        self.ledger = Ledger(self.paths.ledger)
        self.ledger.initialize()
        self.folder = root / "photos"
        self.folder.mkdir()
        project = self.ledger.add_project(Role.OWNER, "photos", "folder", self.folder)
        request = self.ledger.request(Role.OWNER, "Tidy the photos", project=project)
        self.task = self.ledger.add_task(Role.LEAD, request, "Tidy", "", (Criterion("index", exists="index.md"),),
                                         project=project, kind="host")
        self.book = undo.journal(self.paths, self.task)

    def files(self) -> dict[str, str]:
        return {path.relative_to(self.folder).as_posix(): path.read_text(encoding="utf-8")
                for path in sorted(self.folder.rglob("*")) if path.is_file()}

    def test_every_change_is_put_back_newest_first(self):
        (self.folder / "notes.txt").write_text("first\r\nsecond\n", encoding="utf-8", newline="")
        (self.folder / "old").mkdir()
        (self.folder / "old" / "a.jpg").write_text("A", encoding="utf-8")
        before = self.files()
        self.book.write(self.folder / "notes.txt", "rewritten\n")
        self.book.write(self.folder / "new" / "index.md", "# Index\n")
        self.book.move(self.folder / "notes.txt", self.folder / "archive" / "notes.txt")
        self.book.trash(self.folder / "old")
        self.book.write(self.folder / "notes.txt", "a new file where the old one was\n")
        self.assertEqual(self.files(), {"archive/notes.txt": "rewritten\n", "new/index.md": "# Index\n",
                                        "notes.txt": "a new file where the old one was\n"})
        lines = undo.restore(self.paths, self.task)
        self.assertEqual(len(lines), 5)
        self.assertTrue(lines[0].startswith("set aside"))
        self.assertEqual(self.files(), before)
        self.assertEqual((self.folder / "notes.txt").read_bytes(), b"first\r\nsecond\n")
        event = self.ledger.events()[-1]
        self.assertEqual((event["kind"], event["task_id"]), ("undo", self.task))

    def test_folders_the_task_made_go_again_and_folders_in_use_stay(self):
        for name in ("a.jpg", "b.jpg", "c.txt"):
            (self.folder / name).write_text(name, encoding="utf-8")
        tree = sorted(path.relative_to(self.folder).as_posix() for path in self.folder.rglob("*"))
        self.book.move(self.folder / "a.jpg", self.folder / "sorted" / "jpg" / "a.jpg")
        self.book.move(self.folder / "b.jpg", self.folder / "sorted" / "jpg" / "b.jpg")
        self.book.move(self.folder / "c.txt", self.folder / "sorted" / "txt" / "c.txt")
        (self.folder / "sorted" / "txt" / "yours.md").write_text("added by you", encoding="utf-8")
        undo.restore(self.paths, self.task)
        self.assertEqual(sorted(path.relative_to(self.folder).as_posix() for path in self.folder.rglob("*")),
                         sorted([*tree, "sorted", "sorted/txt", "sorted/txt/yours.md"]))

    def test_nothing_is_deleted_along_the_way(self):
        (self.folder / "keep.txt").write_text("original", encoding="utf-8")
        self.book.write(self.folder / "keep.txt", "edited")
        self.book.write(self.folder / "made.txt", "made by the task")
        undo.restore(self.paths, self.task)
        kept = sorted(path.read_text(encoding="utf-8") for path in self.book.folder.rglob("*")
                      if path.is_file() and path.name != "journal.jsonl")
        self.assertEqual(kept, ["edited", "made by the task"])

    def test_an_undo_runs_once_and_later_changes_start_a_new_round(self):
        self.book.write(self.folder / "a.txt", "1")
        self.assertEqual(len(undo.restore(self.paths, self.task)), 1)
        self.assertEqual(undo.restore(self.paths, self.task), [])
        self.book.write(self.folder / "b.txt", "2")
        self.assertEqual(undo.restore(self.paths, self.task), [f"set aside {self.folder / 'b.txt'}, which the task created "
                                                       f"(kept in {self.book.folder / 'set-aside' / '4-b.txt'})"])
        self.assertEqual(undo.restore(self.paths, 99), [])

    def test_a_file_changed_after_the_task_stops_the_whole_undo(self):
        (self.folder / "a.txt").write_text("original", encoding="utf-8")
        (self.folder / "old.txt").write_text("old", encoding="utf-8")
        self.book.write(self.folder / "a.txt", "by the task")
        self.book.move(self.folder / "old.txt", self.folder / "moved.txt")
        for change, name in ((lambda: (self.folder / "a.txt").write_text("by you", encoding="utf-8"), "a.txt"),
                             (lambda: (self.folder / "moved.txt").write_text("edited", encoding="utf-8"),
                              "moved.txt")):
            with self.subTest(name=name):
                change()
                with self.assertRaisesRegex(undo.Refused, rf"Nothing was put back: .*{name}.* changed after task"):
                    undo.restore(self.paths, self.task)
        self.assertEqual((self.folder / "a.txt").read_text(encoding="utf-8"), "by you")
        self.assertFalse((self.folder / "old.txt").exists())
        (self.folder / "a.txt").write_text("by the task", encoding="utf-8")
        (self.folder / "moved.txt").write_text("old", encoding="utf-8")
        self.assertEqual(len(undo.restore(self.paths, self.task)), 2)
        self.assertEqual(self.files(), {"a.txt": "original", "old.txt": "old"})

    def test_something_put_where_a_trashed_file_was_stops_the_undo(self):
        (self.folder / "old").mkdir()
        (self.folder / "old" / "a.jpg").write_text("A", encoding="utf-8")
        self.book.trash(self.folder / "old")
        (self.folder / "old").mkdir()
        with self.assertRaisesRegex(undo.Refused, "old"):
            undo.restore(self.paths, self.task)
        (self.folder / "old").rmdir()
        undo.restore(self.paths, self.task)
        self.assertEqual(self.files(), {"old/a.jpg": "A"})

    def test_a_move_never_overwrites(self):
        (self.folder / "a.txt").write_text("a", encoding="utf-8")
        (self.folder / "b.txt").write_text("b", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            self.book.move(self.folder / "a.txt", self.folder / "b.txt")
        self.assertEqual(self.files(), {"a.txt": "a", "b.txt": "b"})

    def test_a_line_cut_short_is_skipped(self):
        self.book.write(self.folder / "a.txt", "1")
        with self.book.log.open("a", encoding="utf-8") as stream:
            stream.write('{"op": "wri')
        self.assertEqual(len(self.book.pending()), 1)

    def test_the_command_reports_what_it_put_back(self):
        self.book.write(self.folder / "a.txt", "1")
        sub = argparse.ArgumentParser().add_subparsers()
        undo.add_commands(sub)
        args = sub.choices["undo"].parse_args([str(self.task)])
        paths = SimpleNamespace(from_env=lambda: self.paths)
        with patch.object(home, "Paths", paths), patch("builtins.print") as shown:
            self.assertEqual(args.func(args), 0)
            self.assertEqual(args.func(args), 0)
        self.assertIn("set aside", shown.call_args_list[0].args[0])
        self.assertEqual(shown.call_args_list[1].args[0], f"Nothing to undo for task {self.task}.")
        (self.folder / "a.txt").write_text("1", encoding="utf-8")
        self.book.write(self.folder / "a.txt", "2")
        (self.folder / "a.txt").write_text("3", encoding="utf-8")
        with patch.object(home, "Paths", paths), patch("sys.stderr") as errors:
            self.assertEqual(args.func(args), 1)
        self.assertIn("a.txt", "".join(call.args[0] for call in errors.write.call_args_list))


if __name__ == "__main__":
    unittest.main()
