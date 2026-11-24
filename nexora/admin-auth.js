import crypto from 'node:crypto';
const TTL=8*3600;
const header=()=>String(process.env.NEXORA_ADMIN_PASSWORD_HASH||'').trim();
export function passwordConfigured(value=header()){return /^[a-f0-9]{48}:[a-f0-9]{128}$/.test(value)}
export function checkAdminPassword(password,hash=header()){
 if(!passwordConfigured(hash)||typeof password!=='string'||password.length>128)return false;
 const [salt,digest]=hash.split(':');
 return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(digest,'hex'));
}
function sign(value,hash){return crypto.createHmac('sha256',hash).update('nexora-admin-v1:'+value).digest('base64url')}
export function createAdminSession(hash=header(),now=Date.now()){
 if(!passwordConfigured(hash))throw Error('admin_password_not_configured');
 const value=String(now+TTL*1000)+'.'+crypto.randomBytes(24).toString('base64url');
 return value+'.'+sign(value,hash);
}
export function validAdminSession(token,hash=header(),now=Date.now()){
 if(!passwordConfigured(hash)||typeof token!=='string'||token.length>200)return false;
 const parts=token.split('.');
 if(parts.length!==3||!/^\d{13}$/.test(parts[0])||!/^[A-Za-z0-9_-]{32}$/.test(parts[1]))return false;
 const expiry=Number(parts[0]);
 if(expiry<=now||expiry>now+TTL*1000)return false;
 const a=Buffer.from(parts[2]),b=Buffer.from(sign(parts[0]+'.'+parts[1],hash));
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
const attempts=new Map();
export function allowAdminAttempt(ip,now=Date.now()){
 const start=now-15*60*1000;
 const key=String(ip||'unknown').slice(0,100),list=(attempts.get(key)||[]).filter(t=>t>start);
 if(list.length>=5)return false;
 if(!attempts.has(key)&&attempts.size>=10000){for(const [id,t] of attempts)if(t.every(x=>x<=start))attempts.delete(id);if(attempts.size>=10000)return false;}
 list.push(now);attempts.set(key,list);
 if(attempts.size>1000)for(const [id,t] of attempts)if(t.every(x=>x<=start))attempts.delete(id);
 return true;
}
export const adminSessionSeconds=TTL;
export function adminLoginPage(error=''){
 const message=error==='invalid'?'Неверный пароль.':error==='limited'?'Слишком много попыток. Попробуйте через 15 минут.':error==='unavailable'?'Вход администратора ещё не настроен.':'';
 return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXORA · Вход администратора</title><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0d1322;color:#edf2ff;font:16px system-ui;padding:20px}main{width:min(100%,390px);background:#172238;border:1px solid #2a3955;border-radius:22px;padding:26px}h1{font-size:24px;margin:0 0 12px}p{color:#9faec8;line-height:1.5}label{display:block;font-size:14px;margin:20px 0 8px}input,button{width:100%;font:inherit;padding:14px;border-radius:12px}input{color:white;background:#0d1322;border:1px solid #43516b}button{margin-top:14px;background:#4166ee;color:white;border:0}.error{color:#ffb1b1}</style><main><h1>NEXORA Admin</h1><p>Закрытая панель разработчика</p><form method="post" action="/admin/login"><label for="password">Пароль администратора</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required><button type="submit">Войти</button></form><p class="error" role="status">'+message+'</p></main></html>';
}
