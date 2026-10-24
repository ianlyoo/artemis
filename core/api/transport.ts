import { request } from 'node:http';
/** Local transport seam shared by `engine call` and doctor. SSH remains outside this process. */
export async function callLocal(options:{socketPath?:string;port?:number;token:string;method:string;path:string;body?:unknown;timeoutMs?:number}):Promise<{status:number;body:unknown}> {
  if(!options.path.startsWith('/v1/')||/[\r\n]/.test(options.path)||!['GET','POST','PATCH','DELETE'].includes(options.method))throw new Error('Invalid API request');
  const body=options.body===undefined?undefined:JSON.stringify(options.body);
  return new Promise((resolve,reject)=>{
    const req=request({agent:false,host:'127.0.0.1',port:options.port,socketPath:options.socketPath,path:options.path,method:options.method,
      headers:{Authorization:`Bearer ${options.token}`,'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(body)}:{})}},res=>{
      const chunks:Buffer[]=[];let bytes=0;res.on('data',b=>{bytes+=b.length;if(bytes>32*1024*1024){req.destroy(new Error('Response too large'));return;}chunks.push(b);});
      res.on('end',()=>{try{resolve({status:res.statusCode??500,body:JSON.parse(Buffer.concat(chunks).toString()||'{}')});}catch{reject(new Error('Invalid API response'));}});res.on('error',reject);
    });
    req.setTimeout(options.timeoutMs??650000,()=>req.destroy(new Error('API timeout')));req.on('error',reject);req.end(body);
  });
}
