import crypto from 'node:crypto';
import {normalizeTextRequest,buildTextPrompt,buildTextUserMessage,readTextResponse,summarizeTextStats} from './text-engine.js';

const key=(process.env.TEXT_BRIDGE_TOKEN||'').trim();
let active=0;
const requests=[];
function respond(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
function authorized(req){
  const a=Buffer.from(key),value=req.headers['x-nexora-text-key'];
  const b=Buffer.from(typeof value==='string'?value:'');
  return a.length>=32&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function getJSON(req){
  if(!String(req.headers['content-type']||'').includes('application/json'))throw Error('JSON expected');
  let length=0;
  const parts=[];
  for await(const chunk of req){
    length+=chunk.length;
    if(length>35000)throw Error('Слишком большой запрос.');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');
}
function providers(){
  const result=[],openrouter=process.env.OPENROUTER_API_KEY?.trim(),groq=process.env.GROQ_API_KEY?.trim();
  if(openrouter){
    const url='https://openrouter.ai/api/v1/chat/completions';
    const model=process.env.TEXT_OPENROUTER_MODEL||process.env.ARGOSHA_OPENROUTER_MODEL||'openrouter/free';
    result.push({name:'OpenRouter',url,model,key:openrouter});
    const backup=process.env.TEXT_OPENROUTER_FALLBACK_MODEL||'google/gemma-4-26b-a4b-it:free';
    if(model!==backup)result.push({name:'OpenRouter Backup',url,model:backup,key:openrouter});
  }
  if(groq)result.push({name:'Groq',url:'https://api.groq.com/openai/v1/chat/completions',model:process.env.TEXT_GROQ_MODEL||process.env.ARGOSHA_GROQ_MODEL||'openai/gpt-oss-20b',key:groq});
  return result;
}
export async function textBridge(req,res){
  if(!authorized(req))return respond(res,403,{error:'forbidden',message:'Доступ запрещён.'});
  const now=Date.now();
  while(requests.length&&now-requests[0]>60000)requests.shift();
  if(requests.length>=40)return respond(res,429,{error:'rate_limit',message:'Слишком много запросов. Попробуйте позже.'});
  requests.push(now);
  if(active>=6)return respond(res,503,{error:'busy',message:'Сервис занят. Попробуйте позже.'});
  let params;
  try{params=normalizeTextRequest(await getJSON(req));}
  catch(e){return respond(res,400,{error:'invalid_input',message:e.message||'Проверьте параметры.'});}
  const available=providers();
  if(!available.length)return respond(res,503,{error:'not_configured',message:'Нейросети пока не настроены.'});
  active++;
  try{
    let lastFailure='unknown';
    for(const p of available){
      try{
        const reply=await fetch(p.url,{
          method:'POST',
          headers:{'Authorization':'Bearer '+p.key,'Content-Type':'application/json','HTTP-Referer':process.env.APP_URL||'https://nexora-lobby.onrender.com','X-Title':'NEXORA Text Studio'},
          body:JSON.stringify({
            model:p.model,temperature:params.action==='proofread'?0.15:0.65,
            max_tokens:params.size==='long'?3200:params.size==='short'?1100:2200,
            ...(p.name.startsWith('OpenRouter')?{reasoning:{effort:'minimal'}}:{}),
            messages:[
              {role:'system',content:buildTextPrompt(params)},
              {role:'user',content:buildTextUserMessage(params)}
            ]
          }),
          signal:AbortSignal.timeout(36000)
        });
        const answer=await reply.json().catch(()=>({}));
        if(!reply.ok){
          lastFailure='HTTP '+reply.status;
          console.warn('Text provider returned status:',p.name,reply.status);
          continue;
        }
        const text=readTextResponse(answer);
        return respond(res,200,{ok:true,text,provider:p.name,stats:summarizeTextStats(text)});
      }catch(error){
        lastFailure=error.message;
        console.warn('Text provider failed:',p.name,error.message);
      }
    }
    console.error('Text Studio all providers failed:',lastFailure);
    return respond(res,502,{error:'providers_unavailable',message:'ИИ пока не смог написать текст. Попробуйте ещё раз или выберите меньший объём.'});
  }finally{
    active--;
  }
}
export function textBridgeHealth(req,res){
  if(!authorized(req))return respond(res,403,{error:'forbidden'});
  return respond(res,200,{ok:true,providers:providers().map(p=>p.name)});
}
