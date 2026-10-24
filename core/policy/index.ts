import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Action, AgentRecord, GateDecision, GateVerdict, EnginePlugin, JournalWriter, PolicyEngine, Profile, Refusal, SqlDb } from '../types.ts';
import { protectPlugin } from '../plugin.ts';
import { classifyUser, cleanupRoots } from './user.ts';

/** MCP resolves the same engine by the shared writer connection; absence is a denial. */
const engines = new WeakMap<SqlDb, PolicyEngine>();
export function policyFor(db: SqlDb): PolicyEngine | undefined { return engines.get(db); }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
export function scopeHash(action: Action, agent: AgentRecord): string {
  return createHash('sha256').update(canonical(action)).update('\0').update(agent.id).update('\0').update(agent.cwd).digest('hex');
}
function matches(rule: string, value: string): boolean {
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}
const unavailable = (): Refusal => ({ code: 'ADAPTER_ERROR', rule: 'policy.unavailable', reason: 'policy unavailable; refused' });

export function createPolicy(opts: { db: SqlDb; plugin: EnginePlugin; journal: JournalWriter; cleanupRoots?: string[]; log: (msg: string, extra?: Record<string, unknown>) => void }): PolicyEngine {
  const { db, journal } = opts;
  const roots = cleanupRoots(opts.cleanupRoots);
  const plugin = protectPlugin(opts.plugin);
  const locks = new Map<string, Promise<void>>();
  const USER_PENDING_EXPIRY = '9999-12-31T23:59:59.999Z';
  function profile(name: string): Profile | null {
    try { return plugin.profiles()[name] ?? null; } catch { return null; }
  }
  function denial(agent: AgentRecord, action: Action, rule: string, reason: string, approvalId?: string, category?: string): GateVerdict {
    db.tx(() => journal.append(agent.id, approvalId
      ? { type: 'awaiting_user', approvalId, category, rule, tool: action.tool }
      : { type: 'gate_denied', rule, reason, tool: action.tool }));
    return { allow: false, rule, reason, ...(approvalId ? { awaitingUser: approvalId } : {}) };
  }
  async function approval(agent: AgentRecord, action: Action, decision: GateDecision): Promise<GateVerdict> {
    if (!decision.category || decision.category === 'secrets') return denial(agent, action, decision.rule, decision.reason);
    const hash = scopeHash(action, agent);
    const previous = locks.get(hash) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>(resolve => { release = resolve; });
    locks.set(hash, lock);
    await previous;
    try {
      const now = new Date().toISOString();
      const pending = db.prepare(`SELECT id, state FROM permissions
        WHERE agent_id=? AND scope_hash=? AND kind=? AND state IN ('pending','approved') AND expires_at>?
        ORDER BY expires_at DESC LIMIT 1`).get(agent.id, hash, `user:${decision.category}`, now);
      if (pending) {
        const id = String(pending.id);
        // A database/API edit alone is never sufficient: consult the protected adapter every time.
        const status = await plugin.approvalStatus!(id);
        if (status === 'approved') {
          const consumed = db.tx(() => {
            db.prepare(`UPDATE permissions SET state='approved', decided_by='adapter:user'
              WHERE id=? AND state='pending' AND expires_at>?`).run(id, new Date().toISOString());
            const changed = db.prepare(`UPDATE permissions SET state='consumed'
              WHERE id=? AND agent_id=? AND scope_hash=? AND state='approved' AND expires_at>?`)
              .run(id, agent.id, hash, new Date().toISOString()).changes;
            if (Number(changed) !== 1) return false;
            journal.append(agent.id, { type: 'approval_consumed', approvalId: id });
            return true;
          });
          if (consumed) return { allow: true, rule: decision.rule, consumedApprovalId: id };
        } else if (status === 'denied' || status === 'expired') {
          db.tx(() => db.prepare(`UPDATE permissions SET state=? WHERE id=? AND state IN ('pending','approved')`).run(status, id));
          return denial(agent, action, decision.rule, `user approval ${status}`);
        }
        return denial(agent, action, decision.rule, decision.reason, id, decision.category);
      }
      const id = randomUUID();
      db.tx(() => db.prepare(`INSERT INTO permissions
        (id,agent_id,turn_id,driver_generation,kind,request_digest,scope_hash,nonce,state,decided_by,expires_at)
        VALUES (?,?,NULL,?,?,?,?,?,'pending',NULL,?)`).run(
        id, agent.id, agent.driverGeneration, `user:${decision.category}`, hash, hash,
        randomBytes(16).toString('hex'), USER_PENDING_EXPIRY));
      try { await plugin.fileApproval!({ approvalId: id, agent, action, category: decision.category, scopeHash: hash }); }
      catch {
        db.tx(() => db.prepare(`UPDATE permissions SET state='denied' WHERE id=? AND state='pending'`).run(id));
        return denial(agent, action, 'plugin.unavailable', 'user approval filing unavailable');
      }
      return denial(agent, action, decision.rule, decision.reason, id, decision.category);
    } finally {
      release();
      if (locks.get(hash) === lock) locks.delete(hash);
    }
  }
  const engine: PolicyEngine = {
    profile,
    async gate(agent, action, raw) {
      try {
        // Non-shell tools have no shell command. Bind their arguments into the action's
        // command slot so changing a write body/MCP amount cannot reuse an approval.
        if (action.kind !== 'shell') action = { ...action, command: canonical(raw.input) };
        const user = classifyUser(action, { cleanupRoots: roots, agentCwd: agent.cwd });
        if (user?.decision === 'deny') return denial(agent, action, user.rule, user.reason);
        const extra = await plugin.classify(agent, action);
        if (extra?.decision === 'deny') return denial(agent, action, extra.rule, extra.reason);
        if (extra?.category === 'secrets') return denial(agent, action, 'user.secrets', 'secret access is forbidden');
        const p = profile(agent.profile);
        if (!p) return denial(agent, action, 'profile.missing', 'profile unavailable');
        const candidates = [action.tool, action.kind, action.command ?? '', ...action.paths, ...action.paths.map(path => `${action.kind}:${path}`)];
        const rule = p.deny?.find(rule => candidates.some(value => matches(rule, value)));
        if (rule) return denial(agent, action, 'profile.deny', 'profile denies this action');
        const protectedDecision = user ?? (extra?.decision === 'approval' ? extra : null);
        if (protectedDecision) return await approval(agent, action, protectedDecision);
        return { allow: true, rule: extra?.rule ?? 'policy.allow' };
      } catch {
        try { return denial(agent, action, 'policy.unavailable', 'policy unavailable; denied'); }
        catch { return { allow: false, rule: 'policy.unavailable', reason: 'policy unavailable; denied' }; }
      }
    },
    async admitCreate(intent, principal) {
      try {
        const result = await plugin.beforeCreate(intent, principal);
        if (!('ok' in result)) return result;
        const p = profile(intent.profile);
        if (!p || (p.providers && !p.providers.includes(intent.provider))) return { code: 'FORBIDDEN', rule: 'profile.missing', reason: 'profile/provider unavailable' };
        return result;
      } catch { return unavailable(); }
    },
    async admitSend(agent, message, principal) {
      try {
        const result = await plugin.beforeSend(agent, message, principal);
        if (!('ok' in result)) return result;
        if (!profile(agent.profile)) return { code: 'FORBIDDEN', rule: 'profile.missing', reason: 'profile unavailable' };
        return result;
      } catch { return unavailable(); }
    },
    async admitSupersede(agent, successorId, principal) {
      try { return plugin.beforeSupersede ? await plugin.beforeSupersede(agent, successorId, principal) : { ok: true }; }
      catch { return unavailable(); }
    },
  };
  engines.set(db, engine);
  return engine;
}
