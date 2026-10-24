// No provider CLI, credentials, TCP listener, service manager, or live application data.
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireLock } from '../locks.ts';
import { lockPtyd } from '../../ptyd/lock.ts';
import { startPtyd } from '../../ptyd/server.ts';
import { readProc, isAlive, processTree, killTree } from './posix.ts';
import pty from 'node-pty';

const file=fileURLToPath(import.meta.url);
const clean=root=>({HOME:root,PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C',TMPDIR:root});
const acquire=(kind,root)=>kind==='writer'?acquireLock(root):lockPtyd(root);
async function ready(child) {
  await Promise.race([
    once(child,'message'),
    once(child,'exit').then(()=>{throw Error('fixture exited before ready');}),
    delay(7000,undefined,{ref:false}).then(()=>{throw Error('fixture readiness timeout');}),
  ]);
}

/** Used by both the Linux suite and the native VM check: this is a real SIGKILL, not a mocked lock. */
export async function checkLockDeath(root,kind) {
  mkdirSync(root,{recursive:true});
  const child=fork(file,['--hold',kind,root],{env:clean(root),execArgv:[],stdio:['ignore','ignore','ignore','ipc']});
  const exit=once(child,'exit');let next;
  try {
    await ready(child);
    const path=kind==='writer'?join(root,'run/artemisd.lock'):join(root,'ptyd.lock');
    const inode=statSync(path).ino;
    await assert.rejects(acquire(kind,root));
    child.kill('SIGKILL');await exit;
    const deadline=Date.now()+7000;
    while(!next) {
      try {next=await acquire(kind,root);} catch(error) {
        if(Date.now()>deadline)throw error;
        await delay(25);
      }
    }
    assert.equal(statSync(path).ino,inode,'lock inode must survive holder death');
  } finally {
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    await exit;await next?.close();
  }
}

export async function selftest(parent) {
  assert.ok(['darwin','linux'].includes(process.platform));
  mkdirSync(parent,{recursive:true});const root=mkdtempSync(join(parent,'darwin-'));
  let child,childExit,sidecar;const owned=[];
  try {
    const me=readProc(process.pid);assert.ok(me);await delay(50);
    assert.equal(readProc(process.pid)?.startTime,me.startTime);
    child=fork(file,['--tree',root],{env:clean(root),execArgv:[],stdio:['ignore','ignore','ignore','ipc']});childExit=once(child,'exit');
    const first=readProc(child.pid);if(first)owned.push(first);
    await ready(child);const identity=readProc(child.pid);assert.ok(identity);
    const tree=processTree(identity);owned.push(...tree);assert.ok(tree.length>=2,'descendant discovery');
    assert.equal((await killTree([identity])).alive,0);await childExit;
    assert.ok(owned.every(p=>!isAlive(p)));
    await checkLockDeath(join(root,'writer'),'writer');
    await checkLockDeath(join(root,'sidecar'),'ptyd');
    // The sidecar boots on Darwin, acquires its kernel lock, and binds only a scratch Unix socket.
    sidecar=await startPtyd(join(root,'run'));await sidecar.close();sidecar=undefined;
    let output='';
    const terminal=pty.spawn('/bin/sh',['-c','printf darwin-pty-ok'],{cwd:root,env:clean(root)});
    terminal.onData(data=>output+=data);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{terminal.kill();reject(Error('PTY timeout'));},5000);
      terminal.onExit(({exitCode})=>{clearTimeout(timer);exitCode===0?resolve():reject(Error('PTY failed'));});
    });
    assert.match(output,/darwin-pty-ok/);
    console.log(JSON.stringify({platform:process.platform,identity:'pass',tree:'pass',writerSigkill:'pass',ptydSigkill:'pass',sidecar:'pass',pty:'pass',ownedAlive:0}));
  } finally {
    await sidecar?.close();
    if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    if(childExit)await childExit;
    await killTree(owned);rmSync(root,{recursive:true,force:true});
  }
}

if(process.argv[1]&&resolve(process.argv[1])===file) {
  const [mode,kind,root]=process.argv.slice(2);
  if(mode==='--hold') {
    const lock=await acquire(kind,root);process.send?.({ready:true});
    process.on('disconnect',()=>{void lock.close().then(()=>process.exit(0));});
  } else if(mode==='--tree') {
    spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{env:clean(kind),stdio:'ignore'});
    process.send?.({ready:true});setInterval(()=>{},1000);
  } else {
    if(!mode)throw Error('Supply a disposable scratch directory');
    await selftest(resolve(mode));
  }
}
