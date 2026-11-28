import {serviceConfig} from './runtime-config.js';
const runtimeUrls=serviceConfig();
import {visitorSnapshot} from './visitor-analytics.js';
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
 ['NEXORA Lobby',runtimeUrls.lobby,'/health'],
 ['NEXORA ID',runtimeUrls.auth,'/health'],
 ['Image Studio',runtimeUrls.image,'/health'],
 ['Math Studio',runtimeUrls.math,'/health'],
 ['Text Studio',runtimeUrls.text,'/health'],
 ['Все проекты #Ian','https://vse-proekty-ian.onrender.com','/api/health'],
 ['Все проекты #Ian 2',runtimeUrls.project,'/api/health'],
 ['Amvera Lobby',runtimeUrls.publicLobby,'/health']
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
 const start=Date.now();try{const response=await fetch(url+path,{signal:AbortSignal.timeout(65000),redirect:'manual'});const health=await response.json().catch(()=>null);const configured=health?.bridgeConfigured!==false&&health?.imageGeneratorConfigured!==false;const row={name,url,path,http:response.status,ms:Date.now()-start,status:response.ok&&health?.ok!==false&&configured?'ok':response.ok?'degraded':'http_error',configured,protection:health?.protection||null};if(!response.ok)remember(errors,{name,time:new Date().toISOString(),detail:'HTTP '+response.status});return row;}catch(e){remember(errors,{name,time:new Date().toISOString(),detail:e.name});return {name,url,path,status:'unconfirmed',ms:Date.now()-start};}}));snapshot={checkedAt:new Date().toISOString(),services:result};return snapshot;})().finally(()=>{pending=null;});return pending;
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
function login(message='',nonce=''){return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXORA Security</title><link rel="icon" href="/nexora-admin-mark.svg?v=3" type="image/svg+xml"><link rel="apple-touch-icon" sizes="180x180" href="/admin-icon-180.png?v=3"><link rel="manifest" href="/nexora-admin.webmanifest"><style>:root{color-scheme:dark;--bg:#111315;--surface:#1b1e20;--line:#303538;--text:#f3f5f3;--muted:#a1aaa5;--accent:#caff9d;--ink:#192b15;--error:#ffbca9}:root[data-theme=light]{color-scheme:light;--bg:#f3f5f3;--surface:#fff;--line:#dce3dc;--text:#17231d;--muted:#5d6c62;--accent:#29693f;--ink:#fff;--error:#9a3324}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:max(20px,env(safe-area-inset-top)) 18px max(20px,env(safe-area-inset-bottom));font:15px/1.55 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:radial-gradient(ellipse at 50% 0%,#537b3920,transparent 55%),var(--bg);color:var(--text)}main{width:min(100%,420px);padding:clamp(22px,6vw,36px);background:var(--surface);border:1px solid var(--line);border-radius:24px;box-shadow:0 18px 65px #0002}header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}header img{display:block;width:58px;height:58px;border-radius:14px}small{display:block;font-size:10px;letter-spacing:.14em;color:var(--muted);font-weight:700}h1{font-size:clamp(25px,6vw,32px);letter-spacing:-.04em;line-height:1.15;margin:12px 0}p{color:var(--muted);line-height:1.6;margin:12px 0 24px}label{display:block;margin-bottom:8px;font-weight:650;font-size:13px}input,button{width:100%;min-height:48px;border-radius:12px;font:inherit}input{background:var(--bg);border:1px solid var(--line);color:var(--text);padding:14px;text-align:center;letter-spacing:.35em;font-size:26px;font-variant-numeric:tabular-nums}button{background:var(--accent);border:0;color:var(--ink);font-weight:700;cursor:pointer;margin-top:12px}button:hover{opacity:.88}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.theme{margin:0;width:44px;min-height:44px;background:var(--bg);color:var(--text);border:1px solid var(--line);display:grid;place-items:center}.theme svg{width:20px;height:20px}.security-note{border-top:1px solid var(--line);padding-top:16px;margin:24px 0 0;font-size:12px;display:flex;gap:8px;align-items:center}.security-note svg{width:16px;height:16px;flex:none}.message{color:var(--error);margin:16px 0 0;font-size:13px;overflow-wrap:anywhere}.message:empty{display:none}</style><main><header><img src="/nexora-admin-mark.svg?v=3" alt="NEXORA" width="58" height="58"><button class="theme" id="console-theme" type="button" aria-label="Переключить тему"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg></button></header><small>NEXORA / SECURITY</small><h1>Вход разработчика</h1><p>Введите шестизначный код из приложения «Пароли» на iPhone.</p><form method="post" action="/developer/login"><input type="hidden" name="csrf" value="'+nonce+'"><label for="code">Код подтверждения</label><input id="code" name="code" placeholder="000000" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button>Войти</button></form><p class="message" role="status">'+message+'</p><p class="security-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Закрытая панель · только для разработчика</p></main><script>(function(){var b=document.getElementById("console-theme");function set(t){document.documentElement.dataset.theme=t;b.setAttribute("aria-pressed",String(t==="light"))}try{set(localStorage.getItem("nexora-console-theme")==="light"?"light":"dark")}catch(e){set("dark")}b.onclick=function(){var t=document.documentElement.dataset.theme==="light"?"dark":"light";set(t);try{localStorage.setItem("nexora-console-theme",t)}catch(e){}}})();</script></html>';}
export async function developerRoute(req,res,url,base,send){
 if(!(url.pathname==='/developer'||url.pathname.startsWith('/developer/')))return false;
 const path=url.pathname,method=req.method,key=decodeSecret(process.env.NEXORA_ADMIN_TOTP_SECRET);
 const json=(status,data)=>send(res,status,JSON.stringify(data),{'Content-Type':'application/json; charset=utf-8'});
 const html=(status,data)=>send(res,status,data,headers);
 const loginPage=(status,message='')=>{const nonce=crypto.randomBytes(32).toString('hex');send(res,status,login(message,nonce),{...headers,'Set-Cookie':nonceName+'='+nonce+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600'});};
 if(method==='POST'&&!trustedPost(req,base,path==='/developer/login')){if(path==='/developer/login')loginPage(403,'Запрос заблокирован. Откройте админку заново в Safari.');else json(403,{error:'forbidden'});return true;}
 if(path==='/developer/login'&&method==='POST'){
 if(!key){loginPage(503,'TOTP ещё не настроен на сервере.');return true;}
 let code;try{const form=new URLSearchParams(await body(req));if(!validLoginNonce(req,form.get('csrf'))){loginPage(403,'Форма устарела или браузер заблокировал cookie. Введите новый код на этой странице.');return true;}code=form.get('code');}catch{loginPage(400,'Неверный запрос');return true;}
 if(!/^[0-9]{6}$/.test(code||'')){loginPage(400,'Введите шесть цифр из приложения «Пароли».');return true;}
 try{if(!await persistentAdminAttempt(req,'totp')){loginPage(429,'Слишком много неверных попыток. Проверьте код в приложении «Пароли» и повторите позже.');return true;}}catch{loginPage(503,'Сервис защиты входа временно недоступен.');return true;}
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
 if(path==='/developer/api/visitors'&&method==='GET'){json(200,visitorSnapshot());return true;}
 if(path==='/developer/logout'&&method==='POST'){sessions.delete(token);send(res,303,'',{Location:'/developer','Set-Cookie':setCookie('')});return true;}
 if(path==='/developer/api/history'&&method==='GET'){
 const secret=String(process.env.NEXORA_CONSOLE_SECRET||'');
 if(secret.length<32){json(503,{error:'API NEXORA ID не настроен'});return true;}
 try{const response=await fetch(runtimeUrls.auth+'/v1/console/usage-history',{headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000),redirect:'error'});if(!response.ok){json(response.status,{error:'История NEXORA ID недоступна: HTTP '+response.status});return true;}json(200,await response.json());}catch{json(502,{error:'NEXORA ID не ответил'});}return true;
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
 if(/^\/developer\/api\/workspace\/[0-9a-f-]{36}$/i.test(path)&&['GET','POST'].includes(method)){
 const id=path.split('/').at(-1),secret=String(process.env.NEXORA_CONSOLE_SECRET||'');
 if(secret.length<32){json(503,{error:'API поддержки не настроен'});return true;}
 const endpoint=runtimeUrls.auth+'/v1/console/workspace/'+id;
 const call=(method,data)=>fetch(endpoint,{method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
 try{
 if(method==='GET'){const r=await call('GET');json(r.status,await r.json());return true;}
 const input=JSON.parse(await body(req));let data;
 if(!['message','note','credits','project'].includes(input.kind)){json(400,{error:'Недопустимое действие'});return true;}
 if(input.kind==='credits'){if(!Number.isInteger(input.credits)||input.credits<1||input.credits>1000){json(400,{error:'От 1 до 1000 генераций'});return true;}data={kind:'credits',title:'Бонус от поддержки',credits:input.credits};}
 else if(input.kind==='project'){
 const topic=String(input.topic||'').trim();const slides=Number(input.slides);
 if(topic.length<3||topic.length>180||!Number.isInteger(slides)||slides<7||slides>30){json(400,{error:'Укажите тему и 7–30 слайдов'});return true;}
 const account=await call('GET');if(!account.ok){json(account.status,{error:'Аккаунт недоступен'});return true;}
 const key=String(process.env.NEXORA_CHAT_INTERNAL_TOKEN||'');if(key.length<32){json(503,{error:'Генератор не подключён'});return true;}
 const origin=runtimeUrls.project;if(!['https://vse-proekty-ian.onrender.com','https://vse-proekty-ian-1.onrender.com'].includes(origin)){json(503,{error:'Адрес генератора не поддерживается'});return true;}
 const owner=crypto.randomBytes(32).toString('hex');
 const started=await fetch(origin+'/api/generate-project/start',{method:'POST',headers:{'Content-Type':'application/json','x-nexora-chat-token':key,'x-nexora-guest-id':owner},body:JSON.stringify({topic,slidesCount:slides}),signal:AbortSignal.timeout(25000),redirect:'error'});
 const result=await started.json();if(!started.ok||!/^[-a-f0-9]{36}$/i.test(result.jobId||'')){json(started.ok?502:started.status,{error:'Генератор не запустил проект: '+String(result.error||started.status).slice(0,180)});return true;}
 const encoded=Buffer.from(JSON.stringify({id:result.jobId,owner:'guest:'+owner,exp:Date.now()+86400000})).toString('base64url');
 const cap=encoded+'.'+crypto.createHmac('sha256',key).update('support-delivery-v1:'+encoded).digest('base64url');
 data={kind:'project',title:topic,body:'Проект создан по поручению поддержки NEXORA. Проверьте готовность и скачайте файлы в течение 24 часов.',projectJob:result.jobId,projectCap:cap,projectOrigin:origin};
 }else{
 const value=String(input.body||'').trim();if(!value||value.length>2000){json(400,{error:'Введите сообщение до 2000 символов'});return true;}
 data={kind:input.kind,title:input.kind==='note'?'Заметка разработчика':'Сообщение поддержки',body:value};
 }
 const r=await call('POST',data);const result=await r.json();if(r.ok)remember(audit,{name:'Поддержка пользователей',time:new Date().toISOString(),detail:data.kind});json(r.status,result);
 }catch{json(502,{error:'Операция не подтверждена. Проверьте историю перед повтором.'});}return true;
 }
 if(path==='/developer/api/users'&&['GET','POST'].includes(method)){
 const secret=String(process.env.NEXORA_CONSOLE_SECRET||'');if(secret.length<32){json(503,{error:'API NEXORA ID не настроен'});return true;}
 try{const options={method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),redirect:'error'};
 if(method==='POST'){const data=JSON.parse(await body(req));if(!/^[0-9a-f-]{36}$/i.test(data.id||'')||!['ban','unban','subscribe','revoke'].includes(data.action)){json(400,{error:'invalid_request'});return true;}options.body=JSON.stringify({id:data.id,action:data.action,until:data.until});}
 const response=await fetch(runtimeUrls.auth+'/v1/console/users',options);const data=await response.json();if(method==='POST'&&response.ok)remember(audit,{name:'Управление аккаунтом',time:new Date().toISOString(),detail:'Действие подтверждено NEXORA ID'});json(response.status,data);
 }catch{json(502,{error:'NEXORA ID не ответил'});}return true;}
 json(404,{error:'not_found'});return true;
}
