// Background JSON tasks: a random client-generated capability deduplicates starts.
// Results are private to the capability holder, never listed or logged.
import {Readable} from 'node:stream';
import {mkdir,writeFile,rename,readFile,readdir,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const ttl=24*60*60*1000;
const valid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function backgroundJSON(scope,handler,{maxBody=14*1024*1024,maxActive=4,maxStored=128,maxBytes=256*1024*1024}={}){
 const dir=join(process.env.NEXORA_JOB_DIR||tmpdir(),'nexora-jobs-'+scope);
 const active=new Map(),completed=new Map();let lastCleanup=0,cleaning=false;
 const json=(res,status,data)=>reply(res,status,JSON.stringify(data));
 function reply(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);}
 const filename=id=>join(dir,id+'.json');
 async function cleanup(){
  const now=Date.now();for(const [id,item] of completed)if(now-item.at>ttl)completed.delete(id);
  if(cleaning||now-lastCleanup<60000)return;cleaning=true;lastCleanup=now;
  try{await mkdir(dir,{recursive:true,mode:0o700});const entries=[];
   for(const name of await readdir(dir)){if(!name.endsWith('.json')&&!name.endsWith('.tmp'))continue;try{const path=join(dir,name),s=await stat(path);if(now-s.mtimeMs>ttl){await unlink(path);continue;}if(name.endsWith('.json'))entries.push({path,size:s.size,time:s.mtimeMs});}catch{}}
   let bytes=0;entries.sort((a,b)=>b.time-a.time);for(let i=0;i<entries.length;i++){const e=entries[i];bytes+=e.size;if(i>=maxStored||bytes>maxBytes)await unlink(e.path).catch(()=>{});}
  }catch{}finally{cleaning=false;}
 }
 async function lookup(id){if(active.has(id))return {running:true};const item=completed.get(id);if(item&&Date.now()-item.at<=ttl)return item;
  try{const saved=JSON.parse(await readFile(filename(id),'utf8'));if(Date.now()-saved.at<=ttl&&typeof saved.body==='string'&&Number.isInteger(saved.status))return saved;}catch{}return null;
 }
 async function finish(id,status,body){
  const item={status,body,at:Date.now()};
  try{await mkdir(dir,{recursive:true,mode:0o700});await writeFile(filename(id)+'.tmp',JSON.stringify(item),{mode:0o600});await rename(filename(id)+'.tmp',filename(id));}catch{completed.set(id,item);let size=0;for(const [key,v] of [...completed].reverse()){size+=Buffer.byteLength(v.body);if(size>maxBytes||completed.size>maxStored)completed.delete(key);}}
  active.delete(id);void cleanup();
 }
 function sendState(res,id,item){return item.running?json(res,202,{ok:true,pending:true,jobId:id}):reply(res,item.status,item.body);}
 return async(req,res)=>{
  const start=req.headers['x-nexora-job'],poll=req.headers['x-nexora-job-poll'];
  if(!start&&!poll)return handler(req,res);
  if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{message:'Недопустимый источник запроса.'});
  const id=poll||start;if(!valid(id)||start&&poll)return json(res,400,{message:'Некорректное задание.'});
  void cleanup();
  const existing=await lookup(id);if(existing)return sendState(res,id,existing);
  if(poll)return json(res,404,{error:'job_missing',message:'Задание не найдено.'});
  if(active.size>=maxActive)return json(res,503,{error:'job_busy',message:'Очередь занята, запрос будет повторён.'});
  if(!String(req.headers['content-type']||'').toLowerCase().includes('application/json'))return json(res,415,{message:'Ожидается JSON.'});
  let bytes=0;const chunks=[];
  try{for await(const chunk of req){bytes+=chunk.length;if(bytes>maxBody)return json(res,413,{message:'Слишком большой запрос.'});chunks.push(chunk);}}
  catch{return json(res,400,{message:'Не удалось принять задание.'});}
  const again=await lookup(id);if(again)return sendState(res,id,again);
  if(active.has(id))return sendState(res,id,{running:true});
  if(active.size>=maxActive)return json(res,503,{error:'job_busy',message:'Очередь занята, запрос будет повторён.'});
  // All input is received before returning 202; no dependency on the client socket thereafter.
  active.set(id,true);
  const detached=Readable.from(chunks);detached.headers={...req.headers};detached.method=req.method;detached.url=req.url;detached.socket={remoteAddress:req.socket?.remoteAddress};
  let code=200,body='',sent=false;
  const capture={statusCode:200,headersSent:false,writeHead(n){code=n;this.statusCode=n;this.headersSent=true;return this;},setHeader(){return this;},end(data=''){if(!sent){body=Buffer.isBuffer(data)?data.toString('utf8'):String(data);sent=true;this.headersSent=true;}return this;}};
  void Promise.resolve().then(()=>handler(detached,capture)).then(()=>finish(id,sent?code:502,sent?body:JSON.stringify({message:'Сервис не вернул результат.'}))).catch(()=>finish(id,502,JSON.stringify({message:'Не удалось завершить задание.'})));
  return json(res,202,{ok:true,pending:true,jobId:id});
 };
}
