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
 assert.ok(fallback.length>4000);
 assert.match(fallback,/const cfg=/);
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

 const {miniGameHTML}=await import('../game-mini.js');
 const {blockSandboxHTML}=await import('../game-block-world.js');
 const world=await fallbackGameHTML('Майнкрафт');
 assert.equal(gameFamily('Майнкрафт'),'blocks');
 assert.equal(gameFamily('Minecraft строительство блоков'),'blocks');
 assert.equal(world,blockSandboxHTML('Майнкрафт'));
 assert.ok(normalizeGameHTML(world));
 assert.match(world,/id="world"/);
 assert.match(world,/id="mine"/);
 assert.match(world,/id="place"/);
 assert.match(world,/function interact/);
 assert.match(world,/function render/);
 new vm.Script(world.split('<script>')[1].split('</script>')[0]);
 for(const family of ['snake','target','catch']){
   const game=await fallbackGameHTML(family==='snake'?'Змейка':family==='target'?'Мишени на реакцию':'Лови звезды');
   assert.ok(normalizeGameHTML(game),'Invalid mini game: '+family);
   assert.equal(game,miniGameHTML(family==='snake'?'Змейка':family==='target'?'Мишени на реакцию':'Лови звезды',family));
   assert.match(game,/id="board"/);
   assert.doesNotMatch(game,/id="ai-workspace"|GAME STUDIO|id="nxquiz"/);
   new vm.Script(game.split('<script>')[1].split('</script>')[0]);
 }
 for(const game of [world,fallback,arcadeGameHTML('Гонки','racing')]){
   assert.doesNotMatch(game,/id="ai-workspace"|id="classic-workspace"|NEXORA GAME STUDIO|id="nxquiz"/,
     'An actual game must never embed the Game Studio inside its own preview');
 }
 assert.match(gameEngine,/activeGameGenerations/);
 assert.doesNotMatch(gameEngine,/if\(!authenticated\)return send\(res,401/);
});
test('Public game maker returns a clear provider error without silently substituting a template',async()=>{
 const port=24000+process.pid%15000;
 const child=spawn(process.execPath,[join(root,'server.js')],{
  env:{...process.env,PORT:String(port),NEXORA_CHAT_INTERNAL_TOKEN:'',SESSION_SECRET:'',OPENROUTER_API_KEY:'',GROQ_API_KEY:'',NODE_ENV:'test'},stdio:'ignore'
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
  assert.equal(generated.status,503);
  const body=await generated.json();
  assert.equal(body.ok,false);
  assert.equal(body.error,'generation_unavailable');
  assert.match(body.message,/ИИ|генераци/);
  assert.equal(body.html,undefined);
  const {fallbackGameHTML}=await import('../game-code.js');
  const separateClassic=await fallbackGameHTML('Змейка космос');
  const preview=await request('/api/game/preview',{html:separateClassic});
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
  assert.match(iframeHtml,/const cfg=/);
  const blocked=await request('/api/game/preview',{html:'<html>not a game</html>'});
  assert.equal(blocked.status,400);
  const invalid=await request('/api/game/code',{idea:'A'});
  assert.equal(invalid.status,400);
 }finally{child.kill();}
});


test('Unauthenticated players can create an original game through the protected AI gateway',async()=>{
 const {createServer}=await import('node:http');
 const secret='m'.repeat(48);
 const resultHtml='<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>AI Game</title><style>canvas{display:block;width:100%;background:black}body{margin:0}</style></head><body><canvas width="720" height="420"></canvas><script>const canvas=document.querySelector("canvas");const context=canvas.getContext("2d");let t=0;document.addEventListener("keydown",event=>{t+=event.key==="ArrowLeft"?1:2});function loop(){t++;context.fillRect(t%720,0,10,10);requestAnimationFrame(loop)}loop();</script></body></html>';
 let calls=0;
 const mock=createServer(async(req,res)=>{
  calls++;
  assert.equal(req.url,'/api/nexora-chat/internal');
  assert.equal(req.headers['x-nexora-chat-token'],secret);
  const parts=[];for await(const chunk of req)parts.push(chunk);
  const input=JSON.parse(Buffer.concat(parts).toString('utf8'));
  assert.equal(input.model,'auto');
  assert.match(input.messages[0].content,/ЗАПРОС ПОЛЬЗОВАТЕЛЯ: Платформер с монетами/);
  assert.match(input.messages[0].content,/любое название игры|ЛЮБОЕ название игры/i);
  assert.match(input.messages[0].content,/собственн.*идеи/);
  assert.match(input.messages[0].content,/не подменяй|не подмен|подменяй|не привязывайся/i);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({ok:true,answer:resultHtml,provider:'Alice AI LLM'}));
 });
 await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
 const port=22500+process.pid%17000;
 const child=spawn(process.execPath,[join(root,'server.js')],{
  env:{...process.env,PORT:String(port),NODE_ENV:'test',SESSION_SECRET:'',
   OPENROUTER_API_KEY:'',GROQ_API_KEY:'',NEXORA_CHAT_INTERNAL_TOKEN:secret,
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
  const response=await fetch('http://127.0.0.1:'+port+'/api/game/code',{
   method:'POST',headers:{'Content-Type':'application/json'},
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


test('Game Studio requests AI for arbitrary names and custom mechanics, never secretly returning catch or Minecraft',async()=>{
 const {gameCodePrompt}=await import('../game-code.js');
 for(const idea of [
  'Космическая ферма, где выращивают инопланетные растения и торгуют ресурсами',
  'Ритм-игра, где надо попадать по разноцветным нотам под такт',
  'Шахматы с необычными правилами и победой через захват кристаллов',
  'Пазл с переворачиванием гравитации и лабиринтом',
  'Майнкрафт',
  'Выдуманная игра «Фруктовый лифт» — управляй лифтом и спасай пассажиров'
 ]){
  const prompt=gameCodePrompt(idea);
  assert.ok(prompt.includes(idea),'The actual prompt must include the entire arbitrary idea');
  assert.match(prompt,/не привязывайся к готовым категориям NEXORA/i);
  assert.match(prompt,/HTML|JavaScript/);
  assert.doesNotMatch(prompt,/Тип: (?:snake|catch|target)/i);
 }
 const page=await readFile(join(root,'public/game.html'),'utf8');
 const frontend=await readFile(join(root,'public/game-builder.js'),'utf8');
 const backend=await readFile(join(root,'game-code.js'),'utf8');
 assert.match(page,/любое название, жанр или свою механику игры/i);
 assert.doesNotMatch(page,/id="ai-login-required"/);
 assert.doesNotMatch(page,/href="\/auth\/start"/);
 assert.match(page,/Без входа в аккаунт/);
 assert.match(frontend,/data\.source!=="ai"/);
 assert.match(frontend,/nexora-game-idea-draft-v1/);
 assert.doesNotMatch(frontend,/login_required|response\.status===401/);
 assert.doesNotMatch(backend,/if\(!authenticated\)return send\(res,401/);
 assert.match(backend,/activeGameGenerations/);
 assert.match(backend,/used\.filter\(t=>now-t<60000\)\.length>=3/);
 assert.match(backend,/for\(const model of \['auto','alice'\]\)/);
 const route=backend.split('export async function makeCodeGame(')[1].split('export async function prepareGamePreview(')[0];
 assert.doesNotMatch(route,/fallbackGameHTML|arcadeGameHTML|miniGameHTML|blockSandboxHTML/);
});


test('Anonymous Game Studio generates playable HTML directly with the existing Groq server key',async()=>{
 const {createServer}=await import('node:http');
 const {makeCodeGame}=await import('../game-code.js');
 const previousGroq=process.env.GROQ_API_KEY,previousRouter=process.env.OPENROUTER_API_KEY;
 process.env.GROQ_API_KEY='local-test-groq-key';
 delete process.env.OPENROUTER_API_KEY;
 let calls=0;
 const game='<!doctype html><html><head><meta charset="utf-8"><style>canvas{width:100%;background:black}body{margin:0;color:white}</style></head><body><h1>Симулятор фермы</h1><canvas width="720" height="420"></canvas><script>const c=document.querySelector("canvas"),x=c.getContext("2d");let n=0;document.addEventListener("keydown",event=>{n+=event.key==="ArrowLeft"?1:2});function animate(){n++;x.fillStyle="white";x.fillRect(n%700,30,20,20);requestAnimationFrame(animate)}animate();</script></body></html>';
 const mockFetch=async(url,options)=>{
  calls++;
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer local-test-groq-key');
  assert.match(options.body,/ферма с роботами/);
  return new Response(JSON.stringify({choices:[{message:{content:game}}]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const server=createServer((req,res)=>{void makeCodeGame(req,res,{fetchImpl:mockFetch});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({idea:'Космическая ферма с роботами'})
  });
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.source,'ai');
  assert.equal(result.provider,'Groq');
  assert.equal(result.html,game);
  assert.equal(calls,1);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(previousGroq===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=previousGroq;
  if(previousRouter===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previousRouter;
 }
});


test('creation screen animates HTML code into a 3D scene without fake progress and supports reduced motion',async()=>{
 const html=await readFile(join(root,'public/game.html'),'utf8');
 const frontend=await readFile(join(root,'public/game-builder.js'),'utf8');
 for(const token of ['id="ai-loading"','ai-code-editor','ai-voxel','ai-cube-front','ai-cube-back','ai-build-indicator','ai-code-text','@keyframes ai-spin','@keyframes ai-type','prefers-reduced-motion:reduce']){
  assert.ok(html.includes(token),'Missing creation animation: '+token);
 }
 for(const mode of ['auto','2d','3d'])assert.ok(html.includes('data-game-dimension="'+mode+'"'));
 assert.match(html,/data-ai-dimension="3d"/);
 assert.match(frontend,/function setLoader/);
 assert.match(frontend,/setLoader\(true\)/);
 assert.match(frontend,/setLoader\(false\)/);
 assert.match(frontend,/JSON\.stringify\(\{idea:description,dimension\}\)/);
 assert.match(frontend,/localStorage\.getItem\(MODE_KEY\)/);
 assert.match(frontend,/nexora-game-look|3D WebGL-игру/);
 assert.doesNotMatch(frontend,/progress\s*=\s*100|setInterval\(.*progress/i);
 new vm.Script(frontend);
});
test('3D prompts require actual WebGL and all generated games receive touch/keyboard controls',async()=>{
 const {gameCodePrompt,inferGameDimension,isWebGLGame,normalizeGameHTML,sandboxGameHTML}=await import('../game-code.js');
 assert.equal(inferGameDimension('Сделай 3D лабиринт'),'3d');
 assert.equal(inferGameDimension('Вид от первого лица, поворот камеры'),'3d');
 assert.equal(inferGameDimension('Трёхмерный мир с кубами'),'3d');
 assert.equal(inferGameDimension('Ритм-игра'),'auto');
 assert.equal(inferGameDimension('Трёхмерный мир','2d'),'2d');
 const forced=gameCodePrompt('Трёхмерные гонки с камерой',{dimension:'3d'});
 const auto=gameCodePrompt('3D шутер на арене');
 const flat=gameCodePrompt('2D ритм-игра',{dimension:'2d'});
 assert.match(forced,/ОБЯЗАТЕЛЬНО.*WebGL/);
 assert.match(forced,/матриц|перспектив/);
 assert.match(forced,/nexora-game-look/);
 assert.match(auto,/настоящий 3D на WebGL/);
 assert.match(flat,/2D-игру/);
 assert.match(flat,/2D ритм-игра/);
 const webgl='<!doctype html><html><head><meta charset="utf-8"><title>3D</title></head><body><canvas width="720" height="420" style="width:100%"></canvas><script>const c=document.querySelector("canvas");const gl=c.getContext("webgl",{antialias:true});let x=0;document.addEventListener("keydown",e=>{if(e.key==="ArrowLeft")x-=1});document.addEventListener("nexora-game-look",e=>{x+=e.detail.dx});function loop(){if(gl){gl.clearColor(0,0,0.5,1);gl.clear(gl.COLOR_BUFFER_BIT)}requestAnimationFrame(loop)}loop();</script></body></html>';
 assert.equal(isWebGLGame(webgl),true);
 assert.equal(isWebGLGame(webgl.replace('"webgl"','"2d"')),false);
 assert.ok(normalizeGameHTML(webgl));
 const html=sandboxGameHTML(webgl);
 assert.match(html,/nexora-game-look/);
 assert.match(html,/touchstart/);
 assert.match(html,/touchmove/);
 assert.match(html,/touchend/);
 assert.match(html,/nexora-game-control/);
 assert.match(html,/nexora-game-error/);
 assert.match(html,/webglcontextcreationerror/);
 assert.match(html,/connect-src 'none'/);
 const adapter=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(adapter);
 new vm.Script(adapter);
});
test('anonymous 3D game request forwards dimension and returns WebGL rather than a 2D fallback',async()=>{
 const {createServer}=await import('node:http');
 const {makeCodeGame}=await import('../game-code.js');
 const priorGroq=process.env.GROQ_API_KEY,priorRouter=process.env.OPENROUTER_API_KEY;
 process.env.GROQ_API_KEY='3d-test-token';delete process.env.OPENROUTER_API_KEY;
 const output='<!doctype html><html><head><meta charset="utf-8"><title>3D</title></head><body><canvas width="720" height="420" style="width:100%"></canvas><script>const c=document.querySelector("canvas");const gl=c.getContext("webgl",{antialias:true});const keys=new Set();document.addEventListener("keydown",e=>keys.add(e.key));document.addEventListener("keyup",e=>keys.delete(e.key));document.addEventListener("nexora-game-look",e=>{window.lookDX=e.detail.dx});function run(){if(gl){gl.clearColor(0.1,0.2,0.4,1);gl.clear(gl.COLOR_BUFFER_BIT)}requestAnimationFrame(run)}run();</script></body></html>';
 let prompt='';
 const mock=async(url,options)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  const payload=JSON.parse(options.body);
  prompt=payload.messages[1].content;
  return new Response(JSON.stringify({choices:[{message:{content:output}}]}),{status:200});
 };
 const server=createServer((req,res)=>void makeCodeGame(req,res,{fetchImpl:mock}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({idea:'3D лабиринт с ловушками',dimension:'3d'})
  });
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.dimension,'3d');
  assert.equal(data.source,'ai');
  assert.equal(data.provider,'Groq');
  assert.equal(data.html,output);
  assert.match(prompt,/ОБЯЗАТЕЛЬНО.*WebGL/);
  assert.match(prompt,/3D лабиринт с ловушками/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(priorGroq===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=priorGroq;
  if(priorRouter===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=priorRouter;
 }
});


test('public Game Studio prioritizes the dedicated free coding model over random OpenRouter routing',async()=>{
 const {createServer}=await import('node:http');
 const {makeCodeGame}=await import('../game-code.js');
 const priorRouter=process.env.OPENROUTER_API_KEY,priorGroq=process.env.GROQ_API_KEY;
 const priorGameModel=process.env.GAME_OPENROUTER_MODEL;
 process.env.OPENROUTER_API_KEY='testing-only-openrouter-key';delete process.env.GROQ_API_KEY;
 delete process.env.GAME_OPENROUTER_MODEL;
 let observed=null;
 const html='<!doctype html><html><head><meta charset="utf-8"><title>Mini game</title></head><body><canvas width="720" height="420"></canvas><script>const canvas=document.querySelector("canvas"),ctx=canvas.getContext("2d");let x=20;document.addEventListener("keydown",e=>{if(e.key==="ArrowRight")x+=10});function frame(){ctx.fillStyle="#fff";ctx.fillRect(x,20,20,20);requestAnimationFrame(frame)}frame();</script></body></html>';
 const mock=async(url,options)=>{
  observed=JSON.parse(options.body);
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer testing-only-openrouter-key');
  return new Response(JSON.stringify({choices:[{message:{content:html}}]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const server=createServer((req,res)=>void makeCodeGame(req,res,{fetchImpl:mock}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({idea:'Игра про мяч и лабиринт'})
  });
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.ok,true);
  assert.equal(data.source,'ai');
  assert.equal(data.provider,'OpenRouter Code');
  assert.equal(data.html,html);
  assert.equal(observed.model,'cohere/north-mini-code:free');
  assert.equal(observed.messages[0].role,'system');
  assert.match(observed.messages[1].content,/ЗАПРОС ПОЛЬЗОВАТЕЛЯ: Игра про мяч и лабиринт/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(priorRouter===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=priorRouter;
  if(priorGroq===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=priorGroq;
  if(priorGameModel===undefined)delete process.env.GAME_OPENROUTER_MODEL;else process.env.GAME_OPENROUTER_MODEL=priorGameModel;
 }
});
