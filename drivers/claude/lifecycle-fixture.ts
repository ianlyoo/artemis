/** Synthetic transport and real core fixture for the Claude lifecycle regressions. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Database } from '../../core/db.ts';
import { Journal } from '../../core/journal/index.ts';
import { Registry } from '../../core/registry.ts';
import { ProcessCustody } from '../../core/procs/posix.ts';
import { fakeTerminals, console } from '../../core/journal/fixtures.ts';
import { stubPlugin } from '../../core/policy/fixture.ts';
import { createPolicy } from '../../core/policy/index.ts';
import { createClaudeDriver, type ClaudeSession } from './index.ts';
import { processIdentity, isAlive, type ProcessIdentity } from './processes.ts';
import type { DriverEvent, TimelineItem } from '../../core/types.ts';

export async function until(check: () => boolean, ms = 60_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) { if (Date.now() >= deadline) throw new Error('Lifecycle fixture timed out'); await delay(25); }
}
export async function fakeBinary(cwd: string): Promise<string> {
  const binary = join(cwd, 'fixture.py');
  await writeFile(binary, `#!/usr/bin/python3
import sys,json,pathlib,uuid
trace=pathlib.Path('transport.jsonl')
def record(value):
    with trace.open('a') as f: f.write(json.dumps(value)+'\\n')
def emit(value): print(json.dumps(value),flush=True)
args={}
for index,arg in enumerate(sys.argv[1:],1):
    for name in ['--resume','--resume-session-at','--session-id']:
        if arg.startswith(name+'='): args[name]=arg.split('=',1)[1]
        elif arg==name: args[name]=sys.argv[index+1]
record({'type':'launch','args':args})
if args.get('--resume') and not any(json.loads(line).get('sessionId')==args['--resume'] for line in trace.read_text().splitlines()):
    sys.exit(1)
for line in sys.stdin:
    msg=json.loads(line)
    if msg.get('type')=='control_request':
        result={'commands':[],'agents':[],'output_style':'default','available_output_styles':[],'models':[],'account':{},'hooks_applied':True}
        emit({'type':'control_response','response':{'subtype':'success','request_id':msg['request_id'],'response':result}})
    elif msg.get('type')=='user':
        sid=msg['session_id']; reply=str(uuid.uuid4())
        record({'type':'user','sessionId':sid,'uuid':msg['uuid'],'reply':reply})
        emit({'type':'system','subtype':'init','session_id':sid,'tools':[]})
        emit({'type':'assistant','uuid':reply,'session_id':sid,'parent_tool_use_id':None,'message':{'id':reply,'type':'message','role':'assistant','content':[{'type':'text','text':'ACK'}]}})
        emit({'type':'result','subtype':'success','session_id':sid,'is_error':False,'usage':{'input_tokens':0,'output_tokens':0},'total_cost_usd':0})
`, { mode: 0o700 });
  return binary;
}

/** The fake peer's transcript contains IDs only and lives in the test cwd. */
export async function fakeHistory(id: string, { dir }: { dir: string }) {
  const trace = (await readFile(join(dir, 'transport.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  return trace.filter(row => row.type === 'user' && row.sessionId === id).flatMap(row => [
    { type: 'user' as const, uuid: String(row.uuid), parent_tool_use_id: null },
    { type: 'assistant' as const, uuid: String(row.reply), parent_tool_use_id: null },
  ]);
}

export async function lifecycleFixture(fake = false) {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-lifecycle-'));
  const binary = fake ? await fakeBinary(cwd) : undefined;
  const db = new Database(join(cwd, 'engine.db'));
  const plugin = stubPlugin({ classify: async () => ({ decision: 'deny', rule: 'fixture.no-tools', reason: 'No tools or delegation. Stop without retrying.' }) });
  const journal = new Journal(db, plugin), policy = createPolicy({ db, plugin, journal, log() {} });
  const owned: ProcessIdentity[] = [], sessions: ClaudeSession[] = [];
  const events: DriverEvent[] = [];
  const driver = createClaudeDriver({ binary, ...(fake ? { readHistory: fakeHistory } : {}) });
  const core = new Registry({ db, journal, plugin, policy, terminals: fakeTerminals(), procs: new ProcessCustody(db),
    drivers: [{ ...driver, async start(spec, host, resume) {
      const session = await driver.start(spec, { ...host, trackPid(pid, role) {
        host.trackPid(pid, role); const identity = processIdentity(pid); if (identity) owned.push(identity);
      } }, resume);
      sessions.push(session);
      return {
        get nativeId() { return session.nativeId; }, get driverGeneration() { return session.driverGeneration; },
        events: (async function* () { for await (const event of session.events) { events.push(event); yield event; } })(),
        send: session.send.bind(session), interrupt: session.interrupt.bind(session), hardStop: session.hardStop.bind(session),
        rewind: session.rewind.bind(session), setSettings: session.setSettings?.bind(session),
        pids: session.pids.bind(session), close: session.close.bind(session),
      };
    } }] });
  const { id } = await core.create({ requestId: 'parent', provider: 'claude', model: 'claude-haiku-5-5', thinking: 'off',
    mode: 'default', cwd, title: 'lifecycle fixture', profile: 'generic' }, console);
  return { cwd, db, core, journal, id, owned, sessions, events,
    async turn(requestId: string, text: string) {
      const before = journal.cursor(id).seq;
      const ack = await core.send(id, { requestId, text, clientMessageId: `client-${requestId}` }, console);
      await until(() => ['completed', 'failed', 'delivery_unknown', 'canceled'].includes(core.commandState(ack.commandId) ?? ''));
      assert.equal(core.commandState(ack.commandId), 'completed');
      journal.flush(id);
      const frames = core.timeline(id, { tail: 200 }).frames.filter(f => f.seq > before);
      const response = frames.flatMap(f => {
        const item = f.item as TimelineItem | undefined;
        return item?.type === 'assistant_message' ? [item.text] : [];
      }).join('');
      return { ack, frames, text: response };
    },
    async close() {
      try { await core.close(); } finally { journal.close(); db.close(); }
      assert.equal(owned.filter(isAlive).length, 0);
    },
  };
}
