import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Codes, EngineError } from '../../core/types.ts';
import type { Driver, DriverEvent, DriverHost, Outgoing, ProviderAck, Session, SpawnSpec } from '../../core/types.ts';
import type { ReasoningEffort } from './protocol/0.164.0/ReasoningEffort.ts';
import type { ThreadStartParams } from './protocol/0.164.0/v2/ThreadStartParams.ts';
import type { TurnStartParams } from './protocol/0.164.0/v2/TurnStartParams.ts';
import type { UserInput } from './protocol/0.164.0/v2/UserInput.ts';
import { approve } from './approval.ts';
import { bootEnv, codexEnv } from './env.ts';
import { contractTest } from './contract.ts';
import { ProcessTree } from './processes.ts';
import { Rpc } from './rpc.ts';
import { modelCatalog } from '../catalog.ts';
import { readCodexModels } from './models.ts';
import { codexContext, type ContextSnapshot } from '../projection.ts';
import { codexToolDetails } from '../tool-detail.ts';

class Events implements AsyncIterable<DriverEvent> {
  private queue: DriverEvent[] = []; private waiters: ((r: IteratorResult<DriverEvent>) => void)[] = []; private ended = false;
  push(event: DriverEvent): void { if (this.ended) return; const waiter = this.waiters.shift(); if (waiter) waiter({ value: event, done: false }); else this.queue.push(event); }
  end(): void { this.ended = true; for (const w of this.waiters.splice(0)) w({ value: undefined, done: true }); }
  [Symbol.asyncIterator](): AsyncIterator<DriverEvent> { return { next: () => {
    if (this.queue.length) return Promise.resolve({ value: this.queue.shift()!, done: false });
    if (this.ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise(resolve => this.waiters.push(resolve));
  } }; }
}
class CodexSession implements Session {
  nativeId = ''; readonly driverGeneration: number; readonly events = new Events();
  private rpc: Rpc; private owned: ProcessTree; private spec: SpawnSpec;
  private turn: string | null = null; private ready = false; private closed = false; private commandId?: string;
  private serial: Promise<unknown> = Promise.resolve();
  private streamed = new Set<string>(); private tools = new Set<string>();
  private context: ContextSnapshot | null = null;
  private compaction: { before: number; at: string; complete: boolean } | undefined;
  private changes = new Map<string, { path: string; kind?: { type: string } }[]>();
  private turnMode: string;
  constructor(spec: SpawnSpec, host: DriverHost, binary: string, home: string) {
    this.spec = { ...spec }; this.driverGeneration = spec.driverGeneration;
    this.turnMode = spec.mode ?? 'default';
    if (!['linux','darwin'].includes(process.platform)) throw new EngineError(Codes.DRIVER_DISABLED, 503, 'Codex process custody requires Linux or Darwin');
    // Codex values use its native -c TOML syntax; a valueless override enables a boolean.
    const overrides = Object.entries(spec.extraArgs ?? {}).flatMap(([key, value]) => ['-c', `${key}=${value ?? 'true'}`]);
    // disallowedTools names belong to Claude's tool catalog. Codex has no equivalent
    // per-thread exclusion list; its existing approvals and the host gate still apply.
    const child = spawn(binary, ['app-server', ...overrides], { cwd: spec.cwd, env: codexEnv(spec.env, home), detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', () => {});
    if (!child.pid) throw new Error('Codex spawn failed');
    this.owned = new ProcessTree(child.pid, (pid, role) => host.trackPid(pid, role)); this.rpc = new Rpc(child);
    this.rpc.onNotification = (method, p) => this.notification(method, p);
    this.rpc.onRequest = (method, p) => approve(method, p, {
      cwd: this.spec.cwd, threadId: this.nativeId, host, changes: this.changes, readOnly: this.turnMode === 'plan',
      denied: text => this.events.push({ type: 'timeline', turnId: this.turn, item: { type: 'tool_call', callId: p.itemId ?? null, name: method, status: 'denied', detail: { reason: text } } }),
    });
    this.rpc.onExit = (code, signal) => {
      if (this.turn) this.events.push({ type: 'turn_failed', turnId: this.turn, reason: 'provider_exit' });
      this.turn = null; this.closed = true; this.events.push({ type: 'exited', code, signal }); this.events.end();
    };
  }
  async initialize(resume?: string): Promise<void> {
    await this.rpc.request('initialize', { clientInfo: { name: 'engine', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    this.rpc.notify('initialized', {});
    const mcp: Record<string, any> = {};
    for (const server of this.spec.mcp) mcp[server.name] = server.type === 'http' ? { url: server.url, http_headers: server.headers ?? {} } : { command: server.command, args: server.args ?? [], env: server.env ?? {} };
    const params: ThreadStartParams = {
      model: this.spec.model, cwd: this.spec.cwd, approvalPolicy: 'untrusted', approvalsReviewer: 'user', sandbox: 'danger-full-access',
      // systemPromptMode selects Claude preset behavior only; Codex uses thread developer instructions.
      ...(this.spec.systemPrompt !== undefined ? { developerInstructions: this.spec.systemPrompt } : {}),
      config: { model_reasoning_effort: this.spec.thinking ?? 'low', mcp_servers: mcp, 'features.multi_agent': false },
    };
    const response = await this.rpc.request(resume ? 'thread/resume' : 'thread/start', { ...params, ...(resume ? { threadId: resume, excludeTurns: true } : {}) });
    if (typeof response.thread?.id !== 'string' || (resume && response.thread.id !== resume)) throw new Error('Invalid thread response');
    this.nativeId = response.thread.id; this.events.push({ type: 'session_started', nativeId: this.nativeId });
    this.runtime(response.model ?? this.spec.model, response.reasoningEffort ?? this.spec.thinking ?? 'low');
  }
  private notification(method: string, p: any): void {
    if (p.threadId && this.nativeId && p.threadId !== this.nativeId) return;
    const turnId = p.turnId ?? p.turn?.id ?? this.turn;
    if (method === 'turn/started') {
      this.turn = turnId; this.ready = false;
      this.events.push({ type: 'turn_started', turnId, commandId: this.commandId });
    } else if (method === 'turn/completed') {
      const type = p.turn?.status === 'interrupted' ? 'turn_canceled' : p.turn?.status === 'failed' ? 'turn_failed' : 'turn_completed';
      this.turn = null; this.ready = false; this.streamed.clear(); this.tools.clear(); this.changes.clear();
      this.events.push({ type, turnId, ...(type === 'turn_failed' ? { error: 'Codex turn failed' } : {}) });
    } else if (method === 'item/agentMessage/delta') {
      this.streamed.add(p.itemId);
      this.events.push({ type: 'timeline', turnId, item: { type: 'assistant_message', text: p.delta, messageId: p.itemId ?? null, delta: true } });
    } else if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') {
      this.events.push({ type: 'timeline', turnId, item: { type: 'reasoning', text: p.delta } });
    } else if (method === 'thread/tokenUsage/updated') {
      const usage = p.tokenUsage?.last;
      this.context = codexContext(p.tokenUsage, this.context?.context.lastCompaction) ?? this.context;
      if (this.context && this.compaction?.complete) {
        this.context.context.lastCompaction = { savedTokens: Math.max(0, this.compaction.before - this.context.usage.used), at: this.compaction.at };
        this.compaction = undefined;
      }
      this.events.push({ type: 'timeline', turnId, item: { type: 'usage', inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens, ...this.context } });
    } else if (method === 'codex/event/exec_command_begin' || method === 'codex/event/exec_command_end') {
      this.owned.capture(); if (method.endsWith('_begin')) this.ready = true;
      // The v2 item notification carries typed actions; legacy exec events only supply readiness/custody.
    } else if (method === 'item/started' || method === 'item/completed') {
      const item = p.item; if (!item) return;
      const complete = method === 'item/completed';
      if (item.type === 'fileChange' && Array.isArray(item.changes)) this.changes.set(item.id, item.changes);
      if (item.type === 'commandExecution') { this.ready = true; this.owned.capture(); }
      if (['commandExecution', 'fileChange', 'mcpToolCall', 'webSearch', 'dynamicToolCall', 'imageView'].includes(item.type)) {
        const details = codexToolDetails(item, this.spec.cwd);
        details.forEach((d, i) => this.tool(details.length > 1 ? `${item.id}:${i}` : item.id, d.name, complete ? item.status ?? 'completed' : 'running', turnId, d.detail));
      }
      else if (item.type === 'agentMessage' && complete && !this.streamed.has(item.id)) {
        this.events.push({ type: 'timeline', turnId, item: { type: 'assistant_message', text: item.text ?? '', messageId: item.id } });
      } else if (item.type === 'contextCompaction') {
        if (!complete && this.context) this.compaction = { before: this.context.usage.used, at: new Date().toISOString(), complete: false };
        if (complete && this.compaction) {
          this.compaction.complete = true;
          if (this.context && this.context.usage.used < this.compaction.before) {
            this.context.context.lastCompaction = { savedTokens: this.compaction.before - this.context.usage.used, at: this.compaction.at };
            this.events.push({ type: 'timeline', turnId, item: { type: 'usage', ...this.context } });
            this.compaction = undefined;
          }
        }
        this.events.push({ type: 'timeline', turnId, item: { type: 'compaction', status: complete ? 'completed' : 'running' } });
      }
    }
  }
  private tool(callId: string | null, name: string, status: string, turnId: string | null, detail: unknown): void {
    const key = `${callId}:${status}`; if (this.tools.has(key)) return; this.tools.add(key);
    this.events.push({ type: 'timeline', turnId, item: { type: 'tool_call', callId, name, status, detail } });
  }
  private runtime(model: string, thinking: string, mode = this.spec.mode ?? 'default'): void {
    this.events.push({ type: 'settings_changed', runtimeModel: model, runtimeThinking: thinking, runtimeMode: mode });
  }
  send(message: Outgoing): Promise<ProviderAck> {
    const run = this.serial.then(() => this.sendNow(message)); this.serial = run.catch(() => {}); return run;
  }
  private async sendNow(m: Outgoing): Promise<ProviderAck> {
    if (this.closed) return { accepted: false, error: 'Codex session closed' };
    const input: UserInput[] = [{ type: 'text', text: m.text, text_elements: [] }, ...(m.images ?? []).map(i => ({ type: 'localImage' as const, path: i.path }))];
    try {
      if (this.turn) {
        if (m.delivery !== 'steer') return { accepted: false, error: 'Turn already running' };
        const expected = this.turn; const deadline = Date.now() + 30000;
        while (!this.ready && this.turn === expected && Date.now() < deadline) await delay(20);
        if (this.turn !== expected || !this.ready) return { accepted: false, error: 'Turn not ready for steering' };
        const reply = await this.rpc.request('turn/steer', { threadId: this.nativeId, expectedTurnId: expected, input, clientUserMessageId: m.clientMessageId });
        if (reply.turnId !== expected) throw new Error('Steer turn mismatch');
        this.emitUser(m, expected); this.events.push({ type: 'steered', turnId: expected, commandId: m.commandId });
        return { accepted: true, nativeTurnId: expected, steered: true };
      }
      this.commandId = m.commandId;
      if (m.text.trim() === '/compact' && !m.images?.length) {
        await this.rpc.request('thread/compact/start', { threadId: this.nativeId });
        return { accepted: true };
      }
      const params: TurnStartParams = { threadId: this.nativeId, input, clientUserMessageId: m.clientMessageId,
        model: this.spec.model, effort: (this.spec.thinking ?? 'low') as ReasoningEffort, cwd: this.spec.cwd,
        approvalPolicy: 'untrusted', approvalsReviewer: 'user', sandboxPolicy: this.spec.mode === 'plan' ? { type: 'readOnly', networkAccess: false } : { type: 'dangerFullAccess' },
        collaborationMode: { mode: this.spec.mode === 'plan' ? 'plan' : 'default', settings: { model: this.spec.model, reasoning_effort: this.spec.thinking ?? 'low', developer_instructions: null } } };
      // Pending next-turn settings must not relax an already running Plan turn.
      this.turnMode = params.collaborationMode!.mode;
      const response = await this.rpc.request('turn/start', params);
      const id = response.turn?.id;
      if (typeof id !== 'string') throw new Error('Invalid turn response');
      this.runtime(params.model!, params.effort!, params.collaborationMode!.mode);
      this.emitUser(m, id); return { accepted: true, nativeTurnId: id };
    } catch { return { accepted: false, error: 'Codex request failed' }; }
  }
  private emitUser(m: Outgoing, turnId: string): void { this.events.push({ type: 'timeline', turnId, item: { type: 'user_message', text: m.text, messageId: m.commandId, clientMessageId: m.clientMessageId ?? null } }); }
  async interrupt(): Promise<void> {
    const id = this.turn; if (!id) return;
    this.owned.capture(); const end = Date.now() + 1900;
    await this.rpc.request('turn/interrupt', { threadId: this.nativeId, turnId: id }, 1900);
    while (this.turn === id && Date.now() < end) await delay(10);
    if (this.turn === id) throw new Error('Codex cancellation not confirmed');
  }
  async setSettings(s: { model?: string; thinking?: string; mode?: string }): Promise<void> {
    if (s.thinking && !['none','minimal','low','medium','high','xhigh','max','ultra'].includes(s.thinking)) throw new Error('Unsupported reasoning effort');
    if (s.mode && !['default', 'code', 'plan'].includes(s.mode)) throw new Error('Unsupported Codex mode');
    Object.assign(this.spec, Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)));
    this.events.push({ type: 'settings_changed', ...s });
  }
  pids(): number[] { return this.owned.pids(); }
  async hardStop(): Promise<{ killed: number; alive: number }> {
    this.closed = true; this.rpc.dispose(); return this.owned.stop();
  }
  async close(): Promise<void> { await this.hardStop(); this.events.end(); }
}
export function createCodexDriver(opts: { binary?: string; codexHome?: string } = {}): Driver {
  const binary = opts.binary ?? 'codex'; const home = opts.codexHome ?? join(process.env.HOME ?? '', '.codex');
  const checked = new Map<string, Promise<{ ok: true } | { ok: false; reason: string }>>();
  function check(bin: string, root: string) {
    const key = JSON.stringify([bin, root]);
    let result = checked.get(key);
    if (!result) { result = (async () => {
      try { await contractTest(bin, codexEnv(bootEnv(), root)); return { ok: true as const }; }
      catch { return { ok: false as const, reason: 'Codex 0.164.0 approval contract or handshake failed' }; }
    })(); checked.set(key, result); }
    return result;
  }
  const selfTest = () => check(binary, home);
  return {
    provider: 'codex', caps: { steer: true, interrupt: true, rewind: 'none', compact: true, gate: 'app-server-approvals', images: true }, selfTest,
    defaultMode: 'default', modes: [{ id: 'default', label: 'Normal' }, { id: 'plan', label: 'Plan' }],
    models: modelCatalog(() => readCodexModels(binary, codexEnv(bootEnv(), home))),
    async start(spec, host, resume) {
      if (!(await check(spec.binary ?? binary, spec.codexHome ?? home)).ok) throw new EngineError(Codes.DRIVER_CONTRACT, 503, 'Codex contract check failed');
      const session = new CodexSession(spec, host, spec.binary ?? binary, spec.codexHome ?? home);
      try { await session.initialize(resume); return session; } catch { await session.close(); throw new Error('Codex session initialization failed'); }
    },
  };
}
