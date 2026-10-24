import { userInfo } from 'node:os';
import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export type ShellCommand = { file: string; args: string[] };
/** userInfo uses getpwuid_r on both Darwin and Linux; daemon SHELL is not the account record. */
export function loginShell(platform: NodeJS.Platform = process.platform, account = () => userInfo().shell, executable = (file: string) => {
  accessSync(file, constants.X_OK);
  if (!statSync(file).isFile()) throw new Error('Account login shell unavailable');
}): ShellCommand {
  if (!['darwin', 'linux'].includes(platform)) throw new Error('Login shell requires Darwin or Linux');
  const file = account();
  if (!file || !isAbsolute(file) || file.includes('\0')) throw new Error('Account login shell unavailable');
  executable(file);
  return { file, args: ['-l', '-i'] };
}
