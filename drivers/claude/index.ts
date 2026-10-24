import { resolveClaudeBinary } from './binary.ts';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { query, getSessionMessages, type SessionMessage, type Query, type Options, type SDKMessage, type SDKUserMessage, type PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { Driver, DriverEvent, DriverHost, Outgoing, ProviderAck, Session, SpawnSpec, TimelineItem } from '../../core/types.ts';
import { AsyncQueue } from './queue.ts';
import { actionFor } from './action.ts';
import { ProcessTree } from './processes.ts';
import { nativeMessageId } from './message-id.ts';
import { modelCatalog } from '../catalog.ts';
import { readClaudeModels } from './models.ts';
import { breakdown, claudeContext, count, type ContextSnapshot } from '../projection.ts';
import { toolDetail } from '../tool-detail.ts';
import { ReadFiles } from './context.ts';

type Settings = { model?: string; thinking?: string; mode?: string };
type HistoryMessage = Pick<SessionMessage, 'type' | 'uuid' | 'parent_tool_use_id'>;
type ReadHistory = (id: string, options: { dir: string }) => Promise<HistoryMessage[]>;
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Claude control timeout')), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
const MODES = new Set(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto']);
function mode(value = 'default'): PermissionMode {
  if (!MODES.has(value)) throw new Error('unsupported Claude permission mode');
  return value as PermissionMode;
}
function thinking(value?: string): Pick<Options, 'thinking' | 'effort'> {
  if (value === undefined) return {};
  if (value === 'off' || value === 'disabled' || value === 'none') return { thinking: { type: 'disabled' } };
  if (/^\d+$/.test(value) && Number(value) >= 1024) return { thinking: { type: 'enabled', budgetTokens: Number(value) } };
  if (value === 'adaptive') return { thinking: { type: 'adaptive' } };
  if (['low', 'medium', 'high', 'xhigh', 'max'].includes(value))
    return { thinking: { type: 'adaptive' }, effort: value as Options['effort'] };
  throw new Error('unsupported Claude thinking setting');
}

export interface ClaudeSession extends Session {
  /** Core can queue all locally implemented slash commands, including /compact. */
  supportedCommands(): Promise<{ name: string; description: string }[]>;
  rewind(messageId: string): Promise<{ nativeId: string }>;
}

class LiveSession implements ClaudeSession {
  private spec: SpawnSpec;
  private host: DriverHost;
  private tree: ProcessTree;
  private output = new AsyncQueue<DriverEvent>();
  readonly events: AsyncIterable<DriverEvent> = this.output;
  private input!: AsyncQueue<SDKUserMessage>;
  private q!: Query;
  private pump!: Promise<void>;
  private id: string;
  private nativeConfirmed: boolean;
  private boot = 0;
  private incarnations = 0;
  private closed = false;
  private broken = false;
  private respawn = false;
  private turn: string | null = null;
  private cancelTurn: string | null = null;
  private terminalReceipt: Promise<void> = Promise.resolve();
  private releaseReceipt: (() => void) | undefined;
  private pendingSettings: Settings | undefined;
  private streamed = new Set<string>();
  private currentMessage: string | null = null;
  private tools = new Map<string, string>();
  private details = new Map<string, unknown>();
  private context: ContextSnapshot | null = null;
  private readFiles = new ReadFiles();
  private lastInput = 0;
  private lastModel = '';
  private compaction: { before: number; after?: number; at: string } | undefined;
  private chain: string[] = [];
  private userMessages = new Set<string>();
  /** Public user message IDs are engine command IDs; the SDK transcript uses native UUIDs. */
  private commandMessages = new Map<string, string>();

  constructor(spec: SpawnSpec, host: DriverHost, resume?: string, history: HistoryMessage[] = []) {
    this.spec = { ...spec, env: { ...spec.env } };
    this.host = host;
    this.id = resume ?? randomUUID();
    this.nativeConfirmed = !!resume;
    // Read only this native session's main conversation, without replaying old
    // content as new timeline events or retaining transcript contents in memory.
    for (const m of history) {
      if (m.parent_tool_use_id || (m.type !== 'user' && m.type !== 'assistant')) continue;
      if (!this.chain.includes(m.uuid)) this.chain.push(m.uuid);
      if (m.type === 'user') this.userMessages.add(m.uuid);
    }
    this.tree = new ProcessTree(host);
    this.open(resume);
  }
  // The UUID supplied to a fresh SDK process is only a plan until native init.
  // Core must not persist it as a resumable session if this process never receives a turn.
  get nativeId(): string { return this.nativeConfirmed ? this.id : ''; }
  get driverGeneration(): number { return this.spec.driverGeneration + this.incarnations - 1; }
  private emit(event: DriverEvent): void { if (!this.closed) this.output.push(event); }
  private item(item: TimelineItem): void { this.emit({ type: 'timeline', turnId: this.turn, item }); }
  private begin(commandId?: string): void {
    this.turn = randomUUID();
    this.emit({ type: 'turn_started', turnId: this.turn, commandId });
  }
  private finish(type: 'turn_completed' | 'turn_failed' | 'turn_canceled', reason?: string): void {
    if (!this.turn) return;
    for (const [callId, name] of this.tools) this.item({ type: 'tool_call', callId, name, detail: this.details.get(callId), status: type === 'turn_completed' ? 'completed' : type === 'turn_canceled' ? 'canceled' : 'failed' });
    this.tools.clear(); this.details.clear();
    this.emit({ type, turnId: this.turn, reason });
    this.turn = null;
  }
  private open(resume?: string, at?: string): void {
    const generation = ++this.boot;
    this.incarnations++;
    this.input = new AsyncQueue<SDKUserMessage>();
    const childEnv = { ...this.spec.env, CLAUDE_CODE_FORK_SUBAGENT: '0' };
    const mcpServers: NonNullable<Options['mcpServers']> = {};
    for (const { name, ...server } of this.spec.mcp) mcpServers[name] = server;
    this.q = query({
      prompt: this.input,
      options: {
        cwd: this.spec.cwd, model: this.spec.model, ...thinking(this.spec.thinking),
        permissionMode: mode(this.spec.mode), allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: this.spec.binary,
        settingSources: this.spec.settingSources, strictMcpConfig: true, mcpServers,
        ...(this.spec.systemPrompt !== undefined ? { systemPrompt: this.spec.systemPromptMode === 'replace'
          ? this.spec.systemPrompt : { type: 'preset' as const, preset: 'claude_code' as const, append: this.spec.systemPrompt } } : {}),
        disallowedTools: this.spec.disallowedTools,
        extraArgs: this.spec.extraArgs,
        includePartialMessages: true, env: childEnv,
        ...(resume ? { resume, ...(at ? { forkSession: true, resumeSessionAt: at, sessionId: this.id } : {}) } : { sessionId: this.id }),
        hooks: {
          PreToolUse: [{ hooks: [async input => {
            if (input.hook_event_name !== 'PreToolUse') return {};
            try {
              const verdict = await this.host.gate(actionFor(input.tool_name, input.tool_input, input.cwd || this.spec.cwd),
                { tool: input.tool_name, input: input.tool_input });
              if (verdict.allow) return {};
              return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
                permissionDecisionReason: `${verdict.reason}${verdict.awaitingUser ? `; awaiting_user ${verdict.awaitingUser}` : ''}` } };
            } catch {
              return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'policy unavailable; denied' } };
            }
          }] }],
        },
        canUseTool: async (tool, input) => {
          try {
            const answer = await this.host.prompt({ kind: tool, summary: `Allow ${tool}?`, allowedDecisions: ['allow', 'deny'], detail: input, turnId: this.turn });
            return answer.decision === 'allow' ? { behavior: 'allow', updatedInput: input }
              : { behavior: 'deny', message: answer.message ?? 'permission denied' };
          } catch { return { behavior: 'deny', message: 'permission host unavailable' }; }
        },
        onElicitation: async request => {
          const serverName = typeof request.serverName === 'string' && /^[\w-]{1,128}$/.test(request.serverName) ? request.serverName : 'unknown';
          const mode = request.mode === undefined || request.mode === 'form' ? 'form' : request.mode === 'url' ? 'url' : 'unknown';
          this.item({ type: 'other', raw: { subtype: 'notice', kind: 'mcp_elicitation', serverName, mode,
            text: 'declined: elicitation not supported' } });
          return { action: 'decline' };
        },
        // SDK-injected environment is deliberately discarded. Never log stderr or raw SDK errors.
        spawnClaudeCodeProcess: request => {
          const child = spawn(request.command, request.args, {
            cwd: request.cwd ?? this.spec.cwd, env: childEnv, shell: false,
            stdio: ['pipe', 'pipe', 'pipe'], signal: request.signal,
          });
          if (child.pid) this.tree.add(child.pid, 'cli');
          child.stderr.resume();
          child.once('exit', (code, signal) => {
            if (generation !== this.boot || this.closed) return;
            this.broken = true;
            this.finish('turn_failed', 'claude process exited');
            this.releaseReceipt?.();
            this.emit({ type: 'exited', code, signal });
          });
          return child;
        },
      },
    });
    const q = this.q;
    this.pump = (async () => {
      try {
        for await (const message of q) if (generation === this.boot && !this.closed) await this.handle(message);
      } catch {
        if (generation === this.boot && !this.closed) {
          this.broken = true;
          this.finish('turn_failed', 'Claude transport failed');
          this.releaseReceipt?.();
        }
      }
    })();
  }
  private async handle(message: SDKMessage): Promise<void> {
    const m = message;
    if ('session_id' in m && m.session_id && m.session_id !== this.id) this.id = m.session_id;
    if ('parent_tool_use_id' in m && m.parent_tool_use_id) return;
    if ((m.type === 'user' || m.type === 'assistant') && m.uuid && !this.chain.includes(m.uuid)) this.chain.push(m.uuid);
    if (m.type === 'system') {
      if (m.subtype === 'init') {
        this.nativeConfirmed = true;
        this.emit({ type: 'session_started', nativeId: this.id });
        this.runtime(m.model);
        // Expose only the advertised tool names, not account/configuration fields from init.
        this.item({ type: 'other', raw: { subtype: 'init', tools: [...m.tools] } });
      }
      if (m.subtype === 'compact_boundary') {
        this.readFiles.clear();
        const meta = m.compact_metadata;
        this.compaction = { before: count(meta.pre_tokens), ...(meta.post_tokens === undefined ? {} : { after: count(meta.post_tokens) }), at: new Date().toISOString() };
        this.item({ type: 'compaction', status: 'completed', before: this.compaction.before, after: this.compaction.after,
          ...(this.compaction.after === undefined ? {} : { savedTokens: Math.max(0, this.compaction.before - this.compaction.after) }) });
      }
      if (m.subtype === 'hook_started' || m.subtype === 'hook_response') this.item({ type: 'other', raw: { subtype: m.subtype, hookName: m.hook_name, hookEvent: m.hook_event } });
      return;
    }
    if (m.type === 'stream_event') {
      const event = m.event;
      if (event.type === 'message_start') this.currentMessage = event.message.id;
      if (event.type === 'content_block_delta' && !this.cancelTurn) {
        if (!this.turn) this.begin();
        if (event.delta.type === 'text_delta') {
          if (this.currentMessage) this.streamed.add(this.currentMessage);
          this.item({ type: 'assistant_message', text: event.delta.text, messageId: this.currentMessage, delta: true });
        } else if (event.delta.type === 'thinking_delta') this.item({ type: 'reasoning', text: event.delta.thinking });
      }
      return;
    }
    if (m.type === 'assistant' && !this.cancelTurn) {
      if (!this.turn) this.begin();
      this.lastModel = m.message.model ?? this.spec.model;
      this.runtime(this.lastModel);
      this.lastInput = count(m.message.usage?.input_tokens) + count(m.message.usage?.cache_read_input_tokens) + count(m.message.usage?.cache_creation_input_tokens);
      if (m.context_usage) this.context = claudeContext(m.context_usage, this.context?.context.lastCompaction);
      for (const block of m.message.content) {
        if (block.type === 'text' && !this.streamed.has(m.message.id)) this.item({ type: 'assistant_message', text: block.text, messageId: m.uuid });
        if (block.type === 'thinking' && !this.streamed.has(m.message.id)) this.item({ type: 'reasoning', text: block.thinking });
        if (block.type === 'tool_use') {
          this.readFiles.start(block.id, block.name, block.input, this.spec.cwd);
          const detail = toolDetail(block.name, block.input, this.spec.cwd);
          this.tools.set(block.id, detail.name); this.details.set(block.id, detail.detail);
          this.item({ type: 'tool_call', callId: block.id, ...detail, status: 'running' });
        }
      }
      return;
    }
    if (m.type === 'user' && Array.isArray(m.message.content)) {
      for (const block of m.message.content) {
        if (block.type === 'tool_result') {
          this.readFiles.finish(block.tool_use_id, block.content, block.is_error);
          const name = this.tools.get(block.tool_use_id);
          if (name) this.item({ type: 'tool_call', callId: block.tool_use_id, name, detail: this.details.get(block.tool_use_id), status: block.is_error ? 'failed' : 'completed' });
          this.tools.delete(block.tool_use_id); this.details.delete(block.tool_use_id);
        }
      }
      return;
    }
    if (m.type === 'result') {
      const max = count(m.modelUsage?.[this.lastModel]?.contextWindow ?? Object.values(m.modelUsage ?? {})[0]?.contextWindow);
      if (max && this.lastInput) this.context = { usage: { used: this.lastInput, max }, context: breakdown(this.lastInput, [], [], this.context?.context.lastCompaction) };
      // SDK control data is local to this live session; no transcript lookup and no extra model turn.
      try { this.context = claudeContext(await within(this.q.getContextUsage(), 2000), this.context?.context.lastCompaction) ?? this.context; } catch { /* Older CLIs retain the last API request's exact usage. */ }
      if (this.context) this.context = this.readFiles.project(this.context);
      if (this.context && this.compaction) {
        const { before, after, at } = this.compaction;
        if (after !== undefined) this.context.context.lastCompaction = { savedTokens: Math.max(0, before - after), at };
        this.compaction = undefined;
      }
      this.item({ type: 'usage', inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens, costUsd: m.total_cost_usd, ...this.context });
      if (this.cancelTurn) {
        this.finish('turn_canceled', 'interrupted');
        this.cancelTurn = null;
        this.releaseReceipt?.();
        this.releaseReceipt = undefined;
      } else this.finish(m.subtype === 'success' && !m.is_error ? 'turn_completed' : 'turn_failed', m.subtype);
    }
  }
  private runtime(model = this.spec.model): void {
    this.emit({ type: 'settings_changed', runtimeModel: model, runtimeThinking: this.spec.thinking ?? null, runtimeMode: this.spec.mode ?? 'default' });
  }
  async supportedCommands(): Promise<{ name: string; description: string }[]> { return this.q.supportedCommands(); }
  async send(m: Outgoing): Promise<ProviderAck> {
    if (this.closed || (this.broken && !this.respawn)) return { accepted: false, error: 'Claude session unavailable; resume required' };
    if (this.respawn) {
      this.broken = false;
      this.respawn = false;
      this.open(this.nativeConfirmed ? this.id : undefined);
      try { await within(this.q.supportedCommands(), 30_000); }
      catch { await this.retire(); return { accepted: false, error: 'Claude resume failed' }; }
    }
    if (this.cancelTurn) {
      try { await within(this.terminalReceipt, 2000); }
      catch { await this.retire(); return this.send(m); }
    }
    if (this.turn && m.delivery !== 'steer') return { accepted: false, error: 'turn already running' };
    try {
      if (!this.turn && this.pendingSettings) await this.applySettings();
      if (!this.turn) this.runtime();
      const content: SDKUserMessage['message']['content'] = [{ type: 'text', text: m.text }];
      for (const image of m.images ?? []) {
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(image.mime)) throw new Error('unsupported image type');
        const bytes = await readFile(image.path);
        content.push({ type: 'image', source: { type: 'base64', media_type: image.mime as 'image/png', data: bytes.toString('base64') } });
      }
      const steered = this.turn !== null;
      const uuid = nativeMessageId(m.commandId);
      if (!steered) this.begin(m.commandId);
      this.chain.push(uuid);
      this.commandMessages.set(m.commandId, uuid);
      this.userMessages.add(uuid);
      this.item({ type: 'user_message', text: m.text, messageId: m.commandId, clientMessageId: m.clientMessageId ?? null });
      this.input.push({ type: 'user', uuid, session_id: this.id, parent_tool_use_id: null, message: { role: 'user', content }, ...(steered ? { priority: 'next' } : {}) });
      if (steered) this.emit({ type: 'steered', turnId: this.turn, commandId: m.commandId });
      return { accepted: true, nativeTurnId: this.turn ?? undefined, steered };
    } catch { return { accepted: false, error: 'Claude send failed' }; }
  }
  async interrupt(): Promise<void> {
    if (!this.turn || this.cancelTurn) return;
    this.tree.sample();
    this.cancelTurn = this.turn;
    this.terminalReceipt = new Promise(resolve => { this.releaseReceipt = resolve; });
    await within(this.q.interrupt(), 1900);
    this.finish('turn_canceled', 'interrupted');
  }
  async hardStop(): Promise<{ killed: number; alive: number }> {
    this.tree.sample();
    const interrupt = within(this.interrupt(), 2000).then(() => true, () => false);
    const result = await this.tree.stop(true);
    if (!await interrupt) {
      const retired = await this.retire();
      this.finish('turn_canceled', 'hard stop');
      return { killed: result.killed + retired.killed, alive: retired.alive };
    }
    // The CLI may have launched another tool while its interrupt was in flight.
    const afterReceipt = await this.tree.stop(true);
    return { killed: result.killed + afterReceipt.killed, alive: afterReceipt.alive };
  }
  /** Retire an unresponsive CLI; resume its native session on the next send. */
  private async retire(): Promise<{ killed: number; alive: number }> {
    this.boot++;
    this.input.end();
    this.q.close();
    const result = await this.tree.stop(false);
    await this.pump;
    this.broken = true;
    this.respawn = true;
    this.cancelTurn = null;
    this.releaseReceipt?.();
    this.releaseReceipt = undefined;
    return result;
  }
  async setSettings(s: Settings): Promise<void> {
    if (s.mode !== undefined) mode(s.mode);
    if (s.thinking !== undefined) thinking(s.thinking);
    this.pendingSettings = { ...this.pendingSettings, ...s };
  }
  private async applySettings(): Promise<void> {
    const s = this.pendingSettings!;
    this.pendingSettings = undefined;
    try {
      if (s.model !== undefined) await this.q.setModel(s.model);
      if (s.mode !== undefined) await this.q.setPermissionMode(mode(s.mode));
      if (s.thinking !== undefined) {
        const t = thinking(s.thinking);
        await this.q.setMaxThinkingTokens(t.thinking?.type === 'disabled' ? 0 : t.thinking?.type === 'enabled' ? t.thinking.budgetTokens ?? null : null);
        if (t.effort) await this.q.applyFlagSettings({ effortLevel: t.effort });
      }
      Object.assign(this.spec, s);
      this.emit({ type: 'settings_changed', ...s });
    } catch (error) {
      // A control can fail after earlier controls succeeded. Resume the last committed
      // settings in a fresh process rather than retrying a poisoned partial batch.
      await this.retire();
      throw error;
    }
  }
  async rewind(messageId: string): Promise<{ nativeId: string }> {
    if (this.turn || this.cancelTurn) throw new Error('rewind requires idle');
    const nativeMessage = this.commandMessages.get(messageId) ?? nativeMessageId(messageId);
    const index = this.userMessages.has(nativeMessage) ? this.chain.indexOf(nativeMessage) : -1;
    if (index < 0) throw new Error('rewind message not observed in this session');
    const preceding = index ? this.chain[index - 1] : undefined;
    const old = this.id;
    this.boot++;
    this.input.end();
    this.q.close();
    await this.tree.stop(false);
    await this.pump;
    this.id = randomUUID();
    this.nativeConfirmed = !!preceding;
    this.chain = this.chain.slice(0, index);
    const retained = new Set(this.chain);
    this.userMessages = new Set([...this.userMessages].filter(uuid => retained.has(uuid)));
    for (const [commandId, uuid] of this.commandMessages) if (!retained.has(uuid)) this.commandMessages.delete(commandId);
    this.streamed.clear();
    this.readFiles.clear();
    this.broken = false;
    this.open(preceding ? old : undefined, preceding);
    await within(this.q.supportedCommands(), 30_000);
    return { nativeId: this.nativeId };
  }
  pids(): number[] { return this.tree.pids(); }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.tree.sample();
    this.input.end();
    this.q.close();
    try { await this.tree.stop(false); await this.pump; }
    finally { this.tree.dispose(); this.output.end(); this.releaseReceipt?.(); }
  }
}

export function createClaudeDriver(opts: {
  binary?: string;
  /** Synthetic transports may supply their own transcript reader. */
  readHistory?: ReadHistory;
} = {}): Omit<Driver, 'start'> & { start(spec: SpawnSpec, host: DriverHost, resume?: string): Promise<ClaudeSession> } {
  return {
    provider: 'claude',
    defaultMode: 'default', modes: [...MODES].map(id => ({ id, label: ({ default: 'Normal', acceptEdits: 'Accept edits', bypassPermissions: 'Bypass permissions', plan: 'Plan', dontAsk: 'Do not ask', auto: 'Auto' } as Record<string, string>)[id] })),
    models: modelCatalog(() => readClaudeModels(opts.binary ?? resolveClaudeBinary())),
    caps: { steer: true, interrupt: true, rewind: 'conversation', compact: true, gate: 'pretooluse', images: true },
    async start(spec, host, resume) {
      mode(spec.mode); thinking(spec.thinking);
      let history: HistoryMessage[] = [];
      try {
        // Always scope SDK transcript lookup to the admitted agent's cwd/session.
        if (resume) history = await within((opts.readHistory ?? getSessionMessages)(resume, { dir: spec.cwd }), 30_000);
      } catch { throw new Error('Claude history unavailable'); }
      const session = new LiveSession({ ...spec, binary: spec.binary ?? opts.binary ?? resolveClaudeBinary() }, host, resume || undefined, history);
      try { await within(session.supportedCommands(), 30_000); return session; }
      catch { await session.close(); throw new Error('Claude initialization failed'); }
    },
  };
}
