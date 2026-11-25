"""A second opinion on a submission the judge passed, from a model made by a different company than the doer's.

The reviewer gets no tools: the task, its checks and the change itself (the diff of a repo task, or the recorded
events of a folder task) travel in the prompt, and it answers with a verdict and the gaps it found. A review can
only add gaps: it never passes what the checks failed.
"""

import json
import re
import subprocess
import tempfile
from pathlib import Path

from . import agents
from .roles import Role, WorkflowError
from .worker_adapters import section, setting

DIFF_CHARS = 60000
VERDICT = re.compile(r"\{.*\}", re.DOTALL)

ASK = """You review one change that another AI model made. You did not write it. Judge it only against the task
below; its automatic checks have already passed.

{subject}

Reject only for a real defect against the task: wrong behaviour, a missed requirement, a broken edge case, a
change outside what was asked. Style preferences are not gaps. Answer with one JSON object and nothing else:
{{"verdict": "pass" or "reject", "gaps": ["one concrete problem per item, each fixable"]}}
"""


def _subject(ledger, task: int, sha: str) -> str:
    brief = ledger.task_brief(task)
    project = ledger.project(brief["project_id"])
    checks = ", ".join(item.get("label", "?") for item in json.loads(brief["criteria"])) or "none"
    lines = [f"Task #{task}: {brief['title']}", "", brief["brief"].strip() or brief["title"], "",
             f"Checks that passed: {checks}", ""]
    if project["kind"] == "repo":
        diff = subprocess.run(("git", "-C", project["path"], "diff", "--no-color", "--no-ext-diff", f"HEAD...{sha}"),
                              capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
        if diff.returncode != 0:
            raise WorkflowError(f"git could not show commit {sha[:12]}: {diff.stderr.strip()[:200]}")
        text = diff.stdout[:DIFF_CHARS] + ("\n[diff cut here]" if len(diff.stdout) > DIFF_CHARS else "")
        lines += ["The change (git diff against the target):", text or "(empty)"]
    else:
        events = ledger.events(task=task)[-60:]
        lines += [f"What the worker did in the folder {project['path']} (recorded events):"]
        lines += [f"- {row['kind']}: {row['detail'][:400]}" for row in events]
    return "\n".join(lines)


def read_verdict(reply: str) -> tuple[str, list[str]]:
    """The reviewer's JSON answer; anything else is an error."""
    found = VERDICT.search(reply)
    try:
        data = json.loads(found.group(0)) if found else None
    except ValueError:
        data = None
    if not isinstance(data, dict) or data.get("verdict") not in ("pass", "reject"):
        raise WorkflowError("the reviewer did not answer with a verdict")
    gaps = [str(gap).strip()[:500] for gap in data.get("gaps") or [] if str(gap).strip()]
    if data["verdict"] == "reject" and not gaps:
        gaps = ["the reviewer rejected it without naming a gap"]
    return data["verdict"], gaps


def reviewers(home, doer: str) -> list[str]:
    """The ready providers in [placement] review order whose model maker differs from the doer's."""
    config, avoid = home.config, agents.family(doer, home.config)
    order = section(config, "placement").get("review") or agents.PLACEMENT["review"]
    return [name for name in dict.fromkeys(order) if name in agents.PROVIDERS
            and agents.family(name, config) != avoid and agents.available(name, config, home.vault, ledger=home.ledger)]


def review(home, task: int, sha: str, doer: str) -> tuple[str, list[str]]:
    """("pass", []) or ("reject", gaps). Tries each other-family reviewer in turn; with none, the judge's pass stands."""
    ledger = home.ledger
    row = ledger.work(task)[0]
    if row["sha"] != sha or row["verdict"] != "pass":
        return "reject", ["the judge has not passed this submission"]
    subject = _subject(ledger, task, sha)
    minutes = float(setting(home.config, "agents", "worker_minutes", 20))
    tried = []
    for name in reviewers(home, doer):
        label = agents.LABELS[name]
        try:
            with tempfile.TemporaryDirectory(prefix="artemis-review-") as folder:
                spawn = agents.launch(name, role="worker", mode="host", cwd=Path(folder),
                                      prompt=ASK.format(subject=subject), mcp=[], config=home.config,
                                      vault=home.vault, scratch=Path(folder) / "run")
                outcome = agents.run_turn(spawn, Path(folder), minutes * 60)
            verdict, gaps = read_verdict(agents.answer(spawn, outcome))
        except (WorkflowError, OSError) as error:
            tried.append(f"{label}: {error}")
            continue
        gaps = [agents.scrubber(home.vault).scrub(gap) for gap in gaps]
        ledger.record(Role.HOME, "review", f"{label} ({agents.family(name, home.config)}): {verdict}"
                      + (f" · {'; '.join(gaps)[:300]}" if gaps else ""), task=task,
                      data={"provider": name, "verdict": verdict, "gaps": gaps, "sha": sha, "doer": doer})
        return verdict, gaps
    reason = "; ".join(tried) or f"no provider outside {agents.family(doer, home.config)} is ready"
    ledger.record(Role.HOME, "review", f"skipped, the judge's pass stands: {reason[:300]}", task=task,
                  data={"verdict": "skipped", "sha": sha, "doer": doer})
    return "pass", []
