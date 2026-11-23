import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/opt/google/chrome/chrome'].find(existsSync);
assert.ok(chrome,'Chrome executable not found');
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('https://nexora-lobby.onrender.com/game',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('#ai-idea').fill('Майнкрафт');
 await page.locator('#ai-build').click();
 await page.waitForFunction(()=>document.querySelector('#ai-frame')?.getAttribute('src')?.startsWith('/game/preview/'),{timeout:75000});
 const iframe=await page.locator('#ai-frame').elementHandle(),game=await iframe.contentFrame();
 assert.ok(game);
 await game.locator('#world').waitFor({state:'visible',timeout:35000});
 await page.waitForTimeout(1200);
 const info=await game.evaluate(()=>{
  const c=document.querySelector('#world'),ctx=c.getContext('2d');
  return {canvas:c.tagName,width:c.width,height:c.height,pixel:Array.from(ctx.getImageData(300,160,1,1).data),
   header:document.querySelector('header')?.textContent||'',mine:!!document.querySelector('#mine'),
   place:!!document.querySelector('#place'),studio:!!document.querySelector('#ai-workspace'),nested:!!document.querySelector('.top')};
 });
 console.log('MINECRAFT FRAME DIAGNOSTIC',info,'page errors',errors,'game script length',await game.evaluate(()=>document.scripts[0]?.textContent.length));
 assert.equal(info.width,720);assert.equal(info.height,420);
 assert.equal(info.pixel[3],255,'2D Minecraft game canvas is blank');
 assert.equal(info.mine,true);assert.equal(info.place,true);
 assert.equal(info.studio,false,'Game preview contains the parent Game Studio!');
 assert.equal(info.nested,false,'Unexpected NEXORA site embedded in game!');
 assert.match(info.header,/Майнкрафт/);
 console.log('MINECRAFT GAME',info,'2D WORLD RENDERED (NO NESTED SITE)');
 await game.evaluate(()=>{
  window.__nexoraKeyboard=[];
  document.addEventListener('keydown',e=>window.__nexoraKeyboard.push(e.key));
 });
 await page.locator('#ai-frame').scrollIntoViewIfNeeded();
 await page.waitForTimeout(450);
 await page.locator('[data-game-arrow="left"]').click();
 assert.ok((await game.evaluate(()=>window.__nexoraKeyboard)).includes('ArrowLeft'),'Left arrow button did not work');
 const box=await game.locator('#world').boundingBox();
 assert.ok(box,'world canvas bounding box unavailable');
 const cdp=await page.context().newCDPSession(page);
 const x=box.x+box.width*.57,y=box.y+box.height*.48;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+105,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(260);
 const keys=await game.evaluate(()=>window.__nexoraKeyboard);
 assert.ok(keys.includes('ArrowRight'),'Swipe right did not become ArrowRight: '+JSON.stringify(keys));
 console.log('MINECRAFT CONTROLS',keys,'MOBILE D-PAD AND SWIPES PASS');

 await game.locator('#place').click();
 assert.match(await game.locator('#place').getAttribute('class'),/active/);
 await game.locator('#mine').click();
 assert.match(await game.locator('#mine').getAttribute('class'),/active/);
 await game.locator('#restart').click();
 await page.waitForTimeout(120);
 const initialResources=await game.locator('#resources').textContent();
 await page.locator('[data-game-arrow="space"]').click();
 await page.waitForTimeout(160);
 const afterMine=await game.locator('#resources').textContent();
 console.log('MINECRAFT ACTION TEST','before',initialResources,'after',afterMine,'message',await game.locator('#notice').textContent());
 assert.notEqual(afterMine,initialResources,'Action button did not mine a block after reset');
 console.log('MINECRAFT INTERACTION','mining/building buttons and action functional');
 await page.locator('#ai-code-tab').click();
 const source=await page.locator('#ai-source').inputValue();
 assert.ok(source.includes('function interact'));
 assert.ok(!source.includes('id="ai-workspace"'));
 console.log('MINECRAFT SOURCE','editable code contains block mechanics, not full Game Studio');

 await page.locator('#ai-code-tab').click();
 await page.locator('#ai-run-code').click();
 await page.waitForFunction(()=>document.querySelector('#ai-code-view')?.hidden===true,{timeout:30000});
 console.log('MINECRAFT CODE RESTART','PASS');

 // Also ensure generic fallback has no recursion.
 await page.locator('#ai-idea').fill('Лови звёзды');
 await page.locator('#ai-build').click();
 await page.waitForFunction(()=>document.querySelector('#ai-game-title')?.textContent==='Лови звёзды'&&document.querySelector('#ai-frame')?.getAttribute('src')?.startsWith('/game/preview/'),{timeout:70000});
 const second=await (await page.locator('#ai-frame').elementHandle()).contentFrame();
 await second.locator('#board').waitFor({state:'visible',timeout:20000});
 assert.equal(await second.locator('#world').count(),0);
 assert.equal(await second.locator('#ai-workspace').count(),0);
 console.log('STAR CATCHER','standalone game without embedded website PASS');
 assert.deepEqual(errors,[],'Page errors: '+JSON.stringify(errors));
 console.log('NEXORA MINECRAFT BROWSER E2E PASS');
}finally{await browser.close();}
