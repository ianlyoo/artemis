"""Process environment for commands launched in a selected checkout."""

import os
import shutil
import sys


def checkout_env() -> dict[str, str]:
    """Keep caller Git settings from selecting a different worktree or index."""
    return {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}


def executable(argv: tuple[str, ...]) -> str | None:
    """Run a bare python or python3 with this interpreter when the name is not on PATH."""
    if argv and argv[0] in {"python", "python3"} and shutil.which(argv[0]) is None:
        return sys.executable
    return None
