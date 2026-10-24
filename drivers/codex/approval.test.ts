import test from 'node:test';
import assert from 'node:assert/strict';
import { approve } from './approval.ts';
import { codexEnv } from './env.ts';
import { createCodexDriver } from './index.ts';
import { createAgyDriver } from '../agy/index.ts';
import type { DriverHost } from '../../core/types.ts';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { protocolDir, approvalFiles, contractTest } from './contract.ts';
import { processIdentity, isAlive } from '../claude/processes.ts';
import { codexContext } from '../projection.ts';
const raw = { kind: 'command', threadId: 'thread', turnId: 'turn', itemId: 'item', startedAtMs: 1, environmentId: null, command: 'printf safe', cwd: '/tmp', commandActions: [] };
const host: DriverHost = { gate: async () => ({ allow: true, rule: 'test' }), prompt: async () => ({ decision: 'deny' }), trackPid() {}, log() {} };
test('VERSIONS: matching approvals still require the single pinned Codex handshake version', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'codex-pin-')), binary = join(cwd, 'fixture.py'), version = join(cwd, 'version.txt');
  try {
    await writeFile(binary, `#!/usr/bin/python3
import sys,json,os,pathlib,shutil
if 'generate-ts' in sys.argv:
    out=pathlib.Path(sys.argv[sys.argv.index('--out')+1])
    for f in ${JSON.stringify(approvalFiles)}:
        dest=out/f; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(pathlib.Path(${JSON.stringify(protocolDir)})/f,dest)
    sys.exit(0)
for line in sys.stdin:
    m=json.loads(line)
    if m.get('method')=='initialize':
        print(json.dumps({'id':m['id'],'result':{'userAgent':'codex/'+pathlib.Path(${JSON.stringify(version)}).read_text(),'codexHome':os.environ['CODEX_HOME'],'platformOs':'macos' if sys.platform=='darwin' else sys.platform}}),flush=True)
`, { mode: 0o700 });
    for (const v of ['0.163.0', '0.165.0', '0.164.0']) {
      await writeFile(version, v);
      const check = contractTest(binary, codexEnv({ PATH: '/usr/bin:/bin', HOME: cwd }, cwd));
      if (v === '0.164.0') await check;
      else await assert.rejects(check, /Handshake contract mismatch/);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('C18 C20 C21 C22 X06: app-server catalogs, next-turn mutations, typed tools and compaction snapshots', {timeout:30000}, async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'codex-projection-')),binary=join(cwd,'fixture.py'),trace=join(cwd,'settings.jsonl');
  await writeFile(binary,`#!/usr/bin/python3
import sys,json,os,pathlib,shutil,uuid,time
if 'generate-ts' in sys.argv:
    out=pathlib.Path(sys.argv[sys.argv.index('--out')+1])
    for f in ${JSON.stringify(approvalFiles)}:
        dest=out/f; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(pathlib.Path(${JSON.stringify(protocolDir)})/f,dest)
    sys.exit(0)
def emit(v): print(json.dumps(v),flush=True)
def notify(method,params): emit({'method':method,'params':params})
def model(name,default): return {'id':name,'model':name,'displayName':name,'hidden':False,'supportedReasoningEfforts':[{'reasoningEffort':'low'},{'reasoningEffort':'high'}],'defaultReasoningEffort':'low','isDefault':default}
for line in sys.stdin:
    m=json.loads(line); method=m.get('method'); p=m.get('params',{}); r={}
    if 'id' not in m: continue
    if method=='initialize': r={'userAgent':'codex/0.164.0','codexHome':os.environ['CODEX_HOME'],'platformOs':'macos' if sys.platform=='darwin' else sys.platform}
    elif method=='model/list': r={'data':[model('synthetic-alternate' if p.get('cursor') else 'gpt-6-luna',not p.get('cursor'))],'nextCursor':None if p.get('cursor') else 'page2'}
    elif method=='thread/start': r={'thread':{'id':'fixture-thread'},'model':p['model'],'reasoningEffort':p['config']['model_reasoning_effort']}
    elif method=='turn/start':
        with open(${JSON.stringify(trace)},'a') as f: f.write(json.dumps({k:p.get(k) for k in ['model','effort','collaborationMode','sandboxPolicy']})+'\\n')
        turn=str(uuid.uuid4()); r={'turn':{'id':turn}}
        notify('turn/started',{'threadId':'fixture-thread','turn':{'id':turn}})
        time.sleep(0.15)
        emit({'id':'approval-'+turn,'method':'item/commandExecution/requestApproval','params':{'kind':'command','threadId':'fixture-thread','turnId':turn,'itemId':'fixture-command','startedAtMs':1,'cwd':os.getcwd(),'command':'touch synthetic-plan-file','commandActions':[]}})
        answer=json.loads(sys.stdin.readline())
        assert answer['result']['decision']==('decline' if p['collaborationMode']['mode']=='plan' else 'accept')
        for item in [{'type':'commandExecution','id':'read','command':'cat synthetic.txt','cwd':'/workspace/work','commandActions':[{'type':'read','path':'/workspace/work/synthetic.txt'}],'status':'completed'}, {'type':'mcpToolCall','id':'ledger','server':'system','tool':'read','arguments':{'kind':'goals','id':159},'status':'completed'}]:
            notify('item/started',{'threadId':'fixture-thread','turnId':turn,'item':item})
            notify('item/completed',{'threadId':'fixture-thread','turnId':turn,'item':item})
        notify('thread/tokenUsage/updated',{'threadId':'fixture-thread','tokenUsage':{'last':{'inputTokens':850,'cachedInputTokens':100,'outputTokens':50,'totalTokens':900},'total':{'totalTokens':99999},'modelContextWindow':1000}})
        notify('item/started',{'threadId':'fixture-thread','item':{'type':'contextCompaction','id':'compact'}})
        notify('thread/tokenUsage/updated',{'threadId':'fixture-thread','tokenUsage':{'last':{'inputTokens':750,'cachedInputTokens':100,'outputTokens':50,'totalTokens':800},'modelContextWindow':1000}})
        notify('item/completed',{'threadId':'fixture-thread','item':{'type':'contextCompaction','id':'compact'}})
        notify('turn/completed',{'threadId':'fixture-thread','turn':{'id':turn,'status':'completed'}})
    emit({'id':m['id'],'result':r})
`,{mode:0o700});
  const driver=createCodexDriver({binary,codexHome:cwd});
  const models=await driver.models!();assert.deepEqual(models.map(m=>m.id),['gpt-6-luna','synthetic-alternate']);assert.deepEqual(models[0].thinking,['low','high']);assert.equal(models[0].defaultThinking,'low');assert.equal(models[0].isDefault,true);
  const owned:NonNullable<ReturnType<typeof processIdentity>>[]=[],events:any[]=[];
  const s=await driver.start({agentId:'fixture',driverGeneration:1,cwd,model:'gpt-6-luna',thinking:'low',mode:'default',profile:'generic',settingSources:[],mcp:[],env:{PATH:'/usr/bin:/bin',HOME:cwd},codexHome:cwd},
    {...host,trackPid(pid){const p=processIdentity(pid);if(p)owned.push(p);}});
  const pump=(async()=>{for await(const e of s.events)events.push(e);})();
  try{
    for(const [index,settings] of [{model:'gpt-6-luna',thinking:'low',mode:'default'},{model:'synthetic-alternate',thinking:'high',mode:'plan'},{model:'gpt-6-luna',thinking:'low',mode:'default'}].entries()){
      await s.setSettings!(settings);
      const sending=s.send({commandId:`turn-${index}`,text:'synthetic',delivery:'start'});
      if(settings.mode==='plan'){
        const started=Date.now()+5000;while(events.filter(e=>e.type==='turn_started').length<=index&&Date.now()<started)await delay(10);
        assert.equal(events.filter(e=>e.type==='turn_started').length,index+1);
        await s.setSettings!({mode:'default'}); // Next turn must not relax this Plan approval.
      }
      assert.equal((await sending).accepted,true);
      const end=Date.now()+5000;while(events.filter(e=>e.type==='turn_completed').length<=index&&Date.now()<end)await delay(10);
      assert.equal(events.filter(e=>e.type==='turn_completed').length,index+1);
      const sent=JSON.parse((await readFile(trace,'utf8')).trim().split('\n').at(-1)!);
      assert.deepEqual(sent.sandboxPolicy,settings.mode==='plan'?{type:'readOnly',networkAccess:false}:{type:'dangerFullAccess'});
      assert.equal(sent.model,settings.model);assert.equal(sent.effort,settings.thinking);assert.equal(sent.collaborationMode.mode,settings.mode);assert.equal(sent.collaborationMode.settings.model,settings.model);assert.equal(sent.collaborationMode.settings.reasoning_effort,settings.thinking);
      const runtime=events.findLast(e=>e.type==='settings_changed'&&e.runtimeModel);assert.equal(runtime.runtimeModel,settings.model);assert.equal(runtime.runtimeThinking,settings.thinking);assert.equal(runtime.runtimeMode,settings.mode);
    }
    const usage=events.findLast(e=>e.item?.type==='usage').item;assert.deepEqual(usage.usage,{used:800,max:1000});assert.equal(usage.context.lastCompaction.savedTokens,100);assert.equal(usage.context.categories.reduce((s:number,c:any)=>s+c.tokens,0),800);
    assert(events.some(e=>e.item?.name==='Read'&&e.item.detail.filePath==='/workspace/work/synthetic.txt'));
    assert(events.some(e=>e.item?.name==='mcp__system__read'&&e.item.detail.input.id===159));
    assert.equal(codexContext({total:{totalTokens:99999},modelContextWindow:1000}),null);
  }finally{await s.close();await pump;assert.equal(owned.filter(isAlive).length,0);}
});
test('command and patch gate: allow once, deny with user id, exceptions and missing context fail closed', async () => {
  const denied: string[] = [];
  const opts = { cwd: '/tmp', threadId: 'thread', host: { ...host }, changes: new Map(), denied: (s: string) => { denied.push(s); } };
  assert.deepEqual(await approve('item/commandExecution/requestApproval', raw, opts), { decision: 'accept' });
  opts.host.gate = async () => ({ allow: false, reason: 'needs user', rule: 'protected', awaitingUser: 'approval-1' });
  assert.deepEqual(await approve('item/commandExecution/requestApproval', raw, opts), { decision: 'decline' });
  assert.match(denied.at(-1)!, /awaiting_user approval-1/);
  opts.host.gate = async () => { throw new Error('injected'); };
  assert.deepEqual(await approve('item/commandExecution/requestApproval', raw, opts), { decision: 'decline' });
  opts.host.gate = async action => { assert.deepEqual(action.paths, ['/tmp/example']); return { allow: true, rule: 'test' }; };
  assert.deepEqual(await approve('item/fileChange/requestApproval', raw, opts), { decision: 'decline' });
  opts.changes.set('item', [{ path: '/tmp/example' }]);
  assert.deepEqual(await approve('item/fileChange/requestApproval', raw, opts), { decision: 'accept' });
  assert.deepEqual(await approve('item/commandExecution/requestApproval', { ...raw, threadId: 'wrong' }, opts), { decision: 'decline' });
});
test('agy disabled and forbidden environment rejected', async () => {
  const d = createAgyDriver(); assert.deepEqual(await d.selfTest!(), { ok: false, reason: 'agy disabled until its own verdict' });
  await assert.rejects(d.start({} as any, host), { code: 'DRIVER_DISABLED', status: 503 });
  assert.throws(() => codexEnv({ PASEO_TEST: 'x' }, '/tmp'), /Forbidden/);
  assert.throws(() => codexEnv({}, '/tmp/.paseo/test'));
});

test('missing binary fails selfTest without an unhandled child error', async () => {
  const driver = createCodexDriver({ binary: '/nonexistent-engine-fixture-codex', codexHome: '/tmp' });
  assert.equal((await driver.selfTest!()).ok, false);
});

test('C11: MCP elicitation gates by server without item fields; denial and malformed requests use the MCP reply shape', async () => {
  const requests: any[] = [], denied: string[] = [];
  const p = { threadId: 'thread', turnId: null, serverName: 'ledger', mode: 'form', message: 'Synthetic permission', requestedSchema: { type: 'object', properties: {} }, _meta: null };
  const opts = { cwd: '/tmp', threadId: 'thread', host: { ...host, gate: async (action: any, detail: any) => {
    requests.push({ action, detail }); return { allow: true as const, rule: 'fixture' };
  } } as DriverHost, changes: new Map(), denied: (s: string) => { denied.push(s); } };
  assert.deepEqual(await approve('mcpServer/elicitation/request', p, opts), { action: 'accept', content: null, _meta: null });
  assert.deepEqual(requests, [{ action: { kind: 'mcp', tool: 'ledger', paths: [], cwd: '/tmp' }, detail: { tool: 'ledger', input: p } }]);
  for (const bad of [null, { ...p, threadId: 'other' }, { ...p, serverName: '' }, { ...p, turnId: 4 }, { ...p, mode: 'future' }]) {
    assert.deepEqual(await approve('mcpServer/elicitation/request', bad, opts), { action: 'decline', content: null, _meta: null });
  }
  assert.equal(requests.length, 1);
  opts.host.gate = async () => ({ allow: false, rule: 'user', reason: 'needs user', awaitingUser: 'fixture-user' });
  assert.deepEqual(await approve('mcpServer/elicitation/request', p, opts), { action: 'decline', content: null, _meta: null });
  assert.match(denied.at(-1)!, /awaiting_user fixture-user/);
  opts.host.gate = async () => { throw new Error('fixture unavailable'); };
  assert.deepEqual(await approve('mcpServer/elicitation/request', p, opts), { action: 'decline', content: null, _meta: null });
});

test('C20: Plan cannot grant command, network, patch or MCP permissions beyond its read-only sandbox', async () => {
  let calls = 0;
  const opts = { cwd: '/tmp', threadId: 'thread', readOnly: true,
    host: { ...host, gate: async () => { calls++; return { allow: true as const, rule: 'fixture' }; } },
    changes: new Map([['item', [{ path: '/tmp/synthetic-plan-file' }]]]), denied() {} };
  for (const [method, p] of [
    ['item/commandExecution/requestApproval', raw],
    ['item/commandExecution/requestApproval', { ...raw, networkApprovalContext: { host: 'fixture.invalid', protocol: 'https' } }],
    ['item/fileChange/requestApproval', raw],
  ] as const) assert.deepEqual(await approve(method, p, opts), { decision: 'decline' });
  assert.deepEqual(await approve('mcpServer/elicitation/request', { threadId: 'thread', turnId: null, serverName: 'ledger', mode: 'form' }, opts), { action: 'decline', content: null, _meta: null });
  assert.equal(calls, 0, 'Plan refuses locally without creating an user escalation');
  assert.deepEqual(await approve('item/commandExecution/requestApproval', raw, { ...opts, readOnly: false }), { decision: 'accept' });
  assert.equal(calls, 1);
});

test('C11: non-LEDGER MCP form and URL elicitation denial returns no form content or metadata', async () => {
  const calls: any[] = [];
  const opts = { cwd: '/tmp', threadId: 'thread', changes: new Map(), denied() {}, host: { ...host,
    gate: async (action: any) => { calls.push(action); return { allow: false as const, rule: 'fixture', reason: 'not supported' }; },
  } };
  for (const mode of ['form', 'url']) {
    assert.deepEqual(await approve('mcpServer/elicitation/request', { threadId: 'thread', turnId: null, serverName: 'third-party', mode,
      message: 'ELICITATION_FIXTURE_CONTENT', requestedSchema: { field: 'ELICITATION_FIXTURE_CONTENT' },
      url: 'https://fixture.invalid/ELICITATION_FIXTURE_CONTENT', _meta: { fixture: 'ELICITATION_FIXTURE_CONTENT' },
    }, opts), { action: 'decline', content: null, _meta: null });
  }
  assert.deepEqual(calls, Array(2).fill({ kind: 'mcp', tool: 'third-party', paths: [], cwd: '/tmp' }));
});
