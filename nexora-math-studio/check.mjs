import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';
import { decodeAttachments } from './attachments.js';

const dir = fileURLToPath(new URL('.', import.meta.url));
const html = await readFile(join(dir, 'index.html'), 'utf8');
assert.match(html, /id="problem"/);
assert.match(html, /id="solve"/);
assert.match(html,/class="nx-argosha-host"/);
assert.match(html,/class="nx-argosha-greeting"/);
assert.match(html,/nx-argosha-orb::before/);
assert.match(html,/sessionStorage\.setItem\(key,"seen"\)/);
assert.match(html,/greeting\.hidden=false/);
assert.match(html,/argosha\/embed\?studio=math/);
assert.match(html,/class="nx-argosha-frame"/);
const mathServerText=await readFile(join(dir,'server.js'),'utf8');
assert.match(mathServerText,/frame-src https:\/\/nexora-lobby\.onrender\.com/);
for(const id of ["nxquiz","nxq-next","nxq-back","nxq-skip","nxq-question","nxq-preview","nxq-options","nxq-book"])
 assert.ok(html.includes('id="'+id+'"'),'Missing quiz item '+id);
assert.match(html,/role="dialog" aria-modal="true"/);
assert.match(html,/Шаг 1 из 5/);
assert.match(html,/solve\.addEventListener\("click",nxqOpenMath\)/);
assert.match(html,/nxqEl\("nxquiz"\)\.hidden=true;/);
assert.match(html,/void run\(\)/);
assert.match(html,/Какой раздел математики\?/);
assert.match(html,/Откуда взята задача\?/);
assert.match(html, /Двухэтажная дробь/);
assert.match(html, /Дробь 5\/8/);
assert.match(html, /function mathText\(/);
assert.match(html, /stacked-fraction/);
assert.match(html, /NEXORA Math Studio unified pastel loading and empty states/);
assert.match(html, /\.preview:not\(\.has-result\) \.stage/);
assert.match(html, /\.stage \.loader h3\{color:#29213f/);
assert.match(html, /\.formula-part span\.stacked-fraction/);

assert.match(html, /id="loader-elapsed"/);
assert.match(html, /id="cancel-solve"/);
assert.match(html, /requestController\.abort\(\)/);
assert.match(html, /controller\.signal/);
assert.match(html, /Превышено время ожидания ИИ/);

assert.match(html, /Делить на|делить на/);

assert.match(html, /data-mode="probability_statistics"/);
assert.doesNotMatch(html, /data-mode="probability"/);
assert.doesNotMatch(html, /data-mode="statistics"/);
assert.match(html, /id="program-source"/);
assert.match(html, /id="publisher-source"/);
assert.match(html, /Обозначения/);
assert.match(html, /Подстановка/);
assert.match(html, /Вычисление/);
assert.match(html, /id="level"/);
assert.match(html, /id="source-mode"/);
assert.match(html, /id="textbook"/);
assert.match(html, /data-kind="probability_statistics"/);
assert.match(html, /level:\$\("level"\)\.value/);
assert.match(html, /textbook:\$\("source-mode"\)/);

assert.match(html, /Дано/);
assert.match(html, /Найти/);
assert.match(html, /Решение/);
assert.match(html, /Ответ/);
assert.match(html, /Считаю/);
assert.match(html, /Строю чертёж/);
assert.match(html, /overflow-x:hidden/);
const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(js);
new vm.Script(js);
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
assert.ok(style);
assert.equal((style.match(/{/g) || []).length, (style.match(/}/g) || []).length);
assert.match(style, /\.formula-part\s*>\s*span\s*\{/);
assert.doesNotMatch(style, /\.formula-part\s+span\s*\{/);
assert.match(style, /\.formula-part\s+\.stacked-fraction\s*\{[^}]*display:inline-grid/);
assert.match(style, /\.result-step\s*\{[^}]*minmax\(0,1fr\)/);




const formatSource=js.slice(js.indexOf('function mathText('),js.indexOf('function section(',js.indexOf('function mathText(')));
assert.ok(formatSource.includes('const fraction='));
const fakeDocument={
  createTextNode: value=>({tag:'#text',textContent:value}),
  createElement:tag=>({
    tag,children:[],attributes:{},
    appendChild(child){this.children.push(child)},
    append(...children){this.children.push(...children)},
    setAttribute(key,value){this.attributes[key]=value}
  })
};
const formatter = vm.runInNewContext(
  '(function(){function make(tag,cls,text){const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=String(text);return el;}' +
  formatSource + 'return mathText;})()',
  {document:fakeDocument}
);
const equation=fakeDocument.createElement('span');
formatter(equation,'S = (1/2) × a × b');
const eqFraction=equation.children.find(child=>child.className==='stacked-fraction');
assert.ok(eqFraction,'fraction remains inline');
assert.equal(eqFraction.children[0].children[0].textContent,'1');
assert.equal(eqFraction.children[1].children[0].textContent,'2');
assert.equal(equation.children[0].textContent,'S = ');
assert.equal(equation.children[equation.children.length-1].textContent,' × a × b');
const nested=fakeDocument.createElement('span');
formatter(nested,'(1/2)/(3/4)');
assert.equal(nested.children.length,1,'nested fractions form one stacked expression');
assert.equal(nested.children[0].className,'stacked-fraction');

assert.match(html, /id="attachment-input"/);
assert.match(html, /id="camera-input"/);
assert.match(html, /id="attachment-list"/);
assert.match(html, /prepareAttachments/);
assert.match(html, /compressedImage/);
const txtBytes = Buffer.from('Решите уравнение 2x + 3 = 7', 'utf8');
const txt = {name:'задача.txt',data:'data:text/plain;base64,'+txtBytes.toString('base64')};
const parsedText = await decodeAttachments([txt]);
assert.match(parsedText.documentText, /2x \+ 3 = 7/);
assert.equal(parsedText.images.length, 0);
const jpeg = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]);
const photo = {name:'задача.jpg',data:'data:image/jpeg;base64,'+jpeg.toString('base64')};
const parsedPhoto = await decodeAttachments([photo]);
assert.equal(parsedPhoto.images.length,1);
assert.equal(parsedPhoto.images[0].mime,'image/jpeg');
await assert.rejects(decodeAttachments([{
  name:'неверный.pdf',
  data:'data:application/pdf;base64,'+Buffer.from('Not a PDF').toString('base64')
}]), /Некорректный формат документа/);
await assert.rejects(decodeAttachments([txt,txt,txt,txt]), /не более трёх/);
await assert.rejects(decodeAttachments([{
  name:'not_jpeg.jpg',
  data:'data:image/jpeg;base64,'+Buffer.from('bad image').toString('base64')
}]), /Не удалось проверить изображение/);

const port = 15000 + (process.pid % 20000);
const child = spawn(process.execPath, [join(dir, 'server.js')], {
  env: { ...process.env, PORT: String(port), MATH_BRIDGE_TOKEN: '' },
  stdio: 'ignore'
});
try {
  let response;
  for (let i = 0; i < 30; i++) {
    try {
      response = await fetch('http://127.0.0.1:' + port + '/health');
      if (response.ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(response?.ok, 'health endpoint did not become ready');
  const health = await response.json();
  assert.equal(health.service, 'nexora-math-studio');
  assert.equal(health.bridgeConfigured, false);
  const homepage = await fetch('http://127.0.0.1:' + port + '/');
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /NEXORA Math Studio/);
  const unavailable = await fetch('http://127.0.0.1:' + port + '/api/solve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem: '2x + 3 = 7' })
  });
  assert.equal(unavailable.status, 503);
  console.log('Math Studio checks passed: topic modes, grade/level/textbook inputs, attachments, JS, responsive CSS, health and safe API.');
} finally {
  child.kill();
}
