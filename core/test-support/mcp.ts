// MCP client for an agent slot on artemisd's MCP listener (P11, P29, P30, P32): the test acts as the agent's CLI.
// Slot URLs are capabilities: callers never log them, only the tool names and results.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpServerSpec } from '../types.ts';

export type McpConn = {
  tools(): Promise<string[]>;
  call(name: string, args?: Record<string, unknown>): Promise<{ isError: boolean; text: string; json: any }>;
  close(): Promise<void>;
};

export async function mcpConnect(url: string, headers: Record<string, string> = {}): Promise<McpConn> {
  const client = new Client({ name: 'stage1-parity', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  await client.connect(transport);
  return {
    tools: async () => (await client.listTools()).tools.map((t) => t.name),
    call: async (name, args = {}) => {
      try {
        const r = await client.callTool({ name, arguments: args });
        const text = ((r.content ?? []) as { type: string; text?: string }[]).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
        let json: any = (r as { structuredContent?: unknown }).structuredContent ?? null;
        if (json === null) { try { json = JSON.parse(text); } catch { json = null; } }
        return { isError: Boolean(r.isError), text, json };
      } catch (e) {
        return { isError: true, text: String((e as Error).message ?? e), json: null };
      }
    },
    close: () => client.close(),
  };
}

/** HTTP status of a bare MCP initialize POST (404 for an unknown or revoked slot). */
export async function mcpStatus(url: string, headers: Record<string, string> = {}): Promise<number> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stage1-probe', version: '1' } } }),
      signal: AbortSignal.timeout(10_000),
    });
    await res.body?.cancel();
    return res.status;
  } catch {
    return 0;
  }
}

/** The engine MCP entry of a SpawnSpec.mcp list (the one that is not the adapter's `ledger` proxy). */
export function engineEntry(mcp: McpServerSpec[], proxyName = 'ledger'): Extract<McpServerSpec, { type: 'http' }> | null {
  const e = mcp.find((m) => m.type === 'http' && m.name !== proxyName);
  return (e as Extract<McpServerSpec, { type: 'http' }>) ?? null;
}

/** Tool input schemas by name, to build arguments with the names the core's tools actually declare. */
export async function schemas(url: string): Promise<Map<string, Record<string, unknown>>> {
  const client = new Client({ name: 'stage1-parity', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  try {
    const out = new Map<string, Record<string, unknown>>();
    for (const t of (await client.listTools()).tools) out.set(t.name, (t.inputSchema ?? {}) as Record<string, unknown>);
    return out;
  } finally { await client.close(); }
}

const ALIASES: Record<string, string[]> = {
  agent: ['agentId', 'agent_id', 'id', 'target', 'agent'],
  text: ['text', 'prompt', 'message'],
  delivery: ['delivery', 'mode'],
  terminal: ['terminalId', 'terminal_id', 'id', 'terminal'],
  workspace: ['workspaceId', 'workspace_id', 'id', 'cwd', 'workspace'],
};
/** Maps logical argument names onto a tool's declared property names (first alias that exists; else the logical name). */
export function argsFor(schema: Record<string, unknown> | undefined, logical: Record<string, unknown>): Record<string, unknown> {
  const props = Object.keys(((schema ?? {}) as { properties?: Record<string, unknown> }).properties ?? {});
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(logical)) {
    const name = (ALIASES[k] ?? [k]).find((a) => props.includes(a)) ?? (props.includes(k) ? k : (ALIASES[k]?.[0] ?? k));
    out[name] = v;
  }
  return out;
}
