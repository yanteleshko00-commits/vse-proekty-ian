import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {serviceConfig,publicHtml,origin,boundedInt,allowStartupSmoke,createRateLimiter,clientIP} from '../nexora/runtime-config.js';
test('standalone common modules match',async()=>{
 for(const name of ['runtime-config.js','background-jobs.js','visitor-analytics.js','public-performance.js']){
  const canonical=await readFile('nexora/'+name,'utf8');
  for(const dir of ['nexora-image-studio','nexora-text-studio','nexora-math-studio'])assert.equal(await readFile(dir+'/'+name,'utf8'),canonical,dir+'/'+name);
 }
});
test('service overrides and safe origin validation',()=>{
 const e={NODE_ENV:'production',PROJECT_GENERATOR_URL:'https://projects.example.com/',NEXORA_LOBBY_URL:'https://lobby.example.com'};
 assert.equal(serviceConfig(e).project,'https://projects.example.com');
 assert.equal(publicHtml('https://vse-proekty-ian.onrender.com/a https://vse-proekty-ian-1.onrender.com/b',e),'https://projects.example.com/a https://projects.example.com/b');
 for(const invalid of ['https://name:pass@example.com','https://example.com/x','http://example.com'])assert.throws(()=>origin(invalid,'',true));
});
test('bounded limits and smoke guard',()=>{
 assert.equal(boundedInt('999',4,1,8),4);assert.equal(boundedInt('2',4,1,8),2);
 assert.equal(allowStartupSmoke('SMOKE_TEST',{NODE_ENV:'production',SMOKE_TEST:'1'}),false);
 assert.equal(allowStartupSmoke('SMOKE_TEST',{NODE_ENV:'production',SMOKE_TEST:'1',NEXORA_ALLOW_PRODUCTION_SMOKE:'1'}),true);
 let now=0;const allow=createRateLimiter({minute:2,hour:3,maxKeys:2,clock:()=>now});
 assert.ok(allow('a'));assert.ok(allow('a'));assert.equal(allow('a'),false);assert.ok(allow('b'));assert.equal(allow('c'),false);now=60001;assert.ok(allow('a'));assert.equal(allow('a'),false);now=3600001;assert.ok(allow('c'));
 assert.equal(clientIP({headers:{'x-forwarded-for':'spoof, real'},socket:{remoteAddress:'socket'}},{}),'socket');
});
