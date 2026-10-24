import { homedir, tmpdir } from 'node:os';
import { daemonReady } from '../test-support/ports.ts';
/** Opt-in real core/API smoke. Run through scripts/node-env.sh, with an explicit TMPDIR.
 * No credentials are read from files or printed; a random in-memory Console bearer is
 * provisioned as a hash before boot. Both production entrypoints run under env -i.
 * V2 permits trusted Claude tuning names. The null plugin still has no MCP tool
 * grants; that limitation is reported, not bypassed.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Database } from '../db.ts';
import { Auth } from './auth.ts';
import { callLocal } from './transport.ts';
import { isAlive, killTree, processTree, readProc, type ProcIdentity } from '../procs/posix.ts';

if(process.env.ARTEMIS_REAL!=='1')throw new Error('Set ARTEMIS_REAL=1 to run live smoke');
const tmp=tmpdir();
const root=mkdtempSync(join(tmp,'live-v1-')),state=join(root,'state'),cwd=join(root,'cwd'),run=join(root,'ptyd');
mkdirSync(state);mkdirSync(cwd);
const credential=randomBytes(32).toString('base64url'),provision=new Database(join(state,'engine.db'));
new Auth(provision,state).register({name:'console'},credential);provision.close();
const artemisdir=fileURLToPath(new URL('../../',import.meta.url));
const environment={PATH:process.env.PATH ?? `${dirname(process.execPath)}:/usr/bin:/bin`,HOME:homedir(),USER:'system',LOGNAME:'system',LANG:'C.UTF-8',SHELL:'/bin/bash',TERM:'xterm-256color',TMPDIR:tmp,TMP:tmp,TEMP:tmp};
const children:ChildProcess[]=[],owned=new Map<string,ProcIdentity>();
const evidence:Record<string,unknown>={scratch:root,startedAt:new Date().toISOString(),apiPort:0,mcpPort:0};
let apiPort=0;
let failed=false,ws:WebSocket|undefined;
function check(ok:unknown,label:string):asserts ok {if(!ok)throw new Error(label);}
function remember(p:ProcIdentity){owned.set(`${p.pid}:${p.startTime}`,p);}
function sample(){for(const child of children){const p=readProc(child.pid!);if(p&&owned.has(`${p.pid}:${p.startTime}`))for(const item of processTree(p))remember(item);}}
function launch(entry:string,args:string[]){
  const child=spawn('/usr/bin/env',['-i',...Object.entries(environment).map(([k,v])=>`${k}=${v}`),process.execPath,'--disable-warning=ExperimentalWarning',entry,...args],{cwd:artemisdir,env:{},stdio:['ignore','pipe','ignore']});
  children.push(child);child.on('error',()=>{});check(child.pid,'spawn');const identity=readProc(child.pid);check(identity,'spawn_identity');remember(identity);return child;
}
async function wait(fn:()=>boolean|Promise<boolean>,label:string,ms=180000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await delay(250);}throw new Error(label);}
async function call(method:string,path:string,body?:unknown){
  const response=await callLocal({port:apiPort,token:credential,method,path,body,timeoutMs:30000});
  check(response.status>=200&&response.status<300,`http_${response.status}`);return response.body as any;
}
async function step(name:string,fn:()=>Promise<void>){
  try{await fn();evidence[name]='pass';process.stdout.write(`${name}: pass\n`);}
  catch(e){failed=true;const reason=e instanceof Error&&/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'operation_failed';evidence[name]=`failed:${reason}`;process.stdout.write(`${name}: failed (${reason})\n`);}
}
const monitor=setInterval(sample,1000);monitor.unref();
async function command(id:string,text:string,requestId=randomUUID(),delivery?:'steer'){
  return call('POST',`/v1/agents/${id}/messages`,{requestId,text,...(delivery?{delivery}:{})});
}
async function frames(id:string){return (await call('GET',`/v1/agents/${id}/timeline?tail=200`)).frames as any[];}
async function completed(id:string,commandId:string){
  await wait(async()=>{const f=await frames(id);check(!f.some(e=>e.type==='command_state'&&e.commandId===commandId&&['failed','delivery_unknown','canceled'].includes(e.state)),'command_failed');return f.some(e=>e.type==='command_state'&&e.commandId===commandId&&e.state==='completed');},'completion_timeout');
}
function sleeping(prefix:string){
  const commands=[1,2,3].map(i=>`python3 -c "from pathlib import Path; import time; Path('${prefix}-${i}.begin').write_text('begin'); time.sleep(15); Path('${prefix}-${i}.done').write_text('done')"`);
  return `Synthetic engine test. Only use the current scratch directory. Do not inspect configuration, credentials, other directories, or network services. Do not delegate. Run these three commands in order, one tool invocation at a time, waiting for each to finish. Then reply FIXTURE_DONE.\n${commands.join('\n')}`;
}
try {
  const ptyd=launch('ptyd/main.ts',['--run',run]);
  const engine=launch('core/main.ts',['--state',state,'--api-port','0','--mcp-port','0','--ptyd-run',run,'--console-roots',cwd,'--codex-home',process.env.CODEX_HOME ?? join(homedir(), '.codex')]);
  const ports=await daemonReady(engine);apiPort=ports.apiPort;Object.assign(evidence,ports);
  await step('daemon_boot',async()=>{
    await wait(async()=>{check(engine.exitCode===null&&engine.signalCode===null,'engine_exited');try{return (await call('GET','/v1/health')).ok;}catch{return false;}},'boot_timeout');
    check(ptyd.exitCode===null&&ptyd.signalCode===null,'ptyd_exited');await wait(()=>existsSync(join(run,'ptyd.sock')),'ptyd_timeout',30000);
  });
  if(evidence.daemon_boot==='pass') {
    await step('terminal_api',async()=>{
      const term=await call('POST','/v1/terminals',{requestId:'live-terminal',user:'console',cwd,cols:100,rows:24,title:'synthetic'});
      let restored=false,output='';
      ws=new WebSocket(`ws://127.0.0.1:${apiPort}/v1/terminals/${term.id}/io`,{headers:{Authorization:`Bearer ${credential}`}});
      ws.on('error',()=>{});ws.on('message',data=>{const b=Buffer.from(data as Buffer);if(b[0]===4)restored=true;if(b[0]===1)output+=b.subarray(1).toString();});
      await wait(()=>restored,'terminal_restore_timeout',30000);
      ws.send(Buffer.concat([Buffer.from([3]),Buffer.from(JSON.stringify({intent:'claim',cols:101,rows:24}))]));
      await wait(async()=>(await call('GET','/v1/terminals')).items.some((t:any)=>t.id===term.id&&t.cols===101),'terminal_claim_timeout',30000);
      ws.send(Buffer.concat([Buffer.from([2]),Buffer.from("printf 'LIVE_%s_OK\\n' TERMINAL\n")]));
      await wait(()=>output.includes('LIVE_TERMINAL_OK'),'terminal_output_timeout',30000);
      await wait(async()=>(await call('GET',`/v1/terminals/${term.id}/capture?lines=30`)).text.includes('LIVE_TERMINAL_OK'),'terminal_capture_timeout',30000);
      ws.terminate();ws=undefined;sample();
    });
    let claudeId='';
    await step('claude_api_create_send_complete',async()=>{
      const a=await call('POST','/v1/agents',{requestId:'claude-create',provider:'claude',model:'claude-haiku-5-5',cwd,title:'synthetic Claude',profile:'generic'});claudeId=a.id;
      const sent=await command(claudeId,'Reply exactly CLAUDE_CORE_LIVE_OK. Do not use tools or inspect files.');await completed(claudeId,sent.commandId);
      const reply=(await frames(claudeId)).filter(f=>f.item?.type==='assistant_message').map(f=>f.item.text??'').join('');
      check(reply.includes('CLAUDE_CORE_LIVE_OK'),'claude_missing_reply');
    });
    if(evidence.claude_api_create_send_complete==='pass')await step('claude_mcp_request_completed',async()=>{
      const sent=await command(claudeId,'If the exact tool mcp__engine__list_agents is available, call it once and reply MCP_CALLED. If that exact tool is absent, reply exactly MCP_NOT_GRANTED. Do not use native ListAgents, discovery tools, any other tools, or inspect files.');
      await completed(claudeId,sent.commandId);
      const f=await frames(claudeId),reply=f.filter(f=>f.item?.type==='assistant_message').map(f=>f.item.text??'').join('');
      evidence.claudeMcpToolCall=f.some(f=>f.item?.type==='tool_call'&&f.item.name?.includes('list_agents'));
      evidence.claudeNativeListAgents=f.some(f=>f.item?.type==='tool_call'&&f.item.name==='ListAgents');
      evidence.claudeMcpNotGranted=reply.includes('MCP_NOT_GRANTED');
    });
    evidence.agent_mcp='blocked: null plugin generic profile grants no MCP tools';
    let codexId='';
    await step('codex_api_create_send_complete',async()=>{
      const a=await call('POST','/v1/agents',{requestId:'codex-create',provider:'codex',model:'gpt-6-luna',thinking:'low',cwd,title:'synthetic Codex',profile:'generic'});codexId=a.id;
      const sent=await command(codexId,'Reply exactly CORE_LIVE_OK. Do not use any tools or inspect files.');await completed(codexId,sent.commandId);
      check((await frames(codexId)).some(f=>f.item?.type==='assistant_message'&&f.item.text?.includes('CORE_LIVE_OK')),'missing_reply');
    });
    if(evidence.codex_api_create_send_complete==='pass') {
      await step('codex_steer',async()=>{
        const sent=await command(codexId,sleeping('steer'));
        await wait(()=>existsSync(join(cwd,'steer-1.begin')),'steer_begin_timeout');
        const current=(await call('GET',`/v1/agents/${codexId}`)).activeTurnId;
        const steered=await command(codexId,'Continue the three specified commands. At the end reply CORE_STEER_OK instead of FIXTURE_DONE.',randomUUID(),'steer');
        await wait(async()=>(await frames(codexId)).some(f=>f.type==='steered'&&f.turnId===current),'steer_ack_timeout',60000);
        await completed(codexId,sent.commandId);await completed(codexId,steered.commandId);
        const reply=(await frames(codexId)).filter(f=>f.item?.type==='assistant_message').map(f=>f.item.text??'').join('');
        evidence.steerReplyMarker=reply.includes('CORE_STEER_OK');
        // The protocol acknowledgment and both completed commands prove delivery;
        // keep the model's compliance with the requested marker as separate evidence.
      });
      await step('codex_cancel',async()=>{
        const sent=await command(codexId,sleeping('cancel'));await wait(()=>existsSync(join(cwd,'cancel-1.begin')),'cancel_begin_timeout');sample();
        const canceled=await call('POST',`/v1/agents/${codexId}/cancel`,{requestId:'live-cancel',hardStop:true});
        check(canceled.turnId&&canceled.toolsRunning===0,'cancel_not_stopped');
        check((await call('GET',`/v1/agents/${codexId}`)).state==='idle','cancel_not_idle');
        check(!existsSync(join(cwd,'cancel-3.done')),'cancel_ran_to_end');
        check((await frames(codexId)).some(f=>f.type==='command_state'&&f.commandId===sent.commandId&&f.state==='canceled'),'cancel_command_not_canceled');
      });
    }
  }
} finally {
  ws?.terminate();sample();
  for(const child of [...children].reverse()) {
    if(child.exitCode!==null||child.signalCode!==null)continue;
    const identity=readProc(child.pid!);if(!identity||!owned.has(`${identity.pid}:${identity.startTime}`))continue;
    child.kill('SIGTERM');
    try{await wait(()=>!isAlive(identity)&& (child.exitCode!==null||child.signalCode!==null),'shutdown_timeout',30000);}catch{failed=true;await killTree([identity],remember);}
  }
  sample();clearInterval(monitor);
  const remaining=[...owned.values()].filter(isAlive);if(remaining.length){failed=true;await killTree(remaining,remember);}
  const alive=[...owned.values()].filter(isAlive).length;
  evidence.shutdown=children.map(c=>({exitCode:c.exitCode,signal:c.signalCode}));evidence.pidAudit={tracked:owned.size,alive};
  evidence.finishedAt=new Date().toISOString();evidence.result=failed||alive?'partial':'passed_available_checks';
  writeFileSync(join(root,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  writeFileSync(join(root,'pid-audit.json'),JSON.stringify([...owned.values()].map(p=>({pid:p.pid,startTime:p.startTime,alive:isAlive(p)})),null,2)+'\n',{mode:0o600});
  process.stdout.write(`pid_audit: tracked=${owned.size} alive=${alive}\nevidence: ${join(root,'evidence.json')}\n`);
  if(failed||alive)process.exitCode=1;
}
