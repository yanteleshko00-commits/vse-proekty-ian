import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/opt/google/chrome/chrome'].find(existsSync);
assert.ok(chrome,'GitHub runner has no Google Chrome / Chromium installed');
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('https://nexora-lobby.onrender.com/game',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('#ai-idea').fill('Гонки на машине с препятствиями');
 await page.locator('#ai-build').click();
 await page.waitForFunction(()=>document.querySelector('#ai-frame')?.getAttribute('src')?.startsWith('/game/preview/'),{timeout:70000});
 const handle=await page.locator('#ai-frame').elementHandle();
 const gameFrame=await handle.contentFrame();
 assert.ok(gameFrame,'Sandboxed preview frame is missing');
 await gameFrame.locator('#play').waitFor({state:'visible',timeout:30000});
 const visible=await gameFrame.evaluate(()=>{
   const c=document.getElementById('play');
   const ctx=c.getContext('2d');
   const pixel=ctx.getImageData(200,200,1,1).data;
   return {width:c.width,height:c.height,alpha:pixel[3],title:document.title};
 });
 assert.equal(visible.width,720);
 assert.equal(visible.height,420);
 assert.equal(visible.alpha,255,'The game canvas is blank or not painting');
 console.log('BROWSER GAME',visible,'PLAYABLE CANVAS');

 await gameFrame.evaluate(()=>{
   window.__nexoraTestKeys=[];
   document.addEventListener('keydown',event=>window.__nexoraTestKeys.push(event.key));
 });
 const rectangle=await gameFrame.locator('#play').boundingBox();
 assert.ok(rectangle);
 const cdp=await page.context().newCDPSession(page);
 const x=rectangle.x+rectangle.width*.67,y=rectangle.y+rectangle.height*.56;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(300);
 const keys=await gameFrame.evaluate(()=>window.__nexoraTestKeys);
 assert.ok(keys.includes('ArrowLeft'),'Swipe left did not trigger ArrowLeft: '+JSON.stringify(keys));
 console.log('BROWSER SWIPE','left -> ArrowLeft','SUCCESS');

 await page.locator('#ai-code-tab').click();
 assert.equal(await page.locator('#ai-code-view').isVisible(),true);
 const source=await page.locator('#ai-source').inputValue();
 assert.ok(source.includes('racing'));
 await page.locator('#ai-source').fill(source.replace('Гонки','Супергонки'));
 await page.locator('#ai-run-code').click();
 await page.waitForFunction(()=>document.querySelector('#ai-game-view')?.hidden===false&&document.querySelector('#ai-code-view')?.hidden===true,{timeout:30000});
 assert.equal(await page.locator('#ai-game-view').isVisible(),true);
 console.log('BROWSER CODE EDITOR','recompile and play','SUCCESS');

 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#ai-download').click()]);
 assert.ok(download.suggestedFilename().endsWith('.html'));
 console.log('BROWSER DOWNLOAD',download.suggestedFilename(),'SUCCESS');
 assert.equal(errors.length,0,'Browser errors: '+JSON.stringify(errors));
 console.log('NEXORA GAME BROWSER E2E PASS');
}finally{await browser.close();}
