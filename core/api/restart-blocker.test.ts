import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildChildEnv } from '../env.ts';
import { isAlive, killTree, readProc, type ProcIdentity } from '../procs/posix.ts';
import { scratch, until } from '../journal/fixtures.ts';

type Snapshot={work:{a:string;b:string;one:string;two:string;three:string;user:string};held:boolean;early:boolean;paused:number;
  states:Record<string,string>;deliveries:{agentId:string;commandId:string;clientMessageId?:string}[]};
type Daemon={child:ChildProcess;root:ProcIdentity|null;wait:(key:string)=>Promise<void>;rpc:(op:string,agent?:'a'|'b')=>Promise<Snapshot>;exit:Promise<number|null>;exited:()=>boolean};

// Adapted from adapters/system/wakes/restart-blocker.test.ts: positive recovery proof,
// real SIGKILL/SQLite/daemon boot, synthetic providers, and only the core lane's ports.
for(const mode of ['normal','replay','held','drained'])test(`queued wakes after SIGKILL: ${mode}, idle boundaries, cancel pause and no duplicate delivery`,{timeout:90000},async()=>{
  const state=scratch('queued-restart-'),owned:ProcIdentity[]=[],children:Daemon[]=[];
  function start(phase:string):Daemon {
    const child=fork(fileURLToPath(new URL('./queued-fixture.ts',import.meta.url)),[state,phase],{env:buildChildEnv('terminal'),execArgv:['--disable-warning=ExperimentalWarning'],stdio:['ignore','ignore','ignore','ipc']});
    const root=readProc(child.pid!);if(root)owned.push(root);
    const messages:Record<string,unknown>[]=[];let id=0,exited=false;
    child.on('message',(m:Record<string,unknown>)=>{messages.push(m);if(m.owned)owned.push(...m.owned as ProcIdentity[]);});
    const exit=new Promise<number|null>(resolve=>child.once('exit',code=>{exited=true;resolve(code);}));
    const wait=async(key:string)=>{await until(()=>messages.some(m=>m[key]||m.fatal)||exited,30000);assert.ok(messages.some(m=>m[key]),`daemon did not reach ${key}`);};
    const rpc=async(op:string,agent?:'a'|'b'):Promise<Snapshot>=>{
      const n=++id;child.send({id:n,op,agent});await until(()=>messages.some(m=>m.id===n)||exited,30000);
      const result=messages.find(m=>m.id===n);assert.ok(result&&!result.error,`fixture operation failed: ${op}`);return result.value as Snapshot;
    };
    const running={child,root,wait,rpc,exit,exited:()=>exited};children.push(running);return running;
  }
  const count=(s:Snapshot,key:keyof Snapshot['work'])=>s.deliveries.filter(m=>m.commandId===s.work[key]).length;
  async function settled(daemon:Daemon,predicate:(s:Snapshot)=>boolean) {
    const end=Date.now()+30000;
    while(true){const s=await daemon.rpc('status');if(predicate(s))return s;assert.ok(Date.now()<end,'queue transition timed out');await new Promise(r=>setTimeout(r,10));}
  }
  try {
    const first=start('seed');await first.wait('ready');const before=await first.rpc('seed');
    assert.deepEqual(before.states,{one:'queued',two:'queued',three:'queued',user:'queued'});
    first.child.kill('SIGKILL');await first.exit;await until(()=>owned.every(p=>!isAlive(p)),30000);
    const second=start(mode);await second.wait('bootWaiting');
    const boot=await second.rpc('status');assert.deepEqual(boot.deliveries,before.deliveries);assert.equal(boot.early,false);
    await second.rpc('continue-boot');await second.wait('ready');
    if(mode==='held'||mode==='drained') {
      const held=await second.rpc('replay');assert.equal(held.held,true);assert.deepEqual(held.deliveries,before.deliveries);
      assert.deepEqual(held.states,before.states);await second.rpc('release');
    }
    let s=await settled(second,s=>s.states.one==='provider_acknowledged'&&s.states.three==='provider_acknowledged');
    assert.equal(s.early,false);assert.equal(count(s,'one'),1);assert.equal(count(s,'three'),1);
    assert.equal(count(s,'two'),0,'second wake waits for the first wake to finish');assert.equal(count(s,'user'),0);assert.equal(s.paused,before.paused);
    s=await second.rpc('replay');assert.equal(s.states.user,'queued');assert.equal(count(s,'one'),1);assert.equal(count(s,'two'),0);assert.equal(s.paused,before.paused);
    await second.rpc('finish','a');s=await settled(second,s=>s.states.two==='provider_acknowledged');assert.equal(count(s,'two'),1);
    await second.rpc('finish','a');await second.rpc('finish','b');
    s=await settled(second,s=>s.states.one==='completed'&&s.states.two==='completed'&&s.states.three==='completed');
    assert.equal(s.states.user,'queued');assert.equal(count(s,'user'),0);
    await second.rpc('resume-user');s=await settled(second,s=>s.states.user==='provider_acknowledged');assert.equal(count(s,'user'),1);
    await second.rpc('finish','b');s=await settled(second,s=>s.states.user==='completed');
    s=await second.rpc('replay');for(const key of ['one','two','three','user'] as const)assert.equal(count(s,key),1);
    second.child.kill('SIGTERM');assert.equal(await second.exit,0);
    if(mode==='normal') {
      const third=start('normal');await third.wait('bootWaiting');await third.rpc('continue-boot');await third.wait('ready');
      const again=await third.rpc('replay');assert.deepEqual(again.deliveries,s.deliveries);third.child.kill('SIGTERM');assert.equal(await third.exit,0);
    }
  } finally {
    for(const child of children)if(child.root)await killTree([child.root]);
    await until(()=>children.every(c=>c.exited())&&owned.every(p=>!isAlive(p)),30000);
    console.log(`queued restart ${mode}: owned=${new Set(owned.map(p=>`${p.pid}:${p.startTime}`)).size}, alive=0`);
  }
});
