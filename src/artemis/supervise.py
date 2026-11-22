"""Run one task to its end without the person: worker, evidence, judge, ship lane, retries.

`dispatch` starts a detached supervisor per queued task, up to the configured number at once. Each supervisor
works in its own Git worktree on its own branch, and starts the next queued task when it finishes.
"""

import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
from tempfile import TemporaryFile
import time

from .agents import AGENTS, Agent, pick
from .config import STATE, Config, ledger_path
from .judge import ArtifactEvidence, CommandEvidence, Criterion, RuleJudge
from .ledger import Ledger, _criteria
from .process import checkout_env
from .roles import Role, WorkflowError
from .ship import checkout, git, identity, ship


ATTEMPTS = 3
POLL_S = 1.0


def worktree(root: Path, task: int) -> Path:
    return root / STATE / "worktrees" / f"task-{task}"


def log_path(root: Path, task: int) -> Path:
    return root / STATE / "logs" / f"task-{task}.log"


def dispatch(config: Config, ledger: Ledger) -> list[int]:
    """Start supervisors for queued tasks while there is room. Returns the task numbers started."""
    if ledger.stopped():
        return []
    rows = ledger.work()
    room = config.max_workers - sum(row["state"] == "running" for row in rows)
    agent = pick(config.worker, "worker", config)
    started = []
    for row in rows:
        if room <= 0:
            break
        if row["state"] != "queued":
            continue
        try:
            run = ledger.claim_run(Role.LEAD, row["id"], agent.name)
        except WorkflowError:
            continue
        spawn(config.root, run, row["id"])
        started.append(row["id"])
        room -= 1
    return started


def spawn(root: Path, run: int, task: int) -> None:
    log = log_path(root, task)
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("ab") as stream:
        options = ({"start_new_session": True} if os.name != "nt"
                   else {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS})
        process = subprocess.Popen(
            (sys.executable, "-m", "artemis.supervise", str(root), str(run)), cwd=root,
            stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT, env=checkout_env(), **options,
        )
    Ledger(ledger_path(root)).run_pid(run, process.pid)


def prompt(config: Config, task, criteria: tuple[Criterion, ...], feedback: str) -> str:
    checks = "\n".join(f"- {c.label}: " + (f"`{shlex.join(c.command)}` exits 0" if c.command
                                            else f"{c.artifact} is in your commit") for c in criteria)
    text = (f"{config.instructions('worker.md').strip()}\n\nTask #{task['id']}: {task['title']}\n\n"
            f"{task['brief'].strip() or task['title']}\n\nChecks:\n{checks}\n")
    if feedback:
        text += f"\nThis is another attempt. {feedback}\n"
    return text


def _run_agent(config: Config, ledger: Ledger, agent: Agent, tree: Path, text: str,
               criteria: tuple[Criterion, ...], log: Path) -> tuple[str, str]:
    """Run the worker to its end. Returns (outcome, claim): outcome is done, stopped, timeout or failed.

    Normalize the final claim before logging it. Provider progress stays in the temporary stream.
    """
    checks = tuple(c.command for c in criteria if c.command)
    argv, env, decode = agent.worker_launch(config, tree, checks)
    with (log.open("ab") as stream, TemporaryFile(dir=log.parent) as stdin,
          TemporaryFile(mode="w+", encoding="utf-8", errors="replace", dir=log.parent) as output):
        stdin.write(text.encode("utf-8"))
        stdin.seek(0)
        stream.write(f"\n--- {agent.name} worker: {shlex.join(argv[:3])} ...\n".encode())
        stream.flush()
        try:
            process = subprocess.Popen(argv, cwd=tree, stdin=stdin, stdout=output, stderr=stream,
                                       env=checkout_env() | env, start_new_session=os.name != "nt")
        except OSError as error:
            return "failed", f"{argv[0]} could not start: {error.strerror}"
        deadline = time.monotonic() + config.worker_minutes * 60
        outcome = "done"
        while process.poll() is None:
            if ledger.stopped():
                outcome = "stopped"
            elif time.monotonic() > deadline:
                outcome = "timeout"
            if outcome != "done":
                _terminate(process)
                break
            time.sleep(POLL_S)
        if outcome == "done" and process.returncode:
            outcome = "failed"
        output.seek(0)
        try:
            claim = decode(output) if decode else output.read().strip()
        except WorkflowError as error:
            claim = str(error)
            if outcome == "done":
                outcome = "failed"
        if decode and outcome == "done" and not claim:
            outcome, claim = "failed", "The worker finished without a final message."
        stream.write(claim.encode() + b"\n")
    return outcome, claim[-1500:]


def _terminate(process: subprocess.Popen) -> None:
    try:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()
        process.wait(timeout=10)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        process.kill()


def _evidence(root: Path, sha: str, criteria: tuple[Criterion, ...]) -> dict:
    items = {}
    for number, criterion in enumerate(criteria, 1):
        with checkout(root, sha) as tree:
            if criterion.command:
                items[number] = CommandEvidence.capture(tree, criterion.command)
            else:
                try:
                    git(tree, "--literal-pathspecs", "ls-files", "--error-unmatch", "--", criterion.artifact)
                    items[number] = ArtifactEvidence.capture(tree, criterion.artifact)
                except (OSError, subprocess.CalledProcessError, ValueError):
                    pass
    return items


def _commit(tree: Path, root: Path, message: str) -> str | None:
    """Commit what the worker left in its worktree. Returns a problem, or None.

    Workers only edit files; Artemis commits, so a sandboxed agent never needs write access to Git's metadata.
    """
    git(tree, "add", "--all", "--", ".")
    marked = git(tree, "grep", "--cached", "-l", "-E", "^(<<<<<<<|>>>>>>>) ", check=False)
    if marked:
        return f"conflict markers remain in {', '.join(marked.splitlines()[:5])}"
    merging = Path(git(tree, "rev-parse", "--git-path", "MERGE_HEAD"))
    merging = merging if merging.is_absolute() else tree / merging
    if git(tree, "status", "--porcelain") or merging.exists():
        git(tree, "-c", "commit.gpgsign=false", "commit", "--quiet", "--no-verify", "-m", message,
            env=identity(root))
    return None


def _merge_target(tree: Path, root: Path, target: str) -> list[str]:
    """Merge the target branch into the task branch. Returns the files left with conflict markers."""
    try:
        git(tree, "-c", "commit.gpgsign=false", "merge", "--no-ff", "--no-commit", target, env=identity(root))
    except subprocess.CalledProcessError:
        return git(tree, "diff", "--name-only", "--diff-filter=U").splitlines()
    _commit(tree, root, f"Merge {target} into this task")
    return []


def supervise(root: Path, run: int) -> None:
    config = Config.load(root)
    ledger = Ledger(ledger_path(root))
    row = next(r for r in ledger.work() if r["run_id"] == run)
    task = ledger.task_brief(row["id"])
    agent = AGENTS[row["agent"]]
    criteria = _criteria(task["criteria"])
    tree = worktree(root, task["id"])
    log = log_path(root, task["id"])
    target = config.target
    outcome, note = "stuck", ""
    try:
        if not tree.exists():
            git(root, "worktree", "add", "-B", row["branch"], str(tree), target)
        feedback = ""
        for _attempt in range(ATTEMPTS):
            base = git(tree, "rev-parse", "HEAD")
            result, output = _run_agent(config, ledger, agent, tree, prompt(config, task, criteria, feedback),
                                        criteria, log)
            if result == "stopped":
                outcome, note = "stopped", "stopped by you"
                return
            if result != "done":
                note = {"timeout": f"no result after {config.worker_minutes} min",
                        "failed": "the worker exited with an error"}[result] + f": {output[-300:]}"
                if result == "timeout":
                    return
                feedback = f"The previous run failed: {note}. Finish the change."
                ledger.retrying(Role.WORKER, task["id"], note)
                continue
            problem = _commit(tree, root, task["title"])
            sha = git(tree, "rev-parse", "HEAD")
            if problem or sha == base:
                note = problem or note or "the worker made no change"
                feedback = f"Your last attempt left no usable change: {note}. Finish the change."
                ledger.retrying(Role.WORKER, task["id"], note)
                continue
            ledger.submit(Role.WORKER, task["id"], sha, output or "(no claim)", _evidence(root, sha, criteria))
            verdict = ledger.judge(Role.JUDGE, task["id"], RuleJudge())
            if verdict.kind != "pass":
                note = "judge: " + "; ".join(verdict.gaps)
                feedback = f"The judge rejected your change: {'; '.join(verdict.gaps)}. Fix it."
                ledger.retrying(Role.WORKER, task["id"], note)
                continue
            landing = ship(ledger, task["id"], sha, root, task["title"], target=target,
                           commands=config.landing_checks(criteria))
            if landing.state == "applied":
                outcome, note = "done", landing.detail
                return
            note = f"ship lane: {landing.detail}"
            if landing.state == "blocked":
                return
            conflicted = _merge_target(tree, root, target)
            if conflicted:
                feedback = (f"{target} moved while you worked. Artemis merged it into your branch, and these files "
                            f"now hold conflict markers: {', '.join(conflicted)}. Resolve each one keeping the intent "
                            "of both sides, and remove every marker. Do not commit; Artemis does.")
            else:
                feedback = (f"Your change passed alone but fails once merged with the current {target}. Artemis merged "
                            f"{target} into your branch. Fix what breaks. The ship lane said: {landing.detail}")
            ledger.retrying(Role.WORKER, task["id"], f"{note.splitlines()[0]}; {target} merged in for the worker")
    except WorkflowError as error:
        outcome, note = ("stopped", "stopped by you") if ledger.stopped() else ("stuck", str(error))
    except (subprocess.SubprocessError, OSError) as error:
        outcome, note = "stuck", f"{type(error).__name__} while running the task"
    finally:
        ledger.end_run(Role.WORKER, run, outcome, note[:500] or "gave up")
        if outcome == "done":
            try:
                git(root, "worktree", "remove", "--force", str(tree))
            except subprocess.SubprocessError:
                pass
        dispatch(config, ledger)


if __name__ == "__main__":
    supervise(Path(sys.argv[1]), int(sys.argv[2]))
