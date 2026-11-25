"""Each provider's headless argv, per-run config and output reading.

The fence is the same idea everywhere: the provider's own shell and code-running tools are off, file tools are
read-only outside a repo worktree, and the Artemis tools arrive over MCP. Config files go in the run's scratch
folder, never in the user's files or the provider's global config.
"""

from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from functools import cache
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from .roles import WorkflowError


@dataclass(frozen=True)
class Launch:
    argv: list[str]
    env: dict[str, str]             # added to the supervisor's environment
    stdin: str
    decode: Callable[[str], str]    # stdout text -> the final reply (the worker's claim)


@dataclass(frozen=True)
class Spec:
    role: str                       # worker | lead
    mode: str                       # repo: edit files in the worktree; host: no native file access at all
    cwd: Path
    prompt: str
    mcp: list[str]                  # the command that serves the Artemis tools; empty for a tool-less turn
    config: object
    vault: object
    scratch: Path                   # this run's own folder for config files
    instructions: str


@dataclass(frozen=True)
class Turn:
    reply: str
    tokens: int = 0                 # about how much context the turn used


# The Artemis tool names each role is given (CONTRACTS §13 A and F); a fence that allows tools one by one uses these.
WORKER_TOOLS = ("run", "job", "job_stop", "http_request", "read_file", "list_dir", "search", "write_file", "move",
                "trash", "secret_names", "secret_request", "ask", "note", "check")
LEAD_TOOLS = ("projects", "status", "evidence", "read_file", "list_dir", "search", "task_create", "task_retry",
              "task_drop", "schedule", "ask", "secret_request", "lesson", "note")


def section(config, name: str) -> Mapping:
    """One config.toml section as a mapping, whether the config holds it as a table or as attributes."""
    value = getattr(config, name, None)
    if value is None or isinstance(value, Mapping):
        return value or {}
    return dict(vars(value))


def setting(config, name: str, key: str, default=None):
    value = section(config, name).get(key)
    return default if value in (None, "") else value


def keys(vault, *names: str) -> dict[str, str]:
    """The named secrets the vault holds, as environment variables for one child process."""
    held = [name for name in names if vault is not None and vault.info(name) is not None]
    return vault.env(held) if held else {}


def _write(spec: Spec, name: str, text: str) -> Path:
    path = spec.scratch / name
    path.write_text(text, encoding="utf-8")
    return path


def _edits(spec: Spec) -> bool:
    return spec.role == "worker" and spec.mode == "repo"


def _with_instructions(spec: Spec) -> str:
    return f"{spec.instructions.strip()}\n\n{spec.prompt}" if spec.instructions else spec.prompt


# Claude Code: an allowlist of native tools, confined to the working folder by --restricted

def claude(spec: Spec) -> Launch:
    argv = ["claude", "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
            "--restricted", "--tools", "Read,Glob,Grep,Edit,Write" if _edits(spec) else "",
            "--strict-mcp-config", "--permission-prompts", "none", "--no-chrome", "--disable-slash-commands"]
    if _edits(spec):
        argv += ["--permission-mode", "acceptEdits"]
    if spec.mcp:
        servers = {"mcpServers": {"artemis": {"command": spec.mcp[0], "args": spec.mcp[1:]}}}
        argv += ["--mcp-config", str(_write(spec, "mcp.json", json.dumps(servers, indent=2))),
                 "--allowedTools", "mcp__artemis__*"]
    if spec.instructions:
        argv += ["--append-system-prompt-file", str(_write(spec, "instructions.md", spec.instructions))]
    if spec.role == "lead":
        argv += ["--include-partial-messages"]
    return Launch(argv, {}, spec.prompt, lambda text: claude_turn(text).reply)


# Codex: its OS sandbox, with everything besides patching files and calling MCP tools switched off

# Checked against the installed version, because an unknown name stops Codex. unified_exec cannot be switched off;
# qualification decides whether Codex may lead or take host work. code_mode (the model writing code that calls tools)
# is off; code_mode_host stays on, because Codex carries every MCP tool call through it.
CODEX_OFF = ("shell_tool", "multi_agent", "apps", "plugins", "hooks", "view_image", "image_generation", "browser_use",
             "browser_use_external", "browser_use_full_cdp_access", "in_app_browser", "in_app_local_automation",
             "computer_use", "code_mode", "sleep_tool", "goals")


@cache
def codex_features(executable: str) -> dict[str, bool]:
    """Every feature the installed Codex lists (removed ones aside), and whether it is on."""
    try:
        listed = subprocess.run((executable, "features", "list"), capture_output=True, text=True, encoding="utf-8",
                                errors="replace", timeout=30, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    return {parts[0]: parts[-1] == "true" for parts in map(str.split, listed.splitlines())
            if len(parts) >= 3 and parts[1] != "removed"}


def codex(spec: Spec) -> Launch:
    known = codex_features(shutil.which("codex") or "codex")
    argv = ["codex", "-a", "never"]
    for feature in CODEX_OFF:
        if feature in known:
            argv += ["--disable", feature]
    overrides: dict = {"web_search": "disabled", "projects": {str(spec.cwd): {"trust_level": "untrusted"}}}
    if _edits(spec):
        overrides |= {"sandbox_workspace_write.writable_roots": [], "sandbox_workspace_write.network_access": False,
                      "sandbox_workspace_write.exclude_slash_tmp": True,
                      "sandbox_workspace_write.exclude_tmpdir_env_var": True}
    if spec.mcp:
        # Codex starts MCP servers with only a few variables; from a source checkout, Artemis's needs PYTHONPATH.
        overrides |= {"mcp_servers.artemis.command": spec.mcp[0], "mcp_servers.artemis.args": spec.mcp[1:],
                      "mcp_servers.artemis.env_vars": ["PYTHONPATH"], "mcp_servers.artemis.required": True,
                      "mcp_servers.artemis.tool_timeout_sec": 120,
                      "mcp_servers.artemis.default_tools_approval_mode": "approve"}
    for key, value in overrides.items():
        argv += ["-c", f"{key}={_toml(value)}"]
    sandbox = ["workspace-write", "-C", os.path.realpath(spec.cwd)] if _edits(spec) else ["read-only"]
    argv += ["exec", "--json", "--ephemeral", "--sandbox", *sandbox, "--skip-git-repo-check", "--ignore-user-config",
             "--ignore-rules", "-"]
    # Instructions go on stdin: on Windows the npm shim is a .cmd, and cmd.exe mangles free text in arguments.
    return Launch(argv, {}, _with_instructions(spec), lambda text: codex_turn(text).reply)


def _toml(value: object) -> str:
    """A -c value: TOML, which for strings, numbers, booleans and arrays is what JSON writes."""
    if isinstance(value, dict):
        return "{" + ", ".join(f"{json.dumps(key)} = {_toml(item)}" for key, item in value.items()) + "}"
    return json.dumps(value)


# Gemini CLI: a default-deny admin policy (--admin-policy) that allows the Artemis tools one by one. Gemini reads
# system settings only from a folder root owns, so the rest goes in a Gemini home of the run's own (GEMINI_CLI_HOME),
# which also keeps the person's own Gemini settings, hooks and MCP servers out; it signs in with the vault key.
# Headless Gemini runs only in a trusted folder, whose own .gemini settings merge above that home: Artemis trusts a
# project's settings as it trusts the checks it runs. Hooks stay off unless those settings turn them back on.

GEMINI_FILE_TOOLS = ("read_file", "read_many_files", "list_directory", "glob", "grep_search", "replace", "write_file")


def gemini(spec: Spec) -> Launch:
    native = list(GEMINI_FILE_TOOLS) if _edits(spec) else []
    verbs = (LEAD_TOOLS if spec.role == "lead" else WORKER_TOOLS) if spec.mcp else ()
    rules = ['[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 100\n']
    rules += [f'[[rule]]\nmcpName = "artemis"\ntoolName = "{verb}"\ndecision = "allow"\npriority = 200\n'
              for verb in verbs]
    rules += [f'[[rule]]\ntoolName = "{tool}"\ndecision = "allow"\npriority = 200\n' for tool in native]
    settings: dict = {"tools": {"core": native}, "hooksConfig": {"enabled": False},
                      "security": {"auth": {"selectedType": "gemini-api-key"}}}
    if spec.mcp:
        settings |= {"mcpServers": {"artemis": {"command": spec.mcp[0], "args": spec.mcp[1:], "trust": True}},
                     "mcp": {"allowed": ["artemis"]}}
    home = spec.scratch / "gemini-home"
    (home / ".gemini").mkdir(parents=True, exist_ok=True)
    (home / ".gemini" / "settings.json").write_text(json.dumps(settings, indent=2), encoding="utf-8")
    env = keys(spec.vault, "GEMINI_API_KEY") | {"GEMINI_CLI_HOME": str(home)}
    if any(os.environ.get(name) for name in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy")):
        env["NODE_USE_ENV_PROXY"] = "1"
    argv = ["gemini", "-p", "Use the task on stdin", "--output-format", "stream-json", "--allowed-mcp-server-names",
            "artemis", "--admin-policy", str(_write(spec, "policy.toml", "\n".join(rules))), "-e", "none", "--skip-trust"]
    model = setting(spec.config, "gemini", "model")
    argv += ["-m", model] if model else []
    return Launch(argv, env, _with_instructions(spec), lambda text: gemini_turn(text).reply)


# OpenCode: deny-first permission rules

OPENCODE_KEYS = {"google": ("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY")}


def opencode_keys(model: str) -> list[tuple[str, str]]:
    """(vault name, the variable OpenCode reads) for the model's provider."""
    maker = model.split("/", 1)[0] if "/" in model else ""
    if not maker:
        return []
    name = f"{maker.upper().replace('-', '_')}_API_KEY"
    return [OPENCODE_KEYS.get(maker, (name, name))]


def opencode(spec: Spec) -> Launch:
    rules = {"*": "deny", "read": "allow", "glob": "allow", "grep": "allow", "list": "allow"}
    rules |= {"edit": "allow"} if _edits(spec) else {}
    rules |= {"artemis_*": "allow"} if spec.mcp else {}
    model = setting(spec.config, "opencode", "model", "")
    profile: dict = {"agent": {"artemis-worker": {"mode": "primary", "permission": rules}}, "permission": rules,
                     "share": "disabled", "autoupdate": False}
    if model:
        profile["small_model"] = model      # its side jobs stay on the chosen model; --title skips the title one
    if spec.mcp:
        profile["mcp"] = {"artemis": {"type": "local", "command": spec.mcp, "enabled": True, "timeout": 60000}}
    env = {variable: value for vault_name, variable in opencode_keys(model)
           for value in keys(spec.vault, vault_name).values()}
    env |= {"OPENCODE_CONFIG_CONTENT": json.dumps(profile), "OPENCODE_DISABLE_PROJECT_CONFIG": "1"}
    argv = ["opencode", "run", "--format", "json", "--agent", "artemis-worker", "--pure", "--title", "Artemis turn"]
    argv += ["-m", model] if model else []
    return Launch(argv, env, _with_instructions(spec), lambda text: opencode_turn(text).reply)


# The direct API and the mock, both Artemis's own processes

def api(spec: Spec) -> Launch:
    model = setting(spec.config, "api", "model")
    if not model:
        raise WorkflowError("Set model under [api] in config.toml before using the API agent.")
    key = setting(spec.config, "api", "key", "OPENAI_API_KEY")
    argv = [sys.executable, "-m", "artemis.api_worker", "--base-url",
            setting(spec.config, "api", "base_url", "https://api.openai.com/v1"), "--model", model, "--key-env", key,
            "--mode", "repo" if _edits(spec) else "host"]
    if spec.instructions:
        argv += ["--instructions", str(_write(spec, "instructions.md", spec.instructions))]
    argv += ["--", *spec.mcp] if spec.mcp else []
    return Launch(argv, keys(spec.vault, key), spec.prompt, plain_reply)


def mock(spec: Spec) -> Launch:
    argv = [sys.executable, "-m", "artemis.mock_worker", "--role", spec.role, "--mode", spec.mode]
    argv += ["--", *spec.mcp] if spec.mcp else []
    return Launch(argv, {}, spec.prompt, plain_reply)


BUILDERS: dict[str, Callable[[Spec], Launch]] = {
    "claude": claude, "codex": codex, "gemini": gemini, "opencode": opencode, "api": api, "mock": mock,
}


# Reading what each one printed

def events(text: str) -> Iterator[dict]:
    for line in text.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict):
            yield event


def _failed(detail: object) -> WorkflowError:
    return WorkflowError(f"it stopped with an error: {str(detail)[:300]}")


def claude_turn(text: str) -> Turn:
    reply, tokens = "", 0
    for event in events(text):
        usage = (event.get("message") or {}).get("usage") if event.get("type") == "assistant" else None
        if usage:
            tokens = sum(usage.get(key) or 0 for key in
                         ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
        if event.get("type") == "result":
            if event.get("is_error") or event.get("subtype") != "success":
                raise _failed(event.get("result") or event.get("subtype"))
            reply = event.get("result") or ""
    return Turn(reply.strip(), tokens)


def codex_turn(text: str) -> Turn:
    reply, tokens, error = "", 0, None
    for event in events(text):
        kind, item = event.get("type"), event.get("item")
        if kind == "item.completed" and isinstance(item, dict) and item.get("type") == "agent_message":
            reply = item.get("text") or reply
        elif kind == "turn.completed":
            tokens = (event.get("usage") or {}).get("input_tokens") or tokens
        elif kind == "turn.failed":
            raise _failed((event.get("error") or {}).get("message"))
        elif kind == "error":
            error = event.get("message")
    if error and not reply:
        raise _failed(error)
    return Turn(reply.strip(), tokens)


def gemini_turn(text: str) -> Turn:
    reply = ""
    for event in events(text):
        kind = event.get("type")
        if kind == "message" and event.get("role") == "assistant":
            reply = reply + str(event.get("content") or "") if event.get("delta") else str(event.get("content") or "")
        elif kind in ("tool_use", "tool_result"):
            reply = ""          # the reply is what it said after its last tool call
        elif kind == "error" or (kind == "result" and event.get("status") == "error"):
            raise _failed((event.get("error") or {}).get("message") or event.get("message"))
    return Turn(reply.strip())


def opencode_turn(text: str) -> Turn:
    parts: dict[str, list[str]] = {}
    for event in events(text):
        if event.get("type") == "error":
            raise _failed(json.dumps(event.get("error") or event)[:300])
        part = event.get("part")
        if event.get("type") == "text" and isinstance(part, dict) and isinstance(part.get("text"), str):
            parts.setdefault(str(part.get("messageID", "")), []).append(part["text"])
    return Turn("".join(next(reversed(parts.values()), [])).strip())


def plain_reply(text: str) -> str:
    return text.strip()


TURNS: dict[str, Callable[[str], Turn]] = {
    "claude": claude_turn, "codex": codex_turn, "gemini": gemini_turn, "opencode": opencode_turn,
    "api": lambda text: Turn(plain_reply(text)), "mock": lambda text: Turn(plain_reply(text)),
}


def delta(name: str, line: str) -> str:
    """The reply text one stdout line adds, for showing the lead's answer as it is written."""
    if name in ("api", "mock"):
        return line             # their stdout is the reply itself
    try:
        event = json.loads(line)
    except ValueError:
        return ""
    if not isinstance(event, dict):
        return ""
    if name == "claude" and event.get("type") == "stream_event":
        inner = event.get("event") or {}
        piece = inner.get("delta") or {}
        return piece.get("text", "") if inner.get("type") == "content_block_delta" and piece.get("type") == "text_delta" else ""
    if name == "codex" and event.get("type") == "item.completed":
        item = event.get("item") or {}
        return item.get("text", "") + "\n" if item.get("type") == "agent_message" else ""
    if name == "gemini" and event.get("type") == "message" and event.get("role") == "assistant":
        return str(event.get("content") or "")
    return ""
