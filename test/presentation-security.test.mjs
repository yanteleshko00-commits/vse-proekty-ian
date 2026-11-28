import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Script } from 'node:vm';
import { createProjectSecurity } from '../project-security.js';
import { handleAnalytics } from '../nexora/visitor-analytics.js';

test('project page has external scripts and no inline JavaScript handlers',async()=>{
 const html=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/\sonclick\s*=/i);
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  assert.equal(match[2].trim(),'');
  const src=match[1].match(/src="([^"]+)"/)?.[1];assert.ok(src);
  const pathname=new URL(src,'http://localhost').pathname;
  if(pathname==='/nexora-visitors.js'){
   let body,status,headers;
   const response={writeHead(code,value){status=code;headers=value;},end(value){body=value;}};
   assert.equal(await handleAnalytics({method:'GET'},response,pathname,{site:'project-test'}),true);
   assert.equal(status,200);assert.match(headers['Content-Type'],/javascript/);new Script(String(body));
  }else{
   assert.ok(src.startsWith('/assets/'),'Unexpected external script: '+src);
   new Script(await fs.readFile(new URL('../public'+pathname,import.meta.url),'utf8'));
  }
 }
});
test('project session is signed, requires an ID and excludes stale account balances',()=>{
 const security=createProjectSecurity({authPublicUrl:'https://example.test',oauthClientId:'projects',sessionSecret:'x'.repeat(40),sessionCookieName:'session',sessionTTL:60,projectServiceKey:'y'.repeat(40),asyncRoute:f=>f});
 const token=security.createProjectSession({id:'user',usage:100,packages:['paid']},'central-session');
 const req={headers:{cookie:'session='+token}};
 const session=security.readProjectSession(req);
 assert.equal(session.id,'user');assert.equal(session.sessionId,'central-session');assert.equal(session.usage,undefined);
 assert.equal(security.readProjectSession({headers:{cookie:'session='+token+'x'}}),null);
 assert.equal(security.readProjectSession({headers:{}}),null);
 assert.equal(security.takeRate('ip',2),true);assert.equal(security.takeRate('ip',2),true);assert.equal(security.takeRate('ip',2),false);
});
