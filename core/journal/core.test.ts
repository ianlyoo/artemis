import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../db.ts';
import { buildChildEnv, assertDaemonEnv } from '../env.ts';
import { fixture,console,cli,intent,until } from './fixtures.ts';
import type { Frame, Principal } from '../types.ts';

test('transaction rollback, nested joins, durable command/event/outbox and after-COMMIT publication',async()=>{
  const f=fixture();try {
    const {id}=await f.core.create(intent(),console),seen:Frame[]=[];
    f.journal.subscribe({agents:[id]},n=>{if(n.op==='frame'){assert.equal(f.db.inTransaction,false);seen.push(n.frame);}});
    f.plugin.onEvent=(frame,outbox)=>outbox.put({key:`${frame.agentId}:${frame.seq}`,target:'fixture',path:'/events',body:frame});
    assert.throws(()=>f.db.tx(()=>{f.journal.append(id,{type:'rollback'});throw new Error('abort');}));
    assert.equal(seen.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM outbox').get()?.n,0);
    f.db.tx(()=>{f.db.tx(()=>f.journal.append(id,{type:'committed'}));assert.equal(seen.length,0);});
    assert.equal(seen.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM outbox').get()?.n,1);
    assert.equal(f.db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');
    assert.equal(f.db.prepare('PRAGMA synchronous').get()?.synchronous,2);
    assert.equal(f.db.prepare('PRAGMA journal_mode').get()?.journal_mode,'wal');
    assert.throws(()=>f.db.tx(()=>{try{f.db.tx(()=>{throw new Error('nested');});}catch{}f.journal.append(id,{type:'must_rollback'});}));
    assert.equal(seen.length,1);
  } finally {await f.close();}
});
test('environment is built from an allowlist plus intent env; forbidden keys fail closed',()=>{
  const env=buildChildEnv('codex',{FIXTURE_ID:'ok'},{PATH:'/usr/bin',HOME:'/wrong',TERM:'xterm',UNRELATED:'omit'},{home:'/scratch',codexHome:'/scratch/.codex'});
  assert.equal(env.HOME,'/scratch');assert.equal(env.CODEX_HOME,'/scratch/.codex');assert.equal(env.FIXTURE_ID,'ok');assert.equal(env.UNRELATED,undefined);
  assert.throws(()=>buildChildEnv('claude',{LEDGER_FIXTURE:'x'}));assert.throws(()=>assertDaemonEnv({CLAUDECODE:'1'}));
  const db=new Database(':memory:',{freeBytes:()=>1024**3});db.close();
  assert.throws(()=>new Database(':memory:',{freeBytes:()=>1}),{code:'STORAGE_FULL',status:507});
});
test('create fields, label filters, send client ids, steer, idempotency and bounded idle wait',async()=>{
  const f=fixture();try {
    const i=intent({labels:{group:'a'},env:{FIXTURE_ID:'value'},identity:{role:'synthetic'}}),a=await f.core.create(i,console);
    assert.deepEqual(await f.core.create(i,console),a);assert.equal(f.core.list({labels:{group:'a'}}).length,1);assert.equal(f.core.list({labels:{group:'b'}}).length,0);
    const record=f.core.get(a.id)!;assert.equal(record.model,i.model);assert.equal(record.mode,i.mode);assert.equal(record.thinking,i.thinking);assert.equal(record.env.FIXTURE_ID,'value');
    const m={requestId:'first',text:'hello',clientMessageId:'console-test'},r=await f.core.send(a.id,m,console);
    await until(()=>f.core.commandState(r.commandId)==='provider_acknowledged');
    const retry=await f.core.send(a.id,m,console);assert.equal(retry.commandId,r.commandId);assert.equal(f.driver.sessions[0].sent.length,1);
    await assert.rejects(f.core.send(a.id,{...m,text:'changed'},console),{code:'IDEMPOTENCY_CONFLICT'});
    const before=Date.now();assert.equal((await f.core.waitFor(a.id,'idle',30)).state,'running');assert.ok(Date.now()-before<1000);
    await f.core.send(a.id,{requestId:'steer',text:'next'},console);await until(()=>f.driver.sessions[0].sent.length===2);
    assert.equal(f.driver.sessions[0].sent[1].delivery,'steer');assert.equal(f.driver.sessions[0].interrupts,0);
    assert.equal((f.core.timeline(a.id,{kinds:['message']}).frames[0].item as {clientMessageId:string}).clientMessageId,'console-test');
    f.driver.sessions[0].finish();await until(()=>f.core.get(a.id)?.state==='idle');assert.equal(f.core.commandState(r.commandId),'completed');
  } finally {await f.close();}
});
test('queue FIFO, withdraw, compact at idle, cancel pause skips wakes, user interrupt authority',async()=>{
  const f=fixture();try {
    const a=await f.core.create(intent(),console);await f.core.send(a.id,{requestId:'start',text:'start'},console);await until(()=>!!f.driver.sessions[0]?.sent.length);
    const queued=await f.core.send(a.id,{requestId:'withdraw',text:'withdraw',delivery:'queue'},cli);
    await f.core.actor(a.id).withdraw(queued.commandId);
    await f.core.send(a.id,{requestId:'compact',text:'/compact'},cli);
    const agent:Principal={kind:'agent',name:`agent:${a.id}`,agentId:a.id};
    await assert.rejects(f.core.send(a.id,{requestId:'denied',text:'interrupt',delivery:'interrupt'},agent),{code:'INTERRUPT_FORBIDDEN'});
    await f.core.cancel(a.id,{requestId:'cancel'},console);
    await f.core.send(a.id,{requestId:'wake',text:'wake',delivery:'when_idle'},cli);await until(()=>f.driver.sessions[0].sent.length===2);
    assert.equal(f.driver.sessions[0].sent[1].text,'wake');f.driver.sessions[0].finish();await until(()=>f.core.get(a.id)?.state==='idle');
    f.core.actor(a.id).resumeQueue();await until(()=>f.driver.sessions[0].sent.length===3);assert.equal(f.driver.sessions[0].sent[2].text,'/compact');
    await f.core.send(a.id,{requestId:'interrupt',text:'user interrupt',delivery:'interrupt'},console);await until(()=>f.driver.sessions[0].sent.length===4);
    assert.equal(f.driver.sessions[0].sent[3].delivery,'start');assert.ok(f.driver.sessions[0].interrupts>=2);
  } finally {await f.close();}
});
test('C30 explicit interrupt runs a held compact once; ordinary compact still queues',async()=>{
  const f=fixture();try {
    const {id}=await f.core.create(intent(),console);
    await f.core.send(id,{requestId:'start',text:'busy'},console);
    await until(()=>!!f.driver.sessions[0]?.sent.length);
    const session=f.driver.sessions[0],turn=f.core.get(id)!.activeTurnId;
    const queued=await f.core.send(id,{requestId:'ordinary-compact',text:'/compact'},console);
    assert.equal(queued.state,'queued');assert.equal(session.sent.length,1);assert.equal(session.interrupts,0);
    await f.core.actor(id).withdraw(queued.commandId);
    const denied:Principal={kind:'agent',name:`agent:${id}`,agentId:id};
    await assert.rejects(f.core.send(id,{requestId:'denied-compact',text:'/compact',delivery:'interrupt'},denied),{code:'INTERRUPT_FORBIDDEN'});
    const message={requestId:'send-now-compact',clientMessageId:'console-held',text:'/compact',delivery:'interrupt' as const};
    const results=await Promise.all([f.core.send(id,message,console),f.core.send(id,message,console)]);
    assert.equal(results[0].commandId,results[1].commandId);
    await until(()=>f.core.commandState(results[0].commandId)==='provider_acknowledged');
    assert.equal(session.interrupts,1);assert.equal(session.sent.length,2);
    assert.equal(session.sent[1].text,'/compact');assert.equal(session.sent[1].delivery,'start');
    assert.notEqual(f.core.get(id)!.activeTurnId,turn);
    const frames=f.core.timeline(id,{}).frames;
    assert.equal(frames.filter(e=>e.type==='turn_canceled'&&e.turnId===turn).length,1);
    assert.equal(frames.filter(e=>e.type==='timeline'&&(e.item as any)?.clientMessageId==='console-held').length,1);
    session.finish();await until(()=>f.core.commandState(results[0].commandId)==='completed');
    await f.core.send(id,message,console);
    assert.equal(session.sent.length,2);assert.equal(session.interrupts,1);
  } finally {await f.close();}
});
test('journal pages, reconnect, coalescing, stale generation, rewind invalidates cursors',async()=>{
  const f=fixture();try {
    const {id}=await f.core.create(intent(),console);let cursor=f.journal.cursor(id);
    for(let n=0;n<240;n++)f.journal.append(id,{type:'timeline',item:{type:'assistant_message',text:String(n),messageId:null}});
    const first=f.journal.timeline(id,{after:cursor,limit:999});assert.equal(first.frames.length,200);
    const second=f.journal.timeline(id,{after:first.cursor});assert.equal(second.frames.length,40);assert.equal(second.frames[0].seq,first.cursor.seq+1);
    const tail=f.journal.timeline(id,{kinds:['message'],tail:80});assert.equal(tail.frames.length,80);assert.equal((tail.frames[0].item as {text:string}).text,'160');
    const seen:unknown[]=[];const off=f.journal.subscribe({agents:[id],after:{[id]:second.cursor}},n=>seen.push(n));
    f.journal.output(id,{type:'timeline',driverGeneration:0,item:{type:'assistant_message',text:'a',delta:true}});
    f.journal.output(id,{type:'timeline',driverGeneration:0,item:{type:'assistant_message',text:'b',delta:true}});
    await until(()=>seen.length===1);assert.equal((seen[0] as {frame:{item:{text:string}}}).frame.item.text,'ab');
    f.journal.append(id,{type:'stale',driverGeneration:-1});assert.equal(seen.length,1);
    cursor=f.journal.cursor(id);await f.core.actor(id).rewind('message');assert.ok(seen.some(n=>(n as {op:string}).op==='resync_required'));
    assert.equal(f.journal.needsResync(id,cursor),true);assert.equal(f.core.get(id)?.epoch,'2');off();
  } finally {await f.close();}
});
test('permission CAS, gate exceptions deny, settings, stop/archive/reopen and cleanup',async()=>{
  const f=fixture();try {
    const {id}=await f.core.create(intent({parentId:'parent'}),console);await f.core.send(id,{requestId:'start',text:'start'},console);await until(()=>!!f.driver.sessions[0]);
    const session=f.driver.sessions[0];f.policy.gate=async()=>{throw new Error('policy crash');};assert.equal((await session.host.gate({kind:'read',tool:'Read',paths:[],cwd:'.'},{tool:'Read',input:{}})).allow,false);
    const answer=session.host.prompt({kind:'tool',summary:'synthetic',allowedDecisions:['allow','deny'],turnId:null});
    const prompt=f.core.actor(id).permissions()[0];
    assert.throws(()=>f.core.actor(id).decide(String(prompt.id),{expectDigest:'wrong',decision:'allow'},console),{code:'PERMISSION_STALE'});
    f.core.actor(id).decide(String(prompt.id),{expectDigest:String(prompt.request_digest),decision:'allow'},console);assert.equal((await answer).decision,'allow');
    assert.throws(()=>f.core.actor(id).decide(String(prompt.id),{expectDigest:String(prompt.request_digest),decision:'allow'},console),{code:'PERMISSION_STALE'});
    await f.core.actor(id).settings({model:'new',thinking:'medium',mode:'plan'});assert.equal(f.core.get(id)?.model,'new');
    assert.deepEqual(await f.core.cleanupChildren({parentId:'parent',idleHours:0},console),{archived:[]});
    session.finish();await until(()=>f.core.get(id)?.state==='idle');
    assert.deepEqual(await f.core.cleanupChildren({parentId:'parent',idleHours:0},console),{archived:[id]});
    await assert.rejects(f.core.send(id,{requestId:'archived',text:'x'},console),{code:'ARCHIVED'});
    await f.core.actor(id).lifecycle('reopen',console);await f.core.actor(id).lifecycle('stop',console);assert.equal(f.core.get(id)?.status,'closed');
    const ws=f.core.workspaces()[0];f.core.updateWorkspace(String(ws.id),{title:'renamed',archived:true});assert.equal(f.core.workspaces()[0].title,'renamed');
  } finally {await f.close();}
});
test('restart preserves queued work, never replays unknown delivery, lazy same-native resume',async()=>{
  const f=fixture();const file=f.db.file;let id='',native='';try {
    id=(await f.core.create(intent(),console)).id;f.driver.failAck=true;
    const r=await f.core.send(id,{requestId:'lost',text:'lost'},console);await until(()=>f.core.commandState(r.commandId)==='delivery_unknown');
    native=f.driver.sessions[0].nativeId;assert.equal(f.driver.sessions[0].sent.length,1);
    await f.core.send(id,{requestId:'lost',text:'lost'},console);assert.equal(f.driver.sessions[0].sent.length,1);
    f.core.held=true;await f.core.send(id,{requestId:'queued',text:'queued',delivery:'queue'},cli);
  } finally {await f.close();}
  const next=fixture(file);try {
    next.core.reconcile();assert.equal(next.driver.sessions.length,0);assert.equal(next.core.pending(id).length,1);
    await next.core.send(id,{requestId:'after',text:'after',delivery:'queue'},cli);await until(()=>!!next.driver.sessions[0]?.sent.length);
    assert.equal(next.driver.resumes[0],native);assert.equal(next.driver.sessions[0].sent[0].text,'queued');assert.equal(next.core.get(id)?.driverGeneration,2);
  } finally {await next.close();}
});
