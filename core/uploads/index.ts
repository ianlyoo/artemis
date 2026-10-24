import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EngineError } from '../types.ts';
import type { Database } from '../db.ts';
export const UPLOAD_LIMITS={fileBytes:25*1024*1024,files:5,inFlight:4} as const;
export type UploadInput={data:Uint8Array;mime:string};
export class Uploads {
  readonly db:Database;readonly dir:string;private active=0;
  constructor(db:Database,stateDir:string){this.db=db;this.dir=join(stateDir,'uploads');mkdirSync(this.dir,{recursive:true,mode:0o700});}
  async accepting<T>(fn:()=>Promise<T>):Promise<T> {
    if(this.active>=UPLOAD_LIMITS.inFlight)throw new EngineError('LIMIT',429,'At most four uploads in flight','uploads');
    this.active++;try{return await fn();}finally{this.active--;}
  }
  store(files:UploadInput[],agentId?:string):{id:string;mime:string;bytes:number}[] {
    if(files.length<1||files.length>5||files.some(f=>f.data.byteLength>UPLOAD_LIMITS.fileBytes))throw new EngineError('LIMIT',413,'Uploads exceed size or file count limit','uploads');
    this.db.assertWritable();
    if(agentId&&!this.db.prepare('SELECT id FROM agents WHERE id=?').get(agentId))throw new EngineError('NOT_FOUND',404,'Agent not found','uploads');
    const paths:string[]=[];
    try {
      return this.db.tx(()=>files.map(file=>{
        const id=randomUUID(),path=join(this.dir,id);writeFileSync(path,file.data,{mode:0o600,flag:'wx'});paths.push(path);
        this.db.prepare('INSERT INTO uploads VALUES(?,?,?,?,?,?)').run(id,agentId??null,path,file.mime,file.data.byteLength,createHash('sha256').update(file.data).digest('hex'));
        this.db.setMeta(`uploadAt:${id}`,Date.now());return {id,mime:file.mime,bytes:file.data.byteLength};
      }));
    } catch(e) {for(const path of paths)unlinkSync(path);throw e;}
  }
  retain(now=Date.now()):void {
    for(const row of this.db.prepare('SELECT id,path FROM uploads').all()) {
      const at=this.db.meta<number>(`uploadAt:${row.id}`);if(at===undefined||at>=now-30*86400000)continue;
      // DB paths are always created by this class, but verify the opaque path before deleting.
      if(String(row.path)!==join(this.dir,String(row.id)))continue;
      try{unlinkSync(String(row.path));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      this.db.tx(()=>{this.db.prepare('DELETE FROM uploads WHERE id=?').run(row.id);this.db.prepare('DELETE FROM meta WHERE key=?').run(`uploadAt:${row.id}`);});
    }
  }
}
