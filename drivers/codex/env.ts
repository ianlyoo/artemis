import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

// Defense in depth behind core/env.ts (which already admits ARTEMIS_PLUGIN_*, CLAUDE_CONFIG_DIR and CLAUDE_CODE_* only from the
// trusted plugin): credentials, loader hooks and foreign-runtime markers stay refused here whatever the source.
const forbidden = /^(?:LEDGER_|PASEO_|CLAUDECODE$|ANTHROPIC_|OPENAI_API_KEY$|NODE_OPTIONS$|LD_|BASH_ENV$|ENV$)|(?:_TOKEN|_SECRET|_API_KEY)$/;
/** SpawnSpec.env is supplied by core, never inherited from artemisd. */
export function codexEnv(input: Record<string, string>, home: string): Record<string, string> {
  if (!isAbsolute(home)) throw new Error('CODEX_HOME must be absolute');
  const canonical = realpathSync(home);
  if ([resolve(home), canonical].some(p => p.split('/').includes('.paseo'))) throw new Error('Forbidden CODEX_HOME');
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(input)) {
    if (forbidden.test(name)) throw new Error('Forbidden child environment name');
    if (name !== 'CODEX_HOME') env[name] = value;
  }
  env.CODEX_HOME = canonical;
  return env;
}
export function bootEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'SHELL', 'TERM', 'TMPDIR']) {
    if (process.env[k]) env[k] = process.env[k]!;
  }
  return env;
}
