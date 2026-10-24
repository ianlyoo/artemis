import { parseOptions, startEngine } from '../main.ts';
import { loadPlugin } from '../plugin.ts';
import { FakeDriver, fakeTerminals } from '../journal/fixtures.ts';

// Exercise the public plugin seam with a synthetic provider and real listeners.
const options = parseOptions(process.argv.slice(2));
const engine = await startEngine(options, {
  plugin: await loadPlugin(options.plugin), drivers: [new FakeDriver()], terminals: () => fakeTerminals(),
});
process.stdout.write(JSON.stringify({ ready: true, apiPort: engine.apiPort, mcpPort: engine.mcpPort }) + '\n');
let stopping = false;
process.once('SIGTERM', () => {
  if (stopping) return;
  stopping = true;
  void engine.close().catch(() => { process.exitCode = 1; });
});
