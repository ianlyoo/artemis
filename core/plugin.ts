import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EngineError, type Admit, type Refusal, type EnginePlugin, type Profile } from './types.ts';

const wrapped = new WeakMap<EnginePlugin, EnginePlugin>();
export const ADMISSION_BUDGET_MS = 10_000;
export const CLASSIFY_BUDGET_MS = 5_000;
const failure = (timeout = false): Refusal => ({
  code: timeout ? 'ADMISSION_TIMEOUT' : 'ADAPTER_ERROR',
  rule: 'plugin.unavailable', reason: timeout ? 'adapter deadline exceeded' : 'adapter unavailable',
});
class Deadline extends Error {}

/** A rejected adapter promise is always observed, including after a timeout. No raw errors are logged. */
export async function bounded<T>(operation: () => T | Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Deadline()), ms); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
function admission(value: Admit | Refusal): Admit | Refusal {
  if (value && 'ok' in value && value.ok === true) return value;
  if (value && 'code' in value && typeof value.code === 'string' && typeof value.rule === 'string' && typeof value.reason === 'string') return value;
  return failure();
}
function profiles(value: Record<string, Profile>): Record<string, Profile> {
  if (!value || typeof value !== 'object') throw new Error('invalid profiles');
  const result: Record<string, Profile> = Object.create(null);
  for (const [name, p] of Object.entries(value)) {
    if (p.name !== name || !Array.isArray(p.tools) || !p.tools.every(t => typeof t === 'string') ||
      typeof p.interrupt !== 'boolean' || !Array.isArray(p.settingSources) ||
      !p.settingSources.every(s => s === 'user' || s === 'project') ||
      (p.deny !== undefined && (!Array.isArray(p.deny) || !p.deny.every(d => typeof d === 'string')))) throw new Error('invalid profile');
    result[name] = structuredClone(p);
  }
  return result;
}

/** Typed fail-closed facade. Void/SpawnSpec methods throw sanitized errors, never return a usable fallback. */
export function protectPlugin(plugin: EnginePlugin): EnginePlugin {
  const cached = wrapped.get(plugin);
  if (cached) return cached;
  const safe: EnginePlugin = {
    name: typeof plugin.name === 'string' ? plugin.name : 'unavailable',
    profiles() { try { return profiles(plugin.profiles()); } catch { return Object.create(null); } },
    async beforeCreate(...args) {
      try { return admission(await bounded(() => plugin.beforeCreate(...args), ADMISSION_BUDGET_MS)); }
      catch (e) { return failure(e instanceof Deadline); }
    },
    async beforeSend(...args) {
      try { return admission(await bounded(() => plugin.beforeSend(...args), ADMISSION_BUDGET_MS)); }
      catch (e) { return failure(e instanceof Deadline); }
    },
    async beforeSpawn(...args) {
      try {
        const spec = await bounded(() => plugin.beforeSpawn(...args), ADMISSION_BUDGET_MS);
        if (!spec || !spec.env || !Array.isArray(spec.mcp)) throw new Error('invalid spawn spec');
        return spec;
      } catch { throw new EngineError('ADAPTER_ERROR', 503, 'adapter beforeSpawn unavailable'); }
    },
    async classify(...args) {
      try {
        const result = await bounded(() => plugin.classify(...args), CLASSIFY_BUDGET_MS);
        if (result === null) return null;
        if (!result || !['allow', 'deny', 'approval'].includes(result.decision) ||
          typeof result.rule !== 'string' || typeof result.reason !== 'string' ||
          (result.decision === 'approval' && !['money', 'secrets', 'publish', 'irreversible_delete', 'standing_service'].includes(result.category ?? '')))
          throw new Error('invalid classification');
        return result;
      } catch { return { decision: 'deny', rule: 'plugin.unavailable', reason: 'adapter classification unavailable' }; }
    },
    tools() {
      try {
        const tools = plugin.tools();
        if (!Array.isArray(tools) || tools.some(t => !t.name || typeof t.call !== 'function' || !t.inputSchema)) throw new Error('invalid tools');
        return tools.map(tool => ({ ...tool, async call(...args) {
          try { return await bounded(() => tool.call(...args), ADMISSION_BUDGET_MS); }
          catch { throw new EngineError('ADAPTER_ERROR', 503, 'adapter tool unavailable'); }
        } }));
      } catch { return []; }
    },
    mcpServers(agent) {
      try {
        const servers = plugin.mcpServers(agent);
        if (!Array.isArray(servers)) throw new Error('invalid servers');
        return structuredClone(servers);
      } catch { throw new EngineError('ADAPTER_ERROR', 503, 'adapter MCP configuration unavailable'); }
    },
    onEvent(...args) {
      try { plugin.onEvent(...args); }
      catch { throw new EngineError('ADAPTER_ERROR', 503, 'adapter event unavailable'); }
    },
    async onBoot(...args) {
      try { await bounded(() => plugin.onBoot(...args), ADMISSION_BUDGET_MS); }
      catch { throw new EngineError('ADAPTER_ERROR', 503, 'adapter boot unavailable'); }
    },
    async fileApproval(request) {
      if (!plugin.fileApproval) throw new EngineError('ADAPTER_ERROR', 503, 'user approval adapter unavailable');
      try { await bounded(() => plugin.fileApproval!(request), ADMISSION_BUDGET_MS); }
      catch { throw new EngineError('ADAPTER_ERROR', 503, 'user approval filing unavailable'); }
    },
    async approvalStatus(id) {
      if (!plugin.approvalStatus) return 'pending';
      try {
        const status = await bounded(() => plugin.approvalStatus!(id), CLASSIFY_BUDGET_MS);
        return ['pending', 'approved', 'denied', 'expired'].includes(status) ? status : 'denied';
      } catch { return 'denied'; }
    },
  };
  if (plugin.state !== undefined) safe.state = async (...args) => {
    try {
      const result = await bounded(() => plugin.state!(...args), ADMISSION_BUDGET_MS);
      if (!result || !Number.isInteger(result.status) || result.status < 200 || result.status > 599 ||
        !Object.hasOwn(result, 'data')) throw new Error('invalid state response');
      return result;
    } catch { throw new EngineError('ADAPTER_ERROR', 503, 'adapter state unavailable'); }
  };
  // Delivery and shutdown hooks pass through: the outbox pump already bounds each deliver (timeout, throw = retry) and
  // core close bounds onShutdown (10 s); only the shape is checked here, and a malformed target map fails boot.
  if (plugin.outboxTargets !== undefined) safe.outboxTargets = () => {
    const targets = plugin.outboxTargets!();
    if (!targets || typeof targets !== 'object' || Object.values(targets).some(t => !t || typeof t.deliver !== 'function'))
      throw new EngineError('ADAPTER_ERROR', 503, 'adapter outbox targets invalid');
    return targets;
  };
  if (plugin.onShutdown !== undefined) safe.onShutdown = () => plugin.onShutdown!();
  wrapped.set(plugin, safe); wrapped.set(safe, safe);
  return safe;
}

function nullPlugin(): EnginePlugin {
  return {
    name: 'generic',
    profiles: () => ({ generic: { name: 'generic', tools: [], interrupt: false, settingSources: [] } }),
    beforeCreate: async () => ({ ok: true }), beforeSend: async () => ({ ok: true }),
    beforeSpawn: async (_agent, spec) => spec, classify: async () => null,
    tools: () => [], mcpServers: () => [], onEvent() {}, onBoot: async () => {},
  };
}
export async function loadPlugin(spec?: string): Promise<EnginePlugin> {
  if (!spec) return protectPlugin(nullPlugin());
  try {
    const location = isAbsolute(spec) || spec.startsWith('.') ? pathToFileURL(resolve(spec)).href : spec;
    const module = await bounded(() => import(location), ADMISSION_BUDGET_MS);
    const plugin = module.default ?? module.plugin;
    if (!plugin || typeof plugin !== 'object') throw new Error('invalid adapter export');
    return protectPlugin(plugin);
  } catch {
    const denied = nullPlugin();
    denied.name = 'unavailable';
    denied.beforeCreate = async () => failure();
    denied.beforeSend = async () => failure();
    denied.profiles = () => ({});
    denied.classify = async () => ({ decision: 'deny', rule: 'plugin.unavailable', reason: 'adapter unavailable' });
    return protectPlugin(denied);
  }
}
