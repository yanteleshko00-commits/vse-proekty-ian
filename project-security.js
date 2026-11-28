import crypto from 'node:crypto';
import { validInternalToken } from './nexora/chat-core.js';

// Separate security and accounting from presentation generation.
export function createProjectSecurity({authPublicUrl,oauthClientId,sessionSecret,sessionCookieName,sessionTTL,projectServiceKey,asyncRoute,fetchImpl=fetch}){
  const AUTH_PUBLIC_URL=authPublicUrl;
  const OAUTH_CLIENT_ID=oauthClientId;
  const PROJECT_SESSION_SECRET=sessionSecret;
  const PROJECT_SESSION_COOKIE=sessionCookieName;
  const PROJECT_SESSION_TTL=sessionTTL;
function projectCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAge * 1000
  };
}
function readRequestCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}
function projectSessionSignature(payload) {
  return crypto.createHmac('sha256', PROJECT_SESSION_SECRET).update(payload).digest('base64url');
}
function createProjectSession(user, sessionId) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    sessionId,
    expiresAt: Date.now() + PROJECT_SESSION_TTL * 1000
  })).toString('base64url');
  return payload + '.' + projectSessionSignature(payload);
}
function readProjectSession(req) {
  if (PROJECT_SESSION_SECRET.length < 32) return null;
  const token = readRequestCookie(req, PROJECT_SESSION_COOKIE);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = Buffer.from(projectSessionSignature(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const user = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!user.id || !user.sessionId || !Number.isFinite(user.expiresAt) || Date.now() > user.expiresAt) return null;
    return user;
  } catch {
    return null;
  }
}

const requestRates = new Map();
function takeRate(key, limit, period=60000) {
  const now=Date.now();
  for(const [k,v] of requestRates) if(v.until<=now)requestRates.delete(k);
  let entry=requestRates.get(key);
  if(!entry){if(requestRates.size>=5000)return false;entry={count:0,until:now+period};requestRates.set(key,entry);}
  return ++entry.count<=limit;
}

async function projectAuthCall(endpoint, body) {
  if(projectServiceKey.length<32)throw Object.assign(Error('Сервис учёта NEXORA ID не настроен.'),{status:503});
  const response=await fetchImpl(AUTH_PUBLIC_URL+endpoint,{
    method:'POST',headers:{'Content-Type':'application/json','x-service-id':OAUTH_CLIENT_ID,'x-service-api-key':projectServiceKey},
    body:JSON.stringify(body),signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(data.error==='no_credits'?'Бесплатные генерации закончились. Выберите пакет.':'Не удалось подтвердить сессию или учесть генерацию.'),{status:response.status===401?401:response.status===402?402:response.status===404?401:response.status===429?429:503});
  return data;
}
async function liveProjectAccount(req) {
  const bridge=validInternalToken(req.get('x-nexora-chat-token'),process.env.NEXORA_CHAT_INTERNAL_TOKEN||'');
  const local=bridge?{id:req.get('x-nexora-user-id'),sessionId:req.get('x-nexora-session-id')}:readProjectSession(req);
  if(!local?.id||!local?.sessionId)throw Object.assign(Error('Войдите в NEXORA ID.'),{status:401});
  const live=await projectAuthCall('/v1/internal/session/validate',{userId:local.id,sessionId:local.sessionId});
  return {...live,sessionId:local.sessionId};
}
const guestKey=PROJECT_SESSION_SECRET.length>=32?PROJECT_SESSION_SECRET:crypto.randomBytes(32);
function guestSignature(id){return crypto.createHmac('sha256',guestKey).update('project-guest:'+id).digest('hex');}
function guestAccount(req){
  const bridge=validInternalToken(req.get('x-nexora-chat-token'),process.env.NEXORA_CHAT_INTERNAL_TOKEN||'');
  const bridged=req.get('x-nexora-guest-id')||'';
  if(bridge&&/^[a-f0-9]{64}$/.test(bridged))return {user:{id:'guest:'+bridged},guest:true};
  const [candidate,signature]=String(readRequestCookie(req,'projects_guest')||'').split('.');
  let id=candidate;
  if(!/^[a-f0-9]{64}$/.test(id||'')||signature!==guestSignature(id)){
    id=crypto.randomBytes(32).toString('hex');
    req.res.cookie('projects_guest',id+'.'+guestSignature(id),projectCookieOptions(86400*7));
  }
  return {user:{id:'guest:'+id},guest:true};
}
async function projectWorkAccount(req){
  const bridge=validInternalToken(req.get('x-nexora-chat-token'),process.env.NEXORA_CHAT_INTERNAL_TOKEN||'');
  if(readProjectSession(req)||(bridge&&req.get('x-nexora-user-id')&&req.get('x-nexora-session-id')))return liveProjectAccount(req);
  return guestAccount(req);
}
let activeProjectWork=0;
const activeProjectUsers=new Set();
async function beginProjectWork(req){
  const live=await projectWorkAccount(req);
  const id=live.user.id;
  if(live.guest&&!takeRate('guest-ip:'+req.ip,6,3600000))throw Object.assign(Error('Гостевой лимит: 6 запросов в час. Повторите позже.'),{status:429});
  if(!takeRate('user:'+id,8))throw Object.assign(Error('Слишком много запросов.'),{status:429});
  if(activeProjectWork>=1||activeProjectUsers.has(id))throw Object.assign(Error('Генератор занят. Повторите запрос позже.'),{status:429});
  activeProjectWork++;activeProjectUsers.add(id);
  try{
    if(live.guest)return {id,guest:true};
    const reserved=await projectAuthCall('/v1/internal/usage/reserve',{userId:id,sessionId:live.sessionId,idempotencyKey:crypto.randomUUID(),product:'project'});
    if(!reserved.reservationId)throw Error('Не получен резерв кредитов.');
    return {id,reservationId:reserved.reservationId};
  }catch(error){activeProjectWork--;activeProjectUsers.delete(id);throw error;}
}
async function endProjectWork(work,outcome){
  try{
    if(work.guest)return;
    for(let attempt=0;attempt<3;attempt++){
      try{await projectAuthCall('/v1/internal/usage/'+encodeURIComponent(work.reservationId)+'/finalize',{outcome});break;}
      catch(error){if(attempt===2)console.error('[usage-finalize]',work.reservationId,outcome,error.message);}
    }
  }finally{activeProjectWork--;activeProjectUsers.delete(work.id);}
}
function metered(handler){
  return asyncRoute(async(req,res)=>{
    const work=await beginProjectWork(req);
    let outcome='failure';
    try{await handler(req,res);if(res.statusCode>=200&&res.statusCode<300)outcome='success';}
    finally{await endProjectWork(work,outcome);}
  });
}

  return {projectCookieOptions,readRequestCookie,createProjectSession,readProjectSession,takeRate,projectAuthCall,liveProjectAccount,projectWorkAccount,beginProjectWork,endProjectWork,metered};
}
