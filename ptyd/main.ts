import { isAbsolute } from 'node:path';
import { startPtyd } from './server.ts';
const index = process.argv.indexOf('--run'); const runDir = index < 0 ? '' : process.argv[index + 1];
if (!runDir || !isAbsolute(runDir)) throw new Error('Usage: ptyd/main.ts --run <absolute runDir>');
try {
  const service = await startPtyd(runDir);
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; void service.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; }); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  process.send?.({ ready: true });
} catch (error) { process.stderr.write(`engine-ptyd: startup failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
