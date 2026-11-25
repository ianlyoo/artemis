"""The journal behind Artemis's host file tools, and `artemis undo <task>`, which puts every change back.

Nothing here deletes. A trashed file, the old text a write replaced, and anything an undo has to move out of the
way all go into the task's undo folder, ARTEMIS_HOME/undo/task-N/. Each journal line also records what the change
left behind, so an undo can tell when a file was changed again after the task, and then refuses, naming it.
"""

from dataclasses import dataclass
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import sys
import threading
import time

from .ledger import Ledger
from .roles import Role

_lock = threading.Lock()       # one journal line and its saved copy at a time


class Refused(Exception):
    """An undo that would overwrite changes made after the task. Nothing was put back."""


@dataclass(frozen=True)
class Journal:
    folder: Path

    @property
    def log(self) -> Path:
        return self.folder / "journal.jsonl"

    def write(self, target: Path, content: str) -> None:
        """Write `content` to `target`, keeping a copy of the text it replaces."""
        with _lock:
            saved = self._copy(target) if target.exists() else None
            self._append("write", path=str(target), saved=saved,
                         left=sha256(content.encode("utf-8")).hexdigest(), made=_missing(target.parent))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8", newline="")

    def move(self, src: Path, dst: Path) -> None:
        if dst.exists():
            raise FileExistsError(f"{dst.name} already exists; trash it first or choose another name.")
        with _lock:
            self._append("move", src=str(src), dst=str(dst), left=_state(src), made=_missing(dst.parent))
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(src, dst)

    def trash(self, target: Path) -> None:
        """Move `target` (a file or a folder) into the undo folder."""
        with _lock:
            saved = self._slot("trash", target.name)
            self._append("trash", path=str(target), saved=str(saved))
        shutil.move(target, saved)

    def pending(self) -> list[dict]:
        """The changes since the last undo, oldest first."""
        entries = []
        if self.log.exists():
            for line in self.log.read_text(encoding="utf-8").splitlines():
                try:
                    entry = json.loads(line)
                except ValueError:       # a line cut short by a crash
                    continue
                entries = [] if entry.get("op") == "undone" else [*entries, entry]
        return entries

    def _slot(self, kind: str, name: str) -> Path:
        """A fresh place in the undo folder, numbered by the journal line it belongs to."""
        folder = self.folder / kind
        folder.mkdir(parents=True, exist_ok=True)
        number = len(self.log.read_bytes().splitlines()) + 1 if self.log.exists() else 1
        while (folder / f"{number}-{name}").exists():
            number += 1
        return folder / f"{number}-{name}"

    def _copy(self, target: Path) -> str:
        saved = self._slot("replaced", target.name)
        shutil.copy2(target, saved)
        return str(saved)

    def _append(self, op: str, **fields) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        with self.log.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps({"op": op, "at": time.time(), **fields}) + "\n")

    def set_aside(self, path: Path) -> Path:
        """Move whatever is at `path` into the undo folder so something can be put back there."""
        slot = self._slot("set-aside", path.name)
        shutil.move(path, slot)
        return slot


def journal(paths, task: int) -> Journal:
    return Journal(paths.undo / f"task-{task}")


def restore(paths, task: int) -> list[str]:
    """Put back every change since the last undo, newest first. Returns one line per change. Raises Refused, and
    changes nothing, when a file the task changed was changed again since."""
    book = journal(paths, task)
    with _lock:
        pending = book.pending()
        changed = [path for path, left in _left(pending).items() if _state(Path(path)) != left]
        if changed:
            raise Refused(f"Nothing was put back: {', '.join(changed)} changed after task {task}. Put "
                          f"{'it' if len(changed) == 1 else 'them'} back as the task left "
                          f"{'it' if len(changed) == 1 else 'them'}, or restore by hand from {book.folder}.")
        lines = [_restore(book, entry) for entry in reversed(pending)]
        if lines:
            book._append("undone")
    if lines:
        Ledger(paths.ledger).record(Role.OWNER, "undo", f"put back {len(lines)} file change(s)", task=task,
                                    data={"lines": lines})
    return lines


def _missing(folder: Path) -> list[str]:
    """The folders a change is about to create for its file, outermost first, so an undo can remove them again."""
    made = []
    while not folder.exists() and folder.parent != folder:
        made.insert(0, str(folder))
        folder = folder.parent
    return made


def _unmake(entry: dict) -> None:
    """Remove the folders the change created, innermost first, each only while it is empty."""
    for folder in reversed(entry.get("made", ())):
        try:
            Path(folder).rmdir()
        except OSError:          # something else is in it now, or it is already gone: leave it
            return


def _state(path: Path) -> str | None:
    """A digest of what is at `path`: a file's bytes, or a folder's names and bytes; None when nothing is there."""
    if not path.exists():
        return None
    if path.is_file():
        return _hash(path)
    lines = sorted(f"{Path(folder, name).relative_to(path).as_posix()}\0{_hash(Path(folder, name))}"
                   for folder, _, names in os.walk(path) for name in names)
    return "folder:" + sha256("\n".join(lines).encode("utf-8")).hexdigest()


def _hash(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        while block := stream.read(1 << 20):
            digest.update(block)
    return digest.hexdigest()


def _left(entries: list[dict]) -> dict[str, str | None]:
    """What the task left at each path it touched, replaying the journal from the oldest change."""
    left: dict[str, str | None] = {}
    for entry in entries:
        match entry["op"]:
            case "write":
                left[entry["path"]] = entry["left"]
            case "move":
                left[entry["dst"]] = left.get(entry["src"], entry["left"])
                left[entry["src"]] = None
            case "trash":
                left[entry["path"]] = None
    return left


def _restore(book: Journal, entry: dict) -> str:
    def clear(path: Path) -> str:
        return f" (what was there is kept in {book.set_aside(path)})" if path.exists() else ""

    match entry["op"]:
        case "write" if entry["saved"]:
            path = Path(entry["path"])
            kept = clear(path)
            shutil.move(entry["saved"], path)
            return f"restored {path}{kept}"
        case "write":
            path = Path(entry["path"])
            if not path.exists():
                return f"{path} is already gone"
            kept = book.set_aside(path)
            _unmake(entry)
            return f"set aside {path}, which the task created (kept in {kept})"
        case "move":
            src, dst = Path(entry["src"]), Path(entry["dst"])
            if not dst.exists():
                return f"could not find {dst} to move back"
            kept = clear(src)
            shutil.move(dst, src)
            _unmake(entry)
            return f"moved {dst} back to {src}{kept}"
        case "trash":
            path, saved = Path(entry["path"]), Path(entry["saved"])
            if not saved.exists():
                return f"could not find the trashed copy of {path}"
            kept = clear(path)
            shutil.move(saved, path)
            return f"put back {path}{kept}"
    return f"skipped an unknown change: {entry['op']}"


def add_commands(sub) -> None:
    """`artemis undo <task>` for the CLI's subparsers."""
    parser = sub.add_parser("undo", help="Put back every file change Artemis made for a host task, newest first.")
    parser.add_argument("task", type=int)
    parser.set_defaults(func=_command)


def _command(args) -> int:
    from .home import Paths     # imported here: home imports the broker, which imports this module
    try:
        lines = restore(Paths.from_env(), args.task)
    except Refused as error:
        print(error, file=sys.stderr)
        return 1
    print("\n".join(lines) if lines else f"Nothing to undo for task {args.task}.")
    return 0
