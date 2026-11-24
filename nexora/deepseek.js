import crypto from 'node:crypto';
import {recordDeepSeek,verifyDeepSeek} from './deepseek-quality.js';
export function deepSeekProvider(env=process.env,modelOverride=''){
 const key=String(env.DEEPSEEK_API_KEY||'').trim();
 if(!key)return null;
 return {name:'DeepSeek',url:'https://api.deepseek.com/chat/completions',key,model:String(modelOverride||env.DEEPSEEK_MODEL||'deepseek-flash').trim()};
}
export async function deepSeekText({provider,messages,maxTokens=3000,jsonMode=false,timeout=45000,fetchImpl=fetch,service='chat',env=process.env}){
 const response=await fetchImpl(provider.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+provider.key},
 body:JSON.stringify({model:provider.model,messages,max_tokens:maxTokens,thinking:{type:'disabled'},...(jsonMode?{response_format:{type:'json_object'}}:{})}),signal:AbortSignal.timeout(timeout)});
 const data=await response.json().catch(()=>({}));
 recordDeepSeek(service,data,response.status);
 if(!response.ok)throw Object.assign(new Error('DeepSeek HTTP '+response.status),{status:response.status});
 const answer=data.choices?.[0]?.message?.content;
 await verifyDeepSeek(service,JSON.stringify(messages),answer,{env,fetchImpl,finish:data.choices?.[0]?.finish_reason});
 return answer;
}
let active=0,windowTimes=[];
export async function deepSeekRelay(req,res,{env=process.env,fetchImpl=fetch}={}){
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const expected=Buffer.from(String(env.NEXORA_CHAT_INTERNAL_TOKEN||'')),supplied=Buffer.from(String(req.headers['x-nexora-chat-token']||''));
 if(expected.length<32||expected.length!==supplied.length||!crypto.timingSafeEqual(expected,supplied))return send(403,{error:'forbidden'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'invalid_request'});
 const provider=deepSeekProvider(env);
 if(!provider)return send(503,{error:'not_configured'});
 let input;
 try{const parts=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>180000)return send(413,{error:'too_large'});parts.push(chunk);}input=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return send(400,{error:'invalid_request'});}
 if(typeof input?.instructions!=='string'||input.instructions.length>30000||typeof input.input!=='string'||input.input.length>100000)return send(400,{error:'invalid_request'});
 const now=Date.now();windowTimes=windowTimes.filter(t=>now-t<60000);
 if(active>=3||windowTimes.length>=20)return send(429,{error:'rate_limited'});
 windowTimes.push(now);active++;
 try{
  const output=await deepSeekText({provider,messages:[{role:'system',content:input.instructions+(input.jsonMode?'\nReturn a JSON object.':'')},{role:'user',content:input.input}],maxTokens:10000,jsonMode:input.jsonMode===true,timeout:45000,fetchImpl,service:'projects',env});
  console.info('[deepseek-relay] Generated text');return send(200,{output,provider:'DeepSeek'});
 }catch(error){console.warn('[deepseek-relay] failed:',error.status||error.name);return send(error.status>=400&&error.status<=599?error.status:502,{error:'deepseek_unavailable'});}
 finally{active--;}
}
