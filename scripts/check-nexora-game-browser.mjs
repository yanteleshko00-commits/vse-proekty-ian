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
 await page.locator('#ai-idea').fill('Ритм-игра: ударяй по светящимся нотам в такт и собирай комбинации');
 await page.locator('#ai-build').click();
 await page.locator('#ai-login-required').waitFor({state:'visible',timeout:30000});
 assert.equal(await page.locator('#ai-error').isVisible(),true);
 assert.match(await page.locator('#ai-error').textContent(),/NEXORA ID/);
 assert.match(await page.locator('#ai-login-required a').getAttribute('href'),/\/auth\/start/);
 assert.equal(await page.locator('#ai-result').isVisible(),false,'Guest should never receive a fake preset game');
 assert.equal(await page.locator('#ai-frame').getAttribute('src'),null);
 console.log('BROWSER FREE-FORM AI REQUEST','guest correctly prompted to sign in; no misleading preset');

 await page.reload({waitUntil:'domcontentloaded',timeout:60000});
 assert.equal(await page.locator('#ai-idea').inputValue(),
   'Ритм-игра: ударяй по светящимся нотам в такт и собирай комбинации',
   'User description should survive sign-in navigation/reload');
 console.log('BROWSER IDEA DRAFT','custom gameplay description persisted');

 // Sample buttons provide descriptions, not prebuilt games.
 await page.getByRole('button',{name:/Платформер/}).first().click();
 await page.locator('#ai-login-required').waitFor({state:'visible',timeout:20000});
 assert.equal(await page.locator('#ai-result').isVisible(),false);
 console.log('BROWSER EXAMPLE','submitted to AI-only route rather than fixed template');

 await page.locator('#ai-classic-toggle').click();
 assert.equal(await page.locator('#classic-workspace').isVisible(),true);
 console.log('BROWSER CLASSIC GAMES','clearly separate from AI generator');

 assert.deepEqual(errors,[],'JavaScript page errors: '+JSON.stringify(errors));
 console.log('NEXORA GAME STUDIO AI-ONLY MOBILE E2E PASS');
}finally{await browser.close();}
