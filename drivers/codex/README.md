# Codex 0.164.0 driver

The official app-server owns authentication. This driver only passes CODEX_HOME; it never reads credential stores. SpawnSpec.env is the core-built environment, with protected provider/service names refused. Linux process custody records descendant pid/start-time pairs, including descendants of every app-server thread, and retains them after cancellation. hardStop stops the whole owned session, escalates INT → TERM at 2 s → KILL at 5 s, verifies no live owned processes, and makes the session unusable. A new instance can resume its native thread.

At each Codex re-pin, re-check upstream for a fail-closed policy seam and close a documented limit when one appears.

Generate the checked-in protocol using the pinned Node environment:

```
sh scripts/node-env.sh codex app-server generate-ts --experimental --out drivers/codex/protocol/0.164.0
```

The sole postprocessing step adds `.ts` to relative imports and `/index.ts` to directory imports, for NodeNext/Node type stripping. No protocol fields are edited. selfTest regenerates the installed binary's twelve approval contract files (including MCP elicitation) into TMPDIR, compares them to the checked-in version (normalizing import extensions), then performs initialize/initialized. It spends no model turn. Failures are cached per binary/console pair and start throws DRIVER_CONTRACT. An alternate SpawnSpec.binary is checked as well.

Approval calls are single-action decisions: accept or decline, never session grants or policy amendments. The wire decision has no reason field; denials appear as normalized tool_call events with detail.reason including any `awaiting_user` id. Missing patch context, malformed/unknown requests, or gate exceptions fail closed. Patch paths come from item/started; a provider that requests approval before supplying paths will be refused.

In the earlier 0.163.0 source audit, typed `approvalPolicy:'untrusted'` prompts for every unmatched command, including reads, and every nonempty patch. A real `cat` denial and patch denial are covered by `gate-real.test.ts`. Explicit execpolicy allow rules can still suppress command approvals. This corrects the earlier suggestion that `cat`/`ls` are inherently trusted under this policy. Full D12 coverage is still unproven and cannot be guaranteed by the reviewed public controls; see [GATE-COVERAGE.md](GATE-COVERAGE.md) for dated source evidence, hook limitations and the proposed upstream seam.

Model, effort and mode (`default`/`code`, `plan`) apply at the next turn/start using the pinned experimental collaborationMode field. Images use localImage; `/compact` uses thread/compact/start. Steer waits for command execution readiness and never retries as a new turn or cancels. A no-tool turn may finish before it becomes steerable; that returns a refusal for core to handle.

`SpawnSpec.systemPrompt` supplies `developerInstructions` on thread start and resume. `systemPromptMode` selects Claude's preset behavior and has no effect here. `extraArgs` becomes separate `-c key=value` arguments to app-server: values use Codex's native TOML syntax (for example `{web_search: '"disabled"'}`), and null means `true`. Explicit thread settings still take precedence. Claude tool names in `disallowedTools` are ignored; Codex approvals and the host gate continue to apply. The child PATH must include Node for the official npm entry point.

Run unit tests with `sh scripts/node-env.sh node --test drivers/codex/approval.test.ts`. Opt-in real tests are `ARTEMIS_REAL=1 node --test drivers/codex/real.test.ts drivers/codex/gate-real.test.ts` with Node 24 or newer and explicitly configured providers. They create only synthetic scratch fixtures and clean their owned processes in finally. Linux and Darwin process custody are supported; these provider-pin live checks run on Linux arm64.


## 0.164.0 verification (2026-10-24)

Regenerated with the command above and only the import-extension postprocess.
The 896-file 0.163.0 tree becomes 904 files: 13 changed, 8 added, none removed.
All eight approval-contract files are byte-identical after postprocessing.
Thread start, collaborationMode/Settings, model/list, tokenUsage, compaction,
and the command/file/MCP/web/image-view items consumed by the driver are unchanged.
TurnStartParams and TurnSteerParams add optional responsesapiClientMetadataPatch
and clarify replacement semantics for responsesapiClientMetadata; this driver
sends neither field. ImageGenerationItem adds fileId/result alternatives and
inputImages metadata; the driver does not project image-generation items.
Other additions concern thread sampling, local feedback export, application
storage, model-request hooks, plan types and MCP catalog metadata. No new RPC or
projection behavior is enabled by this pin update.

The startup check still regenerates/compares approvals and requires the single
0.164.0 handshake version, matching CODEX_HOME and platform. It does not accept
0.163.0 or an arbitrary newer release. See GATE-COVERAGE.md for the distinction
between the retained historical source audit and current live checks.

The opt-in X06 check is ARTEMIS_REAL=1 node --test
--test-name-pattern='X06 real Codex' drivers/codex/real.test.ts. It sends three
short no-tool turns: gpt-6-luna low, the same model medium, then gpt-5.6-luna
medium (the cheapest other model in the 2026-10-24 live catalog). It checks
provider thread/read settings after each completed turn and stops all processes.
