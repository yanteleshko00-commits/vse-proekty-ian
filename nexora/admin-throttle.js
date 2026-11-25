import { isIP } from 'node:net';
export function trustedClientIp(req,env=process.env){
 const peer=req.socket?.remoteAddress||'';
 const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
 const address=(env.RENDER==='true'||env.TRUST_PROXY==='true')&&isIP(forwarded)?forwarded:peer;
 return isIP(address)?address:null;
}
export async function persistentAdminAttempt(req,kind,env=process.env,fetchImpl=fetch){
 const ip=trustedClientIp(req,env),key=env.AUTH_SERVICE_API_KEY||'';
 if(!ip||key.length<32)throw Error('admin_rate_limit_unconfigured');
 const base=(env.AUTH_PUBLIC_URL||'https://ecosystem-auth-service.onrender.com').replace(/\/$/,'');
 const response=await fetchImpl(base+'/v1/internal/admin/attempt',{method:'POST',headers:{'Content-Type':'application/json','x-service-id':env.AUTH_SERVICE_CLIENT_ID||'nexora','x-service-api-key':key},body:JSON.stringify({ip,kind}),signal:AbortSignal.timeout(12000)});
 if(response.status===429)return false;
 if(!response.ok)throw Error('admin_rate_limit_unavailable');
 const data=await response.json();return data.allowed===true;
}
