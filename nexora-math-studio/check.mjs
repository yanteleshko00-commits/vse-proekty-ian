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
assert.match(html, /data-mode="probability"/);
assert.match(html, /data-mode="statistics"/);
assert.match(html, /id="level"/);
assert.match(html, /id="source-mode"/);
assert.match(html, /id="textbook"/);
assert.match(html, /data-kind="probability"/);
assert.match(html, /data-kind="statistics"/);
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
