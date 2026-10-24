// Workers may ADD optional fields. Renaming, removing or retyping a field is a contract change:
// make it only if the WP cannot work otherwise, and list it under CONTRACT CHANGES in REPORT.md.

// ───────────── identities and cursors

export type Provider = 'claude' | 'codex' | 'agy';
export type AgentState = 'starting' | 'idle' | 'running' | 'stopped' | 'archived' | 'error' | 'writer_locked';

/** Per-agent stream cursor. `seq` strictly increases; `epoch` changes only on rewind or reset (D5). */
export type Cursor = { epoch: string; seq: number };

export type Principal =
  | { kind: 'console'; name: 'console' }
  | { kind: 'cli'; name: 'cli' }
  | { kind: 'user-channel'; name: `user-channel:${string}`; targets: string[] }
  | { kind: 'agent'; name: `agent:${string}`; agentId: string };

export type Origin = { principal: 'user' | 'agent' | 'system'; channel: string; via?: string };

// ───────────── API requests (contract)

export type CreateIntent = {
  requestId: string; provider: Provider; model: string; thinking?: string; mode?: string;
  cwd: string; title: string; prompt?: string; env?: Record<string, string>; labels?: Record<string, string>;
  parentId?: string; launcherId?: string; profile: string; predecessorId?: string;
  /** Opaque to the core; the adapter interprets it (plugin-defined fields). */
  identity?: Record<string, unknown>;
};

export type Delivery = 'steer' | 'queue' | 'when_idle' | 'interrupt';
export type SendRequest = {
  requestId: string; text: string; images?: string[]; attachments?: string[];
  delivery?: Delivery;            // default 'steer'
  clientMessageId?: string;
};

export type Refusal = { code: string; rule: string; reason: string };
export type Admit = { ok: true; env?: Record<string, string>; labels?: Record<string, string>; identity?: Record<string, unknown> };

/** Stable error codes; HTTP status in parentheses. */
export const Codes = {
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT', // 409
  PERMISSION_STALE: 'PERMISSION_STALE',         // 409
  INTERRUPT_FORBIDDEN: 'INTERRUPT_FORBIDDEN',   // 403
  ARCHIVED: 'ARCHIVED',                         // 409
  WRITER_LOCKED: 'WRITER_LOCKED',               // 409
  STORAGE_FULL: 'STORAGE_FULL',                 // 507
  DRIVER_CONTRACT: 'DRIVER_CONTRACT',           // 503
  DRIVER_DISABLED: 'DRIVER_DISABLED',           // 503
  QUEUE_FULL: 'QUEUE_FULL',                     // 429
  ADMISSION_TIMEOUT: 'ADMISSION_TIMEOUT',       // 503, fail-closed
  ADAPTER_ERROR: 'ADAPTER_ERROR',               // 503, fail-closed
  UNAUTHORIZED: 'UNAUTHORIZED',                 // 401
  FORBIDDEN: 'FORBIDDEN',                       // 403
  NOT_FOUND: 'NOT_FOUND',                       // 404
  LIMIT: 'LIMIT',                               // 413/429 (uploads, terminals)
  DRAINING: 'DRAINING',                         // 202 journaled, waits
} as const;

// ───────────── commands and journal (contract)

export type CommandKind = 'create' | 'send' | 'cancel' | 'withdraw' | 'settings' | 'rewind' | 'stop' | 'archive' | 'reopen'
  | 'permission' | 'queue_resume' | 'terminal' | 'user_say';
export type CommandState = 'accepted' | 'queued' | 'dispatching' | 'provider_acknowledged' | 'completed' | 'failed'
  | 'canceled' | 'delivery_unknown' | 'withdrawn';

/** Journal event `type` vocabulary (Frame.type). Drivers' DriverEvent types map 1:1 where names match;
 *  `timeline` frames carry `item: TimelineItem`. Add new types here only via CONTRACT CHANGES. */
export const EventTypes = [
  'agent_created', 'session_started', 'turn_started', 'turn_completed', 'turn_failed', 'turn_canceled', 'steered', 'timeline',
  'command_state',        // {commandId, state: CommandState} on every command transition (provider_acknowledged = the wake receipt point)
  'message_ambiguous',    // {commandId}: crash between dispatch and provider ack
  'permission_requested', // {permissionId, turnId, driverGeneration, requestDigest, summary, allowedDecisions, expiresAt}
  'permission_decided',   // {permissionId, decision, decidedBy}
  'gate_denied',          // {rule, reason, tool}
  'awaiting_user',       // {approvalId, category, rule, tool}
  'approval_consumed',    // {approvalId}
  'settings_changed', 'rewound', 'stopped', 'archived', 'reopened', 'queue_paused', 'queue_resumed', 'withdrawn',
  'exited', 'daemon_restart',
] as const;

/** One journaled event as published on /v1/stream (contract). */
export type Frame = {
  agentId: string; epoch: string; seq: number; ts: string; driverGeneration: number;
  turnId: string | null; commandId?: string; type: string; origin?: Origin; stale?: boolean;
  [k: string]: unknown;
};

// ───────────── drivers (contract)

export type Caps = {
  steer: boolean; interrupt: boolean; rewind: 'conversation' | 'none'; compact: boolean;
  gate: 'pretooluse' | 'app-server-approvals' | 'none'; images: boolean;
};

export type McpServerSpec =
  | { name: string; type: 'http'; url: string; headers?: Record<string, string> }
  | { name: string; type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };

export type SpawnSpec = {
  agentId: string; driverGeneration: number; cwd: string; model: string; thinking?: string; mode?: string;
  /** Exactly the child env: allowlist + intent env + identity (core/env.ts builds it). */
  env: Record<string, string>;
  profile: string; mcp: McpServerSpec[]; settingSources: ('user' | 'project')[]; codexHome?: string;
  /** Absolute path of the provider binary (claude native binary, codex). */
  binary?: string;
  /** Role prompt from the adapter (beforeSpawn). claude: appended to the Claude Code preset system prompt unless
   *  systemPromptMode is 'replace'; codex: developer instructions for the thread. */
  systemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';
  /** Tools the CLI must not offer at all (claude `disallowedTools`; codex: driver maps what it can, ignores the rest). */
  disallowedTools?: string[];
  /** Extra CLI flags (claude: SDK `extraArgs`, e.g. {'disable-slash-commands': null}); codex: config overrides `-c k=v`. */
  extraArgs?: Record<string, string | null>;
};

/** A tool call or command the driver must clear with the policy engine before it runs (contract choke point 2). */
export type Action = {
  kind: 'shell' | 'read' | 'write' | 'delete' | 'mcp' | 'network'; tool: string;
  command?: string; paths: string[]; cwd: string;
};
export type UserCategory = 'money' | 'secrets' | 'publish' | 'irreversible_delete' | 'standing_service';
export type GateDecision = { decision: 'allow' | 'deny' | 'approval'; category?: UserCategory; rule: string; reason: string };

/** What the policy engine answers a driver. `awaiting_user` is a deny that carries an approval id (D13). */
export type GateVerdict =
  | { allow: true; rule: string; consumedApprovalId?: string }
  | { allow: false; rule: string; reason: string; awaitingUser?: string };

/** An ordinary permission prompt (not an user gate), contract "Permission prompts". */
export type PermissionRequest = {
  kind: string; summary: string; allowedDecisions: string[]; detail?: unknown; turnId: string | null;
};
export type PermissionAnswer = { decision: string; message?: string };

/** Callbacks the core hands a driver at start. The driver never talks to the policy engine any other way. */
export interface DriverHost {
  /** Every tool call, reads included (claude PreToolUse, codex approvals). Never throws: an engine error resolves as a deny. */
  gate(action: Action, raw: { tool: string; input: unknown }): Promise<GateVerdict>;
  /** Ordinary prompts: the core journals permission_requested, waits for a CAS decision or the 30 min expiry (deny). */
  prompt(req: PermissionRequest): Promise<PermissionAnswer>;
  /** Records a process the driver started (CLI or tool tree root) for `procs` and hardStop. */
  trackPid(pid: number, role: 'cli' | 'tool'): void;
  log(msg: string, extra?: Record<string, unknown>): void;
}

export type Outgoing = {
  commandId: string; text: string; images?: { path: string; mime: string }[];
  delivery: 'steer' | 'start';  // 'start' when idle; core decides queue/when_idle/interrupt before the driver sees it
  clientMessageId?: string; origin?: Origin;
};
export type ProviderAck = { accepted: true; nativeTurnId?: string; steered?: boolean } | { accepted: false; error: string };

export type ModelInfo = { id: string; aliases?: string[]; label?: string; thinking?: string[]; defaultThinking?: string | null; isDefault?: boolean };
export type ContextUsage = { used: number; max: number };
/** Only provider-reported counts and safe paths; never provider transcripts. */
export type ContextBreakdown = {
  categories: { name: string; tokens: number }[]; files: { path: string; tokens: number }[];
  lastCompaction: { savedTokens: number; at: string } | null;
};

export type TimelineItem =
  | { type: 'user_message'; text: string; messageId: string | null; clientMessageId: string | null }
  | { type: 'assistant_message'; text: string; messageId: string | null; delta?: boolean }
  | { type: 'tool_call'; callId: string | null; name: string | null; status: string; detail?: unknown }
  | { type: 'reasoning'; text?: string }
  | { type: 'compaction'; status: string; before?: number; after?: number; savedTokens?: number }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number; raw?: unknown; usage?: ContextUsage; context?: ContextBreakdown }
  | { type: 'other'; raw?: unknown };

/** Normalized driver output; the core journals each with the session's driverGeneration. */
export type DriverEvent =
  | { type: 'session_started'; nativeId: string }
  | { type: 'turn_started'; turnId: string | null; commandId?: string }
  | { type: 'turn_completed' | 'turn_failed' | 'turn_canceled'; turnId: string | null; reason?: string; error?: string }
  | { type: 'steered'; turnId: string | null; commandId: string }
  | { type: 'timeline'; turnId: string | null; item: TimelineItem }
  | { type: 'settings_changed'; model?: string; thinking?: string; mode?: string; runtimeModel?: string; runtimeThinking?: string | null; runtimeMode?: string }
  | { type: 'exited'; code: number | null; signal?: string | null };

export interface Session {
  readonly nativeId: string; readonly driverGeneration: number;
  send(m: Outgoing): Promise<ProviderAck>;
  interrupt(): Promise<void>;
  /** Kills the tool tree (SIGINT, SIGTERM at 2 s, SIGKILL at 5 s; taskkill /T /F on Windows); resolves once verified. */
  hardStop(): Promise<{ killed: number; alive: number }>;
  rewind?(messageId: string): Promise<{ nativeId: string }>;
  setSettings?(s: { model?: string; thinking?: string; mode?: string }): Promise<void>;
  readonly events: AsyncIterable<DriverEvent>;
  /** Pids this session owns now (CLI and tool roots). */
  pids(): number[];
  close(): Promise<void>;
}

export interface Driver {
  readonly provider: Provider; readonly caps: Caps;
  /** Deliberate provider exclusion; failed enabled self-tests are never disabled. */
  disabled?: string;
  /** Boot-time contract check (codex: approval shapes). Failing → profiles on this driver get DRIVER_CONTRACT. */
  selfTest?(): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** resumeNativeId: engine-created sessions only. */
  start(spec: SpawnSpec, host: DriverHost, resumeNativeId?: string): Promise<Session>;
  models?(): Promise<ModelInfo[]>;
  readonly modes?: { id: string; label: string }[];
  readonly defaultMode?: string;
}

// ───────────── plugin / adapter seam (contract)

export type Profile = {
  name: string; tools: string[]; interrupt: boolean; settingSources: ('user' | 'project')[];
  mcpServers?: string[]; deny?: string[]; providers?: Provider[];
};

export type AgentRecord = {
  id: string; provider: Provider; model: string; thinking?: string; mode?: string; cwd: string; title: string;
  labels: Record<string, string>; parentId?: string; launcherId?: string; profile: string;
  identity?: Record<string, unknown>; state: AgentState; epoch: string; driverGeneration: number;
  predecessorId?: string; successorId?: string; createdAt: string; archivedAt?: string;
  runtimeModel?: string | null; runtimeThinking?: string | null; runtimeMode?: string | null;
  modes?: { id: string; label: string }[]; usage?: ContextUsage | null; context?: ContextBreakdown | null;
};

export interface OutboxWriter {
  /** Adds an outbox row in the current transaction. `key` is the idempotency key (UNIQUE). */
  put(row: { key: string; target: string; path: string; body: unknown }): void;
}

export type McpTool = {
  name: string; description: string; inputSchema: Record<string, unknown>;
  call(agent: AgentRecord, args: Record<string, unknown>): Promise<unknown>;
};

export interface OutboxTarget {
  deliver(row: { key: string; path: string; body: unknown; attempts: number }): Promise<'delivered' | 'retry' | 'drop'>;
}

export interface BootContext {
  engineVersion: string; host: string; stateDir: string;
  /** In-process core, e.g. for wakes (`send` with delivery 'when_idle') and status reads. */
  core?: EngineCore;
  outbox: OutboxWriter;
  log(msg: string, extra?: Record<string, unknown>): void;
}

export interface EnginePlugin {
  name: string;
  profiles(): Record<string, Profile>;
  beforeCreate(i: CreateIntent, p: Principal): Promise<Admit | Refusal>;   // 10 s budget, fail-closed
  beforeSend(a: AgentRecord, m: SendRequest, p: Principal): Promise<Admit | Refusal>;
  /** Before the irreversible supersession fence: the adapter proves its authority already links a→successorId
   * . Absent: no check beyond the core's principal rule. */
  beforeSupersede?(a: AgentRecord, successorId: string, p: Principal): Promise<Admit | Refusal>;
  beforeSpawn(a: AgentRecord, s: SpawnSpec): Promise<SpawnSpec>;
  classify(a: AgentRecord, x: Action): Promise<GateDecision | null>;
  tools(): McpTool[];
  mcpServers(a: AgentRecord): McpServerSpec[];
  onEvent(f: Frame, tx: OutboxWriter): void;                               // inside the commit; outbox rows only
  onBoot(ctx: BootContext): Promise<void>;
  /** Authenticated outbox delivery (S2-2). For a row whose `target` is a key here, the core's pump calls `deliver`
   *  instead of its own HTTP POST, keeping ordering per target, backoff and at-least-once semantics; the adapter attaches
   *  its own credentials and may persist what the response carries (e.g. a registration token) before resolving
   *  'delivered'. 'retry' = transient (backoff); 'drop' = permanent (row marked failed, logged by key only).
   *  A throw counts as 'retry'. Targets not listed here keep the core's plain HTTP delivery. */
  outboxTargets?(): Record<string, OutboxTarget>;
  /** Slot ③ state for hooks (`/state/<slot>` and the loopback compat route `/state/<agentId>` on the MCP listener).
   *  `search` is the raw query string (e.g. `?source=startup`). Absent → the core's minimal agent record. */
  state?(agent: AgentRecord, search: string): Promise<{ status: number; data: unknown }>;
  /** Called once on artemisd shutdown (SIGTERM, boot failure after onBoot) before the db closes; 10 s budget. */
  onShutdown?(): Promise<void>;
  /** User approvals (D13/D14): the adapter files a card and reports the user's decision. Optional in Stage 1 stubs. */
  fileApproval?(req: { approvalId: string; agent: AgentRecord; action: Action; category: UserCategory; scopeHash: string }): Promise<void>;
  approvalStatus?(approvalId: string): Promise<'pending' | 'approved' | 'denied' | 'expired'>;
}

// ───────────── terminals (contract)

export type TerminalUser = `agent:${string}` | 'console';
export type TerminalRecord = {
  id: string; user: TerminalUser; agentId?: string; cwd: string; cols: number; rows: number;
  generation: number; title?: string; createdAt: string; closedAt?: string; exitCode?: number | null;
};
export const TERMINAL_LIMITS = {
  userTerminals: 8, agentTerminals: 8, sessions: 16, clientsPerTerminal: 2, inputBytes: 16 * 1024, queuedBytes: 256 * 1024,
  maxRows: 500, maxCols: 1000, listed: 100, restoreLines: 5000,
} as const;
/** Binary frame tags on WS /v1/terminals/{id}/io. */
export const TermFrame = { output: 0x01, input: 0x02, resize: 0x03, restore: 0x04, exit: 0x05 } as const;

// ───────────── fixed ports and paths (contract)

export const DEFAULT_API_PORT = 47160;
export const DEFAULT_MCP_PORT = 47161;


export class EngineError extends Error {
  code: string; status: number; rule?: string;
  constructor(code: string, status: number, message: string, rule?: string) {
    super(message); this.code = code; this.status = status; this.rule = rule;
  }
}

/** Subset of node:sqlite's DatabaseSync that core/db.ts exposes (the one writer connection). */
export interface SqlStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
export interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  /** BEGIN IMMEDIATE … COMMIT; nested calls join the outer transaction. */
  tx<T>(fn: () => T): T;
}

/** Appends to an agent's journal inside the current transaction and publishes after COMMIT (core/journal/). */
export interface JournalWriter {
  append(agentId: string, ev: { type: string; turnId?: string | null; commandId?: string; origin?: Origin; [k: string]: unknown }): Frame;
}

/** core/policy/. Never throws; every error path resolves as a deny or Refusal (no fail-open). */
export interface PolicyEngine {
  gate(agent: AgentRecord, action: Action, raw: { tool: string; input: unknown }): Promise<GateVerdict>;
  admitCreate(i: CreateIntent, p: Principal): Promise<Admit | Refusal>;
  admitSend(a: AgentRecord, m: SendRequest, p: Principal): Promise<Admit | Refusal>;
  admitSupersede(a: AgentRecord, successorId: string, p: Principal): Promise<Admit | Refusal>;
  profile(name: string): Profile | null;
}

export type AgentFilter = { labels?: Record<string, string>; archived?: boolean; provider?: Provider; parentId?: string };
export type TimelineQuery = { after?: Cursor; kinds?: string[]; tail?: number; limit?: number };

/** What core/ implements for the MCP tools and other in-process callers. Errors throw EngineError. */
export interface EngineCore {
  create(i: CreateIntent, p: Principal): Promise<{ id: string; state: AgentState }>;
  send(agentId: string, m: SendRequest, p: Principal): Promise<{ commandId: string; state: CommandState }>;
  cancel(agentId: string, req: { requestId: string; hardStop?: boolean }, p: Principal): Promise<{ turnId: string | null; toolsRunning: number }>;
  get(agentId: string): AgentRecord | null;
  list(f: AgentFilter): AgentRecord[];
  waitFor(agentId: string, state: 'idle', timeoutMs: number): Promise<AgentRecord>;
  timeline(agentId: string, q: TimelineQuery): { frames: Frame[]; cursor: Cursor };
  archive(agentId: string, p: Principal): Promise<void>;
  terminals: TerminalService;
}

/** core/mcp/: the agent-only listener (contract). */
export interface McpService {
  /** Mints (or returns) the agent's 128-bit slot and the MCP server spec its driver passes to the CLI. */
  slotFor(agent: AgentRecord): McpServerSpec;
  revoke(agentId: string): void;
  start(): Promise<{ port: number }>;
  close(): Promise<void>;
}

/** A WebSocket as core/api/ hands it to the terminal service (binary frames, TermFrame tags). */
export interface TermSocket {
  send(buf: Uint8Array): void;
  onMessage(cb: (buf: Uint8Array) => void): void;
  onClose(cb: () => void): void;
  close(code?: number, reason?: string): void;
}

/** core/terminals/: records in the `terminals` table, PTYs in engine-ptyd. */
export interface TerminalService {
  create(req: { requestId: string; user: TerminalUser; cwd: string; cols: number; rows: number; title?: string }, p: Principal): Promise<TerminalRecord>;
  list(q: { user?: TerminalUser; cwd?: string; includeClosed?: boolean; cursor?: string; limit?: number }): { items: TerminalRecord[]; nextCursor?: string };
  kill(id: string, p: Principal): Promise<void>;
  /** Last `lines` of the headless screen as text (capture_terminal). */
  capture(id: string, lines: number): Promise<string>;
  attach(id: string, opts: { generation?: number; offset?: number; principal: Principal }, sock: TermSocket): void;
  /** Kills terminals of archived agents idle > 6 h (contract Cleanup). */
  sweep(now?: Date): Promise<number>;
  close(): Promise<void>;
}
