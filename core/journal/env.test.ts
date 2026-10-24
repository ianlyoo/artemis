import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertDaemonEnv, buildChildEnv, validateIntentEnv, validatePluginEnv } from '../env.ts';
import { fixture, console, intent, scratch, until } from './fixtures.ts';

const credentialNames=['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','ANTHROPIC_BASE_URL',
  'ANTHROPIC_CUSTOM_HEADERS','ANTHROPIC_TEAM_ID','ANTHROPIC_TEAM_API_KEY','OPENAI_API_KEY','CUSTOM_TOKEN',
  'CUSTOM_SECRET','CUSTOM_KEY','ARTEMIS_PLUGIN_ACCESS_TOKEN','ARTEMIS_PLUGIN_SECRET','ARTEMIS_PLUGIN_SIGNING_KEY','CLAUDE_CODE_CUSTOM_KEY',
  'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','GLOBAL_AGENT_HTTP_PROXY','npm_config_https_proxy'];
const tuningNames=['ARTEMIS_PLUGIN_ROLE','ARTEMIS_PLUGIN_AGENT_ID','ARTEMIS_PLUGIN_GOAL','ARTEMIS_PLUGIN_PROJECT','ARTEMIS_PLUGIN_CONFIG','ARTEMIS_PLUGIN_PROXY_URL',
  'ARTEMIS_PLUGIN_CUSTOM_IDENTITY','CLAUDE_CONFIG_DIR','CLAUDE_CODE_FORK_SUBAGENT','CLAUDE_CODE_DISABLE_CLAUDE_MDS'];

test('caller identity and tuning remain forbidden before admission; daemon env rules stay unchanged',async()=>{
  const f=fixture();let admissionCalls=0;f.plugin.beforeCreate=async()=>{admissionCalls++;return {ok:true};};
  try {
    for(const name of tuningNames) {
      await assert.rejects(f.core.create(intent({env:{[name]:'synthetic'}}),console),{code:'FORBIDDEN'});
      assert.throws(()=>assertDaemonEnv({[name]:'synthetic'}),{code:'FORBIDDEN'});
    }
    assert.equal(admissionCalls,0);assert.equal(f.core.list().length,0);
    validateIntentEnv({EXTRA:'synthetic'});
    // The daemon's historical check is unchanged. Ambient non-allowlisted names
    // never reach children even if that check does not reject them.
    assert.doesNotThrow(()=>assertDaemonEnv({CUSTOM_KEY:'synthetic',HTTPS_PROXY:'synthetic'}));
    const child=buildChildEnv('claude',{},Object.fromEntries([...credentialNames,...tuningNames].map(k=>[k,'synthetic'])));
    for(const name of [...credentialNames,...tuningNames])assert.equal(child[name],undefined);
  } finally {await f.close();}
});

test('trusted admission and beforeSpawn identity, configuration directory and tuning survive restart',async()=>{
  const configuration=scratch('configuration-'),spawnConfig=scratch('spawn-configuration-'),f=fixture(),file=f.db.file;
  const pluginEnv={ARTEMIS_PLUGIN_ROLE:'builder',ARTEMIS_PLUGIN_AGENT_ID:'admitted',ARTEMIS_PLUGIN_GOAL:'159',ARTEMIS_PLUGIN_PROJECT:'75',
    ARTEMIS_PLUGIN_CONFIG:'synthetic',ARTEMIS_PLUGIN_PROXY_URL:'http://127.0.0.1:0/system-proxy',ARTEMIS_PLUGIN_CUSTOM_IDENTITY:'custom',
    CLAUDE_CONFIG_DIR:configuration,CLAUDE_CODE_FORK_SUBAGENT:'0',CLAUDE_CODE_DISABLE_CLAUDE_MDS:'1',EXTRA:'plugin'};
  let id='';
  try {
    f.plugin.beforeCreate=async()=>({ok:true,env:pluginEnv});
    f.plugin.beforeSpawn=async(a,s)=>({...s,env:{...s.env,ARTEMIS_PLUGIN_AGENT_ID:a.id,ARTEMIS_PLUGIN_SPAWN_ONLY:'trusted',
      CLAUDE_CONFIG_DIR:spawnConfig,CLAUDE_CODE_FORK_SUBAGENT:'1',CLAUDE_CODE_DISABLE_CLAUDE_MDS:'0'}});
    const created=await f.core.create(intent({env:{EXTRA:'caller'}}),console);id=created.id;
    assert.deepEqual(f.core.get(id)?.env,pluginEnv);
    await f.core.send(id,{requestId:'first',text:'synthetic'},console);
    await until(()=>!!f.driver.specs[0],30000);
    const spawned={...pluginEnv,ARTEMIS_PLUGIN_AGENT_ID:id,CLAUDE_CONFIG_DIR:spawnConfig,CLAUDE_CODE_FORK_SUBAGENT:'1',CLAUDE_CODE_DISABLE_CLAUDE_MDS:'0'};
    for(const [key,value] of Object.entries(spawned))assert.equal(f.driver.specs[0].env[key],value);
    assert.equal(f.driver.specs[0].env.ARTEMIS_PLUGIN_SPAWN_ONLY,'trusted');
  } finally {await f.close();}
  const resumed=fixture(file);
  try {
    resumed.core.reconcile();await resumed.core.send(id,{requestId:'resumed',text:'synthetic'},console);
    await until(()=>!!resumed.driver.specs[0],30000);
    for(const [key,value] of Object.entries(pluginEnv))assert.equal(resumed.driver.specs[0].env[key],value);
    assert.equal(resumed.driver.specs[0].env.ARTEMIS_PLUGIN_SPAWN_ONLY,undefined,'beforeSpawn output is reapplied, not persisted');
  } finally {await resumed.close();}
});

test('credential and proxy names are refused from caller, admission and beforeSpawn',async()=>{
  const f=fixture();
  try {
    for(const name of credentialNames) {
      assert.throws(()=>validateIntentEnv({[name]:'synthetic'}),{code:'FORBIDDEN'});
      assert.throws(()=>validatePluginEnv({[name]:'synthetic'}),{code:'FORBIDDEN'});
      assert.throws(()=>buildChildEnv('claude',{}, {}, {},{[name]:'synthetic'}),{code:'FORBIDDEN'});
      f.plugin.beforeCreate=async()=>({ok:true,env:{[name]:'synthetic'}});
      await assert.rejects(f.core.create(intent(),console),{code:'FORBIDDEN'});
      f.plugin.beforeCreate=async()=>({ok:true});
      f.plugin.beforeSpawn=async(_a,s)=>({...s,env:{...s.env,[name]:'synthetic'}});
      const {id}=await f.core.create(intent(),console),send=await f.core.send(id,{requestId:`run-${id}`,text:'synthetic'},console);
      await until(()=>f.core.commandState(send.commandId)==='failed',30000);
      assert.equal(f.driver.specs.length,0,'forbidden output never reaches driver.start');
    }
  } finally {await f.close();}
});

test('plugin Claude configuration must be an absolute existing directory at admission and spawn',async()=>{
  const f=fixture(),root=scratch('config-validation-'),directory=join(root,'configuration'),file=join(root,'regular-file');
  mkdirSync(directory);writeFileSync(file,'synthetic');
  try {
    validatePluginEnv({CLAUDE_CONFIG_DIR:directory});
    for(const path of ['', 'relative-configuration', join(root,'missing'),file]) {
      assert.throws(()=>validatePluginEnv({CLAUDE_CONFIG_DIR:path}),{code:'FORBIDDEN'});
      f.plugin.beforeCreate=async()=>({ok:true,env:{CLAUDE_CONFIG_DIR:path}});
      await assert.rejects(f.core.create(intent(),console),{code:'FORBIDDEN'});
      f.plugin.beforeCreate=async()=>({ok:true});
      f.plugin.beforeSpawn=async(_a,s)=>({...s,env:{...s.env,CLAUDE_CONFIG_DIR:path}});
      const {id}=await f.core.create(intent(),console),send=await f.core.send(id,{requestId:`run-${id}`,text:'synthetic'},console);
      await until(()=>f.core.commandState(send.commandId)==='failed',30000);
    }
    assert.equal(f.driver.specs.length,0);
    for(const name of ['LEDGER_SETTING','PASEO_SETTING','CLAUDECODE','NODE_OPTIONS','LD_PRELOAD'])assert.throws(()=>validatePluginEnv({[name]:'synthetic'}),{code:'FORBIDDEN'});
  } finally {await f.close();}
});
