import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants, chmodSync, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { EngineError } from '../types.ts';
import type { Principal } from '../types.ts';
import type { Database } from '../db.ts';
export type Authenticated={principal:Principal;scopes:string[];targets:string[]};
export type PrincipalSpec={name:'console'|'cli'|`user-channel:${string}`;targets?:string[]};
export function tokenFilename(name:string):string {
  if(!/^(console|cli|user-channel:[a-z][a-z0-9-]{0,31})$/.test(name))throw new EngineError('INVALID',400,'Invalid principal name','principal');
  return name.replace(':','-');
}
export class Auth {
  readonly db:Database;readonly directory:string;
  constructor(db:Database,stateDir:string){this.db=db;this.directory=join(stateDir,'tokens');}
  init(specs:PrincipalSpec[]=[{name:'console'},{name:'cli'}]):void {
    mkdirSync(this.directory,{recursive:true,mode:0o700});chmodSync(this.directory,0o700);
    for(const spec of specs) {
      const file=join(this.directory,tokenFilename(spec.name));
      if(existsSync(file)){const s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600)throw new Error('Unsafe principal token file mode');continue;}
      this.db.assertWritable();
      const token=randomBytes(32).toString('base64url');
      const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{writeSync(fd,token+'\n');fsyncSync(fd);if((fstatSync(fd).mode&0o777)!==0o600)throw new Error('Unsafe token mode');}finally{closeSync(fd);}
      try{this.register(spec,token);}catch(e){unlinkSync(file);throw e;}
    }
  }
  /** Used by provisioning and tests. The plaintext is never returned, journaled, or logged. */
  register(spec:PrincipalSpec,token:string):void {
    tokenFilename(spec.name);
    const kind=spec.name.startsWith('user-channel:')?'user-channel':spec.name;
    const scopes=kind==='console'?['*']:kind==='cli'?['core.read','core.write']:['user.say','user.read'];
    this.db.tx(()=>this.db.prepare('INSERT INTO principals VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(name) DO UPDATE SET token_sha256=excluded.token_sha256,scopes=excluded.scopes,targets=excluded.targets,revoked_at=NULL').run(
      spec.name,kind,createHash('sha256').update(token).digest('hex'),JSON.stringify(scopes),JSON.stringify(spec.targets??[]),new Date().toISOString()));
  }
  authenticate(header:string|undefined):Authenticated {
    if(!header?.startsWith('Bearer ')||header.length>1024)throw new EngineError('UNAUTHORIZED',401,'Bearer authentication required','authentication');
    const hash=createHash('sha256').update(header.slice(7)).digest();
    for(const row of this.db.prepare('SELECT * FROM principals WHERE revoked_at IS NULL').all()) {
      const stored=Buffer.from(String(row.token_sha256),'hex');if(stored.length!==hash.length||!timingSafeEqual(stored,hash))continue;
      const targets=JSON.parse(String(row.targets)) as string[],kind=String(row.kind);
      const principal:Principal=kind==='console'?{kind:'console',name:'console'}:kind==='cli'?{kind:'cli',name:'cli'}:
        kind==='user-channel'?{kind:'user-channel',name:String(row.name) as `user-channel:${string}`,targets}:
        (()=>{throw new EngineError('FORBIDDEN',403,'Agent slots do not authenticate on the API','principal');})();
      return {principal,targets,scopes:JSON.parse(String(row.scopes))};
    }
    throw new EngineError('UNAUTHORIZED',401,'Invalid bearer credential','authentication');
  }
  modes():{name:string;mode:number;ok:boolean}[] {
    if(!existsSync(this.directory))return [];
    return readdirSync(this.directory).map(name=>{const s=lstatSync(join(this.directory,name));const mode=s.mode&0o777;return {name,mode,ok:s.isFile()&&!s.isSymbolicLink()&&mode===0o600};});
  }
}
export function scope(auth:Authenticated,name:string):void {
  if(!auth.scopes.includes('*')&&!auth.scopes.includes(name))throw new EngineError('SCOPE',403,'Principal lacks route scope','scope');
}
