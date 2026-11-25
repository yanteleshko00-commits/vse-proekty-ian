import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeSecret,totp,developerRoute,activeMaintenance,trustedPost,validLoginNonce} from '../developer-console.js';
test('TOTP matches RFC 6238 SHA1 test vector',()=>{
 const secret=decodeSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
 assert.equal(secret.toString(),'12345678901234567890');
 assert.equal(totp(secret,1),'287082');
 assert.equal(decodeSecret('invalid'),null);
});
test('private API fails closed without administrator session',async()=>{
 let output;const req={method:'GET',headers:{}};
 const handled=await developerRoute(req,{},new URL('https://example.com/developer/api/users'),'https://example.com',(_,status)=>{output=status});
 assert.equal(handled,true);assert.equal(output,401);
});
test('unrelated routes remain unaffected',async()=>{
 assert.equal(await developerRoute({method:'GET',headers:{}},{},new URL('https://example.com/health'),'https://example.com',()=>{}),false);
});
test('cross-origin mutation is rejected',async()=>{
 let output;await developerRoute({method:'POST',headers:{origin:'https://other.example'}},{},new URL('https://example.com/developer/api/users'),'https://example.com',(_,status)=>{output=status});
 assert.equal(output,403);
});

test('Safari login supports missing origin only with matching nonce',()=>{
 const nonce='a'.repeat(64),req={headers:{cookie:'__Host-nexora_login='+nonce}};
 assert.equal(trustedPost(req,'https://example.com',true),true);
 assert.equal(validLoginNonce(req,nonce),true);
 assert.equal(validLoginNonce(req,'b'.repeat(64)),false);
 assert.equal(validLoginNonce({headers:{}},nonce),false);
 assert.equal(trustedPost(req,'https://example.com',false),false);
});
test('Render canonical origin is accepted despite different configured APP_URL',()=>{
 assert.equal(trustedPost({headers:{origin:'https://nexora-lobby.onrender.com'}},'https://example.com',true),true);
 assert.equal(trustedPost({headers:{origin:'https://other.example'}},'https://example.com',true),false);
 assert.equal(trustedPost({headers:{'sec-fetch-site':'cross-site'}},'https://example.com',true),false);
});
test('login form issues host-only nonce and shows HTML instead of raw forbidden',async()=>{
 let output;const send=(_,status,body,headers)=>{output={status,body,headers}};
 await developerRoute({method:'GET',headers:{}},{},new URL('https://example.com/developer'),'https://example.com',send);
 assert.equal(output.status,200);
 const nonce=output.body.match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
 assert.ok(nonce);
 assert.ok(output.headers['Set-Cookie'].startsWith('__Host-nexora_login='+nonce+';'));
 await developerRoute({method:'POST',headers:{origin:'https://other.example'}},{},new URL('https://example.com/developer/login'),'https://example.com',send);
 assert.equal(output.status,403);
 assert.match(output.body,/Вход разработчика/);
});

test('owner diagnostics and session revocation require administrator session',async()=>{
 for(const [path,method] of [['owner','GET'],['revoke-sessions','POST']]){
  let status;await developerRoute({method,headers:{origin:'https://example.com'}},{},new URL('https://example.com/developer/api/'+path),'https://example.com',(_,s)=>{status=s});
  assert.equal(status,401);
 }
});

test('history and maintenance are private',async()=>{
 for(const [path,method] of [['history','GET'],['maintenance','GET'],['maintenance','POST']]){
  let status;await developerRoute({method,headers:{origin:'https://example.com'}},{},new URL('https://example.com/developer/api/'+path),'https://example.com',(_,s)=>{status=s});assert.equal(status,401);
 }
});
test('maintenance is disabled by default and excludes auth and health',()=>{
 for(const p of ['/api/nexora-chat','/api/game/code','/health','/developer','/api/auth/login'])assert.equal(activeMaintenance(p),null);
});

test('brand assets have valid PNG dimensions and app manifest paths',async()=>{const {brandPNG,serveBrand}=await import('../brand.js');for(const n of [180,192,512]){const png=brandPNG(n);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),n);assert.equal(png.readUInt32BE(20),n);}let result;const res={writeHead(status,headers){result={status,headers};},end(body){result.body=body;}};assert.equal(serveBrand({method:'GET'},res,'/nexora-admin.webmanifest'),true);assert.equal(JSON.parse(result.body).start_url,'/developer');assert.equal(serveBrand({method:'GET'},res,'/api/health'),false);});

test('visitor analytics cannot be read without an administrator session',async()=>{
 let status;await developerRoute({method:'GET',headers:{}},{},new URL('https://example.com/developer/api/visitors'),'https://example.com',(_,s)=>{status=s});assert.equal(status,401);
});
test('guest heartbeats deduplicate views, distinguish sites and expire online activity',async()=>{
 const {handleAnalytics,visitorSnapshot}=await import('../visitor-analytics.js');
 const {Readable}=await import('node:stream');
 const visitor='b3d59d70-ae4c-45b4-9abc-111111111111',page='c3d59d70-ae4c-45b4-9abc-222222222222';
 async function ping(site,registered=false){const req=Readable.from([Buffer.from(JSON.stringify({visitor,page,registered:true}))]);req.method='POST';req.headers={'content-type':'application/json',host:'localhost',origin:'http://localhost'};let status;await handleAnalytics(req,{writeHead(s){status=s;},end(){}},'/api/visitors/ping',{site,collector:true,registered:()=>registered});assert.equal(status,204);}
 await ping('nexora-lobby');await ping('nexora-lobby');await ping('nexora-text-studio',true);
 const d=visitorSnapshot();assert.equal(d.totals.online,2);assert.equal(d.totals.guests,1);assert.equal(d.totals.registered,1);assert.equal(d.totals.views24h,2);assert.equal(visitorSnapshot(Date.now()+91000).totals.online,0);
 let status;await handleAnalytics({method:'POST',headers:{}},{writeHead(s){status=s;},end(){}},'/internal/visitors/ingest',{collector:true});assert.equal(status,403);
});
