import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { EngineError, type AgentRecord, type EngineCore, type EnginePlugin, type McpServerSpec, type McpService, type McpTool, type SqlDb } from '../types.ts';
import { protectPlugin } from '../plugin.ts';
import { canonical, policyFor } from '../policy/index.ts';
import { userChannel } from './channel.ts';
import { genericTools } from './tools.ts';

type Slot = { agentId: string; profile: string; value: string };
type Connection = { slot: Slot; server: Server; transport: StreamableHTTPServerTransport };
export interface AgentMcpService extends McpService {
  /** Core may use this convenience seam to include adapter proxy servers along with the engine slot. */
  serversFor(agent: AgentRecord): McpServerSpec[];
}
function reply(res: ServerResponse, status: number, message: string): void {
  if (!res.headersSent) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ error: message })); }
}
async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new EngineError('LIMIT', 413, 'request too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new EngineError('FORBIDDEN', 400, 'invalid JSON'); }
}

export function createMcp(opts: { port: number; core: EngineCore; plugin: EnginePlugin; db: SqlDb; log: (msg: string, extra?: Record<string, unknown>) => void }): AgentMcpService {
  const { core, db } = opts;
  const plugin = protectPlugin(opts.plugin);
  const slots = new Map<string, Slot>(), byAgent = new Map<string, Slot>();
  const connections = new Map<string, Connection>();
  const opening = new Set<Connection>();
  const validator = new AjvJsonSchemaValidator();
  const policy = () => policyFor(db);
  let port = opts.port, listening = false, closed = false;

  function activeAgent(id: string): AgentRecord | null {
    const agent = core.get(id);
    return agent && agent.state !== 'archived' && policy()?.profile(agent.profile) ? agent : null;
  }
  function active(slot: Slot): AgentRecord | null {
    const agent = activeAgent(slot.agentId);
    return slots.get(slot.value) === slot && agent && agent.profile === slot.profile ? agent : null;
  }
  function catalog(): McpTool[] {
    const all = [...genericTools(core, policy), ...plugin.tools()];
    if (new Set(all.map(t => t.name)).size !== all.length) throw new EngineError('ADAPTER_ERROR', 503, 'duplicate tool name');
    return all;
  }
  function serverFor(slot: Slot): Server {
    const server = new Server({ name: 'engine-agent', version: '0.1.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const agent = active(slot), profile = agent && policy()?.profile(agent.profile);
      if (!profile) throw new Error('agent slot unavailable');
      return { tools: catalog().filter(t => profile.tools.includes(t.name)).map(t => ({
        name: t.name, description: t.description, inputSchema: { ...t.inputSchema, type: 'object' as const },
      })) };
    });
    server.setRequestHandler(CallToolRequestSchema, async request => {
      try {
        const agent = active(slot), engine = policy();
        if (!agent || !engine) throw new EngineError('FORBIDDEN', 403, 'agent slot unavailable');
        const args = request.params.arguments ?? {};
        const name = request.params.name;
        const verdict = await engine.gate(agent, { kind: 'mcp', tool: name, paths: [], cwd: agent.cwd, command: canonical(args) }, { tool: name, input: args });
        if (!verdict.allow) return { isError: true, content: [{ type: 'text' as const,
          text: `${verdict.reason}${verdict.awaitingUser ? `; awaiting_user ${verdict.awaitingUser}` : ''}` }] };
        if (!engine.profile(slot.profile)?.tools.includes(name)) throw new EngineError('FORBIDDEN', 403, 'tool not granted by profile');
        const tool = catalog().find(t => t.name === name);
        if (!tool) throw new EngineError('NOT_FOUND', 404, 'tool unavailable');
        if (!validator.getValidator(tool.inputSchema)(args).valid) throw new EngineError('FORBIDDEN', 400, 'invalid tool arguments');
        // Recheck after asynchronous policy work: a revoke or profile change must invalidate an in-flight call.
        if (!active(slot)) throw new EngineError('FORBIDDEN', 403, 'agent slot revoked');
        const result = await tool.call(agent, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? null) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: error instanceof EngineError ? error.code : 'ADAPTER_ERROR' }] };
      }
    });
    return server;
  }
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (closed) { reply(res, 503, 'listener closed'); return; }
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) { reply(res, 403, 'invalid host'); return; }
    // Agent clients need no browser Origin. Reject browser cross-origin requests.
    if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) { reply(res, 403, 'invalid origin'); return; }
    // Preserve the query byte-for-byte for the adapter, including repeated/encoded parameters.
    const target = req.url ?? '', at = target.indexOf('?');
    const path = at < 0 ? target : target.slice(0, at), search = at < 0 ? '' : target.slice(at);
    res.setHeader('cache-control', 'no-store');
    const state = /^\/(state|channel)\/([A-Za-z0-9_-]+)$/.exec(path);
    if (state) {
      const key = state[2]!, stateSlot = slots.get(key);
      // Agent-ID lookup is the existing loopback state-hook compatibility surface, not an MCP capability.
      const agent = stateSlot ? active(stateSlot) : activeAgent(key);
      if (!agent) { reply(res, 404, 'not found'); return; }
      if (req.method !== 'GET') { reply(res, 405, 'method not allowed'); return; }
      const session = req.headers['mcp-session-id'];
      if (session) {
        const connection = typeof session === 'string' ? connections.get(session) : undefined;
        if (!connection || connection.slot.agentId !== agent.id || !active(connection.slot) ||
          (stateSlot && connection.slot !== stateSlot)) { reply(res, 404, 'not found'); return; }
      }
      const result = state[1] === 'channel' ? { status: 200, data: userChannel(core.timeline(agent.id, { tail: 200 }).frames) } : plugin.state ? await plugin.state(agent, search) : { status: 200, data: {
        agentId: agent.id, agent: { id: agent.id, profile: agent.profile, provider: agent.provider, state: agent.state, cwd: agent.cwd },
      } };
      const fresh = stateSlot ? active(stateSlot) : activeAgent(agent.id);
      if (!fresh || fresh.profile !== agent.profile) { reply(res, 404, 'not found'); return; }
      const text = typeof result.data === 'string';
      const output = text ? result.data as string : JSON.stringify(result.data);
      if (output === undefined) throw new EngineError('ADAPTER_ERROR', 503, 'invalid state response');
      res.writeHead(result.status, { 'content-type': text ? 'text/plain; charset=utf-8' : 'application/json' });
      res.end(output);
      return;
    }
    const match = /^\/mcp\/([a-f0-9]{32})$/.exec(path);
    const slot = match && slots.get(match[1]!);
    if (!slot || !active(slot)) { reply(res, 404, 'not found'); return; }
    const sessionId = req.headers['mcp-session-id'];
    let connection: Connection | undefined;
    if (sessionId) {
      connection = typeof sessionId === 'string' ? connections.get(sessionId) : undefined;
      if (!connection || connection.slot !== slot) { reply(res, 404, 'not found'); return; }
    }
    const parsed = req.method === 'POST' ? await body(req) : undefined;
    if (!connection) {
      if (req.method !== 'POST' || !isInitializeRequest(parsed)) { reply(res, 400, 'initialize first'); return; }
      if ([...connections.values(), ...opening].filter(c => c.slot === slot).length >= 8 || connections.size + opening.size >= 256) {
        reply(res, 429, 'session limit'); return;
      }
      const server = serverFor(slot);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(), enableJsonResponse: true,
        onsessioninitialized: id => { connections.set(id, connection!); opening.delete(connection!); },
      });
      connection = { slot, server, transport };
      opening.add(connection);
      const current = connection;
      server.onclose = () => { if (transport.sessionId) connections.delete(transport.sessionId); opening.delete(current); };
      try { await server.connect(transport); await transport.handleRequest(req, res, parsed); }
      finally { if (!transport.sessionId) { opening.delete(current); await server.close(); } }
    } else await connection.transport.handleRequest(req, res, parsed);
  }
  const http = createServer((req, res) => {
    void handle(req, res).catch(error => reply(res, error instanceof EngineError ? error.status : 503, 'request refused'));
  });
  http.requestTimeout = 15_000;
  http.headersTimeout = 10_000;
  http.maxHeadersCount = 50;

  const service: AgentMcpService = {
    slotFor(agent) {
      if (closed) throw new EngineError('FORBIDDEN', 503, 'listener closed');
      let slot = byAgent.get(agent.id);
      if (slot && slot.profile !== agent.profile) { service.revoke(agent.id); slot = undefined; }
      if (!slot) {
        slot = { agentId: agent.id, profile: agent.profile, value: randomBytes(16).toString('hex') };
        slots.set(slot.value, slot); byAgent.set(agent.id, slot);
      }
      return { name: 'engine', type: 'http', url: `http://127.0.0.1:${port}/mcp/${slot.value}` };
    },
    serversFor(agent) {
      const extra = plugin.mcpServers(agent);
      const names = new Set(['engine']);
      for (const server of extra) {
        if (names.has(server.name)) throw new EngineError('ADAPTER_ERROR', 503, 'duplicate MCP server');
        names.add(server.name);
        // The Stage 1 proxy seam carries identity in a capability URL, never an upstream auth token.
        if (server.type === 'http') {
          const url = new URL(server.url);
          if (url.username || url.password || url.search || (server.headers && Object.keys(server.headers).length))
            throw new EngineError('FORBIDDEN', 403, 'credential-bearing MCP configuration refused');
        } else if (server.env && Object.keys(server.env).some(k => /token|secret|password|api.?key|auth/i.test(k)))
          throw new EngineError('FORBIDDEN', 403, 'credential-bearing MCP environment refused');
      }
      const allowed = policy()?.profile(agent.profile)?.mcpServers ?? [];
      return [service.slotFor(agent), ...extra.filter(s => allowed.includes(s.name))];
    },
    revoke(agentId) {
      const slot = byAgent.get(agentId);
      if (!slot) return;
      byAgent.delete(agentId); slots.delete(slot.value);
      for (const connection of [...connections.values(), ...opening]) if (connection.slot === slot) {
        if (connection.transport.sessionId) connections.delete(connection.transport.sessionId);
        opening.delete(connection);
        void connection.server.close().catch(() => {});
      }
    },
    async start() {
      if (closed) throw new Error('MCP listener closed');
      if (listening) return { port };
      await new Promise<void>((resolve, reject) => {
        const error = (e: Error) => reject(e);
        http.once('error', error);
        http.listen(port, '127.0.0.1', () => { http.off('error', error); resolve(); });
      });
      const address = http.address();
      if (!address || typeof address === 'string') throw new Error('MCP address unavailable');
      port = address.port; listening = true;
      return { port };
    },
    async close() {
      if (closed) return;
      closed = true; slots.clear(); byAgent.clear();
      await Promise.allSettled([...new Set([...connections.values(), ...opening])].map(c => c.server.close()));
      connections.clear(); opening.clear();
      if (listening) {
        await new Promise<void>(resolve => { http.close(() => resolve()); http.closeAllConnections(); });
        listening = false;
      }
    },
  };
  return service;
}
