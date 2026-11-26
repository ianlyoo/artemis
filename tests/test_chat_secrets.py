"""Tests for /secret-requests/*: lead secret_request integration, save/replace/delete, vault rules, and zero leaks."""

from __future__ import annotations

import contextlib
import json
from pathlib import Path
import re
import sqlite3
import time
import unittest
from unittest import mock

from artemis import scrub, web
from artemis.roles import Role
from artemis.vault import Vault
from artemis.web import secret_requests
from test_chat_files import LiveFrameStream
from test_web import AppCase, FAKE, setUpModule  # noqa: F401


FAKE2 = "second-fake-secret-value-9a4e1b"
HEX32 = re.compile(r"[0-9a-f]{32}")


class SecretRequestsTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()

    def _assert_no_value_leaked(self, *values: str, stream_text: str = "") -> None:
        for secret in values:
            self.assertNotIn(secret, stream_text)
            self.assertFalse(any(secret.encode("utf-8") in body for body in self.bodies))
            self.assertNotIn(secret, self.stderr.getvalue())
            for path in [self.home.paths.ledger, *self.home.paths.root.glob("ledger.db*"),
                         *self.home.paths.logs.iterdir()]:
                if path.is_file():
                    self.assertNotIn(secret.encode("utf-8"), path.read_bytes(), path.name)
        with contextlib.closing(sqlite3.connect(self.home.paths.ledger)) as db, db:
            for table in ("secret_requests", "cards", "events", "messages"):
                dump = json.dumps(db.execute(f"SELECT * FROM {table}").fetchall(), ensure_ascii=False)
                for secret in values:
                    self.assertNotIn(secret, dump, table)
        if self.home.vault is not None and self.home.vault.unlocked:
            # app_demo seeds one deliberate GITHUB_TOKEN line in logs/task-4.log for the audit UI test.
            unexpected = [hit for hit in scrub.audit(self.home.vault, self.home.paths).hits
                          if hit != ("logs/task-4.log", "GITHUB_TOKEN", "raw")]
            self.assertEqual(unexpected, [])

    def test_lead_secret_request_tool_save_replace_delete_and_zero_leaks(self):
        stream = LiveFrameStream(self, self.cookie)
        self.addCleanup(stream.close)
        stream.wait_for(lambda fs: len(fs) >= 1, kind="status.labels")

        # 1. Lead opens a secret card via the existing broker `secret_request` tool.
        shop = self.home.ledger.project(self.ids["shop"])
        token_path = self.home.grant(run=0, task=None, project=shop["id"], role="lead",
                                     root=Path(shop["path"]), kind=shop["kind"])
        self.addCleanup(self.home.revoke, 0)
        token = token_path.read_text(encoding="utf-8").strip()
        result = self.home.broker.call(token, "secret_request", {
            "name": "DEPLOY_API_KEY",
            "why": "Publish release notes to the staging service",
            "use": "http",
            "origin": "https://api.staging.example",
            "kind": "send",
        })
        card_id = result["card"]

        # 2. Map the card to its opaque 32-hex external id and read via GET /secret-requests/:id.
        mapped = secret_requests.request_for_card(self.home.ledger, card_id)
        req_id = mapped["id"]
        self.assertRegex(req_id, HEX32)

        st_list, _, listed = self.call("GET", "/secret-requests", cookie=self.cookie)
        self.assertEqual(st_list, 200)
        self.assertIn(req_id, [item["id"] for item in listed["items"]])

        st_get, _, row = self.call("GET", f"/secret-requests/{req_id}", cookie=self.cookie)
        self.assertEqual(st_get, 200)
        self.assertEqual((row["id"], row["key"], row["state"], row["status"]),
                         (req_id, "DEPLOY_API_KEY", "open", "open"))
        self.assertEqual(row["reason"], "Publish release notes to the staging service")
        self.assertNotIn("value", row)
        self.assertNotIn("length", row)

        # 3. Save stores the value in the vault under the card's name and returns only its length.
        st_save, _, saved = self.call("POST", f"/secret-requests/{req_id}/save", {"value": FAKE}, cookie=self.cookie)
        self.assertEqual(st_save, 200)
        self.assertEqual((saved["state"], saved["status"], saved["length"]), ("saved", "saved", len(FAKE)))
        self.assertIn("saved_at", saved)
        self.assertNotIn("value", saved)
        self.assertEqual(self.home.ledger.card(card_id)["state"], "done")
        info = self.home.vault.info("DEPLOY_API_KEY")
        self.assertEqual((info.use, info.kind, info.origin), ("http", "send", "https://api.staging.example"))
        self.assertEqual(self.home.vault.http("DEPLOY_API_KEY", "https://api.staging.example"),
                         ("Authorization", f"Bearer {FAKE}"))

        # 4. Replace reopens it under a fresh 32-hex id; saving updates the vault and supersedes the old request.
        st_rep, _, reopened = self.call("POST", f"/secret-requests/{req_id}/replace", {}, cookie=self.cookie)
        self.assertEqual(st_rep, 201)
        req_id2 = reopened["id"]
        self.assertRegex(req_id2, HEX32)
        self.assertNotEqual(req_id2, req_id)
        self.assertEqual((reopened["key"], reopened["state"], reopened["status"]),
                         ("DEPLOY_API_KEY", "open", "open"))
        self.assertNotIn("value", reopened)

        st_get2, _, row2 = self.call("GET", f"/secret-requests/{req_id2}", cookie=self.cookie)
        self.assertEqual((st_get2, row2["state"]), (200, "open"))
        self.assertNotIn("value", row2)

        st_save2, _, saved2 = self.call("POST", f"/secret-requests/{req_id2}/save",
                                        {"value": FAKE2}, cookie=self.cookie)
        self.assertEqual((st_save2, saved2["state"], saved2["length"]), (200, "saved", len(FAKE2)))
        self.assertNotIn("value", saved2)
        self.assertEqual(self.home.vault.http("DEPLOY_API_KEY", "https://api.staging.example"),
                         ("Authorization", f"Bearer {FAKE2}"))

        # The original request is now superseded and cannot be deleted or replaced.
        st_old, _, old_row = self.call("GET", f"/secret-requests/{req_id}", cookie=self.cookie)
        self.assertEqual((st_old, old_row["state"], old_row.get("superseded")), (200, "superseded", True))
        self.assertEqual(self.call("POST", f"/secret-requests/{req_id}/delete", {}, cookie=self.cookie)[::2],
                         (409, mock.ANY))
        self.assertEqual(self.call("POST", f"/secret-requests/{req_id}/delete", {}, cookie=self.cookie)[2]["error"],
                         "superseded")

        # 5. Delete removes the secret from the vault and marks the request deleted.
        st_del, _, deleted = self.call("POST", f"/secret-requests/{req_id2}/delete", {}, cookie=self.cookie)
        self.assertEqual((st_del, deleted["state"], deleted["status"]), (200, "deleted", "deleted"))
        self.assertIn("deleted_at", deleted)
        self.assertNotIn("length", deleted)
        self.assertNotIn("value", deleted)
        self.assertIsNone(self.home.vault.info("DEPLOY_API_KEY"))

        st_after, _, after = self.call("GET", f"/secret-requests/{req_id2}", cookie=self.cookie)
        self.assertEqual((st_after, after["state"], after["status"]), (200, "deleted", "deleted"))

        stream.close()
        self._assert_no_value_leaked(FAKE, FAKE2, stream_text=stream.text)

    def test_owner_created_secret_request_and_label_secret_guard(self):
        st, _, created = self.call("POST", "/secret-requests", {"label": "Release Webhook"}, cookie=self.cookie)
        self.assertEqual(st, 201)
        self.assertRegex(created["id"], HEX32)
        self.assertEqual((created["key"], created["label"], created["state"]),
                         ("RELEASE_WEBHOOK", "Release Webhook", "open"))

        st_save, _, saved = self.call("POST", f"/secret-requests/{created['id']}/save",
                                      {"value": FAKE}, cookie=self.cookie)
        self.assertEqual((st_save, saved["state"], saved["length"]), (200, "saved", len(FAKE)))
        self.assertEqual(self.home.vault.env(["RELEASE_WEBHOOK"]), {"RELEASE_WEBHOOK": FAKE})

        # Korean label derives a valid uppercase vault name.
        st_ko, _, ko = self.call("POST", "/secret-requests", {"label": "외부 서비스 키"}, cookie=self.cookie)
        self.assertEqual(st_ko, 201)
        self.assertRegex(ko["key"], r"SECRET_[0-9A-F]{8}")

        # Pasting a secret-shaped value into the label field is refused (422) and never recorded.
        pasted = "sk-live-secret-pasted-into-label-field"
        st_bad, _, bad = self.call("POST", "/secret-requests", {"label": pasted}, cookie=self.cookie)
        self.assertEqual((st_bad, bad["error"]), (422, "secret_detected"))
        self._assert_no_value_leaked(FAKE, pasted)

    def test_locked_vault_transport_and_validation_rules_are_reused(self):
        req_id = secret_requests.request_for_card(self.home.ledger, self.ids["newsletter"])["id"]

        # Non-loopback plain HTTP is refused by store_secret's transport rule.
        with mock.patch.object(web, "LOOPBACK", frozenset()):
            st, _, _ = self.call("POST", f"/secret-requests/{req_id}/save", {"value": FAKE}, bearer=True)
        self.assertEqual(st, 403)
        self.assertIsNone(self.home.vault.info("NEWSLETTER_API_KEY"))

        # Locked vault refuses save with 423 and leaves the request open.
        opened = self.home.vault
        self.home.vault = Vault(self.home.paths, "passphrase")
        self.addCleanup(setattr, self.home, "vault", opened)
        st_locked, _, _ = self.call("POST", f"/secret-requests/{req_id}/save", {"value": FAKE}, cookie=self.cookie)
        self.assertEqual(st_locked, 423)
        self.assertEqual(self.call("GET", f"/secret-requests/{req_id}", cookie=self.cookie)[2]["state"], "open")
        self.home.vault = opened

        # Too-short secret value is refused by vault.set (400) and never echoed.
        st_short, _, _ = self.call("POST", f"/secret-requests/{req_id}/save", {"value": "short"}, cookie=self.cookie)
        self.assertEqual(st_short, 400)

        # Save succeeds, then locked vault refuses delete with 423.
        self.assertEqual(self.call("POST", f"/secret-requests/{req_id}/save",
                                   {"value": FAKE}, cookie=self.cookie)[0], 200)
        self.home.vault = Vault(self.home.paths, "passphrase")
        self.assertEqual(self.call("POST", f"/secret-requests/{req_id}/delete", {}, cookie=self.cookie)[0], 423)
        self.home.vault = opened

        # Saving into a brand-new request whose key already exists in vault returns 409 key_taken.
        st_dup, _, dup = self.call("POST", "/secret-requests", {"label": "GitHub Token"}, cookie=self.cookie)
        self.assertEqual((st_dup, dup["key"]), (201, "GITHUB_TOKEN"))
        st_tk, _, tk = self.call("POST", f"/secret-requests/{dup['id']}/save", {"value": FAKE2}, cookie=self.cookie)
        self.assertEqual((st_tk, tk["error"]), (409, "key_taken"))

        # Expired request cannot be saved.
        st_ex, _, ex = self.call("POST", "/secret-requests", {"label": "Expiring Key"}, cookie=self.cookie)
        self.assertEqual(st_ex, 201)
        with contextlib.closing(sqlite3.connect(self.home.paths.ledger)) as db, db:
            db.execute("UPDATE secret_requests SET expires_at = ? WHERE id = ?", (time.time() - 10, ex["id"]))
        self.assertEqual(self.call("GET", f"/secret-requests/{ex['id']}", cookie=self.cookie)[2]["state"], "expired")
        self.assertEqual(self.call("POST", f"/secret-requests/{ex['id']}/save",
                                   {"value": FAKE2}, cookie=self.cookie)[2]["error"], "not_open")

        # Invalid or unknown ids return 404.
        self.assertEqual(self.call("GET", "/secret-requests/not-hex", cookie=self.cookie)[0], 404)
        self.assertEqual(self.call("GET", f"/secret-requests/{'0' * 32}", cookie=self.cookie)[0], 404)

        self._assert_no_value_leaked(FAKE, FAKE2)


if __name__ == "__main__":
    unittest.main()
