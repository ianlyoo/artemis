import argparse
import base64
from contextlib import closing, redirect_stdout
import io
import json
import os
import random
import sqlite3
import unittest
from urllib.parse import quote, quote_plus

from artemis import vault as vault_module
from artemis.ledger import Ledger
from artemis.roles import Role
from artemis.scrub import MASTER, Scrubber, audit
from artemis.vault import PASSPHRASE_ENV, Vault

from test_vault import OTHER, PASSPHRASE, VALUE, env_vault, isolated


GONE = "[secret:DEMO_TOKEN]"
KEY_GONE = f"[secret:{MASTER}]"


def encodings(value: str) -> dict[str, str]:
    """The forms the brief names, computed here independently of scrub.forms."""
    data = value.encode("utf-8")
    std, url = base64.b64encode(data).decode(), base64.urlsafe_b64encode(data).decode()
    return {"raw": value, "base64": std, "base64 unpadded": std.rstrip("="), "base64url": url,
            "base64url unpadded": url.rstrip("="), "hex": data.hex(), "HEX": data.hex().upper(),
            "quote": quote(value), "quote safe=''": quote(value, safe=""), "quote_plus": quote_plus(value),
            "json": json.dumps(value)[1:-1]}


class ScrubTests(unittest.TestCase):
    def setUp(self):
        self.paths = isolated(self)
        self.vault = env_vault(self.paths)
        self.vault.set("DEMO_TOKEN", VALUE, use="env")
        self.scrubber = Scrubber(self.vault)

    def test_the_test_value_has_distinct_encodings(self):
        forms = encodings(VALUE)
        self.assertEqual(len(set(forms.values())), len(forms))

    def test_every_form_becomes_the_placeholder(self):
        for label, form in encodings(VALUE).items():
            with self.subTest(label):
                self.assertEqual(self.scrubber.scrub(f"before {form} after"), f"before {GONE} after")

    def test_base64_inside_a_longer_encoding(self):
        for label, text in (("basic auth", "user:" + VALUE), ("echo | base64", VALUE + "\n"),
                            ("offset 1", "u" + VALUE + "!"), ("offset 2", "ux" + VALUE + "!!")):
            for encode in (base64.b64encode, base64.urlsafe_b64encode):
                with self.subTest(label, encode=encode.__name__):
                    blob = encode(text.encode("utf-8")).decode()
                    scrubbed = self.scrubber.scrub(f"Authorization: Basic {blob}")
                    self.assertIn(GONE, scrubbed)
                    self.assertLessEqual(len(scrubbed.replace(GONE, "")), len("Authorization: Basic ") + 8)

    def test_the_longest_value_wins_where_one_starts_another(self):
        self.vault.set("SHORT_TOKEN", "demo-shared-start", use="env")
        self.vault.set("LONG_TOKEN", "demo-shared-start-and-more", use="env")
        self.assertEqual(self.scrubber.scrub("a demo-shared-start-and-more b demo-shared-start c"),
                         "a [secret:LONG_TOKEN] b [secret:SHORT_TOKEN] c")

    def test_a_value_with_line_ends_is_found_as_command_output_reads_it(self):
        self.vault.set("CERT_TEXT", "demo-first-line\r\ndemo-second-line\rdemo-third", use="env")
        self.assertEqual(self.scrubber.scrub("got demo-first-line\ndemo-second-line\ndemo-third ok"),
                         "got [secret:CERT_TEXT] ok")

    def test_a_value_split_across_two_chunks(self):
        text = f"token={VALUE}; hex={VALUE.encode().hex()}; again {VALUE}\n"
        whole = self.scrubber.scrub(text)
        self.assertEqual(whole.count(GONE), 3)
        for cut in range(len(text) + 1):
            stream = self.scrubber.stream()
            out = stream.feed(text[:cut]) + stream.feed(text[cut:]) + stream.flush()
            self.assertEqual(out, whole, cut)

    def test_any_chunking_matches_scrubbing_the_whole(self):
        self.vault.set("OTHER_TOKEN", OTHER, use="env")
        forms = list(encodings(VALUE).values()) + [OTHER, base64.b64encode(OTHER.encode()).decode()]
        pick = random.Random(7)
        for _ in range(200):
            text = "".join(pick.choice(forms + ["x", " ", "\n", "dem", "fake-"]) for _ in range(12))
            stream, out, at = self.scrubber.stream(), [], 0
            while at < len(text):
                step = pick.randint(1, 9)
                out.append(stream.feed(text[at:at + step]))
                at += step
            self.assertEqual("".join(out) + stream.flush(), self.scrubber.scrub(text))

    def test_a_stream_lets_text_through_without_holding_more_than_it_must(self):
        stream = self.scrubber.stream()
        longest = max(len(form) for form in [*encodings(VALUE).values(), self.vault.master_key().hex()])
        sent = stream.feed("x" * 5000)
        self.assertGreaterEqual(len(sent), 5000 - longest)

    def test_the_scrubber_follows_changes_made_by_another_process(self):
        stream = self.scrubber.stream()
        elsewhere = Vault(self.paths, "env")
        elsewhere.set("OTHER_TOKEN", OTHER, use="http", origin="https://api.example.com")
        self.assertEqual(self.scrubber.scrub(f"{OTHER}"), "[secret:OTHER_TOKEN]")
        self.assertEqual(stream.feed(f"{OTHER} ") + stream.flush(), "[secret:OTHER_TOKEN] ")
        elsewhere.remove("OTHER_TOKEN")
        self.assertEqual(self.scrubber.scrub(f"{OTHER}"), OTHER)

    def test_an_empty_vault_changes_nothing_but_its_key(self):
        self.vault.remove("DEMO_TOKEN")
        self.assertEqual(self.scrubber.scrub(VALUE), VALUE)
        stream = self.scrubber.stream()
        self.assertEqual(stream.feed("abc") + stream.flush(), "abc")
        self.assertEqual(self.scrubber.scrub(base64.b64encode(self.vault.master_key()).decode()), KEY_GONE)

    def test_the_vault_key_is_scrubbed_raw_and_encoded(self):
        key = self.vault.master_key()
        std, url = base64.b64encode(key).decode(), base64.urlsafe_b64encode(key).decode()
        for form in (std, std.rstrip("="), url, url.rstrip("="), key.hex(), key.hex().upper(),
                     key.decode("utf-8", "surrogateescape")):
            with self.subTest(form=form[:6]):
                self.assertEqual(self.scrubber.scrub(f"<{form}>"), f"<{KEY_GONE}>")
        for before, after in ((b"", b""), (b"\xff key=", b"\x80"), (b"\xc2", b"\xa9"), (b"\xe2\x82", b"\xbf\xbf")):
            with self.subTest(before=before, after=after):  # stray bytes that could join the key's first or last
                self.assertEqual(self.scrubber.scrub_bytes(before + key + after), before + KEY_GONE.encode() + after)

    def test_bytes_that_are_not_utf8_come_back_unchanged_around_a_value(self):
        data = b"\xff\xfe" + VALUE.encode() + b"\x80 " + VALUE.encode().hex().encode()
        self.assertEqual(self.scrubber.scrub_bytes(data), b"\xff\xfe" + GONE.encode() + b"\x80 " + GONE.encode())
        self.assertEqual(self.scrubber.scrub_bytes(b"\x00\xc3plain"), b"\x00\xc3plain")

    def test_a_locked_vault_passes_text_through_until_it_is_unlocked(self):
        del os.environ[PASSPHRASE_ENV]
        locked = Vault(self.paths, "env")
        scrubber = Scrubber(locked)
        key = base64.b64encode(self.vault.master_key()).decode()
        self.assertEqual(scrubber.scrub(f"{VALUE} {key}"), f"{VALUE} {key}")
        locked.unlock(PASSPHRASE)
        self.assertEqual(scrubber.scrub(f"{VALUE} {key}"), f"{GONE} {KEY_GONE}")


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.paths = isolated(self)
        self.vault = env_vault(self.paths)
        self.vault.set("DEMO_TOKEN", VALUE, use="http", origin="https://api.example.com")
        self.vault.set("OTHER_TOKEN", OTHER, use="env")
        scrub = Scrubber(self.vault).scrub
        output = scrub(f"curl -H 'Authorization: Bearer {VALUE}' https://api.example.com\n200 OK\n")
        self.ledger = Ledger(self.paths.ledger)
        self.ledger.initialize()
        project = self.ledger.add_project(Role.OWNER, "demo", "folder", self.paths.root / "demo")
        self.ledger.request(Role.OWNER, "Check the demo API", project=project)
        self.ledger.note(Role.HOME, output, project=project)
        self.ledger.secret_used("DEMO_TOKEN", "run")
        self.job = self.ledger.start_job('["curl", "https://api.example.com"]', str(self.paths.root), "sh")
        self.ledger.end_job(self.job, 0, output)
        for name, text in (("logs/task-1.log", output), ("undo/task-1/journal.jsonl", '{"op": "write"}\n'),
                           ("runs/1.token", "demo-run-token\n"), ("lead/mcp.json", '{"mcpServers": {}}\n')):
            (self.paths.root / name).parent.mkdir(parents=True, exist_ok=True)
            (self.paths.root / name).write_text(text, encoding="utf-8")

    def run_audit(self):
        parser = argparse.ArgumentParser(prog="artemis")
        vault_module.add_commands(parser.add_subparsers(dest="command", required=True))
        args = parser.parse_args(["secret", "audit"])
        out = io.StringIO()
        with redirect_stdout(out):
            code = args.func(args, self.paths, "env")
        return code, out.getvalue()

    def test_a_scrubbed_home_holds_no_value(self):
        result = audit(self.vault, self.paths)
        self.assertEqual((result.values, result.hits), (3, []))
        self.assertGreaterEqual(result.files, 5)
        self.assertEqual(self.run_audit(),
                         (0, f"0 of 3 values found in {result.files} files (2 secrets and the vault key)\n"))

    def test_a_planted_value_is_found_in_any_form_and_named_not_shown(self):
        planted = base64.b64encode(f"user:{OTHER}".encode()).decode()
        (self.paths.root / "logs" / "task-2.log").write_text(f"Authorization: Basic {planted}\n", encoding="utf-8")
        self.ledger.note(Role.HOME, f"saw {VALUE.encode().hex().upper()}")
        result = audit(self.vault, self.paths)
        self.assertIn(("logs/task-2.log", "OTHER_TOKEN", "base64 inside"), result.hits)
        self.assertIn(("ledger.db events.detail", "DEMO_TOKEN", "hex"), result.hits)
        code, said = self.run_audit()
        self.assertEqual(code, 1)
        self.assertIn("  logs/task-2.log  OTHER_TOKEN\n", said)
        self.assertIn("  ledger.db events.detail  DEMO_TOKEN\n", said)
        self.assertTrue(said.endswith(f"2 of 3 values found in {result.files} files (2 secrets and the vault key)\n"))
        for form in [*encodings(VALUE).values(), OTHER, planted]:
            self.assertNotIn(form, said)

    def test_the_vault_key_is_searched_for_raw_and_in_base64(self):
        key = self.vault.master_key()
        (self.paths.root / "logs" / "task-3.log").write_text(f"key={base64.b64encode(key).decode()}\n",
                                                             encoding="utf-8")
        (self.paths.root / "runs" / "dump.bin").write_bytes(b"\0" * 9 + key + b"\0")
        hits = audit(self.vault, self.paths).hits
        self.assertIn(("logs/task-3.log", MASTER, "base64"), hits)
        self.assertIn(("runs/dump.bin", MASTER, "raw"), hits)
        code, said = self.run_audit()
        self.assertEqual(code, 1)
        self.assertIn(f"  runs/dump.bin  {MASTER}\n", said)
        self.assertNotIn(base64.b64encode(key).decode(), said)

    def test_the_ledger_files_are_searched_as_bytes_too(self):
        with closing(sqlite3.connect(self.paths.ledger)) as db, db:  # a blob, which the column pass skips
            db.execute("UPDATE jobs SET output = CAST(? AS BLOB) WHERE id = ?", (f"leaked {OTHER}", self.job))
        hits = audit(self.vault, self.paths).hits
        self.assertEqual({(where.split("-")[0], name) for where, name, _ in hits}, {("ledger.db", "OTHER_TOKEN")})

    def test_large_files_are_read_in_pieces_without_missing_a_value_on_the_seam(self):
        from artemis import scrub
        big = self.paths.root / "undo" / "task-9" / "copy.bin"
        big.parent.mkdir(parents=True)
        seam = scrub.CHUNK - len(OTHER) // 2
        big.write_bytes(b"\0" * seam + OTHER.encode() + b"\0" * 100)
        self.assertIn(("undo/task-9/copy.bin", "OTHER_TOKEN", "raw"), audit(self.vault, self.paths).hits)


if __name__ == "__main__":
    unittest.main()
