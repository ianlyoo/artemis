"""Boards: ledger store, broker `board` tool, /canvas/* and /ide/catalog routes, and the `canvas` live frame."""

import base64
import contextlib
import hashlib
import json
import math
import socket
import threading
import time
import unittest

from artemis import boards, web
from artemis.broker import ToolError
from artemis.roles import Role
from test_web import AppCase, FAKE, setUpModule  # noqa: F401  (the module's vault passphrase)


TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)

ALL_TEN_BLOCKS = [
    {"id": "h1", "type": "heading", "level": 1, "text": "Release Readiness Brief"},
    {"id": "t1", "type": "text", "tone": "accent", "text": "Summary of checks before tagging **v0.4.0**."},
    {
        "id": "b-tbl",
        "type": "table",
        "title": "Check matrix",
        "columns": ["Area", "Result", "Count"],
        "rows": [["Packaging", "Pass", 12], ["Wire protocol", "Pass", 8]],
    },
    {
        "id": "b-cht",
        "type": "chart",
        "title": "Asset size",
        "kind": "bar",
        "unit": "KiB",
        "labels": ["Shell", "Boards"],
        "series": [{"name": "Size", "values": [140, 165.5]}],
    },
    {
        "id": "b-tl",
        "type": "timeline",
        "title": "Milestones",
        "items": [
            {"when": "Day 1", "label": "Wire contract", "detail": "Freeze schemas"},
            {"when": "Day 2", "label": "Verification"},
        ],
    },
    {"id": "b-code", "type": "code", "lang": "mermaid", "text": "flowchart TD\n  UI --> SSE"},
    {"id": "b-notes", "type": "notes", "items": [{"n": 1, "text": "Measured on a clean build."}]},
    {"id": "b-ans", "type": "answer", "slot": "release-note", "text": "Initial draft"},
    {"id": "b-step", "type": "step", "step": 4},
    {"id": "b-sec", "type": "secret", "key": "API_TOKEN", "label": "Release token"},
]


class FrameStream:
    """An open GET /events stream, read line by line in the background."""

    def __init__(self, case: AppCase, cookie: str, path: str = "/events"):
        self.sock = socket.create_connection(("127.0.0.1", case.port), timeout=10)
        self.sock.sendall((f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{case.port}\r\n"
                           f"Cookie: {web.COOKIE}={cookie}\r\n\r\n").encode())
        self.text = ""
        self.lock = threading.Lock()
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        try:
            while chunk := self.sock.recv(65536):
                with self.lock:
                    self.text += chunk.decode("utf-8", "replace")
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

    def until(self, predicate, seconds: float = 8.0) -> list[dict]:
        deadline = time.time() + seconds
        while time.time() < deadline:
            frames = self.frames()
            if predicate(frames):
                return frames
            time.sleep(0.05)
        return self.frames()

    def close(self):
        with contextlib.suppress(OSError):
            self.sock.shutdown(socket.SHUT_RDWR)
        self.sock.close()


class BoardAppCase(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()
        self.lead_token = self.home.grant(
            0, None, self.ids["shop"], "lead", self.root, "folder"
        ).read_text(encoding="utf-8").strip()
        worker_run = self.home.ledger.claim_run(Role.HOME, self.ids["search"], "mock")
        self.worker_token = self.home.grant(
            worker_run, self.ids["search"], self.ids["shop"], "worker", self.root, "folder"
        ).read_text(encoding="utf-8").strip()

    def broker_call(self, token: str, tool: str, args: dict):
        return self.call(
            "POST",
            "/broker/call",
            {"tool": tool, "args": args},
            headers={"X-Artemis-Run": token},
            origin=False,
        )


class PublishAndShapesTest(BoardAppCase):
    """Proof (1): lead/worker publish via tool, and /canvas/active, /canvas/boards/:id, /ide/catalog shapes."""

    def test_empty_state_and_auth_enforcement(self):
        self.assertEqual(self.call("GET", "/canvas/active")[0], 401)
        self.assertEqual(self.call("GET", "/ide/catalog")[0], 401)

        status, _, active = self.call("GET", "/canvas/active", cookie=self.cookie)
        self.assertEqual((status, active), (200, {"rev": 0, "active": None, "boards": []}))

        status, _, cat = self.call("GET", "/ide/catalog?archived=1", cookie=self.cookie)
        self.assertEqual((status, cat), (200, {"schema_version": 1, "boards": [], "reports": []}))

        self.assertEqual(self.call("GET", "/canvas/boards/missing", cookie=self.cookie)[0], 404)

    def test_lead_tool_publishes_and_routes_match_contract_shapes(self):
        cards_before = len(self.home.ledger.cards())
        status, _, result = self.broker_call(
            self.lead_token,
            "board",
            {
                "id": "board-1",
                "title": "Release Readiness Brief",
                "layout": {"width": "wide"},
                "blocks": ALL_TEN_BLOCKS,
            },
        )
        self.assertEqual(status, 200, result)
        self.assertEqual(result, {"id": "board-1", "title": "Release Readiness Brief", "rev": 1})
        self.assertEqual(len(self.home.ledger.cards()), cards_before)  # boards need no approval card

        # Ledger records board.published with id and title only (never blocks)
        published = [row for row in self.home.ledger.events() if row["kind"] == "board.published"]
        self.assertEqual(len(published), 1)
        self.assertEqual(json.loads(published[0]["data"]), {"id": "board-1", "title": "Release Readiness Brief"})

        # GET /canvas/active
        status, _, active = self.call("GET", "/canvas/active", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(set(active), {"rev", "active", "boards"})
        self.assertEqual(active["rev"], 1)
        self.assertEqual(active["boards"], [{
            "id": "board-1",
            "title": "Release Readiness Brief",
            "updatedAt": active["active"]["updatedAt"],
        }])
        board = active["active"]
        self.assertEqual(set(board), {"id", "title", "createdAt", "updatedAt", "layout", "blocks"})
        self.assertEqual(board["id"], "board-1")
        self.assertEqual(board["layout"], {"width": "wide"})
        self.assertEqual(board["blocks"], ALL_TEN_BLOCKS)

        # GET /canvas/boards/:id
        status, _, fetched = self.call("GET", "/canvas/boards/board-1", cookie=self.cookie)
        self.assertEqual((status, fetched), (200, board))

        # GET /ide/catalog?archived=1
        status, _, cat = self.call("GET", "/ide/catalog?archived=1", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(cat, {
            "schema_version": 1,
            "boards": [{
                "id": "board:board-1",
                "board_id": "board-1",
                "title": "Release Readiness Brief",
                "visibility_revision": 1,
                "archived": False,
            }],
            "reports": [],
        })

    def test_worker_can_publish_and_replace_preserves_created_at(self):
        status, _, first = self.broker_call(
            self.worker_token,
            "board",
            {"title": "Worker Summary", "blocks": [{"type": "text", "text": "First pass"}]},
        )
        self.assertEqual(status, 200, first)
        board_id = first["id"]
        created_at = self.call("GET", f"/canvas/boards/{board_id}", cookie=self.cookie)[2]["createdAt"]

        status, _, second = self.broker_call(
            self.lead_token,
            "board",
            {"id": board_id, "title": "Updated Summary", "blocks": [{"type": "text", "text": "Second pass"}]},
        )
        self.assertEqual(status, 200, second)
        self.assertEqual(second["rev"], first["rev"] + 1)

        fetched = self.call("GET", f"/canvas/boards/{board_id}", cookie=self.cookie)[2]
        self.assertEqual(fetched["createdAt"], created_at)
        self.assertEqual(fetched["title"], "Updated Summary")
        self.assertEqual(fetched["blocks"], [{"id": "b1", "type": "text", "text": "Second pass"}])
        self.assertNotIn("layout", fetched)

    def test_secret_values_in_board_text_are_scrubbed_before_storage(self):
        self.home.vault.set("EXAMPLE_KEY", FAKE, use="env", kind="none", note="test")
        status, _, res = self.broker_call(
            self.lead_token,
            "board",
            {"id": "scrub-check", "title": "Notes", "blocks": [{"type": "text", "text": f"token={FAKE}"}]},
        )
        self.assertEqual(status, 200, res)
        fetched = self.call("GET", "/canvas/boards/scrub-check", cookie=self.cookie)[2]
        self.assertNotIn(FAKE, fetched["blocks"][0]["text"])
        self.assertIn("[secret:EXAMPLE_KEY]", fetched["blocks"][0]["text"])


class LiveCanvasFrameTest(BoardAppCase):
    """Proof (2): GET /events receives canvas frames after publish, and ?canvas=listing omits blocks."""

    def test_events_stream_pushes_canvas_frame_and_listing_omits_blocks(self):
        full_stream = FrameStream(self, self.cookie, "/events")
        listing_stream = FrameStream(self, self.cookie, "/events?canvas=listing")
        self.addCleanup(full_stream.close)
        self.addCleanup(listing_stream.close)

        full_stream.until(lambda frames: any(f.get("kind") == "canvas" for f in frames))
        listing_stream.until(lambda frames: any(f.get("kind") == "canvas" for f in frames))

        initial_full = full_stream.frames("canvas")[0]["payload"]
        initial_list = listing_stream.frames("canvas")[0]["payload"]
        self.assertEqual(initial_full, {"rev": 0, "active": None, "boards": []})
        self.assertEqual(initial_list, {"rev": 0, "active_id": None, "boards": []})

        status, _, published = self.broker_call(
            self.lead_token,
            "board",
            {
                "id": "live-board",
                "title": "Live Update",
                "blocks": [{"id": "b1", "type": "text", "text": "Fresh from the lead."}],
            },
        )
        self.assertEqual(status, 200, published)

        full_stream.until(lambda frames: any(
            f.get("kind") == "canvas" and f["payload"].get("rev") == 1 for f in frames
        ))
        listing_stream.until(lambda frames: any(
            f.get("kind") == "canvas" and f["payload"].get("rev") == 1 for f in frames
        ))

        full_payload = full_stream.frames("canvas")[-1]["payload"]
        self.assertEqual(full_payload["rev"], 1)
        self.assertEqual(full_payload["active"]["id"], "live-board")
        self.assertEqual(full_payload["active"]["blocks"], [{"id": "b1", "type": "text", "text": "Fresh from the lead."}])
        self.assertEqual(len(full_payload["boards"]), 1)

        list_payload = listing_stream.frames("canvas")[-1]["payload"]
        self.assertEqual(set(list_payload), {"rev", "active_id", "boards"})
        self.assertEqual(list_payload["rev"], 1)
        self.assertEqual(list_payload["active_id"], "live-board")
        self.assertNotIn("active", list_payload)
        self.assertNotIn("blocks", json.dumps(list_payload))
        self.assertEqual(list_payload["boards"][0]["id"], "live-board")

        # Publishing a second board makes it active and pushes rev=2
        status, _, second = self.broker_call(
            self.worker_token,
            "board",
            {
                "id": "second-board",
                "title": "Follow-up",
                "blocks": [{"id": "a1", "type": "answer", "slot": "reply", "text": ""}],
            },
        )
        self.assertEqual((status, second["rev"]), (200, 2))
        full_stream.until(lambda frames: any(
            f.get("kind") == "canvas" and f["payload"].get("rev") == 2 for f in frames
        ))
        rev2 = full_stream.frames("canvas")[-1]["payload"]
        self.assertEqual(rev2["active"]["id"], "second-board")
        self.assertEqual([b["id"] for b in rev2["boards"]], ["second-board", "live-board"])

        # Answering a slot refreshes the stream again with rev=3
        status, _, ans = self.call(
            "POST",
            "/canvas/answer",
            {"board": "second-board", "slot": "reply", "text": "Confirmed."},
            cookie=self.cookie,
        )
        self.assertEqual((status, ans["rev"]), (200, 3))
        full_stream.until(lambda frames: any(
            f.get("kind") == "canvas" and f["payload"].get("rev") == 3 for f in frames
        ))
        rev3 = full_stream.frames("canvas")[-1]["payload"]
        self.assertEqual(rev3["active"]["blocks"][0]["text"], "Confirmed.")


class AnswerSlotTest(BoardAppCase):
    """Proof (3): POST /canvas/answer updates an answer block and bumps rev."""

    def test_answer_updates_slot_bumps_rev_and_refuses_unknowns(self):
        self.broker_call(
            self.lead_token,
            "board",
            {
                "id": "q-board",
                "title": "Decisions",
                "blocks": [
                    {"id": "a1", "type": "answer", "slot": "scope", "text": "Draft"},
                    {"id": "a2", "type": "answer", "slot": "notes"},
                ],
            },
        )
        before = self.call("GET", "/canvas/active", cookie=self.cookie)[2]
        self.assertEqual(before["rev"], 1)

        status, _, reply = self.call(
            "POST",
            "/canvas/answer",
            {"board": "q-board", "slot": "scope", "text": "Ship with two providers."},
            cookie=self.cookie,
        )
        self.assertEqual(status, 200, reply)
        self.assertEqual(reply, {"ok": True, "board": "q-board", "rev": 2})

        fetched = self.call("GET", "/canvas/boards/q-board", cookie=self.cookie)[2]
        self.assertEqual(fetched["blocks"][0]["text"], "Ship with two providers.")
        self.assertEqual(fetched["blocks"][1]["text"], "")

        active = self.call("GET", "/canvas/active", cookie=self.cookie)[2]
        self.assertEqual(active["rev"], 2)
        cat = self.call("GET", "/ide/catalog", cookie=self.cookie)[2]
        self.assertEqual(cat["boards"][0]["visibility_revision"], 2)

        # Clearing an answer slot to empty string is allowed
        status, _, cleared = self.call(
            "POST",
            "/canvas/answer",
            {"board": "q-board", "slot": "scope", "text": ""},
            cookie=self.cookie,
        )
        self.assertEqual((status, cleared["rev"]), (200, 3))
        self.assertEqual(self.call("GET", "/canvas/boards/q-board", cookie=self.cookie)[2]["blocks"][0]["text"], "")

        # Missing board / missing slot -> 404; bad field -> 400
        self.assertEqual(
            self.call("POST", "/canvas/answer", {"board": "missing", "slot": "scope", "text": "x"}, cookie=self.cookie)[0],
            404,
        )
        self.assertEqual(
            self.call("POST", "/canvas/answer", {"board": "q-board", "slot": "missing", "text": "x"}, cookie=self.cookie)[0],
            404,
        )
        status, _, err = self.call(
            "POST", "/canvas/answer", {"board": "q-board", "slot": "scope", "text": 42}, cookie=self.cookie
        )
        self.assertEqual(status, 400)
        self.assertIn("text", err["error"])


class AssetRouteTest(BoardAppCase):
    """Proof (4): assets served with immutable cache header, and paths outside the asset folder are refused."""

    def test_asset_is_content_addressed_and_served_immutable(self):
        name = boards.put_asset(self.home.paths.root, TINY_PNG, ".png")
        again = boards.put_asset(self.home.paths.root, TINY_PNG, "PNG")
        self.assertEqual(name, again)
        self.assertEqual(name, f"{hashlib.sha256(TINY_PNG).hexdigest()}.png")

        status, response, body = self.call("GET", f"/canvas/assets/{name}", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(body, TINY_PNG)
        self.assertEqual(response.getheader("Content-Type"), "image/png")
        cache = response.getheader("Cache-Control") or ""
        self.assertIn("immutable", cache)
        self.assertIn("max-age=", cache)
        self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")

        missing_name = f"{'0' * 64}.png"
        self.assertEqual(self.call("GET", f"/canvas/assets/{missing_name}", cookie=self.cookie)[0], 404)

    def test_paths_outside_asset_folder_are_refused(self):
        boards.put_asset(self.home.paths.root, TINY_PNG, ".png")
        link = boards.assets_dir(self.home.paths.root) / "escape.png"
        link.symlink_to(self.home.paths.ledger)

        for path in (
            "/canvas/assets/../ledger.db",
            "/canvas/assets/..%2Fledger.db",
            "/canvas/assets/%2e%2e%2fledger.db",
            "/canvas/assets/..%5Cledger.db",
            "/canvas/assets/sub/file.png",
            "/canvas/assets/.hidden.png",
            "/canvas/assets/escape.png",
            "/canvas/assets/evil.svg",
        ):
            with self.subTest(path=path):
                status, _, data = self.call("GET", path, cookie=self.cookie)
                self.assertEqual(status, 403, f"{path} returned {status}: {data}")
                self.assertIsInstance(data, dict)
                self.assertIn("error", data)


class BadBlocksTest(BoardAppCase):
    """Proof (5): bad blocks are refused with one plain sentence naming the field."""

    def assert_refused(self, args: dict, field_hint: str) -> None:
        status, _, data = self.broker_call(self.lead_token, "board", args)
        self.assertEqual(status, 400, f"expected 400 for {args!r}, got {status}: {data}")
        msg = data["error"]
        self.assertIsInstance(msg, str)
        self.assertNotIn("\n", msg)
        self.assertIn(field_hint, msg)

    def test_bad_blocks_are_refused_naming_the_field(self):
        cases = [
            ({"title": "B", "blocks": [{}]}, "type"),
            ({"title": "B", "blocks": [{"type": "html", "html": "<p>x</p>"}]}, "type"),
            ({"title": "B", "blocks": [{"id": "", "type": "text", "text": "x"}]}, "id"),
            ({"title": "B", "blocks": [{"id": "dup", "type": "text", "text": "a"}, {"id": "dup", "type": "text", "text": "b"}]}, "id"),
            ({"title": "B", "blocks": [{"type": "text", "text": "x", "tone": "loud"}]}, "tone"),
            ({"title": "B", "blocks": [{"type": "heading", "text": "   "}]}, "text"),
            ({"title": "B", "blocks": [{"type": "heading", "text": "Hi", "level": 4}]}, "level"),
            ({"title": "B", "blocks": [{"type": "heading", "text": "Hi", "level": True}]}, "level"),
            ({"title": "B", "blocks": [{"type": "text", "text": 123}]}, "text"),
            ({"title": "B", "blocks": [{"type": "table", "columns": [], "rows": []}]}, "columns"),
            ({"title": "B", "blocks": [{"type": "table", "columns": ["A", "B"], "rows": [["only-one"]]}]}, "rows[0]"),
            ({"title": "B", "blocks": [{"type": "table", "columns": ["A"], "rows": [[{"nested": 1}]]}]}, "rows[0][0]"),
            ({"title": "B", "blocks": [{"type": "chart", "kind": "pie", "labels": ["A"], "series": [{"name": "S", "values": [1]}]}]}, "kind"),
            ({"title": "B", "blocks": [{"type": "chart", "labels": [], "series": [{"name": "S", "values": []}]}]}, "labels"),
            ({"title": "B", "blocks": [{"type": "chart", "labels": ["A", "B"], "series": [{"name": "S", "values": [1]}]}]}, "values"),
            ({"title": "B", "blocks": [{"type": "chart", "labels": ["A"], "series": [{"name": "S", "values": [True]}]}]}, "values[0]"),
            ({"title": "B", "blocks": [{"type": "timeline", "items": [{"when": "Now"}]}]}, "label"),
            ({"title": "B", "blocks": [{"type": "timeline", "items": [{"when": "Now", "title": "Wrong key"}]}]}, "title"),
            ({"title": "B", "blocks": [{"type": "code", "lang": "python"}]}, "text"),
            ({"title": "B", "blocks": [{"type": "notes", "items": [{"n": 0, "text": "Bad"}]}]}, "n"),
            ({"title": "B", "blocks": [{"type": "notes", "items": [{"n": 1, "text": "A"}, {"n": 1, "text": "B"}]}]}, "n"),
            ({"title": "B", "blocks": [{"type": "answer", "slot": "bad slot!"}]}, "slot"),
            ({"title": "B", "blocks": [{"type": "answer", "slot": "s1"}, {"type": "answer", "slot": "s1"}]}, "slot"),
            ({"title": "B", "blocks": [{"type": "step", "step": 0}]}, "step"),
            ({"title": "B", "blocks": [{"type": "step", "step": True}]}, "step"),
            ({"title": "B", "blocks": [{"type": "secret", "key": "API_KEY", "value": "never-here"}]}, "value"),
            ({"title": "B", "blocks": [{"type": "secret", "key": "sk-not-a-name"}]}, "key"),
            ({"title": "B", "blocks": [{"type": "secret", "key": "API_KEY", "template": "no-placeholder"}]}, "template"),
            ({"title": "B", "layout": {"width": "huge"}, "blocks": [{"type": "text", "text": "x"}]}, "width"),
            ({"id": "../escape", "title": "B", "blocks": [{"type": "text", "text": "x"}]}, "id"),
            ({"title": "   ", "blocks": [{"type": "text", "text": "x"}]}, "title"),
        ]
        for args, field in cases:
            with self.subTest(field=field, args=args):
                self.assert_refused(args, field)

    def test_non_finite_chart_value_refused(self):
        with self.assertRaisesRegex(ValueError, r"values\[0\]"):
            boards.publish(
                self.home.ledger,
                Role.LEAD,
                "Bad math",
                [{"type": "chart", "labels": ["A"], "series": [{"name": "S", "values": [math.nan]}]}],
            )

    def test_broker_refuses_board_when_work_is_stopped(self):
        self.home.ledger.stop(Role.OWNER, "pause")
        with self.assertRaisesRegex(ToolError, "stopped"):
            self.home.broker.call(
                self.lead_token, "board", {"title": "Paused", "blocks": [{"type": "text", "text": "x"}]}
            )


if __name__ == "__main__":
    unittest.main()
