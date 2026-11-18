"""A fictional todo project, built from scratch for each demo run."""

from collections.abc import Callable
from pathlib import Path
from tempfile import TemporaryDirectory

from .agents import ScriptedRunner
from .judge import ArtifactEvidence, CommandEvidence, Criterion, RuleJudge
from .ledger import Ledger
from .roles import OwnerAction, Role, WorkflowError
from .ship import git, ship


ORIGINAL = """\
def main():
    print("Water the basil")


if __name__ == "__main__":
    main()
"""

UPDATED = """\
import argparse
import json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    items = ["Water the basil"]
    print(json.dumps(items) if args.json else items[0])


if __name__ == "__main__":
    main()
"""

SMOKE = """\
import json
import subprocess
import sys
import unittest


class TodoTests(unittest.TestCase):
    def test_json_output(self):
        output = subprocess.check_output([sys.executable, "todo.py", "--json"], text=True)
        self.assertEqual(json.loads(output), ["Water the basil"])

    def test_plain_output(self):
        output = subprocess.check_output([sys.executable, "todo.py"], text=True)
        self.assertEqual(output.strip(), "Water the basil")


if __name__ == "__main__":
    unittest.main()
"""

CHECK = ("python3", "test_todo.py")


def _commit(repo: Path, title: str) -> str:
    git(repo, "add", "--", ".")
    identity = {"GIT_AUTHOR_NAME": "Demo", "GIT_AUTHOR_EMAIL": "demo",
                "GIT_COMMITTER_NAME": "Demo", "GIT_COMMITTER_EMAIL": "demo",
                "GIT_AUTHOR_DATE": "2020-01-01T00:00:00Z",
                "GIT_COMMITTER_DATE": "2020-01-01T00:00:00Z"}
    git(repo, "-c", "commit.gpgsign=false", "commit", "-m", title, env=identity)
    return git(repo, "rev-parse", "HEAD")


def _sample(repo: Path) -> None:
    git(repo, "init", "--quiet", "-b", "main", "--object-format=sha1", "--template=")
    git(repo, "config", "core.hooksPath", ".git/hooks")
    (repo / "todo.py").write_text(ORIGINAL, encoding="utf-8")
    (repo / "ship.toml").write_text('checks = [["python3", "test_todo.py"]]\n', encoding="utf-8")
    _commit(repo, "Start with plain text output")


def _change(repo: Path) -> tuple[str, ArtifactEvidence]:
    git(repo, "switch", "-c", "json-output")
    (repo / "todo.py").write_text(UPDATED, encoding="utf-8")
    (repo / "test_todo.py").write_text(SMOKE, encoding="utf-8")
    commit = _commit(repo, "Add JSON output to the todo command")
    return commit, ArtifactEvidence.capture(repo, "todo.py")


def demo(ledger: Ledger, emit: Callable[[], None]) -> int:
    """Run the role chain and use the ledger as the source for live output."""
    runner = ScriptedRunner(ledger)

    def step(role, action, *args):
        result = runner.run(role, lambda _card: action(role, *args))
        emit()
        return result

    with TemporaryDirectory(prefix="harness-demo-") as scratch:
        repo = Path(scratch)
        request = step(Role.OWNER, ledger.request, "Make the todo list readable by scripts")
        goal = step(Role.LEAD, ledger.set_goal, request, "Offer JSON alongside plain text")
        step(Role.CTO, ledger.plan, goal, "Add an opt-in flag and test both output formats")
        project = step(Role.PM, ledger.open_project, goal, "Todo CLI")
        criteria = (
            Criterion("CLI artifact", artifact="todo.py"),
            Criterion("Output tests", command=CHECK, output="OK"),
        )
        task = step(Role.PM, ledger.assign, project, "Add --json to todo.py", criteria)
        approval = step(Role.PM, ledger.request_action, task, OwnerAction.SEND, "Publish release note")
        runner.run(Role.WORKER, lambda _card: _sample(repo))
        commit, artifact = runner.run(Role.WORKER, lambda _card: _change(repo))
        step(Role.WORKER, ledger.submit, task, commit, "JSON flag ready", {1: artifact})
        step(Role.CQO, ledger.judge, task, RuleJudge())
        test = runner.run(Role.WORKER, lambda _card: CommandEvidence.capture(repo, CHECK))
        step(Role.WORKER, ledger.submit, task, commit, "Output tests recorded", {1: artifact, 2: test})
        step(Role.CQO, ledger.judge, task, RuleJudge())
        runner.run(Role.SHIP, lambda _card: git(repo, "switch", "main"))
        receipt = runner.run(Role.SHIP, lambda _card: ship(ledger, task, repo, "json-output"))
        emit()
        if receipt.state != "applied":
            raise WorkflowError("The demo could not ship the sample change.")
        step(Role.OWNER, ledger.approve, approval)
        step(Role.WORKER, ledger.simulate_action, approval)
    return task
