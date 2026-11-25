"""The Artemis App's server: pairing and devices, the request gate, every route's shape, cards, secrets, and the
live stream with its long-poll fallback. Each test runs a real server on a seeded demo home (mock agents only)."""

import contextlib
import dataclasses
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import socket
import struct
import tempfile
import threading
import time
import unittest
from unittest import mock

from fixtures import app_demo

from artemis import agents, demo_receiver, vault as vault_module, web
from artemis.broker import ToolError
from artemis.config import CardSettings
from artemis.home import PAIR_S
from artemis.roles import Interrupt, Role
from artemis.tls import ensure_cert
from artemis.vault import PASSPHRASE_ENV, Vault

FAKE = "fake-value-for-tests-7f3a9c"           # an obviously fake secret value; it must never come back out
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1"
DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
PASSPHRASE = "fake-passphrase-for-tests"
PATCHES = (mock.patch.dict(os.environ, {PASSPHRASE_ENV: PASSPHRASE}),       # vaults unlock the CI way, "env"
           mock.patch.object(vault_module, "keyring", app_demo.NoKeychain()),  # and never ask the OS keychain
           mock.patch.object(vault_module, "SCRYPT", {"n": 2 ** 10, "r": 8, "p": 1}))   # cheap for tests


def setUpModule():
    for patch in PATCHES:
        patch.start()


def tearDownModule():
    for patch in reversed(PATCHES):
        patch.stop()


class AppCase(unittest.TestCase):
    """A seeded demo home served on an ephemeral loopback port, and a small HTTP client for it."""

    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.home = app_demo.home(self.root / "home")
        self.ids = app_demo.seed(self.home)
        self.addCleanup(self.home.close)
        self.stderr = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()):
            self.server = web.start(self.home, 0, lan=False, tls=None)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.cards_finished)
        self.port = self.server.server_address[1]
        self.bodies: list[bytes] = []

    @staticmethod
    def cards_finished() -> None:
        """Cards handed to the broker are carried out in threads of their own; let them end before the home goes."""
        for thread in threading.enumerate():
            if thread.name.startswith("artemis-card-"):
                thread.join(10)

    def until(self, done, seconds: float = 10.0) -> None:
        end = time.monotonic() + seconds
        while not done():
            self.assertLess(time.monotonic(), end, "it did not happen in time")
            time.sleep(0.02)

    @property
    def origin(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def call(self, method: str, path: str, body: dict | None = None, *, cookie: str | None = None,
             bearer: bool = False, headers: dict | None = None, origin: bool = True):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=40)
        sent = {"Host": f"127.0.0.1:{self.port}", "User-Agent": DESKTOP}
        if method == "POST" and origin:
            sent["Origin"] = self.origin
        if cookie:
            sent["Cookie"] = f"{web.COOKIE}={cookie}"
        if bearer:
            sent["Authorization"] = f"Bearer {self.home.paths.token.read_text(encoding='utf-8').strip()}"
        sent.update(headers or {})
        data = None if body is None else json.dumps(body).encode("utf-8")
        if data is not None:
            sent["Content-Type"] = "application/json"
        with contextlib.redirect_stderr(self.stderr):
            connection.request(method, path, body=data if method == "POST" else None, headers=sent)
            response = connection.getresponse()
            raw = response.read()
        connection.close()
        self.bodies.append(raw)
        try:
            parsed = json.loads(raw) if raw else None
        except ValueError:
            parsed = raw
        return response.status, response, parsed

    def pair(self, agent: str = DESKTOP) -> tuple[str, dict]:
        token = self.home.new_pair_token()
        status, response, data = self.call("POST", "/api/pair", {"token": token}, headers={"User-Agent": agent})
        self.assertEqual(status, 200, data)
        cookie = response.getheader("Set-Cookie")
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        return cookie.split(";")[0].split("=", 1)[1], data["device"]

    def owner(self) -> str:
        """The first browser on this computer: allowed at once."""
        cookie, device = self.pair()
        self.assertEqual(device["state"], "allowed")
        return cookie

    def phone(self, allowed_by: str) -> str:
        cookie, device = self.pair(IPHONE)
        self.assertTrue(device["phone"])
        self.assertEqual(self.call("POST", f"/api/devices/{device['id']}/allow", {}, cookie=allowed_by)[0], 200)
        return cookie

    def card_id(self, what: str) -> int:
        return next(row["id"] for row in self.home.ledger.cards() if row["what"] == what)


class PairingTest(AppCase):
    def test_the_api_needs_a_device_or_the_home_token(self):
        self.assertEqual(self.call("GET", "/api/state")[0], 401)
        self.assertEqual(self.call("GET", "/api/state", bearer=True)[0], 200)
        status, _, data = self.call("GET", "/api/state", headers={"Authorization": "Bearer not-the-token"})
        self.assertEqual(status, 401)
        self.assertIn("Pair this browser", data["error"])

    def test_a_pairing_link_works_once(self):
        token = self.home.new_pair_token()
        self.assertEqual(self.call("POST", "/api/pair", {"token": token})[0], 200)
        status, _, data = self.call("POST", "/api/pair", {"token": token})
        self.assertEqual(status, 401)
        self.assertIn("used already or has expired", data["error"])

    def test_a_pairing_link_expires(self):
        with mock.patch("time.time", return_value=time.time() - PAIR_S - 1):
            token = self.home.new_pair_token()
        self.assertEqual(self.call("POST", "/api/pair", {"token": token})[0], 401)

    def test_five_wrong_tries_stop_every_link_until_a_new_one_is_made(self):
        cookie = self.owner()
        token = self.home.new_pair_token()
        for attempt in range(web.PAIR_TRIES):
            self.assertEqual(self.call("POST", "/api/pair", {"token": f"guess-{attempt}"})[0], 401)
        self.assertEqual(self.call("POST", "/api/pair", {"token": token})[0], 401)
        made = self.call("POST", "/api/pair/new", {}, cookie=cookie)[2]["url"].split("#pair=")[1]
        self.assertEqual(self.call("POST", "/api/pair", {"token": made})[0], 200)

    def test_the_link_artemis_serve_prints_pairs_this_browser(self):
        status, _, data = self.call("POST", "/api/pair", {"token": self.home.new_pair_token()})
        self.assertEqual((status, data["device"]["state"]), (200, "allowed"))

    def test_pairing_from_another_site_is_refused(self):
        token = self.home.new_pair_token()
        status, _, _ = self.call("POST", "/api/pair", {"token": token}, headers={"Origin": "http://evil.example"})
        self.assertEqual(status, 403)
        self.assertEqual(self.call("POST", "/api/pair", {"token": token})[0], 200)   # the link was not used up

    def test_the_first_browser_here_is_allowed_and_the_next_waits_for_its_code(self):
        first = self.owner()
        second, device = self.pair(IPHONE)
        self.assertEqual(device["state"], "pending")
        self.assertRegex(device["code"], r"^\d{4}$")
        status, _, data = self.call("GET", "/api/state", cookie=second)
        self.assertEqual((status, data["waiting"]), (403, True))
        status, _, me = self.call("GET", "/api/me", cookie=second)
        self.assertEqual((status, me["device"]["state"], me["device"]["code"]), (200, "pending", device["code"]))
        state = self.call("GET", "/api/state", cookie=first)[2]
        self.assertEqual([(item["name"], item["code"]) for item in state["devices_waiting"]],
                         [("Safari on iPhone", device["code"])])
        self.assertEqual(self.call("POST", f"/api/devices/{device['id']}/allow", {}, cookie=first)[0], 200)
        self.assertEqual(self.call("GET", "/api/state", cookie=second)[0], 200)
        self.assertIsNone(self.call("GET", "/api/me", cookie=second)[2]["device"]["code"])
        status, _, _ = self.call("POST", f"/api/devices/{device['id']}/allow", {}, cookie=first)
        self.assertEqual(status, 409)

    def test_a_device_is_allowed_only_from_this_computer(self):
        first = self.owner()
        _, device = self.pair(IPHONE)
        with mock.patch.object(web, "LOOPBACK", frozenset()):
            state = self.call("GET", "/api/state", cookie=first)[2]
            self.assertIsNone(state["devices_waiting"][0]["code"])   # the code shows only here and on itself
            self.assertEqual(self.call("POST", f"/api/devices/{device['id']}/allow", {}, cookie=first)[0], 403)
            self.assertEqual(self.call("POST", f"/api/devices/{device['id']}/revoke", {}, cookie=first)[0], 200)

    def test_a_first_browser_from_the_network_waits_too(self):
        with mock.patch.object(web, "LOOPBACK", frozenset()):
            _, device = self.pair(IPHONE)
        self.assertEqual(device["state"], "pending")

    def test_a_removed_device_and_a_signed_out_one_are_refused(self):
        first = self.owner()
        second = self.phone(first)
        device = self.call("GET", "/api/me", cookie=second)[2]["device"]
        self.assertEqual(self.call("POST", f"/api/devices/{device['id']}/revoke", {}, cookie=first)[0], 200)
        self.assertEqual(self.call("GET", "/api/state", cookie=second)[0], 401)
        status, response, _ = self.call("POST", "/api/signout", {}, cookie=first)
        self.assertEqual(status, 200)
        self.assertIn("Max-Age=0", response.getheader("Set-Cookie"))
        self.assertEqual(self.call("GET", "/api/state", cookie=first)[0], 401)

    def test_a_device_unseen_for_thirty_days_pairs_again(self):
        cookie = self.owner()
        with mock.patch.object(web, "SESSION_SECONDS", -1):
            self.assertEqual(self.call("GET", "/api/state", cookie=cookie)[0], 401)

    def test_a_new_pairing_link_comes_with_its_qr(self):
        cookie = self.owner()
        status, _, data = self.call("POST", "/api/pair/new", {}, cookie=cookie)
        self.assertEqual(status, 200)
        self.assertIn("/#pair=", data["url"])
        self.assertTrue(data["qr"].startswith("data:image/svg+xml"))
        self.assertGreater(data["expires"], time.time() + PAIR_S - 5)
        token = data["url"].split("#pair=")[1]
        self.assertEqual(self.call("POST", "/api/pair", {"token": token})[0], 200)


class GateTest(AppCase):
    def test_an_unknown_host_is_refused(self):
        status, _, _ = self.call("GET", "/", headers={"Host": "evil.example"})
        self.assertEqual(status, 403)
        self.assertEqual(self.call("GET", "/api/state", bearer=True, headers={"Host": "evil.example:80"})[0], 403)

    def test_a_write_with_the_cookie_must_come_from_the_app(self):
        cookie = self.owner()
        self.assertEqual(self.call("POST", "/api/stop", {}, cookie=cookie, origin=False)[0], 403)
        status, _, _ = self.call("POST", "/api/stop", {}, cookie=cookie, headers={"Origin": "http://evil.example"})
        self.assertEqual(status, 403)
        self.assertFalse(self.home.ledger.stopped())
        self.assertEqual(self.call("POST", "/api/stop", {}, cookie=cookie)[0], 200)

    def test_pages_carry_a_strict_content_policy(self):
        status, response, body = self.call("GET", "/")
        self.assertEqual(status, 200)
        policy = response.getheader("Content-Security-Policy")
        self.assertIn("default-src 'self'", policy)
        self.assertIn("script-src 'self'", policy)
        self.assertNotIn("unsafe-inline", policy)
        self.assertEqual(response.getheader("X-Frame-Options"), "DENY")
        self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
        self.assertIn(b'src="/app.js"', body)
        self.assertNotIn(b"<script>", body)    # no inline script: the policy would refuse it anyway

    def test_only_the_apps_own_files_are_served(self):
        for path in ("/app.js", "/app.css", "/manifest.webmanifest", "/icon.svg", "/vendor/preact-htm.js",
                     "/vendor/LICENSE-preact.txt", "/icon-192.png"):
            self.assertEqual(self.call("GET", path)[0], 200, path)
        for path in ("/__init__.py", "/../__init__.py", "/%2e%2e/ledger.py", "/vendor/../../ledger.py",
                     "/__pycache__/x.pyc", "/missing.js"):
            self.assertEqual(self.call("GET", path)[0], 404, path)
        self.assertEqual(self.call("POST", "/index.html", {})[0], 405)

    def test_bad_bodies_are_refused_plainly(self):
        cookie = self.owner()
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        connection.request("POST", "/api/messages", body=b"not json", headers={
            "Host": f"127.0.0.1:{self.port}", "Origin": self.origin, "Cookie": f"{web.COOKIE}={cookie}"})
        self.assertEqual(connection.getresponse().status, 400)
        connection.close()
        self.assertEqual(self.call("POST", "/api/messages", {"text": ""}, cookie=cookie)[0], 400)
        self.assertEqual(self.call("GET", "/api/nothing", cookie=cookie)[0], 404)
        self.assertEqual(self.call("GET", "/api/updates?limit=many", cookie=cookie)[0], 400)

    def test_a_client_that_hangs_up_between_requests_is_not_printed_as_an_error(self):
        original = web.AppServer.handle_error
        with mock.patch("socketserver.BaseServer.handle_error") as printed, \
                mock.patch.object(web.AppServer, "handle_error", autospec=True, side_effect=original) as seen:
            raw = socket.create_connection(("127.0.0.1", self.port), timeout=10)
            raw.sendall(f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n\r\n".encode())
            answer = http.client.HTTPResponse(raw)   # read to its last byte, so the hang-up comes between requests
            answer.begin()
            answer.read()
            self.assertEqual(answer.status, 200)
            linger = struct.pack("HH" if os.name == "nt" else "ii", 1, 0)   # Windows keeps it in two shorts
            raw.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, linger)   # hang up with a reset
            raw.close()
            self.until(lambda: seen.called)
        printed.assert_not_called()

    def test_each_request_on_a_kept_alive_connection_gets_its_own_body(self):
        cookie = self.owner()
        layout = self.ids["layout"]
        second = json.loads(self.home.ledger.card(layout)["options"])[1]["id"]
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        self.addCleanup(connection.close)
        sent = {"Host": f"127.0.0.1:{self.port}", "Origin": self.origin, "Cookie": f"{web.COOKIE}={cookie}",
                "Content-Type": "application/json"}

        def call(method: str, path: str, body: dict | None = None):
            connection.request(method, path, body=None if body is None else json.dumps(body).encode(), headers=sent)
            response = connection.getresponse()
            return response.status, json.loads(response.read())

        self.assertEqual(call("POST", "/api/stop", {"reason": "first reason"})[0], 200)
        self.assertEqual(call("POST", "/api/resume", {"reason": "second reason"})[0], 200)
        self.assertEqual(call("POST", f"/api/cards/{layout}/choose", {"option": second}), (200, mock.ANY))
        self.assertEqual(call("POST", "/api/nothing", {"text": "a body nobody reads"})[0], 404)
        status, state = call("GET", "/api/state")
        self.assertEqual((status, state["stopped"]), (200, False))
        said = {row["kind"]: row["detail"] for row in self.home.ledger.events() if row["kind"] in ("halt", "resume")}
        self.assertEqual(said, {"halt": "first reason", "resume": "second reason"})
        self.assertEqual(self.home.ledger.card(layout)["answer"], second)

    def test_a_body_past_what_is_worth_reading_is_refused_unread(self):
        cookie = self.owner()
        with socket.create_connection(("127.0.0.1", self.port), timeout=10) as raw:
            raw.sendall((f"POST /api/messages HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nOrigin: {self.origin}\r\n"
                         f"Cookie: {web.COOKIE}={cookie}\r\nContent-Length: {web.DRAIN_MAX + 1}\r\n\r\n").encode())
            head = raw.recv(4096).decode()
        self.assertTrue(head.startswith("HTTP/1.1 413"), head)
        self.assertIn("Connection: close", head)

    def test_a_refused_body_is_read_off_before_the_answer(self):
        # Answering with bytes unread resets the connection on Windows, and the client never sees the status.
        cookie = self.owner()
        sent = {"Host": f"127.0.0.1:{self.port}", "Origin": self.origin, "Cookie": f"{web.COOKIE}={cookie}"}
        for path, body, status in (("/api/messages", b"x" * (web.MAX_BODY + 1), 413),
                                   ("/index.html", b"x" * 300_000, 405),
                                   ("/api/stop", b"x" * 300_000, 403)):
            connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
            headers = sent if status != 403 else {**sent, "Origin": "http://elsewhere.example"}
            connection.request("POST", path, body=body, headers=headers)
            response = connection.getresponse()
            self.assertEqual(response.status, status, path)
            self.assertIn("error", json.loads(response.read()))
            connection.close()
        self.assertFalse(self.home.ledger.stopped())

    def test_a_chunked_body_is_read_like_any_other(self):
        cookie = self.owner()
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        self.addCleanup(connection.close)
        sent = {"Host": f"127.0.0.1:{self.port}", "Origin": self.origin, "Cookie": f"{web.COOKIE}={cookie}",
                "Content-Type": "application/json"}
        reason = json.dumps({"reason": "sent in chunks"}).encode()
        connection.request("POST", "/api/stop", body=iter([reason[:7], reason[7:]]), headers=sent,
                           encode_chunked=True)
        response = connection.getresponse()
        self.assertEqual((response.status, json.loads(response.read())["stopped"]), (200, True))
        connection.request("GET", "/api/state", headers=sent)   # the same connection, after the chunks
        self.assertTrue(json.loads(connection.getresponse().read())["stopped"])
        said = [row["detail"] for row in self.home.ledger.events() if row["kind"] == "halt"]
        self.assertEqual(said, ["sent in chunks"])

    def test_the_broker_door_answers_only_named_runs(self):
        self.assertEqual(self.call("POST", "/broker/call", {"tool": "x"}, origin=False)[0], 401)
        with mock.patch.object(web, "LOOPBACK", frozenset()):
            self.assertEqual(self.call("POST", "/broker/call", {"tool": "x"}, origin=False,
                                       headers={"X-Artemis-Run": "run"})[0], 403)
        run = {"X-Artemis-Run": "fake-run-token"}
        status, _, data = self.call("POST", "/broker/call", {"tool": "note", "args": {}}, origin=False, headers=run)
        self.assertEqual((status, data), (400, {"error": "This run has ended."}))    # the real broker said so
        with mock.patch.object(self.home.broker, "call", return_value={"noted": True}) as called:
            status, _, data = self.call("POST", "/broker/call", {"tool": "note", "args": {"text": "hi"}},
                                        origin=False, headers=run)
        self.assertEqual((status, data), (200, {"noted": True}))
        called.assert_called_once_with("fake-run-token", "note", {"text": "hi"})
        with mock.patch.object(self.home.broker, "call", side_effect=vault_module.VaultLocked("The vault is locked.")):
            self.assertEqual(self.call("POST", "/broker/call", {"tool": "http_request"}, origin=False,
                                       headers=run)[0], 423)
        with mock.patch.object(self.home.broker, "call", side_effect=ToolError("not one of your tools")):
            self.assertEqual(self.call("POST", "/broker/call", {"tool": "x"}, origin=False, headers=run),
                             (400, mock.ANY, {"error": "not one of your tools"}))


class TlsTest(unittest.TestCase):
    """With a certificate the App speaks HTTPS; an agent's broker call still comes as plain HTTP from this computer."""

    def test_https_for_browsers_and_plain_loopback_for_the_broker(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        home = app_demo.home(Path(folder.name) / "home")
        app_demo.seed(home)
        self.addCleanup(home.close)
        cert, key = ensure_cert(home.paths, [])[:2]
        with contextlib.redirect_stdout(io.StringIO()):
            server = web.start(home, 0, lan=False, tls=(cert, key))
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        port = server.server_address[1]
        context = web.ssl.create_default_context(cafile=str(cert))
        context.check_hostname = False
        secure = http.client.HTTPSConnection("127.0.0.1", port, timeout=10, context=context)
        secure.request("GET", "/api/me", headers={"Host": f"127.0.0.1:{port}"})
        self.assertEqual(secure.getresponse().status, 401)
        secure.close()
        plain = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        plain.request("POST", "/broker/call", body=json.dumps({"tool": "note", "args": {}}),
                      headers={"Host": f"127.0.0.1:{port}", "X-Artemis-Run": "fake-run-token",
                               "Content-Type": "application/json"})
        answer = plain.getresponse()
        self.assertEqual((answer.status, json.loads(answer.read())), (400, {"error": "This run has ended."}))
        plain.close()


class RoutesTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()

    def get(self, path: str):
        status, _, data = self.call("GET", path, cookie=self.cookie)
        self.assertEqual(status, 200, (path, data))
        return data

    def post(self, path: str, body: dict | None = None, status: int = 200):
        got, _, data = self.call("POST", path, body or {}, cookie=self.cookie)
        self.assertEqual(got, status, (path, data))
        return data

    def test_state_has_everything_the_header_and_screens_need(self):
        state = self.get("/api/state")
        self.assertLessEqual({"stopped", "counts", "since", "projects", "cards", "lessons", "lead", "workers", "vault",
                              "devices_waiting", "loopback", "lan", "device", "read_at", "cursor", "version"},
                             set(state))
        self.assertLessEqual({"asked", "done", "stuck", "wakes"}, set(state["counts"]))
        self.assertEqual(sorted(project["name"] for project in state["projects"]),
                         ["field-notes", "storefront", "tax-2026"])
        shop = next(project for project in state["projects"] if project["name"] == "storefront")
        self.assertEqual(shop["objective"], "Ship storefront 1.4")
        self.assertEqual(shop["evidence"]["label"], "verified")
        self.assertEqual(shop["blocker"]["kind"], "card")
        taxes = next(project for project in state["projects"] if project["name"] == "tax-2026")
        self.assertEqual(taxes["due"]["title"], "Sort new receipts and send the summary")
        self.assertTrue(all(card["state"] in ("waiting", "approved", "running") for card in state["cards"]))
        push = next(card for card in state["cards"] if card["id"] == self.ids["push"])
        self.assertLessEqual({"command", "argv", "cwd", "secrets", "why", "allow_standing", "phone_only", "expires",
                              "task", "request", "receiver"}, set(push))
        self.assertEqual((push["command"], push["argv"]), ("git push origin main v1.4.0",
                                                           ["git", "push", "origin", "main", "v1.4.0"]))
        self.assertFalse(push["allow_standing"])     # its task was not started by a schedule
        self.assertFalse(push["phone_only"])
        summary = next(card for card in state["cards"] if card["id"] == self.ids["summary"])
        self.assertTrue(summary["allow_standing"])
        self.assertEqual((summary["request"]["method"], summary["receiver"]), ("POST", demo_receiver.NAME))
        self.assertEqual(([worker["provider"] for worker in state["workers"]], state["lead"]["label"]),
                         (list(agents.PROVIDERS), "mock (no AI)"))
        self.assertEqual(([worker["provider"] for worker in state["workers"] if worker["chosen"]],
                          state["max_workers"], state["lead"]["answers"]), (["mock"], 3, True))   # config.toml
        self.assertEqual(state["agents"]["codex"], "Codex")
        self.assertEqual(state["vault"]["backend"], "env")
        self.assertTrue(state["vault"]["from_env"])
        self.assertTrue(state["device"]["this"])

    def test_the_conversation_and_its_updates(self):
        messages = self.get("/api/messages")
        self.assertLessEqual({"id", "at", "role", "text", "project_id", "card_id", "turn", "card"}, set(messages[0]))
        self.assertIn("you", {message["role"] for message in messages})
        later = self.get(f"/api/messages?after={messages[-2]['id']}")
        self.assertEqual([message["id"] for message in later], [messages[-1]["id"]])
        updates = self.get("/api/updates?limit=50")
        self.assertTrue(all(event["update"] for event in updates))
        opened = [event for event in updates if event["kind"] == "card.opened"]
        self.assertTrue(opened and all(event["card"]["id"] == event["card_id"] for event in opened))

    def test_a_project_and_a_task(self):
        project = self.get(f"/api/projects/{self.ids['shop']}")
        self.assertEqual(set(project), {"project", "tasks", "schedules", "lessons"})
        self.assertLessEqual({"id", "title", "label", "provider", "proof"}, set(project["tasks"][0]))
        self.assertEqual(self.call("GET", "/api/projects/999", cookie=self.cookie)[0], 404)
        task = self.get(f"/api/tasks/{self.ids['search']}")
        self.assertLessEqual({"task", "runs", "submissions", "evidence", "verdicts", "review", "log_tail",
                              "files_changed", "undo"}, set(task))
        self.assertLessEqual({"brief", "criteria"}, set(task["task"]))
        self.assertEqual(self.call("GET", "/api/tasks/999", cookie=self.cookie)[0], 404)

    def test_the_log_tail_shows_secret_names_not_values(self):
        log = self.home.paths.logs / f"task-{self.ids['search']}.log"
        log.write_text(log.read_text(encoding="utf-8") + "\nexported GITHUB_TOKEN=demo-token-not-real-0000\n",
                       encoding="utf-8")
        tail = self.get(f"/api/tasks/{self.ids['search']}")["log_tail"]
        self.assertIn("[secret:GITHUB_TOKEN]", tail)
        self.assertNotIn("demo-token-not-real-0000", tail)

    def test_the_digest_and_reading_it(self):
        digest = self.get("/api/digest")
        self.assertEqual(set(digest), {"lines", "counts", "text"})
        self.assertEqual(set(digest["lines"][0]), {"label", "ref", "title", "proof", "project", "question"})
        asked = [line for line in self.get("/api/digest?since=0")["lines"] if line["question"]]
        declined = self.card_id("Publish the theme package to npm")
        self.assertEqual([(line["proof"], line["question"]) for line in asked],
                         [(f"from D{declined} you declined",
                           f"You declined D{declined}. Always ask before `npm publish`?")])
        only = self.get(f"/api/digest?project={self.ids['taxes']}&since=0")
        self.assertEqual({line["project"] for line in only["lines"]}, {"tax-2026"})
        self.assertIsNone(self.get("/api/state")["read_at"])
        read = self.post("/api/digest/read")
        self.assertEqual(self.get("/api/state")["read_at"], read["read_at"])

    def test_lessons_are_accepted_and_retired_through_the_lessons_module(self):
        lessons = {lesson["id"]: lesson for lesson in self.get("/api/lessons")}
        self.assertLessEqual({"id", "kind", "text", "state", "source", "uses", "first_try", "question", "from"},
                             set(lessons[self.ids["rule"]]))
        self.assertEqual(lessons[self.ids["rule"]]["from"], f"from #{lessons[self.ids['rule']]['source'][0]['task']} "
                                                            "judge reject")
        self.assertEqual(self.post(f"/api/lessons/{self.ids['rule']}/retire")["state"], "retired")
        self.assertEqual(self.post(f"/api/lessons/{self.ids['rule']}/accept")["state"], "active")
        guard = next(lesson for lesson in lessons.values() if lesson["question"])
        self.assertEqual(self.post(f"/api/lessons/{guard['id']}/accept"),
                         {**guard, "state": "active", "question": None})
        self.post(f"/api/lessons/{self.ids['check']}/retire")
        status, _, data = self.call("POST", f"/api/lessons/{self.ids['check']}/accept", {}, cookie=self.cookie)
        self.assertEqual(status, 409)                 # a check comes back only once it is proven on a rejected commit
        self.assertIn("stays proposed", data["error"])
        self.post("/api/lessons/999/retire", status=404)
        self.post(f"/api/lessons/{self.ids['rule']}/activate", status=404)

    def test_settings_devices_and_standing_approvals(self):
        settings = self.get("/api/settings")
        self.assertEqual(set(settings), {"adapters", "standing", "devices", "schedules", "lan", "fingerprint", "vault",
                                         "version", "lead"})
        self.assertLessEqual({"provider", "role", "status", "receipt"}, set(settings["adapters"][0]))
        self.assertIn("unqualified", {row["status"] for row in settings["adapters"]})
        standing = settings["standing"][0]
        self.assertEqual(standing["argv"], ["git", "push", "origin", "gh-pages"])
        self.assertEqual(standing["secret"], "GITHUB_TOKEN")
        self.assertEqual(self.get("/api/devices")[0]["this"], True)
        self.assertEqual(self.post(f"/api/standing/{standing['id']}/revoke"), {"revoked": standing["id"]})
        self.post(f"/api/standing/{standing['id']}/revoke", status=404)
        self.assertEqual(self.get("/api/settings")["standing"], [])

    def test_stop_and_resume(self):
        self.assertTrue(self.post("/api/stop", {"reason": "checking"})["stopped"])
        self.assertTrue(self.get("/api/state")["stopped"])
        self.assertFalse(self.post("/api/resume")["stopped"])

    def test_a_message_reaches_the_lead_and_its_reply_comes_back(self):
        sent = self.post("/api/messages", {"text": "How is the release going?", "project_id": self.ids["shop"]})
        deadline = time.time() + 10
        while time.time() < deadline:
            replies = [message for message in self.get(f"/api/messages?after={sent['id']}")
                       if message["role"] == "lead"]
            if replies:
                break
            time.sleep(0.1)
        self.assertTrue(replies and replies[0]["project_id"] == self.ids["shop"])
        self.post("/api/messages", {"text": "x", "project_id": "storefront"}, status=400)
        self.post("/api/messages", {"text": "x", "project_id": 999}, status=404)

    def test_closing_waits_for_a_lead_that_is_still_answering(self):
        answered = threading.Event()

        def slowly(message):
            time.sleep(0.5)
            answered.set()

        with mock.patch.object(self.home.lead, "turn", side_effect=slowly):
            self.post("/api/messages", {"text": "Take your time"})
            self.server.shutdown()
            self.assertTrue(answered.is_set())

    def test_a_home_without_a_lead_says_so_where_you_asked(self):
        self.home.lead = None
        sent = self.post("/api/messages", {"text": "Anyone there?", "project_id": self.ids["blog"]})
        [said] = self.get(f"/api/messages?after={sent['id']}")
        self.assertEqual((said["role"], said["project_id"]), ("artemis", self.ids["blog"]))
        self.assertIn("No lead runs in this home yet", said["text"])
        self.assertFalse(self.get("/api/state")["lead"]["answers"])

    def test_a_build_without_a_broker_still_shows_and_answers_cards(self):
        self.home.broker = None
        summary = next(card for card in self.get("/api/state")["cards"] if card["id"] == self.ids["summary"])
        self.assertFalse(summary["allow_standing"])
        self.post(f"/api/cards/{self.ids['summary']}/approve", {"standing": True}, status=400)
        self.assertEqual(self.post(f"/api/cards/{self.ids['summary']}/approve")["state"], "approved")
        status, _, data = self.call("POST", "/broker/call", {"tool": "note"}, origin=False,
                                    headers={"X-Artemis-Run": "fake-run-token"})
        self.assertEqual(status, 503)
        self.assertIn("no broker", data["error"])

    def test_adding_a_project(self):
        folder = self.root / "notes"
        folder.mkdir()
        added = self.post("/api/projects", {"path": str(folder)})
        self.assertEqual((added["kind"], added["name"]), ("folder", "notes"))
        self.post("/api/projects", {"path": "relative/path"}, status=400)
        self.post("/api/projects", {"path": str(self.root / "missing")}, status=400)

    def test_a_repeated_request_id_is_done_once(self):
        headers = {"X-Request-Id": "same-request-1"}
        first = self.call("POST", "/api/messages", {"text": "Once only"}, cookie=self.cookie, headers=headers)
        again = self.call("POST", "/api/messages", {"text": "Once only"}, cookie=self.cookie, headers=headers)
        self.assertEqual((first[0], again[0]), (200, 200))
        self.assertEqual(first[2], again[2])
        said = [row for row in self.home.ledger.messages(0) if row["text"] == "Once only"]
        self.assertEqual(len(said), 1)
        other = self.call("POST", "/api/messages", {"text": "Once only"}, cookie=self.cookie,
                          headers={"X-Request-Id": "same-request-2"})
        self.assertNotEqual(other[2], first[2])

    def test_a_repeated_refusal_is_the_same_refusal(self):
        headers = {"X-Request-Id": "refused-once"}
        first = self.call("POST", "/api/lessons/999/retire", {}, cookie=self.cookie, headers=headers)
        again = self.call("POST", "/api/lessons/999/retire", {}, cookie=self.cookie, headers=headers)
        self.assertEqual((first[0], first[2]), (again[0], again[2]))


class LeadTest(AppCase):
    """Choosing who leads in Settings: one line of the home's config.toml, read again for the next turn."""

    def setUp(self):
        super().setUp()
        self.cookie = self.owner()
        for patch in (mock.patch.dict(os.environ), mock.patch.object(agents, "ready", autospec=True,
                                                                      side_effect=lambda name, *_: name != "api")):
            patch.start()
            self.addCleanup(patch.stop)
        os.environ.pop("ARTEMIS_LEAD", None)
        ledger = self.home.ledger
        ledger.set_adapter("codex", "lead", agents.OS_NAME, "0.71.0", [], "subscription", "live", "test: led")
        ledger.set_adapter("claude", "lead", agents.OS_NAME, "2.4.1", [], "subscription", "unqualified", "test")
        config = self.home.paths.config
        config.write_text("# My settings\n" + config.read_text(encoding="utf-8").replace(
            'lead = "mock"', 'lead = "mock"   # for now'), encoding="utf-8")

    def choose(self, name: str, **options):
        return self.call("POST", "/api/settings/lead", {"lead": name}, cookie=self.cookie, **options)

    def test_a_chosen_lead_is_one_line_of_config_and_answers_next(self):
        before = self.home.paths.config.read_text(encoding="utf-8").splitlines()
        status, _, chosen = self.choose("codex")
        self.assertEqual((status, chosen["chosen"], chosen["label"]), (200, "codex", "Codex"))
        after = self.home.paths.config.read_text(encoding="utf-8").splitlines()
        self.assertEqual([(old, new) for old, new in zip(before, after) if old != new],
                         [('lead = "mock"   # for now', 'lead = "codex"   # for now')])
        self.assertEqual(len(after), len(before))
        self.assertEqual(agents.lead_provider(self.home.config, self.home.vault, self.home.ledger), "codex")
        updates = self.call("GET", "/api/updates", cookie=self.cookie)[2]
        self.assertEqual([row["detail"] for row in updates if row["kind"] == "lead.switched"],
                         ["Lead switched to Codex"])
        sent = self.call("POST", "/api/messages", {"text": "Who answers now?"}, cookie=self.cookie)[2]

        def replies():
            return [row for row in self.call("GET", f"/api/messages?after={sent['id']}", cookie=self.cookie)[2]
                    if row["role"] == "lead"]
        self.until(replies)
        self.assertEqual(replies()[0]["by"], "Codex")
        self.assertEqual(self.choose("auto")[2]["provider"], "codex")    # Claude Code did not qualify to lead here
        self.assertEqual(self.home.config.agents.lead, "auto")

    def test_each_agent_says_whether_it_can_lead_here(self):
        lead = self.call("GET", "/api/settings", cookie=self.cookie)[2]["lead"]
        self.assertEqual((lead["chosen"], lead["provider"], lead["fixed"]), ("mock", "mock", False))
        self.assertEqual({choice["provider"]: choice["why"] for choice in lead["choices"]}, {
            "claude": "did not qualify to lead here; run `artemis doctor providers` to try again",
            "codex": None,
            "api": "needs a model and its key in config.toml's [api]",
            "mock": None})

    def test_an_unknown_lead_or_one_that_cannot_lead_changes_nothing(self):
        before = self.home.paths.config.read_bytes()
        status, _, data = self.choose("someone")
        self.assertEqual(status, 400)
        self.assertIn("auto or one of", data["error"])
        self.assertEqual(self.choose("claude")[::2], (409, {"error": "Claude Code cannot lead yet: did not "
                                                             "qualify to lead here; run `artemis doctor providers` "
                                                             "to try again."}))
        self.assertEqual(self.choose("api")[0], 409)
        self.assertEqual(self.choose("codex", origin=False)[0], 403)
        with mock.patch.dict(os.environ, {"ARTEMIS_LEAD": "mock"}):
            self.assertEqual(self.choose("codex")[0], 409)
        self.assertEqual(self.home.paths.config.read_bytes(), before)
        self.assertEqual(self.home.config.agents.lead, "mock")
        self.assertEqual(self.home.ledger.events(kind="lead.switched"), [])


class CardsTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()
        self.decide = mock.patch.object(self.home.ledger, "decide_card", wraps=self.home.ledger.decide_card)
        self.decided = self.decide.start()
        self.addCleanup(self.decide.stop)

    def act(self, card: int, action: str, body: dict | None = None, cookie: str | None = None):
        return self.call("POST", f"/api/cards/{card}/{action}", body or {}, cookie=cookie or self.cookie)

    def test_approving_is_recorded_as_the_owner_once_and_carried_out_by_the_home(self):
        with mock.patch.object(self.home.broker, "run_card") as run:
            status, _, card = self.act(self.ids["push"], "approve")
            run.assert_not_called()          # the App records the answer; the home's card round carries it out
            self.home.run_cards()
            self.until(lambda: run.called)
        self.assertEqual((status, card["state"]), (200, "approved"))
        self.decided.assert_called_once_with(Role.OWNER, self.ids["push"], True, standing=None)
        run.assert_called_once_with(self.ids["push"])
        status, _, data = self.act(self.ids["push"], "approve")
        self.assertEqual(status, 409)
        self.assertIn("no longer waiting", data["error"])

    def test_declining(self):
        with mock.patch.object(self.home.broker, "run_card") as run:
            status, _, card = self.act(self.ids["push"], "decline")
            self.home.run_cards()
        self.assertEqual((status, card["state"]), (200, "declined"))
        self.decided.assert_called_once_with(Role.OWNER, self.ids["push"], False, standing=None)
        run.assert_not_called()

    def test_a_command_written_as_text_is_shown_and_answered(self):
        card = self.home.ledger.open_card(Role.HOME, Interrupt.SEND, "Tell everyone", "It speaks for you.",
                                          project=self.ids["shop"], command="notify-team --all",
                                          cwd=str(self.root), shell="sh")
        shown = next(item for item in self.call("GET", "/api/state", cookie=self.cookie)[2]["cards"]
                     if item["id"] == card)
        self.assertEqual((shown["command"], shown["argv"], shown["request"]), ("notify-team --all", None, None))
        status, _, declined = self.act(card, "decline")
        self.assertEqual((status, declined["state"]), (200, "declined"))

    def test_always_for_this_exact_operation_binds_the_command_folder_and_secret(self):
        schedule = next(row for row in self.home.ledger.schedules() if row["title"] == "Publish the site")
        task = self.home.ledger.fire(schedule["id"], schedule["next_at"], schedule["next_at"] + 86400, False)
        pages = self.home.ledger.card(self.ids["pages"])
        card = self.home.ledger.open_card(Role.HOME, Interrupt.SEND, pages["what"], pages["why"], task=task,
                                          command=pages["command"], cwd=pages["cwd"], shell=pages["shell"],
                                          secrets=("GITHUB_TOKEN",), options=json.loads(pages["options"]))
        before = {row["id"] for row in self.home.ledger.standing_approvals()}
        status, _, _ = self.act(card, "approve", {"standing": True})
        self.assertEqual(status, 200)
        self.assertEqual(self.decided.call_args.kwargs["standing"],
                         {"schedule": schedule["id"], "argv": ["git", "push", "origin", "gh-pages"],
                          "cwd": pages["cwd"], "secret": "GITHUB_TOKEN"})
        added = [row for row in self.home.ledger.standing_approvals() if row["id"] not in before]
        self.assertEqual(len(added), 1)
        status, _, data = self.act(self.ids["push"], "approve", {"standing": True})
        self.assertEqual(status, 400)                 # not from a schedule: approved once, never for good
        self.assertIn("approved once", data["error"])

    def test_an_approved_request_to_the_demo_receiver_is_really_sent_once(self):
        status, _, card = self.act(self.ids["summary"], "approve", {"standing": True})
        self.assertEqual((status, card["state"]), (200, "approved"))
        self.home.run_cards()
        self.until(lambda: self.home.ledger.card(self.ids["summary"])["state"] == "done")
        got = [event for event in self.home.ledger.events() if event["kind"] == "demo.received"]
        self.assertEqual(len(got), 1)
        self.assertEqual(json.loads(got[0]["data"])["sha256"], hashlib.sha256(app_demo.SUMMARY).hexdigest())
        self.assertIn("it got that exact body", json.dumps(self.call("GET", "/api/digest?since=0",
                                                                      cookie=self.cookie)[2]))

    def held_request(self, task: int | None) -> int:
        """A web request held for a card, recorded the way httpop holds one."""
        command = json.dumps({"method": "POST", "url": "https://api.newsletter.example/v1/send", "headers": {},
                              "body_sha256": None, "save_to": None})
        return self.home.ledger.open_card(Role.HOME, Interrupt.SEND, "POST https://api.newsletter.example/v1/send",
                                          "It sends as you.", project=self.ids["blog"], task=task, command=command,
                                          secrets=("NEWSLETTER_API_KEY",))

    def test_a_held_web_request_shows_its_method_and_address(self):
        card = self.held_request(None)
        shown = next(item for item in self.call("GET", "/api/state", cookie=self.cookie)[2]["cards"]
                     if item["id"] == card)
        self.assertIsNone(shown["command"])
        self.assertEqual(shown["request"], {"method": "POST", "url": "https://api.newsletter.example/v1/send",
                                            "save_to": None})
        self.assertFalse(shown["allow_standing"])     # httpop lets a request through for good only from a schedule
        self.assertEqual(self.act(card, "approve", {"standing": True})[0], 400)

    def test_a_scheduled_web_request_is_approved_for_good_as_httpop_looks_it_up(self):
        schedule = self.home.ledger.schedules()[0]
        task = self.home.ledger.fire(schedule["id"], schedule["next_at"], schedule["next_at"] + 7 * 86400, False)
        card = self.held_request(task)
        status, _, shown = self.act(card, "approve", {"standing": True})
        self.assertEqual((status, shown["state"]), (200, "approved"))
        self.assertEqual(self.decided.call_args.kwargs["standing"],
                         {"method": "POST", "url": "https://api.newsletter.example/v1/send",
                          "secret": "NEWSLETTER_API_KEY", "schedule": schedule["id"]})
        self.assertIsNotNone(self.home.ledger.standing(kind=Interrupt.SEND, schedule=schedule["id"],
                                                       url="https://api.newsletter.example/v1/send", method="POST",
                                                       secret="NEWSLETTER_API_KEY"))

    def test_money_out_is_approved_on_the_phone_and_never_for_good(self):
        domain = self.card_id("Renew storefront.example for a year")
        status, _, data = self.act(domain, "approve")
        self.assertEqual(status, 403)
        self.assertIn("paired phone", data["error"])
        self.decided.assert_not_called()
        phone = self.phone(self.cookie)
        status, _, data = self.act(domain, "approve", {"standing": True}, cookie=phone)
        self.assertEqual(status, 400)
        self.assertIn("asked every time", data["error"])
        status, _, card = self.act(domain, "approve", cookie=phone)
        self.assertEqual((status, card["state"]), (200, "approved"))

    def test_money_out_can_be_declined_anywhere(self):
        domain = self.card_id("Renew storefront.example for a year")
        self.assertEqual(self.act(domain, "decline")[2]["state"], "declined")

    def test_phone_only_follows_the_config(self):
        self.home.config = dataclasses.replace(self.home.config, cards=CardSettings(phone_only=()))
        domain = self.card_id("Renew storefront.example for a year")
        self.assertEqual(self.act(domain, "approve")[0], 200)

    def test_an_expired_card_cannot_be_answered(self):
        late = self.home.ledger.open_card(Role.LEAD, Interrupt.SEND, "Post the changelog", "It posts as you.",
                                          command=json.dumps(["gh", "release", "create", "v1"]), cwd=str(self.root),
                                          project=self.ids["shop"], expires=time.time() - 1)
        status, _, data = self.act(late, "approve")
        self.assertEqual(status, 409)
        self.assertIn("expired", data["error"])
        self.assertEqual(self.home.ledger.card(late)["state"], "expired")
        opened = next(event for event in self.call("GET", "/api/updates", cookie=self.cookie)[2]
                      if event["card_id"] == late and event["kind"] == "card.opened")
        self.assertEqual(opened["card"]["state"], "expired")

    def test_a_choice_is_chosen_not_approved(self):
        self.assertEqual(self.act(self.ids["layout"], "approve")[0], 400)
        options = self.home.ledger.card(self.ids["layout"])["options"]
        option = json.loads(options)[0]["id"]
        status, _, card = self.act(self.ids["layout"], "choose", {"option": option})
        self.assertEqual((status, card["answer"]), (200, option))
        self.assertEqual(self.act(self.ids["layout"], "choose", {"option": option})[0], 409)

    def test_a_secret_card_stores_the_value_and_says_only_the_name(self):
        self.assertEqual(self.act(self.ids["push"], "secret", {"value": FAKE})[0], 400)   # not a secret card
        status, _, card = self.act(self.ids["newsletter"], "secret", {"value": FAKE})
        self.assertEqual((status, card["state"]), (200, "done"))
        stored = self.home.vault.info("NEWSLETTER_API_KEY")
        self.assertEqual((stored.use, stored.kind, stored.origin), ("http", "send", "https://api.newsletter.example"))
        self.assertEqual(self.home.vault.http("NEWSLETTER_API_KEY", "https://api.newsletter.example"),
                         ("Authorization", f"Bearer {FAKE}"))
        self.assertFalse(any(FAKE.encode() in body for body in self.bodies))


class SecretsTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()

    def add(self, body: dict, cookie: str | None = None, bearer: bool = False):
        return self.call("POST", "/api/secrets", body, cookie=None if bearer else cookie or self.cookie, bearer=bearer)

    def test_names_kinds_and_use_never_a_value(self):
        status, _, added = self.add({"name": "EXAMPLE_API_KEY", "kind": "send", "note": "Example service",
                                     "value": FAKE})
        self.assertEqual((status, added), (200, {"name": "EXAMPLE_API_KEY", "kind": "send", "use": "env",
                                                 "origin": None}))
        listed = {item["name"]: item for item in self.call("GET", "/api/secrets", cookie=self.cookie)[2]}
        self.assertEqual(set(listed["EXAMPLE_API_KEY"]), {"name", "kind", "note", "use", "origin", "last_used", "uses"})
        self.assertEqual(listed["GITHUB_TOKEN"]["uses"], 1)
        self.assertIsNone(listed["STRIPE_API_KEY"]["last_used"])
        self.assertFalse(any(FAKE.encode() in body for body in self.bodies))

    def test_a_secret_is_removed_from_the_vault(self):
        self.assertEqual(self.add({"name": "EXAMPLE_API_KEY", "value": FAKE})[0], 200)
        removed = self.call("POST", "/api/secrets/EXAMPLE_API_KEY/remove", {}, cookie=self.cookie)
        self.assertEqual(removed[::2], (200, {"removed": "EXAMPLE_API_KEY"}))
        self.assertIsNone(self.home.vault.info("EXAMPLE_API_KEY"))
        listed = [item["name"] for item in self.call("GET", "/api/secrets", cookie=self.cookie)[2]]
        self.assertNotIn("EXAMPLE_API_KEY", listed)
        status, _, data = self.call("POST", "/api/secrets/EXAMPLE_API_KEY/remove", {}, cookie=self.cookie)
        self.assertEqual((status, data), (400, {"error": "The vault has no secret named EXAMPLE_API_KEY."}))
        self.assertEqual(self.call("POST", "/api/secrets/GITHUB_TOKEN/remove", {}, cookie=self.cookie,
                                   origin=False)[0], 403)
        self.assertIsNotNone(self.home.vault.info("GITHUB_TOKEN"))

    def test_bad_entries_are_refused(self):
        self.assertEqual(self.add({"name": "lower_case", "value": FAKE})[0], 400)
        self.assertEqual(self.add({"name": "EXAMPLE_KEY", "kind": "maybe", "value": FAKE})[0], 400)
        self.assertEqual(self.add({"name": "EXAMPLE_KEY", "value": ""})[0], 400)
        self.assertEqual(self.add({"name": "EXAMPLE_KEY", "use": "ftp", "value": FAKE})[0], 400)
        status, _, data = self.add({"name": "EXAMPLE_KEY", "use": "http", "origin": "ftp://example.com", "value": FAKE})
        self.assertEqual(status, 400)
        self.assertIn("web address", data["error"])
        self.assertEqual(self.add({"name": "EXAMPLE_KEY", "use": "http", "value": FAKE})[0], 400)
        self.assertEqual(self.add({"name": "EXAMPLE_KEY", "value": "short"})[0], 400)
        self.assertIsNone(self.home.vault.info("EXAMPLE_KEY"))
        self.assertFalse(any(FAKE.encode() in body for body in self.bodies))

    def test_a_web_secret_names_its_one_site(self):
        status, _, added = self.add({"name": "EXAMPLE_API_KEY", "use": "http", "kind": "send",
                                     "origin": "https://API.example.com:443/", "value": FAKE})
        self.assertEqual(status, 200)
        self.assertEqual(added, {"name": "EXAMPLE_API_KEY", "kind": "send", "use": "http",
                                 "origin": "https://api.example.com"})
        listed = {item["name"]: item for item in self.call("GET", "/api/secrets", cookie=self.cookie)[2]}
        self.assertEqual(listed["EXAMPLE_API_KEY"]["origin"], "https://api.example.com")

    def test_a_value_is_typed_only_here_or_over_https(self):
        with mock.patch.object(web, "LOOPBACK", frozenset()):
            status, _, data = self.add({"name": "EXAMPLE_API_KEY", "value": FAKE}, bearer=True)
        self.assertEqual(status, 403)
        self.assertIsNone(self.home.vault.info("EXAMPLE_API_KEY"))

    def locked(self) -> Vault:
        """The same vault as Artemis finds it after a restart under a passphrase: locked until it is typed."""
        opened = self.home.vault
        self.home.vault = Vault(self.home.paths, "passphrase")
        self.addCleanup(setattr, self.home, "vault", opened)
        return self.home.vault

    def test_a_missing_or_locked_vault_says_so(self):
        self.locked()
        self.assertEqual(self.call("GET", "/api/secrets", cookie=self.cookie)[0], 423)
        self.assertEqual(self.add({"name": "EXAMPLE_API_KEY", "value": FAKE})[0], 423)
        self.assertEqual(self.call("POST", f"/api/cards/{self.ids['newsletter']}/secret", {"value": FAKE},
                                   cookie=self.cookie)[0], 423)
        self.assertEqual(self.home.ledger.card(self.ids["newsletter"])["state"], "waiting")
        vault = self.call("GET", "/api/state", cookie=self.cookie)[2]["vault"]
        self.assertEqual((vault["locked"], vault["state"], vault["from_env"]), (True, "locked", False))
        self.home.vault = None
        self.assertEqual(self.call("GET", "/api/secrets", cookie=self.cookie)[0], 423)
        self.assertIsNone(self.call("GET", "/api/state", cookie=self.cookie)[2]["vault"])

    def test_a_vault_unlocked_from_the_environment_says_so(self):
        vault = self.call("GET", "/api/state", cookie=self.cookie)[2]["vault"]
        self.assertEqual((vault["locked"], vault["from_env"], vault["notice"]),
                         (False, True, "vault unlocked from environment"))

    def test_unlocking_happens_on_this_computer_and_the_passphrase_stays_hidden(self):
        self.assertEqual(self.call("POST", "/api/vault/unlock", {"passphrase": PASSPHRASE}, cookie=self.cookie)[0],
                         409)
        vault = self.locked()
        status, _, data = self.call("POST", "/api/vault/unlock", {"passphrase": "fake-wrong-guess"}, cookie=self.cookie)
        self.assertEqual(status, 400)
        self.assertIn("does not unlock", data["error"])
        self.assertFalse(vault.unlocked)
        with mock.patch.object(web, "LOOPBACK", frozenset()):
            self.assertEqual(self.call("POST", "/api/vault/unlock", {"passphrase": PASSPHRASE}, bearer=True)[0], 403)
        status, _, data = self.call("POST", "/api/vault/unlock", {"passphrase": PASSPHRASE}, cookie=self.cookie)
        self.assertEqual((status, data["locked"], data["state"]), (200, False, "open"))
        self.assertTrue(vault.unlocked)
        self.assertFalse(any(PASSPHRASE.encode() in body or b"fake-wrong-guess" in body for body in self.bodies))

    def test_an_unlock_error_never_repeats_the_passphrase(self):
        vault = self.locked()
        with mock.patch.object(vault, "unlock", side_effect=ValueError("rejected fake-wrong-guess")):
            status, _, data = self.call("POST", "/api/vault/unlock", {"passphrase": "fake-wrong-guess"},
                                        cookie=self.cookie)
        self.assertEqual((status, data["error"]), (400, "rejected [hidden]"))

    def test_an_error_never_repeats_the_value(self):
        with mock.patch.object(self.home.vault, "set", side_effect=RuntimeError(f"could not keep {FAKE}")):
            status, _, data = self.add({"name": "EXAMPLE_API_KEY", "value": FAKE})
        self.assertEqual(status, 500)
        self.assertIn("[hidden]", data["error"])
        self.assertNotIn(FAKE, self.stderr.getvalue())

    def test_the_audit_returns_counts_only(self):
        status, _, found = self.call("GET", "/api/secrets/audit", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(set(found), {"values", "files", "found"})
        self.assertEqual(found["values"], 5)          # four secrets and the vault's own key
        self.assertGreaterEqual(found["found"], 1)     # the demo log holds one stored value, written out

    def test_the_value_is_in_no_response_log_stream_or_ledger(self):
        stream = Stream(self, self.cookie)
        self.add({"name": "EXAMPLE_API_KEY", "value": FAKE})
        self.call("POST", f"/api/cards/{self.ids['newsletter']}/secret", {"value": FAKE}, cookie=self.cookie)
        self.home.publish("said.delta", {"turn": "t1", "text": f"the key is {FAKE}"})
        seen = stream.until(lambda text: "said.delta" in text)
        stream.close()
        self.assertIn("[secret:", seen)
        self.assertNotIn(FAKE, seen)
        self.assertFalse(any(FAKE.encode() in body for body in self.bodies))
        self.assertNotIn(FAKE, self.stderr.getvalue())
        for path in [self.home.paths.ledger, *self.home.paths.root.glob("ledger.db*"), *self.home.paths.logs.iterdir()]:
            if path.is_file():
                self.assertNotIn(FAKE.encode(), path.read_bytes(), path.name)


class Stream:
    """An open /api/events stream, read line by line in the background."""

    def __init__(self, case: AppCase, cookie: str, last: int | None = None):
        self.sock = socket.create_connection(("127.0.0.1", case.port), timeout=10)
        extra = f"Last-Event-ID: {last}\r\n" if last is not None else ""
        self.sock.sendall((f"GET /api/events HTTP/1.1\r\nHost: 127.0.0.1:{case.port}\r\n"
                           f"Cookie: {web.COOKIE}={cookie}\r\n{extra}\r\n").encode())
        self.text = ""
        self.lock = threading.Lock()
        self.ended = threading.Event()      # the server closed the stream
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        try:
            while chunk := self.sock.recv(65536):
                with self.lock:
                    self.text += chunk.decode("utf-8", "replace")
            self.ended.set()
        except OSError:
            pass

    def until(self, done, seconds: float = 8.0) -> str:
        deadline = time.time() + seconds
        while time.time() < deadline:
            with self.lock:
                if done(self.text):
                    return self.text
            time.sleep(0.05)
        return self.text

    def events(self) -> list[tuple[int | None, dict]]:
        found = []
        for block in self.text.split("\r\n\r\n", 1)[-1].split("\n\n"):
            lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line and line[0] != ":")
            if "data" in lines:
                found.append((int(lines["id"]) if "id" in lines else None, json.loads(lines["data"])))
        return found

    def close(self):
        with contextlib.suppress(OSError):
            self.sock.shutdown(socket.SHUT_RDWR)
        self.sock.close()


class LiveTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()
        self.cursor = self.call("GET", "/api/state", cookie=self.cookie)[2]["cursor"]

    def test_a_stream_resumes_after_the_last_event_it_saw(self):
        stream = Stream(self, self.cookie, last=self.cursor - 2)
        stream.until(lambda text: text.count("\nid: ") >= 2)
        ids = [key for key, _ in stream.events() if key is not None]
        self.assertEqual(ids[:2], [self.cursor - 1, self.cursor])
        self.home.ledger.note(Role.LEAD, "A new reading", project=self.ids["shop"])
        self.home.publish("said.delta", {"turn": "t9", "text": "Hel"})
        stream.until(lambda text: "said.delta" in text and "A new reading" in text)
        stream.close()
        events = stream.events()
        self.assertIn((self.cursor + 1, "note"), [(key, data["kind"]) for key, data in events])
        delta = next(data for key, data in events if data["kind"] == "said.delta")
        self.assertEqual(delta["data"], {"turn": "t9", "text": "Hel"})
        self.assertIn("text/event-stream", stream.text.split("\r\n\r\n")[0])

    def test_a_stream_that_falls_behind_is_closed_and_lets_go_of_the_home(self):
        with mock.patch("artemis.home.SUBSCRIBER_QUEUE", 1), \
                mock.patch.object(self.home, "unsubscribe", wraps=self.home.unsubscribe) as unsubscribe:
            stream = Stream(self, self.cookie, last=self.cursor)
            self.addCleanup(stream.close)
            stream.until(lambda text: "retry:" in text)
            for _ in range(2000):
                self.home.publish("said.delta", {"turn": "demo-1", "text": "x"})
            self.assertTrue(stream.ended.wait(5), "the stream stayed open")
            self.until(lambda: unsubscribe.called)
        self.assertIn("retry: 2000", stream.text)

    def test_the_long_poll_answers_with_new_events_or_after_its_wait(self):
        with mock.patch.object(web, "POLL_WAIT", 0.6):
            started = time.monotonic()
            status, _, data = self.call("GET", f"/api/events?poll=1&after={self.cursor}", cookie=self.cookie)
            self.assertEqual((status, data), (200, {"events": [], "cursor": self.cursor}))
            self.assertLess(time.monotonic() - started, 5)
        threading.Timer(0.3, self.home.ledger.note, (Role.LEAD, "Later reading")).start()
        status, _, data = self.call("GET", f"/api/events?poll=1&after={self.cursor}", cookie=self.cookie)
        self.assertEqual([event["kind"] for event in data["events"]], ["note"])
        self.assertEqual(data["cursor"], self.cursor + 1)

    def test_open_streams_leave_room_for_stop_and_approvals(self):
        with mock.patch.object(web, "MAX_STREAMS", 2):
            streams = [Stream(self, self.cookie) for _ in range(2)]
            for stream in streams:
                stream.until(lambda text: "retry:" in text)
            status, _, data = self.call("GET", "/api/events", cookie=self.cookie)
            self.assertEqual(status, 503)
            self.assertIn("checks every few seconds", data["error"])
            started = time.monotonic()
            self.assertEqual(self.call("POST", "/api/stop", {}, cookie=self.cookie)[0], 200)
            declined = self.call("POST", f"/api/cards/{self.ids['push']}/decline", {}, cookie=self.cookie)
            self.assertEqual(declined[0], 200)
            self.assertLess(time.monotonic() - started, 3)
            self.assertEqual(self.call("GET", f"/api/events?poll=1&after=0", cookie=self.cookie)[0], 200)
            for stream in streams:
                stream.close()
        deadline = time.time() + 5
        while self.server.streams and time.time() < deadline:
            time.sleep(0.1)
        self.assertEqual(self.server.streams, 0)

    def test_a_stream_lets_go_when_its_client_hangs_up_with_nothing_to_send(self):
        stream = Stream(self, self.cookie)
        stream.until(lambda text: "retry:" in text)
        self.assertEqual(self.server.streams, 1)
        stream.close()
        deadline = time.monotonic() + 3      # well inside the heartbeat, the only write a quiet stream makes
        while self.server.streams and time.monotonic() < deadline:
            time.sleep(0.05)
        self.assertEqual(self.server.streams, 0)


class DeviceNameTest(unittest.TestCase):
    def test_a_device_is_named_by_its_browser_and_system(self):
        self.assertEqual(web._device_name(IPHONE), ("Safari on iPhone", True))
        self.assertEqual(web._device_name(DESKTOP), ("Chrome on Mac", False))
        self.assertEqual(web._device_name("Mozilla/5.0 (Windows NT 10.0) Firefox/133.0"), ("Firefox on Windows", False))
        self.assertEqual(web._device_name(""), ("A browser", False))

    def test_cookies_are_kept_only_as_hashes(self):
        self.assertEqual(web._digest("abc"), hashlib.sha256(b"abc").hexdigest())


if __name__ == "__main__":
    unittest.main()
