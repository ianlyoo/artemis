"""Tests for chat uploads, media serving, the message queue, chat.queue SSE frames, and drain(server)."""

from __future__ import annotations

import base64
import contextlib
import hashlib
import http.client
import json
from pathlib import Path
import socket
import sqlite3
from tempfile import TemporaryDirectory
import threading
import time
import unittest
from unittest import mock

from artemis import web
from artemis.ledger import Ledger
from artemis.roles import Role
from artemis.web import chat_files
from test_web import AppCase, DESKTOP, setUpModule  # noqa: F401


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"
)


class LiveFrameStream:
    """An open GET /events stream collecting SSE frames in the background."""

    def __init__(self, case: AppCase, cookie: str, query: str = ""):
        self.sock = socket.create_connection(("127.0.0.1", case.port), timeout=10)
        path = f"/events?{query}" if query else "/events"
        self.sock.sendall((f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{case.port}\r\n"
                           f"Cookie: {web.COOKIE}={cookie}\r\n\r\n").encode())
        self.text = ""
        self.lock = threading.Lock()
        self.ended = threading.Event()
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        try:
            while chunk := self.sock.recv(65536):
                with self.lock:
                    self.text += chunk.decode("utf-8", "replace")
            self.ended.set()
        except OSError:
            pass

    def frames(self, kind: str | None = None) -> list[dict]:
        with self.lock:
            raw = self.text
        found = []
        for block in raw.split("\r\n\r\n", 1)[-1].split("\n\n"):
            for line in block.splitlines():
                if line.startswith("data: "):
                    frame = json.loads(line[6:])
                    if kind is None or frame.get("kind") == kind:
                        found.append(frame)
        return found

    def wait_for(self, predicate, kind: str = "chat.queue", seconds: float = 6.0) -> list[dict]:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            matched = self.frames(kind)
            if predicate(matched):
                return matched
            time.sleep(0.03)
        raise AssertionError(f"Timed out waiting for {kind} frame; got {self.frames(kind)!r}")

    def close(self):
        with contextlib.suppress(OSError):
            self.sock.shutdown(socket.SHUT_RDWR)
        self.sock.close()


class MessageMigrationTest(unittest.TestCase):
    def test_existing_ledger_without_attachments_column_migrates_cleanly(self):
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "ledger.db"
            ledger = Ledger(db_path)
            ledger.initialize()
            # Simulate a pre-migration v3 messages table lacking the attachments column.
            with contextlib.closing(sqlite3.connect(db_path)) as db, db:
                db.executescript(
                    "PRAGMA foreign_keys = OFF;"
                    "CREATE TABLE messages_old (id INTEGER PRIMARY KEY, at REAL NOT NULL, "
                    "role TEXT NOT NULL CHECK(role IN ('you', 'lead', 'artemis')), "
                    "text TEXT NOT NULL, project_id INTEGER REFERENCES projects, card_id INTEGER, turn TEXT);"
                    "INSERT INTO messages_old(at, role, text) VALUES (1.0, 'you', 'earlier note');"
                    "DROP TABLE messages;"
                    "ALTER TABLE messages_old RENAME TO messages;"
                    "DROP TABLE chat_queue;"
                )
            ledger.initialize()
            row = ledger.message(1)
            self.assertEqual(row["text"], "earlier note")
            self.assertEqual(row["attachments"], "[]")
            msg_id = ledger.say(Role.OWNER, "with attachment", attachments=[{"kind": "file", "name": "a.txt"}])
            self.assertEqual(json.loads(ledger.message(msg_id)["attachments"]), [{"kind": "file", "name": "a.txt"}])


class UploadTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()

    def raw_call(self, method: str, path: str, body: bytes | None = None, *, headers: dict | None = None,
                 cookie: str | None = None, origin: bool = True):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        sent = {"Host": f"127.0.0.1:{self.port}", "User-Agent": DESKTOP}
        if method == "POST" and origin:
            sent["Origin"] = self.origin
        if cookie:
            sent["Cookie"] = f"{web.COOKIE}={cookie}"
        sent.update(headers or {})
        try:
            conn.request(method, path, body=body, headers=sent)
            resp = conn.getresponse()
            raw = resp.read()
            return resp.status, dict(resp.getheaders()), raw
        finally:
            conn.close()

    def test_upload_stores_by_content_hash_and_serves_with_security_headers(self):
        payload = b"hello report body\n"
        digest = hashlib.sha256(payload).hexdigest()
        status, _, raw = self.raw_call(
            "POST", "/chat/upload?name=%EB%B3%B4%EA%B3%A0%EC%84%9C.txt",
            body=payload, headers={"Content-Type": "text/plain; charset=utf-8"}, cookie=self.cookie,
        )
        self.assertEqual(status, 200)
        body = json.loads(raw)
        self.assertTrue(body["ok"])
        self.assertEqual(body["file"]["name"], "보고서.txt")
        self.assertEqual(body["file"]["size"], len(payload))
        self.assertEqual(body["file"]["mimeType"], "text/plain")
        self.assertEqual(body["id"], body["file"]["id"])

        blob = self.home.paths.root / "uploads" / "blobs" / digest[:2] / digest
        self.assertTrue(blob.is_file())
        self.assertEqual(blob.read_bytes(), payload)

        # Identical bytes under a second filename deduplicate to the same content-addressed blob.
        status2, _, raw2 = self.raw_call(
            "POST", "/chat/upload?name=copy.txt", body=payload,
            headers={"Content-Type": "text/plain"}, cookie=self.cookie,
        )
        self.assertEqual(status2, 200)
        second = json.loads(raw2)["file"]
        self.assertNotEqual(second["id"], body["id"])
        self.assertEqual(list((self.home.paths.root / "uploads" / "blobs" / digest[:2]).iterdir()), [blob])

        # Attach both an inline image and the uploaded file to a ledger message and serve each back.
        attached = chat_files.prepare_attachments(
            self.home.paths,
            upload_ids=[body["id"]],
            images=[{"data": base64.b64encode(PNG_BYTES).decode("ascii"), "mimeType": "image/png"}],
        )
        msg_id = self.home.ledger.say(Role.OWNER, "see attached", attachments=attached)
        images, files = chat_files.message_media(msg_id, self.home.ledger.message(msg_id)["attachments"])
        self.assertEqual(images, [{"url": f"/chat/images/{msg_id}/0", "mimeType": "image/png"}])
        self.assertEqual(files, [{"name": "보고서.txt", "size": len(payload), "mimeType": "text/plain",
                                  "url": f"/chat/files/{msg_id}/0"}])

        st, hdrs, got = self.raw_call("GET", files[0]["url"], cookie=self.cookie)
        hdrs_l = {k.lower(): v for k, v in hdrs.items()}
        self.assertEqual((st, got), (200, payload))
        self.assertEqual(hdrs_l["content-type"], "text/plain")
        self.assertEqual(hdrs_l["x-content-type-options"], "nosniff")
        self.assertTrue(hdrs_l["content-disposition"].startswith("attachment;"))
        self.assertIn("filename*=UTF-8''%EB%B3%B4%EA%B3%A0%EC%84%9C.txt", hdrs_l["content-disposition"])

        st_i, hdrs_i, got_i = self.raw_call("GET", images[0]["url"], cookie=self.cookie)
        hdrs_il = {k.lower(): v for k, v in hdrs_i.items()}
        self.assertEqual((st_i, got_i), (200, PNG_BYTES))
        self.assertEqual(hdrs_il["content-type"], "image/png")
        self.assertEqual(hdrs_il["x-content-type-options"], "nosniff")
        self.assertTrue(hdrs_il["content-disposition"].startswith("inline;"))

        # Direct upload serving works too, and non-image uploads are refused on /chat/images.
        self.assertEqual(self.raw_call("GET", f"/chat/files/{body['id']}/0", cookie=self.cookie)[0], 200)
        self.assertEqual(self.raw_call("GET", f"/chat/images/{body['id']}/0", cookie=self.cookie)[0], 404)
        self.assertEqual(self.raw_call("GET", f"/chat/files/{msg_id}/9", cookie=self.cookie)[0], 404)
        self.assertEqual(self.raw_call("GET", f"/chat/files/{msg_id}/0")[0], 401)

    def test_upload_accepts_multi_megabyte_within_cap_and_refuses_over_cap_or_bad_type(self):
        # 2 MiB upload exceeds the 1 MiB JSON MAX_BODY but fits the 25 MiB upload cap.
        two_mb = b"a" * (2 * 1024 * 1024)
        st, _, raw = self.raw_call("POST", "/chat/upload?name=large.bin", body=two_mb,
                                   headers={"Content-Type": "application/octet-stream"}, cookie=self.cookie)
        self.assertEqual(st, 200)
        self.assertEqual(json.loads(raw)["size"], len(two_mb))

        # Over the 25 MiB cap is refused with 413 file_too_large (both unread large Content-Length and small cap).
        with socket.create_connection(("127.0.0.1", self.port), timeout=10) as raw_sock:
            raw_sock.sendall((
                f"POST /chat/upload?name=huge.bin HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n"
                f"Origin: {self.origin}\r\nCookie: {web.COOKIE}={self.cookie}\r\n"
                f"Content-Type: application/octet-stream\r\n"
                f"Content-Length: {chat_files.MAX_UPLOAD_BYTES + 2 * 1024 * 1024}\r\n\r\n"
            ).encode())
            response_text = b"".join(iter(lambda: raw_sock.recv(4096), b"")).decode("utf-8", "replace")
        self.assertTrue(response_text.startswith("HTTP/1.1 413"), response_text)
        self.assertIn("file_too_large", response_text)

        with mock.patch.object(chat_files, "MAX_UPLOAD_BYTES", 64):
            st_cap, _, raw_cap = self.raw_call(
                "POST", "/chat/upload?name=too-big.txt", body=b"x" * 65,
                headers={"Content-Type": "text/plain"}, cookie=self.cookie,
            )
            self.assertEqual(st_cap, 413)
            self.assertEqual(json.loads(raw_cap)["error"], "file_too_large")

        # Disallowed types, empty bodies, and bad filenames are refused.
        for bad_type in ("text/html", "image/svg+xml", "application/javascript",
                         "application/x-msdownload", "not-a-type"):
            st_t, _, raw_t = self.raw_call(
                "POST", "/chat/upload?name=bad.dat", body=b"<script>alert(1)</script>",
                headers={"Content-Type": bad_type}, cookie=self.cookie,
            )
            self.assertEqual(st_t, 415, bad_type)
            self.assertEqual(json.loads(raw_t)["error"], "invalid_type", bad_type)

        st_e, _, raw_e = self.raw_call("POST", "/chat/upload?name=empty.txt", body=b"",
                                       headers={"Content-Type": "text/plain"}, cookie=self.cookie)
        self.assertEqual((st_e, json.loads(raw_e)["error"]), (400, "empty_file"))

        for bad_name in ("", "..", "sub%2Ffile.txt"):
            st_n, _, raw_n = self.raw_call("POST", f"/chat/upload?name={bad_name}", body=b"abc",
                                           headers={"Content-Type": "text/plain"}, cookie=self.cookie)
            self.assertEqual((st_n, json.loads(raw_n)["error"]), (400, "invalid_name"))


class QueueTest(AppCase):
    """The lead is writing an answer throughout, so what is queued waits (test_conversation sends it when idle)."""

    def setUp(self):
        super().setUp()
        self.cookie = self.owner()
        busy = mock.patch.object(self.server, "idle", return_value=False)
        busy.start()
        self.addCleanup(busy.stop)

    def test_queue_lifecycle_revision_check_and_sse_frames(self):
        stream = LiveFrameStream(self, self.cookie)
        self.addCleanup(stream.close)
        stream.wait_for(lambda frames: len(frames) >= 1)
        self.assertEqual(stream.frames("chat.queue")[0]["payload"], {"agentId": "lead", "items": []})

        # Add item 1
        st, _, res = self.call("POST", "/chat/queue/add",
                               {"agentId": "lead", "id": "q-1", "text": "first queued"}, cookie=self.cookie)
        self.assertEqual(st, 200)
        self.assertTrue(res["ok"])
        self.assertEqual((res["item"]["id"], res["item"]["revision"], res["item"]["state"], res["item"]["held"]),
                         ("q-1", 1, "queued", False))
        frames = stream.wait_for(lambda fs: len(fs) >= 2 and len(fs[-1]["payload"]["items"]) == 1)
        self.assertEqual(frames[-1]["payload"]["items"][0]["text"], "first queued")

        # Idempotent retry with same id + text succeeds; conflict returns 409
        st_dup, _, res_dup = self.call("POST", "/chat/queue/add",
                                       {"agentId": "lead", "id": "q-1", "text": "first queued"}, cookie=self.cookie)
        self.assertEqual((st_dup, res_dup["item"]["id"]), (200, "q-1"))
        st_cf, _, res_cf = self.call("POST", "/chat/queue/add",
                                     {"agentId": "lead", "id": "q-1", "text": "different"}, cookie=self.cookie)
        self.assertEqual((st_cf, res_cf["error"]), (409, "message_conflict"))

        # Hold item 1 (revision stays 1 so edit-save after hold succeeds as queue.js expects)
        count = len(stream.frames("chat.queue"))
        st_h, _, res_h = self.call("POST", "/chat/queue/hold",
                                   {"agentId": "lead", "id": "q-1", "hold": True}, cookie=self.cookie)
        self.assertEqual((st_h, res_h["item"]["held"], res_h["item"]["status"], res_h["item"]["revision"]),
                         (200, True, "held", 1))
        frames = stream.wait_for(lambda fs: len(fs) > count and fs[-1]["payload"]["items"][0]["held"] is True)
        self.assertEqual(frames[-1]["payload"]["items"][0]["status"], "held")

        # Edit with wrong revision is refused
        st_bad, _, res_bad = self.call("POST", "/chat/queue/edit",
                                       {"agentId": "lead", "id": "q-1", "text": "nope", "revision": 9},
                                       cookie=self.cookie)
        self.assertEqual((st_bad, res_bad["error"]), (409, "revision_conflict"))

        # Edit with right revision updates text, bumps revision, releases hold, and sends chat.queue frame
        count = len(stream.frames("chat.queue"))
        st_ed, _, res_ed = self.call("POST", "/chat/queue/edit",
                                     {"agentId": "lead", "id": "q-1", "text": "edited text", "revision": 1},
                                     cookie=self.cookie)
        self.assertEqual((st_ed, res_ed["item"]["text"], res_ed["item"]["revision"], res_ed["item"]["held"]),
                         (200, "edited text", 2, False))
        frames = stream.wait_for(lambda fs: len(fs) > count and fs[-1]["payload"]["items"][0]["revision"] == 2)
        self.assertEqual(frames[-1]["payload"]["items"][0]["text"], "edited text")

        # Stale revision is now refused
        self.assertEqual(self.call("POST", "/chat/queue/edit",
                                   {"agentId": "lead", "id": "q-1", "text": "stale", "revision": 1},
                                   cookie=self.cookie)[0], 409)

        # Cancel removes item from active queue and emits chat.queue frame
        count = len(stream.frames("chat.queue"))
        st_c, _, res_c = self.call("POST", "/chat/queue/cancel", {"agentId": "lead", "id": "q-1"}, cookie=self.cookie)
        self.assertEqual((st_c, res_c["item"]["state"]), (200, "canceled"))
        stream.wait_for(lambda fs: len(fs) > count and fs[-1]["payload"]["items"] == [])
        self.assertEqual(self.call("POST", "/chat/queue/edit",
                                   {"agentId": "lead", "id": "q-1", "text": "after cancel", "revision": 2},
                                   cookie=self.cookie)[2]["error"], "not_queued")

        # Upload a file, add item 2 with that attachment, and send_now delivers it with attachment + emits frame
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request("POST", "/chat/upload?name=notes.txt", body=b"queued attachment",
                     headers={"Host": f"127.0.0.1:{self.port}", "Origin": self.origin,
                              "Cookie": f"{web.COOKIE}={self.cookie}", "Content-Type": "text/plain"})
        up = json.loads(conn.getresponse().read())
        conn.close()

        self.assertEqual(self.call("POST", "/chat/queue/add",
                                   {"agentId": "lead", "id": "q-2", "text": "send right away",
                                    "attachments": [up["id"]]}, cookie=self.cookie)[0], 200)
        count = len(stream.frames("chat.queue"))
        with mock.patch.object(self.server, "answer") as answer:
            st_sn, _, res_sn = self.call("POST", "/chat/queue/send_now",
                                         {"agentId": "lead", "id": "q-2"}, cookie=self.cookie)
        self.assertEqual((st_sn, res_sn["ok"], res_sn["item"]["state"]), (200, True, "sent"))
        msg_id = res_sn["messageId"]
        answer.assert_called_once_with(msg_id)
        msg = self.home.ledger.message(msg_id)
        self.assertEqual(msg["text"], "send right away")
        self.assertEqual(json.loads(msg["attachments"])[0]["name"], "notes.txt")
        stream.wait_for(lambda fs: len(fs) > count and fs[-1]["payload"]["items"] == [])

    def test_drain_delivers_oldest_unheld_item_exactly_once(self):
        self.assertEqual(self.call("POST", "/chat/queue/add",
                                   {"agentId": "lead", "id": "d-1", "text": "first in line"}, cookie=self.cookie)[0], 200)
        self.assertEqual(self.call("POST", "/chat/queue/add",
                                   {"agentId": "lead", "id": "d-2", "text": "second in line"}, cookie=self.cookie)[0], 200)

        # Holding the oldest item blocks drain (preserves FIFO order).
        self.assertEqual(self.call("POST", "/chat/queue/hold",
                                   {"agentId": "lead", "id": "d-1", "hold": True}, cookie=self.cookie)[0], 200)
        with mock.patch.object(self.server, "answer") as answer:
            self.assertIsNone(chat_files.drain(self.server))
            answer.assert_not_called()

        # Releasing the hold lets drain hand the oldest item to the say path once.
        self.assertEqual(self.call("POST", "/chat/queue/hold",
                                   {"agentId": "lead", "id": "d-1", "hold": False}, cookie=self.cookie)[0], 200)
        with mock.patch.object(self.server, "answer") as answer:
            sent = chat_files.drain(self.server)
        self.assertIsNotNone(sent)
        self.assertEqual((sent["id"], sent["state"]), ("d-1", "sent"))
        answer.assert_called_once_with(sent["messageId"])
        self.assertEqual(self.home.ledger.message(sent["messageId"])["text"], "first in line")

        # Concurrent drain calls race for the one remaining item; exactly one wins and calls say once.
        delivered: list[str] = []
        say_lock = threading.Lock()

        def fake_say(text: str, *, attachments=None) -> int:
            with say_lock:
                delivered.append(text)
            return self.home.ledger.say(Role.OWNER, text, attachments=attachments)

        self.server.say = fake_say
        self.addCleanup(delattr, self.server, "say")
        barrier = threading.Barrier(8)
        results: list[dict | None] = []
        res_lock = threading.Lock()

        def worker():
            barrier.wait()
            out = chat_files.drain(self.server)
            with res_lock:
                results.append(out)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(5)

        won = [item for item in results if item is not None]
        self.assertEqual(len(won), 1)
        self.assertEqual(won[0]["id"], "d-2")
        self.assertEqual(delivered, ["second in line"])
        self.assertIsNone(chat_files.drain(self.server))

        # Queued item with an inline image drains into messages.attachments and serves from /chat/images/:id/0.
        del self.server.say
        st_img, _, _ = self.call(
            "POST", "/chat/queue/add",
            {"agentId": "lead", "id": "d-img", "text": "with picture",
             "images": [{"data": base64.b64encode(PNG_BYTES).decode("ascii"), "mimeType": "image/png"}]},
            cookie=self.cookie,
        )
        self.assertEqual(st_img, 200)
        with mock.patch.object(self.server, "answer"):
            drained_img = chat_files.drain(self.server)
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request("GET", f"/chat/images/{drained_img['messageId']}/0",
                     headers={"Host": f"127.0.0.1:{self.port}", "Cookie": f"{web.COOKIE}={self.cookie}"})
        resp = conn.getresponse()
        body_bytes = resp.read()
        conn.close()
        self.assertEqual((resp.status, body_bytes), (200, PNG_BYTES))
        self.assertEqual(resp.getheader("Content-Type"), "image/png")
        self.assertEqual(resp.getheader("X-Content-Type-Options"), "nosniff")
        self.server.say = fake_say

    def test_queue_cap_refuses_twenty_first_item(self):
        for i in range(chat_files.MAX_QUEUE):
            st, _, _ = self.call("POST", "/chat/queue/add",
                                 {"agentId": "lead", "id": f"cap-{i}", "text": f"msg {i}"}, cookie=self.cookie)
            self.assertEqual(st, 200)
        st, _, data = self.call("POST", "/chat/queue/add",
                                {"agentId": "lead", "id": "cap-over", "text": "too many"}, cookie=self.cookie)
        self.assertEqual((st, data["error"]), (409, "queue_full"))


if __name__ == "__main__":
    unittest.main()
