from dataclasses import dataclass
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import ssl
import threading
import time
import unittest
from unittest import mock
from urllib.parse import urlsplit

from artemis import httpop, tls
from artemis.judge import Criterion
from artemis.ledger import Ledger
from artemis.roles import Interrupt, Role
from artemis.scrub import forms
from artemis.vault import PASSPHRASE_ENV, Vault, VaultLocked

from test_vault import OTHER, VALUE, HomePaths, env_vault, isolated


GONE = "[secret:WEB_TOKEN]"
CHECK = (Criterion("done", command=("python3", "-c", "pass")),)
ELSEWHERE = "https://elsewhere.example.net/collect"


class Receiver(BaseHTTPRequestHandler):
    """The loopback test server: records every request it receives and answers by path."""

    def answer(self):
        size = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(size) if size else b""
        self.server.seen.append((self.command, self.path, dict(self.headers), body))
        status, data, extra = {
            "/echo": (200, json.dumps({"headers": dict(self.headers), "body": body.decode()}).encode(),
                      {"X-Echo": self.headers.get("Authorization", "")}),
            "/redirect": (302, b"", {"Location": ELSEWHERE}),
            "/big": (200, b"x" * (httpop.MAX_BODY + 100), {}),
            "/download": (200, b"\x89PNG\r\n" + VALUE.encode() + b"\xff end", {}),
            "/items": (201, b'{"id": 7}', {}),
        }.get(self.path.split("?")[0], (404, b"no such page", {}))
        self.send_response(status)
        for name, value in extra.items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = answer

    def log_message(self, *args):
        pass


def receiver(test: unittest.TestCase, context: ssl.SSLContext | None = None) -> tuple[ThreadingHTTPServer, str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
    server.seen = []
    if context:
        server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, args=(0.05,), daemon=True).start()
    test.addCleanup(server.server_close)
    test.addCleanup(server.shutdown)
    return server, f"{'https' if context else 'http'}://127.0.0.1:{server.server_address[1]}"


@dataclass
class DemoHome:
    """Stand-in for home.Home (B1's): only the three fields httpop reads."""
    paths: HomePaths
    ledger: Ledger
    vault: Vault


@dataclass(frozen=True)
class DemoGrant:
    """Stand-in for home.Grant (B1's)."""
    run: int
    task: int | None
    project: int
    role: str
    root: Path
    kind: str


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.paths = isolated(self)
        self.vault = env_vault(self.paths)
        self.ledger = Ledger(self.paths.ledger)
        self.ledger.initialize()
        self.root = self.paths.root.parent / "demo"
        (self.root / "downloads").mkdir(parents=True)
        self.project = self.ledger.add_project(Role.OWNER, "demo", "folder", self.root)
        self.request = self.ledger.request(Role.OWNER, "Use the demo API", project=self.project)
        self.schedule = self.ledger.add_schedule(Role.OWNER, self.project, "Nightly sync", "", "host", CHECK,
                                                 "daily 09:00", time.time() + 3600)
        self.grant = self.grant_for(None)
        self.home = DemoHome(self.paths, self.ledger, self.vault)
        self.server, self.base = receiver(self)
        self.vault.set("WEB_TOKEN", VALUE, use="http", origin=self.base)

    def grant_for(self, schedule):
        task = self.ledger.add_task(Role.LEAD, self.request, "Sync the demo API", "", CHECK, kind="host",
                                    schedule=schedule)
        run = self.ledger.claim_run(Role.HOME, task, "mock")
        return DemoGrant(run, task, self.project, "worker", self.root, "folder")

    def call(self, grant=None, **args):
        return httpop.request(self.home, grant or self.grant, args)

    def posts(self):
        return [entry for entry in self.server.seen if entry[0] != "GET"]

    def assert_nowhere(self, *texts):
        """No form of the values in the ledger file or the given texts."""
        stored = self.paths.ledger.read_bytes()
        for value in (VALUE, OTHER):
            for form in forms(value):
                self.assertNotIn(form.encode("utf-8"), stored)
                for text in texts:
                    self.assertNotIn(form, text)

    def test_artemis_adds_the_key_and_the_agent_sees_the_answer_scrubbed(self):
        result = self.call(method="get", url=self.base + "/echo#part", secret="WEB_TOKEN",
                           headers={"Accept": "application/json"})
        self.assertEqual((result["state"], result["status"], result["truncated"]), ("done", 200, False))
        [(method, path, headers, _)] = self.server.seen
        self.assertEqual((method, path, headers["Authorization"], headers["Accept"]),
                         ("GET", "/echo", f"Bearer {VALUE}", "application/json"))
        self.assertEqual(result["headers"]["X-Echo"], f"Bearer {GONE}")
        self.assertIn(f"Bearer {GONE}", result["body"])           # the echoed header, JSON-escaped, scrubbed
        [use] = self.ledger.secret_uses("WEB_TOKEN")
        self.assertEqual((use["tool"], use["task_id"], use["run_id"]), ("http_request", self.grant.task,
                                                                        self.grant.run))
        [event] = [row for row in self.ledger.events() if row["kind"] == "http.request"]
        self.assertEqual(event["detail"], f"GET {self.base}/echo → 200")
        head = self.call(method="HEAD", url=self.base + "/echo", secret="WEB_TOKEN")
        self.assertEqual((head["status"], head["body"]), (200, ""))
        self.assert_nowhere(json.dumps(result), json.dumps(head))

    def test_a_key_goes_only_to_its_own_origin(self):
        port = self.base.rsplit(":", 1)[1]
        for url in (f"http://localhost:{port}/echo", f"http://127.0.0.1:{int(port) + 1}/echo"):
            with self.subTest(url):
                result = self.call(method="GET", url=url, secret="WEB_TOKEN")
                self.assertEqual(result["state"], "denied")
                self.assertIn(f"sent only to {self.base}", result["reason"])
        self.assertEqual(self.server.seen, [])

    def test_only_https_except_to_this_computer(self):
        for url, words in (("http://api.example.com/v1", "only over HTTPS"), ("ftp://api.example.com/", "web address"),
                           ("https://user:pw@api.example.com/", "web address"), ("https://api.example.com/a b", "url is")):
            with self.subTest(url):
                result = self.call(method="GET", url=url)
                self.assertEqual(result["state"], "denied")
                self.assertIn(words, result["reason"])

    def test_commands_keys_and_unknown_names_are_refused(self):
        self.vault.set("CLI_TOKEN", OTHER, use="env")
        for name, words in (("CLI_TOKEN", "is for commands"), ("MISSING_TOKEN", "no secret named MISSING_TOKEN")):
            with self.subTest(name):
                result = self.call(method="GET", url=self.base + "/echo", secret=name)
                self.assertEqual(result["state"], "denied")
                self.assertIn(words, result["reason"])
        self.assertEqual(self.server.seen, [])

    def test_requests_artemis_does_not_make(self):
        for args, words in (({"method": "TRACE"}, "method is one of"),
                            ({"method": "GET", "headers": {"Host": "api.example.com"}}, "sets Host itself"),
                            ({"method": "GET", "headers": {"Transfer-Encoding": "chunked"}}, "itself"),
                            ({"method": "GET", "secret": "WEB_TOKEN", "headers": {"authorization": "Bearer x-demo"}},
                             "leave it out"),
                            ({"method": "GET", "headers": {"Bad Name": "x"}}, "not a valid header"),
                            ({"method": "GET", "headers": {"X-Demo": "a\r\nX-Injected: 1"}}, "not a valid header"),
                            ({"method": "GET", "body": "data"}, "GET request has no body")):
            with self.subTest(words):
                result = self.call(url=self.base + "/echo", **args)
                self.assertEqual(result["state"], "denied")
                self.assertIn(words, result["reason"])
        self.assertEqual(self.server.seen, [])

    def test_a_redirect_is_returned_not_followed(self):
        result = self.call(method="GET", url=self.base + "/redirect", secret="WEB_TOKEN")
        self.assertEqual((result["status"], result["headers"]["Location"]), (302, ELSEWHERE))
        self.assertEqual(len(self.server.seen), 1)

    def test_a_large_answer_is_cut_and_said_so(self):
        with mock.patch.object(httpop, "MAX_BODY", 1000):
            result = self.call(method="GET", url=self.base + "/big")
        self.assertEqual((result["truncated"], len(result["body"])), (True, 1000))
        self.assertEqual(self.call(method="GET", url=self.base + "/missing")["status"], 404)

    def test_save_to_writes_a_new_scrubbed_file_inside_the_project(self):
        result = self.call(method="GET", url=self.base + "/download", secret="WEB_TOKEN",
                           save_to="downloads/demo.bin")
        saved = (self.root / "downloads" / "demo.bin").resolve()
        self.assertEqual((result["saved"], result["bytes"]), (str(saved), saved.stat().st_size))
        self.assertEqual(saved.read_bytes(), b"\x89PNG\r\n" + GONE.encode() + b"\xff end")
        self.assertNotIn("body", result)
        for target, words in (("downloads/demo.bin", "already exists"), ("../outside.bin", "outside the project"),
                              (str(self.root / "abs.bin"), "relative to the project"), (".env", ".env files"),
                              ("downloads/.env.local", ".env files"), ("nowhere/demo.bin", "not a folder")):
            with self.subTest(target):
                refused = self.call(method="GET", url=self.base + "/download", save_to=target)
                self.assertEqual(refused["state"], "denied")
                self.assertIn(words, refused["reason"])
        self.assertEqual(len(self.server.seen), 1)

    def test_a_send_key_waits_for_a_card_on_changes_and_dispatch_sends_it_once(self):
        self.vault.set("SEND_TOKEN", OTHER, use="http", kind="send", origin=self.base)
        self.assertEqual(self.call(method="GET", url=self.base + "/echo", secret="SEND_TOKEN")["state"], "done")
        body = '{"name": "demo item"}'
        url = self.base + "/items"
        held = self.call(method="POST", url=url, secret="SEND_TOKEN", body=body,
                         headers={"Content-Type": "application/json"})
        self.assertEqual(held["state"], "held")
        self.assertEqual(self.posts(), [])
        card = self.ledger.card(held["card"])
        self.assertEqual((card["kind"], card["what"], json.loads(card["secrets"]), card["state"]),
                         (Interrupt.SEND, f"POST {urlsplit(self.base).netloc}", ["SEND_TOKEN"], "waiting"),
                         "with no stated purpose, the card says the method and where it goes")
        self.assertEqual(json.loads(card["command"]),
                         {"method": "POST", "url": url, "headers": {"Content-Type": "application/json"},
                          "body_sha256": hashlib.sha256(body.encode()).hexdigest(), "save_to": None})
        self.assertAlmostEqual(card["expires"] - card["created"], httpop.HOLD, delta=5)
        kept = httpop.body_file(self.paths, held["card"])
        self.assertEqual(kept.read_bytes(), body.encode())
        if os.name == "posix":
            self.assertEqual(kept.stat().st_mode & 0o777, 0o600)
        self.assertTrue(httpop.is_http(card))
        self.assertFalse(httpop.is_http({"command": '["git", "push"]'}))
        self.assertFalse(httpop.is_http({"command": '{"argv": ["git", "push"], "stdin": null}'}))

        self.ledger.decide_card(Role.OWNER, held["card"], True)
        self.assertTrue(self.ledger.claim_card(Role.HOME, held["card"]))
        state, said = httpop.dispatch(self.home, held["card"])
        self.ledger.finish_card(Role.HOME, held["card"], state, said)
        self.assertEqual((state, said), ("done", '201 Created\n{"id": 7}'))
        [(method, path, headers, sent)] = self.posts()
        self.assertEqual((method, path, headers["Authorization"], headers["Content-Type"], sent),
                         ("POST", "/items", f"Bearer {OTHER}", "application/json", body.encode()))
        self.assertFalse(kept.exists())
        self.assertEqual([use["card_id"] for use in self.ledger.secret_uses("SEND_TOKEN")], [None, held["card"]])
        with self.assertRaisesRegex(httpop.HttpError, "is done, not claimed to run; nothing was sent"):
            httpop.dispatch(self.home, held["card"])
        self.assertEqual(len(self.posts()), 1)
        self.assert_nowhere(json.dumps(held), said, json.dumps(dict(self.ledger.card(held["card"]))))

    def test_a_held_request_is_titled_by_what_it_is_for_and_keeps_the_exact_request(self):
        self.vault.set("SEND_TOKEN", OTHER, use="http", kind="send", origin=self.base)
        url = self.base + "/hooks/team?channel=receipts"
        held = self.call(method="POST", url=url, secret="SEND_TOKEN", body="{}",
                         purpose="Post the receipts summary to the team channel")
        card = self.ledger.card(held["card"])
        self.assertEqual(card["what"], "Post the receipts summary to the team channel")
        self.assertEqual({key: json.loads(card["command"])[key] for key in ("method", "url")},
                         {"method": "POST", "url": url}, "the exact request stays in the card, where it is checked")
        for purpose in ("", "two\nlines", 3):
            with self.subTest(purpose=purpose):
                self.assertEqual(self.call(method="POST", url=url, secret="SEND_TOKEN", purpose=purpose)["state"],
                                 "denied")

    def test_a_held_request_without_a_body_is_sent_once_too(self):
        self.vault.set("PAY_TOKEN", OTHER, use="http", kind="spend", origin=self.base)
        held = self.call(method="GET", url=self.base + "/echo", secret="PAY_TOKEN")
        with self.assertRaisesRegex(httpop.HttpError, "is waiting, not claimed"):
            httpop.dispatch(self.home, held["card"])
        self.ledger.decide_card(Role.OWNER, held["card"], True)
        self.ledger.claim_card(Role.HOME, held["card"])
        state, said = httpop.dispatch(self.home, held["card"])
        self.ledger.finish_card(Role.HOME, held["card"], state, said)
        self.assertEqual((state, said.splitlines()[0]), ("done", "200 OK"))
        self.assertIn("Bearer [secret:PAY_TOKEN]", said)
        with self.assertRaises(httpop.HttpError):
            httpop.dispatch(self.home, held["card"])
        self.assertEqual(len(self.server.seen), 1)

    def test_a_kept_body_that_changed_is_not_sent(self):
        self.vault.set("SEND_TOKEN", OTHER, use="http", kind="send", origin=self.base)
        held = self.call(method="PUT", url=self.base + "/items", secret="SEND_TOKEN", body="first")
        self.ledger.decide_card(Role.OWNER, held["card"], True)
        self.ledger.claim_card(Role.HOME, held["card"])
        httpop.body_file(self.paths, held["card"]).write_bytes(b"second")
        self.assertEqual(httpop.dispatch(self.home, held["card"]),
                         ("failed", "The kept request body no longer matches the card; nothing was sent."))
        self.assertEqual(self.posts(), [])

    def test_a_standing_approval_covers_only_its_schedule_url_method_and_key(self):
        self.vault.set("SEND_TOKEN", OTHER, use="http", kind="send", origin=self.base)
        nightly = self.grant_for(self.schedule)
        url = self.base + "/items"
        first = self.call(nightly, method="POST", url=url, secret="SEND_TOKEN", body="{}")
        self.assertEqual(first["state"], "held")
        self.ledger.decide_card(Role.OWNER, first["card"], True, standing={
            "schedule": self.schedule, "url": url, "method": "POST", "secret": "SEND_TOKEN"})
        through = self.call(nightly, method="POST", url=url, secret="SEND_TOKEN", body="{}")
        self.assertEqual((through["state"], through["status"]), ("done", 201))
        for grant, method, target in ((nightly, "POST", url + "?all=1"), (nightly, "PUT", url),
                                      (self.grant, "POST", url)):
            with self.subTest(method=method, target=target, scheduled=grant is nightly):
                self.assertEqual(self.call(grant, method=method, url=target, secret="SEND_TOKEN",
                                           body="{}")["state"], "held")
        self.assertEqual(len(self.posts()), 1)

    def test_a_spend_key_asks_every_time(self):
        self.vault.set("PAY_TOKEN", OTHER, use="http", kind="spend", origin=self.base)
        cards = [self.call(method="GET", url=self.base + "/echo", secret="PAY_TOKEN") for _ in range(2)]
        self.assertEqual([result["state"] for result in cards], ["held", "held"])
        self.assertEqual({self.ledger.card(result["card"])["kind"] for result in cards}, {Interrupt.SPEND})
        self.assertEqual(self.server.seen, [])

    def test_a_locked_vault_holds_only_what_needs_a_key(self):
        self.vault.set("SEND_TOKEN", OTHER, use="http", kind="send", origin=self.base)
        held = self.call(method="POST", url=self.base + "/items", secret="SEND_TOKEN", body="{}")
        del os.environ[PASSPHRASE_ENV]
        self.home.vault = Vault(self.paths, "env")                    # a restart without the passphrase
        with self.assertRaisesRegex(VaultLocked, PASSPHRASE_ENV):
            self.call(method="GET", url=self.base + "/echo", secret="WEB_TOKEN")
        self.assertEqual(self.call(method="GET", url=self.base + "/echo")["status"], 200)
        self.ledger.decide_card(Role.OWNER, held["card"], True)
        with self.assertRaises(VaultLocked):
            httpop.dispatch(self.home, held["card"])
        self.assertTrue(httpop.body_file(self.paths, held["card"]).exists())   # kept for after the unlock
        self.assertEqual(self.posts(), [])

    def test_a_server_that_cannot_be_reached_is_said_plainly(self):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        self.vault.set("GONE_TOKEN", OTHER, use="http", origin=f"http://127.0.0.1:{port}")
        with self.assertRaises(httpop.HttpError) as caught:
            self.call(method="GET", url=f"http://127.0.0.1:{port}/", secret="GONE_TOKEN")
        self.assertFalse(caught.exception.sent)
        self.assertIn("did not complete", str(caught.exception))
        self.assert_nowhere(str(caught.exception))

    def test_an_untrusted_https_certificate_stops_the_request_before_the_key_is_sent(self):
        with mock.patch.object(tls, "lan_names", return_value=["127.0.0.1", "localhost"]):
            cert, key, _ = tls.ensure_cert(self.paths, [])
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        server, base = receiver(self, context)
        self.vault.set("TLS_TOKEN", OTHER, use="http", origin=base)
        with self.assertRaises(httpop.HttpError) as caught:
            self.call(method="GET", url=base + "/echo", secret="TLS_TOKEN")
        self.assertIn("certificate is not trusted", str(caught.exception))
        self.assertFalse(caught.exception.sent)
        self.assertEqual(server.seen, [])


if __name__ == "__main__":
    unittest.main()
