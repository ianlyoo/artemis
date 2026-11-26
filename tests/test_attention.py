from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
import urllib.error
import urllib.request

from artemis import attention, lessons
from artemis.demo_receiver import DemoReceiver
from artemis.home import Paths, hold
from artemis.judge import CommandEvidence, Criterion, RuleJudge
from artemis.ledger import Check, Ledger
from artemis.roles import Role


CHECK = ("python3", "-m", "unittest")
LOOPBACK = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class Desk(unittest.TestCase):
    """Two projects with one of everything the person can be shown."""

    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        self.ledger = ledger = Ledger(root / "ledger.db")
        ledger.initialize()
        self.site = ledger.add_project(Role.OWNER, "site", "repo", root / "site")
        self.photos = ledger.add_project(Role.OWNER, "photos", "folder", root / "photos")
        self.columns = self.enterContext(mock.patch.dict(os.environ, {"COLUMNS": "200"}))

        shipped = self.task(self.site, "Add a JSON export")
        run = ledger.claim_run(Role.HOME, shipped, "codex")
        self.passed(shipped, "b" * 40)
        ledger.end_run(Role.WORKER, run, "done", "verified")
        ledger.record_checks(shipped, "b" * 40, "c" * 40, (Check(CHECK, 0, "0" * 64),))
        ledger.land(shipped, "b" * 40, True)

        host = self.task(self.photos, "Sort the holiday photos", Criterion("summary.csv 14 rows", command=CHECK))
        run = ledger.claim_run(Role.HOME, host, "claude")
        self.passed(host, "host:" + "d" * 64)
        ledger.end_run(Role.WORKER, run, "done", "verified")

        ledger.claim_run(Role.HOME, self.task(self.site, "Fix the footer"), "codex")
        stuck = self.task(self.site, "Rename the CSS files")
        ledger.end_run(Role.WORKER, ledger.claim_run(Role.HOME, stuck, "codex"), "stuck", "no result after 20 min")
        self.task(self.site, "Write the changelog")

        pushed = ledger.open_card(Role.HOME, "send as you", "Push the release", "it publishes as you",
                                  project=self.site, command="git push origin main", cwd=".", shell="sh")
        ledger.decide_card(Role.OWNER, pushed, True)
        ledger.claim_card(Role.HOME, pushed)
        job = ledger.start_job("git push origin main", ".", "sh", card=pushed)
        ledger.end_job(job, 0, "")
        ledger.finish_card(Role.HOME, pushed, "done", "pushed")
        ledger.open_card(Role.LEAD, "money out", "Renew the domain", "it spends money", project=self.site)
        choice = ledger.open_card(Role.LEAD, "choice", "Which album name?", "it is yours to pick", project=self.photos,
                                  options=[{"id": "a", "label": "Summer"}, {"id": "b", "label": "Coast"}])
        ledger.choose(Role.OWNER, choice, "b")
        secret = ledger.open_card(Role.WORKER, "secret", "Upload token", "the task uploads", project=self.photos,
                                  options={"name": "DEMO_UPLOAD_TOKEN", "kind": "none"})
        ledger.secret_set(Role.OWNER, secret)
        ledger.open_card(Role.HOME, "send as you", "Post the note", "it speaks for you", project=self.site,
                         expires=1.0)
        ledger.expire_cards()
        declined = ledger.open_card(Role.HOME, "send as you", "Notify everyone", "it speaks for you",
                                    command="notify --all", cwd=".", shell="sh")
        ledger.decide_card(Role.OWNER, declined, False)

        lessons.propose(ledger, Role.HOME, "guard", 'Ask before "notify" (send as you)',
                        {"kind": "send as you", "argv": ["notify"]}, [{"card": declined, "why": "you declined"}])
        lessons.propose(ledger, Role.LEAD, "rule", "List every flag in the README", project=self.site,
                        source=[{"message": ledger.say(Role.OWNER, "List every flag in the README")}])
        ledger.note(Role.LEAD, "The photos look like two separate trips", project=self.photos)
        for reason in ("a card was answered", "task #4 is stuck"):
            ledger.record(Role.HOME, "lead.wake", reason)

    def task(self, project, title, criterion=Criterion("tests", command=CHECK)):
        request = self.ledger.request(Role.OWNER, title, project)
        return self.ledger.add_task(Role.LEAD, request, title, "", (criterion,), project=project)

    def passed(self, task, sha):
        self.ledger.submit(Role.WORKER, task, sha, "done", {1: CommandEvidence(CHECK, 0, "OK")})
        self.assertEqual(self.ledger.judge(Role.JUDGE, task, RuleJudge()).kind, "pass")


class Digest(Desk):
    def test_every_line_has_its_label_and_evidence(self):
        result = attention.digest(self.ledger)
        self.assertEqual([(line.label, line.ref) for line in result.lines], [
            ("shipped", "#1"), ("verified", "#2"), ("running", "#3"), ("queued", "#5"), ("decided", "D1"),
            ("decided", "D3"), ("decided", "D4"), ("decided", "D6"), ("waiting", "D2"), ("waiting", "D7"), ("learned", "L1"),
            ("learned", "L2"), ("stuck", "#4"), ("stuck", "D5"), ("inferred", "")])
        proof = {line.ref or line.label: line.proof for line in result.lines}
        self.assertEqual(proof["#1"], "main ccccccc · tests")
        self.assertEqual(proof["#2"], "summary.csv 14 rows")
        self.assertEqual(proof["#4"], "no result after 20 min · yours: artemis retry 4")
        self.assertEqual(proof["D1"], "you approved · ran: exit 0")
        self.assertEqual(proof["D3"], "you chose Coast")
        self.assertEqual(proof["D4"], "you set DEMO_UPLOAD_TOKEN (the value went to the vault)")
        self.assertEqual(proof["D5"], "expired before you answered · nothing ran · ask again if you still want it")
        self.assertEqual(proof["D6"], "you declined")
        self.assertEqual(proof["D2"], "money out · for you")
        self.assertEqual(proof["L1"], "from D6 you declined · You declined D6. Always ask before `notify`? "
                                      "artemis lesson accept 1")
        self.assertEqual(proof["L2"], "from your words in chat")
        self.assertEqual([line.question for line in result.lines if line.label == "learned"],
                         ["You declined D6. Always ask before `notify`?", None])
        self.assertEqual(result.counts["wakes"], 2)

    def test_the_lead_has_stuck_work_only_while_a_home_with_a_lead_runs(self):
        def shown():
            proof = {line.ref: line.proof for line in attention.digest(self.ledger).lines}
            return proof["#4"], proof["D5"], proof["D2"], attention.statusline(self.ledger).split(" · ")[3]

        self.ledger.decide_card(Role.OWNER, 2, True)        # money out with nothing to run: a lead carries it out
        yours = ("no result after 20 min · yours: artemis retry 4",
                 "expired before you answered · nothing ran · ask again if you still want it",
                 "you approved · no lead runs to carry it out", "1 stuck (yours)")
        self.ledger.record(Role.HOME, "home.started", "with a lead", data={"lead": True})
        self.assertEqual(shown(), yours)                    # the home that said so is not running
        lock = hold(Paths.at(self.ledger.path.parent))
        self.addCleanup(lock.close)
        self.assertEqual(shown(), ("no result after 20 min · the lead has it",
                                   "expired before you answered · nothing ran · the lead has it",
                                   "you approved · the lead is carrying it out", "1 stuck (lead)"))
        self.ledger.record(Role.HOME, "home.started", "without a lead", data={"lead": False})
        self.assertEqual(shown(), yours)

    def test_a_command_card_reads_as_a_command_line(self):
        python = json.dumps([sys.executable, "notify.py", "Post the note"])
        program = Path(sys.executable).name.removesuffix(".exe")   # python.exe reads as python
        shown = {"posix": f"{program} notify.py 'Post the note'", "nt": f'{program} notify.py "Post the note"'}[os.name]
        self.assertEqual(attention.command_line(python), shown)
        hidden = str(self.ledger.path.parent / "bin" / "python3")
        self.assertEqual(attention.command_line(json.dumps([hidden, "x.py"])), f"{hidden} x.py")
        found = shutil.which("git")
        if found:
            self.assertEqual(attention.command_line(json.dumps([found, "push"])), "git push")
        self.assertEqual(attention.command_line("git push origin main"), "git push origin main")
        card = self.ledger.open_card(Role.LEAD, "send as you", "Post the note", "it speaks for you",
                                     project=self.site, command=python, cwd=".", shell="sh")
        self.assertIn(f"\n  Runs: {shown}\n", attention.card(self.ledger, self.ledger.card(card)))

    def test_the_text_groups_projects_and_counts_what_your_attention_bought(self):
        text = attention.digest(self.ledger).text.splitlines()
        self.assertRegex(text[0], r"^Last \d+ min · asked you 7× · 2 done · 2 stuck · 2 wakes$")
        self.assertEqual([line for line in text if not line.startswith("  ")][1:],
                         ["site (repo)", "photos (folder)", "all projects"])
        self.assertIn("  verified  #2 Sort the holiday photos             summary.csv 14 rows", text)
        self.assertIn('  learned   L2 "List every flag in the README" · from your words in chat', text)
        self.assertEqual(text[-1], '  learned   L1 "Ask before "notify" (send as you)" · from D6 you declined · '
                                   "You declined D6. Always ask before `notify`? artemis lesson accept 1")

    def test_lines_fit_a_narrow_terminal_and_a_legacy_windows_console(self):
        with mock.patch.dict(os.environ, {"COLUMNS": "60"}):
            text = attention.digest(self.ledger).text
            status = attention.status(self.ledger)
        for line in text.splitlines() + status.splitlines():
            with self.subTest(line):
                self.assertLessEqual(len(line), 60)
        (text + status + attention.inbox(self.ledger)).encode("cp1252")

    def test_one_project_and_catching_up(self):
        lines = attention.digest(self.ledger, self.photos, mark=True).lines
        self.assertEqual([line.ref or line.label for line in lines], ["#2", "D3", "D4", "inferred"])
        self.assertTrue(attention.digest(self.ledger, self.photos).text.endswith("\nNothing changed."))
        self.assertEqual([line.ref for line in attention.digest(self.ledger).lines], ["D2", "D7", "#4"])

    def test_host_lines_name_the_property_that_was_checked(self):
        cases = (({"label": "x", "exists": "summary.csv"}, {"path": "summary.csv", "found": True, "changed": True},
                  "summary.csv written"),
                 ({"label": "x", "exists": "out"}, {"path": "out", "found": True, "changed": None}, "out exists"),
                 ({"label": "x", "contains": ["notes.md", "Friday"]}, {"found": True}, "notes.md mentions Friday"),
                 ({"label": "x", "count": ["sorted/*.jpg", 1]}, {"glob": "sorted/*.jpg", "matched": 14},
                  "14 files match sorted/*.jpg"),
                 ({"label": "x", "count": ["a/*", 1]}, {"glob": "a/*", "matched": 1}, "1 file matches a/*"),
                 ({"label": "x", "preserved": ["inbox/*", "sorted/**"]},
                  {"source": "inbox/*", "target": "sorted/**", "expected": 14, "missing": []},
                  "14 files, every digest preserved"))
        for criterion, evidence, phrase in cases:
            with self.subTest(phrase):
                self.assertEqual(attention._phrase(criterion, evidence), phrase)
        self.assertEqual(attention._joined(["14 files, every digest preserved", "summary.csv 14 rows"]),
                         "14 files, every digest preserved · summary.csv 14 rows")
        self.assertEqual(attention._joined(["summary.csv exists", "summary.csv mentions total", "summary.csv mentions 14"]),
                         "summary.csv mentions total, 14")


class Views(Desk):
    def test_status_line_status_and_inbox(self):
        self.assertEqual(attention.statusline(self.ledger),
                         "1 running · 1 queued · 2 decisions for you · 1 stuck (yours) · asked you 7× · 2 done")
        self.assertEqual(attention.statusline(self.ledger, self.photos), "0 running · asked you 2× · 1 done")
        status = attention.status(self.ledger).splitlines()
        self.assertEqual([line.split()[0] for line in status[1:]], ["site", "running", "stuck", "queued", "waiting"])
        self.assertIn("money out · artemis approve 2", status[-1])
        inbox = attention.inbox(self.ledger)
        self.assertTrue(inbox.startswith("Decision 2 · money out · site\n  Renew the domain"))
        self.assertIn("  If you do nothing: nothing happens.", inbox)
        self.assertEqual(attention.inbox(self.ledger, self.photos), "Nothing is waiting for you.")
        self.ledger.stop(Role.OWNER, "lunch")
        self.assertTrue(attention.statusline(self.ledger).startswith("stopped by you · 1 running"))


class Receiver(Desk):
    def send(self, url, body, method="POST"):
        request = urllib.request.Request(url, data=body, method=method)
        try:
            with LOOPBACK.open(request, timeout=10) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    def test_the_digest_compares_what_arrived_with_the_card_you_approved(self):
        body = b'{"text": "Release 1.2 is out"}'
        digest = sha256(body).hexdigest()
        with DemoReceiver(self.ledger, self.site) as receiver:
            held = json.dumps({"method": "POST", "url": receiver.url, "headers": {}, "body_sha256": digest,
                               "save_to": None})  # as the http_request tool records a held request
            posts = []
            for sent in (body, b'{"text": "something else"}'):
                card = self.ledger.open_card(Role.HOME, "send as you", f"POST {receiver.url}", "it speaks for you",
                                             project=self.site, command=held, secrets=("DEMO_HOOK_TOKEN",))
                self.ledger.decide_card(Role.OWNER, card, True)
                self.assertEqual(self.send(receiver.url, sent), 204)
                self.ledger.claim_card(Role.HOME, card)
                self.ledger.finish_card(Role.HOME, card, "done", "HTTP 204")
                posts.append(card)
            self.assertEqual((self.send(receiver.url.replace("/hook", "/other"), body),
                              self.send(receiver.url, None, "GET")), (404, 405))
            shown = attention.card(self.ledger, self.ledger.card(posts[0]))
        self.assertTrue(shown.startswith(f"Decision {posts[0]} · send as you · site\n  POST to the local demo "
                                         "receiver\n"), shown)
        self.assertIn(f"  Sends: POST {receiver.url} (the local demo receiver) · body sha256 {digest[:12]}\n", shown)
        self.assertNotIn("Runs:", shown)
        lines = {line.ref: line for line in attention.digest(self.ledger).lines}
        self.assertEqual(lines[f"D{posts[0]}"].title, "POST to the local demo receiver")
        self.assertEqual(lines[f"D{posts[0]}"].proof, f"you approved · it got that exact body (sha256 {digest[:7]})")
        self.assertRegex(lines[f"D{posts[1]}"].proof, r"^you approved · it got a different body \(sha256 [0-9a-f]{7}; "
                                                      rf"the card said {digest[:7]}\)$")
        received = [event for event in self.ledger.events() if event["kind"] == "demo.received"]
        self.assertEqual(len(received), 2)

    def test_a_web_request_elsewhere_is_named_by_host_and_path(self):
        held = json.dumps({"method": "PUT", "url": "https://user@hooks.example.com/team/notes?draft=1", "headers": {},
                           "body_sha256": "0" * 64, "save_to": None})
        card = self.ledger.open_card(Role.HOME, "send as you", "PUT https://hooks.example.com/team/notes?draft=1",
                                     "it speaks for you", project=self.site, command=held)
        self.ledger.decide_card(Role.OWNER, card, True)
        self.ledger.claim_card(Role.HOME, card)
        self.ledger.finish_card(Role.HOME, card, "done", "200 OK\n{\"ok\": true}")
        line = next(line for line in attention.digest(self.ledger).lines if line.ref == f"D{card}")
        self.assertEqual((line.title, line.proof), ("PUT to hooks.example.com/team/notes", "you approved · 200 OK"))


if __name__ == "__main__":
    unittest.main()
