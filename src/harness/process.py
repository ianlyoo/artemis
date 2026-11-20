"""Process environment for commands launched in a selected checkout."""

import os


def checkout_env() -> dict[str, str]:
    """Keep caller Git settings from selecting a different worktree or index."""
    return {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
