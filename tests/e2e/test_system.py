"""The whole system once, as a person uses it, on this computer only: a home, two projects, repo and host work with
undo, a held request approved over HTTP with a secret used by name, a lesson that changes a rule, and a stop.

Mock workers and a stand-in server (tests/e2e/stand_in.py, a mock) do the outside work. The home lives in a folder
whose path has spaces and non-ASCII letters, and its vault unlocks from the environment with a passphrase made for
this run. Each step names the modules it needs and is skipped, naming those not merged yet, until they are.
"""

import asyncio
from contextlib import ExitStack
from dataclasses import replace
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
from tempfile import mkdtemp
import time
import tomllib
import unittest
from unittest import mock
import urllib.error
import urllib.request

from helpers import isolated_env, repository

from .stand_in import StandIn

LOOPBACK = urllib.request.build_opener(urllib.request.ProxyHandler({}))
CLI = (sys.executable, "-c", "import sys; from artemis.cli import main; sys.exit(main())")
PYTHON = "python" if os.name == "nt" else "python3"   # as a check names it: found on PATH, no path to quote


def needs(*modules: str):
    """Skip until every named module is in this build: artemis.<name>, or a bare name for a test-only package."""
    missing = [name for name in modules
               if importlib.util.find_spec(name.removeprefix("sdk:") if name.startswith("sdk:") else f"artemis.{name}")
               is None]
    return unittest.skipIf(missing, "needs " + ", ".join(missing) + " (not in this build yet)")


def until(probe, timeout=120.0, every=0.3):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = probe()
        if value:
            return value
        time.sleep(every)
    raise AssertionError(f"Still waiting after {timeout:.0f} s.")


@needs("home", "web")
class System(unittest.TestCase):
    """One home for every step, in order."""

    @classmethod
    def setUpClass(cls):
        from artemis.home import part
        if part("web", "start") is None:
            raise unittest.SkipTest("needs web.start, the App's server (not in this build yet)")
        cls.stack = ExitStack()
        scratch = Path(mkdtemp(prefix="e2e "))
        cls.stack.callback(shutil.rmtree, scratch, ignore_errors=True)
        cls.root = scratch / "Ärtemis home ü"
        (cls.root / "user").mkdir(parents=True)
        env = isolated_env(cls.root / "user")
        env.update(ARTEMIS_HOME=str(cls.root / "home"),
                   ARTEMIS_VAULT_PASSPHRASE=os.environ.get("ARTEMIS_VAULT_PASSPHRASE") or secrets.token_urlsafe(24))
        cls.env = env
        cls.stack.enter_context(mock.patch.dict(os.environ, env, clear=True))
        cls.outside = cls.stack.enter_context(StandIn())

        from artemis.home import Paths, open as open_home
        cls.paths = paths = Paths.from_env()
        paths.root.mkdir()
        paths.config.write_text('[vault]\nunlock = "env"\n\n[agents]\nlead = "mock"\nworker = "mock"\n',
                                encoding="utf-8")
        # `artemis serve` without its signal loop, so this process holds the run grants it mints.
        cls.home = open_home(paths, 0)
        cls.stack.callback(cls.home.close)

    @classmethod
    def tearDownClass(cls):
        cls.stack.close()

    # Ways in: the App API (as the CLI calls it, with the home token), the CLI, the ledger for reading

    def api(self, method, path, body=None, token=True):
        request = urllib.request.Request(f"http://127.0.0.1:{self.home.port}{path}", method=method,
                                         data=None if body is None else json.dumps(body).encode())
        request.add_header("Content-Type", "application/json")
        if token:
            request.add_header("Authorization", "Bearer " + self.paths.token.read_text(encoding="utf-8").strip())
        try:
            with LOOPBACK.open(request, timeout=30) as response:
                kind = response.headers.get("Content-Type", "")
                return response.status, json.load(response) if kind.startswith("application/json") else kind
        except urllib.error.HTTPError as error:
            return error.code, None

    def artemis(self, *args, stdin=None, check=True):
        done = subprocess.run((*CLI, *args), input=stdin, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", env=self.env, cwd=self.root, timeout=120)
        if check and done.returncode:
            self.fail(f"artemis {args[0]} exited {done.returncode}: {done.stderr.strip()}")
        return done

    def state(self, task):
        return self.home.ledger.work(task)[0]["state"]

    def project(self, kind):
        return next(row for row in self.home.ledger.projects() if row["kind"] == kind)

    def task(self, kind, title, *options):
        project = self.project(kind)
        request = self.artemis("request", title, "--project", project["name"]).stdout.strip()
        return int(re.search(r"\d+", self.artemis("task", request, title, *options).stdout)[0])

    # The steps

    def test_1_the_home_is_up_and_the_app_api_answers(self):
        status, state = self.api("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertLessEqual({"stopped", "counts", "projects", "cards", "lessons", "version"}, set(state))
        self.assertEqual(self.api("GET", "/api/state", token=False)[0], 401)
        status, digest = self.api("GET", "/api/digest")
        self.assertEqual((status, set(digest) >= {"lines", "counts", "text"}), (200, True))
        with LOOPBACK.open(urllib.request.Request(
                f"http://127.0.0.1:{self.home.port}/api/events", headers={
                    "Authorization": "Bearer " + self.paths.token.read_text(encoding="utf-8").strip()}),
                timeout=30) as events:
            self.assertTrue(events.headers["Content-Type"].startswith("text/event-stream"))

    def test_2_two_projects(self):
        repo = repository(self.root / "Prøject repo")
        photos = self.root / "Fotos ü"
        photos.mkdir()
        for name in ("beach.jpg", "hill.jpg", "notes.txt"):
            (photos / name).write_bytes(secrets.token_bytes(64))
        for path in (repo, photos):
            self.assertIn(self.api("POST", "/api/projects", {"path": str(path)})[0], (200, 201))
        listed = self.artemis("project", "list").stdout
        self.assertRegex(listed, r"(?m)\brepo\b.*Prøject repo")
        self.assertRegex(listed, r"(?m)\bfolder\b.*Fotos ü")

    @needs("agents", "judge", "ship")
    def test_3_a_repo_task_ships(self):
        task = self.task("repo", "Leave a note for the team", "--check", f"{PYTHON} -m unittest", "--provider",
                         "mock")
        until(lambda: self.state(task) in ("shipped", "stuck"))
        self.assertEqual(self.state(task), "shipped")

    @needs("agents", "broker", "undo", "judge")
    def test_4_a_host_task_and_its_undo(self):
        photos = Path(self.project("folder")["path"])
        task = self.task("folder", "Sort the photos", "--kind", "host", "--file", "summary.csv", "--provider", "mock")
        until(lambda: self.state(task) in ("verified", "stuck"))
        self.assertEqual(self.state(task), "verified")
        self.assertTrue((photos / "jpg" / "beach.jpg").is_file())
        self.assertEqual(self.api("POST", f"/api/undo/{task}")[0], 200)
        self.assertEqual(sorted(path.name for path in photos.iterdir()), ["beach.jpg", "hill.jpg", "notes.txt"])

    @needs("broker", "mcp", "httpop", "vault", "sdk:mcp")
    def test_5_a_held_request_approved_over_http_sends_a_secret_used_by_name(self):
        sentinel = secrets.token_urlsafe(24)  # made here, never printed: only compared
        self.artemis("secret", "set", "DEMO_HOOK_TOKEN", "--stdin", "--origin", self.outside.origin, "--kind", "send",
                     "--note", "the stand-in team hook", stdin=sentinel + "\n")
        from artemis.judge import Criterion
        project, ledger = self.project("folder"), self.home.ledger
        request = ledger.request(_role("OWNER"), "Tell the team", project["id"])
        # this test is the worker: with the mock's cap at 0 the home's dispatcher leaves its task alone
        config = self.home.config
        self.home.config = replace(config, agents=replace(config.agents, caps={**config.agents.caps, "mock": 0}))
        self.addCleanup(setattr, self.home, "config", config)
        task = ledger.add_task(_role("LEAD"), request, "Tell the team", "",
                               (Criterion("sent", command=(PYTHON, "-c", "pass")),), project=project["id"], kind="host",
                               provider="mock")
        run = ledger.claim_run(_role("HOME"), task, "mock")
        self.addCleanup(ledger.end_run, _role("WORKER"), run, "stuck", "the end-to-end test held this run")
        self.addCleanup(self.home.revoke, run)
        token = self.home.grant(run, task, project["id"], "worker", Path(project["path"]), "folder")
        tools, called = asyncio.run(_mcp(self.home.mcp_command(token), "http_request", {
            "method": "POST", "url": self.outside.origin + "/hook", "body": "Release 1.2 is out",
            "secret": "DEMO_HOOK_TOKEN"}))
        self.assertLessEqual({"run", "http_request", "write_file", "note"}, tools)
        self.assertEqual(called["state"], "held")
        self.assertEqual(self.outside.received, [])
        self.assertEqual(self.api("POST", f"/api/cards/{called['card']}/approve", {})[0], 200)
        until(lambda: self.home.ledger.card(called["card"])["state"] in ("done", "failed", "unknown"))
        self.assertEqual(self.home.ledger.card(called["card"])["state"], "done")
        [arrived] = self.outside.received
        self.assertTrue(arrived.carries(sentinel), "the stand-in did not get the secret")
        audit = self.artemis("secret", "audit")
        self.assertRegex(audit.stdout, r"\b0 of \d+ values? found")
        self.assertFalse(sentinel in audit.stdout + audit.stderr + self.paths.ledger.read_bytes().decode("latin-1"),
                         "the secret's value is in the audit's output or the ledger")

    @needs("guard", "lessons")
    def test_6_a_declined_card_teaches_a_rule_once_you_say_yes(self):
        from artemis import guard
        project = self.project("repo")
        card = self.home.ledger.open_card(_role("HOME"), "send as you", "Tell everyone", "it speaks for you",
                                          project=project["id"], command="notify-team --all",
                                          cwd=project["path"], shell="sh")
        self.assertEqual(self.api("POST", f"/api/cards/{card}/decline", {})[0], 200)
        line = until(lambda: next((line for line in self.api("GET", "/api/digest")[1]["lines"]
                                   if line.get("question")), None))
        self.assertEqual(line["question"], f"You declined D{card}. Always ask before `notify-team`?")
        self.assertEqual(guard.classify(["notify-team", "--all"], guard.SHELL, guard.Rules.load(self.paths)).kind,
                         None)
        self.assertEqual(self.api("POST", f"/api/lessons/{line['ref'][1:]}/accept", {})[0], 200)
        until(lambda: "learned" in tomllib.loads(self.paths.rules.read_text(encoding="utf-8")))
        self.assertEqual(guard.classify(["notify-team", "--all"], guard.SHELL, guard.Rules.load(self.paths)).kind,
                         "send as you")

    def test_7_stop_and_resume(self):
        request = self.artemis("request", "One more", "--project", self.project("repo")["name"]).stdout.strip()
        self.assertEqual(self.api("POST", "/api/stop", {"reason": "lunch"})[0], 200)
        self.assertTrue(self.api("GET", "/api/state")[1]["stopped"])
        self.assertIn("stopped until you resume",
                      self.artemis("task", request, "One more", "--check", "true", check=False).stderr)
        self.assertEqual(self.api("POST", "/api/resume", {})[0], 200)
        self.assertFalse(self.api("GET", "/api/state")[1]["stopped"])


def _role(name):
    from artemis.roles import Role
    return getattr(Role, name)


async def _mcp(command: list[str], tool: str, arguments: dict) -> tuple[set[str], dict]:
    """The official MCP SDK client against `artemis mcp`: list the tools, call one, return its JSON result."""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    server = StdioServerParameters(command=command[0], args=command[1:], env=dict(os.environ))
    async with stdio_client(server) as (read, write), ClientSession(read, write) as session:
        await session.initialize()
        tools = {item.name for item in (await session.list_tools()).tools}
        result = await session.call_tool(tool, arguments)
        return tools, json.loads(result.content[0].text)


if __name__ == "__main__":
    unittest.main()
