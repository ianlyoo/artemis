import { startEngine } from '../main.ts';
import type { Database } from '../db.ts';
import { FakeDriver, fakePlugin, fakePolicy, fakeTerminals, fakeMcp, until } from '../journal/fixtures.ts';
import { processTree, readProc } from '../procs/posix.ts';

// An actual daemon/lock/SQLite lifecycle in an allowlisted env; no provider or credentials.
const [mode,stateDir]=process.argv.slice(2),plugin=fakePlugin();
let db:Database,release:()=>void=()=>{};
const released=new Promise<void>(resolve=>{release=resolve;});
process.on('message',(m:{release?:boolean})=>{if(m.release)release();});
plugin.onBoot=async ctx=>{
  db.setMeta('boot',true);ctx.outbox.put({key:'fixture-delivery',target:'plugin',path:'/event',body:{synthetic:true}});
  if(mode==='boot-throw')throw new Error('synthetic boot failure');
};
plugin.outboxTargets=()=>{
  if(mode==='targets-failure')throw new Error('synthetic target setup failure');
  return {plugin:{async deliver(row){db.setMeta('delivery',{key:row.key,body:row.body});return 'delivered' as const;}}};
};
plugin.onShutdown=async()=>{
  db.setMeta('shutdownCalls',(db.meta<number>('shutdownCalls')??0)+1);db.setMeta('shutdownStarted',Date.now());
  process.send?.({shutdownStarted:true});
  if(mode==='throw')throw new Error('synthetic hook failure details must not appear');
  if(mode==='hang')await new Promise(()=>{});
  await released;
  db.setMeta('shutdownFinished',true);
};
try {
  const h=await startEngine({stateDir,apiPort:0,mcpPort:0},{plugin,drivers:[new FakeDriver()],
    policy:database=>{db=database;process.send?.({owned:processTree(readProc(process.pid)!)});return fakePolicy(plugin);},
    terminals:()=>fakeTerminals(),mcp:()=>{
      if(mode==='pre-boot-failure')throw new Error('synthetic pre-boot failure');
      const mcp=fakeMcp();if(mode==='boot-failure')mcp.start=async()=>{throw new Error('synthetic listener failure');};return mcp;
    }});
  await until(()=>db.prepare('SELECT state FROM outbox WHERE key=?').get('fixture-delivery')?.state==='delivered',30000);
  const stop=()=>{
    const first=h.close(),second=h.close();process.send?.({sharedClose:first===second});
    void first.then(()=>{process.disconnect();process.exitCode=0;},()=>{process.disconnect();process.exitCode=1;});
  };
  process.once('SIGTERM',stop);process.send?.({ready:true,apiPort:h.apiPort,mcpPort:h.mcpPort});
} catch {
  process.send?.({bootFailed:true});process.disconnect();process.exitCode=1;
}
