import { startEngine } from '../main.ts';
import { FakeDriver } from '../journal/fixtures.ts';
import { Auth } from '../api/auth.ts';

// Real artemisd boot. Test authentication is provisioned only in memory over IPC.
const [stateDir, runDir, root, apiPort, mcpPort] = process.argv.slice(2);
const engine = await startEngine({ stateDir, ptydRun: runDir, consoleRoots: [root],
  apiPort: Number(apiPort), mcpPort: Number(mcpPort) }, { drivers: [new FakeDriver()] });
process.on('message', (message: { credential?: string }) => {
  if (!message.credential) return;
  new Auth(engine.db, stateDir).register({ name: 'console' }, message.credential);
  process.send?.({ ready: true, apiPort: engine.apiPort, mcpPort: engine.mcpPort });
});
process.send?.({ started: true });
let stopping = false;
const stop = () => {
  if (stopping) return; stopping = true;
  void engine.close().then(() => { process.disconnect(); }, () => { process.exitCode = 1; process.disconnect(); });
};
process.once('SIGTERM', stop); process.once('SIGINT', stop);
