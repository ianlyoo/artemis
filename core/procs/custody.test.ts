import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { acquireLock } from '../locks.ts';
import { buildChildEnv } from '../env.ts';
import { ProcessCustody, readProc, isAlive } from './posix.ts';
import { fixture, console, intent, scratch, until } from '../journal/fixtures.ts';

test('kernel lock excludes a second writer and releases on private pipe EOF',async()=>{
  const state=scratch('lock-'),lock=await acquireLock(state),pid=readProc(lock.pid)!;
  try {await assert.rejects(acquireLock(state),{code:'WRITER_LOCKED'});} finally {await lock.close();}
  if(process.platform==='darwin')assert.equal(lock.pid,process.pid);else assert.equal(isAlive(pid),false);const next=await acquireLock(state);await next.close();
});
test('real process tree cleanup verifies start-time identity and boot locks unproven writers',async()=>{
  const f=fixture();const child=spawn(process.execPath,['-e',`const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',env:{PATH:'/usr/bin'}});console.log(c.pid);setInterval(()=>{},1000);`],{env:buildChildEnv('terminal'),stdio:['ignore','pipe','ignore']});
  let subPid=0;child.stdout!.on('data',b=>{subPid=Number(String(b).trim());});const root=readProc(child.pid!)!;
  try {
    await until(()=>subPid>0);const sub=readProc(subPid)!;const {id}=await f.core.create(intent(),console);
    f.procs.track(id,child.pid!,'cli');f.procs.sample();assert.equal(f.procs.alive(id),2);
    const result=await f.procs.kill(id);assert.equal(result.alive,0);assert.equal(isAlive(root),false);assert.equal(isAlive(sub),false);
    const custody=new ProcessCustody(f.db);f.db.prepare('INSERT INTO procs VALUES(?,?,?,?)').run(child.pid!,'wrong-start',id,'cli');
    assert.equal((await custody.sweep()).length,0);
    f.db.prepare('INSERT INTO procs VALUES(?,?,?,?)').run(99999999,'synthetic',id,'cli');
    custody.kill=async()=>({alive:1,killed:0});assert.deepEqual(await custody.sweep(),[id]);assert.equal(f.core.get(id)?.state,'writer_locked');
    await assert.rejects(f.core.send(id,{requestId:'locked',text:'x'},console),{code:'WRITER_LOCKED'});
    f.db.prepare('DELETE FROM procs WHERE pid=?').run(99999999);
  } finally {
    if(isAlive(root)){child.kill('SIGKILL');await once(child,'exit');}
    await f.close();
  }
});
test('SIGINT/SIGTERM resistant owned child is escalated to SIGKILL at five seconds',{timeout:10000},async()=>{
  const f=fixture(),child=spawn(process.execPath,['-e',`process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000);`],{env:buildChildEnv('terminal'),stdio:['ignore','pipe','ignore']}),root=readProc(child.pid!)!;
  try{
    await once(child.stdout!,'data');const {id}=await f.core.create(intent(),console);f.procs.track(id,child.pid!,'tool');
    const before=Date.now(),result=await f.procs.kill(id);assert.equal(result.alive,0);assert.ok(Date.now()-before>=4900);assert.equal(isAlive(root),false);
  }finally{if(isAlive(root)){child.kill('SIGKILL');await once(child,'exit');}await f.close();}
});
