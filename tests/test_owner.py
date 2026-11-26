"""Tests for the person's side of the public home (src/artemis/web/owner.py):
approvals with scope_hash and phone_only checks, questions bound to choices fences,
hand-done owner steps, proposed lessons in My turn, runs/completed/timeline with
schedules and lessons, and dashboard turn/groups exports.
"""

import contextlib
import dataclasses
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest import mock

from fixtures import app_demo

from artemis import lessons, schedule, vault as vault_module, web
from artemis.broker import Broker, ToolError
from artemis.config import CardSettings
from artemis.judge import CommandEvidence, Criterion, RuleJudge
from artemis.roles import Interrupt, Role
from artemis.vault import PASSPHRASE_ENV
from artemis.web import owner

from test_web import AppCase, IPHONE, setUpModule  # noqa: F401  (the module's vault passphrase)

RULES = """\
[match."send as you"]
argv = [["python*", "notify.py"]]

[match."irreversible delete"]
argv = [["python*", "wipe.py"]]

[match."money out"]
argv = [["python*", "pay.py"]]
"""

SCRIPT = """\
import sys
from pathlib import Path
Path("ran.log").open("a", encoding="utf-8").write(" ".join(sys.argv[1:]) + "\\n")
print("executed", " ".join(sys.argv[1:]))
"""


def _parse_choices_fence(text: str) -> dict:
    """Extract and parse the first ```choices fence body from a lead chat message."""
    match = re.search(r"```choices\s*\n(.*?)\n```", text, re.S)
    if not match:
        raise AssertionError(f"No choices fence found in: {text!r}")
    return json.loads(match.group(1))


def _fence_option_labels(fence_json: dict) -> list[str]:
    """Option button labels as choices.js parseChoices() extracts them for sameSpec()."""
    labels = []
    for item in fence_json["options"]:
        labels.append(item["label"] if isinstance(item, dict) else item)
    return labels


class OwnerCase(AppCase):
    """A real home server with a clean local folder project, real broker grants, and a spy lead."""

    def setUp(self):
        super().setUp()
        self.cookie = self.owner()
        self.folder = Path(os.path.realpath(self.root / "workspace"))
        self.folder.mkdir()
        for name in ("pay.py", "wipe.py", "notify.py"):
            (self.folder / name).write_text(SCRIPT, encoding="utf-8", newline="\n")
        self.home.broker = Broker(self.home)
        self.home.paths.rules.write_text(RULES, encoding="utf-8", newline="\n")
        self.project = self.home.ledger.add_project(Role.OWNER, "workspace", "folder", self.folder)
        self.request_id = self.home.ledger.request(Role.OWNER, "Prepare the seasonal release", project=self.project)
        self.task_id = self.home.ledger.add_task(
            Role.LEAD,
            self.request_id,
            "Run release checklist",
            "Run the checklist scripts.",
            (Criterion("script ran", exists="ran.log"),),
            project=self.project,
            kind="host",
        )
        self.run_id = self.home.ledger.claim_run(Role.HOME, self.task_id, "mock")
        self.worker_token = self.home.grant(
            self.run_id, self.task_id, self.project, "worker", self.folder, "folder"
        ).read_text(encoding="utf-8").strip()
        self.lead_token = self.home.grant(
            0, None, self.project, "lead", self.folder, "folder"
        ).read_text(encoding="utf-8").strip()
        self.wakes: list[str] = []
        self.home.lead = SimpleNamespace(wake=self.wakes.append, turn=lambda _msg: None)
        # Advance the event cursor to now so follow() observes only events created by each test.
        self.home._cursor = max((row["id"] for row in self.home.ledger.events()), default=0)

    def pair_phone(self) -> str:
        """Pair and allow a second browser whose User-Agent identifies a phone."""
        token = self.home.new_pair_token()
        status, response, data = self.call("POST", "/api/pair", {"token": token}, headers={"User-Agent": IPHONE})
        self.assertEqual(status, 200)
        self.assertTrue(data["device"]["phone"])
        device_id = data["device"]["id"]
        cookie = response.getheader("Set-Cookie").split("=", 1)[1].split(";", 1)[0]
        allow_status, _, _ = self.call("POST", f"/api/devices/{device_id}/allow", {}, cookie=self.cookie)
        self.assertEqual(allow_status, 200)
        return cookie

    def ran_lines(self) -> list[str]:
        log = self.folder / "ran.log"
        return log.read_text(encoding="utf-8").splitlines() if log.is_file() else []


class ApprovalProofTest(OwnerCase):
    """Proof (1): real held command -> GET /approvals/:id, scope_hash & phone_only checks, broker execution."""

    def test_held_command_approved_with_scope_hash_is_carried_out_by_broker(self):
        phone_cookie = self.pair_phone()
        for script, expected_kind in (("pay.py", Interrupt.SPEND), ("wipe.py", Interrupt.DELETE),
                                      ("notify.py", Interrupt.SEND)):
            approver = phone_cookie if expected_kind in self.home.config.cards.phone_only else self.cookie
            with self.subTest(kind=expected_kind):
                held = self.home.broker.call(self.worker_token, "run", {"argv": [sys.executable, script, expected_kind]})
                self.assertEqual(held["state"], "held")
                card_id = held["card"]

                status, _, shown = self.call("GET", f"/approvals/{card_id}", cookie=self.cookie)
                self.assertEqual(status, 200)
                self.assertEqual(shown["id"], card_id)
                self.assertEqual(shown["goal_id"], self.request_id)
                self.assertEqual(shown["kind"], expected_kind)
                self.assertEqual(shown["level"], "owner")
                self.assertEqual(shown["status"], "pending")
                self.assertRegex(shown["scope_hash"], r"^[0-9a-f]{64}$")
                self.assertEqual(shown["scope_hash"], owner.scope_hash(self.home.ledger.card(card_id)))
                self.assertIn(script, shown["scope_text"])
                self.assertIsNotNone(shown["created_at"])
                self.assertIsNone(shown["decided_at"])

                # Also listed at GET /db/read?kind=approvals
                r_status, _, listing = self.call("GET", "/db/read?kind=approvals", cookie=self.cookie)
                self.assertEqual(r_status, 200)
                self.assertTrue(listing["ok"])
                self.assertIn(card_id, {item["id"] for item in listing["items"]})

                # Missing scope_hash -> 400, unchanged
                bad_status, _, _ = self.call("POST", f"/approvals/{card_id}/decide", {"verdict": "approve"},
                                             cookie=self.cookie)
                self.assertEqual(bad_status, 400)
                self.assertEqual(self.home.ledger.card(card_id)["state"], "waiting")

                # Wrong scope_hash -> 409, unchanged
                wrong_status, _, wrong_body = self.call(
                    "POST", f"/approvals/{card_id}/decide",
                    {"verdict": "approve", "scope_hash": "0" * 64}, cookie=self.cookie,
                )
                self.assertEqual(wrong_status, 409)
                self.assertTrue(wrong_body.get("stale"))
                self.assertEqual(self.home.ledger.card(card_id)["state"], "waiting")

                # Approve with the matching scope_hash -> approved, then carried out by broker
                ok_status, _, decided = self.call(
                    "POST", f"/approvals/{card_id}/decide",
                    {"verdict": "approve", "scope_hash": shown["scope_hash"]}, cookie=approver,
                )
                self.assertEqual(ok_status, 200)
                self.assertTrue(decided["ok"])
                self.assertEqual(decided["status"], "approved")
                self.assertEqual(decided["approval"]["status"], "approved")
                self.assertIsNotNone(decided["decided_at"])

                self.home.run_cards()
                self.until(lambda: self.home.ledger.card(card_id)["state"] == "done")
                self.assertIn(expected_kind, self.ran_lines())
                self.assertIn(f"executed {expected_kind}", self.home.ledger.card(card_id)["result"])

                # Re-deciding an already approved card is refused (409)
                again_status, _, _ = self.call(
                    "POST", f"/approvals/{card_id}/decide",
                    {"verdict": "deny", "scope_hash": shown["scope_hash"]}, cookie=self.cookie,
                )
                self.assertEqual(again_status, 409)

    def test_stale_scope_hash_is_refused_and_changes_nothing(self):
        held = self.home.broker.call(self.worker_token, "run", {"argv": [sys.executable, "notify.py", "v1"]})
        card_id = held["card"]
        _, _, first = self.call("GET", f"/approvals/{card_id}", cookie=self.cookie)
        stale_hash = first["scope_hash"]

        # Simulate the card's scope changing after GET was rendered
        with contextlib.closing(sqlite3.connect(self.home.ledger.path)) as db, db:
            db.execute("UPDATE cards SET command = ? WHERE id = ?",
                       (json.dumps([sys.executable, "notify.py", "v2-changed"]), card_id))

        _, _, refreshed = self.call("GET", f"/approvals/{card_id}", cookie=self.cookie)
        self.assertNotEqual(refreshed["scope_hash"], stale_hash)

        status, _, body = self.call(
            "POST", f"/approvals/{card_id}/decide",
            {"verdict": "approve", "scope_hash": stale_hash}, cookie=self.cookie,
        )
        self.assertEqual(status, 409)
        self.assertTrue(body.get("stale"))
        self.assertEqual(self.home.ledger.card(card_id)["state"], "waiting")
        self.home.run_cards()
        self.assertEqual(self.ran_lines(), [])

    def test_phone_only_kind_is_refused_from_non_phone_and_allowed_from_phone(self):
        """Whatever kind the setup leaves to the phone (money out, or a post sent as the person) only a paired phone
        approves; the desktop and the CLI can still decline it."""
        phone_cookie = self.pair_phone()
        for script, kind in (("pay.py", Interrupt.SPEND), ("notify.py", Interrupt.SEND)):
            with self.subTest(kind=kind):
                status, _, chosen = self.call("POST", "/api/setup", {"ask": list(Interrupt), "phone_only": [kind]},
                                              cookie=self.cookie)
                self.assertEqual((status, chosen["phone_only"]), (200, [kind]))
                held = self.home.broker.call(self.worker_token, "run", {"argv": [sys.executable, script, f"{kind}-1"]})
                card_id = held["card"]
                _, _, shown = self.call("GET", f"/approvals/{card_id}", cookie=self.cookie)
                self.assertEqual((shown["kind"], shown["approve_here"]), (kind, False))
                self.assertTrue(self.call("GET", f"/approvals/{card_id}", cookie=phone_cookie)[2]["approve_here"])
                approve = {"verdict": "approve", "scope_hash": shown["scope_hash"]}

                desk_status, _, desk_body = self.call("POST", f"/approvals/{card_id}/decide", approve, cookie=self.cookie)
                self.assertEqual(desk_status, 403)
                self.assertIn("paired phone", desk_body["error"])
                cli_status, _, _ = self.call("POST", f"/approvals/{card_id}/decide", approve, bearer=True)
                self.assertEqual(cli_status, 403)
                self.assertEqual(self.home.ledger.card(card_id)["state"], "waiting")

                phone_status, _, decided = self.call("POST", f"/approvals/{card_id}/decide", approve, cookie=phone_cookie)
                self.assertEqual((phone_status, decided["status"]), (200, "approved"))
                self.home.run_cards()
                self.until(lambda: self.home.ledger.card(card_id)["state"] == "done")
                self.assertIn(f"{kind}-1", self.ran_lines())

                held2 = self.home.broker.call(self.worker_token, "run", {"argv": [sys.executable, script, f"{kind}-2"]})
                card2 = held2["card"]
                _, _, shown2 = self.call("GET", f"/approvals/{card2}", cookie=self.cookie)
                deny_status, _, denied = self.call(
                    "POST", f"/approvals/{card2}/decide",
                    {"verdict": "deny", "scope_hash": shown2["scope_hash"], "reason": "Not needed"}, cookie=self.cookie,
                )
                self.assertEqual((deny_status, denied["status"]), (200, "denied"))
                self.assertEqual(self.home.ledger.card(card2)["state"], "declined")


class QuestionProofTest(OwnerCase):
    """Proof (2): lead `ask` choice -> GET /questions matches choices fence; answer records pick and wakes lead."""

    def test_lead_choice_matches_fence_and_answering_wakes_lead(self):
        opened = self.home.broker.call(self.lead_token, "ask", {
            "kind": "choice",
            "what": "Which rollout option should run first?",
            "why": "Both paths are ready.",
            "options": [{"id": "dry", "label": "Dry run"}, {"id": "tag", "label": "Tag directly"}],
        })
        card_id = opened["card"]

        # Lead's chat text carries a ```choices fence matching the question's spec
        linked = [m for m in self.home.ledger.messages() if m["card_id"] == card_id]
        self.assertEqual(len(linked), 1)
        lead_msg = linked[0]
        self.assertEqual(lead_msg["role"], "lead")
        fence_spec = _parse_choices_fence(lead_msg["text"])

        status, _, payload = self.call("GET", "/questions", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(payload["refused"], [])
        self.assertIsNotNone(payload["latest"])
        record = next(item for item in payload["items"] if item["id"] == card_id)
        self.assertEqual(record["conversation_id"], lead_msg["id"])
        _, _, asked = self.call("GET", f"/db/read?kind=conversation&id={record['conversation_id']}", cookie=self.cookie)
        self.assertEqual(asked["item"]["text"], lead_msg["text"])
        self.assertEqual(self.call("GET", "/db/read?kind=conversation&id=999999", cookie=self.cookie)[0], 404)
        self.assertEqual(record["fence"], 0)
        self.assertEqual(record["status"], "open")
        self.assertIsNone(record["answer"])
        self.assertEqual(record["notes"], [])
        # sameSpec() agreement: spec.options matches the fence's parsed option labels
        self.assertEqual(record["spec"]["options"], _fence_option_labels(fence_spec))
        self.assertEqual(record["spec"]["q"], fence_spec["q"])

        # Comment-only note keeps the question open
        note_status, _, noted = self.call(
            "POST", f"/questions/{card_id}/answer", {"comment": "Checking staging first"}, cookie=self.cookie,
        )
        self.assertEqual(note_status, 200)
        self.assertEqual(noted["status"], "open")
        self.assertEqual([n["text"] for n in noted["notes"]], ["Checking staging first"])
        self.home.follow()
        self.assertEqual(self.wakes, [])

        # Answering records the pick and wakes the lead
        ans_status, _, answered = self.call(
            "POST", f"/questions/{card_id}/answer",
            {"picks": ["Dry run"], "comment": "Safer first"}, cookie=self.cookie,
        )
        self.assertEqual(ans_status, 200)
        self.assertEqual(answered["status"], "answered")
        self.assertEqual(answered["answer"], {"picks": ["Dry run"], "comment": "Safer first"})
        self.assertIsNotNone(answered["ended_at"])
        card_row = self.home.ledger.card(card_id)
        self.assertEqual((card_row["state"], card_row["answer"]), ("done", "dry"))

        self.home.follow()
        self.until(lambda: bool(self.wakes))
        self.assertTrue(any(f"card {card_id} was answered (card.answered)" in reason for reason in self.wakes))

        # Re-answering with a pick is refused (409)
        dup_status, _, _ = self.call(
            "POST", f"/questions/{card_id}/answer", {"picks": ["Tag directly"]}, cookie=self.cookie,
        )
        self.assertEqual(dup_status, 409)

    def test_long_option_labels_fit_choices_max_and_stay_answerable(self):
        """Agents now give a button-length label (the broker refuses more); a card stored before that, with a
        long label, still shows a button of at most OPTION_MAX characters and the whole label under it."""
        options = [{"id": "compact", "label": "Compact view"},
                   {"id": "detailed", "label": "Full breakdown with monthly comparison columns"}]
        card_id = self.home.ledger.open_card(Role.LEAD, "choice", "Pick the summary layout", "Two templates exist.",
                                             options=options)
        self.home.ledger.say(Role.LEAD, owner.choice_fence("Pick the summary layout", options), card=card_id)
        lead_msg = next(m for m in self.home.ledger.messages() if m["card_id"] == card_id)
        fence_spec = _parse_choices_fence(lead_msg["text"])
        _, _, payload = self.call("GET", "/questions", cookie=self.cookie)
        record = next(item for item in payload["items"] if item["id"] == card_id)
        self.assertEqual(record["spec"]["options"], _fence_option_labels(fence_spec))
        self.assertTrue(all(len(lbl) <= owner.OPTION_MAX for lbl in record["spec"]["options"]))
        self.assertEqual(record["spec"]["details"][1]["line"], "Full breakdown with monthly comparison columns")

        status, _, answered = self.call(
            "POST", f"/questions/{card_id}/answer", {"picks": [record["spec"]["options"][1]]}, cookie=self.cookie,
        )
        self.assertEqual(status, 200)
        self.assertEqual(answered["status"], "answered")
        self.assertEqual(self.home.ledger.card(card_id)["answer"], "detailed")


class OwnerStepProofTest(OwnerCase):
    """Proof (3): lead opens a `step` card -> /db/read?kind=owner_steps&id=N -> /owner-steps/:id/done wakes lead."""

    def test_step_card_read_and_done_wakes_lead(self):
        # Workers cannot open step cards
        with self.assertRaises(ToolError):
            self.home.broker.call(self.worker_token, "ask", {
                "kind": "step", "what": "Sign in manually", "why": "2FA prompt",
            })

        opened = self.home.broker.call(self.lead_token, "ask", {
            "kind": "step",
            "what": "Confirm external backup drive is mounted",
            "why": "Only you can connect the physical drive.",
            "link": "https://backup.example/check",
        })
        step_id = opened["card"]
        self.assertEqual(self.home.ledger.card(step_id)["kind"], "step")

        # Lead's chat text carries a ```step <id> fence
        lead_msg = next(m for m in self.home.ledger.messages() if m["card_id"] == step_id)
        self.assertIn(f"```step {step_id}", lead_msg["text"])

        # Visible at GET /db/read?kind=owner_steps&id=N
        status, _, body = self.call("GET", f"/db/read?kind=owner_steps&id={step_id}", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        item = body["item"]
        self.assertEqual(item["id"], step_id)
        self.assertEqual(item["status"], "live")
        self.assertEqual(item["text"], "Confirm external backup drive is mounted")
        self.assertEqual(item["link"], "https://backup.example/check")
        self.assertIsNone(item["cleared_at"])

        # Appears in turn() and groups()
        self.assertIn(("step", step_id), {(t["kind"], t["id"]) for t in owner.turn(self.home.ledger)})
        self.assertTrue(any(
            action["kind"] == "step" and action["id"] == step_id
            for grp in owner.groups(self.home.ledger) for action in grp["actions"]
        ))

        # POST /owner-steps/:id/done clears it and wakes the lead
        done_status, _, done_body = self.call("POST", f"/owner-steps/{step_id}/done", {}, cookie=self.cookie)
        self.assertEqual(done_status, 200)
        self.assertTrue(done_body["ok"])
        self.assertEqual(done_body["item"]["status"], "cleared")
        self.assertIsNotNone(done_body["item"]["cleared_at"])

        # Read back shows cleared; gone from turn()
        _, _, after = self.call("GET", f"/db/read?kind=owner_steps&id={step_id}", cookie=self.cookie)
        self.assertEqual(after["item"]["status"], "cleared")
        self.assertNotIn(("step", step_id), {(t["kind"], t["id"]) for t in owner.turn(self.home.ledger)})

        self.home.follow()
        self.until(lambda: bool(self.wakes))
        self.assertTrue(any(f"card {step_id} was answered (card.answered)" in reason for reason in self.wakes))

        # Re-completing returns 409
        again_status, _, _ = self.call("POST", f"/owner-steps/{step_id}/done", {}, cookie=self.cookie)
        self.assertEqual(again_status, 409)

    def test_quiet_step_done_clears_without_waking_lead(self):
        step_id = self.home.broker.call(self.lead_token, "ask", {
            "kind": "step", "what": "Check local port", "why": "Manual verification",
        })["card"]
        status, _, body = self.call("POST", f"/owner-steps/{step_id}/done", {"quiet": True}, cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(body["item"]["status"], "cleared")
        self.home.follow()
        time.sleep(0.05)
        self.assertEqual(self.wakes, [])
        # Missing step returns 404
        self.assertEqual(self.call("GET", "/db/read?kind=owner_steps&id=99999", cookie=self.cookie)[0], 404)


class ProposedLessonProofTest(OwnerCase):
    """A proposed lesson is a Yes/No question in My turn; Yes and No do what /api/lessons/:id/accept|retire do."""

    def test_proposed_lesson_in_my_turn_accept_retire_and_timeline(self):
        proposed_a = self.home.broker.call(self.lead_token, "lesson", {
            "kind": "rule", "text": "Always sort release artifacts before checks", "project": "workspace",
        })["lesson"]
        proposed_b = self.home.broker.call(self.lead_token, "lesson", {
            "kind": "rule", "text": "Skip changelog header on draft runs", "project": "workspace",
        })["lesson"]

        asks = {item["what"]: item for item in owner.turn(self.home.ledger) if item["kind"] == "question"}
        card_a = asks["Use “Always sort release artifacts before checks” from now on?"]["id"]
        card_b = asks["Use “Skip changelog header on draft runs” from now on?"]["id"]
        _, _, questions = self.call("GET", "/questions", cookie=self.cookie)
        record = next(item for item in questions["items"] if item["id"] == card_a)
        self.assertEqual(record["spec"]["options"], ["Yes", "No"])
        said = [row for row in self.home.ledger.messages(limit=50) if row["card_id"] == card_a]
        self.assertEqual([(row["role"], row["text"].split("\n")[0]) for row in said], [("lead", "```choices")],
                         "it is asked in the chat, where Admin's link finds it")
        group_keys = {grp["key"] for grp in owner.groups(self.home.ledger)}
        self.assertTrue({f"question:{card_a}", f"question:{card_b}"} <= group_keys)

        # Yes on lesson A's card, as To-do, the chat and Admin answer it
        status, _, answered = self.call("POST", f"/questions/{card_a}/answer", {"picks": ["Yes"]}, cookie=self.cookie)
        self.assertEqual((status, answered["status"]), (200, "answered"))
        self.assertEqual({row["id"]: row["state"] for row in self.home.ledger.lessons(state=None)}[proposed_a], "active")
        self.assertNotIn(card_a, {t["id"] for t in owner.turn(self.home.ledger)})

        # Retire lesson B through /api/lessons/:id/retire: its card is answered No
        ret_status, _, ret_body = self.call("POST", f"/api/lessons/{proposed_b}/retire", {}, cookie=self.cookie)
        self.assertEqual(ret_status, 200)
        self.assertEqual(ret_body["state"], "retired")
        self.assertEqual((self.home.ledger.card(card_b)["state"], self.home.ledger.card(card_b)["answer"]),
                         ("done", "retire"))
        self.assertNotIn(card_b, {t["id"] for t in owner.turn(self.home.ledger)})

        # Start a new task while L<proposed_a> is active -> timeline shows "learned L<a>" and "lesson L<a> applied"
        req = self.home.ledger.request(Role.OWNER, "Verify sorted release", project=self.project)
        task = self.home.ledger.add_task(
            Role.LEAD, req, "Sort check", "Run check.",
            (Criterion("file exists", exists="ran.log"),), project=self.project, kind="host",
        )
        self.home.ledger.claim_run(Role.HOME, task, "mock")

        tl_status, _, timeline = self.call("GET", "/timeline", cookie=self.cookie)
        self.assertEqual(tl_status, 200)
        summaries = [ev["summary"] for ev in timeline["events"]]
        self.assertTrue(any(f"learned L{proposed_a}" in s for s in summaries), summaries)
        self.assertTrue(any(f"lesson L{proposed_a} applied" in s for s in summaries), summaries)


class RunsCompletedTimelineProofTest(OwnerCase):
    """Proof (5): /runs, /completed, /timeline contract shapes, plus schedule run and verified result."""

    def test_runs_completed_and_timeline_with_schedule_verified_result(self):
        # Start an active broker job alongside the active worker run
        job_id = self.home.ledger.start_job(
            json.dumps([sys.executable, "check.py"]), str(self.folder), "sh",
            run=self.run_id, task=self.task_id,
        )
        status, _, runs = self.call("GET", "/runs", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertTrue(runs["ok"])
        self.assertIsInstance(runs["version"], int)
        self.assertEqual(runs["ships"], [])
        running_ids = [item["id"] for item in runs["running"]]
        self.assertEqual(len(running_ids), len(set(running_ids)))
        self.assertIn(self.run_id, running_ids)
        self.assertIn(job_id, {item.get("job_id") for item in runs["running"]})
        self.assertTrue(all(item["status"] == "running" and item["started_at"] for item in runs["running"]))

        version_before = runs["version"]
        self.home.ledger.end_job(job_id, 0, "ok")
        self.home.ledger.end_run(Role.HOME, self.run_id, "done", "finished")
        _, _, runs_after = self.call("GET", "/runs", cookie=self.cookie)
        self.assertNotEqual(runs_after["version"], version_before)
        self.assertNotIn(self.run_id, [item["id"] for item in runs_after["running"]])
        self.assertNotIn(job_id, {item.get("job_id") for item in runs_after["running"]})

        # Create and fire a schedule, run it, submit evidence, and verify it through RuleJudge
        window_start_ms = int((time.time() - 5) * 1000)
        check_cmd = (sys.executable, "-c", "print('ok')")
        sched_id = self.home.ledger.add_schedule(
            Role.LEAD, self.project, "Nightly integrity check", "Run integrity probe.",
            "host", (Criterion("integrity ok", command=check_cmd),), "every 6h", time.time() - 10,
        )
        [sched_task] = schedule.tick(self.home.ledger, now=time.time())
        sched_req = self.home.ledger.task_brief(sched_task)["request_id"]
        sched_run = self.home.ledger.claim_run(Role.HOME, sched_task, "mock")
        self.home.ledger.submit(
            Role.WORKER, sched_task, "host:" + "a" * 64, "Integrity check passed",
            {1: CommandEvidence(check_cmd, 0, "ok")},
        )
        verdict = self.home.ledger.judge(Role.JUDGE, sched_task, RuleJudge())
        self.assertEqual(verdict.kind, "pass")
        self.home.ledger.end_run(Role.HOME, sched_run, "done", "verified")
        window_end_ms = int((time.time() + 5) * 1000)

        # Also add a dropped request and an in-progress request to check filtering in /completed
        dropped_req = self.home.ledger.request(Role.OWNER, "Deprecated migration", project=self.project)
        dropped_task = self.home.ledger.add_task(
            Role.LEAD, dropped_req, "Run old migration", "",
            (Criterion("done", exists="ran.log"),), project=self.project, kind="host",
        )
        self.home.ledger.drop(Role.LEAD, dropped_task, "Superseded")

        # GET /completed includes the verified scheduled goal and dropped goal, excludes in-progress goals, and paginates
        c_status, _, completed = self.call("GET", "/completed", cookie=self.cookie)
        self.assertEqual(c_status, 200)
        self.assertTrue(completed["ok"])
        self.assertIsInstance(completed["has_more"], bool)
        self.assertIn("total", completed)
        self.assertIn("counts", completed)
        sched_item = next(item for item in completed["items"] if item["id"] == sched_req)
        self.assertEqual(sched_item["goal_id"], sched_req)
        self.assertEqual(sched_item["status"], "done")
        self.assertIsNotNone(sched_item["done_at"])
        self.assertIsNotNone(sched_item["created_at"])
        self.assertEqual(sched_item["requests"][0]["id"], sched_req)
        dropped_item = next(item for item in completed["items"] if item["id"] == dropped_req)
        self.assertEqual(dropped_item["status"], "dropped")
        self.assertGreaterEqual(completed["counts"]["dropped"], 1)
        self.assertNotIn(self.request_id, {item["id"] for item in completed["items"]})

        # Pagination with limit=1
        p1_status, _, page1 = self.call("GET", "/completed?limit=1", cookie=self.cookie)
        self.assertEqual(p1_status, 200)
        self.assertEqual(len(page1["items"]), 1)
        self.assertTrue(page1["has_more"])
        self.assertIsNotNone(page1["next"])
        p2_status, _, page2 = self.call("GET", f"/completed?limit=1&before={page1['next']}", cookie=self.cookie)
        self.assertEqual(p2_status, 200)
        self.assertEqual(len(page2["items"]), 1)
        self.assertNotEqual(page1["items"][0]["id"], page2["items"][0]["id"])

        # GET /timeline returns the contract shape + schedule's run and verified result
        t_status, _, timeline = self.call(
            "GET", f"/timeline?start={window_start_ms}&end={window_end_ms}", cookie=self.cookie,
        )
        self.assertEqual(t_status, 200)
        self.assertEqual(timeline["schema_version"], 1)
        self.assertTrue(timeline["ok"])
        self.assertEqual(timeline["owner_intervals"], {"items": []})
        self.assertEqual(set(timeline["metadata"]), {"goals", "projects", "agents"})
        self.assertEqual(timeline["window"]["start"], window_start_ms)
        self.assertEqual(timeline["window"]["end"], window_end_ms)
        self.assertIn("event_set_revision", timeline["coverage"])

        sched_events = [ev for ev in timeline["events"] if ev["project_id"] == sched_task]
        kinds = [ev["kind"] for ev in sched_events]
        self.assertIn("schedule.fired", kinds)
        self.assertIn("agent.turn_started", kinds)
        self.assertIn("report.progress", kinds)
        self.assertIn("agent.child_completed", kinds)
        self.assertTrue(any("Schedule verified" in ev["summary"] for ev in sched_events), sched_events)
        self.assertIn(f"run-{sched_run}", {a["id"] for a in timeline["metadata"]["agents"]})
        sched_proj = next(p for p in timeline["metadata"]["projects"] if p["id"] == sched_task)
        self.assertEqual((sched_proj["schedule_id"], sched_proj["status"]), (sched_id, "done"))


class DashboardExportsProofTest(OwnerCase):
    """Proof (6): turn(ledger) and groups(ledger) exports + auth/origin gating on new routes."""

    def test_turn_and_groups_group_same_goal_and_require_auth(self):
        # Add both an approval and a step under the same goal (request)
        card_app = self.home.ledger.open_card(
            Role.HOME, Interrupt.SEND, "Publish release post", "Speaks as you.",
            request=self.request_id, task=self.task_id,
        )
        card_step = self.home.ledger.open_card(
            Role.LEAD, "step", "Verify signing key", "Hardware token required.",
            request=self.request_id, task=self.task_id, options={"link": "https://keys.example/verify"},
        )
        # Expired card must NOT appear in turn or groups
        expired_card = self.home.ledger.open_card(
            Role.HOME, Interrupt.SEND, "Old expired card", "Expired.",
            request=self.request_id, expires=time.time() - 60,
        )

        items = owner.turn(self.home.ledger)
        by_key = {(item["kind"], item["id"]): item for item in items}
        self.assertIn(("approval", card_app), by_key)
        self.assertIn(("step", card_step), by_key)
        self.assertEqual(by_key[("step", card_step)]["link"], "https://keys.example/verify")
        self.assertNotIn(("approval", expired_card), by_key)

        grps = owner.groups(self.home.ledger)
        goal_group = next(g for g in grps if g["key"] == f"goal:{self.request_id}")
        self.assertEqual(goal_group["label"], "Your turn")
        self.assertEqual(goal_group["requests"][0]["id"], self.request_id)
        action_keys = [a["key"] for a in goal_group["actions"]]
        self.assertIn(f"approval:{card_app}", action_keys)
        self.assertIn(f"step:{card_step}", action_keys)

        # Auth and origin gates apply to all owner routes
        for path in (f"/approvals/{card_app}", "/questions", f"/db/read?kind=owner_steps&id={card_step}",
                     "/runs", "/completed", "/timeline"):
            self.assertEqual(self.call("GET", path)[0], 401, path)
        self.assertEqual(
            self.call("POST", f"/owner-steps/{card_step}/done", {}, cookie=self.cookie, origin=False)[0], 403,
        )


if __name__ == "__main__":
    unittest.main()
