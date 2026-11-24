import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/opt/google/chrome/chrome'].find(existsSync);
assert.ok(chrome,'Chrome not installed');
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const modelHTML="<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>body{margin:0;background:#0a1023;color:#fff;font:600 13px system-ui}canvas{width:100%;height:auto;touch-action:none}</style></head><body><h3>Объёмный мир</h3><canvas id=\"scene\" width=\"720\" height=\"420\"></canvas><script>\n(function(){\nconst canvas=document.getElementById(\"scene\"),gl=canvas.getContext(\"webgl\",{antialias:true});\nif(!gl)throw Error(\"WebGL unavailable\");\nfunction shader(t,src){const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}\nconst v=shader(gl.VERTEX_SHADER,\"attribute vec3 position;uniform float theta;void main(){float c=cos(theta),s=sin(theta);vec3 p=vec3(position.x*c-position.z*s,position.y,position.x*s+position.z*c);gl_Position=vec4(p.x*0.7,p.y*0.7,p.z*0.15,-p.z+3.3);gl_PointSize=12.0;}\");\nconst f=shader(gl.FRAGMENT_SHADER,\"precision mediump float;void main(){gl_FragColor=vec4(0.49,0.76,1.0,1.0);}\");\nconst pr=gl.createProgram();gl.attachShader(pr,v);gl.attachShader(pr,f);gl.linkProgram(pr);gl.useProgram(pr);\nconst points=new Float32Array([0,1,0,-1,-1,1,1,-1,1,0,1,0,1,-1,1,0,-1,-1,0,1,0,0,-1,-1,-1,-1,1,0,1,0,-1,-1,1,0,-1,-1,0,1,0,0,-1,-1,1,-1,1,0,1,0,1,-1,1,0,-1,-1]);\nconst buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,points,gl.STATIC_DRAW);\nconst loc=gl.getAttribLocation(pr,\"position\");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);\nlet angle=0;document.addEventListener(\"keydown\",e=>{if(e.key===\"ArrowLeft\")angle-=0.2;if(e.key===\"ArrowRight\")angle+=0.2});\ndocument.addEventListener(\"nexora-game-look\",e=>{angle+=e.detail.dx*0.01;canvas.dataset.look=\"yes\"});\nfunction draw(){gl.viewport(0,0,720,420);gl.clearColor(0.05,0.08,0.2,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.uniform1f(gl.getUniformLocation(pr,\"theta\"),angle);gl.drawArrays(gl.TRIANGLES,0,18);requestAnimationFrame(draw)}draw();\n})();</script></body></html>";
 let received=null;
 await page.route('**/api/game/code',async route=>{
  received=JSON.parse(route.request().postData());
  await new Promise(resolve=>setTimeout(resolve,1000));
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,title:received.idea,source:'ai',provider:'E2E WebGL simulated provider',dimension:'3d',html:modelHTML})});
 });
 await page.goto('https://nexora-lobby.onrender.com/game',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('[data-game-dimension="3d"]').click();
 assert.equal(await page.locator('[data-game-dimension="3d"]').getAttribute('aria-pressed'),'true');
 const query='3D лабиринт от первого лица с ловушками';
 await page.locator('#ai-idea').fill(query);
 await page.locator('#ai-build').click();
 await page.locator('#ai-loading').waitFor({state:'visible',timeout:10000});
 assert.equal(await page.locator('#ai-placeholder').evaluate(el=>el.classList.contains('is-building')),true);
 const animation=await page.locator('.ai-voxel').evaluate(el=>getComputedStyle(el).animationName);
 assert.ok(animation.includes('ai-spin'),'No 3D cube animation: '+animation);
 console.log('CREATION ANIMATION','code editor to spinning cube=OK');
 await page.waitForFunction(()=>document.querySelector('#ai-frame')?.getAttribute('src')?.startsWith('/game/preview/'),{timeout:30000});
 assert.equal(received.idea,query);
 assert.equal(received.dimension,'3d');
 const frame=await (await page.locator('#ai-frame').elementHandle()).contentFrame();
 await frame.locator('#scene').waitFor({state:'visible',timeout:30000});
 await page.waitForTimeout(600);
 const webgl=await frame.evaluate(()=>{
  const c=document.querySelector('#scene'),gl=c.getContext('webgl');
  if(!gl)return {available:false};
  const pixel=new Uint8Array(4);gl.readPixels(10,10,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  return {available:true,pixel:Array.from(pixel),error:gl.getError()};
 });
 assert.ok(webgl.available,'Real sandboxed WebGL context could not initialize');
 assert.equal(webgl.error,0,'WebGL renderer generated an error');
 assert.equal(webgl.pixel[3],255,'WebGL did not render an opaque canvas');
 console.log('3D WEBGL RENDER',webgl,'SUCCESS');

 await frame.evaluate(()=>{
  window.__swipes=[];
  document.addEventListener('keydown',e=>window.__swipes.push(e.key));
  document.addEventListener('nexora-game-look',e=>window.__swipes.push('look'));
 });
 await page.locator('#ai-frame').scrollIntoViewIfNeeded();
 await page.waitForTimeout(550);
 const rect=await frame.locator('#scene').boundingBox();
 assert.ok(rect);
 const cdp=await page.context().newCDPSession(page);
 const x=rect.x+rect.width*.57,y=rect.y+rect.height*.53;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+90,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(200);
 const keys=await frame.evaluate(()=>window.__swipes);
 assert.ok(keys.includes('ArrowRight'),'Swipe right did not generate arrow: '+keys);
 assert.ok(keys.includes('look'),'Swipe did not send first-person camera delta: '+keys);
 console.log('3D CAMERA GESTURE',keys,'SUCCESS');

 await page.locator('[data-game-arrow="left"]').click();
 await page.waitForTimeout(120);
 assert.ok((await frame.evaluate(()=>window.__swipes)).includes('ArrowLeft'),'D-pad left failed');
 await page.locator('#ai-code-tab').click();
 assert.equal(await page.locator('#ai-code-view').isVisible(),true);
 assert.match(await page.locator('#ai-source').inputValue(),/getContext\("webgl"/);
 console.log('3D SOURCE EDITOR','WebGL code visible');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#ai-download').click()]);
 assert.ok(download.suggestedFilename().endsWith('.html'));
 console.log('3D WEBGL DOWNLOAD',download.suggestedFilename());
 assert.deepEqual(errors,[],'Runtime errors: '+JSON.stringify(errors));
 console.log('NEXORA WEBGL 3D MOBILE BROWSER ACCEPTANCE PASS');
}finally{await browser.close();}
