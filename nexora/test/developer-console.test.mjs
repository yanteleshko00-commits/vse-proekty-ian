import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeSecret,totp,developerRoute} from '../developer-console.js';
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
