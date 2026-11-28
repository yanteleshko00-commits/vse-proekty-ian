// Bounded per-instance HTTP admission, no collection of request bodies or credentials.
import {clientIP,boundedInt} from './runtime-config.js';
export function createHttpGuard({env=process.env,clock=Date.now,maxActive=boundedInt(env.NEXORA_HTTP_CONCURRENCY,48,8,256),maxWrites=boundedInt(env.NEXORA_HTTP_WRITE_CONCURRENCY,8,2,32),maxKeys=4000}={}){
 const rates=new Map();let active=0,writes=0,lastSweep=-Infinity;
 const counts={accepted:0,blocked:0,rateLimited:0,overloaded:0,invalid:0,errors:0};
 function reject(res,status,error){counts.blocked++;if(status===429)counts.rateLimited++;else if(status===503)counts.overloaded++;else counts.invalid++;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(status===429||status===503?{'Retry-After':'10'}:{}),'Connection':'close'});res.end(JSON.stringify({error,message:status===503?'Сервис занят. Повторите позже.':status===429?'Слишком много запросов. Повторите позже.':'Запрос отклонён.'}));return false;}
 function admit(req,res){
  const method=req.method||'GET',path=String(req.url||'/').split('?')[0],write=!['GET','HEAD','OPTIONS'].includes(method),poll=Boolean(req.headers['x-nexora-job-poll']);
  if(!['GET','HEAD','OPTIONS','POST','PATCH','PUT','DELETE'].includes(method)||String(req.url||'').length>4096)return reject(res,400,'invalid_request');
  if(write&&req.headers['sec-fetch-site']==='cross-site')return reject(res,403,'cross_site_request');
  if(write&&Number(req.headers['content-length']||0)>32*1024*1024)return reject(res,413,'request_too_large');
  if(path==='/health'||path==='/api/health')return true;
  const now=clock();if(now-lastSweep>=60000||rates.size>=maxKeys){for(const [k,v] of rates)if(v.until<=now)rates.delete(k);lastSweep=now;}
  const id=clientIP(req,env)+(write&&!poll?':write':':read');let entry=rates.get(id);
  if(!entry){if(rates.size>=maxKeys)return reject(res,429,'rate_capacity');entry={count:0,until:now+60000};rates.set(id,entry);}
  if(++entry.count>(write&&!poll?60:300))return reject(res,429,'rate_limited');
  const expensive=write&&!poll;
  if(active>=maxActive||expensive&&writes>=maxWrites)return reject(res,503,'server_busy');
  active++;if(expensive)writes++;counts.accepted++;
  let done=false;function finish(){if(done)return;done=true;active--;if(expensive)writes--;if(res.statusCode>=500)counts.errors++;}
  res.once('finish',finish);res.once('close',finish);return true;
 }
 return {admit,snapshot:()=>({...counts,active,writes,maxActive,maxWrites,scope:'current_process'}),wrap:handler=>async(req,res)=>{if(!admit(req,res))return;try{await handler(req,res);}catch(e){counts.errors++;console.error('Request handler failed:',e.name);if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'internal_error',message:'Внутренняя ошибка сервера.'}));}else res.destroy();}}};
}
