"""The conversation in the App: the chat frames on GET /events and the /chat/* paths."""

import contextlib
import json
import os
import socket
import threading
import time
import unittest
from datetime import datetime
from unittest import mock

from test_web import AppCase, setUpModule  # noqa: F401  (the module's vault passphrase)

from artemis import agents, web
from artemis.web.fences import segments


class Frames:
    """An open GET /events stream, read in the background; frames() parses what came so far. It returns once the
    opening frames arrive: the server subscribes and marks the ledger before it sends them, so whatever a test does
    next reaches this stream as its own frame instead of landing in the opening snapshot."""

    def __init__(self, case: AppCase, cookie: str, query: str = ""):
        self.sock = socket.create_connection(("127.0.0.1", case.port), timeout=10)
        self.sock.sendall((f"GET /events{query} HTTP/1.1\r\nHost: 127.0.0.1:{case.port}\r\n"
                           f"Cookie: {web.COOKIE}={cookie}\r\n\r\n").encode())
        self.text, self.lock = "", threading.Lock()
        threading.Thread(target=self.read, daemon=True).start()
        case.addCleanup(self.close)
        self.until(bool)

    def read(self):
        with contextlib.suppress(OSError):
            while chunk := self.sock.recv(65536):
                with self.lock:
                    self.text += chunk.decode("utf-8", "replace")

    def frames(self) -> list[dict]:
        with self.lock:
            body = self.text.split("\r\n\r\n", 1)[-1]
        return [json.loads(line[6:]) for block in body.split("\n\n") for line in block.splitlines()
                if line.startswith("data: ")]

    def until(self, done, seconds: float = 10.0) -> list[dict]:
        deadline = time.time() + seconds
        while time.time() < deadline:
            found = self.frames()
            if done(found):
                return found
            time.sleep(0.05)
        raise AssertionError(f"not seen in time; frames: {[frame['kind'] for frame in self.frames()]}")

    def close(self):
        with contextlib.suppress(OSError):
            self.sock.shutdown(socket.SHUT_RDWR)
        self.sock.close()


def kinds(frames, kind):
    return [frame["payload"] for frame in frames if frame["kind"] == kind]


class ConversationTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()

    def post(self, path, body, status=200):
        code, _, data = self.call("POST", path, body, cookie=self.cookie)
        self.assertEqual(code, status, data)
        return data

    def get(self, path, status=200):
        code, _, data = self.call("GET", path, cookie=self.cookie)
        self.assertEqual(code, status, data)
        return data

    def test_a_stream_opens_with_the_conversation_and_the_lead(self):
        frames = Frames(self, self.cookie).until(lambda found: kinds(found, "chat.roster"))
        order = [frame["kind"] for frame in frames]
        self.assertLess(order.index("status.labels"), order.index("chat.snapshot"))
        snapshot = kinds(frames, "chat.snapshot")[0]
        self.assertEqual(snapshot["agent"], {"id": "lead", "title": "Lead"})
        self.assertEqual(snapshot["turn"]["running"], False)
        texts = [item["text"] for item in snapshot["items"]]
        self.assertEqual(texts, [row["text"] for row in self.home.ledger.messages(limit=50)])
        assistant = next(item for item in snapshot["items"] if item["role"] == "assistant")
        self.assertEqual(assistant["segments"], segments(assistant["text"]))
        self.assertEqual(kinds(frames, "chat.state")[0]["controls"]["cancel"], False)
        self.assertEqual(kinds(frames, "chat.roster")[0]["agents"][0]["role"], "lead")
        self.assertEqual(kinds(frames, "chat.settings")[0]["model"]["id"], "mock")
        self.call("POST", "/api/setup", {"name": "Juno"}, cookie=self.cookie)
        renamed = Frames(self, self.cookie).until(lambda found: kinds(found, "chat.snapshot"))
        self.assertEqual(kinds(renamed, "chat.snapshot")[0]["agent"]["title"], "Juno")

    def test_a_sent_message_echoes_streams_the_reply_and_ends_the_turn(self):
        stream = Frames(self, self.cookie)
        sent = self.post("/chat/send", {"id": "4C1D", "text": "How is the release going?"})
        self.assertEqual(sent, {"ok": True, "messageId": "home-4C1D"})
        self.assertEqual(self.post("/chat/send", {"id": "4C1D", "text": "How is the release going?"}), sent)
        frames = stream.until(lambda found: kinds(found, "chat.turn") and kinds(found, "chat.turn")[-1]["phase"] == "idle")
        items = kinds(frames, "chat.item")
        echo = next(item for item in items if item["role"] == "user")
        self.assertEqual((echo["messageId"], echo["source"], echo["fromHome"]), (sent["messageId"], "owner", True))
        streamed = [item for item in items if item["streaming"]]
        self.assertLess(items.index(echo), items.index(streamed[0]),
                        "the message comes before the reply it asked for, so the chat draws it above")
        final = next(item for item in items if item["role"] == "assistant" and not item["streaming"])
        self.assertTrue(streamed and all(item["key"] == final["key"] for item in streamed))
        self.assertTrue(final["text"].startswith(streamed[-1]["text"]))
        turns = kinds(frames, "chat.turn")
        self.assertEqual((turns[0]["running"], turns[-1]["phase"]), (True, "idle"))
        self.assertEqual(len([row for row in self.home.ledger.messages(limit=500)
                              if row["text"] == "How is the release going?"]), 1)
        self.post("/chat/send", {"text": "To a worker", "agentId": "run-1"}, status=409)
        self.post("/chat/send", {"text": " "}, status=400)

    def test_the_conversation_is_in_time_order_so_a_new_reply_owns_no_older_card(self):
        """The App draws under each reply the cards opened since the reply before it, so a reply said out of time
        order would draw cards that an earlier reply already shows again under the next live answer."""
        said = [datetime.fromisoformat(item["at"]) for item in self.get("/chat/thread")["items"]]
        self.assertEqual(said, sorted(said), "the demo's conversation is said in time order")
        stream = Frames(self, self.cookie)
        self.post("/chat/send", {"id": "t1", "text": "Anything new?"})
        stream.until(lambda found: any(item["role"] == "assistant" and not item["streaming"]
                                       for item in kinds(found, "chat.item")))
        replies = [datetime.fromisoformat(item["at"]) for item in self.get("/chat/thread")["items"]
                   if item["role"] == "assistant"]
        owned = [card["id"] for card in self.get("/db/read?kind=approvals")["items"]
                 if replies[-2] < datetime.fromisoformat(card["created_at"]) <= replies[-1]]
        self.assertEqual(owned, [], "the live answer opened no card, so none is drawn under it")

    def test_a_message_carries_its_images_and_a_queued_one_goes_after_the_answer(self):
        image = {"mimeType": "image/png", "data": "iVBORw0KGgo="}
        stream = Frames(self, self.cookie)
        sent = self.post("/chat/send", {"id": "img1", "text": "Look at this", "images": [image]})
        queued = self.post("/chat/queue/add", {"agentId": "lead", "id": "q-next", "text": "And then this"})
        self.assertEqual(queued["item"]["state"], "queued", "it waits while the answer is written")
        frames = stream.until(lambda found: any(item["text"] == "And then this" for item in kinds(found, "chat.item")))
        echo = next(item for item in kinds(frames, "chat.item") if item["messageId"] == sent["messageId"])
        self.assertEqual(echo["images"], [{"url": f"/chat/images/{echo['key'][1:]}/0", "mimeType": "image/png"}])
        code, _, body = self.call("GET", echo["images"][0]["url"], cookie=self.cookie)
        self.assertEqual(code, 200)
        self.until(lambda: kinds(stream.frames(), "chat.queue")
                   and kinds(stream.frames(), "chat.queue")[-1]["items"] == [])

    def test_shutdown_returns_once_every_open_stream_has_ended(self):
        """A stream reads the ledger until it sees the close, and Windows cannot delete a file that is still open,
        so the home's folder may go only after the last stream has stopped reading."""
        Frames(self, self.cookie)
        self.server.shutdown()
        self.assertEqual(self.server.streams, 0)

    def test_cancel_ends_the_answer_being_written(self):
        stream = Frames(self, self.cookie)
        self.post("/chat/send", {"id": "c1", "text": "Write me something long"})
        stream.until(lambda found: any(item["streaming"] for item in kinds(found, "chat.item")))
        self.assertTrue(kinds(stream.frames(), "chat.state")[-1]["controls"]["cancel"])
        self.post("/chat/cancel", {})
        stream.until(lambda found: kinds(found, "chat.turn") and kinds(found, "chat.turn")[-1]["phase"] == "idle"
                     and not kinds(found, "chat.state")[-1]["controls"]["cancel"])
        self.until(lambda: self.home.ledger.events(kind="lead.turn"))
        self.assertIn("cancelled", self.home.ledger.events(kind="lead.turn")[-1]["detail"])

    def test_history_pages_back_and_one_item_is_found_by_its_key(self):
        for number in range(60):
            self.home.ledger.say(web.Role.HOME, f"note {number}")
        newest = self.get("/chat/history")
        self.assertEqual(len(newest["items"]), 50)
        self.assertTrue(newest["hasOlder"])
        older = self.get(f"/chat/history?before={newest['before']}")
        self.assertTrue(older["items"])
        self.assertLess(int(older["items"][-1]["key"][1:]), int(newest["items"][0]["key"][1:]))
        key = newest["items"][-1]["key"]
        self.assertEqual(self.get(f"/chat/item?key={key}")["text"], "note 59")
        self.get("/chat/item?key=m999999", status=404)
        self.get("/chat/history?before=x", status=400)

    def test_the_model_picker_chooses_who_leads(self):
        with mock.patch.dict(os.environ), mock.patch.object(agents, "ready", autospec=True,
                                                             side_effect=lambda name, *_: name != "api"):
            os.environ.pop("ARTEMIS_LEAD", None)
            self.home.ledger.set_adapter("codex", "lead", agents.OS_NAME, "0.71.0", [], "subscription", "live", "t")
            stream = Frames(self, self.cookie)
            settings = self.get("/chat/settings")
            self.assertIn("codex", [model["id"] for model in settings["models"]])
            self.assertNotIn("api", [model["id"] for model in settings["models"]])
            chosen = self.post("/chat/settings", {"model": "codex"})
            self.assertEqual(chosen["settings"]["model"]["id"], "codex")
            self.assertEqual(self.home.config.agents.lead, "codex")
            frames = stream.until(lambda found: any(payload["model"]["id"] == "codex"
                                                    for payload in kinds(found, "chat.settings")))
            self.assertTrue(frames)
            self.post("/chat/settings", {"model": "api"}, status=409)
            self.post("/chat/settings", {"thinking": "high"}, status=400)

    def test_one_conversation_with_no_provider_prompts_or_commands(self):
        self.assertEqual(self.get("/chat/ledger"), {"items": [], "next": None})
        self.assertEqual(self.get("/chat/permissions?agentId=lead"), {"agentId": "lead", "permissions": []})
        self.assertEqual(self.get("/chat/commands?agentId=lead"), {"agentId": "lead", "commands": []})
        self.post("/chat/permissions/decide", {"agentId": "lead", "permissionId": "x", "decision": "allow"}, status=409)

    def test_the_roster_shows_running_workers_and_their_thread(self):
        work = [row for row in self.home.ledger.work() if row["run_id"]]
        roster = self.get("/chat/roster")["agents"]
        self.assertEqual(roster[0]["id"], "lead")
        workers = {row["id"]: row for row in roster[1:]}
        for row in work:
            if row["ended"] is None:
                self.assertEqual(workers[f"run-{row['run_id']}"]["state"], "running")
        some = roster[1]
        thread = self.get(f"/chat/thread?agentId={some['id']}")
        self.assertEqual((thread["agentId"], thread["state"]["canSend"]), (some["id"], False))
        self.assertTrue(all(item["role"] == "note" for item in thread["items"]))
        self.assertEqual(self.get("/chat/thread")["agentId"], "lead")
        self.get("/chat/thread?agentId=run-999999", status=404)


if __name__ == "__main__":
    unittest.main()
