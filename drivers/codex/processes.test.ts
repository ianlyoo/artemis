import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { ProcessTree } from './processes.ts';
import { bootEnv } from './env.ts';
import { isAlive, readProc, type ProcIdentity } from '../../core/procs/posix.ts';

/** Bounded: a custody regression fails with a named step instead of hanging the file (darwin VM, 10/21). */
const within = <T>(ms: number, step: string, work: Promise<T>): Promise<T> => Promise.race([work,
  delay(ms, undefined, { ref: false }).then((): never => { throw new Error(`${step} did not finish within ${ms} ms`); })]);

test('process custody kills a real stubborn descendant and audits zero live pids', { timeout: 25000 }, async () => {
  const child = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process'); process.on('SIGINT',()=>{}); process.on('SIGTERM',()=>{}); const c=spawn(process.execPath,['-e',"process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{env:{PATH:process.env.PATH},stdio:'ignore'}); console.log(c.pid); setInterval(()=>{},1000);`], { env: bootEnv(), stdio: ['ignore', 'pipe', 'ignore'] });
  assert.ok(child.pid); const tracked: number[] = [], owned: ProcIdentity[] = [];
  const root = readProc(child.pid); if (root) owned.push(root);
  try {
    const [line] = await within(5000, 'stubborn descendant start', once(child.stdout!, 'data'));
    const descendant = readProc(Number(String(line).trim())); assert.ok(descendant, 'descendant identity'); owned.push(descendant);
    const tree = new ProcessTree(child.pid, p => tracked.push(p));
    await delay(400); assert.ok(tree.pids().length >= 2);
    const result = await within(10000, 'hard stop of the owned tree', tree.stop());
    assert.equal(result.alive, 0); assert.ok(tracked.length >= 2); assert.deepEqual(tree.pids(), []);
    assert.deepEqual(owned.filter(p => isAlive(p)).map(p => p.pid), [], 'owned pids alive after stop');
  } finally {
    for (const p of owned) if (isAlive(p)) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* already gone */ } }
    child.stdout!.destroy();
  }
});
