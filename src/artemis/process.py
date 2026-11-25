"""Child processes: the environment they see, their own process group, and ending them as a whole tree."""

from functools import cache
import os
from pathlib import Path, PureWindowsPath
import shlex
import shutil
import signal
import subprocess
import sys
import time


WINDOWS = os.name == "nt"
# Windows process creation flags (the values of subprocess.CREATE_NEW_PROCESS_GROUP and DETACHED_PROCESS there).
CREATE_NEW_PROCESS_GROUP = 0x00000200
DETACHED_PROCESS = 0x00000008
GRACE_S = 5.0
# Artemis reads what every child prints as UTF-8 and asks each one to print UTF-8, so no reader has to guess a
# console code page (cp1252 and the like on Windows). Python follows this variable for its standard streams only;
# how a program opens its own files stays as it is in your shell.
UTF8_STREAMS = {"PYTHONIOENCODING": "utf-8"}


def checkout_env() -> dict[str, str]:
    """For Git run by Artemis: no caller Git settings (they could select another worktree or index), and no
    ARTEMIS_* variable, since a repository's hooks run with this environment."""
    return {key: value for key, value in os.environ.items() if not key.startswith(("GIT_", "ARTEMIS_"))} | UTF8_STREAMS


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
            if (key.upper() in keep or key in keep or key.startswith("LC_")) and not key.startswith("GIT_")
            } | UTF8_STREAMS


# Agents run as you and keep their login in your profile, so besides the check variables they see the folders
# and settings a CLI reads its login and certificates from, proxies, and their own provider's variables.
# Nothing else from the home's environment reaches them; no ARTEMIS_* variable (the vault passphrase among them)
# unless Artemis sets it for that run on purpose.
AGENT_ENV = {
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE",
    "NODE_EXTRA_CA_CERTS", "COLORTERM", "HOMEDRIVE", "HOMEPATH", "USERNAME", "COMPUTERNAME", "PROGRAMFILES(X86)",
}
AGENT_PREFIXES = ("XDG_", "LC_")
PROVIDER_PREFIXES = {
    "claude": ("ANTHROPIC_", "CLAUDE_"),
    "codex": ("OPENAI_", "CODEX_"),
    "gemini": ("GEMINI_", "GOOGLE_"),
    "opencode": ("OPENCODE_",),
    "mock": ("ARTEMIS_MOCK_",),
}


def agent_env(provider: str) -> dict[str, str]:
    """The environment an agent of this provider starts from; its launch adds what that run needs."""
    keep = CHECK_ENV | AGENT_ENV
    own = PROVIDER_PREFIXES.get(provider, ())
    return {key: value for key, value in os.environ.items()
            if key.upper().startswith(own) or (
                (key.upper() in keep or key.upper().startswith(AGENT_PREFIXES))
                and not key.upper().startswith(("GIT_", "ARTEMIS_")))} | UTF8_STREAMS


def executable(argv: tuple[str, ...]) -> str | None:
    """Run a bare python or python3 with this interpreter when that name runs no Python here: it is not on PATH, or
    it is Windows' Store alias, which only offers to install one."""
    if argv and argv[0] in {"python", "python3"} and not _runs_python(shutil.which(argv[0])):
        return sys.executable
    return None


@cache
def _runs_python(found: str | None) -> bool:
    """Whether this program file is a Python. Windows puts python.exe and python3.exe aliases in WindowsApps on every
    PATH; until Python comes from the Store they print where to get it and exit 9009, so those are tried once."""
    if found is None:
        return False
    if not WINDOWS or PureWindowsPath(found).parent.name.lower() != "windowsapps":
        return True
    try:
        return subprocess.run([found, "-c", ""], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, timeout=30, check=False).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def split_command(text: str, windows: bool | None = None) -> list[str]:
    """A command line as this system's programs split it (or Windows' when `windows` says so): on Windows a backslash
    is literal unless it comes before a quote, so C:\\tools\\lint.exe stays whole; elsewhere POSIX shell words."""
    return _windows_split(text) if (WINDOWS if windows is None else windows) else shlex.split(text)


def join_command(argv) -> str:
    """The reverse of split_command: one line a person can read and paste on this system."""
    return subprocess.list2cmdline(argv) if WINDOWS else shlex.join(argv)


def _windows_split(text: str) -> list[str]:
    """The Microsoft C runtime's rules, as subprocess.list2cmdline writes for them: 2n backslashes before a quote
    are n backslashes and the quote opens or closes; 2n+1 are n and a literal quote; other backslashes are kept."""
    words: list[str] = []
    word, quoted, slashes, begun = "", False, 0, False
    for char in text:
        if char == "\\":
            slashes += 1
            continue
        if char == '"':
            word += "\\" * (slashes // 2) + ('"' if slashes % 2 else "")
            quoted = quoted if slashes % 2 else not quoted
            slashes, begun = 0, True
            continue
        if slashes:
            word, slashes, begun = word + "\\" * slashes, 0, True
        if char in " \t" and not quoted:
            if begun:
                words.append(word)
            word, begun = "", False
        else:
            word, begun = word + char, True
    if slashes or begun:
        words.append(word + "\\" * slashes)
    return words


def shell() -> str:
    """The shell a command line is written for on this machine: rules and cards name it."""
    return "powershell" if WINDOWS else "sh"


def group() -> dict:
    """Popen options that start a child in a process group of its own, so the whole tree can be ended."""
    return {"creationflags": CREATE_NEW_PROCESS_GROUP} if WINDOWS else {"start_new_session": True}


def detached() -> dict:
    """Popen options for a child that outlives this terminal: its own group, no console attached."""
    return ({"creationflags": CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS} if WINDOWS
            else {"start_new_session": True})


def kill_tree(process: subprocess.Popen, grace_s: float = GRACE_S) -> None:
    """End a child started with group() and everything it started.

    POSIX: SIGTERM to the group, then SIGKILL to whatever is left once the child exits or grace_s passes.
    Windows: taskkill /T /F ends the tree at once.
    """
    if WINDOWS:
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdin=subprocess.DEVNULL,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        try:
            process.wait(timeout=grace_s)
        except subprocess.TimeoutExpired:
            process.kill()
        return
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(process.pid, sig)
        except (ProcessLookupError, PermissionError):
            pass  # the group is already gone
        try:
            process.wait(timeout=grace_s)
        except subprocess.TimeoutExpired:
            continue


# A crashed home leaves its workers running. The next home ends one only while its process id still names the
# process that started for that run: the id plus the time the process started, which a later process given the
# same id does not share.

def started(pid: int) -> str | None:
    """When the process with this id started, as a token to compare later; None when no such process runs (or
    this system does not say)."""
    if WINDOWS:
        handle = _open_process(pid)
        if handle is None:
            return None
        try:
            return _created(handle)
        finally:
            _kernel32().CloseHandle(handle)
    if Path("/proc/self/stat").exists():
        return _proc_started(pid)
    return _ps_started(pid)


def end_if_same(pid: int, start: str, grace_s: float = GRACE_S) -> bool:
    """End the process tree of pid if it is still the process that started at `start`. True when it was ended.

    Windows: the process handle is held from the check through taskkill /T /F until the process has exited (or
    grace_s passes), so the id cannot pass to another process in between and its files are closed on return.
    POSIX: SIGTERM to its group (a worker leads its own), SIGKILL to what is left after grace_s.
    """
    if WINDOWS:
        handle = _open_process(pid)
        if handle is None:
            return False
        try:
            if _created(handle) != start:
                return False
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], stdin=subprocess.DEVNULL,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            _kernel32().WaitForSingleObject(handle, int(grace_s * 1000))
            return True
        finally:
            _kernel32().CloseHandle(handle)
    if started(pid) != start:
        return False
    try:
        leads = os.getpgid(pid) == pid
    except ProcessLookupError:
        return False
    send = os.killpg if leads else os.kill
    deadline = time.monotonic() + grace_s
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            send(pid, sig)
        except (ProcessLookupError, PermissionError):
            break
        while started(pid) == start and time.monotonic() < deadline:
            time.sleep(0.1)
        if sig == signal.SIGTERM and started(pid) not in (None, start):
            break   # the id names another process already: nothing more is sent to it
    return True


def _proc_started(pid: int, proc: Path = Path("/proc")) -> str | None:
    """Linux: the boot's id and the process's start time in clock ticks since that boot (stat field 22)."""
    try:
        stat = (proc / str(pid) / "stat").read_text(encoding="utf-8", errors="replace")
        boot = (proc / "sys" / "kernel" / "random" / "boot_id").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    fields = stat.rpartition(")")[2].split()   # the name in parentheses may hold spaces; fields from 3 on follow
    return f"{boot}:{fields[19]}" if len(fields) > 19 else None


def _ps_started(pid: int) -> str | None:
    """macOS and other POSIX systems: the start time ps reports, to the second."""
    try:
        done = subprocess.run(["ps", "-o", "lstart=", "-p", str(pid)], capture_output=True, text=True,
                              encoding="utf-8", env=os.environ | {"LC_ALL": "C"}, timeout=10, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    said = " ".join(done.stdout.split())
    return said if done.returncode == 0 and said else None


STILL_ACTIVE = 259
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
SYNCHRONIZE = 0x00100000          # lets WaitForSingleObject wait for the process to exit


def _kernel32():
    """Windows: kernel32 with the signatures used here (ctypes, so no dependency beyond Python)."""
    import ctypes
    from ctypes import wintypes
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.GetProcessTimes.argtypes = (wintypes.HANDLE, *(ctypes.POINTER(wintypes.FILETIME),) * 4)
    kernel32.GetProcessTimes.restype = wintypes.BOOL
    kernel32.GetExitCodeProcess.argtypes = (wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD))
    kernel32.GetExitCodeProcess.restype = wintypes.BOOL
    kernel32.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
    kernel32.WaitForSingleObject.restype = wintypes.DWORD
    kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel32.CloseHandle.restype = wintypes.BOOL
    return kernel32


def _open_process(pid: int):
    return _kernel32().OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, False, pid) or None


def _created(handle) -> str | None:
    """Windows: the creation time of a process that still runs, in 100 ns units since 1601."""
    import ctypes
    from ctypes import wintypes
    kernel32 = _kernel32()
    times = [wintypes.FILETIME() for _ in range(4)]
    code = wintypes.DWORD()
    if not kernel32.GetProcessTimes(handle, *(ctypes.byref(item) for item in times)):
        return None
    if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value != STILL_ACTIVE:
        return None
    return str(times[0].dwHighDateTime << 32 | times[0].dwLowDateTime)
