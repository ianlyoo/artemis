import { startEngine } from '../main.ts';
import { FakeDriver, fakePlugin, fakeTerminals, console, cli, until } from '../journal/fixtures.ts';

const stateDir = process.argv[2], driver = new FakeDriver(); driver.auto = true;
const engine = await startEngine({ stateDir, apiPort: 0, mcpPort: 0 }, { plugin: fakePlugin(), drivers: [driver], terminals: () => fakeTerminals() });
const { id } = await engine.core.create({ requestId: 'orchestrator', provider: 'claude', model: 'claude-haiku-5-5', cwd: stateDir,
  profile: 'test', title: 'Test Orchestrator', labels: { 'role': 'orchestrator' } }, console);
let serial = Promise.resolve(), count = 0;
process.on('message', (message: { id: number; phase: 'console' | 'wake' | 'app' }) => {
  serial = serial.then(async () => {
    const phase = message.phase, user = phase !== 'wake';
    const result = await engine.core.send(id, { requestId: `phase-${++count}`, text: user ? 'Show the comparison' : '[system wake] continue',
      clientMessageId: phase === 'console' ? `console-${count}` : phase === 'wake' ? `system-wake-${count}` : `app-${count}` }, user ? console : cli,
      { principal: user ? 'user' : 'system', channel: phase });
    await until(() => engine.core.commandState(result.commandId) === 'completed', 10000);
    process.send?.({ id: message.id, ok: true });
  }).catch(() => { process.send?.({ id: message.id, ok: false }); });
});
let stopping = false;
process.once('SIGTERM', () => { if (stopping) return; stopping = true; void serial.then(() => engine.close()).then(() => { process.disconnect(); }, () => { process.exitCode = 1; process.disconnect(); }); });
process.send?.({ ready: true, agentId: id, apiPort: engine.apiPort, mcpPort: engine.mcpPort });
