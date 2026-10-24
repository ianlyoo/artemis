import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Database } from '../db.ts';
import { Journal } from '../journal/index.ts';
import { Registry } from '../registry.ts';
import { ProcessCustody } from '../procs/posix.ts';
import { createPolicy } from '../policy/index.ts';
import { createMcp } from '../mcp/index.ts';
import { loadPlugin } from '../plugin.ts';
import { FakeDriver, fakeTerminals, console, scratch, until } from '../journal/fixtures.ts';
import { createApi } from './index.ts';
import { Auth } from './auth.ts';
import { callLocal } from './transport.ts';
import { parseOptions } from '../main.ts';

test('real policy/MCP integration filters spawn servers and isolates user permissions',async()=>{
  const state=scratch('integrated-'),db=new Database(join(state,'engine.db'));
  const plugin=await loadPlugin();
  // An ungranted adapter server must never reach the driver spawn specification.
  plugin.mcpServers=()=>[{name:'ungranted',type:'http',url:'http://127.0.0.1:0/ungranted'}];
  const journal=new Journal(db,plugin),policy=createPolicy({db,journal,plugin,log(){}}),driver=new FakeDriver();driver.auto=true;
  const core=new Registry({db,journal,plugin,policy,drivers:[driver],terminals:fakeTerminals(),procs:new ProcessCustody(db)});
  const mcp=createMcp({port:0,core,plugin,db,log(){}});core.mcp=mcp;
  const credential=randomBytes(32).toString('base64url');new Auth(db,state).register({name:'console'},credential);
  const api=await createApi({core,db,journal,stateDir:state,port:0,version:'test',verifiedVersions:{}});
  const client=new Client({name:'integration-test',version:'1'});
  try {
    await mcp.start();
    const {id}=await core.create({requestId:'create',provider:'claude',model:'synthetic',profile:'generic',title:'integration',cwd:state},console);
    await core.send(id,{requestId:'send',text:'synthetic'},console);
    await until(()=>driver.specs.length===1&&core.get(id)?.state==='idle',30000);
    assert.deepEqual(driver.specs[0].mcp.map(s=>s.name),['engine']);
    const slot=mcp.slotFor(core.require(id));assert.equal(slot.type,'http');
    if(slot.type!=='http')throw new Error('Expected HTTP slot');
    await client.connect(new StreamableHTTPClientTransport(new URL(slot.url)));
    assert.deepEqual((await client.listTools()).tools,[],'null plugin deliberately grants no MCP tools');
    assert.equal((await client.callTool({name:'list_agents',arguments:{}})).isError,true);
    db.prepare('INSERT INTO permissions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('user-approval',id,null,core.require(id).driverGeneration,'user:publish','user-digest','scope','nonce','pending',null,new Date(Date.now()+60000).toISOString());
    const call=(method:string,path:string,body?:unknown)=>callLocal({port:api.port,token:credential,method,path,body});
    assert.deepEqual((await call('GET',`/v1/agents/${id}/permissions`)).body,{permissions:[]});
    assert.equal((await call('POST',`/v1/agents/${id}/permissions/user-approval`,{expectDigest:'user-digest',decision:'allow'})).status,409);
    core.reconcile();
    assert.equal(db.prepare("SELECT state FROM permissions WHERE id='user-approval'").get()?.state,'pending');
    assert.deepEqual(parseOptions(['--state',state,'--console-roots',`${state},${state}/child`]).consoleRoots,[state,join(state,'child')]);
  } finally {await client.close();await api.close();await mcp.close();await core.close();journal.close();db.close();}
});
