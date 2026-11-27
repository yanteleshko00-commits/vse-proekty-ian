import {backgroundJSON} from './background-jobs.js';
import {handleAnalytics,injectAnalytics} from './visitor-analytics.js';
import {serveBrand} from './brand.js';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeTextRequest} from '../nexora/text-engine.js';
import {decodeAttachments} from './attachments.js';

const here=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.PORT||10000);
const lobby=(process.env.NEXORA_LOBBY_URL||'http://run-nexora-lobby').replace(/\/+$/,'');
const key=(process.env.TEXT_BRIDGE_TOKEN||'').trim();
const usage=new Map();
let active=0;
function respond(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(JSON.stringify(data));
}
function allow(req){
  const ip=String((process.env.RENDER === 'true' || process.env.TRUST_PROXY === 'true') ? (String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim() || req.socket.remoteAddress || 'unknown') : (req.socket.remoteAddress || 'unknown')).slice(0,90);
  const now=Date.now();
  const times=(usage.get(ip)||[]).filter(t=>now-t<3600000);
  if(times.length>=24||times.filter(t=>now-t<60000).length>=4)return false;
  times.push(now);
  usage.set(ip,times);
  if(usage.size>3000)for(const [k,v] of usage)if(v.every(t=>now-t>3600000))usage.delete(k);
  return true;
}
async function getJSON(req){
  if(!String(req.headers['content-type']||'').includes('application/json'))throw Error('Ожидался JSON.');
  let total=0;const items=[];
  for await(const chunk of req){
    total+=chunk.length;
    if(total>10500000)throw Error('Слишком большой запрос (до 7 МБ вложений).');
    items.push(chunk);
  }
  return JSON.parse(Buffer.concat(items).toString('utf8')||'{}');
}
const backgroundText=backgroundJSON('text',generateText,{maxActive:4,maxBody:10500000});
const server=http.createServer(async(req,res)=>{
  let url;
  try{url=new URL(req.url||'/','http://localhost');}
  catch{return respond(res,400,{message:'Некорректный адрес.'});}
  if(['/api/visitors/ping','/nexora-visitors.js','/internal/visitors/ingest'].includes(url.pathname)&&await handleAnalytics(req,res,url.pathname,{site:'nexora-text-studio'}))return;
  if(serveBrand(req,res,url.pathname,"NEXORA Text Studio"))return;
  if(req.method==='GET'&&url.pathname==='/health')return respond(res,200,{ok:true,service:'nexora-text-studio',bridgeConfigured:key.length>=32});
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
    try{
      const html=Buffer.from(injectAnalytics(await readFile(join(here,'index.html'))));
      res.writeHead(200,{
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=90',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
        'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-src https://nexora-lobby-yan12312.msk1.amvera.tech; frame-ancestors 'none'; form-action 'self'"
      });
      return res.end(html);
    }catch(error){console.error('Text Studio page unavailable:',error.message);return respond(res,500,{message:'Страница временно недоступна.'});}
  }
  if(req.method!=='POST'||url.pathname!=='/api/generate')return respond(res,404,{message:'Не найдено.'});
  return backgroundText(req,res);
});
async function generateText(req,res){
  if(key.length<32)return respond(res,503,{message:'Текстовый ИИ пока не подключён.'});
  if(!allow(req))return respond(res,429,{message:'Слишком много запросов. Попробуйте позднее.'});
  if(active>=4)return respond(res,503,{message:'Сервис занят. Попробуйте позже.'});
  active++;
  try{
  let params;
  try{
    const input=await getJSON(req);
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ожидается объект с заданием.');
    if(typeof input.source==='string' && input.source.length>16000)throw Error('Исходный текст слишком длинный (до 16 000 символов).');
    const files=await decodeAttachments(input.attachments);
    const source=[typeof input.source==='string'?input.source.trim():'',files.documentText].filter(Boolean).join('\n\n');
    if(source.length>16000)throw Error('Слишком много текста во вложениях. Попробуйте приложить меньше страниц.');
    params=normalizeTextRequest({...input,source,images:files.images});
  }
  catch(error){return respond(res,error.statusCode||400,{message:error.message||'Некорректное задание.'});}
  try{
    const upstream=await fetch(lobby+'/api/text/internal/generate',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-nexora-text-key':key},
      body:JSON.stringify(params),
      signal:AbortSignal.timeout(params.images.length?210000:119000)
    });
    const answer=await upstream.json().catch(()=>null);
    if(!answer||typeof answer!=='object'||Array.isArray(answer))return respond(res,502,{message:'ИИ вернул некорректный ответ. Попробуйте ещё раз.'});
    return respond(res,upstream.status,answer);
  }catch(error){
    console.error('Text Studio gateway failed:',error.message);
    return respond(res,502,{message:'Нет связи с ИИ. Попробуйте повторить запрос.'});
  }
  }finally{active--;}
}
server.requestTimeout=228000;
server.listen(port,'0.0.0.0',()=>{
  console.log('NEXORA Text Studio listening on port '+port);
  console.log('Text bridge configured:',key.length>=32);
  if(process.env.TEXT_PHOTO_SMOKE_TEST==='1'){
    setTimeout(async()=>{
      try{
        const {mathTestImage}=await import('../nexora-math-studio/test-image.mjs');
        const png=mathTestImage();
        const response=await fetch('http://127.0.0.1:'+port+'/api/generate',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            action:'create',format:'description',tone:'neutral',size:'short',language:'ru',
            topic:'Опиши, что показано на прикреплённой фотографии с математической записью.',
            attachments:[{name:'sample.png',data:'data:image/png;base64,'+png.toString('base64')}]
          }),
          signal:AbortSignal.timeout(215000)
        });
        const data=await response.json().catch(()=>({}));
        const text=String(data.text||'');
        console.info('TEXT_PHOTO_SMOKE_RESULT',JSON.stringify({
          passed:!!(response.ok&&data.ok&&text.length>=35),
          status:response.status,provider:data.ok?data.provider:undefined,
          characters:data.ok?text.length:undefined,
          reason:data.ok?undefined:String(data.message||data.error||'no_text').slice(0,140)
        }));
      }catch(error){console.error('TEXT_PHOTO_SMOKE_RESULT',JSON.stringify({passed:false,reason:error.message}));}
    },2500);
  }
  if(process.env.TEXT_SMOKE_TEST==='1'){
    setTimeout(async()=>{
      try{
        const r=await fetch('http://127.0.0.1:'+port+'/api/generate',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'create',topic:'Напиши короткий дружелюбный пост о пользе чтения книг.',format:'post',tone:'friendly',size:'short',language:'ru'}),
          signal:AbortSignal.timeout(120000)
        });
        const j=await r.json().catch(()=>({}));
        const good=!!(r.ok&&j.ok&&typeof j.text==='string'&&j.text.length>=50);
        console.info('TEXT_SMOKE_RESULT',JSON.stringify({passed:good,status:r.status,provider:good?j.provider:undefined,characters:good?j.text.length:undefined,reason:good?undefined:String(j.error||j.message||'empty_text').slice(0,120)}));
      }catch(error){console.error('TEXT_SMOKE_RESULT',JSON.stringify({passed:false,reason:error.message}));}
    },2000);
  }
});
