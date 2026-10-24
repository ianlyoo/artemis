import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { acquireLock } from '../core/locks.ts';
import { fixture } from '../core/journal/fixtures.ts';
import { createApi } from '../core/api/index.ts';
import { runCli, parseRequest } from './index.ts';
import { createAgyDriver } from '../drivers/agy/index.ts';

test('doctor verifies real writer lock, SQLite integrity, listener, selfTest and token file modes',async()=>{
  const f=fixture(),lock=await acquireLock(f.dir),api=await createApi({core:f.core,db:f.db,journal:f.journal,stateDir:f.dir,port:0,initTokens:true,version:'test',verifiedVersions:{}});
  const credential=randomBytes(32).toString('base64url');api.auth.register({name:'cli'},credential);
  try{
    const doctor=await runCli(['doctor','--state',f.dir],'',()=>credential);assert.equal(doctor.exitCode,0);
    assert.equal((doctor.output as {lockHeld:boolean}).lockHeld,true);assert.equal((doctor.output as {integrity:string}).integrity,'ok');
    assert.ok((doctor.output as {tokenModes:{ok:boolean}[]}).tokenModes.every(row=>row.ok));
    assert.throws(()=>parseRequest('{bad'));
    assert.throws(()=>parseRequest(JSON.stringify({method:'GET',path:'/v1/info',extra:'forbidden'})));
  }finally{await api.close();await lock.close();await f.close();}
});

test('doctor reports deliberately disabled agy without hiding a failing enabled driver',async()=>{
  const f=fixture(),lock=await acquireLock(f.dir);
  f.core.drivers.set('agy',createAgyDriver());
  const api=await createApi({core:f.core,db:f.db,journal:f.journal,stateDir:f.dir,port:0,version:'test',verifiedVersions:{}});
  const credential=randomBytes(32).toString('base64url');api.auth.register({name:'cli'},credential);
  try {
    let doctor=await runCli(['doctor','--state',f.dir],'',()=>credential);
    assert.equal(doctor.exitCode,0);
    const drivers=(doctor.output as {drivers:{provider:string;status:string;ok?:boolean}[]}).drivers;
    assert.equal(drivers.find(d=>d.provider==='agy')?.status,'disabled');
    assert.equal(drivers.find(d=>d.provider==='agy')?.ok,undefined);
    f.core.drivers.set('codex',{...createAgyDriver(),provider:'codex',disabled:undefined,selfTest:async()=>({ok:false,reason:'contract failed'})});
    doctor=await runCli(['doctor','--state',f.dir],'',()=>credential);
    assert.equal(doctor.exitCode,1);
    assert.equal((doctor.output as {drivers:{provider:string;status:string}[]}).drivers.find(d=>d.provider==='codex')?.status,'failed');
  } finally {await api.close();await lock.close();await f.close();}
});
