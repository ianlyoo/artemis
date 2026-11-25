import argparse
import base64
from contextlib import closing, redirect_stderr, redirect_stdout
from dataclasses import dataclass
import io
import os
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
import uuid

from keyring.errors import NoKeyringError, PasswordDeleteError

from artemis import vault as vault_module
from artemis.ledger import Ledger
from artemis.scrub import forms
from artemis.vault import PASSPHRASE_ENV, Vault, VaultError, VaultLocked, origin


VALUE = 'demo token ~>?é "quoted" \\ & /'  # a fake value whose encodings all differ from it
OTHER = "fake-key-0123456789"
PASSPHRASE = "demo passphrase for tests"   # fake
ORIGIN = "https://api.example.com"
CHEAP = {"n": 2 ** 10, "r": 8, "p": 1}      # scrypt parameters that keep the tests fast


@dataclass
class HomePaths:
    """Stand-in for home.Paths (B1's): only the fields these modules read."""
    root: Path

    def __getattr__(self, name):
        files = {"ledger": "ledger.db", "vault": "vault.db", "vault_key": "vault.key"}
        if name in files:
            return self.root / files[name]
        if name in ("tls", "logs", "undo", "runs", "lead", "work"):
            return self.root / name
        raise AttributeError(name)


class FakeKeychain:
    """Stand-in for the OS keychain (keyring's module functions). broken: raises like keyring's fail backend;
    forgetful: accepts writes and keeps nothing, like keyring's null backend."""

    def __init__(self, broken=False, forgetful=False):
        self.items, self.broken, self.forgetful = {}, broken, forgetful

    def get_password(self, service, account):
        if self.broken:
            raise NoKeyringError("No recommended backend was available.")
        return self.items.get((service, account))

    def set_password(self, service, account, password):
        if self.broken:
            raise NoKeyringError("No recommended backend was available.")
        if not self.forgetful:
            self.items[(service, account)] = password

    def delete_password(self, service, account):
        if self.broken or (service, account) not in self.items:
            raise PasswordDeleteError("Password not found")
        del self.items[(service, account)]


def isolated(test: unittest.TestCase, keychain=None) -> HomePaths:
    """A temporary ARTEMIS_HOME with no passphrase in the environment, a fake keychain and cheap scrypt."""
    root = Path(test.enterContext(TemporaryDirectory()))
    test.enterContext(mock.patch.dict(os.environ))
    os.environ.pop(PASSPHRASE_ENV, None)
    test.keychain = keychain or FakeKeychain()
    test.enterContext(mock.patch.object(vault_module, "keyring", test.keychain))
    test.enterContext(mock.patch.object(vault_module, "SCRYPT", CHEAP))
    return HomePaths(root / "home")


def env_vault(paths: HomePaths) -> Vault:
    """A vault unlocked the CI way: unlock "env" with a fake ARTEMIS_VAULT_PASSPHRASE (call isolated() first)."""
    os.environ[PASSPHRASE_ENV] = PASSPHRASE
    return Vault(paths, "env")


def wrapped(paths: HomePaths):
    with closing(sqlite3.connect(paths.vault)) as db:
        return db.execute("SELECT salt, n, r, p FROM wrapped").fetchone()


class Tty(io.StringIO):
    def isatty(self):
        return True


class VaultTests(unittest.TestCase):
    def setUp(self):
        self.paths = isolated(self)
        self.vault = env_vault(self.paths)

    def test_values_are_sealed_and_a_website_key_never_goes_to_a_command(self):
        self.vault.set("WEB_TOKEN", VALUE, use="http", kind="send", origin=ORIGIN + "/", note="demo service")
        self.vault.set("CLI_TOKEN", OTHER, use="env")
        self.assertEqual((self.vault.backend, self.vault.notice), ("env", "vault unlocked from environment"))
        info = self.vault.info("WEB_TOKEN")
        self.assertEqual((info.use, info.kind, info.origin, info.header, info.note),
                         ("http", "send", ORIGIN, "Authorization: Bearer {}", "demo service"))
        self.assertEqual(self.vault.env(["CLI_TOKEN"]), {"CLI_TOKEN": OTHER})
        with self.assertRaisesRegex(VaultError, "sent only by Artemis, only to https://api.example.com"):
            self.vault.env(["CLI_TOKEN", "WEB_TOKEN"])
        self.assertEqual(Vault(self.paths, "env").values(), [("CLI_TOKEN", OTHER), ("WEB_TOKEN", VALUE)])
        stored = self.paths.vault.read_bytes()
        for form in [*forms(VALUE), *forms(OTHER), *forms(self.vault.master_key()), PASSPHRASE]:
            self.assertNotIn(form.encode("utf-8", "surrogateescape"), stored)
        self.assertFalse(self.paths.vault_key.exists())
        if os.name == "posix":
            self.assertEqual(self.paths.vault.stat().st_mode & 0o777, 0o600)

    def test_a_website_key_is_handed_out_only_for_its_origin(self):
        self.vault.set("WEB_TOKEN", VALUE, use="http", origin=ORIGIN)
        self.vault.set("HEADER_TOKEN", OTHER, use="http", origin="http://127.0.0.1:8080", header="X-Api-Key:{}")
        self.vault.set("CLI_TOKEN", OTHER, use="env")
        self.assertEqual(self.vault.http("WEB_TOKEN", ORIGIN), ("Authorization", f"Bearer {VALUE}"))
        self.assertEqual(self.vault.http("HEADER_TOKEN", "http://127.0.0.1:8080"), ("X-Api-Key", OTHER))
        for name, place in (("WEB_TOKEN", "https://api.example.com.evil.example.net"),
                            ("WEB_TOKEN", "https://api.example.com:8443"), ("CLI_TOKEN", ORIGIN)):
            with self.subTest(name=name, place=place), self.assertRaisesRegex(VaultError, "is not sent to") as caught:
                self.vault.http(name, place)
            self.assertNotIn(VALUE, str(caught.exception))

    def test_origins_are_normalised_and_https_only(self):
        for url, expected in (("https://API.Example.com:443/v1/items?x=1#top", ORIGIN),
                              ("https://api.example.com:8443/", "https://api.example.com:8443"),
                              ("http://127.0.0.1:8080/x", "http://127.0.0.1:8080"), ("http://localhost", "http://localhost"),
                              ("http://[::1]:9/", "http://[::1]:9")):
            with self.subTest(url):
                self.assertEqual(origin(url), expected)
        for url, words in (("http://api.example.com/", "only over HTTPS"), ("ftp://api.example.com/", "web address"),
                           ("https://user:pw@api.example.com/", "web address"), ("api.example.com", "web address"),
                           ("https://api.example.com:port/", "not a number"), ("http://192.168.1.20/", "HTTPS")):
            with self.subTest(url), self.assertRaisesRegex(VaultError, words):
                origin(url)
        with self.assertRaisesRegex(VaultError, "only the scheme and host"):
            self.vault.set("WEB_TOKEN", VALUE, use="http", origin=ORIGIN + "/v1")

    def test_a_row_cannot_be_relabelled(self):
        for change in ("UPDATE secrets SET kind = 'none'", "UPDATE secrets SET name = 'OTHER_TOKEN'",
                       "UPDATE secrets SET origin = 'https://elsewhere.example.net'",
                       "UPDATE secrets SET use = 'env', origin = NULL, header = NULL"):
            self.vault.set("DEMO_TOKEN", VALUE, use="http", kind="spend", origin=ORIGIN)
            with self.subTest(change), closing(sqlite3.connect(self.paths.vault)) as db, db:
                db.execute(change)
            with self.assertRaisesRegex(VaultError, "does not open"):
                self.vault.values()
            with closing(sqlite3.connect(self.paths.vault)) as db, db:
                db.execute("DELETE FROM secrets")

    def test_each_write_takes_a_fresh_nonce(self):
        sealed = set()
        for _ in range(2):
            self.vault.set("DEMO_TOKEN", VALUE, use="env")
            with closing(sqlite3.connect(self.paths.vault)) as db:
                sealed.add(db.execute("SELECT nonce, ciphertext FROM secrets").fetchone())
        self.assertEqual(len(sealed), 2)
        self.assertEqual(len({nonce for nonce, _ in sealed}), 2)

    def test_refusals_are_plain_and_never_echo_the_value(self):
        for name, value, fields, words in (
                ("demo_token", VALUE, {"use": "env"}, "capital letters"),
                ("DEMO_TOKEN", VALUE, {"use": "file"}, "website \\(http\\) or by commands"),
                ("DEMO_TOKEN", VALUE, {"use": "env", "kind": "secret"}, "kind is one of"),
                ("DEMO_TOKEN", "short7!", {"use": "env"}, "at least 8"),
                ("DEMO_TOKEN", VALUE, {"use": "env", "note": f"paste: {VALUE}"}, "note contains the value"),
                ("DEMO_TOKEN", VALUE, {"use": "http"}, "web address"),
                ("DEMO_TOKEN", VALUE, {"use": "env", "origin": ORIGIN}, "Only a key for a website"),
                ("DEMO_TOKEN", VALUE + "\nX", {"use": "http", "origin": ORIGIN}, "one line"),
                ("DEMO_TOKEN", VALUE, {"use": "http", "origin": ORIGIN, "header": "Bearer {}"}, "A header is"),
                ("DEMO_TOKEN", VALUE, {"use": "http", "origin": ORIGIN, "header": "X-Key: {} {}"}, "A header is")):
            with self.subTest(words), self.assertRaisesRegex(VaultError, words) as caught:
                self.vault.set(name, value, **fields)
            self.assertNotIn(value, str(caught.exception))
        self.assertEqual(self.vault.names(), [])

    def test_version_counts_changes_made_by_another_instance(self):
        before = self.vault.version
        other = Vault(self.paths, "env")
        other.set("DEMO_TOKEN", VALUE, use="env")
        other.remove("DEMO_TOKEN")
        self.assertEqual(self.vault.version, before + 2)
        with self.assertRaisesRegex(VaultError, "no secret named DEMO_TOKEN"):
            other.remove("DEMO_TOKEN")
        self.assertEqual(self.vault.version, before + 2)

    def test_env_names_every_missing_secret(self):
        self.vault.set("DEMO_TOKEN", VALUE, use="env")
        with self.assertRaisesRegex(VaultError, "no secret named MISSING_ONE, MISSING_TWO"):
            self.vault.env(["DEMO_TOKEN", "MISSING_ONE", "MISSING_TWO"])
        self.assertEqual(self.vault.env([]), {})


class UnlockTests(unittest.TestCase):
    def test_env_unlock_sets_the_passphrase_once_and_a_restart_needs_the_same_one(self):
        paths = isolated(self)
        env_vault(paths).set("DEMO_TOKEN", VALUE, use="env")
        salt, *params = wrapped(paths)
        self.assertEqual((len(salt), params), (16, [CHEAP["n"], CHEAP["r"], CHEAP["p"]]))
        self.assertEqual(env_vault(paths).values(), [("DEMO_TOKEN", VALUE)])  # a restart
        self.assertEqual(self.keychain.items, {})                              # env never touches the keychain
        os.environ[PASSPHRASE_ENV] = "another demo passphrase"
        with self.assertRaisesRegex(VaultError, "does not unlock"):
            Vault(paths, "env")
        del os.environ[PASSPHRASE_ENV]
        locked = Vault(paths, "env")
        self.assertEqual((locked.unlocked, locked.state, locked.notice), (False, "locked", ""))
        self.assertEqual([info.name for info in locked.names()], ["DEMO_TOKEN"])  # names need no key
        for attempt in (locked.values, lambda: locked.env(["DEMO_TOKEN"]), locked.master_key,
                        lambda: locked.set("OTHER_TOKEN", OTHER, use="env")):
            with self.assertRaisesRegex(VaultLocked, PASSPHRASE_ENV):
                attempt()
        locked.unlock(PASSPHRASE)
        self.assertEqual(locked.values(), [("DEMO_TOKEN", VALUE)])

    def test_a_first_passphrase_must_be_long_enough(self):
        paths = isolated(self)
        vault = Vault(paths, "passphrase")
        self.assertEqual(vault.state, "new")
        with self.assertRaisesRegex(VaultError, "at least 12"):
            vault.unlock("short pass")
        self.assertIsNone(wrapped(paths))

    def test_the_os_keychain_holds_the_key_when_there_is_one(self):
        paths = isolated(self)
        vault = Vault(paths)
        vault.set("DEMO_TOKEN", VALUE, use="env")
        self.assertEqual((vault.backend, vault.notice, vault.state), ("keychain", "", "open"))
        self.assertIsNone(wrapped(paths))
        [(service, account)] = self.keychain.items
        self.assertEqual(service, "artemis")
        self.assertRegex(account, r"^home-[0-9a-f]{16}$")
        self.assertEqual(Vault(paths).env(["DEMO_TOKEN"]), {"DEMO_TOKEN": VALUE})
        self.assertFalse(paths.vault_key.exists())

    def test_without_a_keychain_the_key_waits_under_a_passphrase_and_moves_in_when_one_works(self):
        for keychain in (FakeKeychain(broken=True), FakeKeychain(forgetful=True)):
            with self.subTest("broken" if keychain.broken else "forgetful"):
                paths = isolated(self, keychain)
                vault = Vault(paths)
                self.assertEqual((vault.backend, vault.state), ("passphrase", "new"))
                self.assertIn("No working OS keychain", vault.notice)
                with self.assertRaises(VaultLocked):
                    vault.set("DEMO_TOKEN", VALUE, use="env")
                vault.unlock(PASSPHRASE)
                vault.set("DEMO_TOKEN", VALUE, use="env")
                restarted = Vault(paths)
                self.assertEqual(restarted.state, "locked")
                with self.assertRaisesRegex(VaultError, "does not unlock"):
                    restarted.unlock("a wrong demo passphrase")
                restarted.unlock(PASSPHRASE)
                self.assertEqual(restarted.values(), [("DEMO_TOKEN", VALUE)])
                self.assertFalse(paths.vault_key.exists())
                keychain.broken = keychain.forgetful = False  # a keychain appears: the next unlock moves the key in
                moving = Vault(paths)
                self.assertEqual(moving.state, "locked")
                moving.unlock(PASSPHRASE)
                self.assertEqual((moving.backend, wrapped(paths)), ("keychain", None))
                self.assertEqual(Vault(paths).values(), [("DEMO_TOKEN", VALUE)])

    def test_passphrase_unlock_takes_the_key_off_the_keychain(self):
        paths = isolated(self)
        Vault(paths).set("DEMO_TOKEN", VALUE, use="env")
        self.assertEqual(len(self.keychain.items), 1)
        vault = Vault(paths, "passphrase")
        self.assertEqual((vault.state, vault.notice), ("new", ""))
        vault.unlock(PASSPHRASE)
        self.assertEqual((vault.values(), self.keychain.items), ([("DEMO_TOKEN", VALUE)], {}))
        restarted = Vault(paths, "passphrase")
        self.assertEqual(restarted.state, "locked")
        restarted.unlock(PASSPHRASE)
        self.assertEqual(restarted.values(), [("DEMO_TOKEN", VALUE)])

    def test_a_stale_keychain_entry_is_passed_over_and_replaced(self):
        paths = isolated(self, FakeKeychain(broken=True))
        first = Vault(paths)
        first.unlock(PASSPHRASE)
        first.set("DEMO_TOKEN", VALUE, use="env")
        self.keychain.broken = False
        account = vault_module._account(paths.root)
        self.keychain.items[("artemis", account)] = base64.b64encode(b"stale demo key: 32 fake bytes!!!").decode()
        vault = Vault(paths)
        self.assertEqual(vault.state, "locked")
        vault.unlock(PASSPHRASE)
        self.assertEqual((vault.backend, vault.values()), ("keychain", [("DEMO_TOKEN", VALUE)]))
        self.assertEqual(Vault(paths).values(), [("DEMO_TOKEN", VALUE)])

    def test_an_empty_vault_switching_modes_keeps_one_key(self):
        paths = isolated(self)
        Vault(paths)                                     # an empty vault: its key goes to the keychain
        vault = Vault(paths, "passphrase")
        vault.unlock(PASSPHRASE)                         # adopts that key, then takes it off the keychain
        self.assertEqual(self.keychain.items, {})
        account = vault_module._account(paths.root)
        self.keychain.items[("artemis", account)] = base64.b64encode(b"stale demo key: 32 fake bytes!!!").decode()
        back = Vault(paths)                              # keyring mode never opens it with an unrelated entry
        self.assertEqual(back.state, "locked")
        back.unlock(PASSPHRASE)
        self.assertEqual(back.master_key(), vault.master_key())
        self.assertEqual((back.backend, wrapped(paths)), ("keychain", None))

    def test_env_unlock_asks_the_keychain_only_when_the_passphrase_is_set(self):
        paths = isolated(self)
        with mock.patch.object(self.keychain, "get_password", wraps=self.keychain.get_password) as asked:
            env_vault(paths)
            env_vault(paths)
        self.assertEqual(asked.call_count, 1)

    def test_a_lost_key_is_reported_and_never_replaced(self):
        paths = isolated(self)
        Vault(paths).set("DEMO_TOKEN", VALUE, use="env")
        self.keychain.items.clear()
        vault = Vault(paths)
        self.assertFalse(vault.unlocked)
        with self.assertRaisesRegex(VaultError, "neither in the OS keychain nor kept under a passphrase"):
            vault.unlock(PASSPHRASE)
        self.assertIsNone(wrapped(paths))
        self.assertEqual(self.keychain.items, {})
        self.assertEqual([info.name for info in vault.names()], ["DEMO_TOKEN"])

    def test_an_unknown_mode_is_refused(self):
        with self.assertRaisesRegex(VaultError, "keyring, passphrase, env"):
            Vault(isolated(self), "file")

    @unittest.skipUnless(os.environ.get("ARTEMIS_TEST_KEYCHAIN") == "1",
                         "set ARTEMIS_TEST_KEYCHAIN=1 to use this machine's real keychain (a throwaway entry)")
    def test_the_real_keychain_with_a_throwaway_service(self):
        import keyring
        root = Path(self.enterContext(TemporaryDirectory()))
        paths = HomePaths(root / "home")
        self.enterContext(mock.patch.dict(os.environ))
        os.environ.pop(PASSPHRASE_ENV, None)
        self.enterContext(mock.patch.object(vault_module, "SCRYPT", CHEAP))
        service = f"artemis-test-{uuid.uuid4().hex[:8]}"
        self.enterContext(mock.patch.object(vault_module, "SERVICE", service))
        account = vault_module._account(paths.root)
        self.addCleanup(lambda: keyring.get_password(service, account) and keyring.delete_password(service, account))
        vault = Vault(paths)
        vault.set("DEMO_TOKEN", VALUE, use="env")
        self.assertEqual(vault.backend, "keychain")
        self.assertEqual(Vault(paths).env(["DEMO_TOKEN"]), {"DEMO_TOKEN": VALUE})
        moved = Vault(paths, "passphrase")       # passphrase unlock takes the entry off the keychain
        moved.unlock(PASSPHRASE)
        self.assertIsNone(keyring.get_password(service, account))
        self.assertEqual(moved.values(), [("DEMO_TOKEN", VALUE)])


class CommandTests(unittest.TestCase):
    def setUp(self):
        self.paths = isolated(self)
        os.environ[PASSPHRASE_ENV] = PASSPHRASE

    def run_cli(self, *argv, stdin="", unlock="env"):
        parser = argparse.ArgumentParser(prog="artemis")
        vault_module.add_commands(parser.add_subparsers(dest="command", required=True))
        args = parser.parse_args(argv)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err), \
                mock.patch.object(sys, "stdin", stdin if isinstance(stdin, io.StringIO) else io.StringIO(stdin)):
            code = args.func(args, self.paths, unlock)
        self.stderr = err.getvalue()
        return code, out.getvalue()

    def vault(self):
        return Vault(self.paths, "env")

    def test_set_reads_a_piped_line_and_list_never_shows_a_value(self):
        code, said = self.run_cli("secret", "set", "WEB_TOKEN", "--origin", "https://API.example.com/", "--kind",
                                  "send", "--note", "demo service", "--stdin", stdin=VALUE + "\r\n")
        self.assertEqual((code, said), (0, f"Saved WEB_TOKEN (send): only Artemis sends it, only to {ORIGIN}.\n"))
        self.assertEqual(self.stderr, "vault unlocked from environment\n")
        self.assertEqual(self.vault().http("WEB_TOKEN", ORIGIN), ("Authorization", f"Bearer {VALUE}"))
        ledger = Ledger(self.paths.ledger)
        ledger.initialize()
        ledger.secret_used("WEB_TOKEN", "http_request")
        code, said2 = self.run_cli("secret", "set", "CLI_TOKEN", "--env", "--stdin", stdin=OTHER + "\n")
        self.assertEqual(said2, "Saved CLI_TOKEN (none): commands get it by name, never in their arguments.\n")
        code, listing = self.run_cli("secret", "list")
        self.assertEqual(code, 0)
        lines = listing.splitlines()
        self.assertEqual(lines[0].split(), ["NAME", "KIND", "GOES", "TO", "LAST", "USED", "NOTE"])
        self.assertRegex(lines[1], r"^CLI_TOKEN\s+none\s+commands \(env\)\s+never$")
        self.assertRegex(lines[2], r"^WEB_TOKEN\s+send\s+https://api\.example\.com\s+"
                                   r"\d{4}-\d\d-\d\d \d\d:\d\d \(1x\)\s+demo service$")
        for text in (said, said2, listing, self.stderr):
            for value in (VALUE, OTHER, PASSPHRASE):
                self.assertNotIn(value, text)

    def test_a_new_secret_needs_to_say_where_it_goes(self):
        with self.assertRaisesRegex(VaultError, "--origin https://api.example.com for a website, or --env"):
            self.run_cli("secret", "set", "DEMO_TOKEN", "--stdin", stdin=VALUE)
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            self.run_cli("secret", "set", "DEMO_TOKEN", "--env", "--origin", ORIGIN, "--stdin", stdin=VALUE)

    def test_set_again_keeps_where_kind_header_and_note_unless_given(self):
        self.run_cli("secret", "set", "DEMO_TOKEN", "--origin", ORIGIN, "--header", "X-Api-Key: {}", "--kind",
                     "spend", "--note", "billing", "--stdin", stdin=VALUE)
        self.run_cli("secret", "set", "DEMO_TOKEN", "--stdin", stdin=OTHER)
        info = self.vault().info("DEMO_TOKEN")
        self.assertEqual((info.use, info.origin, info.header, info.kind, info.note),
                         ("http", ORIGIN, "X-Api-Key: {}", "spend", "billing"))
        self.assertEqual(self.vault().http("DEMO_TOKEN", ORIGIN), ("X-Api-Key", OTHER))
        self.run_cli("secret", "set", "DEMO_TOKEN", "--env", "--stdin", stdin=VALUE)
        info = self.vault().info("DEMO_TOKEN")
        self.assertEqual((info.use, info.origin, info.header, info.kind), ("env", None, None, "spend"))

    def test_set_on_a_terminal_asks_with_a_hidden_prompt_and_never_reads_a_pipe_without_stdin(self):
        with mock.patch("getpass.getpass", return_value=VALUE) as hidden:
            code, _ = self.run_cli("secret", "set", "DEMO_TOKEN", "--env", stdin=Tty())
        self.assertEqual(code, 0)
        hidden.assert_called_once_with("Value for DEMO_TOKEN (hidden): ")
        self.assertEqual(self.vault().env(["DEMO_TOKEN"]), {"DEMO_TOKEN": VALUE})
        with self.assertRaisesRegex(VaultError, "--stdin"):
            self.run_cli("secret", "set", "DEMO_TOKEN", "--env", stdin=OTHER)

    def test_without_a_keychain_the_terminal_chooses_then_asks_the_passphrase(self):
        del os.environ[PASSPHRASE_ENV]
        self.keychain.broken = True
        with mock.patch("getpass.getpass", side_effect=[PASSPHRASE, PASSPHRASE, VALUE]) as hidden:
            self.assertEqual(self.run_cli("secret", "set", "DEMO_TOKEN", "--env", stdin=Tty(), unlock="keyring")[0], 0)
        self.assertEqual([call.args[0] for call in hidden.call_args_list],
                         ["Choose a vault passphrase: ", "Type it again: ", "Value for DEMO_TOKEN (hidden): "])
        self.assertIn("No working OS keychain", self.stderr)
        with mock.patch("getpass.getpass", side_effect=[PASSPHRASE]):
            code, said = self.run_cli("secret", "audit", stdin=Tty(), unlock="keyring")
        self.assertEqual(code, 0)
        self.assertTrue(said.startswith("0 of 2 values found in"))
        with self.assertRaisesRegex(VaultLocked, "in the App on this computer or at the terminal"):
            self.run_cli("secret", "set", "DEMO_TOKEN", "--stdin", stdin=OTHER, unlock="keyring")

    def test_two_different_passphrases_set_nothing(self):
        del os.environ[PASSPHRASE_ENV]
        with mock.patch("getpass.getpass", side_effect=[PASSPHRASE, "a different demo phrase"]), \
                self.assertRaisesRegex(VaultError, "differ"):
            self.run_cli("secret", "set", "DEMO_TOKEN", "--env", stdin=Tty(), unlock="passphrase")
        self.assertIsNone(wrapped(self.paths))

    def test_env_mode_without_the_passphrase_says_how_to_unlock(self):
        del os.environ[PASSPHRASE_ENV]
        with self.assertRaisesRegex(VaultLocked, f"set {PASSPHRASE_ENV}"):
            self.run_cli("secret", "set", "DEMO_TOKEN", "--env", "--stdin", stdin=VALUE)

    def test_a_short_value_is_refused_in_words(self):
        with self.assertRaisesRegex(VaultError, "at least 8"):
            self.run_cli("secret", "set", "DEMO_TOKEN", "--env", "--stdin", stdin="short\n")

    def test_remove_wants_the_name_typed_or_yes(self):
        self.run_cli("secret", "set", "DEMO_TOKEN", "--env", "--stdin", stdin=VALUE)
        with self.assertRaisesRegex(VaultError, "--yes"):
            self.run_cli("secret", "remove", "DEMO_TOKEN")
        with mock.patch("builtins.input", return_value="WRONG"):
            self.assertEqual(self.run_cli("secret", "remove", "DEMO_TOKEN", stdin=Tty())[0], 1)
        with mock.patch("builtins.input", return_value="DEMO_TOKEN"):
            self.assertEqual(self.run_cli("secret", "remove", "DEMO_TOKEN", stdin=Tty())[0], 0)
        self.run_cli("secret", "set", "DEMO_TOKEN", "--env", "--stdin", stdin=VALUE)
        self.assertEqual(self.run_cli("secret", "remove", "DEMO_TOKEN", "--yes")[0], 0)
        self.assertEqual(self.vault().names(), [])

    def test_there_is_no_way_to_show_a_value(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            self.run_cli("secret", "show", "DEMO_TOKEN")


if __name__ == "__main__":
    unittest.main()
