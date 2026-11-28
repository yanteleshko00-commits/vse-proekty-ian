import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const names=['project','math','chat','image','lesson','text','game'];
test('lobby images are bundled and load without third-party requests',{timeout:20000},async()=>{
 const port=26977,base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['nexora/server.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'test'},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  const html=await (await fetch(base+'/')).text();assert.ok(!html.includes('images.unsplash.com'));
  for(const name of names){const r=await fetch(base+'/studio-art/'+name+'?v=1');assert.equal(r.status,200,name);assert.match(r.headers.get('content-type'),/^image\/(svg\+xml|jpeg)/);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length>100,name);const fallback=await readFile('nexora/public/studio-art/'+name+'.svg','utf8');assert.match(fallback,/<svg[^>]*viewBox=/);const head=await fetch(base+'/studio-art/'+name,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),bytes.length);console.log('PASS image '+name+' '+r.headers.get('content-type')+' '+bytes.length+' bytes');}
 }finally{child.kill();}
});
