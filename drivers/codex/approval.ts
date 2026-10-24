import type { Action, DriverHost, GateVerdict } from '../../core/types.ts';
import type { CommandExecutionRequestApprovalParams } from './protocol/0.164.0/v2/CommandExecutionRequestApprovalParams.ts';
import type { CommandExecutionRequestApprovalResponse } from './protocol/0.164.0/v2/CommandExecutionRequestApprovalResponse.ts';
import type { FileChangeRequestApprovalParams } from './protocol/0.164.0/v2/FileChangeRequestApprovalParams.ts';
import type { FileChangeRequestApprovalResponse } from './protocol/0.164.0/v2/FileChangeRequestApprovalResponse.ts';
import type { McpServerElicitationRequestParams } from './protocol/0.164.0/v2/McpServerElicitationRequestParams.ts';
import type { McpServerElicitationRequestResponse } from './protocol/0.164.0/v2/McpServerElicitationRequestResponse.ts';

export type ApprovalReply = CommandExecutionRequestApprovalResponse | FileChangeRequestApprovalResponse | McpServerElicitationRequestResponse;
export async function approve(method: string, raw: unknown, opts: {
  cwd: string; threadId: string; host: DriverHost; changes: Map<string, { path: string; kind?: { type: string } }[]>;
  readOnly?: boolean;
  denied: (text: string) => void;
}): Promise<ApprovalReply> {
  const reply = (allow: boolean): ApprovalReply => method === 'mcpServer/elicitation/request'
    ? { action: allow ? 'accept' : 'decline', content: null, _meta: null } : { decision: allow ? 'accept' : 'decline' };
  try {
    const p = raw as CommandExecutionRequestApprovalParams & FileChangeRequestApprovalParams;
    let action: Action;
    if (method === 'mcpServer/elicitation/request') {
      const e = raw as McpServerElicitationRequestParams;
      if (!e || e.threadId !== opts.threadId || (e.turnId !== null && typeof e.turnId !== 'string') ||
          typeof e.serverName !== 'string' || !/^[\w-]{1,128}$/.test(e.serverName) ||
          !['form', 'openai/form', 'openaiForm', 'url', 'openai/userVerification'].includes(e.mode)) throw new Error('Malformed elicitation');
      action = { kind: 'mcp', tool: e.serverName, paths: [], cwd: opts.cwd };
    } else {
      if (!p || p.threadId !== opts.threadId || typeof p.turnId !== 'string' || typeof p.itemId !== 'string' || typeof p.startedAtMs !== 'number') throw new Error('Malformed approval');
      if (method === 'item/commandExecution/requestApproval') {
        if (typeof p.command !== 'string' || typeof p.cwd !== 'string') throw new Error('Missing command context');
        const paths = (p.commandActions ?? []).flatMap(a => 'path' in a && a.path ? [a.path] : []);
        action = { kind: p.networkApprovalContext ? 'network' : 'shell', tool: 'commandExecution', command: p.command, paths, cwd: p.cwd };
      } else if (method === 'item/fileChange/requestApproval') {
        const changes = opts.changes.get(p.itemId);
        if (!changes?.length) throw new Error('Missing patch context');
        action = { kind: changes.some(c => c.kind?.type === 'delete') ? 'delete' : 'write', tool: 'fileChange', paths: changes.map(c => c.path), cwd: opts.cwd };
      } else throw new Error('Unsupported approval');
    }
    // Accept can authorize execution outside the read-only sandbox. No command,
    // patch or server-level MCP approval may widen a Plan turn's permissions.
    if (opts.readOnly) { opts.denied('Plan mode cannot approve additional permissions'); return reply(false); }
    const verdict: GateVerdict = await opts.host.gate(action, { tool: action.tool, input: raw });
    if (verdict.allow) return reply(true);
    opts.denied(`${verdict.awaitingUser ? `awaiting_user ${verdict.awaitingUser}: ` : ''}${verdict.reason}`);
    return reply(false);
  } catch {
    opts.denied('Approval declined: invalid contract or gate failure');
    return reply(false);
  }
}
