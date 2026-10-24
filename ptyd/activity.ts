import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export type TerminalActivity = { activity: 'idle' | 'working' | 'needs_input'; attention: null | { reason: 'needs_input'; since: string } };
/** Only foreground process-group metadata: never command arguments or environment. */
export function shellForeground(pid: number, platform: NodeJS.Platform = process.platform): boolean {
  try {
    if (platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return Number(fields[2]) > 0 && fields[2] === fields[5];
    }
    if (platform === 'darwin') {
      const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'pgid=,tpgid='], { encoding: 'utf8', timeout: 2000, maxBuffer: 1024,
        env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } });
      const fields = result.stdout?.trim().split(/\s+/);
      return result.status === 0 && fields?.length === 2 && Number(fields[0]) > 0 && fields[0] === fields[1];
    }
  } catch {}
  return false;
}
/** Prompt recognition is deliberately conservative; unrecognised programs remain working. */
export function terminalActivity(line: string, bracketedPaste: boolean, foreground: boolean, previous: TerminalActivity, now = new Date()): TerminalActivity {
  const prompt = line.trimEnd();
  const idle = foreground && (bracketedPaste || /[$#%>❯]$/.test(prompt));
  const needsInput = !idle && /(?:[:?：？]|\[[yYnN/]+\]|\([yYnN/]+\))\s*$/.test(prompt);
  return { activity: idle ? 'idle' : needsInput ? 'needs_input' : 'working',
    attention: needsInput ? { reason: 'needs_input', since: previous.attention?.since ?? now.toISOString() } : null };
}
