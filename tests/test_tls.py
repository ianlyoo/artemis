import hashlib
import os
from pathlib import Path
import re
import socket
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest import mock

from cryptography import x509
from cryptography.hazmat.primitives import serialization
import segno

from artemis import tls

from test_vault import HomePaths


NAMES = ["127.0.0.1", "192.168.1.20", "demo-host", "demo-host.local", "localhost"]


class FakeUdp:
    """Stand-in for a UDP socket: routes listed probes to a local address, refuses the rest."""
    routes: dict[str, str] = {}

    def __init__(self, *args):
        self.address = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def connect(self, target):
        if target[0] not in self.routes:
            raise OSError("Network is unreachable")
        self.address = self.routes[target[0]]

    def getsockname(self):
        return (self.address, 50000)


class LanNameTests(unittest.TestCase):
    def names(self, host, routes, resolved=()):
        FakeUdp.routes = routes
        found = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 0)) for address in resolved]
        with mock.patch.object(socket, "gethostname", return_value=host), \
                mock.patch.object(socket, "socket", FakeUdp), \
                mock.patch.object(socket, "getaddrinfo", return_value=found):
            return tls.lan_names()

    def test_hostname_and_routed_addresses(self):
        self.assertEqual(self.names("Demo-Host", {"192.0.2.1": "192.168.1.20", "10.254.254.254": "10.8.0.5"}),
                         ["10.8.0.5", "127.0.0.1", "192.168.1.20", "demo-host", "demo-host.local", "localhost"])

    def test_a_second_network_card_the_routes_pass_by_is_found_by_name(self):
        self.assertEqual(self.names("demo-host.local", {"192.0.2.1": "203.0.113.7"}, ["203.0.113.7", "127.0.0.1",
                                                                                       "192.168.0.20"]),
                         ["127.0.0.1", "192.168.0.20", "203.0.113.7", "demo-host.local", "localhost"])

    def test_the_phone_link_uses_the_home_network_address(self):
        from artemis.web import AppServer
        server = SimpleNamespace(lan=True, name=None, hosts=frozenset({"localhost", "127.0.0.1", "demo-host.local",
                                                                       "203.0.113.7", "192.168.0.20"}))
        self.assertEqual(AppServer.lan_host(server), "192.168.0.20")

    def test_on_a_server_the_phone_link_uses_the_name_given_with_lan(self):
        from artemis.web import AppServer
        server = SimpleNamespace(lan=True, name="artemis.tailnet.ts.net",
                                 hosts=frozenset({"localhost", "127.0.0.1", "10.1.2.3", "artemis.tailnet.ts.net"}))
        self.assertEqual(AppServer.lan_host(server), "artemis.tailnet.ts.net")

    def test_the_name_a_phone_opens_is_a_host_name_or_an_ipv4_address(self):
        self.assertEqual(tls.address("Artemis.Tailnet.ts.net."), "artemis.tailnet.ts.net")
        self.assertEqual(tls.address("198.51.100.23"), "198.51.100.23")
        for wrong in ("", "::1", "my server", "https://phone.example.com", "phone.example.com:7411"):
            self.assertIsNone(tls.address(wrong), wrong)

    def test_no_network_leaves_the_loopback_names(self):
        self.assertEqual(self.names("demo-host.local", {}), ["127.0.0.1", "demo-host.local", "localhost"])

    def test_this_machine(self):
        names = tls.lan_names()
        self.assertTrue({"localhost", "127.0.0.1"} <= set(names))
        host = socket.gethostname().lower().rstrip(".")
        if tls.HOST.fullmatch(host):
            self.assertIn(host, names)

    def test_link_local_and_unusable_hostnames_are_left_out(self):
        self.assertEqual(self.names("Demo's Laptop", {"192.0.2.1": "169.254.3.4"}), ["127.0.0.1", "localhost"])


class CertificateTests(unittest.TestCase):
    def setUp(self):
        self.paths = HomePaths(Path(self.enterContext(TemporaryDirectory())) / "home")
        self.lan = self.enterContext(mock.patch.object(tls, "lan_names", return_value=NAMES))

    def load(self, cert_file):
        return x509.load_pem_x509_certificate(cert_file.read_bytes())

    def test_a_certificate_for_the_lan_names_with_its_fingerprint(self):
        cert_file, key_file, fingerprint = tls.ensure_cert(self.paths, ["artemis.example.com"])
        self.assertEqual((cert_file.parent, key_file.parent), (self.paths.tls, self.paths.tls))
        cert = self.load(cert_file)
        covered = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        self.assertEqual(sorted(covered.get_values_for_type(x509.DNSName)),
                         ["artemis.example.com", "demo-host", "demo-host.local", "localhost"])
        self.assertEqual(sorted(map(str, covered.get_values_for_type(x509.IPAddress))), ["127.0.0.1", "192.168.1.20"])
        self.assertEqual((cert.not_valid_after_utc - cert.not_valid_before_utc).days, 825)
        self.assertRegex(fingerprint, r"^([0-9A-F]{2}:){31}[0-9A-F]{2}$")
        der = cert.public_bytes(serialization.Encoding.DER)
        self.assertEqual(fingerprint.replace(":", "").lower(), hashlib.sha256(der).hexdigest())
        key = serialization.load_pem_private_key(key_file.read_bytes(), password=None)
        self.assertEqual(key.public_key(), cert.public_key())
        if os.name == "posix":
            for path in (cert_file, key_file):
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_made_once_and_again_when_the_names_change(self):
        first = tls.ensure_cert(self.paths, [])
        made = first[0].stat().st_mtime_ns
        self.assertEqual(tls.ensure_cert(self.paths, ["LOCALHOST"]), first)
        self.assertEqual(first[0].stat().st_mtime_ns, made)
        self.lan.return_value = [*NAMES, "192.168.1.21"]
        moved = tls.ensure_cert(self.paths, [])
        self.assertNotEqual(moved[2], first[2])
        covered = self.load(moved[0]).extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        self.assertIn("192.168.1.21", map(str, covered.get_values_for_type(x509.IPAddress)))

    def test_the_name_given_with_lan_goes_into_the_homes_own_certificate(self):
        from artemis.web import _tls
        made = _tls(SimpleNamespace(paths=self.paths), "Artemis.Tailnet.ts.net", None)
        self.assertIn("artemis.tailnet.ts.net", made.names)
        covered = self.load(self.paths.tls / "cert.pem").extensions.get_extension_for_class(
            x509.SubjectAlternativeName).value
        self.assertIn("artemis.tailnet.ts.net", covered.get_values_for_type(x509.DNSName))

    def test_a_certificate_given_must_cover_the_name_given_with_lan(self):
        from artemis.roles import WorkflowError
        from artemis.web import _tls
        given = tls.ensure_cert(self.paths, ["*.example.com"])[:2]
        home = SimpleNamespace(paths=self.paths)
        self.assertIn("phone.example.com", _tls(home, "phone.example.com", given).names)   # by its wildcard
        with self.assertRaisesRegex(WorkflowError, "does not cover 198.51.100.23"):
            _tls(home, "198.51.100.23", given)

    def test_a_certificate_near_its_end_or_a_mismatched_key_is_replaced(self):
        with mock.patch.object(tls, "DAYS", 10):
            old = tls.ensure_cert(self.paths, [])
        renewed = tls.ensure_cert(self.paths, [])
        self.assertNotEqual(renewed[2], old[2])
        renewed[1].write_bytes(b"not a key")
        self.assertNotEqual(tls.ensure_cert(self.paths, [])[2], renewed[2])


class QrTests(unittest.TestCase):
    URL = "https://192.168.1.20:7411/#pair=demo-pairing-token"

    def test_the_text_holds_the_exact_code_dark_on_light(self):
        text = tls.qr_text(self.URL)
        lines = text.split("\n")
        self.assertTrue(all(line.startswith(tls.DARK_ON_LIGHT) and line.endswith(tls.RESET) for line in lines))
        cells = [line[len(tls.DARK_ON_LIGHT):-len(tls.RESET)] for line in lines]
        self.assertEqual(len({len(row) for row in cells}), 1)
        halves = {char: pair for pair, char in tls.BLOCKS.items()}
        drawn = [[] for _ in range(2 * len(cells))]
        for number, row in enumerate(cells):
            for char in row:
                top, bottom = halves[char]
                drawn[2 * number].append(top)
                drawn[2 * number + 1].append(bottom)
        expected = [[bool(m) for m in row] for row in segno.make_qr(self.URL).matrix_iter(border=2)]
        self.assertEqual(drawn[:len(expected)], expected)
        self.assertFalse(any(any(row) for row in drawn[len(expected):]))
        self.assertIsNone(re.search(r"\x1b\[(3[0-7]|4[0-7]|9[0-7]|10[0-7])m", text))  # no theme palette colours


if __name__ == "__main__":
    unittest.main()
