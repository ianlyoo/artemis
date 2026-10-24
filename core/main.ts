import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { mkdirSync, realpathSync } from 'node:fs';
import { assertDaemonEnv } from './env.ts';
import { acquireLock } from './locks.ts';
import { Database } from './db.ts';
import { Journal } from './journal/index.ts';
import { OutboxPump } from './journal/outbox.ts';
import { ProcessCustody } from './procs/posix.ts';
import { Registry } from './registry.ts';
import { bounded, loadPlugin } from './plugin.ts';
import { createPolicy } from './policy/index.ts';
import { createMcp } from './mcp/index.ts';
import { createTerminals } from './terminals/index.ts';
import { createClaudeDriver } from '../drivers/claude/index.ts';
import { createCodexDriver } from '../drivers/codex/index.ts';
import { createAgyDriver } from '../drivers/agy/index.ts';
import type { Driver, EnginePlugin, McpService, PolicyEngine, TerminalService } from './types.ts';

export const VERSION='0.1.0';
export const VERIFIED_VERSIONS={node:'24.22.0',claude:'2.1.309',codex:'0.164.0',claudeAgentSdk:'0.3.304'};
export const PLUGIN_SHUTDOWN_BUDGET_MS=10000;
export type BootOptions={stateDir:string;apiPort:number;mcpPort:number;plugin?:string;ptydRun?:string;consoleRoots?:string[];cleanupRoots?:string[];initTokens?:boolean;outboxTargets?:Record<string,string>;codexHome?:string;userChannel?:string;userTargets?:string[]};
/** Explicit dependency injection is for embedding/tests; the command-line daemon always uses the fixed seam factories. */
export type BootDependencies={plugin?:EnginePlugin;policy?:(db:Database,journal:Journal,plugin:EnginePlugin)=>PolicyEngine;
 drivers?:Driver[];terminals?:(db:Database,journal:Journal)=>TerminalService;mcp?:(core:Registry)=>McpService};
export async function startEngine(options:BootOptions,deps:BootDependencies={}) {
  assertDaemonEnv();mkdirSync(options.stateDir,{recursive:true,mode:0o700});
  const lock=await acquireLock(options.stateDir);let db:Database|undefined,journal:Journal|undefined,core:Registry|undefined,
    terminals:TerminalService|undefined,mcp:McpService|undefined,pump:OutboxPump|undefined,api:{port:number;close():Promise<void>}|undefined,maintenance:NodeJS.Timeout|undefined,plugin:EnginePlugin|undefined;
  let closed=false,bootEntered=false,closing:Promise<void>|undefined;const log=(_msg:string,_extra?:Record<string,unknown>)=>{};
  const shutdownPlugin=async()=>{
    if(!bootEntered)return;
    try {await bounded(()=>plugin?.onShutdown?.(),PLUGIN_SHUTDOWN_BUDGET_MS);}
    catch {process.stderr.write('artemisd: plugin shutdown failed or timed out\n');}
  };
  const close=():Promise<void>=>{
    if(closing)return closing;closed=true;if(maintenance)clearInterval(maintenance);
    return closing=(async()=>{
      let failure:unknown;
      for(const action of [()=>api?.close(),()=>mcp?.close(),()=>pump?.close(),()=>core?.close(),()=>terminals?.close(),shutdownPlugin,()=>journal?.close(),()=>db?.close(),()=>lock.close()]) {
        try{await action();}catch(e){failure??=e;}
      }
      if(failure)throw failure;
    })();
  };
  try {
    db=new Database(join(options.stateDir,'engine.db'));const procs=new ProcessCustody(db);await procs.sweep();
    plugin=deps.plugin??await loadPlugin(options.plugin);journal=new Journal(db,plugin);
    const policy=deps.policy?deps.policy(db,journal,plugin):createPolicy({db,plugin,journal,log,cleanupRoots:options.cleanupRoots});
    const drivers=deps.drivers??[createClaudeDriver(),createCodexDriver({codexHome:options.codexHome}),createAgyDriver()];
    const unavailable:string[]=[];
    for(const driver of drivers){try{if(driver.selfTest&&!(await driver.selfTest()).ok)unavailable.push(driver.provider);}catch{unavailable.push(driver.provider);}}
    terminals=deps.terminals?deps.terminals(db,journal):createTerminals({db,runDir:options.ptydRun??join(options.stateDir,'run'),journal,log,allowedRoots:options.consoleRoots});
    core=new Registry({db,journal,policy,plugin,drivers,terminals,procs,log,codexHome:options.codexHome,deferDispatch:true});
    for(const provider of unavailable)core.unavailable.add(provider);
    core.reconcile();mcp=deps.mcp?deps.mcp(core):createMcp({port:options.mcpPort,core,plugin,db,log});core.mcp=mcp;
    bootEntered=true;await plugin.onBoot({engineVersion:VERSION,host:hostname(),stateDir:options.stateDir,core,outbox:{put:row=>db!.tx(()=>journal!.put(row))},log});
    const {port:mcpPort}=await mcp.start();
    const {createApi}=await import('./api/index.ts');
    api=await createApi({core,db,journal,stateDir:options.stateDir,port:options.apiPort,mcpPort,initTokens:options.initTokens,tokenPrincipals:options.userChannel?[{name:'console'},{name:'cli'},{name:`user-channel:${options.userChannel}`,targets:options.userTargets??[]}]:undefined,version:VERSION,verifiedVersions:VERIFIED_VERSIONS});
    pump=new OutboxPump(db,options.outboxTargets,{pluginTargets:plugin.outboxTargets?.()});pump.start();procs.start();
    maintenance=setInterval(()=>{try{journal!.backup(options.stateDir);journal!.retain();void terminals!.sweep().catch(()=>{});}catch{/* command admission's storage guard remains active */}},3600000);maintenance.unref();
    void lock.lost.then(()=>{if(!closed)void close().catch(()=>{process.exitCode=1;});});
    core.startDispatch();
    return {core,db,journal,apiPort:api.port,mcpPort,lockPid:lock.pid,close};
  } catch(e) {try{await close();}catch{process.stderr.write('artemisd: startup cleanup failed\n');}throw e;}
}
export function parseOptions(args:string[]):BootOptions {
  const result:BootOptions={stateDir:'',apiPort:47160,mcpPort:47161};
  for(let n=0;n<args.length;n++) {
    const flag=args[n];if(flag==='--init-tokens'){result.initTokens=true;continue;}
    const value=args[++n];if(value===undefined)throw new Error('Missing option value');
    if(flag==='--state')result.stateDir=resolve(value);
    else if(flag==='--api-port')result.apiPort=value.trim()?Number(value):NaN;
    else if(flag==='--mcp-port')result.mcpPort=value.trim()?Number(value):NaN;
    else if(flag==='--plugin')result.plugin=value;
    else if(flag==='--ptyd-run')result.ptydRun=resolve(value);
    else if(flag==='--console-roots'){
      if(value.split(',').some(root=>!root.trim()))throw new Error('Console roots must be nonempty directories');
      result.consoleRoots=value.split(',').map(root=>resolve(root.trim()));
    }
    else if(flag==='--cleanup-roots'){
      if(value.split(',').some(root=>!root.trim()))throw new Error('Cleanup roots must be nonempty directories');
      result.cleanupRoots=value.split(',').map(root=>resolve(root.trim()));
    }
    else if(flag==='--user-channel')result.userChannel=value;
    else if(flag==='--user-target')(result.userTargets??=[]).push(value);
    else if(flag==='--codex-home')result.codexHome=resolve(value);
    else throw new Error('Unknown option');
  }
  if(!result.stateDir||![result.apiPort,result.mcpPort].every(p=>Number.isInteger(p)&&p>=0&&p<65536))throw new Error('State and valid listener ports are required');return result;
}
// Node realpaths the main module, so compare against the realpath: a symlinked launch path (a `current` release link) still boots.
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try {
    const engine=await startEngine(parseOptions(process.argv.slice(2)));
    process.stdout.write(JSON.stringify({ready:true,apiPort:engine.apiPort,mcpPort:engine.mcpPort})+'\n');
    let stopping=false;
    const stop=()=>{if(stopping)return;stopping=true;void engine.close().then(()=>{process.exitCode=0;},()=>{process.exitCode=1;});};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
    // Port 0 binds an ephemeral port; launchers (supervisors and tests) read the bound ports back from this line.
    process.stdout.write(`artemisd: listening api=${engine.apiPort} mcp=${engine.mcpPort}\n`);
  } catch(error) {process.stderr.write(`artemisd: startup failed: ${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;}
}
