import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { darwinProcesses, parseDarwinProcesses, type ProcessOptions } from './darwin.ts';
import { isAlive, readProc, processTree, killTree, ProcessCustody } from './posix.ts';
import { ProcessTree as ClaudeTree } from '../../drivers/claude/processes.ts';
import { ProcessTree as CodexTree } from '../../drivers/codex/processes.ts';
import { openDarwinLock, DARWIN_LOCK_FLAGS, type LockOps } from './darwin-lock.ts';
import { acquireLock } from '../locks.ts';
import { lockPtyd } from '../../ptyd/lock.ts';
import { fixture, intent, console, scratch } from '../journal/fixtures.ts';
import type { DriverHost } from '../types.ts';
import { resolveClaudeBinary } from '../../drivers/claude/binary.ts';

/** stubborn: only SIGKILL removes a row. failSnapshots(n): the next n ps -A calls fail; ps -p keeps working. */
function processes(stubborn=false) {
  const rows = new Map<number, { ppid:number; start:string; state:string }>();
  const add = (pid:number, ppid:number, start='Wed Oct 21 05:00:00 2026', state='S+') => rows.set(pid,{ppid,start,state});
  const signals:number[]=[],sent:string[]=[];let failing=0;
  const options:ProcessOptions={platform:'darwin',ps:args=>{
    assert.deepEqual(args.slice(-2),['-o','pid=,ppid=,lstart=,stat=']);
    if(args[0]==='-A'&&failing>0){failing--;return {status:null,stdout:'',stderr:'',error:new Error('ETIMEDOUT')};}
    const selected=[...rows].filter(([pid])=>args[0]==='-A'||pid===Number(args[1]));
    return {status:selected.length||args[0]==='-A'?0:1,stderr:'',stdout:selected.map(([pid,p])=>`${pid} ${p.ppid} ${p.start} ${p.state}\n`).join('')};
  },signal:(pid,signal)=>{signals.push(pid);sent.push(`${pid}:${signal}`);if(!stubborn||signal==='SIGKILL')rows.delete(pid);}};
  return {rows,add,options,signals,sent,failSnapshots:(n:number)=>{failing=n;}};
}

test('Darwin metadata is stable, locale-independent and fails closed on errors or malformed rows',()=>{
  const f=processes();f.add(501,1,'Wed Oct  7 05:00:00 2026');
  const first=readProc(501,f.options)!;
  assert.equal(first.startTime,'darwin:Wed Oct 7 05:00:00 2026');
  assert.deepEqual(readProc(501,f.options),first);assert.equal(isAlive(first,f.options),true);
  f.rows.get(501)!.state='Z+';assert.equal(isAlive(first,f.options),false);
  f.add(501,1,'Wed Oct 21 05:01:00 2026');assert.equal(isAlive(first,f.options),false);
  f.rows.clear();assert.equal(readProc(501,f.options),null);
  assert.throws(()=>parseDarwinProcesses('501 1 relative-start S'),/metadata/);
  assert.throws(()=>parseDarwinProcesses('1 0 Wed Oct 21 05:00:00 2026 S\n1 0 Wed Oct 21 05:00:00 2026 S'),/identity/);
  assert.throws(()=>darwinProcesses(501,()=>({status:1,stdout:'',stderr:'failed'})),/unavailable/);
  assert.throws(()=>darwinProcesses(undefined,()=>({status:0,stdout:'malformed',stderr:''})),/metadata/);
});

test('Apple ps rows for exiting or unreadable tasks (?E, blank, flag-only) parse as state ?, not as a failed snapshot',()=>{
  const rows=parseDarwinProcesses('77 1 Wed Oct 21 05:00:00 2026 ?E\n78 1 Wed Oct 21 05:00:00 2026    \n79 1 Wed Oct 21 05:00:00 2026 <s\n80 1 Wed Oct 21 05:00:00 2026 Z\n81 0 Wed Oct 21 05:00:00 2026 Ss\n');
  assert.deepEqual(rows.map(r=>r.state),['?','?','?','Z','S']);
  const p=processes();p.add(501,process.pid);p.add(502,501);p.add(900,1,undefined,'?E');p.add(901,1,undefined,'?');
  assert.deepEqual(processTree(readProc(501,p.options)!,p.options).map(x=>x.pid).sort(),[501,502]);
  assert.equal(isAlive(readProc(900,p.options)!,p.options),true);
});

test('Darwin Codex hard stop SIGKILLs stubborn remembered descendants through failed snapshots and audits zero',{timeout:15000},async()=>{
  const p=processes(true),tracked:number[]=[];
  p.add(501,process.pid);p.add(502,501);p.add(503,502);p.add(900,1,undefined,'?E');
  const tree=new CodexTree(501,pid=>tracked.push(pid),p.options);
  try {
    assert.deepEqual(tree.pids().sort(),[501,502,503]);
    p.rows.get(503)!.ppid=1; // reparented to launchd: only the earlier snapshot ties it to us
    p.failSnapshots(40);const before=Date.now();
    assert.equal((await tree.stop()).alive,0);assert.ok(Date.now()-before>=4900);
    for(const pid of [501,502,503])for(const signal of ['SIGINT','SIGTERM','SIGKILL'])assert.ok(p.sent.includes(`${pid}:${signal}`),`${pid} ${signal}`);
    assert.deepEqual([...p.rows.keys()],[900]);assert.deepEqual(tree.pids(),[]);assert.deepEqual(tracked.sort(),[501,502,503]);
  } finally {p.rows.clear();await tree.stop().catch(()=>{});}
});

test('Darwin Claude and custody kills keep remembered identities through a failed snapshot',async()=>{
  const p=processes();
  p.add(501,process.pid);p.add(502,501);p.add(503,502);p.add(900,1,undefined,'?E');
  const host:DriverHost={trackPid:()=>{},gate:async()=>{throw Error('unused gate');},prompt:async()=>{throw Error('unused prompt');},log:()=>{}};
  const tree=new ClaudeTree(host,p.options);
  try {
    tree.add(501,'cli');assert.deepEqual(tree.pids().sort(),[501,502,503]);
    p.rows.get(503)!.ppid=1;p.failSnapshots(3);
    assert.equal((await tree.stop(true)).alive,0);assert.deepEqual(p.signals.sort(),[502,503]);
  } finally {tree.dispose();}
  const q=processes();q.add(601,process.pid);q.add(602,601);q.add(900,1,undefined,'?E');
  const root=readProc(601,q.options)!;q.failSnapshots(1);
  assert.deepEqual(await killTree([root],undefined,q.options),{killed:2,alive:0});assert.deepEqual([...q.rows.keys()],[900]);
});

test('Darwin custody discovers trees, retains orphans, excludes reused PIDs and sweeps at boot',async()=>{
  const f=fixture(),p=processes();const custody=new ProcessCustody(f.db,p.options);
  try {
    const agent=await f.core.create(intent(),console);
    p.add(503,502);p.add(502,501);p.add(501,process.pid);p.add(900,1);
    const root=readProc(501,p.options)!;
    assert.deepEqual(processTree(root,p.options).map(x=>x.pid).sort(),[501,502,503]);
    custody.track(agent.id,501,'cli');custody.sample();assert.equal(custody.toolsRunning(agent.id),2);
    assert.throws(()=>custody.track(agent.id,900,'tool'),/not owned/);
    p.rows.delete(501);p.rows.get(502)!.ppid=1;
    p.add(503,900,'Wed Oct 21 05:02:00 2026'); // an unrelated reuse of the observed PID
    assert.deepEqual(await custody.sweep(),[]);
    assert.deepEqual(p.signals,[502]);assert.ok(p.rows.has(900)&&p.rows.has(503));
    assert.equal(custody.alive(agent.id),0);
    p.add(504,process.pid);custody.track(agent.id,504,'cli');
    p.options.ps=()=>({status:1,stdout:'',stderr:'permission denied'});
    assert.deepEqual(await custody.sweep(),[agent.id]);assert.equal(f.core.get(agent.id)?.state,'writer_locked');
  } finally {custody.stop();await f.close();}
});

test('Darwin Claude hardStop retains CLI while killing remembered reparented tools',async()=>{
  const p=processes(),tracked:number[]=[];
  p.add(501,process.pid);p.add(502,501);p.add(503,502);p.add(900,1);
  const host:DriverHost={trackPid:pid=>{tracked.push(pid);},gate:async()=>{throw Error('unused gate');},prompt:async()=>{throw Error('unused prompt');},log:()=>{}};
  const tree=new ClaudeTree(host,p.options);
  try {
    tree.add(501,'cli');assert.deepEqual(tree.pids().sort(),[501,502,503]);
    p.rows.get(502)!.ppid=1;p.add(503,900,'Wed Oct 21 05:02:00 2026');
    assert.equal((await tree.stop(true)).alive,0);assert.deepEqual(tree.pids(),[501]);
    assert.deepEqual(p.signals,[502]);assert.deepEqual(tracked.sort(),[501,502,503]);
    await tree.stop(false);assert.ok(p.rows.has(503));
  } finally {tree.dispose();}
});

test('Darwin Codex/PTY custody retains descendants and refuses recycled identities',async()=>{
  const p=processes(),tracked:number[]=[];
  p.add(501,process.pid);p.add(502,501);p.add(503,502);p.add(900,1);
  const tree=new CodexTree(501,pid=>tracked.push(pid),p.options);
  try {
    assert.deepEqual(tree.pids().sort(),[501,502,503]);
    p.rows.delete(501);p.rows.get(502)!.ppid=1;p.add(503,900,'Wed Oct 21 05:02:00 2026');
    assert.equal((await tree.stop()).alive,0);assert.deepEqual(p.signals,[502]);
    assert.deepEqual(tracked.sort(),[501,502,503]);assert.ok(p.rows.has(503));
  } finally {p.rows.clear();await tree.stop();}
});

test('Darwin writer and PTY locks use atomic exclusive nonblocking CLOEXEC opens, not lockfile existence',async()=>{
  const dir=scratch('darwin-lock-');let held=false,closed=0;
  const ops:LockOps={open:(_path,flags,mode)=>{
    assert.equal(flags,DARWIN_LOCK_FLAGS);assert.equal(mode,0o600);
    if(held)throw Object.assign(new Error('busy'),{code:'EAGAIN'});
    held=true;return 42;
  },close:fd=>{assert.equal(fd,42);closed++;held=false;},regular:()=>true,chmod:(_fd,mode)=>assert.equal(mode,0o600)};
  try {
    const lock=await acquireLock(dir,{platform:'darwin',lockOps:ops});
    await assert.rejects(acquireLock(dir,{platform:'darwin',lockOps:ops}),{code:'WRITER_LOCKED'});
    await lock.close();await lock.lost;await lock.close();assert.equal(closed,1);
    const pty=await lockPtyd(dir,{platform:'darwin',lockOps:ops});
    await assert.rejects(lockPtyd(dir,{platform:'darwin',lockOps:ops}),/already running/);
    await pty.close();assert.equal(held,false);
    assert.throws(()=>openDarwinLock('unused',{...ops,regular:()=>false}),/regular file/);assert.equal(held,false);
    await assert.rejects(acquireLock(dir,{platform:'darwin',lockOps:{...ops,open:()=>{throw Object.assign(new Error('io'),{code:'EIO'});}}}),{code:'EIO'});
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('Claude resolves the agents account installation and Homebrew on Darwin while using PATH on Linux',()=>{
  const candidates:string[]=[];
  const options={platform:'darwin' as const,home:'/Users/agents',path:'relative:/opt/homebrew/bin',executable:(p:string)=>{candidates.push(p);return p==='/Users/agents/.local/bin/claude';}};
  assert.equal(resolveClaudeBinary(options),'/Users/agents/.local/bin/claude');
  assert.deepEqual(candidates,['/Users/agents/.local/bin/claude']);
  assert.equal(resolveClaudeBinary({...options,executable:p=>p==='/opt/homebrew/bin/claude'}),'/opt/homebrew/bin/claude');
  assert.equal(resolveClaudeBinary({platform:'linux'}),'claude');
  assert.throws(()=>resolveClaudeBinary({...options,executable:()=>false}),/unavailable/);
});
