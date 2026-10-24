import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildChildEnv } from '../env.ts';
import { isAlive, killTree, readProc, type ProcIdentity } from '../procs/posix.ts';
import { scratch, until } from '../journal/fixtures.ts';

async function run(mode:string):Promise<void> {
  const child=fork(fileURLToPath(new URL('./parity-fixture.ts',import.meta.url)),[mode,scratch('parity-')],{
    env:buildChildEnv('terminal'),execArgv:['--disable-warning=ExperimentalWarning'],stdio:['ignore','ignore','ignore','ipc'],
  });
  const owned:ProcIdentity[]=[],root=readProc(child.pid!);if(root)owned.push(root);
  let exited=false,passed=false,failure='';
  child.on('message',(m:{owned?:ProcIdentity[];passed?:boolean;failed?:boolean;detail?:string})=>{if(m.owned)owned.push(...m.owned);if(m.passed)passed=true;if(m.failed)failure=m.detail??'fixture failed';});
  const exit=new Promise<number|null>(resolve=>child.once('exit',code=>{exited=true;resolve(code);}));
  try {
    await until(()=>exited,60000);assert.equal(await exit,0,failure);assert.equal(passed,true,failure);
  } finally {
    if(root)await killTree([root]);await until(()=>exited&&owned.every(p=>!isAlive(p)),30000);
    console.log(`parity ${mode}: owned=${new Set(owned.map(p=>`${p.pid}:${p.startTime}`)).size}, alive=0`);
  }
}
test('P5 real daemon: waitFor idle drains create prompts, queued turns and dispatching acknowledgements',{timeout:90000},()=>run('idle'));
for(const mode of ['interrupt-before-ack','interrupt-after-ack','interrupt-early-result'])
  test(`P11 real daemon: ${mode}; late old terminals cannot finish the replacement turn`,{timeout:90000},()=>run(mode));
