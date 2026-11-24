import crypto from 'node:crypto';
import {Script} from 'node:vm';
import {arcadeGameHTML} from './game-arcade.js';
import {miniGameHTML} from './game-mini.js';
import {blockSandboxHTML} from './game-block-world.js';

// Never execute AI output in NEXORA's own document. The frontend sandbox has
// scripts enabled, but no same-origin, network, forms, or parent navigation.
const recent=new Map();
const previews=new Map();
// Anonymous game creation is public, so bound server-side model spending.
const MAX_CONCURRENT_GAMES=3;
let activeGameGenerations=0;
const API_URL=(process.env.PROJECT_GENERATOR_URL||'https://vse-proekty-ian.onrender.com').replace(/\/+$/,'');
function send(res,status,data){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(data));
}
export function gameFamily(idea){
 const s=String(idea||'').toLowerCase();
 if(/майнкрафт|майнкраф|minecraft|mine\s*craft|выживание.*блок|песочниц.*блок|строить.*блок|копать.*блок/i.test(s))return 'blocks';
 if(/змейк|snake/.test(s))return 'snake';
 if(/флаппи|flappy|птиц|полёт|полет/.test(s))return 'flappy';
 if(/гонк|машин|автомоб|racing/.test(s))return 'racing';
 if(/платформ|марио|прыж|runner|раннер/.test(s))return 'platform';
 if(/пинг.?понг|pong|теннис|ракетк/.test(s))return 'pong';
 if(/арканоид|breakout|кирпич|блоки/.test(s))return 'breakout';
 if(/лабиринт|maze/.test(s))return 'maze';
 if(/шутер|стреля|космос|инопланет|shoot/.test(s))return 'shooter';
 if(/мишен|реакци|попади/.test(s))return 'target';
 return 'catch';
}
export function normalizeGameHTML(text){
 let html=String(text||'').trim().replace(/^\x60{3}(?:html)?\s*/i,'').replace(/\s*\x60{3}\s*$/,'');
 const start=html.search(/<!doctype html>|<html[\s>]/i);
 if(start>0)html=html.slice(start);
 const end=html.toLowerCase().lastIndexOf('</html>');
 if(end>=0)html=html.slice(0,end+7);
 if(html.length<300||html.length>90000)return null;
 if(!/<html[\s>]/i.test(html)||!/<\/html>/i.test(html)||!/<script(?:\s|>)/i.test(html)||!/<\/script>/i.test(html))return null;
 if(/<script\b[^>]*\bsrc\s*=|<iframe\b|<object\b|<embed\b|<base\b|<form\b|<meta[^>]*http-equiv\s*=\s*["']?refresh/i.test(html))return null;
 if(/<script\b[^>]*\btype\s*=\s*["']?module/i.test(html))return null;
 // The iframe CSP blocks connect-src, workers and external loads even when a
 // bundled classic engine contains unreachable fetch() functions.
 if(/https?:\/\//i.test(html))return null;
 return html;
}
// Keyboard bridge for every game (including 3D WebGL games), plus a native
// camera-look gesture for generated 3D games. Touch input stays in the sandbox.
const ADAPTER=String.raw`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
<style>html,body{overscroll-behavior:none}canvas{touch-action:none;-webkit-user-select:none;user-select:none}</style>
<script>
(function(){
 'use strict';
 const dirs={left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',space:' '};
 const keycodes={left:37,right:39,up:38,down:40,space:32};
 const held=new Set();
 function key(dir,kind){
  if(!Object.prototype.hasOwnProperty.call(dirs,dir))return;
  const e=new KeyboardEvent(kind,{key:dirs[dir],code:dir==='space'?'Space':dirs[dir],bubbles:true,cancelable:true});
  try{Object.defineProperty(e,'keyCode',{get:()=>keycodes[dir]});}catch{}
  document.dispatchEvent(e);
 }
 function down(dir){if(!held.has(dir)){held.add(dir);key(dir,'keydown');}}
 function up(dir){if(held.delete(dir))key(dir,'keyup');}
 function tap(dir){down(dir);setTimeout(()=>up(dir),130);}
 const direction=(x,y)=>Math.abs(x)>Math.abs(y)?(x>0?'right':'left'):(y>0?'down':'up');
 let touch=null;
 document.addEventListener('touchstart',e=>{
  if(e.touches.length!==1)return;
  if(e.target.closest&&e.target.closest('button,input,textarea,select,a,[role=button]'))return;
  const t=e.touches[0];
  touch={id:t.identifier,x:t.clientX,y:t.clientY,px:t.clientX,py:t.clientY,dir:null};
 },{passive:true,capture:true});
 document.addEventListener('touchmove',e=>{
  if(!touch)return;
  const t=Array.from(e.touches).find(t=>t.identifier===touch.id);
  if(!t)return;
  const dx=t.clientX-touch.x,dy=t.clientY-touch.y;
  const stepX=t.clientX-touch.px,stepY=t.clientY-touch.py;
  touch.px=t.clientX;touch.py=t.clientY;
  if(Math.max(Math.abs(dx),Math.abs(dy))<24&&!touch.dir)return;
  // First-person WebGL games can listen to the camera-drag deltas.
  document.dispatchEvent(new CustomEvent('nexora-game-look',{detail:{dx:stepX,dy:stepY}}));
  const dir=direction(dx,dy);
  if(touch.dir!==dir){if(touch.dir)up(touch.dir);down(dir);touch.dir=dir;}
  e.preventDefault();
 },{passive:false,capture:true});
 function finishTouch(e){
  if(!touch)return;
  const ended=Array.from(e.changedTouches).some(t=>t.identifier===touch.id);
  if(!ended)return;
  const dir=touch.dir;touch=null;
  if(dir)setTimeout(()=>up(dir),100);
 }
 document.addEventListener('touchend',finishTouch,{passive:true,capture:true});
 document.addEventListener('touchcancel',finishTouch,{passive:true,capture:true});
 function release(){for(const dir of Array.from(held))up(dir);touch=null;}
 window.addEventListener('blur',release);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 window.addEventListener('message',e=>{
  const p=e.data;
  if(!p||p.type!=='nexora-game-control'||!Object.prototype.hasOwnProperty.call(dirs,p.direction))return;
  if(p.action==='up')up(p.direction);
  else if(p.action==='down')down(p.direction);
  else if(p.action==='tap')tap(p.direction);
 });
})();
</script>`;
export function sandboxGameHTML(source){
 const html=normalizeGameHTML(source);
 if(!html)throw Error('HTML игры повреждён. Проверьте код.');
 if(/<head[\s>]/i.test(html))return html.replace(/<head([\s>])/i,(all,after)=>'<head'+after+ADAPTER);
 return html.replace(/<html([\s>])/i,(all,after)=>'<html'+after+'<head>'+ADAPTER+'</head>');
}
export async function fallbackGameHTML(idea){
 const family=gameFamily(idea);
 if(family==='blocks')return blockSandboxHTML(idea);
 if(['snake','target','catch'].includes(family))return miniGameHTML(idea,family);
 return arcadeGameHTML(idea,family);
}
// The main creator is intentionally NOT routed through gameFamily(): the
// user's free-form request determines the mechanics. Preset engines remain
// available only in the separate "classic games" UI.
export function gameCodePrompt(idea,{dimension='auto'}={}){
 const view=dimension==='3d'
  ?'ОБЯЗАТЕЛЬНО создай настоящий интерактивный 3D-мир на WebGL (canvas.getContext("webgl") либо "webgl2") с шейдерами, матрицами проекции/камерой, геометрией, сценой и освещением/цветами. Реализуй движение героя и поворот камеры. Никаких имитаций 3D картинкой или CSS: нужен WebGL-рендер.'
  :dimension==='2d'
   ?'Создай именно 2D-игру на canvas 2D или HTML/CSS, не имитируй 3D.'
   :'Определи по пользовательскому запросу, нужна ли 2D или 3D игра. Если пользователь просит 3D, вид от первого лица, объёмный мир или трёхмерную камеру — сделай настоящий 3D на WebGL. Иначе создай подходящую 2D-игру.';
 return [view,
  'Ты опытный разработчик HTML5-игр. Твоя задача — самостоятельно проанализировать ЛЮБОЕ название игры или свободное описание пользователя и НАПИСАТЬ РАБОТАЮЩУЮ ИГРУ, соответствующую именно его идее.',
  'Сначала определяй из запроса жанр, главную механику, цель, действия игрока, препятствия, правила победы или поражения, управление, оформление. Это внутренняя работа: не выводи анализ вместо кода.',
  'Если указано только известное название, создай самостоятельную небольшую оригинальную браузерную игру с узнаваемой базовой механикой; не копируй чужие изображения, тексты или логотипы. Если указана необычная механика — реализуй её, а не подменяй одной из стандартных игр.',
  'Не привязывайся к готовым категориям NEXORA. Допустимы любые подходящие для браузера жанры: головоломки, платформеры, исследования, гонки, ритм, карточные игры, защита башен, симуляторы, приключения, логические и собственные идеи.',
  'Верни ТОЛЬКО ПОЛНЫЙ HTML-документ от <!doctype html> до </html>, БЕЗ markdown, без пояснений и без фрагментов. Весь код HTML/CSS/JavaScript находится в одном файле; НЕ используй внешние библиотеки, CDN, URL, картинки, API, fetch, iframe, модули и внешние файлы.',
  'Пиши компактно, но законченную игру в одном HTML-файле, по возможности до 14000 символов (3D WebGL может потребовать больше). Нужны настоящие игровые действия, игровое состояние, визуальный процесс, цель и прогресс, кнопка «Заново». Не делай макет или неподвижную демонстрацию.',
  'Для анимации используй requestAnimationFrame. Для 2D — canvas 2D или DOM; для настоящего 3D — WebGL/WebGL2 со встроенными шейдерами GLSL и матрицей перспективы/камерой (без библиотек). Для canvas ширина 720 высота 420, CSS width:100%; поддерживай экраны телефонов и viewport. Без внешнего доступа в сеть.',
  'На ВСЕХ играх сделай мобильное управление. Слушай document.addEventListener("keydown"/"keyup") со стрелками и WASD; для действия используй пробел и/или pointerdown на canvas. NEXORA переводит свайпы и экранные кнопки в стрелки и пробел. Для 3D-поворота камеры дополнительно слушай document.addEventListener("nexora-game-look",e=>{const {dx,dy}=e.detail; ...}) и меняй yaw/pitch, ограничивая угол pitch. Для игр с тапами сделай касания целей. Не зависни без управления на телефоне.',
  'Показывай короткую инструкцию, понятные элементы интерфейса, хорошие контрастные цвета. Язык игры — русский. Если запрос можно выполнить только в ограниченной 2D-версии, реализуй наиболее важную механику, не выдавай её за полноценную коммерческую игру.',
  'ЗАПРОС ПОЛЬЗОВАТЕЛЯ: '+idea
 ].join('\n');
}
export function isWebGLGame(html){
 return /<canvas[\\s>]/i.test(html)&&/getContext\\s*\\(\\s*['"](?:webgl2?|experimental-webgl)['"]/i.test(html);
}
function playableGameHTML(response){
 const html=normalizeGameHTML(response);
 if(!html||html.length>52000)return null;
 // Syntax-check AI scripts without running them. A broken script must not
 // be presented as a playable game.
 const scripts=[...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(match=>match[1]);
 if(!scripts.length||scripts.every(body=>body.trim().length<160))return null;
 const code=scripts.join('\n');
 if(!/(requestAnimationFrame|setInterval|addEventListener|onkeydown|onpointerdown|onclick|ontouchstart)/i.test(code))return null;
 try{for(const body of scripts)new Script(body,{filename:'generated-game.js'});}
 catch{return null;}
 return html;
}
function gameTextProviders(){
 // Reuse NEXORA's existing server-only providers; never send their keys to the browser.
 const providers=[];
 if(process.env.GROQ_API_KEY?.trim())providers.push({
  name:'Groq',key:process.env.GROQ_API_KEY.trim(),
  url:'https://api.groq.com/openai/v1/chat/completions',
  model:process.env.GAME_GROQ_MODEL||process.env.ARGOSHA_GROQ_MODEL||'openai/gpt-oss-20b'
 });
 if(process.env.OPENROUTER_API_KEY?.trim())providers.push({
  name:'OpenRouter',key:process.env.OPENROUTER_API_KEY.trim(),
  url:'https://openrouter.ai/api/v1/chat/completions',
  model:process.env.GAME_OPENROUTER_MODEL||process.env.ARGOSHA_OPENROUTER_MODEL||'openrouter/free'
 });
 if(process.env.OPENROUTER_API_KEY?.trim()){
  const backup=process.env.GAME_OPENROUTER_FALLBACK_MODEL||process.env.ARGOSHA_OPENROUTER_FALLBACK_MODEL||'google/gemma-4-26b-a4b-it:free';
  if(!providers.some(p=>p.url==='https://openrouter.ai/api/v1/chat/completions'&&p.model===backup))
   providers.push({name:'OpenRouter backup',key:process.env.OPENROUTER_API_KEY.trim(),
    url:'https://openrouter.ai/api/v1/chat/completions',model:backup});
 }
 return providers;
}
async function requestDirectGameProvider(provider,prompt,timeout,fetchImpl,dimension='auto'){
 const response=await fetchImpl(provider.url,{
  method:'POST',
  headers:{'Content-Type':'application/json','Authorization':'Bearer '+provider.key,'X-Title':'NEXORA Game Studio'},
  body:JSON.stringify({
   model:provider.model,temperature:0.3,max_tokens:8192,
   messages:[
    {role:'system',content:'Ты профессиональный разработчик самостоятельных HTML5-игр. Отвечай только полноценным HTML-файлом с рабочим игровым кодом.'},
    {role:'user',content:prompt}
   ]
  }),
  signal:AbortSignal.timeout(timeout)
 });
 if(!response.ok)throw Error('AI HTTP '+response.status);
 const data=await response.json().catch(()=>null);
 const content=data?.choices?.[0]?.message?.content;
 const answer=typeof content==='string'?content:Array.isArray(content)?content.map(x=>x.text||'').join(''):'';
 const html=playableGameHTML(answer);
 if(!html)throw Error('invalid_game_html');
 if(dimension==='3d'&&!isWebGLGame(html))throw Error('not_webgl_3d');
 return {html,provider:provider.name};
}
async function generateWithAI(idea,secret,{fetchImpl=fetch,dimension='auto'}={}){
 const prompt=gameCodePrompt(idea,{dimension});
 const deadline=Date.now()+65000;
 const direct=gameTextProviders();
 // Local providers can bypass a sleeping or unresponsive remote generator.
 // Leave time for the protected central model gateway as a fallback.
 for(const provider of direct){
  const remaining=deadline-Date.now();
  if(remaining<9500)break;
  const allowance=Math.min(direct.length>1?18500:29000,remaining-7000);
  try{return await requestDirectGameProvider(provider,prompt,allowance,fetchImpl,dimension);}
  catch(error){
   const detail=/^AI HTTP [0-9]{3}$/.test(error.message||'')?error.message
     :['invalid_game_html','not_webgl_3d'].includes(error.message)?error.message:error.name||'error';
   console.warn('[game-code] Direct text provider failed:',provider.name,detail);
  }
 }
 if(secret.length>=32){
  for(const model of ['auto','alice']){
   const remaining=deadline-Date.now();
   if(remaining<5000)break;
   try{
    const response=await fetchImpl(API_URL+'/api/nexora-chat/internal',{
     method:'POST',
     headers:{'Content-Type':'application/json','X-NEXORA-Chat-Token':secret},
     body:JSON.stringify({model,messages:[{role:'user',content:prompt}]}),
     signal:AbortSignal.timeout(Math.min(60000,remaining-750))
    });
    if(!response.ok){console.warn('[game-code] Game provider gateway unavailable:',response.status);continue;}
    const result=await response.json().catch(()=>null);
    const html=playableGameHTML(result?.answer);
    if(html&&(dimension!=='3d'||isWebGLGame(html)))return {html,provider:String(result.provider||'NEXORA AI').slice(0,70)};
    console.warn('[game-code] Model response is not a complete playable HTML game');
   }catch(error){console.warn('[game-code] Generation gateway attempt failed:',error.name||'error');}
  }
 }
 const err=new Error(
  direct.length||secret.length>=32
   ?'ИИ-провайдеры сейчас не смогли написать игру. Попробуйте ещё раз или опишите механику проще.'
   :'Ни один ИИ-провайдер не настроен на сервере Game Studio.'
 );
 err.status=503;throw err;
}

async function parseBody(req){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('Ожидался JSON.');
 let total=0;const chunks=[];
 for await(const chunk of req){total+=chunk.length;if(total>5000)throw Error('Описание слишком длинное.');chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
export async function makeCodeGame(req,res,{fetchImpl=fetch}={}){
 let input;
 try{input=await parseBody(req);}catch(error){return send(res,400,{ok:false,message:error.message||'Неверный запрос.'});}
 const idea=typeof input.idea==='string'?input.idea.trim():'';
 const dimension=['auto','2d','3d'].includes(input.dimension)?input.dimension:'auto';
 if(idea.length<2||idea.length>500)return send(res,400,{ok:false,message:'Введите название или описание игры: от 2 до 500 символов.'});
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim().slice(0,85);
 const now=Date.now(),used=(recent.get(ip)||[]).filter(t=>now-t<3600000);
 if(used.length>=12)return send(res,429,{ok:false,message:'Лимит — 12 генераций игр в час. Попробуйте позже.'});
 if(used.filter(t=>now-t<60000).length>=3)
  return send(res,429,{ok:false,message:'Подождите минуту перед следующей генерацией игры.'});
 if(activeGameGenerations>=MAX_CONCURRENT_GAMES)
  return send(res,503,{ok:false,error:'server_busy',message:'Сейчас создаётся много игр. Попробуйте немного позже.'});
 used.push(now);recent.set(ip,used);
 if(recent.size>2000)for(const [key,times] of recent)if(times.every(t=>now-t>3600000))recent.delete(key);
 activeGameGenerations++;
 try{
  const result=await generateWithAI(idea,(process.env.NEXORA_CHAT_INTERNAL_TOKEN||'').trim(),{fetchImpl,dimension});
  if(dimension==='3d'&&!isWebGLGame(result.html))throw Object.assign(new Error('Модель вернула не 3D-код. Попробуйте создать 3D-игру ещё раз.'),{status:503});
  return send(res,200,{ok:true,html:result.html,title:idea.slice(0,75),source:'ai',provider:result.provider,dimension});
 }catch(error){
  const status=error.status===503?503:502;
  console.warn('[game-code] No AI game delivered:',error.name||'error');
  return send(res,status,{ok:false,error:'generation_unavailable',message:error.status===503?error.message:'ИИ не удалось завершить создание игры. Попробуйте ещё раз.'});
 }finally{
  activeGameGenerations--;
 }
}

export async function prepareGamePreview(req,res){
 let total=0;const parts=[];
 if(!String(req.headers['content-type']||'').startsWith('application/json'))
  return send(res,415,{ok:false,message:'Ожидается JSON.'});
 try{
  for await(const chunk of req){total+=chunk.length;if(total>100000)throw Error('Слишком большой файл игры.');parts.push(chunk);}
  const body=JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');
  const html=sandboxGameHTML(body.html);
  const id=crypto.randomUUID();
  previews.set(id,{html,createdAt:Date.now()});
  if(previews.size>250){
    for(const [token,entry] of previews)if(Date.now()-entry.createdAt>1800000)previews.delete(token);
    while(previews.size>250)previews.delete(previews.keys().next().value);
  }
  return send(res,200,{ok:true,url:'/game/preview/'+id,html});
 }catch(error){return send(res,400,{ok:false,message:error.message||'Ошибка в HTML-коде игры.'});}
}

export function serveGamePreview(res,token){
 if(!/^[a-f0-9-]{36}$/.test(token))return send(res,404,{error:'not_found'});
 const entry=previews.get(token);
 if(!entry||Date.now()-entry.createdAt>1800000){
  previews.delete(token);return send(res,404,{error:'expired_preview'});
 }
 res.writeHead(200,{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
 });
 res.end(entry.html);
}
