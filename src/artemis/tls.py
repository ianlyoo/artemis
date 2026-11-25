"""A self-signed certificate so a phone on the same network can open the App over HTTPS, and a terminal QR code
of the App's address. You check the certificate by its SHA-256 fingerprint, printed when `serve --lan` starts."""

from __future__ import annotations

import datetime
import ipaddress
import os
from pathlib import Path
import re
import socket
from typing import TYPE_CHECKING

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
import segno

if TYPE_CHECKING:
    from .home import Paths


DAYS = 825        # the longest validity Apple devices accept for a TLS server certificate
RENEW_DAYS = 30   # make a new one when less than this is left
# Addresses a UDP socket "connects" to so the OS names the interface it would use: the default route, then each
# private range. Nothing is sent.
PROBES = ("192.0.2.1", "10.254.254.254", "172.31.254.254", "192.168.254.254")
HOST = re.compile(r"[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*")
DARK_ON_LIGHT, RESET = "\x1b[38;5;16;48;5;231m", "\x1b[0m"  # fixed palette colours, not the terminal theme's
BLOCKS = {(False, False): " ", (True, False): "▀", (False, True): "▄", (True, True): "█"}


def lan_names() -> list[str]:
    """localhost, 127.0.0.1, this machine's hostname (and its .local name) and its current LAN IPv4 addresses: the
    ones its routes leave from, and the ones its name resolves to, which finds a second network card the routes
    pass by."""
    names = {"localhost", "127.0.0.1"}
    host = socket.gethostname().lower().rstrip(".")
    if HOST.fullmatch(host):
        names |= {host} if "." in host else {host, f"{host}.local"}
    addresses = set()
    for probe in PROBES:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
            try:
                udp.connect((probe, 9))
                addresses.add(udp.getsockname()[0])
            except OSError:  # no route to that range
                continue
    try:
        addresses |= {info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)}
    except OSError:  # a name nothing resolves
        pass
    for address in map(ipaddress.ip_address, addresses):
        if not (address.is_loopback or address.is_link_local or address.is_unspecified):
            names.add(str(address))
    return sorted(names)


def ensure_cert(paths: Paths, names: list[str]) -> tuple[Path, Path, str]:
    """The App's certificate and key under ARTEMIS_HOME/tls/, made once and again when the names it covers change
    or it nears its end. It covers lan_names() plus `names` (say, a name you gave this machine).
    Returns (certificate file, key file, SHA-256 fingerprint as colon-separated hex)."""
    wanted = sorted({_canonical(name) for name in (*lan_names(), *names)})
    cert_file, key_file = paths.tls / "cert.pem", paths.tls / "key.pem"
    cert = _usable(cert_file, key_file, wanted) or _mint(cert_file, key_file, wanted)
    return cert_file, key_file, fingerprint(cert)


def fingerprint(cert: x509.Certificate) -> str:
    return cert.fingerprint(hashes.SHA256()).hex(":").upper()


def qr_text(url: str) -> str:
    """`url` as a QR code for a terminal: two module rows per line, drawn dark on light in explicit colours so it
    scans on a dark or a light terminal theme alike."""
    rows = [[bool(module) for module in row] for row in segno.make_qr(url).matrix_iter(border=2)]
    if len(rows) % 2:
        rows.append([False] * len(rows[0]))
    return "\n".join(DARK_ON_LIGHT + "".join(BLOCKS[pair] for pair in zip(top, bottom)) + RESET
                     for top, bottom in zip(rows[::2], rows[1::2]))


def address(name: str) -> str | None:
    """The name a certificate and a link can carry, lower-cased: an IPv4 address or a DNS host name; else None."""
    try:
        found = ipaddress.ip_address(name)
        return str(found) if found.version == 4 else None
    except ValueError:
        name = name.lower().rstrip(".")
        return name if HOST.fullmatch(name) and len(name) <= 253 else None


def _canonical(name: str) -> str:
    try:
        return str(ipaddress.ip_address(name))
    except ValueError:
        return name.lower()


def _general(name: str) -> x509.GeneralName:
    try:
        return x509.IPAddress(ipaddress.ip_address(name))
    except ValueError:
        return x509.DNSName(name)


def _usable(cert_file: Path, key_file: Path, wanted: list[str]) -> x509.Certificate | None:
    """The certificate on disk if it covers exactly `wanted`, is not near its end, and matches the key file."""
    try:
        cert = x509.load_pem_x509_certificate(cert_file.read_bytes())
        key = serialization.load_pem_private_key(key_file.read_bytes(), password=None)
        covered = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    except (OSError, ValueError, x509.ExtensionNotFound):
        return None
    names = sorted([*covered.get_values_for_type(x509.DNSName),
                    *map(str, covered.get_values_for_type(x509.IPAddress))])
    left = cert.not_valid_after_utc - datetime.datetime.now(datetime.timezone.utc)
    if names != wanted or left < datetime.timedelta(days=RENEW_DAYS) or key.public_key() != cert.public_key():
        return None
    return cert


def _mint(cert_file: Path, key_file: Path, names: list[str]) -> x509.Certificate:
    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Artemis home")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder()
            .subject_name(subject).issuer_name(subject).public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(minutes=5)).not_valid_after(now + datetime.timedelta(days=DAYS))
            .add_extension(x509.SubjectAlternativeName([_general(name) for name in names]), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .sign(key, hashes.SHA256()))
    cert_file.parent.mkdir(parents=True, exist_ok=True)
    _write(key_file, key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                       serialization.NoEncryption()))
    _write(cert_file, cert.public_bytes(serialization.Encoding.PEM))
    return cert


def _write(path: Path, data: bytes) -> None:
    """Replace `path` whole, readable by you alone (on Windows the folder's ACL decides)."""
    draft = path.with_name(path.name + ".new")
    draft.unlink(missing_ok=True)
    with open(os.open(draft, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600), "wb") as file:
        file.write(data)
    os.replace(draft, path)
