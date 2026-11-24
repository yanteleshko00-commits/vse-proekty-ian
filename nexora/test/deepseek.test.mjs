import test from 'node:test';import assert from 'node:assert/strict';import {deepSeekProvider,deepSeekText,deepSeekRelay} from '../deepseek.js';
test('DeepSeek text requests stay server-side',async()=>{
 const provider=deepSeekProvider({DEEPSEEK_API_KEY:'fake'});
 const answer=await deepSeekText({provider,messages:[{role:'user',content:'test'}],fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(opts.headers.Authorization,'Bearer fake');assert.deepEqual(JSON.parse(opts.body).thinking,{type:'disabled'});return new Response(JSON.stringify({choices:[{message:{content:'ok'}}]}));}});
 assert.equal(answer,'ok');
});
test('relay rejects missing token before calling provider',async()=>{let code;await deepSeekRelay({headers:{}},{writeHead:s=>code=s,end:()=>{}},{env:{NEXORA_CHAT_INTERNAL_TOKEN:'x'.repeat(40),DEEPSEEK_API_KEY:'fake'},fetchImpl:async()=>{throw Error('must not call');}});assert.equal(code,403);});
