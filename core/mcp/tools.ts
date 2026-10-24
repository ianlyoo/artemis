import { randomUUID } from 'node:crypto';
import { canCaptureGranted } from '../terminals/capture.ts';
import { EngineError, type AgentRecord, type CreateIntent, type EngineCore, type McpTool, type PolicyEngine, type Principal, type SendRequest } from '../types.ts';
import type { Registry } from '../registry.ts';

const string = { type: 'string', minLength: 1, maxLength: 64 * 1024 };
function schema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}
const principal = (agent: AgentRecord): Principal => ({ kind: 'agent', name: `agent:${agent.id}`, agentId: agent.id });
const requestId = (args: Record<string, unknown>) => typeof args.requestId === 'string' ? args.requestId : randomUUID();
function target(core: EngineCore, id: unknown): AgentRecord {
  const agent = core.get(String(id));
  if (!agent) throw new EngineError('NOT_FOUND', 404, 'agent not found');
  return agent;
}

export function genericTools(core: EngineCore, policy: () => PolicyEngine | undefined): McpTool[] {
  const registry = core as EngineCore & Partial<Pick<Registry, 'actor' | 'drivers' | 'workspaces' | 'updateWorkspace'>>;
  function child(caller: AgentRecord, id: unknown): AgentRecord {
    const current = target(core, caller.id), next = target(core, id);
    if (current.state === 'archived' || current.successorId || next.state === 'archived' || next.successorId
      || next.id === current.id || next.parentId !== current.id)
      throw new EngineError('FORBIDDEN', 403, 'caller is not the active direct parent');
    return next;
  }
  return [
    {
      name: 'cancel_agent', description: 'Cancel a direct child and stop its owned tool processes.',
      inputSchema: schema({ agentId: string, requestId: string }, ['agentId']),
      async call(agent, args) {
        const next = child(agent, args.agentId);
        return core.cancel(next.id, { requestId: requestId(args), hardStop: true }, principal(agent));
      },
    },
    {
      name: 'respond_to_permission', description: 'Decide a direct child ordinary provider prompt using its current digest; user gates are excluded.',
      inputSchema: schema({ agentId: string, permissionId: string, requestDigest: string, decision: string }, ['agentId', 'permissionId', 'requestDigest', 'decision']),
      async call(agent, args) {
        const next = child(agent, args.agentId);
        if (!registry.actor) throw new EngineError('UNAVAILABLE', 503, 'permission service unavailable');
        registry.actor(next.id).decide(String(args.permissionId), { expectDigest: String(args.requestDigest), decision: String(args.decision) }, principal(agent));
        return { decided: true };
      },
    },
    {
      name: 'list_models', description: 'List the provider catalog and its supported reasoning choices.',
      inputSchema: schema({ provider: { enum: ['claude', 'codex'] } }, ['provider']),
      async call(_agent, args) {
        const driver = registry.drivers?.get(args.provider as 'claude' | 'codex');
        const models = await driver?.models?.();
        if (!models?.length) throw new EngineError('DRIVER_UNAVAILABLE', 503, 'provider catalog unavailable');
        return { provider: args.provider, models };
      },
    },
    {
      name: 'list_workspaces', description: 'List recorded active workspaces; includeArchived also returns archived records. No directory scan.',
      inputSchema: schema({ includeArchived: { type: 'boolean' } }),
      async call(_agent, args) {
        if (!registry.workspaces) throw new EngineError('UNAVAILABLE', 503, 'workspace service unavailable');
        return { workspaces: registry.workspaces().filter(w => args.includeArchived === true || !w.archived) };
      },
    },
    {
      name: 'rename_workspace', description: 'Rename a recorded workspace belonging to a direct child; its cwd is unchanged.',
      inputSchema: schema({ workspaceId: string, title: { type: 'string', minLength: 1, maxLength: 200 } }, ['workspaceId', 'title']),
      async call(agent, args) {
        const current = target(core, agent.id);
        if (current.state === 'archived' || current.successorId) throw new EngineError('FORBIDDEN', 403, 'caller is not active');
        const row = registry.workspaces?.().find(w => w.id === args.workspaceId);
        if (!row) throw new EngineError('NOT_FOUND', 404, 'workspace not found');
        const owns = core.list({ parentId: agent.id, archived: true }).some(a => a.cwd === row.cwd && a.parentId === agent.id);
        if (!owns || !String(args.title).trim()) throw new EngineError('FORBIDDEN', 403, 'workspace is not a direct child workspace');
        if (!registry.updateWorkspace) throw new EngineError('UNAVAILABLE', 503, 'workspace service unavailable');
        return registry.updateWorkspace(String(args.workspaceId), { title: String(args.title).trim() });
      },
    },
    {
      name: 'create_agent', description: 'Create an agent as a child of this agent.',
      inputSchema: schema({ requestId: string, provider: { type: 'string', enum: ['claude', 'codex'] }, model: string, cwd: string,
        title: string, prompt: string, profile: string, thinking: string, mode: string,
        labels: { type: 'object', additionalProperties: { type: 'string' } },
        identity: { type: 'object', additionalProperties: true } }, ['provider', 'model', 'cwd', 'title']),
      async call(agent, args) {
        const intent = { ...args, requestId: requestId(args), profile: args.profile === undefined ? agent.profile : args.profile,
          parentId: agent.id, launcherId: agent.id } as CreateIntent;
        return core.create(intent, principal(agent));
      },
    },
    {
      name: 'send_agent_prompt', description: 'Send to an agent; steering is the default. Interrupt requires a profile grant.',
      inputSchema: schema({ requestId: string, agentId: string, text: string, clientMessageId: string,
        delivery: { enum: ['steer', 'queue', 'when_idle', 'interrupt'] } }, ['agentId', 'text']),
      async call(agent, args) {
        const delivery = (args.delivery ?? 'steer') as SendRequest['delivery'];
        if (delivery === 'interrupt' && !policy()?.profile(agent.profile)?.interrupt)
          throw new EngineError('INTERRUPT_FORBIDDEN', 403, 'profile does not grant interrupt');
        target(core, args.agentId);
        return core.send(String(args.agentId), { requestId: requestId(args), text: String(args.text), delivery,
          ...(typeof args.clientMessageId === 'string' ? { clientMessageId: args.clientMessageId } : {}) }, principal(agent));
      },
    },
    {
      name: 'get_agent_status', description: 'Read an agent status.',
      inputSchema: schema({ agentId: string }, ['agentId']),
      async call(_agent, args) { return target(core, args.agentId); },
    },
    {
      name: 'get_agent_activity', description: 'Read recent journal activity.',
      inputSchema: schema({ agentId: string, tail: { type: 'integer', minimum: 1, maximum: 1000 } }, ['agentId']),
      async call(_agent, args) { target(core, args.agentId); return core.timeline(String(args.agentId), { tail: Number(args.tail ?? 100) }); },
    },
    {
      name: 'list_agents', description: 'List agents visible through the core.',
      inputSchema: schema({ archived: { type: 'boolean' }, parentId: string, provider: { enum: ['claude', 'codex', 'agy'] } }),
      async call(_agent, args) { return core.list(args); },
    },
    {
      name: 'archive_agent', description: 'Archive an agent.',
      inputSchema: schema({ agentId: string }, ['agentId']),
      async call(agent, args) { target(core, args.agentId); await core.archive(String(args.agentId), principal(agent)); return { archived: true }; },
    },
    {
      name: 'archive_workspace', description: 'Archive agents in exactly the requested workspace directory.',
      inputSchema: schema({ cwd: string }, ['cwd']),
      async call(agent, args) {
        const agents = core.list({ archived: false }).filter(a => a.cwd === args.cwd);
        for (const a of agents) await core.archive(a.id, principal(agent));
        return { archived: agents.map(a => a.id) };
      },
    },
    {
      name: 'create_terminal', description: 'Create a terminal owned by this agent.',
      inputSchema: schema({ requestId: string, cwd: string, title: string,
        cols: { type: 'integer', minimum: 1, maximum: 1000 }, rows: { type: 'integer', minimum: 1, maximum: 500 } }),
      async call(agent, args) {
        return core.terminals.create({ requestId: requestId(args), user: `agent:${agent.id}`,
          cwd: String(args.cwd ?? agent.cwd), cols: Number(args.cols ?? 100), rows: Number(args.rows ?? 30),
          ...(typeof args.title === 'string' ? { title: args.title } : {}) }, principal(agent));
      },
    },
    {
      name: 'capture_terminal', description: 'Capture your terminal, or a specific Console terminal the user has granted to this Orchestrator.',
      inputSchema: schema({ terminalId: string, lines: { type: 'integer', minimum: 1, maximum: 5000 } }, ['terminalId']),
      async call(agent, args) {
        const owned = core.terminals.list({ user: `agent:${agent.id}`, limit: 100 }).items.some(t => t.id === args.terminalId);
        const id = String(args.terminalId), granted = () => canCaptureGranted(core.terminals, id, core.get(agent.id));
        if (!owned && !granted()) throw new EngineError('FORBIDDEN', 403, 'Terminal capture not granted');
        const text = await core.terminals.capture(id, Number(args.lines ?? 200));
        if (!owned && !granted()) throw new EngineError('FORBIDDEN', 403, 'Terminal capture grant revoked');
        return { text };
      },
    },
  ];
}
