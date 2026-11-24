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

export async function requestGeminiImageRelay({token,modelPrompt,ratio,imageFile,signal,fetchImpl=fetch,imageMime}){
 let response,payload;
 try{
  response=await fetchImpl('https://nexora-lobby.onrender.com/internal/gemini/image',{
   method:'POST',headers:{'Content-Type':'application/json','x-nexora-image-token':token},
   body:JSON.stringify({modelPrompt,ratio,...(imageFile?{image:{mime:imageFile.mime,data:imageFile.bytes.toString('base64')}}:{})}),
   signal:AbortSignal.any([signal,AbortSignal.timeout(80000)])
  });
  payload=await response.json();
 }catch(error){throw failure(0,error.name==='TimeoutError'?'timeout':'relay_unavailable','Сервер Gemini временно недоступен.');}
 if(!response.ok){
  const error=failure(response.status,String(payload?.error||'relay_error').replace(/[^a-z0-9_-]/gi,'').slice(0,60),'Gemini не смог создать изображение (HTTP '+response.status+').');
  if(payload?.noFallback===true)error.noFallback=true;
  throw error;
 }
 const match=typeof payload?.image==='string'&&payload.image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
 if(!match||match[2].length>24000000||imageMime(Buffer.from(match[2],'base64'))!==match[1])throw failure(502,'invalid_image','Gemini вернул некорректное изображение.');
 return {image:payload.image,provider:'Gemini',model:String(payload.model||DEFAULT_IMAGE_MODEL).slice(0,100)};
}
