import assert from 'node:assert/strict';
const sites=[
 ['Render Lobby','https://nexora-lobby.onrender.com/','nx-desktop-layout-v5'],
 ['Render Chat','https://nexora-lobby.onrender.com/chat','nx-desktop-layout-v5'],
 ['Render Game','https://nexora-lobby.onrender.com/game','nx-desktop-layout-v5'],
 ['Render Admin login','https://nexora-lobby.onrender.com/developer','NEXORA Security'],
 ['Render Image','https://nexora-image-studio.onrender.com/','nx-desktop-layout-v5'],
 ['Render Math','https://nexora-math-studio.onrender.com/','nx-desktop-layout-v5'],
 ['Render Text','https://nexora-text-studio.onrender.com/','nx-desktop-layout-v5'],
 ['Render Project','https://vse-proekty-ian.onrender.com/','nx-desktop-layout-v5'],
 ['Render Project 1','https://vse-proekty-ian-1.onrender.com/','nx-desktop-layout-v5'],
 ['Render ID login','https://ecosystem-auth-service.onrender.com/login','20261128-desktop'],
 ['Render ID CSS','https://ecosystem-auth-service.onrender.com/assets/auth.css?v=20261128-desktop','Desktop: keep long registration forms'],
 ['Amvera Lobby','https://nexora-lobby-yan12312.msk1.amvera.tech/','nx-desktop-layout-v5'],
 ['Amvera Chat','https://nexora-lobby-yan12312.msk1.amvera.tech/chat','nx-desktop-layout-v5'],
 ['Amvera Game','https://nexora-lobby-yan12312.msk1.amvera.tech/game','nx-desktop-layout-v5'],
 ['Amvera Admin login','https://nexora-lobby-yan12312.msk1.amvera.tech/developer','NEXORA Security']
];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const results=await Promise.all(sites.map(async ([name,url,marker])=>{
 let last={name,url,status:null,updated:false};
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(70000),headers:{'Cache-Control':'no-cache','User-Agent':'NEXORA-Deployment-QA/1.0'}});
   const body=await response.text();
   last={name,url,status:response.status,updated:response.ok&&body.includes(marker)};
   if(last.updated)break;
  }catch(error){last={name,url,status:null,updated:false,error:error.message};}
  if(attempt<3)await delay(10000);
 }
 console.log(JSON.stringify(last));return last;
}));
console.log('Verified '+results.filter(x=>x.updated).length+'/'+results.length+' public URLs. Admin check covers login only; no authentication is attempted.');
assert.ok(results.every(x=>x.updated),'At least one public URL is unavailable or does not contain the expected version marker.');
