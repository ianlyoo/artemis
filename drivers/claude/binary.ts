import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const executable = (file: string): boolean => {
  try { accessSync(file, constants.X_OK); return statSync(file).isFile(); } catch { return false; }
};
/** Resolve the host's executable, never a configuration's credential/configuration directory. */
export function resolveClaudeBinary(options: {
  platform?: NodeJS.Platform; home?: string; path?: string; executable?: (file: string) => boolean;
} = {}): string {
  if ((options.platform ?? process.platform) !== 'darwin') return 'claude';
  const dirs = [join(options.home ?? homedir(), '.local/bin'),
    ...(options.path ?? process.env.PATH ?? '').split(':'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  for (const dir of new Set(dirs.filter(isAbsolute))) {
    const file = join(dir, 'claude');
    if ((options.executable ?? executable)(file)) return file;
  }
  throw new Error('Claude executable unavailable');
}
