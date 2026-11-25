"""Read a command before it runs: is it money out, an irreversible delete, sending as you, opaque, or never run?

The patterns live in ARTEMIS_HOME/rules.toml (seeded from templates/rules.toml). Each is the start of an argv. They
are a tripwire: they recognise the usual ways of doing these things, not every way.
"""

from dataclasses import dataclass
from fnmatch import fnmatchcase
from importlib.resources import files
import os
from pathlib import Path, PureWindowsPath
import re
import tomllib

from .process import split_command
from .roles import Interrupt

SHELL = "powershell" if os.name == "nt" else "sh"
KINDS = ("deny", Interrupt.SPEND, Interrupt.DELETE, Interrupt.SEND, "opaque")    # the first that matches wins
INTERRUPTS = {"spend": Interrupt.SPEND, "send": Interrupt.SEND}       # a secret's kind, as the card it opens

SHELLS = {"sh": "sh", "bash": "sh", "zsh": "sh", "dash": "sh", "ksh": "sh", "cmd": "powershell",
          "powershell": "powershell", "pwsh": "powershell"}
WRAPPERS = {"env", "sudo", "doas", "nohup", "nice", "time", "command", "exec"}
SEPARATORS = re.compile(r"&&|\|\||[;|&\n\r]")
HIDDEN = re.compile(r"\$\(|`|\beval\b|\binvoke-expression\b|\biex\b", re.IGNORECASE)
HOME_VARIABLES = re.compile(r"^(\$HOME|\$\{HOME\}|\$env:USERPROFILE|%USERPROFILE%)", re.IGNORECASE)
DEPTH = 3


@dataclass(frozen=True)
class Match:
    kind: str | None    # an Interrupt, "deny", "opaque" or None
    rule: str = ""      # the pattern that matched, or why the command is denied or opaque


@dataclass(frozen=True)
class Rules:
    patterns: dict[str, tuple[tuple[str, ...], ...]]     # kind -> argv prefixes

    @classmethod
    def load(cls, paths) -> "Rules":
        """Read ARTEMIS_HOME/rules.toml, writing the template there first if it is missing."""
        if not paths.rules.exists():
            paths.rules.parent.mkdir(parents=True, exist_ok=True)
            paths.rules.write_text(files("artemis.templates").joinpath("rules.toml").read_text(encoding="utf-8"),
                                   encoding="utf-8")
        try:
            data = tomllib.loads(paths.rules.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as error:
            raise ValueError(f"rules.toml is not valid TOML: {error}") from None
        return cls.parse(data)

    @classmethod
    def parse(cls, data: dict) -> "Rules":
        patterns: dict[str, tuple[tuple[str, ...], ...]] = {kind: () for kind in KINDS}
        tables = []
        for section, table in data.items():
            if not isinstance(table, dict):
                raise ValueError(f"rules.toml: {section} must be a table.")
            if section in ("match", "learned"):     # [learned."<kind>"] is the block the guards you accepted write
                for kind, body in table.items():
                    if kind not in tuple(Interrupt) or not isinstance(body, dict):
                        raise ValueError(f"rules.toml has [{section}.{kind!r}]; the kinds are "
                                         f"{', '.join(map(repr, Interrupt))}.")
                    tables.append((f"{section}.{kind!r}", kind, body))
            elif section in ("deny", "opaque"):
                tables.append((section, section, table))
            else:
                raise ValueError(f"rules.toml has an unknown section [{section}].")
        for where, kind, body in tables:
            prefixes = body.get("argv", [])
            if set(body) - {"argv"} or not isinstance(prefixes, list) or not all(
                    isinstance(prefix, list) and prefix and all(isinstance(word, str) and word for word in prefix)
                    for prefix in prefixes):
                raise ValueError(f"rules.toml [{where}] needs argv = a list of argument lists.")
            patterns[kind] += tuple(tuple(prefix) for prefix in prefixes)
        return cls(patterns)


def classify(argv: list[str], shell: str, rules: Rules, *, cwd: Path | None = None,
             shell_ok: bool = False) -> Match:
    """The strongest kind any command in `argv` is. A shell given an inline command is denied unless `shell_ok`;
    with it, every command inside the code is read too. `cwd` places relative delete targets."""
    commands, hidden, refused = _expand(list(argv), shell, shell_ok, 0)
    if refused:
        return Match("deny", refused)
    for kind in KINDS:
        if kind == "opaque" and hidden:
            return Match("opaque", hidden)
        for words, dialect in commands:
            if rule := _matching(words, rules.patterns[kind], dialect):
                return Match(kind, rule)
            if kind == "deny" and _matching(words, rules.patterns[Interrupt.DELETE], dialect) and \
                    _deletes_a_root(words, dialect, cwd or Path.cwd()):
                return Match("deny", "a delete of a disk's root or your home folder")
    return Match(None)


def _matching(words: list[str], prefixes: tuple[tuple[str, ...], ...], dialect: str) -> str:
    return next((" ".join(prefix) for prefix in prefixes if words and _starts(words, prefix, dialect)), "")


def _starts(words: list[str], prefix: tuple[str, ...], dialect: str, at: int = 0) -> bool:
    if not prefix:
        return True
    head, rest = prefix[0], prefix[1:]
    if head == "**":
        return any(_starts(words[skip:], rest, dialect, at + 1) for skip in range(len(words) + 1))
    if not words:
        return False
    fold = at == 0 or dialect == "powershell"      # program names, and every argument on Windows
    word, glob = (words[0].lower(), head.lower()) if fold else (words[0], head)
    return fnmatchcase(word, glob) and _starts(words[1:], rest, dialect, at + 1)


def _expand(argv: list[str], shell: str, shell_ok: bool,
            depth: int) -> tuple[list[tuple[list[str], str]], str, str]:
    """(words, dialect) for the command and, for a shell given inline code, for every command in that code; why the
    code hides what it runs; and why the command is refused ("" when it is not)."""
    words = _unwrapped(argv)
    inline = _inline(words)
    if inline is None:
        return [(words, shell)], "", ""
    if not shell_ok:
        return [], "", f"{words[0]} with an inline command, which this project does not allow (shell = true)"
    code, dialect = inline
    if code is None:
        return [], "an encoded command", ""
    commands, hidden, refused = [], "", ""      # the shell only carries the code: what counts is what it runs
    for segment in filter(None, (part.strip() for part in SEPARATORS.split(code))):
        if marker := HIDDEN.search(segment):
            hidden = hidden or f"inline code uses {marker.group(0)}"
        if depth < DEPTH:
            inner, deeper, why = _expand(_words(segment, dialect), dialect, shell_ok, depth + 1)
            commands, hidden, refused = commands + inner, hidden or deeper, refused or why
        else:
            commands.append((_unwrapped(_words(segment, dialect)), dialect))
            hidden = hidden or "shells nested too deep"
    return commands, hidden, refused


def _program(word: str) -> str:
    name = re.split(r"[\\/]", word)[-1]
    return re.sub(r"\.(exe|cmd|bat|com)$", "", name, flags=re.IGNORECASE)


def _unwrapped(argv: list[str]) -> list[str]:
    """argv with leading VAR=value words and env/sudo/nohup (with their options) dropped, the program bare."""
    words = list(argv)
    while words and (re.match(r"[A-Za-z_]\w*=", words[0]) or _program(words[0]).lower() in WRAPPERS):
        words = words[1:]
        while words and words[0].startswith("-"):
            words = words[1:]
    return [_program(words[0]), *words[1:]] if words else []


def _inline(words: list[str]) -> tuple[str | None, str] | None:
    """(code, dialect) when the program is a shell given a command inline; code is None when it is encoded."""
    if not words or words[0].lower() not in SHELLS:
        return None
    name, args = words[0].lower(), words[1:]
    if SHELLS[name] == "sh":
        flag = next((i for i, arg in enumerate(args) if re.fullmatch(r"-[a-zA-Z]*c[a-zA-Z]*", arg)), None)
        return None if flag is None else (" ".join(args[flag + 1:flag + 2]), "sh")
    if name == "cmd":
        flag = next((i for i, arg in enumerate(args) if arg.lower() in ("/c", "/k", "/r")), None)
        return None if flag is None else (" ".join(args[flag + 1:]), "powershell")
    for i, arg in enumerate(args):
        low = arg.lower()
        if low in ("-e", "-ec") or (len(low) > 3 and "-encodedcommand".startswith(low)):
            return None, "powershell"
        if low == "-c" or (len(low) > 3 and "-command".startswith(low)):
            return " ".join(args[i + 1:]), "powershell"
        if low in ("-f", "-file") or (len(low) > 2 and "-file".startswith(low)):
            return None
        if not arg.startswith("-"):     # Windows PowerShell reads a bare argument as a command, pwsh as a file
            return (" ".join(args[i:]), "powershell") if name == "powershell" else None
    return None


def _deletes_a_root(words: list[str], dialect: str, cwd: Path) -> bool:
    home = Path(os.path.realpath(Path.home()))
    for arg in words[1:]:
        if arg.startswith("-") or (dialect == "powershell" and re.fullmatch(r"/[a-zA-Z?]+", arg)):
            continue
        text = HOME_VARIABLES.sub("~", arg).rstrip("*") or "."
        if dialect == "powershell" and PureWindowsPath(text).anchor and \
                PureWindowsPath(text) == PureWindowsPath(PureWindowsPath(text).anchor):
            return True         # C:\ or \ named in Windows terms, wherever this runs
        path = Path(os.path.expanduser(text))
        target = Path(os.path.realpath(path if path.is_absolute() else cwd / path))
        if target == Path(target.anchor) or target == home:
            return True
    return False


def _words(segment: str, dialect: str) -> list[str]:
    """Inline code split as the shell that runs it would: PowerShell and cmd keep a backslash literal."""
    try:
        return split_command(segment, windows=dialect == "powershell")
    except ValueError:      # unbalanced quotes: still match the words that are there
        return segment.split()
