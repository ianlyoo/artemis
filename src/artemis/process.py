"""Process environment for commands launched in a selected checkout."""

import os
import shutil
import sys


def checkout_env() -> dict[str, str]:
    """Keep caller Git settings from selecting a different worktree or index."""
    return {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}


# Checks run code a worker wrote. They see only these variables (and LC_*), plus what [ship] pass_env names,
# so tokens and keys in your shell stay out of reach of that code.
CHECK_ENV = {
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LANGUAGE", "TERM", "TZ", "TMPDIR", "TMP", "TEMP",
    "VIRTUAL_ENV", "PYTHONPATH", "JAVA_HOME", "GOPATH", "GOROOT", "GOCACHE", "GOMODCACHE", "CARGO_HOME",
    "RUSTUP_HOME", "NODE_PATH", "NVM_DIR", "PYENV_ROOT", "CONDA_PREFIX", "XDG_CACHE_HOME", "XDG_CONFIG_HOME",
    "XDG_DATA_HOME", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "APPDATA",
    "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "NUMBER_OF_PROCESSORS",
}


def check_env(pass_env: tuple[str, ...] = ()) -> dict[str, str]:
    keep = CHECK_ENV | set(pass_env)
    return {key: value for key, value in os.environ.items()
            if (key.upper() in keep or key in keep or key.startswith("LC_")) and not key.startswith("GIT_")}


def executable(argv: tuple[str, ...]) -> str | None:
    """Run a bare python or python3 with this interpreter when the name is not on PATH."""
    if argv and argv[0] in {"python", "python3"} and shutil.which(argv[0]) is None:
        return sys.executable
    return None
