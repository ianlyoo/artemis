// Unit tests use a minimal environment, isolated scratch space, and no provider credentials.
import { spawnSync } from 'node:child_process';
import { globSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const real = process.env.ARTEMIS_REAL === '1';
const liveFiles = new Set(['drivers/claude/real.test.ts', 'drivers/codex/real.test.ts',
  'drivers/codex/gate-real.test.ts', 'drivers/claude/spawn-options.test.ts']);
const tests = globSync(['core/**/*.test.ts', 'drivers/**/*.test.ts', 'ptyd/**/*.test.ts', 'cli/**/*.test.ts'], { cwd: root })
  .filter(file => real || !liveFiles.has(file)).sort();
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ['PATH', 'HOME', 'LANG'].includes(key) || key.startsWith('ARTEMIS_')));
env.LANG ??= 'C.UTF-8';
// Callers control the scratch base; keep fixture names short for Unix sockets.
const scratch = mkdtempSync(join(tmpdir(), 'a-'));
env.TMPDIR = env.TMP = env.TEMP = scratch;
if (!real) env.HOME = mkdtempSync(join(scratch, 'h-'));
let status = 1;
try {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
    '--disable-warning=ExperimentalWarning', ...tests], { cwd: root, env, stdio: 'inherit' });
  status = result.status ?? 1;
} finally { rmSync(scratch, { recursive: true, force: true }); }
process.exit(status);
