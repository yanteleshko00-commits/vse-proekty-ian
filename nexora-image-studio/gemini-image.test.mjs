import test from 'node:test';
import assert from 'node:assert/strict';
import {requestGeminiImage,requestGeminiImageRelay,firstImageProvider,DEFAULT_IMAGE_MODEL} from './gemini-image.js';
const bytes=Buffer.from([137,80,78,71,13,10,26,10,1]);
test('Gemini returns a validated image and keeps its API key in the header',async()=>{
 const result=await requestGeminiImage({apiKey:'test-secret',modelPrompt:'a landscape',ratio:'wide',signal:new AbortController().signal,imageMime:()=> 'image/png',fetchImpl:async(url,options)=>{
  assert.ok(url.endsWith(DEFAULT_IMAGE_MODEL+':generateContent'));assert.ok(!url.includes('test-secret'));
  assert.equal(options.headers['x-goog-api-key'],'test-secret');
  const body=JSON.parse(options.body);
  assert.deepEqual(body.generationConfig.responseModalities,['IMAGE']);
  assert.equal(body.generationConfig.imageConfig.aspectRatio,'16:9');
  return new Response(JSON.stringify({candidates:[{content:{parts:[{thought:true,inlineData:{data:'ignore'}},{inlineData:{data:bytes.toString('base64')}}]}}]}));
 }});
 assert.equal(result.provider,'Gemini');assert.equal(result.image,'data:image/png;base64,'+bytes.toString('base64'));
});
test('Alice starts only if Gemini fails',async()=>{
 const calls=[];
 const providers=[{name:'Gemini',run:async()=>{calls.push('Gemini');throw Error('offline');}},{name:'Alice AI ART',run:async()=>{calls.push('Alice');return {provider:'Alice AI ART'};}}];
 assert.equal((await firstImageProvider(providers)).provider,'Alice AI ART');
 assert.deepEqual(calls,['Gemini','Alice']);
 calls.length=0;providers[0].run=async()=>{calls.push('Gemini');return {provider:'Gemini'};};
 assert.equal((await firstImageProvider(providers)).provider,'Gemini');assert.deepEqual(calls,['Gemini']);
});
test('Safety refusal does not start backup model',async()=>{
 let calls=0;
 await assert.rejects(firstImageProvider([{name:'Gemini',run:async()=>{throw Object.assign(Error('blocked'),{noFallback:true});}},{name:'Alice',run:async()=>{calls++;}}]));
 assert.equal(calls,0);
});

test('Image Studio uses the protected lobby relay without any Gemini key',async()=>{
 const result=await requestGeminiImageRelay({token:'test-relay-secret',modelPrompt:'A landscape',ratio:'square',signal:new AbortController().signal,imageMime:()=> 'image/png',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://nexora-lobby.onrender.com/internal/gemini/image');
  assert.equal(options.headers['x-nexora-image-token'],'test-relay-secret');
  assert.ok(!options.headers['x-goog-api-key']);
  return new Response(JSON.stringify({image:'data:image/png;base64,'+bytes.toString('base64'),model:DEFAULT_IMAGE_MODEL}));
 }});
 assert.equal(result.provider,'Gemini');
});
