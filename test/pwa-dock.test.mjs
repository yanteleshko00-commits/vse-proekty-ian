import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {serveBrand} from '../nexora/brand.js';
const pages=[['lobby','nexora/public/index.html'],['chat','nexora/public/chat.html'],['game','nexora/public/game.html'],['image','nexora-image-studio/public/index.html'],['math','nexora-math-studio/index.html'],['text','nexora-text-studio/index.html'],['project','public/index.html']];
test('dock only in standalone, seven links, center lobby, viewport fit', {timeout:180000},async()=>{
 const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(serveBrand(req,res,path))return;const file=pages.find(([id])=>path==='/'+id)?.[1];if(!file){if(path.startsWith('/assets/')){const root=resolve('public/assets'),asset=resolve('public','.'+path);if(asset.startsWith(root+sep)){try{const data=await readFile(asset);res.writeHead(200,{'Content-Type':extname(asset)==='.css'?'text/css':extname(asset)==='.js'?'text/javascript':'application/octet-stream'});return res.end(data);}catch{}}}res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{for(const engine of [chromium,webkit]){const browser=await engine.launch();try{for(const installed of [false,true]){const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 if(installed)await ctx.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true}));
 await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 for(const [id] of pages){const page=await ctx.newPage();await page.goto(base+'/'+id,{waitUntil:'domcontentloaded'});const dock=page.locator('.nx-pwa-dock');assert.equal(await dock.count(),1,id);
 if(!installed)assert.equal(await dock.isVisible(),false,id+' ordinary browser');
 else{await dock.waitFor({state:'visible'});await page.locator('.nx-pwa-dock[data-ready]').waitFor();assert.equal(await dock.locator('[data-preview]').getAttribute('data-tool'),id);assert.ok(await dock.evaluate(el=>parseFloat(el.style.getPropertyValue('--nx-pill-w'))>0));assert.equal(await dock.locator('a').count(),7);assert.equal(await dock.locator('a').nth(3).getAttribute('data-tool'),'lobby');assert.equal(await dock.locator('[aria-current=page]').getAttribute('data-tool'),id);
 const bounds=await dock.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391&&bounds.y+bounds.height<=845,JSON.stringify(bounds));
 const a=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(a.scroll<=a.width+2,id+' overflow');
 if(id==='chat'){const composer=await page.locator('.composer').boundingBox();assert.ok(composer.y+composer.height<=bounds.y+1,'composer overlaps dock');}}
 console.log('PASS',engine.name(),id,installed?'installed':'browser');await page.close();}
 if(installed){
 const page=await ctx.newPage();await page.goto(base+'/lobby',{waitUntil:'domcontentloaded'});const dock=page.locator('.nx-pwa-dock[data-ready]');await dock.waitFor();const start=await dock.locator('[data-tool=lobby]').boundingBox(),end=await dock.locator('[data-tool=chat]').boundingBox();await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:7});assert.equal(await dock.locator('[data-preview]').getAttribute('data-tool'),'chat');assert.equal(await dock.getAttribute('data-dragging'),'');await Promise.all([page.waitForURL(base+'/chat'),page.mouse.up()]);await page.locator('.nx-pwa-dock[data-ready]').waitFor();assert.equal(await page.locator('.nx-pwa-dock [data-preview]').getAttribute('data-tool'),'chat');await page.close();
 }
 await ctx.close();}}finally{await browser.close();}}}finally{await new Promise(r=>server.close(r));}
});
test('dock scripts identical for standalone deployments',async()=>{const reference=await readFile('nexora/app-dock.js','utf8');for(const dir of ['nexora-image-studio','nexora-math-studio','nexora-text-studio'])assert.equal(await readFile(dir+'/app-dock.js','utf8'),reference);});
