import crypto from 'node:crypto';
import { persistentAdminAttempt } from './admin-throttle.js';
import {deepSeekUsage} from './deepseek-quality.js';
import {readFile} from 'node:fs/promises';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function decodeSecret(value){
 const s=String(value||'').toUpperCase().replace(/[\s-]/g,'').replace(/=+$/,'');
 if(!/^[A-Z2-7]{32,128}$/.test(s))return null;
 let n=0,bits=0,out=[];for(const c of s){n=(n<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){bits-=8;out.push((n>>bits)&255);}}return Buffer.from(out);
}
export function totp(key,step){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step));const h=crypto.createHmac('sha1',key).update(b).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0');}
const sessions=new Map();let lastStep=-1;
const services=[
 ['NEXORA Lobby','https://nexora-lobby.onrender.com','/health'],
 ['NEXORA ID','https://ecosystem-auth-service.onrender.com','/health'],
 ['Image Studio','https://nexora-image-studio.onrender.com','/health'],
 ['Math Studio','https://nexora-math-studio.onrender.com','/'],
 ['Text Studio','https://nexora-text-studio.onrender.com','/'],
 ['Все проекты #Ian','https://vse-proekty-ian.onrender.com','/'],
 ['Все проекты #Ian 2','https://vse-proekty-ian-1.onrender.com','/']
];
let snapshot=null,pending=null;
const maintenancePaths=new Map([['chat',new Set(['/api/nexora-chat'])],['game',new Set(['/api/game/generate','/api/game/code'])]]);
const maintenanceUntil=new Map();
export function activeMaintenance(path,now=Date.now()){for(const [name,paths] of maintenancePaths)if(paths.has(path)&&(maintenanceUntil.get(name)||0)>now)return name;return null;}
function maintenanceState(){return [...maintenancePaths.keys()].map(name=>({name,until:(maintenanceUntil.get(name)||0)>Date.now()?new Date(maintenanceUntil.get(name)).toISOString():null}));}const errors=[],audit=[];
function remember(list,item){list.unshift(item);if(list.length>100)list.pop();}
async function monitor(){
 if(pending)return pending;
 pending=(async()=>{const result=await Promise.all(services.map(async ([name,url,path])=>{
 const start=Date.now();try{const response=await fetch(url+path,{signal:AbortSignal.timeout(65000),redirect:'manual'});await response.body?.cancel();const row={name,url,path,http:response.status,ms:Date.now()-start,status:response.ok?'ok':'http_error'};if(!response.ok)remember(errors,{name,time:new Date().toISOString(),detail:'HTTP '+response.status});return row;}catch(e){remember(errors,{name,time:new Date().toISOString(),detail:e.name});return {name,url,path,status:'unconfirmed',ms:Date.now()-start};}}));snapshot={checkedAt:new Date().toISOString(),services:result};return snapshot;})().finally(()=>{pending=null;});return pending;
}
let started=false;function startMonitor(){if(started)return;started=true;void monitor();const timer=setInterval(()=>void monitor(),600000);timer.unref();}
const cookieName='__Host-nexora_console';
const nonceName='__Host-nexora_login';
function cookieValue(req,name){return String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);}
export function trustedPost(req,base,loginRequest=false){
 const origins=new Set(['https://nexora-lobby.onrender.com']);
 for(const value of [base,process.env.RENDER_EXTERNAL_URL]){try{if(value)origins.add(new URL(value).origin);}catch{}}
 const origin=req.headers.origin,site=req.headers['sec-fetch-site'];
 if(site==='cross-site')return false;
 if(origin&&origin!=='null')return origins.has(origin);
 if(req.headers.referer){try{return origins.has(new URL(req.headers.referer).origin);}catch{return false;}}
 // Safari may omit Origin or send null on a form navigation. Login still requires
 // a matching host-only CSRF nonce and the current TOTP; other POSTs fail closed.
 return loginRequest||site==='same-origin';
}
export function validLoginNonce(req,nonce){
 const expected=cookieValue(req,nonceName);
 return /^[a-f0-9]{64}$/.test(expected||'')&&/^[a-f0-9]{64}$/.test(nonce||'')&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(nonce));
}
function session(req){const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));const token=raw?.slice(cookieName.length+1);const issued=token&&sessions.get(token);if(!issued||Date.now()-issued>8*3600000){if(token)sessions.delete(token);return null;}return token;}
function setCookie(token){return cookieName+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+(token?28800:0);}

async function body(req){let size=0,parts=[];for await(const c of req){size+=c.length;if(size>8192)throw Error('body');parts.push(c);}return Buffer.concat(parts).toString('utf8');}
const headers={'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; img-src 'self'; manifest-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
function login(message='',nonce=''){return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXORA Security</title><link rel="icon" href="/nexora-mark.svg?v=2" type="image/svg+xml"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2"><link rel="manifest" href="/nexora-admin.webmanifest"><style>*{box-sizing:border-box}body{background:#101112;color:#fff;font:16px system-ui;margin:0;padding:20px}main{max-width:420px;margin:12vh auto;background:#18191c;border:1px solid #343638;border-radius:24px;padding:24px}h1{font-size:28px}p{color:#aaa;line-height:1.5}input,button{width:100%;padding:15px;border-radius:12px;font:inherit;margin:10px 0}input{background:#111;color:white;border:1px solid #666;text-align:center;letter-spacing:8px;font-size:26px}button{background:#caff9d;border:0;color:#14210e;font-weight:700}</style><main><img src="/nexora-mark.svg?v=2" alt="NEXORA" width="56" height="56" style="display:block;margin-bottom:18px"><small>NEXORA / SECURITY</small><h1>Вход разработчика</h1><p>Введите шестизначный код из приложения «Пароли» на iPhone. Код меняется каждые 30 секунд.</p><form method="post" action="/developer/login"><input type="hidden" name="csrf" value="'+nonce+'"><label for="code">Код подтверждения</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button>Войти</button></form><p role="status">'+message+'</p></main></html>';}
export async function developerRoute(req,res,url,base,send){
 if(!(url.pathname==='/developer'||url.pathname.startsWith('/developer/')))return false;
 const path=url.pathname,method=req.method,key=decodeSecret(process.env.NEXORA_ADMIN_TOTP_SECRET);
 const json=(status,data)=>send(res,status,JSON.stringify(data),{'Content-Type':'application/json; charset=utf-8'});
 const html=(status,data)=>send(res,status,data,headers);
 const loginPage=(status,message='')=>{const nonce=crypto.randomBytes(32).toString('hex');send(res,status,login(message,nonce),{...headers,'Set-Cookie':nonceName+'='+nonce+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600'});};
 if(method==='POST'&&!trustedPost(req,base,path==='/developer/login')){if(path==='/developer/login')loginPage(403,'Запрос заблокирован. Откройте админку заново в Safari.');else json(403,{error:'forbidden'});return true;}
 if(path==='/developer/login'&&method==='POST'){
 if(!key){loginPage(503,'TOTP ещё не настроен на сервере.');return true;}
 try{if(!await persistentAdminAttempt(req,'totp')){loginPage(429,'Слишком много попыток. Повторите через 15 минут.');return true;}}catch{loginPage(503,'Сервис защиты входа временно недоступен.');return true;}
 let code;try{const form=new URLSearchParams(await body(req));if(!validLoginNonce(req,form.get('csrf'))){loginPage(403,'Форма устарела или браузер заблокировал cookie. Введите новый код на этой странице.');return true;}code=form.get('code');}catch{loginPage(400,'Неверный запрос');return true;}
 const step=Math.floor(Date.now()/30000);
 const match=/^[0-9]{6}$/.test(code||'')?[step,step-1,step+1].find(s=>s>lastStep&&crypto.timingSafeEqual(Buffer.from(code),Buffer.from(totp(key,s)))):undefined;
 if(match===undefined){loginPage(401,'Неверный или уже использованный код.');return true;}
 lastStep=match;const token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now());if(sessions.size>20)sessions.delete(sessions.keys().next().value);
 remember(audit,{name:'Вход администратора',time:new Date().toISOString(),detail:'TOTP'});
 send(res,303,'',{Location:'/developer','Set-Cookie':setCookie(token)});return true;
 }
 const token=key&&session(req);
 if(path==='/developer'&&method==='GET'){if(token){startMonitor();html(200,await readFile(new URL('./developer-console.html',import.meta.url),'utf8'));}else loginPage(200,key?'':'TOTP ещё не настроен на сервере.');return true;}
 if(!token){json(401,{error:'unauthorized'});return true;}
 if(path==='/developer/logout'&&method==='POST'){sessions.delete(token);send(res,303,'',{Location:'/developer','Set-Cookie':setCookie('')});return true;}
 if(path==='/developer/api/history'&&method==='GET'){
 const secret=String(process.env.NEXORA_CONSOLE_SECRET||'');
 if(secret.length<32){json(503,{error:'API NEXORA ID не настроен'});return true;}
 try{const response=await fetch('https://ecosystem-auth-service.onrender.com/v1/console/usage-history',{headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000),redirect:'error'});if(!response.ok){json(response.status,{error:'История NEXORA ID недоступна: HTTP '+response.status});return true;}json(200,await response.json());}catch{json(502,{error:'NEXORA ID не ответил'});}return true;
 }
 if(path==='/developer/api/maintenance'&&method==='GET'){json(200,{items:maintenanceState(),scope:'current_lobby_process'});return true;}
 if(path==='/developer/api/maintenance'&&method==='POST'){
 try{const data=JSON.parse(await body(req));if(!maintenancePaths.has(data.name)||!Number.isInteger(data.minutes)||data.minutes<0||data.minutes>120){json(400,{error:'invalid_request'});return true;}if(data.minutes===0)maintenanceUntil.delete(data.name);else maintenanceUntil.set(data.name,Date.now()+data.minutes*60000);
 remember(audit,{name:'Техническое обслуживание',time:new Date().toISOString(),detail:data.name+': '+(data.minutes?data.minutes+' мин':'выключено')});json(200,{items:maintenanceState()});}catch{json(400,{error:'invalid_request'});}return true;
 }
 if(path==='/developer/api/owner'&&method==='GET'){
 const usage=deepSeekUsage();
 const providers=Object.fromEntries(Object.entries({DeepSeek:['DEEPSEEK_API_KEY'],OpenAI:['OPENAI_API_KEY'],Gemini:['GEMINI_API_KEY'],Groq:['GROQ_API_KEY'],OpenRouter:['OPENROUTER_API_KEY'],Yandex:['YANDEX_API_KEY','YANDEX_FOLDER_ID']}).map(([name,keys])=>[name,keys.every(k=>Boolean(process.env[k]))]));
 json(200,{usage,providers,scope:'current_lobby_process',sessions:[...sessions.entries()].map(([id,created])=>({current:id===token,createdAt:new Date(created).toISOString()})),authApiConfigured:String(process.env.NEXORA_CONSOLE_SECRET||'').length>=32});return true;
 }
 if(path==='/developer/api/revoke-sessions'&&method==='POST'){
 const count=sessions.size-1;for(const id of sessions.keys())if(id!==token)sessions.delete(id);
 remember(audit,{name:'Безопасность',time:new Date().toISOString(),detail:'Отозвано других сессий: '+count});
 json(200,{revoked:count});return true;
 }
 if(path==='/developer/api/status'&&method==='GET'){startMonitor();json(200,{snapshot,errors,audit});return true;}
 if(path==='/developer/api/refresh'&&method==='POST'){if(!snapshot||Date.now()-Date.parse(snapshot.checkedAt)>30000)void monitor();json(202,{ok:true});return true;}
 if(path==='/developer/api/users'&&['GET','POST'].includes(method)){
 const secret=String(process.env.NEXORA_CONSOLE_SECRET||'');if(secret.length<32){json(503,{error:'API NEXORA ID не настроен'});return true;}
 try{const options={method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),redirect:'error'};
 if(method==='POST'){const data=JSON.parse(await body(req));if(!/^[0-9a-f-]{36}$/i.test(data.id||'')||!['ban','unban','subscribe','revoke'].includes(data.action)){json(400,{error:'invalid_request'});return true;}options.body=JSON.stringify({id:data.id,action:data.action,until:data.until});}
 const response=await fetch('https://ecosystem-auth-service.onrender.com/v1/console/users',options);const data=await response.json();if(method==='POST'&&response.ok)remember(audit,{name:'Управление аккаунтом',time:new Date().toISOString(),detail:'Действие подтверждено NEXORA ID'});json(response.status,data);
 }catch{json(502,{error:'NEXORA ID не ответил'});}return true;}
 json(404,{error:'not_found'});return true;
}
