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
