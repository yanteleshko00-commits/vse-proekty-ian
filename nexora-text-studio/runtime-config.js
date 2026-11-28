// Canonical source: nexora/runtime-config.js; standalone copies checked in CI.
const defaults=Object.freeze({auth:'https://ecosystem-auth-service.onrender.com',lobby:'https://nexora-lobby.onrender.com',publicLobby:'https://nexora-lobby-yan12312.msk1.amvera.tech',project:'https://vse-proekty-ian-1.onrender.com',image:'https://nexora-image-studio.onrender.com',math:'https://nexora-math-studio.onrender.com',text:'https://nexora-text-studio.onrender.com'});
export function origin(value,fallback,production=false){
 const u=new URL(String(value||fallback).trim());
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!['https:','http:'].includes(u.protocol)||(production&&u.protocol!=='https:'))throw Error('Configured service URL must be a valid origin (HTTPS in production)');
 return u.origin;
}
export function serviceConfig(env=process.env){
 const o=(v,f)=>origin(v,f,env.NODE_ENV==='production');
 return Object.freeze({auth:o(env.AUTH_PUBLIC_URL,defaults.auth),lobby:o(env.NEXORA_LOBBY_URL,defaults.lobby),publicLobby:o(env.NEXORA_PUBLIC_LOBBY_URL||env.NEXORA_LOBBY_URL,defaults.publicLobby),project:o(env.PROJECT_GENERATOR_URL,defaults.project),image:o(env.IMAGE_STUDIO_URL,defaults.image),math:o(env.MATH_STUDIO_URL,defaults.math),text:o(env.TEXT_STUDIO_URL,defaults.text)});
}
export function publicHtml(input,env=process.env){
 const c=serviceConfig(env),map=new Map(Object.keys(defaults).map(k=>[defaults[k],c[k]]));map.set('https://vse-proekty-ian.onrender.com',c.project);
 return String(input).replace(/https:\/\/(?:ecosystem-auth-service\.onrender\.com|nexora-lobby\.onrender\.com|nexora-lobby-yan12312\.msk1\.amvera\.tech|vse-proekty-ian(?:-1)?\.onrender\.com|nexora-(?:image|math|text)-studio\.onrender\.com)(?![a-z0-9.-])/g,v=>map.get(v)||v);
}
export function boundedInt(value,fallback,min,max){
 const n=Number(value);return String(value??'').trim()!==''&&Number.isSafeInteger(n)&&n>=min&&n<=max?n:fallback;
}
export function allowStartupSmoke(flag,env=process.env){
 return env[flag]==='1'&&(env.NODE_ENV!=='production'||env.NEXORA_ALLOW_PRODUCTION_SMOKE==='1');
}
export function clientIP(req,env=process.env){
 const remote=req.socket?.remoteAddress||'unknown';
 return String((env.RENDER==='true'||env.TRUST_PROXY==='true')?(String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim()||remote):remote).slice(0,90);
}
export function createRateLimiter({minute=4,hour=24,maxKeys=3000,clock=Date.now}={}){
 const entries=new Map();let lastSweep=-Infinity;
 return function allow(id){
  const now=clock();
  if(now-lastSweep>=60000||entries.size>=maxKeys){for(const [k,v] of entries)if(v.every(t=>now-t>=3600000))entries.delete(k);lastSweep=now;}
  if(!entries.has(id)&&entries.size>=maxKeys)return false;
  const times=(entries.get(id)||[]).filter(t=>now-t<3600000);
  if(times.length>=hour||times.filter(t=>now-t<60000).length>=minute)return false;
  times.push(now);entries.set(id,times);return true;
 };
}
