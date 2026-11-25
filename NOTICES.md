# Notices

Artemis's own code is Apache-2.0. The App redistributes two small libraries, listed below with their licences. Everything else is installed as a dependency, not copied.

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

`src/artemis/web/vendor/preact-htm.js` is `preact/standalone.module.js` from the htm 3.1.1 package on npm, unmodified. It bundles htm and Preact 10. Their licence texts ship beside it.

| Component | Licence | Licence text |
|---|---|---|
| htm 3.1.1 | Apache-2.0 | `src/artemis/web/vendor/LICENSE-htm.txt` |
| Preact 10 (as bundled by htm 3.1.1) | MIT, Copyright (c) 2015-present Jason Miller | `src/artemis/web/vendor/LICENSE-preact.txt` |
