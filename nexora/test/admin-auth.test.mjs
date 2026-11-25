import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {passwordConfigured,checkAdminPassword,createAdminSession,validAdminSession,allowAdminAttempt} from '../admin-auth.js';
const salt='a'.repeat(48),hash=salt+':'+crypto.scryptSync('test-only',salt,64).toString('hex');
test('admin passwords are hashed and fail closed',()=>{assert.equal(passwordConfigured(hash),true);assert.equal(checkAdminPassword('test-only',hash),true);assert.equal(checkAdminPassword('incorrect',hash),false);assert.equal(checkAdminPassword('test-only',''),false);});
test('admin session is independent of email, signed and expires',()=>{const now=Date.now(),token=createAdminSession(hash,now);assert.equal(validAdminSession(token,hash,now),true);assert.equal(validAdminSession(token+'x',hash,now),false);assert.equal(validAdminSession(token,hash,now+8*3600*1000),false);assert.equal(validAdminSession(token,'',now),false);});
test('admin password attempts are throttled',()=>{for(let i=0;i<5;i++)assert.equal(allowAdminAttempt('unit-test'),true);assert.equal(allowAdminAttempt('unit-test'),false);});

test('other addresses do not exhaust an administrator global allowance',()=>{for(let i=0;i<45;i++)assert.equal(allowAdminAttempt('other-'+i),true);assert.equal(allowAdminAttempt('separate-admin'),true);});

import {trustedClientIp,persistentAdminAttempt} from '../admin-throttle.js';
test('only the configured trusted proxy can supply the last address',()=>{
 const req={headers:{'x-forwarded-for':'1.2.3.4, 8.8.8.8'},socket:{remoteAddress:'127.0.0.1'}};
 assert.equal(trustedClientIp(req,{}),'127.0.0.1');assert.equal(trustedClientIp(req,{RENDER:'true'}),'8.8.8.8');
});
test('persistent admin throttle fails closed on backend errors',async()=>{
 const req={headers:{},socket:{remoteAddress:'127.0.0.1'}},env={AUTH_SERVICE_API_KEY:'x'.repeat(32)};
 assert.equal(await persistentAdminAttempt(req,'password',env,async()=>({status:429})),false);
 await assert.rejects(persistentAdminAttempt(req,'password',env,async()=>({status:503,ok:false})));
 assert.equal(await persistentAdminAttempt(req,'password',env,async()=>({status:200,ok:true,json:async()=>({allowed:true})})),true);
});
