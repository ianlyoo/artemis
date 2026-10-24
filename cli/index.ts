import { constants, closeSync, existsSync, fstatSync, openSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { callLocal } from '../core/api/transport.ts';
import { acquireLock } from '../core/locks.ts';
import { Auth } from '../core/api/auth.ts';
import type { Database } from '../core/db.ts';

export function readCliToken(stateDir:string):string {
  const fd=openSync(join(stateDir,'tokens','cli'),constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const s=fstatSync(fd);if(!s.isFile()||(s.mode&0o777)!==0o600||s.size>1024)throw new Error('Unsafe CLI token file');
    return readFileSync(fd,'utf8').trim();
  }finally{closeSync(fd);}
}
export type CliRequest={method:string;path:string;body?:unknown};
export function parseRequest(input:string):CliRequest {
  if(Buffer.byteLength(input)>2*1024*1024)throw new Error('Request too large');
  const value=JSON.parse(input) as CliRequest;
  if(!value||typeof value.method!=='string'||typeof value.path!=='string'||Object.keys(value).some(k=>!['method','path','body'].includes(k)))throw new Error('Expected one JSON request');
  return value;
}
export async function runCli(args:string[],input:string,credential?:()=>string):Promise<{exitCode:number;output:unknown}> {
  const command=args.shift()??'doctor';let stateDir=join(homedir(),'.artemis'),port:number|undefined;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--state'&&args[i+1])stateDir=resolve(args[++i]);
    else if(args[i]==='--api-port'&&args[i+1])port=Number(args[++i]);
    else if(args[i]==='--full')continue;
    else throw new Error('Unknown CLI option');
  }
  const transport=async(req:CliRequest)=>callLocal({...req,token:(credential??(()=>readCliToken(stateDir)))(),socketPath:port?undefined:join(stateDir,'run','api.sock'),port});
  if(command==='call') {const result=await transport(parseRequest(input));return {exitCode:result.status>=400?1:0,output:result.body};}
  if(command==='cleanup-children') {const body=JSON.parse(input);const result=await transport({method:'POST',path:'/v1/agents/cleanup-children',body});return {exitCode:result.status>=400?1:0,output:result.body};}
  if(command!=='doctor')throw new Error('Usage: artemis call|doctor|cleanup-children [--state dir] [--api-port port]');
  let lockHeld=false,integrity='missing',online=false,ports:Record<string,boolean>={},drivers:unknown=[],tokenModes:unknown=[];
  try{const lock=await acquireLock(stateDir);await lock.close();}catch(e){if((e as {code?:string}).code==='WRITER_LOCKED')lockHeld=true;else throw e;}
  const file=join(stateDir,'engine.db');
  if(existsSync(file)) {const db=new DatabaseSync(file,{readOnly:true});try{integrity=String(db.prepare('PRAGMA integrity_check').get()?.integrity_check);}finally{db.close();}}
  tokenModes=new Auth({} as Database,stateDir).modes();
  try{const response=await transport({method:'GET',path:'/v1/doctor'});online=response.status===200;if(online){drivers=(response.body as {drivers:unknown}).drivers;ports=(response.body as {ports:Record<string,boolean>}).ports??{api:true};}}catch{/* Offline is a doctor result, never credential output. */}
  const ok=lockHeld&&integrity==='ok'&&online&&Object.values(ports).every(Boolean)&&(tokenModes as {ok:boolean}[]).every(t=>t.ok)&&(drivers as {ok?:boolean;status?:string}[]).every(d=>d.status==='disabled'||d.ok===true);
  return {exitCode:ok?0:1,output:{ok,lockHeld,integrity,ports:{...ports,api:online},drivers,tokenModes}};
}
