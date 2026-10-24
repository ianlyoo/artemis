# Policy integration

`createPolicy` uses the core writer's `permissions` table, with the columns in
`core/types.ts`/the schema: `id`, `agent_id`, `turn_id`, `driver_generation`,
`kind`, `request_digest`, `scope_hash`, `nonce`, `state`, `decided_by`, `expires_at`.
It does not create or migrate the table. Expiry values are UTC ISO strings.
User rows have `kind = user:<category>`. No public decision endpoint should
handle those rows; only `plugin.approvalStatus` can authorize consumption.

Core classification precedes adapter classification and profile denial. A profile
denial or adapter error is checked before an user approval is consumed. Secret
access never files an approval. Other categories create a pending row with a
random nonce and no local expiry (a pending card waits for the user; the plugin controls expiry of an
approved decision), then call the protected adapter. An approved
record is consumed with compare-and-set and `approval_consumed` journaled in the
same transaction. Unknown outcomes are never replayed.

Scope is SHA-256 of canonical action, agent ID and agent cwd, separated by NUL.
For non-shell tools, canonical arguments occupy `Action.command` before hashing;
this binds write contents and MCP arguments as well as paths and tool names.
Profile deny strings are case-insensitive full matches with `*` wildcards against
tool, action kind, command, paths and `kind:path`. There is no implicit rule-file
fallback: a missing adapter rule file must throw, which becomes a denial.

The classifier's grammar and limitations are in `user.ts`. It is a heuristic,
not a resource or OS-user isolation boundary. Cleanup-delete exemptions resolve
existing symlinks, but no path check eliminates concurrent filesystem races.

`createPolicy({cleanupRoots})` and artemisd's `--cleanup-roots a,b` configure the
literal cleanup boundaries. Omitting the option defaults to OS scratch only:
`tmpdir()`, `/tmp`, and `/var/tmp`. An explicit list replaces those defaults;
an empty programmatic list disables cleanup exemptions. Relative CLI roots are
resolved at startup; programmatic roots must be absolute directories.

Configure cleanup roots explicitly for each system.

Every recursive/forced deletion target must be literal and strictly inside a
cleanup root both lexically and physically. A recorded agent cwd supplies an
owned-worktree boundary only when it is itself strictly inside a cleanup root;
an arbitrary action cwd cannot grant control. Thus worktree `build` and
`node_modules` cleanup is exempt, while a cwd at `/workspace` or the system repo
does not grant a cwd exemption. The cwd, its ancestors (including `..`), and every
cleanup root itself are always protected, even with overlapping roots. Existing
symlinks are resolved; missing descendants use their nearest existing ancestor.
Literal targets outside these boundaries (including symlink escapes) require user
approval. A recursive/forced delete containing any non-literal target—variable,
glob, brace expansion, substitution, or `~`—is denied with no approval card:
`delete targets must be literal paths: expand variables and globs first (e.g. rm -rf /workspace/work/…/build)`.
The agent can retry with explicit literal paths; literals inside the cleanup
boundaries remain exempt. Direct delete actions follow the same literal-path rule.
Adapters and profiles can still impose stricter rules on an otherwise exempt target.

`loadPlugin` returns a protected adapter, including when import fails. Admission
failures become `Refusal`; classify failures become deny. Methods whose contracts
cannot return refusals (`beforeSpawn`, `onBoot`, `onEvent`, server configuration)
throw sanitized `EngineError`s for core to handle. Promise timeouts do not
terminate already-running adapter side effects or synchronous event-loop stalls.
