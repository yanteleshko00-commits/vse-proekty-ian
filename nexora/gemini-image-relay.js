// Gemini native image API. The key never leaves the server.
export const DEFAULT_IMAGE_MODEL='gemini-3.1-flash-lite-image';
const ratios={square:'1:1',portrait:'3:4',landscape:'4:3',vertical:'9:16',wide:'16:9'};
function failure(status,code,message){
 return Object.assign(new Error(message),{providerName:'Gemini',upstreamStatus:status,providerCode:code,publicMessage:message,diagnosticStage:'image_generation'});
}
export async function requestGeminiImage({apiKey,model=DEFAULT_IMAGE_MODEL,modelPrompt,ratio,imageFile,signal,fetchImpl=fetch,imageMime}){
 const parts=[{text:(imageFile?'Edit the supplied image according to the instruction, retaining details not requested to change. ':'Create one original image. ')+modelPrompt}];
 if(imageFile)parts.push({inlineData:{mimeType:imageFile.mime,data:imageFile.bytes.toString('base64')}});
 let response,payload;
 try{
  response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
   method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
   body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:ratios[ratio]||'1:1',imageSize:'1K'}}}),
   signal:AbortSignal.any([signal,AbortSignal.timeout(55000)])
  });
  payload=await response.json();
 }catch(error){throw failure(0,error.name==='TimeoutError'?'timeout':'network_error','Gemini не ответил вовремя или временно недоступен.');}
 if(!response.ok){
  const status=response.status;
  const code=String(payload?.error?.status||'gemini_http_error').replace(/[^a-z0-9_-]/gi,'').slice(0,60);
  throw failure(status,code,status===429?'Лимит Gemini исчерпан.':status===401||status===403?'Gemini отклонил доступ к API.':'Gemini не смог создать изображение (HTTP '+status+').');
 }
 const candidates=Array.isArray(payload?.candidates)?payload.candidates:[];
 for(const candidate of candidates){
  for(const part of candidate?.content?.parts||[]){
   if(part.thought)continue;
   const inline=part.inlineData||part.inline_data;
   if(typeof inline?.data!=='string'||!inline.data||inline.data.length>24000000)continue;
   const bytes=Buffer.from(inline.data,'base64'),mime=imageMime(bytes);
   if(mime&&bytes.length<=18000000)return {image:'data:'+mime+';base64,'+bytes.toString('base64'),provider:'Gemini',model};
  }
 }
 const reason=String(payload?.promptFeedback?.blockReason||candidates[0]?.finishReason||'image_missing').replace(/[^a-z0-9_-]/gi,'').slice(0,60);
 const error=failure(502,reason,'Gemini не вернул готовое изображение.');
 // Do not route explicitly blocked requests around provider safety checks.
 if(/SAFETY|PROHIBITED|BLOCKLIST|SPII/i.test(reason))error.noFallback=true;
 throw error;
}
// Sequential failover avoids paying multiple providers for the same request.
export async function firstImageProvider(providers){
 const errors=[];
 for(const provider of providers){
  const controller=new AbortController();
  try{return await provider.run(controller.signal);}
  catch(error){
   if(!error.providerName){error.providerName=provider.name;error.publicMessage=provider.name+' временно недоступен.';}
   errors.push(error);
   if(error.noFallback)break;
  }finally{controller.abort();}
 }
 throw new AggregateError(errors,'No image provider completed the request');
}

import crypto from 'node:crypto';
const jsonHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function relaySend(res,status,data){res.writeHead(status,jsonHeaders);res.end(JSON.stringify(data));}
export function relayAuthorized(presented,expected){
 const a=Buffer.from(String(presented||'')),b=Buffer.from(String(expected||''));
 return b.length>=32&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function relayImageMime(bytes){
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return '';
}
let activeRelays=0,relayWindow=[];
export async function handleGeminiImageRelay(req,res,{fetchImpl=fetch,env=process.env}={}){
 if(!relayAuthorized(req.headers['x-nexora-image-token'],env.NEXORA_IMAGE_RELAY_TOKEN))return relaySend(res,403,{error:'forbidden'});
 const apiKey=String(env.GEMINI_API_KEY||'').trim();
 if(!apiKey)return relaySend(res,503,{error:'not_configured'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return relaySend(res,415,{error:'invalid_request'});
 let body;
 try{
  let total=0;const chunks=[];
  for await(const chunk of req){total+=chunk.length;if(total>13000000)return relaySend(res,413,{error:'payload_too_large'});chunks.push(chunk);}
  body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }catch{return relaySend(res,400,{error:'invalid_request'});}
 const modelPrompt=typeof body?.modelPrompt==='string'?body.modelPrompt.trim():'';
 if(modelPrompt.length<4||modelPrompt.length>2500||!Object.hasOwn(ratios,body?.ratio))return relaySend(res,400,{error:'invalid_options'});
 let imageFile=null;
 if(body.image){
  const {mime,data}=body.image;
  if(!['image/png','image/jpeg','image/webp'].includes(mime)||typeof data!=='string'||data.length>12000000||!/^[A-Za-z0-9+/=]+$/.test(data))return relaySend(res,400,{error:'invalid_image'});
  const bytes=Buffer.from(data,'base64');
  if(!bytes.length||bytes.length>9000000||relayImageMime(bytes)!==mime)return relaySend(res,400,{error:'invalid_image'});
  imageFile={mime,bytes};
 }
 const now=Date.now();relayWindow=relayWindow.filter(t=>now-t<60000);
 if(activeRelays>=3||relayWindow.length>=12)return relaySend(res,429,{error:'rate_limited'});
 relayWindow.push(now);activeRelays++;
 try{
  const result=await requestGeminiImage({apiKey,model:String(env.GEMINI_IMAGE_MODEL||DEFAULT_IMAGE_MODEL).trim()||DEFAULT_IMAGE_MODEL,modelPrompt,ratio:body.ratio,imageFile,signal:new AbortController().signal,fetchImpl,imageMime:relayImageMime});
  console.info('[image-relay] Gemini image created');
  return relaySend(res,200,result);
 }catch(error){
  const status=Number.isInteger(error.upstreamStatus)&&error.upstreamStatus>=400&&error.upstreamStatus<=599?error.upstreamStatus:502;
  const code=String(error.providerCode||'request_failed').replace(/[^a-z0-9_-]/gi,'').slice(0,60);
  console.warn('[image-relay] Gemini failed:',status,code);
  return relaySend(res,status,{error:code,noFallback:error.noFallback===true});
 }finally{activeRelays--;}
}
