import { retryBind } from '../test-support/ports.ts';
import { startEngine, parseOptions } from '../main.ts';
import { FakeDriver, fakePlugin, fakePolicy, fakeTerminals, fakeMcp } from '../journal/fixtures.ts';
import { Auth } from './auth.ts';
const options=parseOptions(process.argv.slice(2)),plugin=fakePlugin();
let h:Awaited<ReturnType<typeof startEngine>>|undefined;
try {
  h=await retryBind(()=>startEngine(options,{plugin,policy:()=>fakePolicy(plugin),drivers:[new FakeDriver()],terminals:()=>fakeTerminals(),mcp:()=>fakeMcp()}));
  process.on('message',(message:{credential?:string})=>{if(message.credential){new Auth(h!.db,options.stateDir).register({name:'console'},message.credential);process.send?.({ready:true,apiPort:h!.apiPort,mcpPort:h!.mcpPort,pid:process.pid,lockPid:h!.lockPid});}});
  process.send?.({started:true});
  const stop=()=>{void h!.close().then(()=>{process.disconnect();process.exitCode=0;},()=>{process.disconnect();process.exitCode=1;});};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}catch{process.send?.({error:'startup'});process.exitCode=1;process.disconnect();}
