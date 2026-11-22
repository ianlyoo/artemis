"""Provider-specific worker launch options and claim extraction."""

from collections.abc import Iterable
import json
import os
from pathlib import Path
import shlex
import sys

from .config import Config
from .roles import WorkflowError


def codex(config: Config, tree: Path, checks: tuple[tuple[str, ...], ...], argv: list[str]) -> None:
    overrides = {
        "features.shell_tool": "false",
        "features.multi_agent": "false",
        "features.view_image": "false",
        "features.apps": "false",
        "features.plugins": "false",
        "web_search": '"disabled"',
        "sandbox_workspace_write.writable_roots": "[]",
        "sandbox_workspace_write.network_access": "false",
        "sandbox_workspace_write.exclude_slash_tmp": "true",
        "sandbox_workspace_write.exclude_tmpdir_env_var": "true",
        "projects": "{" + ", ".join(f'{json.dumps(str(path))} = {{ trust_level = "untrusted" }}'
                                  for path in (config.root, tree)) + "}",
        "mcp_servers.artemis_worktree.command": json.dumps(sys.executable),
        "mcp_servers.artemis_worktree.args": json.dumps(
            ["-m", "artemis.codex_tools", str(tree), json.dumps(checks)]),
        "mcp_servers.artemis_worktree.required": "true",
        "mcp_servers.artemis_worktree.default_tools_approval_mode": '"approve"',
        "developer_instructions": json.dumps(
            "Use Artemis worktree tools to list and read files and run the numbered task checks. "
            "Use apply_patch for file changes inside the worktree. Do not commit. "
            "Only your final message is the worker claim."),
    }
    for key, value in overrides.items():
        argv.extend(("-c", f"{key}={value}"))
    argv.extend(("exec", "-C", str(tree), "--sandbox", "workspace-write", "--ephemeral",
                 "--ignore-user-config", "--ignore-rules", "--json", "-"))


def opencode(config: Config, tree: Path, checks: tuple[tuple[str, ...], ...], argv: list[str]) -> dict[str, str]:
    rules = [{"action": "*", "resource": "*", "effect": "deny"}]
    rules.extend({"action": action, "resource": "*", "effect": "allow"}
                 for action in ("read", "edit", "grep", "glob", "list"))
    rules.extend({"action": action, "resource": path, "effect": "deny"}
                 for action in ("read", "edit") for path in (".git", ".git/*", ".artemis", ".artemis/*"))
    rules.extend({"action": "shell", "resource": shlex.join(check), "effect": "allow"}
                 for check in checks if not any("*" in arg or "?" in arg for arg in check))
    profile = {"agents": {"artemis-worker": {"mode": "primary", "permissions": rules}}}
    if config.opencode_model:
        argv.extend(("--model", config.opencode_model))
    return {"PWD": str(tree), "OPENCODE_DISABLE_PROJECT_CONFIG": "1",
            "OPENCODE_CONFIG_CONTENT": json.dumps(profile)}


def api(config: Config, argv: list[str]) -> None:
    settings = config.api
    if settings is None:
        raise WorkflowError("Configure [api] in artemis.toml before choosing the API worker.")
    argv.extend((f"--base-url={settings.base_url}", f"--model={settings.model}", f"--key-env={settings.key_env}"))


def _events(output: Iterable[str]) -> Iterable[dict]:
    for line in output:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict):
            yield event


def codex_claim(output: Iterable[str]) -> str:
    claim = ""
    for event in _events(output):
        item = event.get("item")
        if (event.get("type") == "item.completed" and isinstance(item, dict)
                and item.get("type") == "agent_message" and isinstance(item.get("text"), str)):
            claim = item["text"]
    return claim.strip()


def opencode_claim(output: Iterable[str]) -> str:
    matches: dict[str, list[str]] = {}
    for event in _events(output):
        if event.get("type") == "error":
            raise WorkflowError("OpenCode reported a worker error.")
        part = event.get("part")
        if event.get("type") == "text" and isinstance(part, dict) and isinstance(part.get("text"), str):
            message = str(part.get("messageID", ""))
            matches.setdefault(message, []).append(part["text"])
    return "".join(next(reversed(matches.values()), [])).strip()
