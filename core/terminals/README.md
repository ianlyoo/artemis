# Terminal service integration

`createTerminals({db,runDir,journal,log,allowedRoots?})` connects to the separately supervised ptyd. The fixed TerminalService contract is unchanged. `allowedRoots` is the optional configuration for Console terminals; its safe default is an empty list. Console creation requires the console principal and a realpath under one of these roots, including symlink checks. Agent principals can attach/create/kill only their own terminals; user-channel principals cannot administer terminals.

Use `terminalSocket(ws)` from `socket.ts` in the HTTP/WS adapter. It implements the fixed TermSocket interface and additionally exposes the real websocket `bufferedAmount`, allowing the service to enforce the 256 KiB bound per client. Frames are forwarded immediately; no scheduling batch or shared IPC backlog counts against a healthy client. Custom adapters without that optional getter must enforce their own output transport queue; the service still bounds input per client. The protocol and multipart restore format are documented in `ptyd/README.md`.

The shared `terminals` table uses the schema's nine columns. This service creates an auxiliary `terminal_details` table for durable create fingerprints, title, exit status and last activity; the core's table remains unchanged. Create request ids are scoped to principal and persist across service restarts. History, list filters, cursor pagination and closed terminals are SQLite-backed. Agent create/close entries use existing timeline/tool_call journal events. Console terminals have no agent journal.

Call `sweep` periodically: it refreshes sidecar activity and kills terminals belonging to archived agents after six idle hours. Call `close` on artemisd shutdown: it closes transports/leases only. A missing sidecar produces PTY_OFFLINE; the service does not start another daemon. A supervisor can restart ptyd on the same runDir after SIGKILL without lock cleanup; see `ptyd/README.md`.

Real tests use a separately spawned ptyd, native node-pty, @xterm/headless, real SQLite, the private socket, and a real websocket on an ephemeral loopback port. `service-fixture.ts` is a test-only artemisd surrogate killed with SIGKILL to prove independent terminal lifetime. `test-support.ts` supplies only its test schema and TermSocket fixture; production uses core/db.ts.

Console parity (T08/T10/T11): `GET /v1/terminals` refreshes PTY state before returning
`activity: idle | working | needs_input` and `attention: null | {reason: needs_input,
since: ISO8601}`. `refreshTerminalActivity(service)` exposes the same refresh to
embedded callers; `list()` remains synchronous and uses the last refresh. No
terminal text is returned by this projection. Foreground shell + line editor or
shell prompt is idle; a trailing question/colon or yes/no prompt needs input;
unknown programs stay working. `since` remains stable until attention clears.
Console maps needs_input to its existing attention/needs_input UI shape and retains
its screen-based close confirmation.

`TERMINAL_LIMITS.userTerminals=8`, `agentTerminals=8` are separate open-terminal
budgets. `sessions=16` counts attachments across all terminals and service
connections, at most `clientsPerTerminal=2` each. Attach/detach never consumes an
open-terminal slot. Capacity returns LIMIT/429 with a bounded human-readable
reason; Console maps user-create LIMIT to its existing busy message.
User PTYs use the account shell (`getpwuid_r` via Node userInfo) with `-l -i` on
Darwin/Linux, loading its profiles. Agent PTYs retain their existing shell.
