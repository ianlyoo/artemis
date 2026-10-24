import { EngineError, type AgentRecord, type Principal, type SqlDb, type TerminalService } from '../types.ts';

const stores = new WeakMap<TerminalService, SqlDb>();
export function registerCaptureGrants(service: TerminalService, db: SqlDb): void {
  db.exec('CREATE TABLE IF NOT EXISTS terminal_capture_grants (terminal_id TEXT NOT NULL, agent_id TEXT NOT NULL, PRIMARY KEY (terminal_id, agent_id))');
  stores.set(service, db);
}
function orchestrator(agent: AgentRecord | null): agent is AgentRecord {
  return !!agent && agent.profile === 'orchestrator' && agent.labels['role'] === 'orchestrator'
    && !agent.successorId && !['stopped', 'archived', 'error'].includes(agent.state);
}
/** The user grants one screen to one live Orchestrator. No input, resize, kill or other agent namespace is granted. */
export function setCaptureGrant(service: TerminalService, terminalId: string, agent: AgentRecord | null, agentId: string, granted: boolean, principal: Principal): void {
  if (principal.kind !== 'console') throw new EngineError('FORBIDDEN', 403, 'Only Console may grant terminal capture');
  const db = stores.get(service);
  const terminal = db?.prepare('SELECT user, closed_at FROM terminals WHERE id=?').get(terminalId);
  if (!db || !terminal || terminal.user !== 'console') throw new EngineError('NOT_FOUND', 404, 'User terminal not found');
  if (granted && (!orchestrator(agent) || agent.id !== agentId || terminal.closed_at)) throw new EngineError('FORBIDDEN', 403, 'Capture requires a live Orchestrator and user terminal');
  if (granted) db.prepare('INSERT OR IGNORE INTO terminal_capture_grants VALUES (?,?)').run(terminalId, agentId);
  else db.prepare('DELETE FROM terminal_capture_grants WHERE terminal_id=? AND agent_id=?').run(terminalId, agentId);
}
export function canCaptureGranted(service: TerminalService, terminalId: string, agent: AgentRecord | null): boolean {
  if (!orchestrator(agent)) return false;
  return !!stores.get(service)?.prepare("SELECT 1 FROM terminal_capture_grants g JOIN terminals t ON t.id=g.terminal_id WHERE g.terminal_id=? AND g.agent_id=? AND t.user='console' AND t.closed_at IS NULL").get(terminalId, agent.id);
}
