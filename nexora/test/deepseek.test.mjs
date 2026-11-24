import test from 'node:test';import assert from 'node:assert/strict';import {deepSeekProvider,deepSeekText,deepSeekRelay} from '../deepseek.js';
test('DeepSeek text requests stay server-side',async()=>{
 const provider=deepSeekProvider({DEEPSEEK_API_KEY:'fake'});
 const answer=await deepSeekText({provider,env:{},messages:[{role:'user',content:'test'}],fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(opts.headers.Authorization,'Bearer fake');assert.deepEqual(JSON.parse(opts.body).thinking,{type:'disabled'});return new Response(JSON.stringify({choices:[{message:{content:'ok'}}]}));}});
 assert.equal(answer,'ok');
});
test('relay rejects missing token before calling provider',async()=>{let code;await deepSeekRelay({headers:{}},{writeHead:s=>code=s,end:()=>{}},{env:{NEXORA_CHAT_INTERNAL_TOKEN:'x'.repeat(40),DEEPSEEK_API_KEY:'fake'},fetchImpl:async()=>{throw Error('must not call');}});assert.equal(code,403);});

import {badAnswer,verifyDeepSeek,recordDeepSeek,deepSeekUsage,isUsageAdmin} from '../deepseek-quality.js';
test('bad answer rejected',async()=>{assert.equal(badAnswer(''),true);await assert.rejects(verifyDeepSeek('test','2+2','5',{env:{GROQ_API_KEY:'fake'},fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'FAIL'}}]}))}),/quality_rejected/);});
test('actual usage and owner check',()=>{recordDeepSeek('usage-test',{usage:{prompt_tokens:8,completion_tokens:12,total_tokens:20}});recordDeepSeek('usage-test',{});assert.equal(deepSeekUsage().services['usage-test'].totalTokens,20);assert.equal(deepSeekUsage().services['usage-test'].unknown,1);assert.equal(isUsageAdmin({email:'a@b.test'},{NEXORA_ADMIN_EMAIL:'a@b.test'}),true);assert.equal(isUsageAdmin({email:'a@b.test'},{}),false);});
