import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { fixture } from '../journal/fixtures.ts';
import { createApi } from './index.ts';
import { callLocal } from './transport.ts';

test('maintenance routes admit CLI and Console while refusing agent and user-channel principals',async()=>{
  const f=fixture();
  const api=await createApi({core:f.core,db:f.db,journal:f.journal,stateDir:f.dir,port:0,version:'test',verifiedVersions:{}});
  try {
    for (const name of ['cli','console','user-channel:test'] as const) {
      const value=randomBytes(32).toString('hex');api.auth.register({name},value);
      for(const action of ['drain','hold','release']) {
        const result=await callLocal({port:api.port,token:value,method:'POST',path:`/v1/admin/${action}`,body:{deadlineS:0}});
        assert.equal(result.status,name.startsWith('user-channel:')?403:200);
      }
    }
    const value=randomBytes(32).toString('hex');
    f.db.prepare('INSERT INTO principals VALUES(?,?,?,?,?,?,NULL)').run('agent:test','agent',createHash('sha256').update(value).digest('hex'),'["core.write"]','[]',new Date().toISOString());
    for(const action of ['drain','hold','release']) assert.equal((await callLocal({port:api.port,token:value,method:'POST',path:`/v1/admin/${action}`,body:{deadlineS:0}})).status,403);
  } finally {await api.close();await f.close();}
});
