import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database } from '../db.ts';
import { buildChildEnv } from '../env.ts';
import { scratch } from './fixtures.ts';
import { readProc, isAlive } from '../procs/posix.ts';

test('D4: 200 SIGKILL mid-transaction, integrity ok, no acknowledged command lost',{timeout:240000},async()=>{
  const file=join(scratch('crash-'),'engine.db');let db=new Database(file);db.close();const owned=[];let acked=0;
  for(let n=0;n<200;n++) {
    const child=fork(fileURLToPath(new URL('./crash-child.ts',import.meta.url)),[file,String(n)],{env:buildChildEnv('terminal'),stdio:['ignore','ignore','ignore','ipc'],execArgv:['--disable-warning=ExperimentalWarning']});
    const identity=readProc(child.pid!);if(identity)owned.push(identity);
    let ack=false,mid=false;
    try {
      await new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Crash child timed out'));},10000);
        child.on('message',(m:{ack?:string;mid?:string})=>{if(m.ack===String(n))ack=true;if(m.mid===String(n)){mid=true;child.kill('SIGKILL');}});
        child.once('error',reject);child.once('exit',()=>{clearTimeout(timeout);resolve();});
      });
    } finally {if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));}}
    assert.equal(ack,true);assert.equal(mid,true);acked++;
    db=new Database(file);
    assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM commands WHERE principal='crash'").get()?.n,acked);
    db.tx(()=>db.prepare("DELETE FROM meta WHERE key LIKE 'crash:%'").run());db.close();
  }
  assert.equal(owned.filter(isAlive).length,0);
  console.log('D4: 200/200; acknowledged=200; integrity=ok; owned_alive=0');
});
