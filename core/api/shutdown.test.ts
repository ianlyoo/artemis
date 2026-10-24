import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildChildEnv } from '../env.ts';
import { Database } from '../db.ts';
import { isAlive, killTree, readProc, type ProcIdentity } from '../procs/posix.ts';
import { scratch, until } from '../journal/fixtures.ts';

for(const mode of ['await','throw','hang','boot-failure','boot-throw','targets-failure','pre-boot-failure']) {
  test(`daemon plugin shutdown: ${mode}; database and owned pid audit`,{timeout:60000},async()=>{
    const state=scratch('shutdown-'),messages:Record<string,unknown>[]=[],owned:ProcIdentity[]=[];
    const child=fork(fileURLToPath(new URL('./shutdown-fixture.ts',import.meta.url)),[mode,state],{
      env:buildChildEnv('terminal'),execArgv:['--disable-warning=ExperimentalWarning'],stdio:['ignore','ignore','pipe','ipc'],
    });
    const root=readProc(child.pid!);if(root)owned.push(root);
    let stderr='',exited=false;
    child.stderr!.setEncoding('utf8');child.stderr!.on('data',(data:string)=>{stderr+=data;});
    const exit=new Promise<number|null>(resolve=>child.once('exit',code=>{exited=true;resolve(code);}));
    child.on('message',(m:Record<string,unknown>)=>{messages.push(m);if(m.owned)owned.push(...m.owned as ProcIdentity[]);});
    try {
      const bootFailure=mode.includes('failure')||mode==='boot-throw';
      if(!bootFailure){await until(()=>messages.some(m=>m.ready)||exited,30000);assert.equal(exited,false);child.kill('SIGTERM');}
      if(mode!=='pre-boot-failure') {
        await until(()=>messages.some(m=>m.shutdownStarted)||exited,30000);assert.ok(messages.some(m=>m.shutdownStarted));
        if(!['throw','hang'].includes(mode)) {
          assert.equal(exited,false);await delay(50);assert.equal(exited,false,'shutdown must await the hook before closing the database');child.send({release:true});
        }
      }
      await until(()=>exited,30000);assert.equal(await exit,bootFailure?1:0);
      const db=new Database(join(state,'engine.db'));
      try {
        if(mode==='pre-boot-failure')assert.equal(db.meta('shutdownCalls'),undefined);
        else {
          assert.equal(db.meta('shutdownCalls'),1,'hook called once even for concurrent close calls');
          assert.equal(db.meta('shutdownFinished'),['throw','hang'].includes(mode)?undefined:true);
          if(mode==='hang')assert.ok(Date.now()-db.meta<number>('shutdownStarted')!>=9500,'production ten-second budget elapsed');
        }
        if(!bootFailure) {
          assert.ok(messages.some(m=>m.sharedClose===true));
          assert.deepEqual(db.meta('delivery'),{key:'fixture-delivery',body:{synthetic:true}});
          assert.equal(db.prepare('SELECT state FROM outbox').get()?.state,'delivered');
        }
        assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
      } finally {db.close();}
      assert.equal(stderr,['throw','hang'].includes(mode)?'artemisd: plugin shutdown failed or timed out\n':'');
    } finally {
      // The only signal targets are this test's child and its recorded descendants, with start-time checks.
      if(root)await killTree([root]);
      await until(()=>exited&&owned.every(p=>!isAlive(p)),30000);
      assert.equal(owned.filter(isAlive).length,0);
      console.log(`shutdown ${mode}: owned=${new Set(owned.map(p=>`${p.pid}:${p.startTime}`)).size}, alive=0`);
    }
  });
}
