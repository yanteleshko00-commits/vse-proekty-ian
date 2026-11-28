import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHttpGuard} from '../nexora/http-guard.js';
function req(method='POST',headers={},ip='1.2.3.4'){return {method,url:'/api/test',headers,socket:{remoteAddress:ip}};}
function res(){const r=new EventEmitter();r.statusCode=200;r.writeHead=(n)=>{r.statusCode=n;};r.end=()=>r.emit('finish');return r;}
test('reject cross-site writes, large requests and overload; release slots',()=>{
 const g=createHttpGuard({maxActive:2,maxWrites:1});
 let r=res();assert.equal(g.admit(req('POST',{'sec-fetch-site':'cross-site'}),r),false);assert.equal(r.statusCode,403);
 r=res();assert.equal(g.admit(req('POST',{'content-length':String(40*1024*1024)}),r),false);assert.equal(r.statusCode,413);
 const first=res();assert.ok(g.admit(req(),first));r=res();assert.equal(g.admit(req(),r),false);assert.equal(r.statusCode,503);
 first.emit('finish');first.emit('close');assert.equal(g.snapshot().active,0);assert.ok(g.admit(req(),res()));
});
test('bounded rate identities, retry after window, health exempt',()=>{
 let now=0;const g=createHttpGuard({clock:()=>now,maxKeys:2});
 for(let i=0;i<60;i++){const r=res();assert.ok(g.admit(req(),r));r.end();}
 const r=res();assert.equal(g.admit(req(),r),false);assert.equal(r.statusCode,429);
 now=60001;assert.ok(g.admit(req(),res()));
 assert.ok(g.admit({...req('GET'),url:'/health'},res()));
});
