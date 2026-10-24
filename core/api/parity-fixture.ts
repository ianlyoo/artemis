import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { startEngine } from '../main.ts';
import { Auth } from './auth.ts';
import { callLocal } from './transport.ts';
import { FakeDriver, fakePlugin, fakePolicy, fakeMcp, fakeTerminals, intent, until } from '../journal/fixtures.ts';
import { processTree, readProc } from '../procs/posix.ts';

const [mode,stateDir]=process.argv.slice(2),plugin=fakePlugin(),driver=new FakeDriver();
let releaseSpawn:()=>void=()=>{},spawnWaiting=false;
const spawnGate=new Promise<void>(resolve=>{releaseSpawn=resolve;});
if(mode==='idle')plugin.beforeSpawn=async(_,spec)=>{spawnWaiting=true;await spawnGate;return spec;};
let h:Awaited<ReturnType<typeof startEngine>>|undefined;
try {
  h=await startEngine({stateDir,apiPort:0,mcpPort:0},{plugin,drivers:[driver],policy:()=>fakePolicy(plugin),terminals:()=>fakeTerminals(),mcp:()=>fakeMcp()});
  process.send?.({owned:processTree(readProc(process.pid)!)});
  const credential=randomBytes(32).toString('base64url');new Auth(h.db,stateDir).register({name:'console'},credential);
  const call=(method:string,path:string,body?:unknown)=>callLocal({port:h!.apiPort,token:credential,method,path,body});
  if(mode==='idle') {
    const created=await call('POST','/v1/agents',intent({prompt:'First prompt'}));assert.equal(created.status,201);
    const id=(created.body as {id:string}).id;
    await until(()=>spawnWaiting,30000);assert.equal(h.core.get(id)?.state,'idle');assert.equal(h.core.pending(id).length,1);
    let returned=false;
    const waiting=call('GET',`/v1/agents/${id}?waitFor=idle&timeoutMs=30000`).then(result=>{returned=true;return result;});
    void waiting.catch(()=>{});
    const started=Date.now();await call('GET',`/v1/agents/${id}?waitFor=idle&timeoutMs=100`);
    assert.ok(Date.now()-started>=90,'queued prompt must wait for its timeout');assert.ok(Date.now()-started<1100,'wait must remain bounded');
    assert.equal(returned,false,'unstarted prompt is not idle');releaseSpawn();
    await until(()=>!!driver.sessions[0]?.sent.length,30000);
    await call('POST',`/v1/agents/${id}/messages`,{requestId:'queued',text:'Second turn',delivery:'queue'});
    driver.sessions[0].finish();await until(()=>driver.sessions[0].sent.length===2,30000);
    await call('GET',`/v1/agents/${id}?waitFor=idle&timeoutMs=100`);assert.equal(returned,false,'idle boundary with queued work does not end the wait');
    driver.sessions[0].finish();assert.equal(((await waiting).body as {state:string}).state,'idle');assert.equal(h.core.pending(id).length,0);
    // A terminal event can beat the send acknowledgement: dispatching still prevents idle.
    const session=driver.sessions[0];let ack:()=>void=()=>{};
    session.send=async message=>{session.sent.push(message);session.events.push({type:'turn_started',turnId:'late-ack',commandId:message.commandId});return new Promise(resolve=>{ack=()=>resolve({accepted:true,nativeTurnId:'late-ack'});});};
    const sent=await call('POST',`/v1/agents/${id}/messages`,{requestId:'late-ack',text:'Await acknowledgement'}),commandId=(sent.body as {commandId:string}).commandId;
    await until(()=>h!.core.commandState(commandId)==='dispatching',30000);
    session.events.push({type:'turn_completed',turnId:'late-ack'});await until(()=>h!.core.get(id)?.state==='idle',30000);
    const pendingAt=Date.now();await call('GET',`/v1/agents/${id}?waitFor=idle&timeoutMs=100`);assert.ok(Date.now()-pendingAt>=90);
    ack();await until(()=>h!.core.commandState(commandId)==='completed',30000);
    assert.equal(((await call('GET',`/v1/agents/${id}?waitFor=idle&timeoutMs=100`)).body as {state:string}).state,'idle');
  } else if(mode.startsWith('interrupt-')) {
    const created=await call('POST','/v1/agents',intent()),id=(created.body as {id:string}).id;
    const first=await call('POST',`/v1/agents/${id}/messages`,{requestId:'busy',text:'Busy turn'}),oldCommand=(first.body as {commandId:string}).commandId;
    await until(()=>h!.core.commandState(oldCommand)==='provider_acknowledged',30000);
    const session=driver.sessions[0],oldNative=session.turnId!,oldLogical=h.core.get(id)!.activeTurnId;
    // The provider confirms interrupt() now, but its old terminal event arrives later.
    session.interrupt=async()=>{session.interrupts++;};
    const newNative=randomUUID();let ack:()=>void=()=>{};
    session.send=async message=>{session.sent.push(message);return new Promise(resolve=>{ack=()=>resolve({accepted:true,nativeTurnId:newNative});});};
    const interrupted=await call('POST',`/v1/agents/${id}/messages`,{requestId:'interrupt',text:'Replacement turn',delivery:'interrupt'});
    assert.equal(interrupted.status,202);const commandId=(interrupted.body as {commandId:string}).commandId;
    await until(()=>session.sent.length===2,30000);
    const newLogical=h.core.get(id)!.activeTurnId;assert.ok(newLogical);assert.notEqual(newLogical,oldLogical);assert.equal(h.core.commandState(oldCommand),'canceled');
    if(mode==='interrupt-after-ack'){ack();await until(()=>h!.core.commandState(commandId)==='provider_acknowledged',30000);}
    session.events.push({type:'turn_started',turnId:oldNative,commandId:oldCommand});
    session.events.push({type:'turn_started',turnId:oldNative});
    for(const type of ['turn_canceled','turn_completed','turn_failed'] as const)session.events.push({type,turnId:oldNative,reason:'late-old'});
    session.events.push({type:'turn_canceled',turnId:null,reason:'unidentified'});
    await until(()=>h!.core.timeline(id,{}).frames.some(f=>f.stale&&f.reason==='unidentified'),30000);
    assert.equal(h.core.get(id)?.activeTurnId,newLogical);assert.equal(h.core.get(id)?.state,'running');
    assert.equal(h.core.commandState(commandId),mode==='interrupt-after-ack'?'provider_acknowledged':'dispatching');
    if(mode==='interrupt-early-result') {
      session.events.push({type:'turn_completed',turnId:newNative});
      await until(()=>h!.core.timeline(id,{}).frames.some(f=>f.stale&&f.turnId===newNative),30000);
      assert.equal(h.core.get(id)?.activeTurnId,newLogical);ack();
    } else {
      session.events.push({type:'turn_started',turnId:newNative,commandId});ack();
      await until(()=>h!.core.commandState(commandId)==='provider_acknowledged',30000);
      if(mode==='interrupt-after-ack') {
        const generation=h.core.get(id)!.driverGeneration;
        h.db.prepare('UPDATE agents SET driver_generation=? WHERE id=?').run(generation+1,id);
        session.events.push({type:'turn_completed',turnId:newNative,reason:'old-generation'});
        await until(()=>h!.core.timeline(id,{}).frames.some(f=>f.stale&&f.reason==='old-generation'),30000);
        assert.equal(h.core.get(id)?.activeTurnId,newLogical);
        h.db.prepare('UPDATE agents SET driver_generation=? WHERE id=?').run(generation,id);
      }
      session.events.push({type:'turn_completed',turnId:newNative});
    }
    await until(()=>h!.core.commandState(commandId)==='completed',30000);
    const frames=h.core.timeline(id,{}).frames.filter(f=>!f.stale);
    assert.deepEqual(frames.filter(f=>f.type==='turn_canceled').map(f=>f.turnId),[oldLogical]);
    assert.deepEqual(frames.filter(f=>f.type==='turn_completed').map(f=>f.turnId),[newLogical]);
    assert.deepEqual(frames.filter(f=>f.type==='command_state'&&f.commandId===commandId).map(f=>f.state),['accepted','dispatching','provider_acknowledged','completed']);
  } else throw new Error('Unknown parity fixture');
  process.send?.({passed:true});
} catch(error) {
  process.send?.({failed:true,detail:error instanceof assert.AssertionError?error.message:'Parity fixture failed'});process.exitCode=1;
} finally {releaseSpawn();await h?.close();process.disconnect();}
