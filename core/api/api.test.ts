import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import type { ClientRequest } from 'node:http';
import { replies } from './user.ts';
import { lstatSync } from 'node:fs';
import { WebSocket } from 'ws';
import { createApi } from './index.ts';
import { callLocal } from './transport.ts';
import { fixture, intent, until } from '../journal/fixtures.ts';
import { runCli } from '../../cli/index.ts';
import { claudeContext, codexContext } from '../../drivers/projection.ts';
import { createClaudeDriver } from '../../drivers/claude/index.ts';
import { createCodexDriver } from '../../drivers/codex/index.ts';

async function setup(){
  const f=fixture(),api=await createApi({core:f.core,db:f.db,journal:f.journal,stateDir:f.dir,port:0,version:'fixture',verifiedVersions:{node:'24.22.0'}});
  const credentials={console:randomBytes(32).toString('base64url'),cli:randomBytes(32).toString('base64url'),voice:randomBytes(32).toString('base64url')};
  api.auth.register({name:'console'},credentials.console);api.auth.register({name:'cli'},credentials.cli);
  const call=(method:string,path:string,body?:unknown,principal:'console'|'cli'|'voice'='console')=>callLocal({method,path,body,token:credentials[principal],port:api.port});
  const ws=async(path='/v1/stream',principal:'console'|'cli'|'voice'='console')=>{const client=new WebSocket(`ws://127.0.0.1:${api.port}${path}`,{headers:{Authorization:`Bearer ${credentials[principal]}`}});await once(client,'open');return client;};
  return {...f,api,credentials,call,ws,close:async()=>{await api.close();await f.close();}};
}
test('C18 C20 C21 C22: catalogs and provider snapshots project through list/get; stale generations are ignored',async()=>{
  const f=await setup();try{
    for(const provider of ['claude','codex'] as const){
      const real=provider==='claude'?createClaudeDriver():createCodexDriver();
      f.core.drivers.set(provider,{...real,start:f.driver.start.bind(f.driver),models:async()=>[{id:provider==='claude'?'claude-haiku-5-5':'gpt-6-luna',label:provider,thinking:['low'],defaultThinking:'low',isDefault:true}]});
      const catalog=(await f.call('GET',`/v1/models?provider=${provider}`)).body as any;
      assert.equal(catalog.models.length,1);assert.equal(catalog.models[0].defaultThinking,'low');assert.equal(catalog.models[0].isDefault,true);
      const {id}=await f.core.create(intent({provider,mode:'default'}),{kind:'console',name:'console'});
      assert.equal(f.core.get(id)?.usage,null);assert.equal(f.core.get(id)?.runtimeModel,null);
      assert.deepEqual(f.core.get(id)?.modes,real.modes);
      await f.call('POST',`/v1/agents/${id}/messages`,{requestId:`start-${provider}`,text:'fixture'});
      await until(()=>f.driver.sessions.length===(provider==='claude'?1:2));const session=f.driver.sessions.at(-1)!;
      session.events.push({type:'settings_changed',runtimeModel:'synthetic',runtimeThinking:'low',runtimeMode:'default'});
      const snapshot=provider==='claude'?claudeContext({totalTokens:800,rawMaxTokens:1000,categories:[{kind:'used',name:'System prompt',tokens:100},{kind:'used',name:'Messages',tokens:700},{kind:'free',name:'Free',tokens:200}],memoryFiles:[]})!:
        codexContext({last:{inputTokens:750,cachedInputTokens:100,outputTokens:50,totalTokens:800},total:{totalTokens:99999},modelContextWindow:1000})!;
      snapshot.context.lastCompaction={savedTokens:200,at:'2026-10-24T00:00:00.000Z'};
      session.events.push({type:'timeline',turnId:session.turnId,item:{type:'usage',...snapshot}});
      await until(()=>f.core.get(id)?.usage?.used===800);
      assert.equal((await f.call('PATCH',`/v1/agents/${id}/settings`,{requestId:`settings-${provider}`,model:'synthetic-next',thinking:'high',mode:'plan'})).status,200);
      const record=(await f.call('GET',`/v1/agents/${id}`)).body as any;
      assert.equal(record.model,'synthetic-next');assert.equal(record.thinking,'high');assert.equal(record.mode,'plan');assert.equal(record.runtimeModel,'synthetic');assert.equal(record.runtimeThinking,'low');
      assert.deepEqual(record.usage,{used:800,max:1000});assert.equal(record.context.categories.reduce((sum:number,c:any)=>sum+c.tokens,0),800);assert.equal(record.context.lastCompaction.savedTokens,200);
      const list=(await f.call('GET',`/v1/agents?provider=${provider}`)).body as any;assert.deepEqual(list.agents[0].usage,record.usage);
      f.journal.append(id,{type:'timeline',driverGeneration:999,item:{type:'usage',usage:{used:1,max:1}}});
      assert.equal(f.core.get(id)?.usage?.used,800);
      session.finish();await until(()=>f.core.get(id)?.state==='idle');
    }
    assert.equal((await f.call('GET','/v1/models?provider=bad')).status,400);
  }finally{await f.close();}
});
test('C33: user accepts Console code-point boundaries and crosses the former minute/day quotas',async()=>{
  const f=await setup();try{
    f.driver.auto=true;const {id}=await f.core.create(intent(),{kind:'console',name:'console'});
    let n=0;const say=(text:string)=>f.call('POST','/v1/user/says',{requestId:`boundary-${++n}`,to:{agentId:id},text,channel:'console'});
    for(const char of ['x','한','😀']){
      for(const length of [19_999,20_000])assert.equal((await say(char.repeat(length))).status,202,`${char} ${length}`);
      assert.equal((await say(char.repeat(20_001))).status,413,`${char} over`);
    }
    assert.equal((await say('한'.repeat(6000))).status,202);
    // Seed the old limiter too: an upgrade must not retain an obsolete 30/min or 300/day refusal.
    f.db.setMeta('userRate:console',Array(300).fill(Date.now()));
    for(let i=0;i<301;i++){
      assert.equal((await say(`burst ${i}`)).status,202);
      if(i%20===19)await until(()=>f.core.pending(id).length===0,10000);
    }
    await until(()=>f.core.pending(id).length===0,10000);
  }finally{await f.close();}
});
test('authenticated TCP/Unix API and CLI call: create/read/filter, wait, settings, workspace and versions',async()=>{
  const f=await setup();try{
    const denied=await fetch(`http://127.0.0.1:${f.api.port}/v1/health`);assert.equal(denied.status,401);assert.deepEqual(Object.keys(await denied.json() as object).sort(),['code','reason','rule']);
    const i=intent({labels:{team:'core'}}),created=await f.call('POST','/v1/agents',i);assert.equal(created.status,201);const id=(created.body as {id:string}).id;
    assert.equal((await f.call('GET',`/v1/agents/${id}`)).status,200);
    assert.equal(((await f.call('GET','/v1/agents?label=team=core')).body as {agents:unknown[]}).agents.length,1);
    assert.equal(((await f.call('GET',`/v1/agents/${id}?waitFor=idle&timeoutMs=10`)).body as {status:string}).status,'idle');
    const unix=await callLocal({socketPath:f.api.socketPath,token:f.credentials.cli,method:'GET',path:'/v1/info'});assert.equal(unix.status,200);assert.equal((unix.body as {version:string}).version,'fixture');assert.equal(lstatSync(f.api.socketPath).mode&0o777,0o600);
    const cli=await runCli(['call','--state',f.dir],JSON.stringify({method:'GET',path:'/v1/info'}),()=>f.credentials.cli);assert.equal(cli.exitCode,0);
    assert.equal((await f.call('PATCH',`/v1/agents/${id}/settings`,{mode:'plan',model:'other',thinking:'medium'})).status,200);
    assert.equal((await f.call('PATCH',`/v1/agents/${id}/settings`,{mode:'auto'},'cli')).status,403);
    const workspace=(f.core.workspaces()[0].id as string);assert.equal((await f.call('PATCH',`/v1/workspaces/${workspace}`,{title:'renamed'})).status,200);assert.equal((await f.call('POST',`/v1/workspaces/${workspace}/archive`,{})).status,200);
    assert.equal((await f.call('GET','/v1/models?provider=claude')).status,200);assert.equal((await f.call('GET','/v1/health')).status,200);
    assert.equal((await f.call('POST','/v1/agents', {...i,unexpected:'reject'})).status,400);
  }finally{await f.close();}
});
test('WS replay and resync, client disconnect never stops a turn; routes enforce timeline and terminal limits',async()=>{
  const f=await setup();let socket:WebSocket|undefined;try{
    const {id}=await f.core.create(intent(),{kind:'console',name:'console'}),before=f.journal.cursor(id),frames:{op:string;frame?:{seq:number}}[]=[];
    socket=await f.ws();socket.on('message',data=>frames.push(JSON.parse(String(data))));socket.send(JSON.stringify({op:'subscribe',id:'chat',agents:[id],after:{[id]:{epoch:before.epoch,seq:0}}}));
    await until(()=>frames.length>=2);
    const sent=await f.call('POST',`/v1/agents/${id}/messages`,{requestId:'send',text:'hi',clientMessageId:'console-http'});assert.equal(sent.status,202);await until(()=>f.core.get(id)?.state==='running');
    const last=frames.filter(f=>f.op==='frame').at(-1)?.frame?.seq??0;socket.close();await once(socket,'close');assert.equal(f.core.get(id)?.state,'running');
    socket=await f.ws();const resumed:{op:string;frame?:{seq:number}}[]=[];socket.on('message',data=>resumed.push(JSON.parse(String(data))));socket.send(JSON.stringify({op:'subscribe',id:'again',agents:[id],after:{[id]:{epoch:before.epoch,seq:last}}}));
    f.driver.sessions[0].finish();await until(()=>f.core.get(id)?.state==='idle');await until(()=>resumed.length>0);assert.ok(resumed.filter(f=>f.frame).every(f=>f.frame!.seq>last));
    assert.equal((await f.call('POST',`/v1/agents/${id}/rewind`,{requestId:'rewind',messageId:'test'})).status,200);await until(()=>resumed.some(f=>f.op==='resync_required'));
    assert.equal((await f.call('GET',`/v1/agents/${id}/timeline?limit=201`)).status,400);
    assert.equal((await f.call('POST','/v1/terminals',{requestId:'bad',user:'console',cwd:f.dir,cols:1001,rows:24})).status,413);
    const created=await f.call('POST','/v1/terminals',{requestId:'term',user:`agent:${id}`,cwd:f.dir,cols:80,rows:24});assert.equal(created.status,201);const tid=(created.body as {id:string}).id;
    const term=new WebSocket(`ws://127.0.0.1:${f.api.port}/v1/terminals/${tid}/io`,{headers:{Authorization:`Bearer ${f.credentials.console}`}});const restore=once(term,'message');await once(term,'open');assert.equal((await restore)[0][0],4);term.close();await once(term,'close');
    assert.equal((await f.call('POST',`/v1/terminals/${tid}/kill`,{})).status,200);
    const history=await f.call('GET',`/v1/terminals?user=agent:${id}&includeClosed=1`);assert.equal((history.body as {items:unknown[]}).items.length,1);
  }finally{socket?.terminate();await f.close();}
});
test('uploads opaque references, count/size/concurrency limits, image reaches fake driver',async()=>{
  const f=await setup();try{
    const {id}=await f.core.create(intent(),{kind:'console',name:'console'});
    const upload=await f.call('POST','/v1/uploads',{agentId:id,files:[{mime:'image/png',data:Buffer.from('synthetic image').toString('base64')}]});assert.equal(upload.status,201);const ref=(upload.body as {uploads:{id:string}[]}).uploads[0].id;
    assert.equal((await f.call('POST',`/v1/agents/${id}/messages`,{requestId:'image',text:'synthetic image',images:[ref]})).status,202);await until(()=>!!f.driver.sessions[0]?.sent.length);assert.equal(f.driver.sessions[0].sent[0].images?.[0].mime,'image/png');
    assert.equal((await f.call('POST',`/v1/agents/${id}/messages`,{requestId:'path',text:'x',images:['/caller/path']})).status,400);
    assert.equal((await f.call('POST','/v1/uploads',{files:Array.from({length:6},()=>({mime:'text/plain',data:'eA=='}))})).status,413);
    assert.throws(()=>f.api.uploads.store([{mime:'text/plain',data:new Uint8Array(25*1024*1024+1)}]),{code:'LIMIT',status:413});
    const gates:(()=>void)[]=[],runs=Array.from({length:4},()=>f.api.uploads.accepting(()=>new Promise<void>(r=>gates.push(r))));
    await assert.rejects(f.api.uploads.accepting(async()=>{}),{code:'LIMIT',status:429});gates.forEach(r=>r());await Promise.all(runs);
  }finally{await f.close();}
});
test('user channel scopes, explicit targets, attribution, replies, slash denial and idempotency',async()=>{
  const f=await setup();try{
    f.driver.auto=true;const {id}=await f.core.create(intent(),{kind:'console',name:'console'});f.api.auth.register({name:'user-channel:voice',targets:[id]},f.credentials.voice);
    assert.equal((await f.call('GET','/v1/agents',undefined,'voice')).status,403);
    assert.equal((await f.call('POST','/v1/user/says',{requestId:'slash',to:{agentId:id},text:'/compact',channel:'voice'},'voice')).status,422);
    const body={requestId:'voice',to:{agentId:id},text:'hello',channel:'voice'},first=await f.call('POST','/v1/user/says',body,'voice');assert.equal(first.status,202);
    const second=await f.call('POST','/v1/user/says',body,'voice');assert.deepEqual(first.body,second.body);
    await until(()=>f.core.get(id)?.state==='idle'&&!!f.driver.sessions[0]?.sent.length);
    const message=f.core.timeline(id,{kinds:['message']}).frames[0];assert.equal(message.origin?.principal,'user');assert.equal(message.origin?.channel,'voice');
    const cursor=(first.body as {replyCursor:string}).replyCursor,result=await f.call('GET',`/v1/user/replies?to=${id}&after=${encodeURIComponent(cursor)}&waitMs=1000`,undefined,'voice');assert.equal(result.status,200);assert.ok((result.body as {items:{kind:string}[]}).items.some(i=>i.kind==='text'));
    assert.equal((await f.call('POST',`/v1/agents/${id}/cancel`,{requestId:'cancel'},'voice')).status,403);
    assert.equal((await f.call('POST','/v1/user/says',{...body,text:'changed'},'voice')).status,409);
    f.api.auth.init();assert.ok(f.api.auth.modes().every(r=>r.ok));
  }finally{await f.close();}
});
test('drain journals sends and deadline defers without cancellation; idle child cleanup API',async()=>{
  const f=await setup();try{
    const {id}=await f.core.create(intent({parentId:'parent'}),{kind:'console',name:'console'});
    await f.call('POST',`/v1/agents/${id}/messages`,{requestId:'run',text:'run'});await until(()=>!!f.driver.sessions[0]?.sent.length);
    const drain=await f.call('POST','/v1/admin/drain',{deadlineS:0.02});assert.equal((drain.body as {deferred:boolean}).deferred,true);assert.equal(f.driver.sessions[0].interrupts,0);
    await f.call('POST','/v1/admin/hold',{});const held=await f.call('POST',`/v1/agents/${id}/messages`,{requestId:'held',text:'held'});assert.equal((held.body as {state:string}).state,'queued');
    assert.deepEqual((await f.call('POST','/v1/agents/cleanup-children',{parentId:'parent',idleHours:0})).body,{archived:[]});
    await f.call('POST','/v1/admin/release',{});await until(()=>f.driver.sessions[0].sent.length===2);f.driver.sessions[0].finish();await until(()=>f.core.get(id)?.state==='idle');
    assert.deepEqual((await f.call('POST','/v1/agents/cleanup-children',{parentId:'parent',idleHours:0})).body,{archived:[id]});
  }finally{await f.close();}
});
test('real HTTP upload concurrency rejects the fifth request; chunked oversize returns 413',async()=>{
  const f=await setup(),pending:ClientRequest[]=[];try{
    for(let i=0;i<4;i++){
      const req=request({host:'127.0.0.1',port:f.api.port,path:'/v1/uploads',method:'POST',headers:{Authorization:`Bearer ${f.credentials.console}`,'Content-Type':'application/json','Content-Length':1024}});req.on('error',()=>{});req.write('{');pending.push(req);
    }
    await new Promise(r=>setTimeout(r,50));
    const fifth=await f.call('POST','/v1/uploads',{files:[{mime:'text/plain',data:'eA=='}]});assert.equal(fifth.status,429);
    for(const req of pending)req.destroy();
    const status=await new Promise<number>((resolve,reject)=>{
      const req=request({host:'127.0.0.1',port:f.api.port,path:'/v1/agents',method:'POST',headers:{Authorization:`Bearer ${f.credentials.console}`,'Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode!);});req.on('error',reject);
      for(let i=0;i<5;i++)req.write('x'.repeat(512*1024));req.end();
    });assert.equal(status,413);
  }finally{for(const req of pending)req.destroy();await f.close();}
});
test('user replies keep whole sentences across delta frames without repeating cursor content',async()=>{
  const f=await setup();try{
    const {id}=await f.core.create(intent(),{kind:'console',name:'console'}),cursor=f.journal.cursor(id),auth=f.api.auth.authenticate(`Bearer ${f.credentials.console}`);
    const after=`${id}.${cursor.epoch}.${cursor.seq}`;
    f.journal.append(id,{type:'timeline',item:{type:'assistant_message',text:'Hello. Par',delta:true}});
    const first=replies(f.core,auth,id,after);assert.equal(first.items.length,0);
    f.journal.append(id,{type:'timeline',item:{type:'assistant_message',text:'tial.',delta:true}});
    const second=replies(f.core,auth,id,first.cursor);assert.equal(second.items[0].text,'Hello. Partial.');
    assert.equal(replies(f.core,auth,id,second.cursor).items.length,0);
    f.journal.append(id,{type:'awaiting_user',approvalId:'synthetic',rule:'fixture'});assert.equal(replies(f.core,auth,id,second.cursor).state,'awaiting_user');
    f.journal.append(id,{type:'approval_consumed',approvalId:'synthetic'});assert.equal(replies(f.core,auth,id,second.cursor).state,'idle');
    // No TTL: a card stays awaiting_user until its permission resolves; an user denial ends it.
    f.journal.append(id,{type:'awaiting_user',approvalId:'decided',rule:'fixture'});assert.equal(replies(f.core,auth,id,second.cursor).state,'awaiting_user');
    f.core.db.prepare("INSERT INTO permissions(id,agent_id,turn_id,driver_generation,kind,request_digest,scope_hash,nonce,state,decided_by,expires_at) VALUES ('decided',?,NULL,1,'user:publish','d','d','n','denied',NULL,'9999-12-31T23:59:59.999Z')").run(id);
    assert.equal(replies(f.core,auth,id,second.cursor).state,'idle');
  }finally{await f.close();}
});
test('supersede route: console/cli fence the predecessor; user channel, sends and other principals are refused after it',async()=>{
  const f=await setup();try{
    const {id}=await f.core.create(intent(),{kind:'console',name:'console'});f.api.auth.register({name:'user-channel:voice',targets:[id]},f.credentials.voice);
    assert.equal((await f.call('POST',`/v1/agents/${id}/messages`,{requestId:'work',text:'Existing work'})).status,202);await until(()=>f.driver.sessions[0]?.sent.length===1);
    assert.equal((await f.call('POST',`/v1/agents/${id}/supersede`,{successorId:'next'},'voice')).status,403);
    assert.equal((await f.call('POST',`/v1/agents/${id}/supersede`,{})).status,400);
    assert.equal((await f.call('POST',`/v1/agents/${id}/supersede`,{successorId:id})).status,400);
    const fenced=await f.call('POST',`/v1/agents/${id}/supersede`,{successorId:'next'},'cli');assert.equal(fenced.status,200);
    const record=fenced.body as {successorId:string;state:string;activeTurnId:string|null;processes:number};
    assert.deepEqual([record.successorId,record.state,record.activeTurnId??null,record.processes],['next','stopped',null,0]);
    assert.equal((await f.call('POST',`/v1/agents/${id}/supersede`,{successorId:'next'},'cli')).status,200);   // a retry re-checks the same fence
    assert.equal((await f.call('POST',`/v1/agents/${id}/supersede`,{successorId:'other'})).status,409);
    const late=await f.call('POST','/v1/user/says',{requestId:'late',to:{agentId:id},text:'late',channel:'voice'},'voice');
    assert.equal(late.status,409);assert.equal((late.body as {code:string}).code,'AGENT_SUPERSEDED');
    assert.equal((await f.call('POST',`/v1/agents/${id}/messages`,{requestId:'late-send',text:'late'})).status,409);
    assert.equal((await f.call('POST',`/v1/agents/${id}/reopen`,{})).status,409);
    assert.equal(f.driver.specs.length,1);
  }finally{await f.close();}
});

test('C13 ordinary permissions expose only card fields and pending count; allow/deny CAS never replays stale decisions', async()=>{
  const f=await setup();try{
    const {id}=await f.core.create(intent(),{kind:'console',name:'console'});
    await f.core.send(id,{requestId:'permission-turn',text:'synthetic'},{kind:'console',name:'console'});
    await until(()=>f.driver.sessions.length===1);
    for(const decision of ['allow','deny']) {
      const answer=f.driver.sessions[0].host.prompt({kind:'tool',summary:'Read the fixture?',allowedDecisions:['allow','deny'],turnId:f.driver.sessions[0].turnId,detail:{private:'not a card field'}});
      const listed=await f.call('GET',`/v1/agents/${id}/permissions`),prompt=(listed.body as any).permissions[0];
      assert.deepEqual(Object.keys(prompt).sort(),['id','requestDigest','request_digest','summary','allowedDecisions','expiresAt','turnId'].sort());
      assert.equal(((await f.call('GET',`/v1/agents/${id}`)).body as {pendingPermissions:number}).pendingPermissions,1);
      assert.equal(((await f.call('GET','/v1/agents')).body as {agents:{pendingPermissions:number}[]}).agents[0].pendingPermissions,1);
      assert.equal((await f.call('POST',`/v1/agents/${id}/permissions/${prompt.id}`,{expectDigest:prompt.requestDigest,decision},'cli')).status,403);
      assert.equal((await f.call('POST',`/v1/agents/${id}/permissions/${prompt.id}`,{expectDigest:prompt.requestDigest,decision})).status,200);
      assert.equal((await answer).decision,decision);
      const stale=await f.call('POST',`/v1/agents/${id}/permissions/${prompt.id}`,{expectDigest:prompt.requestDigest,decision});
      assert.equal(stale.status,409);assert.equal((stale.body as {code:string}).code,'PERMISSION_STALE');
      assert.equal(((await f.call('GET',`/v1/agents/${id}`)).body as {pendingPermissions:number}).pendingPermissions,0);
      assert.equal(f.db.prepare("SELECT COUNT(*) n FROM events WHERE agent_id=? AND type='permission_decided' AND json_extract(body,'$.permissionId')=?").get(id,prompt.id)?.n,1);
    }
  }finally{await f.close();}
});

test('C15 JSON upload validates 50 MiB linearly and rejects malformed base64',async()=>{
  const f=await setup();try{
    const data=Buffer.alloc(25*1024*1024,65).toString('base64');
    const result=await f.call('POST','/v1/uploads',{files:[{mime:'text/plain',data},{mime:'text/plain',data}]});
    assert.equal(result.status,201);
    const uploads=(result.body as any).uploads;assert.equal(uploads.length,2);
    assert.equal(Number(f.db.prepare('SELECT SUM(bytes) n FROM uploads').get()?.n),50*1024*1024);
    for(const data of ['a','abc','a===','====','ab=c','a\nbc','abc?','abcd=','éabc'])
      assert.equal((await f.call('POST','/v1/uploads',{files:[{mime:'text/plain',data}]})).status,400);
    for(const data of ['eA==','eHg=','eHh4'])
      assert.equal((await f.call('POST','/v1/uploads',{files:[{mime:'text/plain',data}]})).status,201);
  }finally{await f.close();}
});

test('C15 real registry accepts five files / 50 MiB plus four images and refuses every overage before admission',async()=>{
  const f=await setup();try{
    const {id}=await f.core.create(intent(),{kind:'console',name:'console'}),principal={kind:'console',name:'console'} as const;
    const sizes=[25*1024*1024,25*1024*1024-3,1,1,1];
    const files=f.api.uploads.store(sizes.map(bytes=>({data:Buffer.alloc(bytes,65),mime:'text/plain'})),id);
    const images=f.api.uploads.store(Array.from({length:4},()=>({data:Buffer.from('image'),mime:'image/png'})),id);
    const ids=files.map(f=>f.id),imageIds=images.map(f=>f.id);
    const sent=await f.call('POST','/v1/user/says',{requestId:'nine-uploads',to:{agentId:id},text:'Console attachment boundary',channel:'console',images:imageIds,attachments:ids});
    assert.equal(sent.status,202);await until(()=>f.driver.sessions[0]?.sent.length===1);
    assert.equal(f.driver.sessions[0].sent[0].images?.length,4);
    for(const file of ids)assert(f.driver.sessions[0].sent[0].text.includes(file));
    const over=f.api.uploads.store([{data:Buffer.from('aa'),mime:'text/plain'}],id)[0];
    const before=Number(f.db.prepare('SELECT COUNT(*) n FROM commands').get()?.n),events=f.journal.cursor(id).seq;
    const invalid=[{attachments:[...ids,over.id],images:imageIds},
      {attachments:[...ids.slice(0,4),over.id],images:imageIds}, {attachments:ids,images:[...imageIds,imageIds[0]]}];
    for(const [n,uploads] of invalid.entries())await assert.rejects(f.core.send(id,{requestId:`over-${n}`,text:'must not arrive',...uploads},principal),{code:'LIMIT',status:413});
    assert.throws(()=>f.api.uploads.store([{data:Buffer.alloc(25*1024*1024+1),mime:'text/plain'}],id),{code:'LIMIT',status:413});
    // Validate persisted metadata too, before a command or user echo exists.
    f.db.prepare('UPDATE uploads SET bytes=? WHERE id=?').run(25*1024*1024+1,over.id);
    await assert.rejects(f.core.send(id,{requestId:'oversize-reference',text:'must not arrive',attachments:[over.id]},principal),{code:'LIMIT',status:413});
    await assert.rejects(f.core.send(id,{requestId:'missing-reference',text:'must not arrive',attachments:['missing']},principal),{code:'NOT_FOUND'});
    assert.equal(Number(f.db.prepare('SELECT COUNT(*) n FROM commands').get()?.n),before);
    assert.equal(f.journal.cursor(id).seq,events);assert.equal(f.driver.sessions[0].sent.length,1);
    assert.equal((await f.call('POST',`/v1/agents/${id}/messages`,{requestId:'http-image-over',text:'must not arrive',images:[...imageIds,imageIds[0]]})).status,413);
    assert.equal(Number(f.db.prepare('SELECT COUNT(*) n FROM commands').get()?.n),before);
  }finally{await f.close();}
});
