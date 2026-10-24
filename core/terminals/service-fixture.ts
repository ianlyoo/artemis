// A separate artemisd-surrogate process, used only by the real sidecar restart test.
import { createTerminals } from './index.ts';
import { testDb, SocketFixture } from './test-support.ts';
import type { Principal } from '../types.ts';
const [runDir, dbPath, root] = process.argv.slice(2);
const db = testDb(dbPath);
const journal = { append: () => ({}) as any };
const terminals = createTerminals({ db, runDir, journal, log() {}, allowedRoots: [root] });
const principal: Principal = { kind: 'console', name: 'console' };
const sockets = new Map<string, SocketFixture>();
process.on('message', (m: any) => { void (async () => {
  try {
    let result: any;
    if (m.op === 'create') result = await terminals.create(m.request, principal);
    else if (m.op === 'capture') result = await terminals.capture(m.terminalId, m.lines);
    else if (m.op === 'list') result = terminals.list(m.query ?? {});
    else if (m.op === 'attach') {
      const sock = new SocketFixture(); sockets.set(m.clientId, sock);
      sock.send = buf => { process.send!({ event: 'frame', clientId: m.clientId, data: Buffer.from(buf).toString('base64') }); };
      terminals.attach(m.terminalId, { principal, generation: m.generation, offset: m.offset }, sock); result = {};
    } else if (m.op === 'input') { sockets.get(m.clientId)!.input(m.tag, m.body); result = {}; }
    else if (m.op === 'kill') { await terminals.kill(m.terminalId, principal); result = {}; }
    process.send!({ id: m.id, result });
  } catch { process.send!({ id: m.id, error: true }); }
})(); });
process.send!({ ready: true });
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await terminals.close(); db.close(); process.disconnect(); }
process.once('SIGTERM', () => { void stop(); }); process.once('disconnect', () => { void terminals.close().then(() => { if (!stopping) db.close(); }); });
