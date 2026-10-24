import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { buildChildEnv } from '../env.ts';
import { readProc, isAlive } from '../procs/posix.ts';
import type { ProcIdentity } from '../procs/posix.ts';
import { Database } from '../db.ts';
import { scratch,intent,until } from '../journal/fixtures.ts';
import { callLocal } from './transport.ts';
import { join } from 'node:path';

test('real artemisd clean-env create/send/stream/cancel/SIGKILL/restart/same-native resume; pid audit',{timeout:30000},async()=>{
  const state=scratch('daemon-'),credential=randomBytes(32).toString('base64url'),children:ChildProcess[]=[],owned:ProcIdentity[]=[];
  let apiPort=0;
  const call=(method:string,path:string,body?:unknown)=>callLocal({port:apiPort,token:credential,method,path,body});
  async function start(expectFailure=false):Promise<ChildProcess> {
    const child=fork(fileURLToPath(new URL('./main-fixture.ts',import.meta.url)),['--state',state,'--api-port',String(apiPort),'--mcp-port','0'],{env:buildChildEnv('terminal'),execArgv:['--disable-warning=ExperimentalWarning'],stdio:['ignore','ignore','ignore','ipc']});children.push(child);
    const identity=readProc(child.pid!);if(identity)owned.push(identity);
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Daemon start timed out')),10000);
      child.on('message',(m:{started?:boolean;ready?:boolean;lockPid?:number;apiPort?:number;error?:string})=>{
        if(m.started)child.send({credential});
        if(m.ready){apiPort=m.apiPort!;if(m.lockPid){const p=readProc(m.lockPid);if(p)owned.push(p);}clearTimeout(timer);resolve();}
        if(m.error){clearTimeout(timer);if(expectFailure)resolve();else reject(new Error('Daemon start failed'));}
      });child.on('error',reject);
    });return child;
  }
  try {
    const first=await start(),contender=await start(true);await once(contender,'exit');assert.notEqual(contender.exitCode,0);
    const created=await call('POST','/v1/agents',intent()),id=(created.body as {id:string}).id;assert.equal(created.status,201);
    const socket=new WebSocket(`ws://127.0.0.1:${apiPort}/v1/stream`,{headers:{Authorization:`Bearer ${credential}`}});await once(socket,'open');let frames=0;socket.on('message',()=>frames++);socket.send(JSON.stringify({op:'subscribe',id:'test',agents:[id]}));
    await call('POST',`/v1/agents/${id}/messages`,{requestId:'run',text:'synthetic'});await until(()=>frames>=3);
    assert.equal((await call('POST',`/v1/agents/${id}/cancel`,{requestId:'cancel',hardStop:true})).status,200);
    await call('POST',`/v1/agents/${id}/messages`,{requestId:'crash-turn',text:'synthetic crash'});
    let running=false;for(let n=0;n<100;n++){running=(await call('GET',`/v1/agents/${id}`)).body!==null&&((await call('GET',`/v1/agents/${id}`)).body as {state:string}).state==='running';if(running)break;await new Promise(r=>setTimeout(r,10));}assert.equal(running,true);
    socket.terminate();first.kill('SIGKILL');await once(first,'exit');await until(()=>owned.slice(0,2).every(p=>!isAlive(p)));
    let db=new Database(join(state,'engine.db'));const native=db.prepare('SELECT native_id FROM native_sessions WHERE agent_id=?').get(id)?.native_id;db.close();
    const second=await start();
    const timeline=(await call('GET',`/v1/agents/${id}/timeline`)).body as {frames:{type:string;reason?:string}[]};assert.ok(timeline.frames.some(f=>f.type==='turn_failed'&&f.reason==='daemon_restart'));
    await call('POST',`/v1/agents/${id}/messages`,{requestId:'resume',text:'resume same native'});
    let generation=0;for(let n=0;n<100;n++){generation=((await call('GET',`/v1/agents/${id}`)).body as {driverGeneration:number}).driverGeneration;if(generation>=3)break;await new Promise(r=>setTimeout(r,10));}assert.equal(generation,3);
    second.kill('SIGTERM');await once(second,'exit');assert.equal(second.exitCode,0);
    db=new Database(join(state,'engine.db'));assert.equal(db.prepare('SELECT native_id FROM native_sessions WHERE agent_id=?').get(id)?.native_id,native);assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');db.close();
    await until(()=>owned.every(p=>!isAlive(p)));assert.equal(owned.filter(isAlive).length,0);console.log('daemon lifecycle: clean env, real sockets, SIGKILL/restart/resume; integrity=ok; owned_alive=0');
  } finally {
    for(const child of children)if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}
    await until(()=>owned.every(p=>!isAlive(p)));
  }
});
