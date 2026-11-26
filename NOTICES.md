# Notices

Artemis's own code is Apache-2.0. Python dependencies are installed at install time; browser bundles, fonts, and vendored libraries shipped in the App keep their own licences, recorded in `THIRD_PARTY_NOTICES` and alongside the vendored files.

## Dependencies

| Package | Licence | Used for |
|---|---|---|
| [cryptography](https://github.com/pyca/cryptography) | Apache-2.0 or BSD-3-Clause | the vault's AES-256-GCM and scrypt, the App's self-signed certificate |
| [keyring](https://github.com/jaraco/keyring) | MIT | keeping the vault's key in the OS keychain |
| [segno](https://github.com/heuer/segno) | BSD-3-Clause | the QR code for pairing a phone |

Their own dependencies (cffi, pycparser, jaraco packages, more-itertools, and on Linux SecretStorage and jeepney, on Windows pywin32-ctypes) carry MIT or BSD licences. None is AGPL.

## Acknowledgements

The projects below informed this project. Their upstream licences are listed for reference.

| Project | Licence | Link |
|---|---|---|
| Paseo | Apache-2.0 (third-party components inside it keep their own licences) | <https://github.com/getpaseo/paseo> |
| agent-browser | Apache-2.0 | <https://github.com/vercel-labs/agent-browser> |
| agent-desktop | Apache-2.0 | <https://github.com/vercel-labs/agent-desktop> |
| Impeccable | Apache-2.0 | <https://github.com/pbakaus/impeccable> |
| Unslop | CC BY 4.0 | <https://github.com/heydamir/unslop> |
| Astryx | MIT | <https://github.com/meta/astryx> |
| Frontend Slides | MIT | <https://github.com/zarazhangrui/frontend-slides> |
| Gitleaks | MIT | <https://github.com/gitleaks/gitleaks> |

Unslop is by Damir Sokolovsky and is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Redistributed in the App

The built App under `src/artemis/web/app/` is built from `app/src/` by `tools/build_web` (see `app/package.json` and `app/package-lock.json`).

- **Bundled JavaScript islands & fonts**: full licence texts for every bundled npm package (React, Astryx, StyleX, KaTeX, Mermaid, Prism, ts-fsrs, and their transitive dependencies) and the bundled Pretendard Variable web fonts (SIL OFL 1.1) are collected in [`THIRD_PARTY_NOTICES`](THIRD_PARTY_NOTICES).
- **Vendored browser libraries**: prebuilt browser libraries under `app/src/boards/vendor/` (DOMPurify under Apache-2.0, marked under MIT, LZMA-JS under MIT, PDF.js under Apache-2.0 with its standard font and CMap notices), `app/src/vendor/codemirror/` (MIT), `app/src/vendor/xterm/` (MIT), `app/src/vendor/deepseek-chat-demo/` (MIT), and `app/src/chat/rich/` (Apache-2.0) retain their licence files beside their bundles.
