import crypto from 'node:crypto';
export function studioAccount({name,lobby,key,production=process.env.NODE_ENV==='production'}){
 const cookieName='nx_'+name+'_session',stateName='nx_'+name+'_state';
 const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
 const sign=v=>crypto.createHmac('sha256',key).update(name+':session:'+v).digest('base64url');
 function read(req,n){for(const piece of String(req.headers.cookie||'').split(';')){const i=piece.indexOf('=');if(i>0&&piece.slice(0,i).trim()===n)return piece.slice(i+1).trim();}return '';}
 function cookie(n,v,age){return n+'='+v+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(production?'; Secure':'');}
 function account(req){
  if(key.length<32)return null;const raw=read(req,cookieName);if(raw.length>2048)return null;const [v,h,...rest]=raw.split('.');
  if(!v||!h||rest.length)return null;const a=Buffer.from(h),b=Buffer.from(sign(v));if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{const p=JSON.parse(Buffer.from(v,'base64url').toString());return p.userId&&p.sessionId&&Number.isFinite(p.exp)&&p.exp>Date.now()?p:null;}catch{return null;}
 }
 async function call(body){
  if(key.length<32)throw Object.assign(Error('not configured'),{status:503});
  const r=await fetch(lobby+'/internal/studio-auth',{method:'POST',headers:{'Content-Type':'application/json','x-nexora-studio':name,'x-nexora-studio-token':key},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error('account unavailable'),{status:r.status});return d;
 }
 function send(res,status,body,headers={}){res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers});res.end(body);}
 async function route(req,res,url){
  if(req.method!=='GET')return false;
  if(url.pathname==='/auth/start'){if(key.length<32){send(res,503,'Вход пока не настроен.');return true;}const state=crypto.randomBytes(32).toString('base64url');send(res,302,'',{Location:lobby+'/auth/'+name+'?state='+state,'Set-Cookie':cookie(stateName,state,600)});return true;}
  if(url.pathname==='/auth/callback'){
   const state=url.searchParams.get('state'),ticket=url.searchParams.get('ticket');
   if(!valid(state)||!valid(ticket)||state!==read(req,stateName)){send(res,400,'Вход устарел. Повторите попытку.');return true;}
   try{const d=await call({action:'exchange',state,ticket});if(!d.userId||!d.sessionId)throw Error('invalid session');const v=Buffer.from(JSON.stringify({userId:d.userId,sessionId:d.sessionId,exp:Date.now()+604800000})).toString('base64url');send(res,302,'',{Location:'/','Set-Cookie':[cookie(stateName,'',0),cookie(cookieName,v+'.'+sign(v),604800)]});}catch{send(res,503,'Не удалось завершить вход. Повторите попытку.');}return true;
  }
  return false;
 }
 async function run(req,res,handler){
  const a=account(req);if(!a)return handler(req,res);
  let reservation;try{reservation=(await call({action:'reserve',userId:a.userId,sessionId:a.sessionId})).reservationId;if(!reservation)throw Error('reservation missing');}
  catch(e){const status=[401,402,429].includes(e.status)?e.status:503;return send(res,status,JSON.stringify({message:status===402?'Лимит исчерпан. Откройте NEXORA ID.':'Не удалось подтвердить аккаунт или достигнут лимит.'}),{'Content-Type':'application/json; charset=utf-8'});}
  let outcome='failure';try{await handler(req,res);if(res.statusCode>=200&&res.statusCode<300)outcome='success';}
  finally{for(let i=0;i<3;i++)try{await call({action:'finalize',reservationId:reservation,outcome});break;}catch(e){if(i===2)console.warn('Usage finalization failed',e.name);}}
 }
 return {route,account,run};
}
