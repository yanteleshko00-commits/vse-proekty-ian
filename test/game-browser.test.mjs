import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=26974,base='http://127.0.0.1:'+port;
const valid='<!doctype html><html><head><meta charset="utf-8"><title>Game</title></head><body><canvas width="720" height="420"></canvas><script>const c=document.querySelector("canvas"),x=c.getContext("2d");let n=0;document.addEventListener("keydown",e=>n++);function frame(){x.fillRect(n++,10,20,20);requestAnimationFrame(frame)}frame();</script></body></html>';
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
  assert.ok(bounds.width>=388&&bounds.height>=800,'player fills mobile viewport');
  assert.equal(await page.locator('#ai-frame').getAttribute('sandbox'),'allow-scripts');
  await page.locator('#ai-close-game').click();
  await page.locator('#ai-open-game').waitFor({state:'visible'});
  assert.equal(await page.locator('#ai-frame').getAttribute('src'),'about:blank');
  await page.locator('#ai-open-game').click();
  await page.locator('#ai-close-game').click();
  code=valid.replace('let n=0;','let n=0;throw new Error("test runtime bug");');
  await page.locator('#ai-build').click();
  await page.locator('#ai-error').waitFor({state:'visible',timeout:25000});
  assert.match(await page.locator('#ai-error').textContent(),/пробного запуска/i);
  assert.equal(await page.locator('#ai-open-game').isVisible(),false);
 }finally{await browser?.close();child.kill();}
});
