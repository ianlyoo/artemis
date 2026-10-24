import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '../db.ts';
import { fixture, console, cli, intent, until } from './fixtures.ts';
import { Uploads } from '../uploads/index.ts';

test('P19 accepted work survives crash boundary; dispatching is delivery_unknown and never redelivered',async()=>{
  const f=fixture(),file=f.db.file;let id='',accepted='',dispatched='';
  try{
    id=(await f.core.create(intent(),console)).id;f.core.held=true;
    const a=f.core.acceptSend(id,{requestId:'accepted',text:'once'},cli,{principal:'system',channel:'wake'});accepted=a.commandId;
    f.core.transition(accepted,'accepted');
    const d=f.core.acceptSend(id,{requestId:'dispatched',text:'uncertain'},cli,{principal:'system',channel:'wake'});dispatched=d.commandId;f.core.transition(dispatched,'dispatching');
  }finally{await f.close();}
  const next=fixture(file);try{
    next.core.reconcile();assert.equal(next.core.commandState(accepted),'queued');assert.equal(next.core.commandState(dispatched),'delivery_unknown');
    assert.ok(next.core.timeline(id,{}).frames.some(f=>f.type==='message_ambiguous'&&f.commandId===dispatched));
    await next.core.send(id,{requestId:'new',text:'later',delivery:'queue'},cli);await until(()=>!!next.driver.sessions[0]?.sent.length);
    assert.deepEqual(next.driver.sessions[0].sent.map(m=>m.text),['once']);
    next.driver.sessions[0].finish();await until(()=>next.driver.sessions[0].sent.length===2);assert.deepEqual(next.driver.sessions[0].sent.map(m=>m.text),['once','later']);
  }finally{await next.close();}
});
test('idempotent queued wake replay kicks a recovered actor once without clearing a user cancel pause',async()=>{
  const f=fixture(),file=f.db.file;
  const user={requestId:'paused-user',text:'User message',delivery:'queue' as const};
  const wake={requestId:'wake-replay',text:'Queued before restart',delivery:'when_idle' as const,clientMessageId:'wake:event:17'};
  let id='',userId='',wakeId='';
  try {
    id=(await f.core.create(intent(),console)).id;f.core.held=true;
    userId=(await f.core.send(id,user,console)).commandId;
    await f.core.cancel(id,{requestId:'pause'},console);
    wakeId=(await f.core.send(id,wake,cli)).commandId;
  } finally {await f.close();}
  const next=fixture(file);
  try {
    next.core.reconcile();assert.equal(next.driver.sessions.length,0);
    const pause=next.db.meta(`paused:${id}`);
    const replay=await next.core.send(id,wake,cli);assert.equal(replay.commandId,wakeId);
    await next.core.actor(id).exclusive(async()=>{});
    await until(()=>next.core.commandState(wakeId)==='provider_acknowledged',30000);
    assert.equal((await next.core.send(id,user,console)).commandId,userId);
    assert.equal(next.core.commandState(userId),'queued');assert.equal(next.db.meta(`paused:${id}`),pause);
    assert.deepEqual(next.driver.sessions[0].sent.map(m=>m.clientMessageId),['wake:event:17']);
    await Promise.all(Array.from({length:8},()=>next.core.send(id,wake,cli)));
    next.driver.sessions[0].finish();await until(()=>next.core.commandState(wakeId)==='completed',30000);
    await next.core.send(id,wake,cli);assert.equal(next.driver.sessions[0].sent.length,1);
    assert.equal(next.core.commandState(userId),'queued');
    next.core.actor(id).resumeQueue();await until(()=>next.core.commandState(userId)==='provider_acknowledged',30000);
    assert.equal(next.driver.sessions[0].sent.filter(m=>m.commandId===userId).length,1);
  } finally {await next.close();}
});
test('slow provider ack cannot block cancel; late acknowledgement settles the canceled command',async()=>{
  const f=fixture();try{
    const {id}=await f.core.create(intent(),console);await f.core.send(id,{requestId:'first',text:'first'},console);await until(()=>!!f.driver.sessions[0]?.sent.length);
    let ack:((value:{accepted:true})=>void)|undefined;const session=f.driver.sessions[0];
    session.send=async m=>{session.sent.push(m);return new Promise<{accepted:true}>(r=>{ack=r;});};
    const send=await f.core.send(id,{requestId:'slow',text:'steer'},console);await until(()=>!!ack);
    const start=Date.now();const canceled=await f.core.cancel(id,{requestId:'cancel'},console);assert.equal(canceled.toolsRunning,0);assert.ok(Date.now()-start<1000);
    ack!({accepted:true});await until(()=>f.core.commandState(send.commandId)==='canceled');
  }finally{await f.close();}
});
test('hard stop, stop and archive keep cancellation outcome when provider exit races cleanup',async()=>{
  for(const action of ['cancel','stop','archive'] as const) {
    const f=fixture();try {
      const {id}=await f.core.create(intent(),console),sent=await f.core.send(id,{requestId:'run',text:'synthetic'},console);
      await until(()=>f.core.commandState(sent.commandId)==='provider_acknowledged',30000);
      const session=f.driver.sessions[0];let closed=false;
      session.hardStop=async()=>{
        session.events.push({type:'turn_failed',turnId:session.turnId,reason:'provider_exit'});
        session.events.push({type:'exited',code:null,signal:'SIGTERM'});
        await new Promise(r=>setTimeout(r,10));return {alive:0,killed:1};
      };
      session.close=async()=>{closed=true;session.events.end();};
      if(action==='cancel')assert.equal((await f.core.cancel(id,{requestId:'cancel',hardStop:true},console)).toolsRunning,0);
      else await f.core.actor(id).lifecycle(action,console);
      assert.equal(closed,true);
      assert.equal(f.core.commandState(sent.commandId),'canceled');
      assert.equal(f.db.prepare('SELECT outcome FROM turns WHERE agent_id=?').get(id)?.outcome,'canceled');
      const frames=f.core.timeline(id,{}).frames;
      assert.equal(frames.filter(f=>f.type==='turn_canceled').length,1);
      assert.equal(frames.filter(f=>f.type==='turn_failed').length,0);
    } finally {await f.close();}
  }
});
test('queue ceiling, pause expiry, unknown slash is plain steer, admission fails before spawn',async()=>{
  const f=fixture();try{
    const {id}=await f.core.create(intent(),console);f.core.held=true;
    for(let n=0;n<100;n++)await f.core.send(id,{requestId:String(n),text:String(n),delivery:'queue'},cli);
    await assert.rejects(f.core.send(id,{requestId:'full',text:'full',delivery:'queue'},cli),{code:'QUEUE_FULL'});
    assert.equal(f.core.pending(id).length,100);
    for(const item of f.core.pending(id))await f.core.actor(id).withdraw(item.id);
    f.core.release();await f.core.send(id,{requestId:'start',text:'start'},console);await until(()=>!!f.driver.sessions[0]?.sent.length);
    await f.core.send(id,{requestId:'slash',text:'/unknown plain text'},cli);await until(()=>f.driver.sessions[0].sent.length===2);assert.equal(f.driver.sessions[0].sent[1].delivery,'steer');
    await f.core.cancel(id,{requestId:'cancel'},console);f.core.db.setMeta(`paused:${id}`,Date.now()-1);
    await f.core.send(id,{requestId:'after-expiry',text:'after-expiry',delivery:'queue'},cli);await until(()=>f.driver.sessions[0].sent.length===3);
    const count=f.driver.sessions.length;f.policy.admitCreate=async()=>{throw new Error('synthetic adapter exception');};
    await assert.rejects(f.core.create(intent(),console),{code:'ADAPTER_ERROR'});assert.equal(f.driver.sessions.length,count);
  }finally{await f.close();}
});
test('retention gap resync, seven backups, schema pre-migration snapshot and 30-day upload retention',async()=>{
  const f=fixture();try{
    assert.ok(readdirSync(join(f.dir,'backup')).some(f=>f.startsWith('migration-0-')));
    const {id}=await f.core.create(intent(),console),cursor=f.journal.cursor(id);
    const uploads=new Uploads(f.db,f.dir),upload=uploads.store([{mime:'text/plain',data:Buffer.from('fixture')}],id)[0];
    f.db.setMeta(`uploadAt:${upload.id}`,Date.now()-31*86400000);const path=f.db.prepare('SELECT path FROM uploads WHERE id=?').get(upload.id)!.path;
    uploads.retain();assert.equal(existsSync(String(path)),false);
    await f.core.archive(id,console);f.db.prepare('UPDATE agents SET archived_at=? WHERE id=?').run(new Date(Date.now()-181*86400000).toISOString(),id);
    f.journal.retain();assert.equal(f.journal.needsResync(id,cursor),true);
    for(let n=1;n<=9;n++)f.journal.backup(f.dir,new Date(`2026-10-${String(n).padStart(2,'0')}T00:00:00Z`));
    assert.equal(readdirSync(join(f.dir,'backup')).filter(n=>n.startsWith('engine-')).length,7);
    const backup=new Database(join(f.dir,'backup','engine-2026-10-09.db'));assert.equal(backup.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');backup.close();
  }finally{await f.close();}
});
test('permission expiry auto-denies after thirty minutes',async t=>{
  const f=fixture();try{
    const {id}=await f.core.create(intent(),console);await f.core.send(id,{requestId:'run',text:'run'},console);await until(()=>!!f.driver.sessions[0]?.sent.length);
    t.mock.timers.enable({apis:['setTimeout']});
    const answer=f.driver.sessions[0].host.prompt({kind:'fixture',summary:'expires',allowedDecisions:['allow','deny'],turnId:null});
    t.mock.timers.tick(1800001);assert.equal((await answer).decision,'deny');assert.equal(f.core.actor(id).permissions().length,0);t.mock.timers.reset();
  }finally{t.mock.timers.reset();await f.close();}
});
test('P2 admitted identity/env and first prompt reach the Codex seam with configured console',async()=>{
  const f=fixture();try{
    f.driver.provider='codex';f.core.drivers.delete('claude');f.core.drivers.set('codex',f.driver);
    f.plugin.beforeCreate=async()=>({ok:true,env:{IDENTITY_ROLE:'synthetic'}});
    const {id}=await f.core.create(intent({provider:'codex',prompt:'first',env:{EXTRA:'value'}}),console);
    await until(()=>!!f.driver.sessions[0]?.sent.length);const spec=f.driver.specs[0];
    assert.equal(spec.env.CODEX_HOME,join(spec.env.HOME,'.codex'));assert.equal(spec.env.IDENTITY_ROLE,'synthetic');assert.equal(spec.env.EXTRA,'value');
    assert.equal(f.driver.sessions[0].sent[0].text,'first');assert.equal(f.core.get(id)?.prompt,'first');
    assert.ok(Object.keys(spec.env).every(k=>['HOME','PATH','USER','LOGNAME','LANG','SHELL','TERM','TMPDIR','CODEX_HOME','EXTRA','IDENTITY_ROLE'].includes(k)));
  }finally{await f.close();}
});
