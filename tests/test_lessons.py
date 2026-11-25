import argparse
from contextlib import redirect_stdout
from hashlib import sha1
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading
from types import SimpleNamespace
import tomllib
import unittest

from artemis import lessons
from artemis.judge import CommandEvidence, Criterion, RuleJudge
from artemis.ledger import Ledger
from artemis.roles import Role, WorkflowError

from helpers import commit, repository


CHECK = ("python3", "-m", "unittest")
RULE = "Check before reporting: README lists every flag"

# A scripted provider standing in for a model: it adds the flag it is asked for, and lists it in the README only
# when a lesson or the judge's feedback in its prompt says so. Like a hurried model, it skims past the checks.
WORKER = '''\
import re, sys
from pathlib import Path

prompt = sys.stdin.read()
sections = dict(re.findall(r"^## (\\w+)\\n(.*?)(?=^## |\\Z)", prompt, re.M | re.S))
flag = re.search(r"Add the flag (--[a-z]+)", sections["Task"]).group(1)
flags = Path("flags.txt").read_text(encoding="utf-8").split()
if flag not in flags:
    Path("flags.txt").write_text(" ".join(flags + [flag]) + "\\n", encoding="utf-8")
heard = sections.get("Lessons", "") + sections.get("Feedback", "")
readme = Path("README.md")
if "README lists every flag" in heard and flag not in readme.read_text(encoding="utf-8"):
    readme.write_text(readme.read_text(encoding="utf-8") + "- " + flag + "\\n", encoding="utf-8")
print("added", flag)
'''

# The project's own check: does flags.txt have a flag, and does the README list every flag?
PROJECT_CHECK = '''\
import sys
from pathlib import Path

flags = Path("flags.txt").read_text(encoding="utf-8").split()
if sys.argv[1] == "flag":
    sys.exit(0 if sys.argv[2] in flags else 1)
missing = [flag for flag in flags if flag not in Path("README.md").read_text(encoding="utf-8")]
print("missing from README:", " ".join(missing))
sys.exit(1 if missing else 0)
'''


class Home(SimpleNamespace):
    """The parts of the home process lessons use: the ledger and the rules file."""

    def __init__(self, ledger: Ledger, root: Path):
        super().__init__(ledger=ledger, paths=SimpleNamespace(rules=root / "rules.toml"))
        self.cursor = 0

    def pump(self) -> None:
        """Hand every new ledger event to lessons.observe, in order, as the home's event follower does."""
        for event in self.ledger.events(self.cursor):
            self.cursor = event["id"]
            lessons.observe(self, event)


class Lab(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory()))
        self.ledger = Ledger(self.root / "ledger.db")
        self.ledger.initialize()
        self.home = Home(self.ledger, self.root)
        self.project = self.ledger.add_project(Role.OWNER, "cli", "repo", self.root / "cli")
        self.other = self.ledger.add_project(Role.OWNER, "photos", "folder", self.root / "photos")

    def lessons_of(self, kind, state=None, project=...):
        return [row for row in reversed(self.ledger.lessons(state=state))
                if row["kind"] == kind and (project is ... or row["project_id"] == project)]

    def yours(self, text="Do it this way from now on"):
        """A source citing your own words in chat."""
        return [{"message": self.ledger.say(Role.OWNER, text)}]

    def task(self, project=None, kind="code", title="Do it"):
        project = project or self.project
        request = self.ledger.request(Role.OWNER, title, project)
        return self.ledger.add_task(Role.LEAD, request, title, "", (Criterion("tests", command=CHECK),),
                                    project=project, kind=kind)

    def attempt(self, task, passed: bool, sha="b" * 40):
        """One recorded attempt the judge assesses; a reject is followed by the retry the supervisor records."""
        self.ledger.submit(Role.WORKER, task, sha, "done", {1: CommandEvidence(CHECK, 0 if passed else 1, "")})
        self.home.pump()
        verdict = self.ledger.judge(Role.JUDGE, task, RuleJudge())
        self.home.pump()
        if not passed:
            self.ledger.retrying(Role.WORKER, task, "judge: " + "; ".join(verdict.gaps))
            self.home.pump()

    def run_task(self, outcomes, project=None, agent="steady", kind="code"):
        task = self.task(project, kind)
        run = self.ledger.claim_run(Role.HOME, task, agent)
        self.home.pump()
        for passed in outcomes:
            self.attempt(task, passed)
        self.ledger.end_run(Role.WORKER, run, "done" if outcomes and outcomes[-1] else "stuck", "end")
        self.home.pump()
        return task


class DeterministicProof(Lab):
    """Task A is rejected, passes on retry and leaves a lesson. After a restart task B passes first time; in a
    second project the same task does not; with the lesson retired B fails first time again.

    Real ledger, judge and lessons code; a scripted worker; a stand-in supervisor and home. This proves the
    mechanism, not that models learn.
    """

    def setUp(self):
        super().setUp()
        self.second = self.ledger.add_project(Role.OWNER, "cli-two", "repo", self.root / "cli-two")
        self.base = self.root / "base"
        self.base.mkdir()
        (self.base / "flags.txt").write_text("--help\n", encoding="utf-8")
        (self.base / "README.md").write_text("# cli\n\nFlags:\n- --help\n", encoding="utf-8")
        (self.base / "check.py").write_text(PROJECT_CHECK, encoding="utf-8")
        self.worker = self.root / "scripted_worker.py"
        self.worker.write_text(WORKER, encoding="utf-8")

    def restart(self):
        """A new ledger handle and home, as after a restart: nothing is carried in memory."""
        cursor = self.home.cursor
        self.ledger = Ledger(self.ledger.path)
        self.home = Home(self.ledger, self.root)
        self.home.cursor = cursor

    def prompt(self, project, brief, criteria, feedback):
        parts = [f"## Task\n{brief}\n", "## Checks\n" + "".join(f"- {c.label}\n" for c in criteria)]
        learned = lessons.prompt_lines(self.ledger, project)
        if learned:
            parts.append("## Lessons\n" + "".join(f"{line}\n" for line in learned))
        if feedback:
            parts.append(f"## Feedback\n{feedback}\n")
        return "".join(parts)

    def supervise(self, flag, project=None) -> list[str]:
        """Run one task to the end and return its verdicts in order."""
        project = project or self.project
        criteria = (Criterion(f"flags.txt has {flag}", command=(sys.executable, "check.py", "flag", flag)),
                    Criterion("README lists every flag", command=(sys.executable, "check.py", "readme")))
        brief = f"Add the flag {flag}"
        request = self.ledger.request(Role.OWNER, brief, project)
        task = self.ledger.add_task(Role.LEAD, request, brief, brief, criteria, project=project)
        run = self.ledger.claim_run(Role.HOME, task, "scripted")
        self.home.pump()
        tree = shutil.copytree(self.base, self.root / f"task-{task}")
        verdicts, feedback = [], ""
        for _attempt in range(3):
            subprocess.run((sys.executable, str(self.worker)), input=self.prompt(project, brief, criteria, feedback),
                           cwd=tree, check=True, capture_output=True, text=True, encoding="utf-8")
            items = {n: CommandEvidence.capture(tree, c.command) for n, c in enumerate(criteria, 1)}
            state = sha1(b"".join(path.read_bytes() for path in sorted(tree.iterdir()))).hexdigest()
            self.ledger.submit(Role.WORKER, task, state, "added the flag", items)
            verdict = self.ledger.judge(Role.JUDGE, task, RuleJudge())
            verdicts.append(verdict.kind)
            self.home.pump()
            if verdict.kind == "pass":
                break
            feedback = f"The judge rejected your change: {'; '.join(verdict.gaps)}. Fix it."
            self.ledger.retrying(Role.WORKER, task, "judge: " + "; ".join(verdict.gaps))
            self.home.pump()
        self.ledger.end_run(Role.WORKER, run, "done" if verdicts[-1] == "pass" else "stuck", "end")
        self.home.pump()
        return verdicts

    def test_a_lesson_changes_the_next_run_and_retiring_it_changes_it_back(self):
        self.assertEqual(self.supervise("--json"), ["reject", "pass"])
        [lesson] = self.lessons_of("rule")
        self.assertEqual((lesson["text"], lesson["state"], lesson["project_id"]), (RULE, "active", self.project))
        self.assertEqual(lessons.source_text(lesson), "from #1 judge reject")

        self.restart()
        self.assertEqual(self.supervise("--done"), ["pass"])
        self.assertEqual(self.supervise("--done", self.second), ["reject", "pass"])  # L1 is not that project's
        [lesson] = self.lessons_of("rule", project=self.project)
        self.assertEqual((lesson["uses"], lesson["first_try"]), (1, 1))

        lessons.retire(self.ledger, lesson["id"])
        self.home.pump()
        self.assertEqual(lessons.prompt_lines(self.ledger, self.project), [])
        self.assertEqual(self.supervise("--done"), ["reject", "pass"])
        [lesson] = self.lessons_of("rule", project=self.project)
        self.assertEqual((lesson["state"], lesson["uses"]), ("retired", 1))  # retired stays retired; not relearned


class Triggers(Lab):
    def test_a_reject_then_pass_writes_the_failed_criterion_as_a_rule_and_wakes_no_one(self):
        woken = []
        self.home.lead = SimpleNamespace(provider="claude", wake=woken.append)
        self.run_task([False, True])
        self.assertEqual(woken, [])
        self.assertEqual([(row["text"], row["state"]) for row in self.lessons_of("rule")],
                         [("Check before reporting: tests", "active")])

    def test_a_first_try_pass_or_a_reject_alone_teaches_nothing(self):
        self.run_task([True])
        self.run_task([False, False, False])
        self.assertEqual(self.lessons_of("rule"), [])

    def test_three_failed_attempts_of_one_provider_move_it_last_for_that_kind_here(self):
        task = self.task()
        run = self.ledger.claim_run(Role.HOME, task, "flaky")
        self.home.pump()
        self.attempt(task, False)
        self.attempt(task, False)
        self.ledger.end_run(Role.WORKER, run, "stuck", "gave up")  # the run ending after a retry: not an attempt
        self.home.pump()
        self.assertEqual(self.lessons_of("placement"), [])
        task = self.task()
        run = self.ledger.claim_run(Role.HOME, task, "flaky")
        self.ledger.end_run(Role.WORKER, run, "stuck", "no result after 20 min")
        self.home.pump()
        [lesson] = self.lessons_of("placement")
        self.assertEqual((lesson["state"], json.loads(lesson["payload"])), ("active", {"kind": "code", "demote": "flaky"}))
        self.assertEqual(lessons.placement_for(self.ledger, self.project, "code", ["flaky", "steady"]),
                         ["steady", "flaky"])
        self.assertEqual(lessons.placement_for(self.ledger, self.project, "docs", ["flaky", "steady"]),
                         ["flaky", "steady"])
        self.assertEqual(lessons.placement_for(self.ledger, self.other, "code", ["flaky", "steady"]),
                         ["flaky", "steady"])

    def test_a_pass_or_a_restart_breaks_the_streak(self):
        self.run_task([False, False, True], agent="flaky")
        self.run_task([False], agent="flaky")
        task = self.task()
        self.ledger.claim_run(Role.HOME, task, "flaky")
        self.ledger.end_orphans()
        self.home.pump()
        self.assertEqual(self.lessons_of("placement"), [])

    def test_a_declined_command_asks_whether_to_always_ask_and_waits_for_your_yes(self):
        rules = self.home.paths.rules
        mine = '# mine\n[match."send as you"]\nargv = [\n  ["git", "push"],\n  ["npm", "publish"]\n]   # keep\n'
        rules.write_text(mine, encoding="utf-8")
        card = self.ledger.open_card(Role.LEAD, "send as you", "Post the notes", "it speaks for you",
                                     project=self.project, command="python notify.py --to team", cwd=".",
                                     shell="sh")
        self.ledger.decide_card(Role.OWNER, card, False)
        self.home.pump()
        [guard] = self.lessons_of("guard")
        self.assertEqual((guard["state"], guard["project_id"], guard["text"]),
                         ("proposed", None, 'Ask before "python notify.py" (send as you)'))
        self.assertEqual(json.loads(guard["payload"]), {"kind": "send as you", "argv": ["python", "notify.py"]})
        self.assertEqual(lessons.question(guard), "You declined D1. Always ask before `python notify.py`?")
        self.assertEqual(rules.read_text(encoding="utf-8"), mine)

        again = self.ledger.open_card(Role.LEAD, "send as you", "Post again", "it speaks for you",
                                      command="python notify.py --to all", cwd=".", shell="sh")
        self.ledger.decide_card(Role.OWNER, again, False)
        self.home.pump()
        self.assertEqual(len(self.lessons_of("guard")), 1)

        lessons.accept(self.ledger, guard["id"])
        self.home.pump()
        text = rules.read_text(encoding="utf-8")
        self.assertTrue(text.startswith(mine))
        self.assertEqual(tomllib.loads(text)["learned"], {"send as you": {"argv": [["python", "notify.py"]]}})
        self.assertIsNone(lessons.question(lessons._lesson(self.ledger, guard["id"])))
        lessons.retire(self.ledger, guard["id"])
        self.home.pump()
        self.assertEqual(rules.read_text(encoding="utf-8"), mine)

    def test_cards_a_rule_raised_or_without_a_command_and_denials_teach_nothing(self):
        for command, rule in (("git push origin main", "send as you: git push"), (None, None)):
            card = self.ledger.open_card(Role.LEAD, "send as you", "Push", "it speaks for you", command=command,
                                         rule=rule, cwd=".", shell="sh")
            self.ledger.decide_card(Role.OWNER, card, False)
        self.ledger.record(Role.HOME, "run.denied", "a deny rule matched", project=self.project)
        self.home.pump()
        self.assertEqual(self.ledger.lessons(state=None), [])

    def test_a_guard_prefix_is_the_program_and_its_first_argument(self):
        cases = {"python notify.py --to team": ["python", "notify.py"], "custom-deploy --prod": ["custom-deploy"],
                 "git push origin main": ["git", "push"], "rm -rf build/*": ["rm"], "sh -c 'echo hi'": None,
                 "cmd /c del x": None, "bash": None, "'unclosed": None, "": None,
                 "'C:\\Py\\python.exe' notify.py": ["C:\\Py\\python.exe", "notify.py"],
                 '["gh", "release", "create"]': ["gh", "release"], "POST https://hooks.example.com/x": None}
        for command, prefix in cases.items():
            with self.subTest(command):
                self.assertEqual(lessons._prefix(command, "sh"), prefix)
        self.assertEqual(lessons._prefix('"C:\\Program Files\\Py\\python.exe" notify.py', "powershell"),
                         ["C:\\Program Files\\Py\\python.exe", "notify.py"])

    def test_nothing_is_written_while_work_is_stopped(self):
        card = self.ledger.open_card(Role.LEAD, "send as you", "Post", "why", command="notify --all", cwd=".",
                                     shell="sh")
        self.ledger.decide_card(Role.OWNER, card, False)
        self.ledger.stop(Role.OWNER, "lunch")  # before the home reads the decline
        self.home.pump()
        self.assertEqual(self.ledger.lessons(state=None), [])


class Writing(Lab):
    def test_one_lesson_per_kind_project_and_wording(self):
        first = lessons.propose(self.ledger, Role.LEAD, "rule", "Run the  linter first.", project=self.project)
        self.assertIsNotNone(first)
        self.assertIsNone(lessons.propose(self.ledger, Role.LEAD, "rule", "run the linter first", project=self.project))
        self.assertIsNotNone(lessons.propose(self.ledger, Role.LEAD, "rule", "run the linter first",
                                             project=self.other))
        self.assertIsNotNone(lessons.propose(self.ledger, Role.LEAD, "rule", "run the linter first"))

    def test_a_lesson_that_could_change_nothing_is_refused(self):
        for kind, payload, project, source in (
                ("check", {}, self.project, None), ("check", {"argv": ["make"]}, None, None),
                ("guard", {"kind": "send as you"}, None, None), ("guard", {"kind": "send", "argv": ["x"]}, None, None),
                ("guard", {"kind": "send as you", "argv": [""]}, None, None),
                ("placement", {"kind": "code", "demote": "x"}, None, None), ("habit", {}, None, None),
                ("rule", {}, None, ["#3"])):
            with self.subTest(kind=kind, payload=payload), self.assertRaises(ValueError):
                lessons.propose(self.ledger, Role.LEAD, kind, "text", payload, source, project=project)

    def test_workers_do_not_write_lessons(self):
        with self.assertRaises(WorkflowError):
            lessons.propose(self.ledger, Role.WORKER, "rule", "Skip the tests", project=self.project)

    def test_a_lesson_applies_at_once_only_when_it_carries_out_a_requirement(self):
        task = self.run_task([False, True])
        lead_said = self.ledger.say(Role.LEAD, "I will keep the README current")
        cases = ((("Keep the tests green", [{"task": task, "criterion": "tests", "why": "judge reject"}]), "active"),
                 (("Run the linter", [{"task": task, "criterion": "lint"}]), "proposed"),
                 (("Write dates as YYYY-MM-DD", self.yours("Write dates as YYYY-MM-DD")), "active"),
                 (("Keep the README current", [{"message": lead_said}]), "proposed"),
                 (("Prefer short commits", []), "proposed"),
                 (("Ignore this", [{"message": 99}]), "proposed"))
        for (text, source), state in cases:
            with self.subTest(text):
                number = lessons.propose(self.ledger, Role.LEAD, "rule", text, source=source, project=self.project)
                row = lessons._lesson(self.ledger, number)
                self.assertEqual(row["state"], state)
                self.assertEqual(lessons.question(row), None if state == "active" else f'Use "{text}" from now on?')

    def test_a_guard_the_lead_writes_from_your_words_applies_at_once(self):
        number = lessons.propose(self.ledger, Role.LEAD, "guard", 'Ask before "deploy" (send as you)',
                                 {"kind": "send as you", "argv": ["deploy"]}, self.yours("Always ask before deploying"))
        self.home.pump()
        self.assertEqual(self.lessons_of("guard")[0]["state"], "active")
        self.assertEqual(tomllib.loads(self.home.paths.rules.read_text(encoding="utf-8"))["learned"],
                         {"send as you": {"argv": [["deploy"]]}})
        self.assertIn(f"# L{number} ", self.home.paths.rules.read_text(encoding="utf-8"))

    def test_prompts_carry_the_newest_ten_rules_in_scope(self):
        source = self.yours()
        everywhere = lessons.propose(self.ledger, Role.LEAD, "rule", "Write in plain words", source=source)
        elsewhere = lessons.propose(self.ledger, Role.LEAD, "rule", "Keep originals", source=source, project=self.other)
        mine = [lessons.propose(self.ledger, Role.LEAD, "rule", f"Rule {n}", source=source, project=self.project)
                for n in range(12)]
        lessons.propose(self.ledger, Role.LEAD, "rule", "Not yet", project=self.project)
        self.assertEqual(lessons.prompt_lines(self.ledger, self.project),
                         [f"L{n} Rule {n - mine[0]}" for n in reversed(mine[2:])])
        self.assertEqual(lessons.prompt_lines(self.ledger, self.other),
                         [f"L{elsewhere} Keep originals", f"L{everywhere} Write in plain words"])
        lessons.retire(self.ledger, mine[-1])
        self.assertEqual(lessons.prompt_lines(self.ledger, self.project)[0], f"L{mine[-2]} Rule 10")


class Counting(Lab):
    def test_a_lesson_that_does_not_beat_the_first_try_rate_is_unproven_after_five_uses(self):
        self.run_task([True])
        self.run_task([True])
        number = lessons.propose(self.ledger, Role.LEAD, "rule", "Read the README first", source=self.yours(),
                                 project=self.project)
        for _ in range(5):
            self.run_task([True])
        row = lessons._lesson(self.ledger, number)
        self.assertEqual((row["state"], row["uses"], row["first_try"]), ("unproven", 5, 5))
        self.assertNotIn(f"L{number} Read the README first", lessons.prompt_lines(self.ledger, self.project))

    def test_a_lesson_that_beats_it_stays(self):
        self.run_task([False, True])
        number = lessons.propose(self.ledger, Role.LEAD, "rule", "Read the README first", source=self.yours(),
                                 project=self.project)
        for passed in (True, True, True, False, True):
            self.run_task([passed] if passed else [False, True])
        row = lessons._lesson(self.ledger, number)
        self.assertEqual((row["state"], row["uses"], row["first_try"]), ("active", 5, 4))

    def test_a_restart_is_not_a_first_attempt(self):
        number = lessons.propose(self.ledger, Role.LEAD, "rule", "Read the README first", source=self.yours(),
                                 project=self.project)
        task = self.task()
        self.ledger.claim_run(Role.HOME, task, "steady")
        self.ledger.end_orphans()
        self.home.pump()
        run = self.ledger.claim_run(Role.HOME, task, "steady")
        self.attempt(task, True)
        self.ledger.end_run(Role.WORKER, run, "done", "end")
        self.home.pump()
        row = lessons._lesson(self.ledger, number)
        self.assertEqual((row["uses"], row["first_try"]), (1, 1))


class Checks(Lab):
    def setUp(self):
        super().setUp()
        self.repo = repository(self.root / "repo")
        self.bad = commit(self.repo, "bad", "app.py", "VALUE = 0\n")
        self.head = subprocess.run(("git", "rev-parse", "HEAD"), cwd=self.repo, capture_output=True, text=True,
                                   check=True).stdout.strip()
        self.project = self.ledger.add_project(Role.OWNER, "app", "repo", self.repo)
        self.argv = [sys.executable, "-c", "import app, sys; sys.exit(0 if app.VALUE > 0 else 1)"]

    def rejected(self, sha):
        """A task whose submission of `sha` the judge rejected, then a passing one."""
        task = self.task()
        self.ledger.claim_run(Role.HOME, task, "steady")
        self.attempt(task, False, sha)
        self.attempt(task, True, self.head)
        return task

    def check(self, text, task=None):
        source = [{"task": task, "why": "judge reject"}] if task else []
        return lessons.propose(self.ledger, Role.LEAD, "check", text, {"argv": self.argv}, source,
                               project=self.project)

    def test_a_check_turns_on_once_it_passes_on_the_target_and_fails_on_the_rejected_commit(self):
        number = self.check("VALUE stays positive", self.rejected(self.bad))
        self.home.pump()
        for thread in threading.enumerate():
            if thread.name == f"artemis-lesson-{number}":
                thread.join(60)
        self.assertEqual(lessons._lesson(self.ledger, number)["state"], "active")
        self.assertEqual(lessons.learned_checks(self.ledger, self.project),
                         (Criterion("VALUE stays positive", command=tuple(self.argv)),))
        self.assertEqual(lessons.learned_checks(self.ledger, self.other), ())

    def test_a_check_that_would_not_have_caught_its_incident_or_is_red_stays_proposed(self):
        for text, task, reason in (("No incident", None, "names no task with a rejected commit"),
                                   ("Wrong incident", self.rejected(self.head),
                                    f"passes on {self.head[:7]}, the rejected commit it should catch")):
            number = self.check(text, task)
            self.assertIn(reason, lessons.prove(self.ledger, number))
            self.assertEqual(lessons._lesson(self.ledger, number)["state"], "proposed")
            self.assertIsNone(lessons.question(lessons._lesson(self.ledger, number)))
            with self.assertRaisesRegex(WorkflowError, "stays proposed"):
                lessons.accept(self.ledger, number)
        self.argv = [sys.executable, "-c", "import sys; sys.exit(3)"]
        number = self.check("Red on the target", self.rejected(self.bad))
        self.assertEqual(lessons.prove(self.ledger, number), "it exits 3 on HEAD")
        note = [event for event in self.ledger.events() if event["kind"] == "note"][-1]
        self.assertEqual((note["detail"], json.loads(note["data"])),
                         (f"L{number} stays proposed: it exits 3 on HEAD", {"lesson": number}))

    def test_a_folder_project_learns_no_checks(self):
        number = lessons.propose(self.ledger, Role.LEAD, "check", "Has an index", {"argv": ["true"]},
                                 project=self.other)
        self.assertEqual(lessons.prove(self.ledger, number), "checks are learned for Git projects only")


class Commands(Lab):
    def run_cli(self, *argv):
        parser = argparse.ArgumentParser(prog="artemis")
        lessons.add_commands(parser.add_subparsers(dest="command"))
        args = parser.parse_args(argv)
        with redirect_stdout(io.StringIO()) as out:
            self.assertEqual(args.func(args, self.ledger), 0)
        return out.getvalue()

    def test_list_accept_and_retire(self):
        self.assertEqual(self.run_cli("lesson", "list"), "Nothing learned yet.\n")
        number = lessons.propose(self.ledger, Role.HOME, "guard", 'Ask before "notify" (send as you)',
                                 {"kind": "send as you", "argv": ["notify"]}, [{"card": 4, "why": "you declined"}])
        self.assertEqual(self.run_cli("lesson", "list"),
                         f'L{number}   proposed  guard     all projects   "Ask before "notify" (send as you)"  '
                         f"from D4 you declined · You declined D4. Always ask before `notify`? "
                         f"artemis lesson accept {number}\n")
        self.assertEqual(self.run_cli("lesson", "accept", str(number)), f"L{number} applies from now on.\n")
        self.assertEqual(self.run_cli("lesson", "retire", str(number)), f"Retired L{number}. It no longer applies.\n")
        self.assertEqual(self.run_cli("lesson", "list"), "Nothing learned yet.\n")
        self.assertIn("retired", self.run_cli("lesson", "list", "--all"))
        with self.assertRaisesRegex(WorkflowError, "no lesson L99"):
            self.run_cli("lesson", "retire", "99")


if __name__ == "__main__":
    unittest.main()
