import {appendFile} from 'node:fs/promises';
const sites=[
 ['Render Lobby','https://nexora-lobby.onrender.com/health'],
 ['Render Image','https://nexora-image-studio.onrender.com/health'],
 ['Render Math','https://nexora-math-studio.onrender.com/health'],
 ['Render Text','https://nexora-text-studio.onrender.com/health'],
 ['Render Project','https://vse-proekty-ian.onrender.com/api/health'],
 ['Render Project 1','https://vse-proekty-ian-1.onrender.com/api/health'],
 ['NEXORA ID','https://ecosystem-auth-service.onrender.com/health'],
 ['Amvera Lobby','https://nexora-lobby-yan12312.msk1.amvera.tech/health']
];
const results=await Promise.all(sites.map(async([name,url])=>{
 let result;for(let i=0;i<2;i++){const start=Date.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(70000),redirect:'error',headers:{'User-Agent':'NEXORA-health-monitor/1.0'}});const j=await r.json().catch(()=>null);const missing=j?.bridgeConfigured===false||j?.imageGeneratorConfigured===false||j?.chatConfigured===false||j?.oauthConfigured===false;result={name,status:r.ok&&j?.ok===true?(missing?'degraded':'ok'):'unhealthy',http:r.status,ms:Date.now()-start};if(result.status==='ok'||result.status==='degraded')break;}catch(e){result={name,status:'unconfirmed',ms:Date.now()-start,error:e.name};}}
 console.log(JSON.stringify(result));return result;
}));
const summary='## NEXORA health · '+new Date().toISOString()+'\n\n| Service | Status | HTTP | ms |\n|---|---|---|---|\n'+results.map(r=>'| '+r.name+' | '+r.status+' | '+(r.http??'—')+' | '+r.ms+' |').join('\n')+'\n\nRead-only health endpoints; not paid AI generations. A degraded result means configuration is incomplete.\n';
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
if(results.some(r=>r.status!=='ok'))process.exitCode=1;
