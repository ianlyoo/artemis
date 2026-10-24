import { startEngine } from '../main.ts';
import type { Database } from '../db.ts';
import type { Registry } from '../registry.ts';
import { FakeDriver, fakePlugin, fakePolicy, fakeMcp, fakeTerminals, console, cli, intent, until } from '../journal/fixtures.ts';
import { processTree, readProc } from '../procs/posix.ts';

const [stateDir,mode]=process.argv.slice(2),plugin=fakePlugin(),driver=new FakeDriver();
const wake=(n:number)=>({requestId:`wake-${n}`,text:'Queued before restart',delivery:'when_idle' as const,clientMessageId:`wake:event:${n}`});
const user={requestId:'paused-user',text:'User message',delivery:'queue' as const};
type Delivery={agentId:string;commandId:string;clientMessageId?:string};
type Work={a:string;b:string;one:string;two:string;three:string;user:string};
let db:Database,core:Registry,h:Awaited<ReturnType<typeof startEngine>>|undefined,bootComplete=false,mcpReady=false;
let continueBoot:()=>void=()=>{};
const bootGate=new Promise<void>(resolve=>{continueBoot=resolve;});
const originalStart=driver.start.bind(driver);
driver.start=async(spec,host,resume)=>{
  if(!bootComplete||!mcpReady){db.setMeta('fixture:earlyDispatch',true);throw new Error('Dispatch before boot completed');}
  const session=await originalStart(spec,host,resume),send=session.send.bind(session);
  session.send=async message=>{
    db.setMeta('fixture:deliveries',[...(db.meta<Delivery[]>('fixture:deliveries')??[]),{agentId:spec.agentId,commandId:message.commandId,clientMessageId:message.clientMessageId}]);
    return send(message);
  };
  return session;
};
plugin.onBoot=async ctx=>{
  core=ctx.core as Registry;
  if(mode!=='seed') {
    const work=db.meta<Work>('fixture:work')!;
    if(mode==='held')core.held=true;
    if(mode==='drained')await core.drain(0);
    if(['replay','held','drained'].includes(mode))await core.send(work.a,wake(1),cli);
    process.send?.({bootWaiting:true});await bootGate;
  }
  bootComplete=true;
};
const snapshot=()=>{
  const work=db.meta<Work>('fixture:work')!;
  return {work,held:core.held,early:db.meta('fixture:earlyDispatch')??false,deliveries:db.meta<Delivery[]>('fixture:deliveries')??[],
    states:Object.fromEntries(['one','two','three','user'].map(k=>[k,core.commandState(work[k as keyof Work])])),paused:db.meta<number>(`paused:${work.b}`)??0};
};
process.on('message',(message:{id:number;op:string;agent?:'a'|'b'})=>{
  void (async()=>{
    if(message.op==='continue-boot'){continueBoot();return {};}
    if(message.op==='seed') {
      const a=(await core.create(intent(),console)).id,b=(await core.create(intent(),console)).id;
      const running=await core.send(a,{requestId:'hold',text:'Hold prior turn'},console);
      await until(()=>core.commandState(running.commandId)==='provider_acknowledged',30000);
      core.held=true;
      const queuedUser=await core.send(b,user,console);await core.cancel(b,{requestId:'pause'},console);
      const one=await core.send(a,wake(1),cli),two=await core.send(a,wake(2),cli),three=await core.send(b,wake(3),cli);
      db.setMeta('fixture:work',{a,b,one:one.commandId,two:two.commandId,three:three.commandId,user:queuedUser.commandId});
    } else if(message.op==='release')core.release();
    else if(message.op==='resume-user')core.actor(db.meta<Work>('fixture:work')!.b).resumeQueue();
    else if(message.op==='replay') {
      const work=db.meta<Work>('fixture:work')!;
      await Promise.all([core.send(work.a,wake(1),cli),core.send(work.a,wake(2),cli),core.send(work.b,wake(3),cli),core.send(work.b,user,console)]);
    } else if(message.op==='finish') {
      const id=db.meta<Work>('fixture:work')![message.agent!];
      const index=driver.specs.findLastIndex(spec=>spec.agentId===id);driver.sessions[index].finish();
    }
    // A control-lane barrier makes negative queue assertions deterministic.
    for(const actor of core.actors.values())await actor.exclusive(async()=>{});
    return snapshot();
  })().then(value=>process.send?.({id:message.id,value}),()=>process.send?.({id:message.id,error:true}));
});
try {
  h=await startEngine({stateDir,apiPort:0,mcpPort:0},{plugin,drivers:[driver],
    policy:database=>{db=database;process.send?.({owned:processTree(readProc(process.pid)!)});return fakePolicy(plugin);},
    terminals:()=>fakeTerminals(),mcp:()=>{const mcp=fakeMcp();mcp.start=async()=>{mcpReady=true;return {port:0};};return mcp;}});
  process.once('SIGTERM',()=>{void h!.close().then(()=>{process.disconnect();process.exitCode=0;},()=>{process.disconnect();process.exitCode=1;});});
  process.send?.({ready:true,apiPort:h.apiPort,mcpPort:h.mcpPort});
} catch {await h?.close();process.send?.({fatal:true});process.disconnect();process.exitCode=1;}
