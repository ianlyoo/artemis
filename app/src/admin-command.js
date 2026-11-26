import { esc } from "./mobile/format.js";
import { l10n } from "./names.js";
export const adminSummary = (a) => a.summary || a.preimage?.summary || l10n("관리자 명령을 실행해요.", "Runs an admin command.");
const commandOf = (a) => String(a.preimage?.action?.command ?? a.scope_text ?? "");
export function adminPreview(a) {
  if (a.command_preview != null) return a.command_preview;
  const command = commandOf(a), line = command.split(/\r?\n|[\u2028\u2029]/)[0];
  return line.length > 120 || line.length < command.length ? line.slice(0, 119) + "…" : line;
}
export function adminCommandHTML(a) {
  return '<pre class="approval-command approval-command-preview">' + esc(adminPreview(a)) + '</pre><details class="approval-command-full"><summary>' + l10n("명령 원문 보기", "Show the command") + '</summary><pre class="approval-command">' + esc(commandOf(a)) + "</pre></details>";
}
