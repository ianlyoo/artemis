# Codex approval coverage

The engine mediates approval requests delivered by app-server. Native tool
notifications do not provide a blocking gate for every tool family.

Plan turns use `sandboxPolicy: {type: 'readOnly', networkAccess: false}` and
retain `untrusted`. They also decline command, patch and MCP elicitation
approvals: accepting one could authorize execution outside that sandbox. The
active turn's mode is captured before `turn/start`; a queued mode change cannot
relax it. Reads that need an approval are refused in Plan. This does not close
the native-family limits below.

## Known approval boundaries


- `native-web`: webSearch/fetch notifications have no blocking host gate.
- `native-image-view`: imageView can report a read without a host gate.
- `native-image-generation`: imageGeneration is not projected or mediated here.
- `native-mcp`: mcpToolCall notifications do not gate execution. MCP elicitations are mediated, but calls without an elicitation remain uncovered at this driver boundary; the configured local MCP endpoints retain their own grants and user checks.
- `native-dynamic-tools`: dynamicToolCall notifications do not gate execution; explicit item/tool/call server requests are declined as unsupported.
- `inherited-allow-grants`: provider allow grants can skip command approvals. Inherited or retained provider grants can bypass this driver boundary.
- `retained-stdin`: a previously permitted process may receive later input without a new callback. Command approval does not provide complete continuation mediation.


Current driver pin: **0.164.0** (2026-10-24). Its original generated eight-file approval
contract is unchanged from 0.163.0. The contract check now also pins the four
MCP elicitation parameter, response, action and schema files. The current
gate-real/real tests exercise the installed 0.164.0 binary with gpt-6-luna/low; this does not widen the scope of the
historical source audit below or claim complete every-tool mediation coverage. No rules, hooks,
credentials or live services are reconfigured by this version update.

Historical source review: reviewed 2026-10-21 KST against the official unmodified 0.163.0 binary and its
[`rust-v0.163.0` release](https://github.com/openai/codex/releases/tag/rust-v0.163.0)
(published 2026-10-15 21:30:38 UTC). All linked sources were read on 2026-10-21 KST;
source links below are pinned to that release, rather than current main.

**Result:** the existing typed `approvalPolicy:'untrusted'` correctly gates an
unmatched `cat` and a normal patch. No supported public control was found that
guarantees every tool invocation reaches a fail-closed host gate with the required
shared CODEX_HOME. Full schema every-tool mediation coverage remains unresolved.

## What the pinned implementation supports

- `exec_policy.rs::render_decision_for_unmatched_command_for_platform` returns
  Prompt for every unmatched command under UnlessTrusted, including read commands.
  Explicit Allow rule matches instead produce Skip. Prompt rules can override
  matching allow rules, but that is a targeted rule, not a blanket switch.
  This corrects the earlier claim that `cat`/`ls` inherently bypass untrusted.
  [Exec policy, 0.163.0](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/exec_policy.rs).
- `safety.rs::assess_patch_safety` returns AskUser for every nonempty patch under
  UnlessTrusted. The driver maps supplied patch paths to the host gate and declines
  when context is absent.
  [Patch safety, 0.163.0](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/safety.rs).
- Keep the typed thread/turn `approvalPolicy` field. The config loader rejects
  `approval_policy="untrusted"` in a config document, but still accepts the typed
  override. The real test confirms this distinction for the installed binary.
  [Config loader, 0.163.0](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/config/mod.rs).

`gate-real.test.ts` runs official gpt-6-luna/low with only synthetic scratch data.
It proves `cat <fixture.txt>` reaches host.gate, the driver declines, and app-server
confirms status `declined`. A second turn proves apply_patch reaches the gate,
is declined, and leaves its target absent. Both emit awaiting_user; all owned
processes stop. This test proves the installed host's tested configuration, not
arbitrary inherited rules or complete tool isolation.

## Controls checked and remaining gaps

1. Rules require a nonempty literal prefix. There is no empty-prefix or wildcard
   catch-all that forces every executable to Prompt. Enumerating commands leaves
   coverage gaps. The current rules documentation agrees on restrictive matching.
   [Parser, 0.163.0](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/execpolicy/src/parser.rs);
   [official rules docs, accessed 2026-10-21](https://developers.openai.com/codex/rules).
2. `ignore_user_and_project_exec_policy_rules` is an internal LoaderOverrides
   field, not a config-document key or ThreadStartParams field. The normal
   app-server CLI supplies LoaderOverrides::default(). The debug-only alternate
   config environment variable is unavailable in release builds. No unsupported
   setting was added and no host config/rules were edited.
   [Loader state](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/config/src/state.rs),
   [CLI](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/cli/src/main.rs),
   [app-server loader](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/app-server/src/lib.rs),
   all 0.163.0.
3. PreToolUse can synchronously deny a tool, but handler execution errors,
   malformed output and serialization failures leave should_block false.
   `permissionDecision:"ask"` is unsupported. A hook bridge therefore cannot meet
   the required fail-closed contract.
   [PreToolUse, 0.163.0](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/hooks/src/events/pre_tool_use.rs).
4. `write_stdin` deliberately has no PreToolUse payload. Its separate approval
   logic skips empty polls and normal retained-permission continuations, even
   when the write_stdin_approval feature is enabled. Approving an interactive
   interpreter once does not gate every subsequent input.
   [stdin handler](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs),
   [stdin approvals](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/unified_exec/stdin_approval.rs),
   both 0.163.0.
5. Unified exec opens the process before emitting Begin. An interrupt in response
   to exec-begin is too late to guarantee a read did not happen. Notifications
   provide no blocking approval response. No event-driven kill workaround was
   implemented.
   [Process manager, 0.163.0](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/unified_exec/process_manager.rs).

The driver enforces command/patch approvals and MCP elicitations that actually arrive.
Explicitly allowed commands and normal stdin continuations can avoid those
requests. Other tool families such as native web/image operations are not covered
by these command/patch callbacks either; unknown server requests are declined.
Passing the schema/handshake selfTest does not establish every-tool mediation coverage.

## Proposed next step

Request an official app-server mode that blocks every tool invocation on a host
decision, including reads and stdin continuations, with no rule/session/hook
shortcut and rejection on host disconnect/error/timeout. Gate coverage should
be an advertised capability validated with adversarial allow-rule, hook-failure
and stdin tests before enabling a profile that requires every-tool mediation.

For command launches and patches alone, an officially supported way to ignore
all inherited allow grants plus the typed untrusted policy could suffice. That
would still not establish every-tool coverage. Neither proposal is implemented
or claimed supported here. The driver retains untrusted; it never uses never,
changes models, modifies credentials, or installs a wrapper around the CLI.
