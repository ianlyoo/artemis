import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actionFor } from './action.ts';
import { AsyncQueue } from './queue.ts';
import { ProcessTree, isAlive, processIdentity } from './processes.ts';
import type { DriverHost } from '../../core/types.ts';
import { createClaudeDriver } from './index.ts';
import { modelCatalog } from '../catalog.ts';
import { claudeContext } from '../projection.ts';
import { toolDetail } from '../tool-detail.ts';
import { claudeModels } from './models.ts';
import { ReadFiles } from './context.ts';

test('C11 C22: named tool details and SDK categories keep safe paths and exclude free/deferred/buffer tokens', () => {
  const path='/workspace/work/synthetic.txt';
  assert.deepEqual(toolDetail('Read',{file_path:path,content:'not projected'}),{name:'Read',detail:{type:'read',filePath:path}});
  assert.equal(toolDetail('Read',{file_path:'/workspace/.env'}).detail.filePath,undefined);
  assert.deepEqual(toolDetail('mcp__system__read',{kind:'goals',id:159,extra:'not projected'}).detail,{type:'mcp',input:{id:159,kind:'goals'}});
  assert.deepEqual(toolDetail('WebFetch',{url:'https://example.com/page?private=value'}).detail,{type:'fetch',url:'https://example.com/page'});
  assert.deepEqual(toolDetail('Bash',{command:'git status --arbitrary=value'}).detail,{type:'shell',command:'git status'});
  const snapshot=claudeContext({totalTokens:10,rawMaxTokens:100,categories:[{kind:'used',name:'System prompt',tokens:2},{kind:'used',name:'Messages',tokens:7},{kind:'free',name:'free',tokens:90},{kind:'deferred',name:'tools',tokens:42},{kind:'buffer',name:'reserve',tokens:10}],memoryFiles:[{path,tokens:2},{path:'/workspace/.env',tokens:3}]})!;
  assert.deepEqual(snapshot.usage,{used:10,max:100});assert.equal(snapshot.context.categories.reduce((s,c)=>s+c.tokens,0),10);
  assert.deepEqual(snapshot.context.files,[{path,tokens:2}]);assert.equal(snapshot.context.categories.length,2);
});
test('C18: discovery cache shares in-flight reads, expires and retries empty catalogs', async () => {
  let reads=0;const cached=modelCatalog(async()=>{reads++;await delay(10);return [{id:'synthetic'}];});
  const [a,b]=await Promise.all([cached(),cached()]);assert.equal(reads,1);a[0].id='changed';assert.equal(b[0].id,'synthetic');
  assert.equal((await cached())[0].id,'synthetic');assert.equal(reads,1);
  const fresh=modelCatalog(async()=>{reads++;return [{id:'fresh'}];},0);await fresh();await fresh();assert.equal(reads,3);
  let empty=true;const retry=modelCatalog(async()=>empty?[]:[{id:'recovered'}]);await assert.rejects(retry(),/unavailable/);empty=false;assert.equal((await retry())[0].id,'recovered');
});
test('C18 C20 C21 C22: SDK catalog and live control snapshots, compaction and runtime settings', {timeout:15000}, async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'claude-projection-')),binary=join(cwd,'fixture.py');
  await writeFile(binary,`#!/usr/bin/python3
import sys,json,uuid
allow_bypass = '--allow-dangerously-skip-permissions' in sys.argv
def emit(v): print(json.dumps(v),flush=True)
for line in sys.stdin:
    m=json.loads(line)
    if m.get('type')=='control_request':
        kind=m['request']['subtype']
        if kind=='set_permission_mode' and m['request']['mode']=='bypassPermissions': assert allow_bypass
        if kind=='set_permission_mode' and m['request']['mode']=='auto':
            emit({'type':'control_response','response':{'subtype':'error','request_id':m['request_id'],'error':'synthetic settings failure'}})
            continue
        r={'commands':[],'agents':[],'output_style':'default','available_output_styles':[],'models':[{'value':'claude-haiku-5-5','displayName':'Fixture Haiku','description':'synthetic','supportsAdaptiveThinking':True,'supportedEffortLevels':['low','high']}],'account':{},'hooks_applied':True}
        if kind=='get_context_usage': r={'totalTokens':800,'rawMaxTokens':1000,'categories':[{'kind':'used','id':'system_prompt','name':'System prompt','tokens':100},{'kind':'used','id':'messages','name':'Messages','tokens':700}],'memoryFiles':[]}
        emit({'type':'control_response','response':{'subtype':'success','request_id':m['request_id'],'response':r}})
    elif m.get('type')=='user':
        sid=m['session_id']; mid=str(uuid.uuid4())
        emit({'type':'system','subtype':'init','session_id':sid,'model':'claude-haiku-5-5','tools':[]})
        emit({'type':'system','subtype':'compact_boundary','session_id':sid,'compact_metadata':{'trigger':'manual','pre_tokens':950,'post_tokens':800}})
        emit({'type':'assistant','uuid':mid,'session_id':sid,'parent_tool_use_id':None,'message':{'id':mid,'model':'claude-haiku-5-5','role':'assistant','content':[{'type':'tool_use','id':'read','name':'Read','input':{'file_path':'/workspace/work/synthetic.txt'}},{'type':'tool_use','id':'ledger','name':'mcp__system__read','input':{'kind':'goals','id':159}}],'usage':{'input_tokens':600,'cache_read_input_tokens':100,'output_tokens':10}}})
        emit({'type':'user','uuid':str(uuid.uuid4()),'session_id':sid,'parent_tool_use_id':None,'message':{'role':'user','content':[{'type':'tool_result','tool_use_id':'read','content':'synthetic read text'}]}})
        emit({'type':'result','subtype':'success','session_id':sid,'is_error':False,'usage':{'input_tokens':9000,'output_tokens':10},'modelUsage':{'claude-haiku-5-5':{'contextWindow':1000}},'total_cost_usd':0})
`,{mode:0o700});
  const driver=createClaudeDriver({binary}),models=await driver.models!();
  assert.equal(models[0].id,'claude-haiku-5-5');assert.deepEqual(models[0].thinking,['off','adaptive','low','high']);assert.equal(models[0].defaultThinking,'adaptive');assert.equal(models[0].isDefault,true);
  const owned:NonNullable<ReturnType<typeof processIdentity>>[]=[],events:any[]=[];
  const s=await driver.start({agentId:'fixture',driverGeneration:1,cwd,model:'claude-haiku-5-5',thinking:'low',mode:'plan',profile:'generic',settingSources:[],mcp:[],env:{PATH:'/usr/bin:/bin',HOME:cwd}},
    {gate:async()=>({allow:true,rule:'fixture'}),prompt:async()=>({decision:'deny'}),trackPid(pid){const p=processIdentity(pid);if(p)owned.push(p);},log(){}});
  const pump=(async()=>{for await(const e of s.events)events.push(e);})();
  try{
    assert.equal((await s.send({commandId:'one',text:'synthetic',delivery:'start'})).accepted,true);
    const end=Date.now()+5000;while(!events.some(e=>e.type==='turn_completed')&&Date.now()<end)await delay(10);
    assert(events.some(e=>e.type==='turn_completed'));
    const usage=events.findLast(e=>e.item?.type==='usage').item;assert.deepEqual(usage.usage,{used:800,max:1000});assert.equal(usage.context.lastCompaction.savedTokens,150);assert.deepEqual(usage.context.files,[{path:'/workspace/work/synthetic.txt',tokens:5}]);
    assert(events.some(e=>e.item?.name==='Read'&&e.item.detail.filePath==='/workspace/work/synthetic.txt'));
    assert(events.some(e=>e.item?.name==='mcp__system__read'&&e.item.detail.input.id===159));
    await s.setSettings!({thinking:'high',mode:'bypassPermissions'});
    assert.equal((await s.send({commandId:'two',text:'synthetic',delivery:'start'})).accepted,true);
    const next=Date.now()+5000;while(events.filter(e=>e.type==='turn_completed').length<2&&Date.now()<next)await delay(10);
    assert(events.some(e=>e.type==='settings_changed'&&e.runtimeThinking==='high'&&e.runtimeMode==='bypassPermissions'));
    const generation = s.driverGeneration;
    await s.setSettings!({ model: 'synthetic-next', mode: 'auto' });
    assert.equal((await s.send({commandId:'failed',text:'synthetic',delivery:'start'})).accepted,false);
    assert.equal((await s.send({commandId:'recovered',text:'synthetic',delivery:'start'})).accepted,true);
    const recovered=Date.now()+5000;while(events.filter(e=>e.type==='turn_completed').length<3&&Date.now()<recovered)await delay(10);
    assert.equal(events.filter(e=>e.type==='turn_completed').length,3);
    assert.equal(s.driverGeneration,generation+1);
    const runtime=events.findLast(e=>e.type==='settings_changed'&&e.runtimeModel);
    assert.equal(runtime.runtimeModel,'claude-haiku-5-5');assert.equal(runtime.runtimeMode,'bypassPermissions');
  }finally{await s.close();await pump;assert.equal(owned.filter(isAlive).length,0);}
});

test('all tool families preserve policy inputs, including reads', () => {
  for (const [tool, kind] of [['Bash', 'shell'], ['Read', 'read'], ['Grep', 'read'], ['Glob', 'read'],
    ['Write', 'write'], ['Edit', 'write'], ['NotebookEdit', 'write'], ['WebFetch', 'network'], ['mcp__test__call', 'mcp']]) {
    const action = actionFor(tool!, { command: 'echo safe', file_path: '/scratch/example' }, '/scratch');
    assert.equal(action.kind, kind);
    assert.deepEqual(action.paths, ['/scratch/example']);
    assert.equal(action.cwd, '/scratch');
  }
});
test('queue preserves buffered input and wakes a waiting consumer', async () => {
  const q = new AsyncQueue<number>();
  q.push(1); q.push(2);
  const iterator = q[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value, 1);
  assert.equal((await iterator.next()).value, 2);
  const waiting = iterator.next();
  q.push(3);
  assert.equal((await waiting).value, 3);
  q.end();
  assert.equal((await iterator.next()).done, true);
});
test('owned process escalation verifies zero alive without touching unrelated processes', async () => {
  const tracked: number[] = [];
  const host: DriverHost = { gate: async () => ({ allow: true, rule: 'test' }), prompt: async () => ({ decision: 'deny' }),
    trackPid: pid => { tracked.push(pid); }, log() {} };
  const tree = new ProcessTree(host);
  const child = spawn('python3', ['-c', 'import time; time.sleep(60)'], { env: { PATH: '/usr/bin:/bin' }, stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  const identity = processIdentity(child.pid!)!;
  tree.add(child.pid!, 'cli');
  try {
    assert.equal(isAlive(identity), true);
    const result = await tree.stop(false);
    assert.equal(result.alive, 0);
    assert.equal(isAlive(identity), false);
    assert.deepEqual(tracked, [child.pid]);
  } finally { await tree.stop(false); tree.dispose(); }
  await delay(1);
});
test('unresponsive interrupt retires its CLI, verifies cleanup, and resumes on next send', { timeout: 15_000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-control-'));
  const binary = join(cwd, 'fixture.py');
  // Fake transport peer, not an agent. It deliberately ignores interrupt and never opens login files.
  await writeFile(binary, `#!/usr/bin/python3
import sys,json,os,pathlib
pathlib.Path('child-env-names.json').write_text(json.dumps(sorted(os.environ.keys())))
selected={}
for value in sys.argv:
    if value.startswith('--disallowedTools='):
        selected['--disallowedTools']=value.split('=',1)[1]
    elif value=='--disable-slash-commands':
        selected[value]=True
pathlib.Path('child-options.json').write_text(json.dumps(selected))
for line in sys.stdin:
    msg=json.loads(line)
    if msg.get('type')=='control_request' and msg.get('request',{}).get('subtype')=='initialize':
        pathlib.Path('child-prompt.json').write_text(json.dumps({key:msg['request'].get(key) for key in ['systemPrompt','appendSystemPrompt']}))
        result={'commands':[],'agents':[],'output_style':'default','available_output_styles':[],'models':[],'account':{},'hooks_applied':True}
        print(json.dumps({'type':'control_response','response':{'subtype':'success','request_id':msg['request_id'],'response':result}}),flush=True)
`, { mode: 0o700 });
  const identities: NonNullable<ReturnType<typeof processIdentity>>[] = [];
  const host: DriverHost = { gate: async () => ({ allow: true, rule: 'fixture' }), prompt: async () => ({ decision: 'deny' }),
    trackPid(pid) { const p = processIdentity(pid); if (p) identities.push(p); }, log() {} };
  const session = await createClaudeDriver({ binary }).start({
    agentId: 'fixture', driverGeneration: 1, cwd, model: 'fixture', profile: 'generic',
    settingSources: [], mcp: [], env: { PATH: '/usr/bin:/bin', HOME: '/workspace', TMPDIR: tmpdir(), LANG: 'C.UTF-8' },
    systemPrompt: 'synthetic append instruction', disallowedTools: ['WebSearch'], extraArgs: { 'disable-slash-commands': null },
  }, host);
  try {
    // The driver passes exactly these. On macOS the fixture's /usr/bin/python3 is the xcrun shim, which adds the SDK search
    // paths (and CoreFoundation its text encoding) inside the fixture before the real python runs: not the driver's env.
    const shim = process.platform === 'darwin' ? ['CPATH', 'LIBRARY_PATH', 'MANPATH', 'SDKROOT', '__CF_USER_TEXT_ENCODING'] : [];
    assert.deepEqual(JSON.parse(await readFile(join(cwd, 'child-env-names.json'), 'utf8')),
      ['CLAUDE_CODE_FORK_SUBAGENT', 'HOME', 'LANG', 'PATH', 'TMPDIR', ...shim].sort());
    const passed = JSON.parse(await readFile(join(cwd, 'child-options.json'), 'utf8'));
    const prompt = JSON.parse(await readFile(join(cwd, 'child-prompt.json'), 'utf8'));
    assert.equal(prompt.appendSystemPrompt, 'synthetic append instruction');
    assert.equal(prompt.systemPrompt, null);
    assert.equal(passed['--disallowedTools'], 'WebSearch');
    assert.equal(passed['--disable-slash-commands'], true);
    await session.send({ commandId: 'one', text: 'fixture', delivery: 'start' });
    const generation = session.driverGeneration, native = session.nativeId;
    assert.equal((await session.hardStop()).alive, 0);
    assert.deepEqual(session.pids(), []);
    assert.equal((await session.send({ commandId: 'two', text: 'fixture', delivery: 'start' })).accepted, true);
    assert.equal(session.nativeId, native);
    assert.equal(session.driverGeneration, generation + 1);
  } finally { await session.close(); }
  const replaced = await createClaudeDriver({ binary }).start({
    agentId: 'replace-fixture', driverGeneration: 1, cwd, model: 'fixture', profile: 'generic',
    settingSources: [], mcp: [], env: { PATH: '/usr/bin:/bin', HOME: '/workspace', TMPDIR: tmpdir(), LANG: 'C.UTF-8' },
    systemPrompt: 'synthetic replacement instruction', systemPromptMode: 'replace',
  }, host);
  try {
    const prompt = JSON.parse(await readFile(join(cwd, 'child-prompt.json'), 'utf8'));
    assert.deepEqual(prompt.systemPrompt, ['synthetic replacement instruction']);
    assert.equal(prompt.appendSystemPrompt, null);
  } finally { await replaced.close(); }
  assert.equal(identities.filter(isAlive).length, 0);
});

test('C18 C29: SDK resolved full IDs remain discoverable with each alias row and its thinking choices', () => {
  const models = claudeModels([
    { value: 'haiku', resolvedModel: 'claude-haiku-5-5', displayName: 'Haiku', description: '', supportsAdaptiveThinking: true, supportedEffortLevels: ['low', 'medium'] },
    { value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: '', supportedEffortLevels: ['low'] },
    { value: 'claude-fixture', displayName: 'Fixture', description: '' },
  ]);
  assert.deepEqual(models.map(m => [m.id, m.aliases]), [['haiku', ['claude-haiku-5-5']], ['sonnet', ['claude-sonnet-5']], ['claude-fixture', []], ['claude-haiku-5-5', []], ['claude-sonnet-5', []]]);
  assert.deepEqual(models[0].thinking, ['off', 'adaptive', 'low', 'medium']);
  assert.deepEqual(models.find(m => m.id === 'claude-haiku-5-5')!.thinking, models[0].thinking);
});
test('C22: Read result estimates use safe paths, successes only, bounded recent files and clear at compaction', () => {
  const files = new ReadFiles(), base = claudeContext({ totalTokens: 10, rawMaxTokens: 100, categories: [], memoryFiles: [] })!;
  for (const path of ['.env', '../outside', '/tmp/secret.txt', '/tmp/x\nname']) {
    files.start(path, 'Read', { file_path: path }, '/tmp'); files.finish(path, 'not retained');
  }
  files.start('failed', 'Read', {file_path:'/tmp/failed'}, '/tmp'); files.finish('failed','error',true);
  files.start('write', 'Write', {file_path:'/tmp/write'}, '/tmp'); files.finish('write','write result');
  assert.deepEqual(files.project(base).context.files, []);
  files.start('read', 'Read', {file_path:'safe.txt'}, '/tmp'); files.finish('read', [{type:'text',text:'12345678'},{type:'image',data:'ignored'}]);
  assert.deepEqual(files.project(base).context.files,[{path:'/tmp/safe.txt',tokens:2}]);
  files.start('again', 'Read', {file_path:'safe.txt'}, '/tmp'); files.finish('again', '1234');
  assert.deepEqual(files.project(base).context.files,[{path:'/tmp/safe.txt',tokens:1}]);
  for (let n=0;n<101;n++) { files.start(String(n),'Read',{file_path:`/tmp/safe-${n}`},'/tmp'); files.finish(String(n),'x'.repeat(100)); }
  const projected=files.project(base);assert.equal(projected.context.files.length,100);assert.equal(projected.context.files[0].path,'/tmp/safe-100');
  assert(projected.context.files.every(f=>f.tokens<=10));assert.equal(projected.context.categories.reduce((n,c)=>n+c.tokens,0),10);
  files.clear();assert.deepEqual(files.project(base).context.files,[]);
});

test('C11: MCP elicitation explicitly declines form and URL requests with a content-free notice', { timeout: 15_000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-elicitation-')), binary = join(cwd, 'fixture.py');
  await writeFile(binary, `#!/usr/bin/python3
import sys,json,uuid
def emit(v): print(json.dumps(v),flush=True)
for line in sys.stdin:
    m=json.loads(line)
    if m.get('type')=='control_request':
        result={'commands':[],'agents':[],'models':[],'account':{},'hooks_applied':True}
        emit({'type':'control_response','response':{'subtype':'success','request_id':m['request_id'],'response':result}})
    elif m.get('type')=='user':
        sid=m['session_id']
        emit({'type':'system','subtype':'init','session_id':sid,'model':'claude-haiku-5-5','tools':[]})
        for n,extra in enumerate([{'mode':'form','mcp_server_name':'third-party'},{'mode':'url','mcp_server_name':'third-party'},{'mcp_server_name':'https://fixture.invalid/ELICITATION_FIXTURE_CONTENT'}]):
            request={'subtype':'elicitation','message':'ELICITATION_FIXTURE_CONTENT','url':'https://fixture.invalid/ELICITATION_FIXTURE_CONTENT','requested_schema':{'type':'object','properties':{'field':{'type':'string','default':'ELICITATION_FIXTURE_CONTENT'}}},'title':'ELICITATION_FIXTURE_CONTENT',**extra}
            request_id='elicitation-'+str(n)
            emit({'type':'control_request','request_id':request_id,'request':request})
            answer=json.loads(sys.stdin.readline())
            assert answer=={'type':'control_response','response':{'subtype':'success','request_id':request_id,'response':{'action':'decline'}}}
        emit({'type':'result','subtype':'success','session_id':sid,'is_error':False,'usage':{'input_tokens':0,'output_tokens':0},'modelUsage':{},'total_cost_usd':0})
`, { mode: 0o700 });
  const owned: NonNullable<ReturnType<typeof processIdentity>>[] = [], events: any[] = [];
  const session = await createClaudeDriver({ binary }).start({ agentId: 'elicitation-fixture', driverGeneration: 1, cwd,
    model: 'claude-haiku-5-5', thinking: 'low', profile: 'generic', settingSources: [], mcp: [], env: { PATH: '/usr/bin:/bin', HOME: cwd } }, {
    gate: async () => { assert.fail('elicitation must decline without a policy request'); },
    prompt: async () => { assert.fail('elicitation must not prompt'); }, log() {},
    trackPid(pid) { const p = processIdentity(pid); if (p) owned.push(p); },
  });
  const pump = (async () => { for await (const event of session.events) events.push(event); })();
  try {
    assert.equal((await session.send({ commandId: 'elicitation', text: 'Synthetic elicitation', delivery: 'start' })).accepted, true);
    const deadline = Date.now() + 5000;
    while (!events.some(e => ['turn_completed','turn_failed'].includes(e.type)) && Date.now() < deadline) await delay(10);
    assert(events.some(e => e.type === 'turn_completed'), 'peer verifies every decline reply before completing');
    const notices = events.filter(e => e.type === 'timeline' && e.item.type === 'other' && e.item.raw?.subtype === 'notice');
    assert.deepEqual(notices.map(e => e.item), [
      { type: 'other', raw: { subtype: 'notice', kind: 'mcp_elicitation', serverName: 'third-party', mode: 'form', text: 'declined: elicitation not supported' } },
      { type: 'other', raw: { subtype: 'notice', kind: 'mcp_elicitation', serverName: 'third-party', mode: 'url', text: 'declined: elicitation not supported' } },
      { type: 'other', raw: { subtype: 'notice', kind: 'mcp_elicitation', serverName: 'unknown', mode: 'form', text: 'declined: elicitation not supported' } },
    ]);
    assert(notices.every(e => e.turnId === events.find(e => e.type === 'turn_started').turnId));
    assert.equal(JSON.stringify(events).includes('ELICITATION_FIXTURE_CONTENT'), false);
  } finally { await session.close(); await pump; assert.equal(owned.filter(isAlive).length, 0); }
});
