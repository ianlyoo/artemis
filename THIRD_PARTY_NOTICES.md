# Third-party notices

Artemis is an independent engine. Its MIT license does not replace dependency terms.

## Generated protocol types

`drivers/codex/protocol/0.164.0/` contains TypeScript protocol declarations generated
from OpenAI Codex 0.164.0 using `codex app-server generate-ts`. These declarations
have one postprocessing modification: relative import specifiers have `.ts`
extensions added for direct TypeScript execution. Their generated headers and
wire types are retained. The export preserves these already-postprocessed files
byte for byte.
Upstream: https://github.com/openai/codex, tag `rust-v0.164.0` (Apache-2.0).
Copyright 2025 OpenAI.

The upstream LICENSE and NOTICE were fetched on 2026-10-24 using the GitHub
contents API with `ref=rust-v0.164.0`. Exact copies are in `LICENSES/Apache-2.0.txt` and
`LICENSES/Codex-NOTICE.txt`. Sources:
- https://github.com/openai/codex/blob/rust-v0.164.0/LICENSE (fetched 2026-10-24)
- https://github.com/openai/codex/blob/rust-v0.164.0/NOTICE (fetched 2026-10-24)

The upstream NOTICE includes a Ratatui attribution. It is retained as supplied;
Artemis does not vendor Ratatui implementation code.

## npm dependencies

Packages are installed by npm, not vendored. The complete locked inventory below
includes transitive, development, optional, and platform-specific packages.
License labels below are the declarations in `package-lock.json`; no broader
dependency-license audit is claimed.

`@anthropic-ai/claude-agent-sdk` and all its platform packages are dependencies
under Anthropic's own terms (`SEE LICENSE`; all rights reserved). They are not
MIT- or Apache-licensed Artemis code and are never vendored in this repository.
Users authenticate with their own credentials. Consult the packages' referenced
license/readme files for their terms.

| Package | Version | Declared license |
| --- | --- | --- |
| @anthropic-ai/claude-agent-sdk | 0.3.304 | SEE LICENSE IN README.md |
| @anthropic-ai/claude-agent-sdk-darwin-arm64 | 0.3.304 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/claude-agent-sdk-darwin-x64 | 0.3.304 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/claude-agent-sdk-linux-arm64 | 0.3.304 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/claude-agent-sdk-linux-arm64-musl | 0.3.304 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/claude-agent-sdk-linux-x64 | 0.3.304 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/claude-agent-sdk-linux-x64-musl | 0.3.304 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/claude-agent-sdk-win32-arm64 | 0.3.304 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/claude-agent-sdk-win32-x64 | 0.3.304 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/sdk | 0.136.0 | MIT |
| @babel/runtime | 7.29.10 | MIT |
| @hono/node-server | 2.1.5 | MIT |
| @modelcontextprotocol/sdk | 1.32.1 | MIT |
| @opentelemetry/api | 1.9.1 | Apache-2.0 |
| @stablelib/base64 | 1.0.1 | MIT |
| @types/node | 24.19.2 | MIT |
| @types/ws | 8.18.2 | MIT |
| @xterm/headless | 6.0.0 | MIT |
| accepts | 2.0.0 | MIT |
| ajv | 8.20.0 | MIT |
| ajv-formats | 3.0.1 | MIT |
| body-parser | 2.3.0 | MIT |
| content-type | 2.1.0 | MIT |
| bytes | 3.1.2 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| call-bound | 1.0.4 | MIT |
| content-disposition | 2.0.1 | MIT |
| content-type | 1.0.5 | MIT |
| cookie | 0.7.2 | MIT |
| cookie-signature | 1.2.2 | MIT |
| cors | 2.8.6 | MIT |
| cross-spawn | 7.0.6 | MIT |
| debug | 4.4.3 | MIT |
| depd | 2.0.0 | MIT |
| dunder-proto | 1.0.1 | MIT |
| ee-first | 1.1.1 | MIT |
| encodeurl | 2.0.0 | MIT |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-object-atoms | 1.1.2 | MIT |
| escape-html | 1.0.3 | MIT |
| etag | 1.8.1 | MIT |
| eventsource | 3.0.7 | MIT |
| eventsource-parser | 3.1.1 | MIT |
| express | 5.3.0 | MIT |
| express-rate-limit | 8.7.1 | MIT |
| content-type | 2.1.0 | MIT |
| fast-deep-equal | 3.1.3 | MIT |
| fast-sha256 | 1.3.0 | Unlicense |
| fast-uri | 3.1.9 | BSD-3-Clause |
| finalhandler | 2.1.1 | MIT |
| forwarded | 0.2.0 | MIT |
| fresh | 2.0.0 | MIT |
| function-bind | 1.1.2 | MIT |
| get-intrinsic | 1.3.0 | MIT |
| get-proto | 1.0.1 | MIT |
| gopd | 1.2.0 | MIT |
| has-symbols | 1.1.0 | MIT |
| hasown | 2.0.4 | MIT |
| hono | 4.13.13 | MIT |
| http-errors | 2.0.1 | MIT |
| iconv-lite | 0.7.3 | MIT |
| inherits | 2.0.4 | ISC |
| ip-address | 10.7.4 | MIT |
| ipaddr.js | 1.9.1 | MIT |
| is-promise | 4.0.0 | MIT |
| isexe | 2.0.0 | ISC |
| jose | 6.2.13 | MIT |
| json-schema-to-ts | 3.1.1 | MIT |
| json-schema-traverse | 1.0.0 | MIT |
| json-schema-typed | 8.0.2 | BSD-2-Clause |
| math-intrinsics | 1.1.0 | MIT |
| media-typer | 1.1.1 | MIT |
| merge-descriptors | 2.0.0 | MIT |
| mime-db | 1.54.0 | MIT |
| mime-types | 3.0.2 | MIT |
| ms | 2.1.3 | MIT |
| negotiator | 1.1.0 | MIT |
| content-type | 2.1.0 | MIT |
| node-addon-api | 7.1.1 | MIT |
| node-pty | 1.2.0-beta.15 | MIT |
| object-assign | 4.1.1 | MIT |
| object-inspect | 1.13.4 | MIT |
| on-finished | 2.4.1 | MIT |
| once | 1.4.0 | ISC |
| parseurl | 1.3.3 | MIT |
| path-key | 3.1.1 | MIT |
| path-to-regexp | 8.4.2 | MIT |
| pkce-challenge | 5.0.1 | MIT |
| proxy-addr | 2.0.8 | MIT |
| qs | 6.16.1 | BSD-3-Clause |
| range-parser | 1.3.0 | MIT |
| raw-body | 3.0.2 | MIT |
| require-from-string | 2.0.2 | MIT |
| router | 2.2.0 | MIT |
| safer-buffer | 2.1.2 | MIT |
| send | 1.2.1 | MIT |
| serve-static | 2.2.1 | MIT |
| setprototypeof | 1.2.0 | ISC |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| side-channel | 1.1.1 | MIT |
| side-channel-list | 1.0.1 | MIT |
| side-channel-map | 1.0.1 | MIT |
| side-channel-weakmap | 1.0.2 | MIT |
| standardwebhooks | 1.1.1 | MIT |
| statuses | 2.0.2 | MIT |
| toidentifier | 1.0.1 | MIT |
| ts-algebra | 2.0.0 | MIT |
| type-is | 2.1.0 | MIT |
| content-type | 2.1.0 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| undici-types | 7.24.6 | MIT |
| unpipe | 1.0.0 | MIT |
| vary | 1.1.2 | MIT |
| which | 2.0.2 | ISC |
| wrappy | 1.0.2 | ISC |
| ws | 8.22.0 | MIT |
| zod | 4.6.7 | MIT |
| zod-to-json-schema | 3.25.2 | ISC |
