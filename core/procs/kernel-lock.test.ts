import test from 'node:test';
import { rmSync } from 'node:fs';
import { scratch } from '../journal/fixtures.ts';
import { checkLockDeath } from './darwin-selftest.mjs';

for(const kind of ['writer','ptyd'] as const)test(`${kind} kernel lock excludes a second user and releases after holder SIGKILL`,{timeout:20000},async()=>{
  const root=scratch('kernel-lock-');
  try {await checkLockDeath(root,kind);} finally {rmSync(root,{recursive:true,force:true});}
});
