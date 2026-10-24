import { Database } from '../db.ts';
const [file,id]=process.argv.slice(2);
const db=new Database(file);
db.tx(()=>db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)').run('crash',id,null,'send',id,'completed',JSON.stringify({id}),'fixture'));
process.send?.({ack:id});
db.tx(()=>{
  db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)').run('uncommitted',id,null,'send',id,'dispatching','{}','fixture');
  const payload='x'.repeat(128*1024);
  for(let i=0;i<16;i++)db.setMeta(`crash:${id}:${i}`,payload);
  process.send?.({mid:id});
  for(let i=16;i<32;i++)db.setMeta(`crash:${id}:${i}`,payload);
});
process.send?.({committed:id});
setInterval(()=>{},1000);
