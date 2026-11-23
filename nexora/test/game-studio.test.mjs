import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
import {GAME_TYPES,gameType,basicGamePlan} from '../game-studio.js';

const root=fileURLToPath(new URL('..',import.meta.url));
test('game routing and safe presets',()=>{
 assert.deepEqual(GAME_TYPES,['auto','catch','snake','target']);
 assert.equal(gameType('Космическая змейка собирает еду'),'snake');
 assert.equal(gameType('Нажимай на мишени'),'target');
 assert.equal(gameType('Лови звезды'),'catch');
 assert.equal(gameType('произвольная игра','snake'),'snake');
 assert.equal(basicGamePlan({idea:'Космос',color:'mint'}).color,'mint');
 assert.equal(basicGamePlan({idea:'Игра',level:'invalid'}).difficulty,'normal');
});
test('Game Studio UI has bold text, playable mobile controls and standalone export',async()=>{
 const html=await readFile(join(root,'public/game.html'),'utf8'),js=await readFile(join(root,'public/game.js'),'utf8');
 for(const id of ['idea','generate','difficulty','color','game','score','start','pause','reset','download','play-area'])
  assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
 for(const type of ['snake','catch','target'])assert.ok(html.includes('data-type="'+type+'"'));
 assert.match(html,/font-weight:680/);
 assert.match(html,/class="nx-argosha-host"/);
 assert.match(html,/class="nx-argosha-greeting"/);
 assert.match(html,/nx-argosha-orb::before/);
 assert.match(html,/\.standalone \.nx-argosha-greeting\{display:none!important\}/);
 assert.match(html,/argosha\/embed\?studio=game/);
 assert.match(html,/\.standalone \.nx-argosha-host\{display:none!important\}/);
 for(const id of ['nxquiz','nxq-question','nxq-next','nxq-skip','nxq-back','nxq-options'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/role="dialog" aria-modal="true"/);
 assert.match(js,/generate"\)\.addEventListener\("click",nxqOpenGame\)/);
 assert.match(js,/void create\(\)\.then/);
 assert.match(js,/if\(plan&&status==="ready"\)start\(\)/);
 assert.match(html,/script src="\/game\.js"/);
 assert.match(js,/requestAnimationFrame/);
 assert.match(js,/window\.__GAME_PRESET__/);
 assert.match(js,/nexora-game-/);
 new vm.Script(js);
 const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
 assert.ok(css);
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
test('Lobby serves Game Studio and handles generation with built-in fallback',async()=>{
 const port=22000+process.pid%20000;
 const child=spawn(process.execPath,[join(root,'server.js')],{
  env:{...process.env,PORT:String(port),OPENROUTER_API_KEY:'',GROQ_API_KEY:''},stdio:'ignore'
 });
 try{
  let live=false;
  for(let i=0;i<40;i++){
   try{const r=await fetch('http://127.0.0.1:'+port+'/health');if(r.ok){live=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,140));
  }
  assert.ok(live,'Lobby server did not start');
  const page=await fetch('http://127.0.0.1:'+port+'/game');
  assert.equal(page.status,200);
  assert.match(await page.text(),/GAME STUDIO/);
  assert.match(page.headers.get('content-security-policy')||'',/script-src 'self'/);
  const js=await fetch('http://127.0.0.1:'+port+'/game.js');
  assert.equal(js.status,200);
  assert.match(js.headers.get('content-type')||'',/javascript/);
  const tools=await fetch('http://127.0.0.1:'+port+'/api/argosha/tools').then(x=>x.json());
  assert.ok(tools.tools.some(t=>t.id==='game'&&t.status==='available'));
  const result=await fetch('http://127.0.0.1:'+port+'/api/game/generate',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({idea:'Космическая змейка с фруктами',type:'snake',level:'easy',color:'blue'})
  });
  assert.equal(result.status,200);
  const answer=await result.json();
  assert.equal(answer.ok,true);
  assert.equal(answer.game.type,'snake');
  assert.equal(answer.game.color,'blue');
  assert.equal(answer.game.difficulty,'easy');
  assert.equal(answer.game.aiUsed,false);
  const invalid=await fetch('http://127.0.0.1:'+port+'/api/game/generate',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idea:'x'})
  });
  assert.equal(invalid.status,400);
 }finally{child.kill()}
});


test('Game Studio supports genuine editable HTML code and swipe-to-arrow controls in an isolated frame',async()=>{
 const {gameFamily,normalizeGameHTML,sandboxGameHTML,fallbackGameHTML}=await import('../game-code.js');
 const html=await readFile(join(root,'public/game.html'),'utf8');
 const client=await readFile(join(root,'public/game-builder.js'),'utf8');
 const gameEngine=await readFile(join(root,'game-code.js'),'utf8');
 for(const id of ['ai-workspace','ai-build','ai-idea','ai-source','ai-frame','ai-play-tab','ai-code-tab','ai-run-code','ai-download','ai-game-view','classic-workspace']){
  assert.ok(html.includes('id="'+id+'"'),'Missing AI game UI: '+id);
 }
 assert.match(html,/id="ai-frame"[^>]*sandbox="allow-scripts"/);
 assert.doesNotMatch(html,/id="ai-frame"[^>]*allow-same-origin/);
 assert.match(html,/data-game-arrow="left"/);
 assert.match(html,/data-game-arrow="right"/);
 assert.match(html,/data-game-arrow="up"/);
 assert.match(html,/data-game-arrow="down"/);
 assert.match(html,/data-game-arrow="space"/);
 assert.match(client,/\/api\/game\/code/);
 assert.match(client,/\/api\/game\/preview/);
 assert.match(client,/frame\.src=data\.url/);
 assert.match(client,/nexora-game-control/);
 assert.match(client,/function runEdited/);
 assert.match(client,/function saveGame/);
 new vm.Script(client);
 assert.equal(gameFamily('Платформер как Марио'),'platform');
 assert.equal(gameFamily('Гонки на машине'),'racing');
 assert.equal(gameFamily('Змейка'),'snake');
 assert.equal(gameFamily('Сделай Flappy Bird'),'flappy');
 assert.equal(gameFamily('Пинг-понг'),'pong');
 const standalone='<html><head><title>Test</title></head><body><canvas width="720" height="420"></canvas><script>document.body.dataset.ok="yes";</script></body></html>';
 assert.ok(normalizeGameHTML(standalone)===null,'Tiny or static games should not pass AI validation');
 const valid='<html><head><title>Game</title></head><body><canvas width="720" height="420"></canvas><script>'+ 'const game=()=>{const c=document.querySelector("canvas");const x=c.getContext("2d");requestAnimationFrame(function loop(){x.fillRect(0,0,10,10);requestAnimationFrame(loop)});};game();'+'</script></body></html>';
 assert.ok(normalizeGameHTML(valid));
 const sandbox=sandboxGameHTML(valid);
 assert.match(sandbox,/touchend/);
 assert.match(sandbox,/nexora-game-control/);
 assert.match(sandbox,/connect-src 'none'/);
 assert.equal(normalizeGameHTML(valid.replace('<canvas','<script src="https://evil.example/x.js"></script><canvas')),null);
 assert.equal(normalizeGameHTML(valid.replace('<canvas','<iframe src="/"></iframe><canvas')),null);
 const fallback=await fallbackGameHTML('Космическая змейка собирает фрукты');
 assert.ok(fallback.length>20000);
 assert.match(fallback,/__GAME_PRESET__/);
 assert.doesNotMatch(fallback,/id="ai-workspace"/);
 assert.doesNotMatch(fallback,/<script src="\/game\.js"/);
 assert.ok(normalizeGameHTML(fallback),'Fallback must be valid standalone HTML');
 const {arcadeGameHTML}=await import('../game-arcade.js');
 for(const [idea,family] of [['Гонки на трассе','racing'],['Марио платформер','platform'],['Flappy Bird','flappy'],['Космический шутер','shooter'],['Пинг-понг','pong'],['Арканоид разбей кирпичи','breakout'],['Лабиринт с выходом','maze']]){
   const generated=await fallbackGameHTML(idea);
   assert.equal(gameFamily(idea),family);
   assert.equal(generated,arcadeGameHTML(idea,family));
   assert.match(generated,new RegExp('mode":"'+family+'"'));
   assert.ok(normalizeGameHTML(generated),'Invalid offline '+family+' game');
   const gameplay=generated.split('<script>')[1]?.split('</script>')[0];
   assert.ok(gameplay,'Missing active gameplay script '+family);
   new vm.Script(gameplay);
 }

 assert.match(gameEngine,/authenticated/);
});
test('HTTP game build and live sandbox preview work for guests with no credentials',async()=>{
 const port=24000+process.pid%15000;
 const child=spawn(process.execPath,[join(root,'server.js')],{
  env:{...process.env,PORT:String(port),NEXORA_CHAT_INTERNAL_TOKEN:'',SESSION_SECRET:'',NODE_ENV:'test'},stdio:'ignore'
 });
 try{
  let ready=false;
  for(let i=0;i<40;i++){
   try{const r=await fetch('http://127.0.0.1:'+port+'/health');if(r.ok){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,130));
  }
  assert.ok(ready);
  const base='http://127.0.0.1:'+port;
  const page=await fetch(base+'/game');
  assert.equal(page.status,200);
  const client=await fetch(base+'/game-builder.js');
  assert.equal(client.status,200);
  const request=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const generated=await request('/api/game/code',{idea:'Змейка космос'});
  assert.equal(generated.status,200);
  const body=await generated.json();
  assert.equal(body.ok,true);
  assert.equal(body.source,'template');
  assert.match(body.html,/__GAME_PRESET__/);
  const preview=await request('/api/game/preview',{html:body.html});
  assert.equal(preview.status,200);
  const p=await preview.json();
  assert.ok(p.url.startsWith('/game/preview/'));
  const frame=await fetch(base+p.url);
  assert.equal(frame.status,200);
  assert.match(frame.headers.get('content-security-policy')||'',/script-src 'unsafe-inline'/);
  assert.match(frame.headers.get('content-security-policy')||'',/sandbox allow-scripts/);
  assert.match(frame.headers.get('content-security-policy')||'',/connect-src 'none'/);
  const iframeHtml=await frame.text();
  assert.match(iframeHtml,/nexora-game-control/);
  assert.match(iframeHtml,/__GAME_PRESET__/);
  const blocked=await request('/api/game/preview',{html:'<html>not a game</html>'});
  assert.equal(blocked.status,400);
  const invalid=await request('/api/game/code',{idea:'A'});
  assert.equal(invalid.status,400);
 }finally{child.kill();}
});


test('signed-in game maker requests original HTML from protected AI gateway',async()=>{
 const {createServer}=await import('node:http');
 const {createHmac}=await import('node:crypto');
 const secret='m'.repeat(48),sessionSecret='s'.repeat(48);
 const resultHtml='<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>AI Game</title><style>canvas{display:block;width:100%;background:black}body{margin:0}</style></head><body><canvas width="720" height="420"></canvas><script>const canvas=document.querySelector("canvas");const context=canvas.getContext("2d");let t=0;document.addEventListener("keydown",event=>{t+=event.key==="ArrowLeft"?1:2});function loop(){t++;context.fillRect(t%720,0,10,10);requestAnimationFrame(loop)}loop();</script></body></html>';
 let calls=0;
 const mock=createServer(async(req,res)=>{
  calls++;
  assert.equal(req.url,'/api/nexora-chat/internal');
  assert.equal(req.headers['x-nexora-chat-token'],secret);
  const parts=[];for await(const chunk of req)parts.push(chunk);
  const input=JSON.parse(Buffer.concat(parts).toString('utf8'));
  assert.equal(input.model,'alice');
  assert.match(input.messages[0].content,/ОПИСАНИЕ ИГРЫ: Платформер с монетами/);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({ok:true,answer:resultHtml,provider:'Alice AI LLM'}));
 });
 await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
 const port=22500+process.pid%17000;
 const child=spawn(process.execPath,[join(root,'server.js')],{
  env:{...process.env,PORT:String(port),NODE_ENV:'test',SESSION_SECRET:sessionSecret,
   NEXORA_CHAT_INTERNAL_TOKEN:secret,
   PROJECT_GENERATOR_URL:'http://127.0.0.1:'+mock.address().port},
  stdio:'ignore'
 });
 try{
  let ready=false;
  for(let i=0;i<40;i++){
   try{const r=await fetch('http://127.0.0.1:'+port+'/health');if(r.ok){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,130));
  }
  assert.ok(ready);
  const encoded=Buffer.from(JSON.stringify({id:'game-maker',name:'Игрок',issuedAt:Date.now()})).toString('base64url');
  const sig=createHmac('sha256',sessionSecret).update(encoded).digest('base64url');
  const response=await fetch('http://127.0.0.1:'+port+'/api/game/code',{
   method:'POST',headers:{'Content-Type':'application/json',Cookie:'nexora_session='+encoded+'.'+sig},
   body:JSON.stringify({idea:'Платформер с монетами'})
  });
  assert.equal(response.status,200);
  const game=await response.json();
  assert.equal(game.source,'ai');
  assert.equal(game.provider,'Alice AI LLM');
  assert.equal(game.html,resultHtml);
  assert.equal(calls,1);
 }finally{child.kill();await new Promise(resolve=>mock.close(resolve));}
});
