import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const dir = fileURLToPath(new URL('.', import.meta.url));
const html = await readFile(join(dir, 'index.html'), 'utf8');
assert.match(html, /id="problem"/);
assert.match(html, /id="solve"/);
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
  console.log('Math Studio checks passed: HTML, JS, responsive CSS, health, homepage and safe unconfigured API.');
} finally {
  child.kill();
}
