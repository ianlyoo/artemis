import { homedir, userInfo } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { statSync } from 'node:fs';
import { EngineError } from './types.ts';
import type { Provider } from './types.ts';

export const BASE_ENV = ['PATH', 'USER', 'LOGNAME', 'LANG', 'SHELL', 'TERM', 'TMPDIR'] as const;
const forbidden = /^(?:ARTEMIS_PLUGIN_|LEDGER_|PASEO_|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_CONFIG_DIR$|ANTHROPIC_|OPENAI_API_KEY$)/;
export function forbiddenNames(env: Record<string, string | undefined>): string[] {
  return Object.keys(env).filter(k => forbidden.test(k));
}
export function assertDaemonEnv(env: Record<string, string | undefined> = process.env): void {
  if (forbiddenNames(env).length) throw new EngineError('FORBIDDEN', 403, 'Forbidden environment names present', 'environment');
}
function unsafe():never {throw new EngineError('FORBIDDEN', 403, 'Unsafe child environment entry', 'environment');}
/** Applies to callers and trusted plugins alike. Values are never included in errors. */
function validateEntries(env:Record<string,string>):void {
  if(!env||typeof env!=='object'||Array.isArray(env))unsafe();
  if(Object.entries(env).some(([k,v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== 'string' || v.includes('\0') ||
    /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY)/i.test(k) || /_KEY$/i.test(k) || /^(?:ANTHROPIC_|OPENAI_API_KEY$)/i.test(k) ||
    /^(?:(?:HTTP|HTTPS|ALL|NO|FTP)_PROXY|PROXY|GLOBAL_AGENT_(?:HTTP_PROXY|HTTPS_PROXY|NO_PROXY)|npm_config_(?:proxy|https_proxy|noproxy))$/i.test(k) ||
    ['HOME','CODEX_HOME','NODE_OPTIONS','LD_PRELOAD','LD_LIBRARY_PATH','BASH_ENV','ENV'].includes(k.toUpperCase())))unsafe();
}
export function validateIntentEnv(env: Record<string, string> = {}): void {
  validateEntries(env);
  if (forbiddenNames(env).length) {
    throw new EngineError('FORBIDDEN', 403, 'Unsafe child environment entry', 'environment');
  }
}
/** Trusted adapter output may carry system identity and Claude configuration/tuning settings. */
export function validatePluginEnv(env:Record<string,string>={}):void {
  validateEntries(env);
  if(forbiddenNames(env).some(k=>!/^(?:ARTEMIS_PLUGIN_|CLAUDE_CODE_|CLAUDE_CONFIG_DIR$)/.test(k)))unsafe();
  if(env.CLAUDE_CONFIG_DIR!==undefined) {
    try {if(!isAbsolute(env.CLAUDE_CONFIG_DIR)||!statSync(env.CLAUDE_CONFIG_DIR).isDirectory())unsafe();}
    catch {unsafe();}
  }
}
/** Directory configuration only; this module never opens provider credential stores. */
export function buildChildEnv(provider: Provider | 'terminal', extra: Record<string,string> = {},
  source: Record<string,string|undefined> = process.env, options: { home?: string; codexHome?: string } = {},
  pluginExtra:Record<string,string>={}): Record<string,string> {
  validateIntentEnv(extra);validatePluginEnv(pluginExtra);
  const env: Record<string,string> = { HOME: options.home ?? homedir() };
  for (const key of BASE_ENV) if (source[key] !== undefined) env[key] = source[key]!;
  env.USER ??= userInfo().username; env.LOGNAME ??= env.USER;
  env.LANG ??= 'C.UTF-8'; env.TERM ??= 'xterm-256color';
  for (const [key,value] of Object.entries(extra)) env[key] = value;
  for (const [key,value] of Object.entries(pluginExtra)) env[key] = value;
  if (provider === 'codex') env.CODEX_HOME = options.codexHome ?? join(env.HOME, '.codex');
  if (env.CODEX_HOME?.split('/').includes('.paseo')) throw new EngineError('FORBIDDEN', 403, 'Invalid provider configuration directory', 'environment');
  return env;
}
