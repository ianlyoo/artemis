#!/usr/bin/env node
import { runCli } from './index.ts';
let input='';
try {
  if(['call','cleanup-children'].includes(process.argv[2]))for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>2*1024*1024)throw new Error('Request too large');}
  const result=await runCli(process.argv.slice(2),input);process.stdout.write(JSON.stringify(result.output)+'\n');process.exitCode=result.exitCode;
}catch{process.stdout.write(JSON.stringify({code:'CLI_ERROR',rule:'cli',reason:'Local engine request failed'})+'\n');process.exitCode=1;}
