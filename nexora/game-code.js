import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {basicGamePlan,gameType} from './game-studio.js';

// Never execute AI output in NEXORA's own document. The frontend sandbox has
// scripts enabled, but no same-origin, network, forms, or parent navigation.
const here=fileURLToPath(new URL('.',import.meta.url));
const recent=new Map();
const API_URL=(process.env.PROJECT_GENERATOR_URL||'https://vse-proekty-ian.onrender.com').replace(/\/+$/,'');
function send(res,status,data){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(data));
}
export function gameFamily(idea){
 const s=String(idea||'').toLowerCase();
 if(/змейк|snake/.test(s))return 'snake';
 if(/флаппи|flappy|птиц|полёт|полет/.test(s))return 'flappy';
 if(/гонк|машин|автомоб|racing/.test(s))return 'racing';
 if(/платформ|марио|прыж|runner|раннер/.test(s))return 'platform';
 if(/пинг.?понг|pong|теннис|ракетк/.test(s))return 'pong';
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
 if(html.length<300||html.length>16500)return null;
 if(!/<html[\s>]/i.test(html)||!/<\/html>/i.test(html)||!/<script(?:\s|>)/i.test(html)||!/<\/script>/i.test(html))return null;
 if(/<script\b[^>]*\bsrc\s*=|<iframe\b|<object\b|<embed\b|<base\b|<form\b|<meta[^>]*http-equiv\s*=\s*["']?refresh/i.test(html))return null;
 if(/<script\b[^>]*\btype\s*=\s*["']?module/i.test(html))return null;
 if(/https?:\/\/|(?:fetch|XMLHttpRequest|WebSocket|Worker)\s*\(/i.test(html))return null;
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
' const e=new KeyboardEvent(kind,{key:dirs[dir],code:dirs[dir],bubbles:true,cancelable:true});',
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
 const plan=basicGamePlan({idea,type:gameType(idea)});
 const [html,js]=await Promise.all([
  readFile(join(here,'public/game.html'),'utf8'),
  readFile(join(here,'public/game.js'),'utf8')
 ]);
 const start=html.indexOf('<script src="/game.js"></script>');
 if(start<0)throw Error('Шаблон игры недоступен.');
 const preset=JSON.stringify(plan).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
 return html.slice(0,start)+'<script>window.__GAME_PRESET__='+preset+';\n'+js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
}
async function generateWithAI(idea,secret){
 if(secret.length<32)return null;
 const prompt=[
  'Создай ИГРАБЕЛЬНУЮ оригинальную мини-игру по запросу. Верни ТОЛЬКО полный HTML (<!doctype html> ... </html>), БЕЗ Markdown.',
  'Код не длиннее 7300 символов. Всё в одном файле: CSS + inline JavaScript + HTML canvas. Никаких библиотек, CDN, загрузок, внешних файлов, ссылок, fetch.',
  'Игра запускается сразу, есть игровое поле, движущиеся предметы/герой, взаимодействие, проверка столкновений, очки и перезапуск. Не отдавай статичный макет.',
  'Canvas шириной 720 и высотой 420, width:100%, touch-action:none; requestAnimationFrame; экран читаемый на телефоне.',
  'Управление через document.addEventListener("keydown"/"keyup") со стрелками ArrowLeft, ArrowRight, ArrowUp, ArrowDown, а также WASD, пробелом.',
  'На мобильном свайпы автоматически конвертируются системой в Arrow-клавиши. По необходимости добавь touch/pointer для прыжка и выстрела.',
  'ВАЖНО: сделай именно механику из описания, не превращай всё в змейку. Из известного названия сделай небольшую оригинальную версию.',
  'Красивый стиль, понятное начало и цель, доступные цвета, интерфейс по-русски.',
  'ОПИСАНИЕ ИГРЫ: '+idea
 ].join('\n');
 const response=await fetch(API_URL+'/api/nexora-chat/internal',{
  method:'POST',headers:{'Content-Type':'application/json','X-NEXORA-Chat-Token':secret},
  body:JSON.stringify({model:'alice',messages:[{role:'user',content:prompt}]}),
  signal:AbortSignal.timeout(56000)
 });
 if(!response.ok)return null;
 const result=await response.json().catch(()=>null);
 const html=normalizeGameHTML(result?.answer);
 return html?{html,provider:String(result.provider||'NEXORA AI').slice(0,70)}:null;
}
async function parseBody(req){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('Ожидался JSON.');
 let total=0;const chunks=[];
 for await(const chunk of req){total+=chunk.length;if(total>5000)throw Error('Описание слишком длинное.');chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
export async function makeCodeGame(req,res,{authenticated=false}={}){
 let input;
 try{input=await parseBody(req);}catch(error){return send(res,400,{ok:false,message:error.message||'Неверный запрос.'});}
 const idea=typeof input.idea==='string'?input.idea.trim():'';
 if(idea.length<2||idea.length>500)return send(res,400,{ok:false,message:'Введите название или описание игры: от 2 до 500 символов.'});
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim().slice(0,85);
 const now=Date.now(),used=(recent.get(ip)||[]).filter(t=>now-t<3600000);
 if(used.length>=12)return send(res,429,{ok:false,message:'Не более 12 игр в час. Повторите позже.'});
 used.push(now);recent.set(ip,used);
 if(recent.size>2000)for(const [key,times] of recent)if(times.every(t=>now-t>3600000))recent.delete(key);
 let result=null;
 if(authenticated)try{result=await generateWithAI(idea,(process.env.NEXORA_CHAT_INTERNAL_TOKEN||'').trim());}
 catch(error){console.warn('[game-code] AI generator unavailable:',error.name||'error');}
 if(result)return send(res,200,{ok:true,html:result.html,title:idea.slice(0,75),source:'ai',provider:result.provider,family:gameFamily(idea)});
 const html=await fallbackGameHTML(idea);
 return send(res,200,{ok:true,html,title:idea.slice(0,75),source:'template',provider:'NEXORA Game Engine',
  family:gameFamily(idea),message:authenticated?'ИИ не смог создать новый код. Запущена готовая мини-игра; код можно редактировать.':'Готовый игровой шаблон. Войдите в NEXORA ID, чтобы создавать новые игры с помощью ИИ.'});
}
