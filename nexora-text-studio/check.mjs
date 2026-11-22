import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import vm from 'node:vm';
import {normalizeTextRequest,buildTextPrompt,readTextResponse,summarizeTextStats} from '../nexora/text-engine.js';

const here=fileURLToPath(new URL('.',import.meta.url));
const html=await readFile(join(here,'index.html'),'utf8');
for(const id of ['generate','source','topic','format','tone','size','language','requirements','result-editor','stage','copy','download','print','rework']){
  assert.ok(html.includes('id="'+id+'"'),'Missing UI control '+id);
}
for(const action of ['create','rewrite','proofread','shorten','expand','summarize'])
  assert.ok(html.includes('data-action="'+action+'"'),'Missing action '+action);
assert.match(html,/overflow-x:clip/);
assert.match(html,/id="output-status"/);
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(js,'Client script is missing');
new vm.Script(js);
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
assert.ok(css&&css.match(/{/g).length===css.match(/}/g).length,'Styles must be balanced');

const valid=normalizeTextRequest({action:'create',topic:'Написать статью о путешествиях',format:'article'});
assert.equal(valid.language,'ru');
assert.match(buildTextPrompt(valid),/статья/);
assert.throws(()=>normalizeTextRequest({action:'rewrite',source:'кратко'}),/15 символов/);
assert.throws(()=>normalizeTextRequest({action:'create',topic:'а'}),/тему/);
assert.throws(()=>normalizeTextRequest({action:'create',topic:'тема',source:'x'.repeat(17000)}),/длинный/);
assert.equal(summarizeTextStats('Привет, мир!\n\nЕщё два слова.').paragraphs,2);
assert.equal(readTextResponse({choices:[{message:{content:'Вот готовый текст: Хорошая книга помогает раскрыть воображение.'}}]}),'Хорошая книга помогает раскрыть воображение.');

const mockKey='c'.repeat(64);
let lastBody=null;
const upstream=createServer(async(req,res)=>{
  if(req.url!=='/api/text/internal/generate'||req.headers['x-nexora-text-key']!==mockKey){
    res.writeHead(403);return res.end('{}');
  }
  let raw='';
  for await(const chunk of req)raw+=chunk.toString();
  lastBody=JSON.parse(raw);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({ok:true,text:'Книги помогают открывать удивительные миры и развивать воображение.',provider:'Mock model',stats:{words:9,characters:68}}));
});
await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(0,'127.0.0.1',resolve)});
const upstreamPort=upstream.address().port,port=24000+(process.pid%18000);
const child=spawn(process.execPath,[join(here,'server.js')],{
  env:{...process.env,PORT:String(port),TEXT_BRIDGE_TOKEN:mockKey,NEXORA_LOBBY_URL:'http://127.0.0.1:'+upstreamPort,TEXT_SMOKE_TEST:'0'},
  stdio:'ignore'
});
try{
  let health;
  for(let i=0;i<35;i++){
    try{health=await fetch('http://127.0.0.1:'+port+'/health');if(health.ok)break}catch{}
    await new Promise(resolve=>setTimeout(resolve,130));
  }
  assert.equal(health?.status,200,'server health endpoint failed');
  const healthBody=await health.json();
  assert.equal(healthBody.service,'nexora-text-studio');
  assert.equal(healthBody.bridgeConfigured,true);
  const page=await fetch('http://127.0.0.1:'+port+'/');
  assert.equal(page.status,200);
  assert.match(await page.text(),/NEXORA Text Studio/);
  assert.match(page.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
  const invalid=await fetch('http://127.0.0.1:'+port+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',topic:'к'})});
  assert.equal(invalid.status,400);
  const generation=await fetch('http://127.0.0.1:'+port+'/api/generate',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'create',topic:'Пост о пользе чтения',format:'post',tone:'friendly',size:'short',language:'ru'})
  });
  assert.equal(generation.status,200);
  const result=await generation.json();
  assert.equal(result.ok,true);
  assert.equal(result.provider,'Mock model');
  assert.equal(lastBody.action,'create');
  assert.equal(lastBody.format,'post');
  console.log('Text Studio checks passed: 6 modes, inputs, responsive styles, HTML/JS, request validation, secure gateway forwarding and text response.');
}finally{child.kill();await new Promise(resolve=>upstream.close(resolve))}
