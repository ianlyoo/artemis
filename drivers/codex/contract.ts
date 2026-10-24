import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcessTree } from './processes.ts';
import { Rpc } from './rpc.ts';

export const approvalFiles = ['ServerRequest.ts', 'v2/CommandExecutionRequestApprovalParams.ts', 'v2/CommandExecutionRequestApprovalResponse.ts', 'v2/CommandExecutionApprovalDecision.ts', 'v2/CommandExecutionApprovalKind.ts', 'v2/FileChangeRequestApprovalParams.ts', 'v2/FileChangeRequestApprovalResponse.ts', 'v2/FileChangeApprovalDecision.ts', 'v2/McpServerElicitationRequestParams.ts', 'v2/McpServerElicitationRequestResponse.ts', 'v2/McpServerElicitationAction.ts', 'v2/McpElicitationSchema.ts'];
export const protocolDir = fileURLToPath(new URL('./protocol/0.164.0/', import.meta.url));
export function normalizeImports(text: string): string { return text.replace(/(from\s+["'])(\.[^"']+?)(?:\.ts)?(["'])/g, '$1$2.ts$3'); }
/** Regenerate the installed binary's approval contract, compare, then handshake. No model turn. */
export async function contractTest(binary: string, env: Record<string, string>, expected = protocolDir): Promise<void> {
  const dir = await mkdtemp(join(env.TMPDIR ?? tmpdir(), 'codex-contract-'));
  let owned: ProcessTree | undefined;
  let rpc: Rpc | undefined;
  try {
    const generator = spawn(binary, ['app-server', 'generate-ts', '--experimental', '--out', dir], { env, cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    generator.on('error', () => {});
    generator.stdout.resume(); generator.stderr.resume();
    if (!generator.pid) throw new Error('Contract generator failed');
    owned = new ProcessTree(generator.pid);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Contract generator timed out')), 30000);
      generator.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Contract generator failed')); });
      generator.once('error', () => { clearTimeout(timer); reject(new Error('Contract generator failed')); });
    });
    await owned.stop(); owned = undefined;
    for (const file of approvalFiles) {
      if (normalizeImports(await readFile(join(dir, file), 'utf8')) !== normalizeImports(await readFile(join(expected, file), 'utf8'))) throw new Error('Approval contract mismatch');
    }
    const child = spawn(binary, ['app-server'], { env, cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', () => {});
    if (!child.pid) throw new Error('Contract handshake failed');
    owned = new ProcessTree(child.pid); rpc = new Rpc(child);
    const hello = await rpc.request('initialize', { clientInfo: { name: 'engine_contract', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    if (typeof hello?.userAgent !== 'string' || !hello.userAgent.includes('0.164.0') || hello.codexHome !== env.CODEX_HOME || hello.platformOs !== codexPlatform(process.platform)) throw new Error('Handshake contract mismatch');
    rpc.notify('initialized', {});
  } finally {
    rpc?.dispose(); if (owned) await owned.stop(); await rm(dir, { recursive: true, force: true });
  }
}
// codex app-server names the OS its own way: "macos" on darwin (seen with 0.163.0 in the macOS 26 VM, 10/21); others as Node does.
export function codexPlatform(platform: NodeJS.Platform): string { return platform === 'darwin' ? 'macos' : platform; }
