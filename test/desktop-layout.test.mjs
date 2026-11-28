import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,webkit} from 'playwright';

const pages=[
 ['lobby','nexora/public','index.html','#tools'],
 ['chat','nexora/public','chat.html','.composer'],
 ['game','nexora/public','game.html','.ai-workspace'],
 ['admin','nexora','developer-console.html','main'],
 ['image','nexora-image-studio/public','index.html','.layout'],
 ['math','nexora-math-studio','index.html','#workspace'],
 ['text','nexora-text-studio','index.html','.workspace'],
 ['project','public','index.html','#generator']
];
const sizes=[{width:1024,height:768},{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080},{width:2560,height:1440},{width:390,height:844}];
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
async function startServer(root,entry){
 const base=resolve(root);
 const server=createServer(async(req,res)=>{
   try {
     const pathname=new URL(req.url,'http://localhost').pathname;
     if(pathname.startsWith('/api/')||pathname.startsWith('/auth/')){res.writeHead(503,{'content-type':'application/json'});res.end('{"ok":false,"error":"offline layout test"}');return;}
     const file=resolve(base,'.'+(pathname==='/'?'/'+entry:pathname));
     if(!file.startsWith(base+sep)) {res.writeHead(403);res.end();return;}
     const data=await readFile(file);
     res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(data);
   } catch {res.writeHead(404);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
for(const [name,root,entry,selector] of pages){
 test(name+' responsive geometry (Chromium and WebKit)',{timeout:120000},async()=>{
  const {server,url}=await startServer(root,entry);
  try{
   for(const [engine,engineName] of [[chromium,'Chromium'],[webkit,'WebKit']]){
    const browser=await engine.launch();
    try{
     for(const viewport of sizes){
      const context=await browser.newContext({viewport,reducedMotion:'reduce',colorScheme:'light'});
      try{
       const page=await context.newPage();
       await page.route('**/*',route=>route.request().url().startsWith(url+'/')?route.continue():route.abort());
       await page.goto(url+'/',{waitUntil:'domcontentloaded'});
       await page.locator(selector).first().waitFor({state:'attached'});
       const actual=await page.evaluate(sel=>{
         const el=document.querySelector(sel);const b=el.getBoundingClientRect();
         return {width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,mainWidth:b.width,mainLeft:b.left,mainRight:b.right,style:!!document.getElementById('nx-desktop-layout-v5')};
       },selector);
       const note=engineName+' '+viewport.width+'x'+viewport.height+' '+JSON.stringify(actual);
       assert.ok(actual.style,note);
       assert.ok(actual.scroll<=actual.width+2,note);
       assert.ok(actual.mainWidth>0&&actual.mainLeft>=-2&&actual.mainRight<=actual.width+2,note);
       console.log('PASS '+name+' '+note);
      } finally {await context.close();}
     }
    } finally {await browser.close();}
   }
  } finally {await new Promise(r=>server.close(r));}
 });
}
