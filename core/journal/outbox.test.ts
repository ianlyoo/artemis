import { listen, originOf, closeServer } from '../test-support/ports.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import type { OutboxTarget } from '../types.ts';
import { OutboxPump } from './outbox.ts';
import { fixture,console,intent,until } from './fixtures.ts';

test('P35: real HTTP outbox survives restart and a 60-second outage in target order',{timeout:180000},async()=>{
  const f=fixture();const received:string[]=[];let available=false;
  const server=createServer((req,res)=>{res.setHeader('Connection','close');req.resume();if(!available){res.writeHead(503);res.end();return;}received.push(String(req.headers['idempotency-key']));res.end('{}');});
  await listen(server);let pump=new OutboxPump(f.db,{fixture:originOf(server)});
  try {
    const {id}=await f.core.create(intent(),console);
    f.plugin.onEvent=(frame,outbox)=>outbox.put({key:`event-${frame.seq}`,target:'fixture',path:'/event',body:frame});
    f.journal.append(id,{type:'first'});f.journal.append(id,{type:'second'});pump.start();
    await until(()=>Number(f.db.prepare('SELECT attempts FROM outbox ORDER BY id LIMIT 1').get()?.attempts)>0,30000);
    await pump.close();pump=new OutboxPump(f.db,{fixture:originOf(server)});pump.start();
    await delay(60000);assert.equal(received.length,0);available=true;
    await until(()=>received.length===2,90000);assert.deepEqual(received,['event-3','event-4']);
    // The target records a row before the pump commits it as delivered: wait for the commit, not the request.
    await until(()=>Number(f.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='delivered'").get()?.n)===2,10000);
  } finally {await pump.close();await closeServer(server);await f.close();}
});
test('recovery makes backed-off rows due and flushes them in order in the same tick',async()=>{
  const f=fixture();const received:string[]=[];let available=false;
  const server=createServer((req,res)=>{res.setHeader('Connection','close');req.resume();if(!available){res.writeHead(503);res.end();return;}received.push(String(req.headers['idempotency-key']));res.end('{}');});
  await listen(server);
  const pump=new OutboxPump(f.db,{fixture:originOf(server)});
  try {
    f.db.tx(()=>{for(const key of ['one','two','three'])f.journal.put({key,target:'fixture',path:'/event',body:{synthetic:true}});});
    f.db.prepare('UPDATE outbox SET attempts=30').run();
    await pump.tick();
    const deadline=Number(f.db.prepare('SELECT next_at FROM outbox ORDER BY id LIMIT 1').get()?.next_at);
    assert.ok(deadline<=Date.now()+9750,'retry backoff plus pump interval is at most ten seconds');
    assert.deepEqual(received,[]);
    f.db.prepare('UPDATE outbox SET next_at=? WHERE id>(SELECT MIN(id) FROM outbox)').run(Date.now()+3600000);
    available=true;await pump.tick(deadline);
    assert.deepEqual(received,['one','two','three']);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='delivered'").get()?.n,3);
  } finally {await pump.close();await closeServer(server);await f.close();}
});
test('outbox concatenates a target base path and event path',async()=>{
  const f=fixture();let path='';const server=createServer((req,res)=>{res.setHeader('Connection','close');path=req.url??'';req.resume();res.end('{}');});await listen(server);
  const pump=new OutboxPump(f.db,{fixture:originOf(server)+'/base'});
  try{f.db.tx(()=>f.journal.put({key:'base',target:'fixture',path:'/event',body:{synthetic:true}}));await pump.tick();assert.equal(path,'/base/event');}
  finally{await pump.close();await closeServer(server);await f.close();}
});

test('plugin delivery persists before acknowledgement; retry, throw and restart preserve target order and keys',async()=>{
  let f=fixture();const file=join(f.dir,'engine.db'),seen:{key:string;attempts:number}[]=[];let outcome:'retry'|'throw'|'delivered'='retry';
  const target:OutboxTarget={async deliver(row){
    seen.push({key:row.key,attempts:row.attempts});assert.equal(row.path,'/register');assert.deepEqual(row.body,{synthetic:true});
    // Adapter-side persistence happens before the pump acknowledges; repeat keys are harmless.
    f.db.tx(()=>f.db.setMeta(`response:${row.key}`,{persisted:true}));
    assert.equal(f.db.prepare('SELECT state FROM outbox WHERE key=?').get(row.key)?.state,'pending');
    if(outcome==='throw')throw new Error('synthetic adapter failure');return outcome;
  }};
  let pump=new OutboxPump(f.db,{}, {pluginTargets:{plugin:target}});
  try {
    f.db.tx(()=>{for(const key of ['one','two','one'])f.journal.put({key,target:'plugin',path:'/register',body:{synthetic:true}});});
    await pump.tick();assert.deepEqual(seen,[{key:'one',attempts:0}]);assert.deepEqual(f.db.meta('response:one'),{persisted:true});
    const firstDeadline=Number(f.db.prepare('SELECT next_at FROM outbox WHERE key=?').get('one')?.next_at);
    await pump.tick(firstDeadline-1);assert.equal(seen.length,1);
    await pump.close();await f.close();f=fixture(file);pump=new OutboxPump(f.db,{}, {pluginTargets:{plugin:target}});
    outcome='throw';await pump.tick(firstDeadline);assert.deepEqual(seen.at(-1),{key:'one',attempts:1});
    const retry=f.db.prepare('SELECT * FROM outbox WHERE key=?').get('one')!;assert.equal(retry.state,'pending');assert.equal(retry.attempts,2);
    f.db.prepare('UPDATE outbox SET next_at=? WHERE key=?').run(Date.now()+3600000,'two');
    outcome='delivered';await pump.tick(Number(retry.next_at));
    assert.deepEqual(seen,[{key:'one',attempts:0},{key:'one',attempts:1},{key:'one',attempts:2},{key:'two',attempts:0}]);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='delivered'").get()?.n,2);
    await pump.close();await f.close();f=fixture(file);pump=new OutboxPump(f.db,{}, {pluginTargets:{plugin:target}});await pump.tick();assert.equal(seen.length,4);
    assert.deepEqual(f.db.meta('response:two'),{persisted:true});
  } finally {await pump.close();await f.close();}
});

test('plugin drop fails only that row, logs only its key, and unlisted targets retain HTTP delivery',async()=>{
  const f=fixture(),logs:unknown[]=[],seen:string[]=[],http:string[]=[];
  const server=createServer((req,res)=>{res.setHeader('Connection','close');http.push(String(req.headers['idempotency-key']));req.resume();res.end('{}');});await listen(server);
  const pump=new OutboxPump(f.db,{http:originOf(server),plugin:originOf(server)}, {
    pluginTargets:{plugin:{async deliver(row){seen.push(row.key);return row.key==='drop'?'drop':'delivered';}}},log:(event,extra)=>logs.push({event,...extra}),
  });
  try {
    f.db.tx(()=>{for(const key of ['drop','next'])f.journal.put({key,target:'plugin',path:'/private-path',body:{private:'synthetic body omitted from log'}});f.journal.put({key:'plain',target:'http',path:'/event',body:{synthetic:true}});});
    await pump.tick();assert.deepEqual(seen,['drop','next']);assert.deepEqual(http,['plain']);assert.deepEqual(logs,[{event:'outbox.drop',key:'drop'}]);
    assert.equal(f.db.prepare('SELECT state FROM outbox WHERE key=?').get('drop')?.state,'failed');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='delivered'").get()?.n,2);
    await pump.tick();assert.equal(seen.length,2);
  } finally {await pump.close();await closeServer(server);await f.close();}
});

test('slow plugin delivery times out to retry, other targets progress, and a late rejection is observed',async()=>{
  const f=fixture();let rejectLate:(e:Error)=>void=()=>{};const seen:string[]=[];
  const pump=new OutboxPump(f.db,{}, {deliveryTimeoutMs:30,pluginTargets:{slow:{deliver:()=>new Promise((_,reject)=>{rejectLate=reject;})},fast:{async deliver(row){seen.push(row.key);return 'delivered';}}}});
  try {
    f.db.tx(()=>{for(const [key,target] of [['slow-one','slow'],['slow-two','slow'],['fast-one','fast']])f.journal.put({key,target,path:'/event',body:null});});
    await pump.tick();assert.deepEqual(seen,['fast-one']);
    const rows=f.db.prepare('SELECT key,state,attempts FROM outbox ORDER BY id').all();
    assert.deepEqual(rows.map(r=>[r.key,r.state,r.attempts]),[['slow-one','pending',1],['slow-two','pending',0],['fast-one','delivered',1]]);
    rejectLate(new Error('synthetic late failure'));await delay(0);
  } finally {await pump.close();await f.close();}
});

test('close interrupts a pending plugin delivery and concurrent ticks share a single attempt',async()=>{
  const f=fixture();let release:(value:'delivered')=>void=()=>{},calls=0;
  const pump=new OutboxPump(f.db,{}, {pluginTargets:{plugin:{deliver:()=>{calls++;return new Promise(resolve=>{release=resolve;});}}}});
  try {
    f.db.tx(()=>f.journal.put({key:'pending',target:'plugin',path:'/event',body:null}));
    const tick=pump.tick();assert.equal(pump.tick(),tick);await until(()=>calls===1);
    await pump.close();await tick;release('delivered');await delay(0);
    assert.equal(f.db.prepare('SELECT state FROM outbox').get()?.state,'pending');assert.equal(f.db.prepare('SELECT attempts FROM outbox').get()?.attempts,0);
  } finally {await pump.close();await f.close();}
});
