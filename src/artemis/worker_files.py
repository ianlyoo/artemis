"""Bounded file access for workers that do not have a general shell."""

from pathlib import Path
import subprocess

from .roles import WorkflowError

FILE_BYTES = 64 * 1024
SNAPSHOT_BYTES = 256 * 1024
RESERVED = {".git", ".artemis"}


def worker_path(root: Path, name: str) -> Path:
    parts = name.split("/")
    if any(part in {"", ".", ".."} or part.casefold() in RESERVED for part in parts) or any(
            char in name for char in ("\\", ":", "\0")):
        raise WorkflowError("Worker paths must be relative files outside Git and Artemis state.")
    target = root
    for part in parts:
        if target.exists() and not target.is_dir():
            raise WorkflowError("A worker path has a non-directory parent.")
        target /= part
        if target.is_symlink():
            raise WorkflowError("Worker paths cannot follow symlinks.")
    if target.exists() and not target.is_file():
        raise WorkflowError("Worker paths must name regular files.")
    return target


def tracked_paths(root: Path) -> list[str]:
    data = subprocess.check_output(("git", "ls-files", "-z"), cwd=root)
    return [name.decode("utf-8") for name in dict.fromkeys(data.split(b"\0")) if name and valid_utf8(name)]


def valid_utf8(data: bytes) -> bool:
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def read_text(path: Path, limit: int = FILE_BYTES) -> str:
    with path.open("rb") as stream:
        content = stream.read(limit + 1)
    if len(content) > limit or b"\0" in content:
        raise WorkflowError("File exceeds the text read limit or is binary.")
    return content.decode("utf-8")


def snapshot(root: Path, *, exclude: str) -> dict[str, str]:
    result = {}
    remaining = SNAPSHOT_BYTES
    for name in tracked_paths(root):
        cost = len(name.encode("utf-8"))
        if cost >= remaining or exclude in name:
            continue
        try:
            text = read_text(worker_path(root, name), min(FILE_BYTES, remaining - cost))
        except (WorkflowError, OSError, UnicodeError):
            continue
        if exclude in text:
            continue
        result[name] = text
        remaining -= cost + len(text.encode("utf-8"))
    return result
