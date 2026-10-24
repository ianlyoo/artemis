# Agent MCP integration

Construct `createPolicy` before serving MCP, using the **same `SqlDb` object** passed
to `createMcp`. The listener resolves that engine through `policyFor(db)`; a missing
engine, missing profile, revoked slot or changed profile refuses access.

`slotFor(agent)` retains the fixed `McpService` interface and returns one engine
HTTP server specification. The concrete factory also exports `serversFor(agent)`:
use its array for `SpawnSpec.mcp` when adapter proxy servers are needed. It combines
the engine slot with `plugin.mcpServers(agent)`, filtered through the profile's
`mcpServers` allowlist. Alternatively, core can compose those specs itself.
Upstream credentials belong behind the proxy; HTTP headers/userinfo/query
parameters and credential-named stdio environment entries are rejected by this seam.

Generic and adapter tools are default-deny through `Profile.tools` (exact names).
Every call reaches the shared policy gate, including calls for ungranted tools.
Arguments are validated against the advertised JSON schema before invocation.
`send_agent_prompt` defaults to `steer`; only a profile with `interrupt: true` may
request `interrupt`. Lifecycle calls carry the slot's agent principal to core.
Terminal creation and capture are bound to the caller.

`create_agent` accepts optional `profile`, string-valued `labels`, opaque object
`identity`, `thinking`, `mode` and `prompt`, alongside the core-required `provider`
(`claude` or `codex`), `model`, `title` and `cwd`. Only an omitted profile defaults
to the caller's profile. `parentId` and `launcherId` are always the caller's ID and
cannot be supplied as tool arguments. Creation calls `core.create` with principal
`agent:<callerId>`, so normal admission runs and the adapter's `Admit` can supply
authoritative identity and labels. The MCP policy gate still runs on every call.

The 128-bit slot is a bearer capability; do not log or disclose it. MCP session IDs
are additionally bound to their slot, so an A-session request to B's URL is 404.
This prevents identity substitution through transport state; it is not protection
against a same-user process that steals B's capability.

`GET /state/<slot>` delegates to optional `plugin.state(agent, search)`, forwarding
the raw query string unchanged. Its `{status, data}` becomes the HTTP status and
body: string data is plain text, other data is JSON (the state hook expects a JSON
object's `text` field). Without the hook, the response is the minimal agent record,
with no identity, environment or upstream credentials. Adapter errors, malformed
responses and the 10-second adapter deadline yield a sanitized 503.

`GET /state/<agentId>` serves the same content, including before a slot is minted.
This loopback route intentionally requires no token and is accessible to local
processes. Plugins must return state suitable for local readers. It does not
grant access to MCP tools. Unknown or archived agents return 404. Slot routes still require an active slot;
an optional MCP session header must belong to the requested agent. Both routes
retain Host/Origin checks and no-store responses, and recheck liveness after the
adapter resolves. The adapter decides which state is suitable for local readers.

The listener binds loopback, rejects unexpected Host/Origin values, limits request
body size and transport sessions, and closes all connections in `close()`.
The suite uses synthetic drivers and ephemeral loopback listeners. Local hook
fixtures exercise state and channel projections without external services.

`GET /channel/<agentId>` (also `/channel/<slot>`) is the loopback bulletin-hook
compatibility projection: `{channel: "console" | "app" | null, userTurn: boolean}`.
It applies the state route's active-agent, profile, Origin/Host and optional MCP
session fences. Only trusted journal user origins select a channel; system
wakes/control messages/resends and stale events cannot replace it. `userTurn`
reports whether the latest non-stale user message was an user message, while
`channel` retains the latest user channel in the bounded journal tail. No raw
text, credentials, labels or identity are exposed. Hook integrations belong in plugins.
`userChannel(frames)` is the pure projection seam for stage fixtures.
