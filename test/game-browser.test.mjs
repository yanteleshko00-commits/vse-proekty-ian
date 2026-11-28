import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=26974,base='http://127.0.0.1:'+port;
const valid='<!doctype html><html><head><meta charset="utf-8"><title>Game</title></head><body><canvas width="720" height="420"></canvas><script>const c=document.querySelector("canvas"),x=c.getContext("2d");let n=0;document.addEventListener("keydown",e=>n++);function frame(){x.fillStyle="#284561";x.fillRect(0,0,720,420);x.fillStyle="#ffd34a";x.fillRect(n++%600,60,100,80);x.fillStyle="#63bd7b";x.fillRect(0,300,720,120);requestAnimationFrame(frame)}frame();</script></body></html>';
test('mobile game QA runs in an isolated browser; click opens, cross closes and broken code stays blocked',{timeout:90000},async()=>{
 const child=spawn(process.execPath,['nexora/server.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'test'},stdio:'ignore'});
 let browser;
 try{
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.equal(ready,true);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  let code=valid;
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.route('**/api/game/code',route=>route.fulfill({json:{ok:true,source:'ai',html:code,title:'Тестовая игра',provider:'test',dimension:'2d',review:{status:'passed',reviewer:'mock',repaired:false,issues:[]}}}));
  await page.goto(base+'/game');
  await page.locator('#ai-idea').fill('Тестовая игра');
  await page.locator('#ai-build').click();
  await page.locator('#ai-open-game').waitFor({state:'visible',timeout:25000});
  assert.match(await page.locator('#ai-review-report').textContent(),/Пробный запуск пройден/i);
  await page.locator('#ai-open-game').click();
  await page.locator('#ai-close-game').waitFor({state:'visible'});
  const bounds=await page.locator('#ai-game-view').boundingBox();
  const viewport=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));assert.ok(Math.abs(bounds.width-viewport.w)<=2&&Math.abs(bounds.height-viewport.h)<=2,JSON.stringify({bounds,viewport}));
  assert.equal(await page.locator('#ai-frame').getAttribute('sandbox'),'allow-scripts');
  await page.locator('#ai-close-game').click();
  await page.locator('#ai-open-game').waitFor({state:'visible'});
  assert.equal(await page.locator('#ai-frame').getAttribute('src'),'about:blank');
  await page.locator('#ai-open-game').click();
  await page.locator('#ai-close-game').click();
  await page.reload();await page.locator('.nx-library-open').first().click();await page.locator('#ai-close-game').waitFor({state:'visible',timeout:25000});await page.locator('#ai-close-game').click();
  await page.locator('#ai-idea').fill('Тестовая игра');
  await page.route('**/api/game/repair',route=>route.fulfill({status:503,json:{ok:false}}));
  code=valid.replace('let n=0;','let n=0;throw new Error("test runtime bug");');
  await page.locator('#ai-build').click();
  await page.locator('#ai-error').waitFor({state:'visible',timeout:25000});
  assert.match(await page.locator('#ai-error').textContent(),/пробного запуска/i);
  assert.equal(await page.locator('#ai-open-game').isVisible(),false);
  code=valid.replace('let n=0;','let n=0;let started=0;').replace('function frame(){','function frame(){if(!started)started=performance.now();if(performance.now()-started>1800){x.clearRect(0,0,720,420);requestAnimationFrame(frame);return;}');
  await page.locator('#ai-build').click();await page.locator('#ai-error').waitFor({state:'visible',timeout:25000});assert.match(await page.locator('#ai-error').textContent(),/сцена исчезает|остаётся пустой/i);assert.equal(await page.locator('#ai-open-game').isVisible(),false);
 }finally{await browser?.close();child.kill();}
});

test('Argosha composer stays inside 390px viewport and uses 16px input',{timeout:60000},async()=>{const child=spawn(process.execPath,['nexora/server.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'test'},stdio:'ignore'});let browser;try{for(let i=0;i<60;i++){try{if((await fetch(base+'/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:340},isMobile:true,hasTouch:true});await page.goto(base+'/argosha/embed?studio=game');await page.locator('#input').fill('Как дела?');const sizes=await page.evaluate(()=>({font:parseFloat(getComputedStyle(document.querySelector('#input')).fontSize),send:document.querySelector('#send').getBoundingClientRect().right,width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(sizes.font>=16);assert.ok(sizes.send<=sizes.width);assert.ok(sizes.scroll<=sizes.width);}finally{await browser?.close();child.kill();}});

// WebGL regression: a render loop that continues but clears the scene is not
// a pass, even when there is no JS exception and the HUD remains visible.
test('3D QA detects a scene that disappears during gameplay',{timeout:60000},async()=>{
 const port3=26975,base3='http://127.0.0.1:'+port3;
 const child=spawn(process.execPath,['nexora/server.js'],{env:{...process.env,PORT:String(port3),NODE_ENV:'test'},stdio:'ignore'});
 let browser;
 try{
  let live=false;for(let i=0;i<60;i++){try{if((await fetch(base3+'/health')).ok){live=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(live,true);
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const source='<!doctype html><html><head><title>3D scene</title><style>canvas{width:100%;height:360px}</style></head><body><button id="start">Играть</button><canvas width="320" height="240"></canvas><div>Счёт: 42</div><script>const c=document.querySelector("canvas"),gl=c.getContext("webgl");let started=0;document.querySelector("#start").onclick=()=>{started=performance.now()};document.addEventListener("keydown",()=>{});function draw(){gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);if(!started||performance.now()-started<1800){gl.enable(gl.SCISSOR_TEST);gl.scissor(0,0,160,240);gl.clearColor(0,1,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.scissor(160,0,160,120);gl.clearColor(1,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}requestAnimationFrame(draw)}draw();</script></body></html>';
  await page.route('**/*',route=>route.request().url().startsWith(base3)?route.continue():route.abort());
  await page.route('**/api/game/code',route=>route.fulfill({json:{ok:true,source:'ai',html:source,title:'3D test',provider:'mock',dimension:'3d',review:{status:'passed',issues:[]}}}));
  await page.route('**/api/game/repair',route=>route.fulfill({status:503,json:{ok:false}}));
  await page.goto(base3+'/game');await page.locator('#ai-idea').fill('3D тест');await page.locator('[data-game-dimension="3d"]').click();await page.locator('#ai-build').click();
  await page.locator('#ai-error').waitFor({state:'visible',timeout:30000});
  assert.match(await page.locator('#ai-error').textContent(),/сцена исчезает|остаётся пустой/i);
  assert.equal(await page.locator('#ai-open-game').isVisible(),false);
 }finally{await browser?.close();child.kill();}
});

// Desktop regression: the sandbox probe must render enough frames, then the
// fullscreen player must remain inside a laptop viewport and close with Escape.
test('desktop laptop game launch, rendering and Escape',{timeout:60000},async()=>{
 const p=26976,origin='http://127.0.0.1:'+p;
 const child=spawn(process.execPath,['nexora/server.js'],{env:{...process.env,PORT:String(p),NODE_ENV:'test'},stdio:'ignore'});
 let browser;
 try{
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(origin+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.route('**/api/game/code',route=>route.fulfill({json:{ok:true,source:'ai',html:valid,title:'Desktop test',provider:'test',dimension:'2d',review:{status:'passed',issues:[]}}}));
  await page.goto(origin+'/game');await page.locator('#ai-idea').fill('Desktop test');await page.locator('#ai-build').click();
  await page.locator('#ai-open-game').waitFor({state:'visible',timeout:25000});
  await page.locator('#ai-open-game').click();await page.locator('#ai-close-game').waitFor({state:'visible'});
  const b=await page.locator('#ai-game-view').boundingBox();assert.ok(Math.abs(b.width-1280)<=2&&Math.abs(b.height-800)<=2,JSON.stringify(b));
  await page.locator('#ai-close-game').focus();await page.keyboard.press('Escape');await page.locator('#ai-open-game').waitFor({state:'visible'});
 }finally{await browser?.close();child.kill();}
});
