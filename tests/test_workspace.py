"""The App's Workspace read side: project trees, file rendering, find, search, preview, reports,
watch frames, health beacon, confinement and caps."""

from __future__ import annotations

import base64
import http.client
import os
from pathlib import Path
import time
import unittest
from unittest import mock
from urllib.parse import quote

from test_conversation import Frames, kinds
from test_web import AppCase, FAKE, IPHONE, setUpModule  # noqa: F401  (the module's vault passphrase)

from artemis import boards
from artemis.roles import Role
from artemis.web import workspace

# Minimal valid 1x1 transparent PNG.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


class WorkspaceTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()
        self.shop = (self.home.paths.root / "projects" / "storefront").resolve()
        self.taxes = (self.home.paths.root / "projects" / "tax-2026").resolve()
        self.outside = (self.root / "outside").resolve()
        for folder in (self.shop, self.taxes, self.outside):
            folder.mkdir(parents=True, exist_ok=True)
        (self.shop / "src").mkdir()
        (self.shop / "src" / "app.py").write_text("def greet():\n    return 'hello world'\n", encoding="utf-8")
        (self.shop / "README.md").write_text(
            "# Storefront Guide\n\nWelcome to storefront.\n\n| Item | Count |\n| --- | --- |\n| Apple | 3 |\n\n"
            "```python\nprint('hi')\n```\n",
            encoding="utf-8",
        )
        (self.shop / "metrics.csv").write_text("month,orders\nNov,14\nDec,19\n", encoding="utf-8")
        (self.shop / "logo.png").write_bytes(PNG_1X1)
        (self.shop / "raw.bin").write_bytes(b"\x00\x01\x02\x03\x04\xff")
        (self.shop / ".env").write_text("API_KEY=should-stay-hidden\n", encoding="utf-8")
        (self.shop / "private.key").write_text("not-served\n", encoding="utf-8")
        (self.shop / "node_modules").mkdir()
        (self.shop / "node_modules" / "pkg.js").write_text("needle-in-node-modules\n", encoding="utf-8")
        (self.shop / ".git").mkdir()
        (self.shop / ".git" / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
        (self.shop / "dist").mkdir()
        (self.shop / "dist" / "bundle.js").write_text("needle-in-dist\n", encoding="utf-8")
        (self.taxes / "notes.txt").write_text("November receipts summary for storefront.\n", encoding="utf-8")
        (self.outside / "secret.txt").write_text("outside project root\n", encoding="utf-8")

    def get(self, path: str, status: int = 200):
        code, _, data = self.call("GET", path, cookie=self.cookie)
        self.assertEqual(code, status, data)
        return data

    def post(self, path: str, body: dict, status: int = 200, **kwargs):
        code, _, data = self.call("POST", path, body, cookie=self.cookie, **kwargs)
        self.assertEqual(code, status, data)
        return data

    def raw_get(self, path: str) -> tuple[int, dict[str, str], bytes]:
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        try:
            conn.request("GET", path, headers={
                "Host": f"127.0.0.1:{self.port}",
                "Cookie": f"artemis_session={self.cookie}",
            })
            resp = conn.getresponse()
            body = resp.read()
            return resp.status, {k.lower(): v for k, v in resp.getheaders()}, body
        finally:
            conn.close()

    def test_auth_is_required_on_every_workspace_route(self):
        for method, path, body in (
            ("GET", "/ide/tree", None),
            ("GET", f"/chat/doc?path={quote(str(self.shop / 'README.md'))}", None),
            ("GET", "/ide/find?q=app", None),
            ("GET", "/ide/search?q=hello&scope=docs", None),
            ("GET", f"/ide/preview?target={quote('file:' + str(self.shop / 'README.md'))}", None),
            ("GET", "/ide/reports", None),
            ("POST", "/ide/watch", {"stream": "a" * 24, "targets": []}),
            ("POST", "/ide/health", {"device": "pc", "reports": []}),
        ):
            code, _, _ = self.call(method, path, body)
            self.assertEqual(code, 401, f"{method} {path} should require auth")

        pending, _ = self.pair(IPHONE)
        code, _, _ = self.call("GET", "/ide/tree", cookie=pending)
        self.assertEqual(code, 403)

        code, _, _ = self.call("POST", "/ide/watch", {"stream": "a" * 24, "targets": []},
                               cookie=self.cookie, origin=False)
        self.assertEqual(code, 403)

    def test_tree_roots_folding_links_and_sorting(self):
        # In-root symlink is listed with link=True; escaping symlink is omitted.
        os.symlink(self.shop / "README.md", self.shop / "readme-link.md")
        os.symlink(self.outside / "secret.txt", self.shop / "escape.txt")
        os.symlink(self.outside, self.shop / "escape-dir")

        roots = self.get("/ide/tree")
        self.assertTrue(roots["ok"])
        self.assertIsNone(roots["path"])
        self.assertFalse(roots["truncated"])
        self.assertEqual(roots["skipped"], 0)
        names = [entry["name"] for entry in roots["entries"]]
        self.assertEqual(names, ["storefront", "tax-2026"])
        for entry in roots["entries"]:
            self.assertEqual(entry["kind"], "dir")
            self.assertIsNone(entry["size"])
            self.assertTrue(os.path.isabs(entry["path"]))
            self.assertIsNotNone(entry["mtime"])

        listing = self.get(f"/ide/tree?path={quote(str(self.shop))}")
        self.assertTrue(listing["ok"])
        self.assertEqual(listing["root"], "storefront")
        self.assertEqual(listing["path"], str(self.shop))
        by_name = {entry["name"]: entry for entry in listing["entries"]}
        self.assertIn("src", by_name)
        self.assertIn("README.md", by_name)
        self.assertTrue(by_name["node_modules"].get("folded"))
        self.assertTrue(by_name[".git"].get("folded"))
        self.assertTrue(by_name["dist"].get("folded"))
        self.assertTrue(by_name["readme-link.md"].get("link"))
        # Denied files and escaping symlinks never appear in the tree.
        for hidden in (".env", "private.key", "escape.txt", "escape-dir"):
            self.assertNotIn(hidden, by_name)
        # Dirs are sorted before files.
        kinds_order = [entry["kind"] for entry in listing["entries"]]
        self.assertEqual(kinds_order, sorted(kinds_order, key=lambda k: 0 if k == "dir" else 1))

    def test_confinement_refuses_outside_traversal_symlinks_and_denied_files(self):
        escape_file = self.shop / "escape-file.txt"
        escape_dir = self.shop / "escape-dir"
        dangling_escape = self.shop / "dangling-escape"
        denied_link = self.shop / "innocent-link.txt"
        os.symlink(self.outside / "secret.txt", escape_file)
        os.symlink(self.outside, escape_dir)
        os.symlink(self.outside / "does-not-exist.txt", dangling_escape)
        os.symlink(self.shop / ".env", denied_link)
        profile_dir = self.shop / "browser-data"
        profile_dir.mkdir()
        (profile_dir / "Local State").write_text("{}", encoding="utf-8")
        (profile_dir / "note.txt").write_text("inside profile", encoding="utf-8")

        bad_paths = [
            str(self.outside / "secret.txt"),
            str(self.outside),
            str(self.shop) + "/../outside/secret.txt",
            str(self.shop / "src") + "/../../outside/secret.txt",
            "relative/path.txt",
            str(escape_file),
            str(escape_dir),
            str(escape_dir / "secret.txt"),
            str(dangling_escape),
            str(self.shop / ".env"),
            str(self.shop / "private.key"),
            str(denied_link),
            str(profile_dir / "note.txt"),
            str(self.home.paths.root / "ledger.db"),
        ]
        for bad in bad_paths:
            for endpoint in (
                f"/ide/tree?path={quote(bad)}",
                f"/chat/doc?path={quote(bad)}",
                f"/chat/doc/download?path={quote(bad)}",
                f"/ide/preview?target={quote('file:' + bad)}",
            ):
                data = self.get(endpoint, status=403)
                self.assertFalse(data["ok"])
                self.assertEqual(data["error"], "forbidden", f"expected forbidden for {endpoint}")

    def test_read_only_no_write_routes_exist(self):
        for verb, pattern, _ in workspace.ROUTES:
            if verb != "GET":
                self.assertIn(pattern, (r"/ide/watch", r"/ide/health"))
        for path in ("/ide/tree", "/chat/doc", "/ide/find", "/ide/search", "/ide/preview", "/ide/reports"):
            code, _, _ = self.call("POST", path, {}, cookie=self.cookie)
            self.assertEqual(code, 404, f"POST {path} must not be served")
        # Unoffered capability/write endpoints stay unserved.
        for method, path in (
            ("POST", "/ide/save"),
            ("POST", "/ide/fs/create"),
            ("POST", "/ide/fs/delete"),
            ("POST", "/archive/pins"),
            ("GET", "/archive/list"),
            ("GET", "/ide/drafts"),
            ("GET", "/ide/previews"),
            ("GET", "/term/list"),
        ):
            code, _, _ = self.call(method, path, {} if method == "POST" else None, cookie=self.cookie)
            self.assertIn(code, (404, 405), f"{method} {path} must not be served")

    def test_doc_markdown_code_csv_image_binary_download_and_scrubbing(self):
        # Markdown renders heading, text, table and code blocks.
        md = self.get(f"/chat/doc?path={quote(str(self.shop / 'README.md'))}")
        self.assertTrue(md["ok"])
        self.assertEqual(md["kind"], "md")
        self.assertEqual(md["title"], "Storefront Guide")
        self.assertEqual(md["path"], str(self.shop / "README.md"))
        self.assertIn("/chat/doc/download?path=", md["download"])
        block_types = [block["type"] for block in md["blocks"]]
        self.assertEqual(block_types, ["heading", "text", "table", "code"])
        self.assertEqual(md["blocks"][2]["columns"], ["Item", "Count"])
        self.assertEqual(md["blocks"][2]["rows"], [["Apple", "3"]])

        # Code file returns kind='text' and a single code block (code.js isCode shape).
        code_doc = self.get(f"/chat/doc?path={quote(str(self.shop / 'src' / 'app.py'))}")
        self.assertEqual(code_doc["kind"], "text")
        self.assertEqual(code_doc["title"], "app.py")
        self.assertEqual(len(code_doc["blocks"]), 1)
        self.assertEqual(code_doc["blocks"][0]["type"], "code")
        self.assertEqual(code_doc["blocks"][0]["lang"], "py")
        self.assertIn("hello world", code_doc["blocks"][0]["text"])

        # CSV renders as sheet with table block.
        csv_doc = self.get(f"/chat/doc?path={quote(str(self.shop / 'metrics.csv'))}")
        self.assertEqual(csv_doc["kind"], "sheet")
        self.assertEqual(csv_doc["blocks"][0]["type"], "table")
        self.assertEqual(csv_doc["blocks"][0]["columns"], ["month", "orders"])

        # Image renders image block and serves cached bytes at /chat/doc/assets/<sha>.png.
        img_doc = self.get(f"/chat/doc?path={quote(str(self.shop / 'logo.png'))}")
        self.assertEqual(img_doc["kind"], "image")
        asset_src = img_doc["blocks"][0]["src"]
        self.assertTrue(asset_src.startswith("/chat/doc/assets/"))
        status, headers, raw_img = self.raw_get(asset_src)
        self.assertEqual(status, 200)
        self.assertEqual(headers["content-type"], "image/png")
        self.assertEqual(raw_img, PNG_1X1)

        # Download serves raw bytes with attachment header.
        status, headers, raw_py = self.raw_get(code_doc["download"])
        self.assertEqual(status, 200)
        self.assertIn("attachment;", headers["content-disposition"])
        self.assertIn(b"hello world", raw_py)

        # Binary files return 415 unsupported.
        bin_err = self.get(f"/chat/doc?path={quote(str(self.shop / 'raw.bin'))}", status=415)
        self.assertEqual(bin_err["error"], "unsupported")

        # Vault secret values inside a project file are scrubbed and counted in masked.
        self.home.vault.set("TEST_DEMO_SECRET", FAKE, use="env")
        secret_note = self.shop / "leaked-note.txt"
        secret_note.write_text(f"token={FAKE}\n", encoding="utf-8")
        scrubbed = self.get(f"/chat/doc?path={quote(str(secret_note))}")
        self.assertNotIn(FAKE, scrubbed["blocks"][0]["text"])
        self.assertGreaterEqual(scrubbed["masked"], 1)

    def test_size_and_count_caps(self):
        # File over MAX_TEXT_BYTES is refused with 413 too_large.
        big = self.shop / "big.txt"
        big.write_bytes(b"a" * 2048)
        with mock.patch.object(workspace, "MAX_TEXT_BYTES", 1024):
            err = self.get(f"/chat/doc?path={quote(str(big))}", status=413)
            self.assertEqual(err["error"], "too_large")

        # Tree entries cap sets truncated=True.
        many = self.shop / "many"
        many.mkdir()
        for i in range(6):
            (many / f"f{i}.txt").write_text(f"line {i}\n", encoding="utf-8")
        with mock.patch.object(workspace, "MAX_TREE_ENTRIES", 3):
            listed = self.get(f"/ide/tree?path={quote(str(many))}")
            self.assertEqual(len(listed["entries"]), 3)
            self.assertTrue(listed["truncated"])
            self.assertEqual(listed["total"], 6)

        # Find index cap sets index.truncated=True.
        with mock.patch.object(workspace, "MAX_INDEX_ENTRIES", 2):
            found = self.get("/ide/find?q=f")
            self.assertTrue(found["index"]["truncated"])
            self.assertEqual(found["index"]["count"], 2)

        # Search hit cap sets truncated=True.
        with mock.patch.object(workspace, "MAX_SEARCH_HITS", 2):
            searched = self.get("/ide/search?q=line&scope=docs")
            self.assertEqual(len(searched["items"]), 2)
            self.assertTrue(searched["truncated"])

    def test_find_search_preview_reports_and_health_shapes(self):
        # Publish one board to verify find & preview of boards too.
        published = boards.publish(
            self.home.ledger, Role.LEAD, "Release Notes Board",
            [{"id": "h1", "type": "heading", "level": 1, "text": "Storefront 1.4"},
             {"id": "t1", "type": "text", "text": "All release checks passed."}],
        )
        board_id = published["id"]

        # Reports: empty at first, with a stable revision string.
        empty_reports = self.get("/ide/reports")
        self.assertTrue(empty_reports["ok"])
        self.assertEqual(empty_reports["items"], [])
        self.assertIsInstance(empty_reports["revision"], str)
        self.assertFalse(empty_reports["truncated"])

        # Add real reports (root REPORT.md + subfolder RESEARCH.md + reports/*.md); folded REPORT.md skipped.
        (self.shop / "REPORT.md").write_text("# Storefront Audit\n\nSummary.\n", encoding="utf-8")
        (self.shop / "reports").mkdir()
        (self.shop / "reports" / "weekly.md").write_text("# Weekly Digest\n", encoding="utf-8")
        (self.shop / "node_modules" / "REPORT.md").write_text("# Should Not Appear\n", encoding="utf-8")
        rep = self.get("/ide/reports")
        self.assertEqual(len(rep["items"]), 2)
        self.assertNotEqual(rep["revision"], empty_reports["revision"])
        titles = {item["title"] for item in rep["items"]}
        self.assertEqual(titles, {"Storefront Audit", "Weekly Digest"})
        for item in rep["items"]:
            self.assertEqual(set(item), {"path", "title", "mtime", "root"})

        # Find: matches files, boards, reports, and skips folded/denied entries.
        found_py = self.get("/ide/find?q=app.py")
        self.assertTrue(found_py["ok"])
        self.assertEqual(found_py["index"]["state"], "ready")
        self.assertTrue(any(item["target"] == f"file:{self.shop / 'src' / 'app.py'}" for item in found_py["items"]))
        found_folded = self.get("/ide/find?q=pkg.js")
        self.assertEqual(found_folded["items"], [])
        found_board = self.get("/ide/find?q=Release%20Notes")
        self.assertTrue(any(item["kind"] == "board" and item["target"] == f"board:{board_id}" for item in found_board["items"]))

        # Search: docs scope excludes .py; files scope includes .py; folded folders skipped.
        docs_search = self.get("/ide/search?q=storefront&scope=docs")
        self.assertTrue(docs_search["ok"])
        self.assertEqual(docs_search["scope"], "docs")
        self.assertFalse(docs_search["timed_out"])
        paths_docs = {item["path"] for item in docs_search["items"]}
        self.assertIn(str(self.shop / "README.md"), paths_docs)
        self.assertIn(str(self.taxes / "notes.txt"), paths_docs)

        py_in_docs = self.get("/ide/search?q=greet&scope=docs")
        self.assertEqual(py_in_docs["items"], [])
        py_in_files = self.get("/ide/search?q=greet&scope=files")
        self.assertEqual(len(py_in_files["items"]), 1)
        self.assertEqual(py_in_files["items"][0]["line"], 1)
        self.assertIn("greet", py_in_files["items"][0]["snippet"])

        folded_search = self.get("/ide/search?q=needle-in-node-modules&scope=files")
        self.assertEqual(folded_search["items"], [])

        # Search validation: short q and bad scope refused with 400.
        self.get("/ide/search?q=a&scope=docs", status=400)
        self.get("/ide/search?q=hello&scope=invalid", status=400)

        # Preview: markdown file, directory, binary, and board.
        md_prev = self.get(f"/ide/preview?target={quote('file:' + str(self.shop / 'README.md'))}")
        self.assertTrue(md_prev["ok"])
        self.assertEqual(md_prev["kind"], "md")
        self.assertEqual(md_prev["title"], "Storefront Guide")
        self.assertLessEqual(len(md_prev["lines"]), 8)
        self.assertTrue(md_prev["lines"])

        dir_prev = self.get(f"/ide/preview?target={quote('file:' + str(self.shop))}")
        self.assertEqual(dir_prev["kind"], "dir")
        self.assertTrue(any(line == "src/" for line in dir_prev["lines"]))

        board_prev = self.get(f"/ide/preview?target={quote('board:' + board_id)}")
        self.assertEqual(board_prev["kind"], "board")
        self.assertEqual(board_prev["title"], "Release Notes Board")
        self.assertTrue(any("Storefront 1.4" in line for line in board_prev["lines"]))
        self.get("/ide/preview?target=board:missing-id", status=404)
        self.get("/ide/preview?target=unknown:123", status=400)

        # Health beacon answers 204 and keeps nothing.
        code, _, body = self.call("POST", "/ide/health", {"device": "pc", "reports": [{"kind": "console", "what": "x"}]},
                                  cookie=self.cookie)
        self.assertEqual(code, 204)
        self.assertIsNone(body)

    def test_watch_delivers_ide_changed_only_to_watching_stream(self):
        watched_file = self.shop / "README.md"
        file_target = f"file:{watched_file}"
        outside_target = f"file:{self.outside / 'secret.txt'}"
        sid_a = "stream_alpha_1234567890"
        sid_b = "stream_bravo_1234567890"

        # Unknown stream -> 404 not_found.
        missing = self.post("/ide/watch", {"stream": sid_a, "targets": [file_target]}, status=404)
        self.assertEqual(missing["error"], "not_found")

        # Open two IDE streams.
        stream_a = Frames(self, self.cookie, f"?ide={sid_a}")
        stream_b = Frames(self, self.cookie, f"?ide={sid_b}")
        stream_a.until(lambda items: bool(kinds(items, "owner_views")))
        stream_b.until(lambda items: bool(kinds(items, "owner_views")))

        # Over 20 targets -> 400 bad_request.
        too_many = [f"file:{self.shop}/f{i}.txt" for i in range(21)]
        self.post("/ide/watch", {"stream": sid_a, "targets": too_many}, status=400)

        # Register watch set on stream A: valid file watched, outside target refused.
        reply = self.post("/ide/watch", {"stream": sid_a, "targets": [file_target, outside_target]})
        self.assertTrue(reply["ok"])
        self.assertEqual(reply["watching"], [file_target])
        self.assertEqual(reply["refused"], [{"target": outside_target, "error": "forbidden"}])

        # Edit the watched file on disk: stream A gets ide.changed, stream B does not.
        time.sleep(0.05)
        watched_file.write_text("# Storefront Guide\n\nUpdated live.\n", encoding="utf-8")
        stream_a.until(lambda items: any(
            frame["target"] == file_target and isinstance(frame["mtime"], str)
            for frame in kinds(items, "ide.changed")
        ))
        time.sleep(0.35)
        self.assertEqual(kinds(stream_b.frames(), "ide.changed"), [])

        # Deleting the watched file sends ide.changed with mtime=None.
        watched_file.unlink()
        stream_a.until(lambda items: any(
            frame["target"] == file_target and frame["mtime"] is None
            for frame in kinds(items, "ide.changed")
        ))


    def test_tree_on_file_and_watch_board_and_search_busy(self):
        # /ide/tree on a regular file answers 404 not_found.
        err = self.get(f"/ide/tree?path={quote(str(self.shop / 'README.md'))}", status=404)
        self.assertEqual(err["error"], "not_found")

        # Watching a board emits ide.changed when the board is updated.
        published = boards.publish(
            self.home.ledger, Role.LEAD, "Watch Board",
            [{"id": "h1", "type": "heading", "level": 1, "text": "v1"}],
        )
        bid = published["id"]
        target = f"board:{bid}"
        sid = "stream_board_1234567890"
        stream = Frames(self, self.cookie, f"?ide={sid}")
        stream.until(lambda items: bool(kinds(items, "owner_views")))
        reply = self.post("/ide/watch", {"stream": sid, "targets": [target]})
        self.assertEqual(reply["watching"], [target])

        boards.publish(
            self.home.ledger, Role.LEAD, "Watch Board",
            [{"id": "h1", "type": "heading", "level": 1, "text": "v2"}],
            board_id=bid,
        )
        stream.until(lambda items: any(
            frame["target"] == target and isinstance(frame["mtime"], str)
            for frame in kinds(items, "ide.changed")
        ))

        # Busy search semaphore returns 429 busy.
        gate = workspace._state(self.server).search_gate
        for _ in range(workspace.MAX_CONCURRENT_SEARCHES):
            gate.acquire()
        try:
            busy = self.get("/ide/search?q=hello&scope=docs", status=429)
            self.assertEqual(busy["error"], "busy")
        finally:
            for _ in range(workspace.MAX_CONCURRENT_SEARCHES):
                gate.release()


if __name__ == "__main__":
    unittest.main()
