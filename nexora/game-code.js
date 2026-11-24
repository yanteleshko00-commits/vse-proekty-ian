import crypto from 'node:crypto';
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
const ADAPTER=[
'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src \'none\'; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; form-action \'none\'; base-uri \'none\'">',
'<style>html,body{overscroll-behavior:none}canvas{touch-action:none;-webkit-user-select:none;user-select:none}</style>',
'<script>',
'(function(){',
'const dirs={left:"ArrowLeft",right:"ArrowRight",up:"ArrowUp",down:"ArrowDown",space:" "};',
'const keycodes={left:37,right:39,up:38,down:40,space:32};',
'function press(dir,kind){',
' if(!Object.prototype.hasOwnProperty.call(dirs,dir))return;',
' const e=new KeyboardEvent(kind,{key:dirs[dir],code:dir==="space"?"Space":dirs[dir],bubbles:true,cancelable:true});',
' try{Object.defineProperty(e,"keyCode",{get:()=>keycodes[dir]})}catch{}',
' document.dispatchEvent(e);',
'}',
'let start=null;',
'document.addEventListener("touchstart",e=>{if(e.touches.length===1)start={x:e.touches[0].clientX,y:e.touches[0].clientY}},{capture:true,passive:true});',
'document.addEventListener("touchend",e=>{',
' if(!start||!e.changedTouches.length)return;',
' const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;start=null;',
' if(Math.max(Math.abs(dx),Math.abs(dy))<27)return;',
' const dir=Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up");',
' press(dir,"keydown");setTimeout(()=>press(dir,"keyup"),140);e.preventDefault();',
'},{capture:true,passive:false});',
'addEventListener("message",e=>{',
' const p=e.data;if(!p||p.type!=="nexora-game-control"||!Object.prototype.hasOwnProperty.call(dirs,p.direction))return;',
' if(p.action==="up")press(p.direction,"keyup");',
' else if(p.action==="down")press(p.direction,"keydown");',
' else if(p.action==="tap"){press(p.direction,"keydown");setTimeout(()=>press(p.direction,"keyup"),140)}',
'});',
'})();',
'</script>'
].join('\n');
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
export function gameCodePrompt(idea){
 return [
  'Ты опытный разработчик HTML5-игр. Твоя задача — самостоятельно проанализировать ЛЮБОЕ название игры или свободное описание пользователя и НАПИСАТЬ РАБОТАЮЩУЮ ИГРУ, соответствующую именно его идее.',
  'Сначала определяй из запроса жанр, главную механику, цель, действия игрока, препятствия, правила победы или поражения, управление, оформление. Это внутренняя работа: не выводи анализ вместо кода.',
  'Если указано только известное название, создай самостоятельную небольшую оригинальную 2D-игру с узнаваемой базовой механикой; не копируй чужие изображения, тексты или логотипы. Если указана необычная механика — реализуй её, а не подменяй одной из стандартных игр.',
  'Не привязывайся к готовым категориям NEXORA. Допустимы любые подходящие для браузера жанры: головоломки, платформеры, исследования, гонки, ритм, карточные игры, защита башен, симуляторы, приключения, логические и собственные идеи.',
  'Верни ТОЛЬКО ПОЛНЫЙ HTML-документ от <!doctype html> до </html>, БЕЗ markdown, без пояснений и без фрагментов. Весь код HTML/CSS/JavaScript находится в одном файле; НЕ используй внешние библиотеки, CDN, URL, картинки, API, fetch, iframe, модули и внешние файлы.',
  'Максимум 8500 символов HTML. Пиши компактно, но законченную игру. В браузере должны быть настоящие игровые действия, состояние игры, визуальный процесс, цель, столкновения/проверка правил (где уместно), очки либо прогресс, кнопка «Заново». Не делай макет или неподвижную демонстрацию.',
  'Для анимации используй requestAnimationFrame и canvas или DOM, если DOM лучше подходит механике. Для canvas устанавливай width=720 height=420 и CSS width:100%; для экранов телефонов используй viewport и адаптивные размеры. Без внешнего доступа в сеть.',
  'Для игр с направлением движения слушай document.addEventListener("keydown"/"keyup") со стрелками ArrowLeft, ArrowRight, ArrowUp, ArrowDown и по возможности WASD; для действия используй пробел и/или нажатие на игровую область. Система NEXORA преобразует свайпы в клавиши стрелок. Если игра управляется тапами, сделай тап-управление.',
  'Показывай короткую инструкцию, понятные элементы интерфейса, хорошие контрастные цвета. Язык игры — русский. Если запрос можно выполнить только в ограниченной 2D-версии, реализуй наиболее важную механику, не выдавай её за полноценную коммерческую игру.',
  'ЗАПРОС ПОЛЬЗОВАТЕЛЯ: '+idea
 ].join('\n');
}
function playableGameHTML(response){
 const html=normalizeGameHTML(response);
 if(!html||html.length>16500)return null;
 // A complete script and genuine user interaction / loop are required.
 const body=html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1]||'';
 if(body.length<160)return null;
 if(!/(requestAnimationFrame|setInterval|addEventListener|onkeydown|onpointerdown|onclick|ontouchstart)/i.test(body))return null;
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
 return providers;
}
async function requestDirectGameProvider(provider,prompt,timeout,fetchImpl){
 const response=await fetchImpl(provider.url,{
  method:'POST',
  headers:{'Content-Type':'application/json','Authorization':'Bearer '+provider.key,'X-Title':'NEXORA Game Studio'},
  body:JSON.stringify({
   model:provider.model,temperature:0.35,max_tokens:6900,
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
 if(!html)throw Error('Model did not return a complete playable game');
 return {html,provider:provider.name};
}
async function generateWithAI(idea,secret,{fetchImpl=fetch}={}){
 const prompt=gameCodePrompt(idea);
 const deadline=Date.now()+65000;
 const direct=gameTextProviders();
 // Local providers can bypass a sleeping or unresponsive remote generator.
 // Leave time for the protected central model gateway as a fallback.
 for(const provider of direct){
  const remaining=deadline-Date.now();
  if(remaining<9500)break;
  const allowance=Math.min(direct.length>1?22000:29000,remaining-7000);
  try{return await requestDirectGameProvider(provider,prompt,allowance,fetchImpl);}
  catch(error){console.warn('[game-code] Direct text provider failed:',provider.name,error.name||'error');}
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
    if(html)return {html,provider:String(result.provider||'NEXORA AI').slice(0,70)};
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
  const result=await generateWithAI(idea,(process.env.NEXORA_CHAT_INTERNAL_TOKEN||'').trim(),{fetchImpl});
  return send(res,200,{ok:true,html:result.html,title:idea.slice(0,75),source:'ai',provider:result.provider});
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
