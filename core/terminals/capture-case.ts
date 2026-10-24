import assert from 'node:assert/strict';
import { terminalWorld, until } from './r1-fixture.ts';
import { SocketFixture } from './test-support.ts';
import { mcpConnect } from '../test-support/mcp.ts';
import { canCaptureGranted } from './capture.ts';
import { createTerminals } from './index.ts';

export async function captureCase() {
  const w = await terminalWorld(), clients: Awaited<ReturnType<typeof mcpConnect>>[] = [];
  try {
    const orchestrator = await w.agent(), other = await w.agent('project lead'), user = await w.terminal('console'), ungranted = await w.terminal('console');
    const ownAgent = await w.terminal(`agent:${other.id}`), socket = new SocketFixture();
    w.terminals.attach(user.id, { principal: { kind: 'console', name: 'console' } }, socket);
    await until(() => socket.frames.length); socket.input(3, JSON.stringify({ intent: 'claim', cols: 100, rows: 30 }));
    socket.input(2, "printf '\\nCAPTURE_%s\\n' 'R1C'\r");
    await until(async () => (await w.terminals.capture(user.id, 30)).includes('CAPTURE_R1C'));
    socket.close();
    for (const a of [orchestrator, other]) { const spec = w.mcp.slotFor(a); assert(spec.type === 'http'); clients.push(await mcpConnect(spec.url)); }
    const capture = (i: number, terminalId: string) => clients[i].call('capture_terminal', { terminalId });
    const grant = (id: string, agentId: string, granted = true, as = 'console') => w.request(`/v1/terminals/${id}/capture-grant`, 'POST', { agentId, granted }, as);
    assert.equal((await capture(0, user.id)).isError, true);
    assert.equal((await grant(user.id, orchestrator.id, true, 'cli')).status, 403);
    assert.equal((await grant(user.id, other.id)).status, 403);
    assert.equal((await grant(ownAgent.id, orchestrator.id)).status, 404);
    assert.equal((await grant(user.id, orchestrator.id)).status, 200);
    const result = await capture(0, user.id); assert.equal(result.isError, false); assert.match(result.json.text, /CAPTURE_R1C/);
    assert.equal((await capture(1, user.id)).isError, true); assert.equal((await capture(0, ungranted.id)).isError, true);
    // A new terminal-service instance sees the persisted, exact-terminal grant.
    const reopened = createTerminals({ db: w.db, runDir: `${w.root}/run`, journal: { append: () => ({}) as never }, log() {}, allowedRoots: [w.root] });
    try { assert.equal(canCaptureGranted(reopened, user.id, orchestrator), true); } finally { await reopened.close(); }
    // Revocation during the asynchronous capture must not return the acquired screen.
    const raw = w.terminals.capture;
    w.terminals.capture = async (id, lines) => { const text = await raw(id, lines); await grant(user.id, orchestrator.id, false); return text; };
    try { assert.equal((await capture(0, user.id)).isError, true); } finally { w.terminals.capture = raw; }
    assert.equal((await capture(0, user.id)).isError, true);
    await grant(user.id, orchestrator.id);
    w.db.prepare('UPDATE agents SET successor_id=? WHERE id=?').run(other.id, orchestrator.id);
    assert.equal((await capture(0, user.id)).isError, true);
  } finally { for (const c of clients) await c.close(); const audit = await w.close(); assert.equal(audit.alive, 0); }
}
