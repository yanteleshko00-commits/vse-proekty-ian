import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 10000);
const here = fileURLToPath(new URL('.', import.meta.url));
const lobby = (process.env.NEXORA_LOBBY_URL || 'https://nexora-lobby.onrender.com').replace(/\/+$/, '');
const bridgeToken = (process.env.MATH_BRIDGE_TOKEN || '').trim();
const rates = new Map();
let active = 0;
function respond(res, code, data, headers = {}) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers
  });
  res.end(JSON.stringify(data));
}
function allowRequest(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 80);
  const now = Date.now();
  const record = rates.get(ip) || [];
  const recent = record.filter(t => now - t < 3600000);
  if (recent.filter(t => now - t < 60000).length >= 4 || recent.length >= 25) return false;
  recent.push(now);
  rates.set(ip, recent);
  if (rates.size > 2000) for (const [key, times] of rates) {
    if (times.every(t => now - t > 3600000)) rates.delete(key);
  }
  return true;
}
async function readJson(req, limit = 12000) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) throw new Error('JSON required');
  let len = 0;
  const chunks = [];
  for await (const chunk of req) {
    len += chunk.length;
    if (len > limit) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { return respond(res, 400, { message: 'Некорректный адрес.' }); }
  if (req.method === 'GET' && url.pathname === '/health') return respond(res, 200, {
    ok: true, service: 'nexora-math-studio', bridgeConfigured: bridgeToken.length >= 32
  });
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = await readFile(join(here, 'index.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
      });
      return res.end(html);
    } catch (error) {
      console.error('Math Studio page failed:', error.message);
      return respond(res, 500, { message: 'Страница временно недоступна.' });
    }
  }
  if (req.method !== 'POST' || url.pathname !== '/api/solve') return respond(res, 404, { message: 'Не найдено.' });
  if (!bridgeToken || bridgeToken.length < 32) return respond(res, 503, { message: 'ИИ-сервис ещё подключается. Повторите попытку позже.' });
  if (!allowRequest(req)) return respond(res, 429, { message: 'Слишком много запросов. Попробуйте через некоторое время.' });
  if (active >= 4) return respond(res, 503, { message: 'Сервис занят. Попробуйте чуть позже.' });
  let input;
  try { input = await readJson(req); }
  catch { return respond(res, 400, { message: 'Условие задачи передано неверно.' }); }
  const problem = typeof input.problem === 'string' ? input.problem.trim() : '';
  const kind = ['auto', 'algebra', 'geometry'].includes(input.kind) ? input.kind : 'auto';
  const grade = Math.max(5, Math.min(11, Number.isInteger(input.grade) ? input.grade : 8));
  if (problem.length < 5 || problem.length > 4000) return respond(res, 400, {
    message: 'Условие должно содержать от 5 до 4000 символов.'
  });
  active++;
  try {
    const upstream = await fetch(lobby + '/api/math/internal/solve', {
      method: 'POST', headers: {
        'Content-Type': 'application/json', 'x-nexora-math-key': bridgeToken
      },
      body: JSON.stringify({ problem, kind, grade }),
      signal: AbortSignal.timeout(90000)
    });
    const json = await upstream.json().catch(() => ({}));
    return respond(res, upstream.status, json && typeof json === 'object' ? json : { message: 'Некорректный ответ ИИ.' });
  } catch (error) {
    console.error('Math Studio gateway failed:', error.message);
    return respond(res, 502, { message: 'Не удалось связаться с ИИ. Попробуйте ещё раз.' });
  } finally { active--; }
});
server.requestTimeout = 95000;
server.listen(port, '0.0.0.0', () => {
  console.log('NEXORA Math Studio listening on port ' + port);
  console.log('Math gateway configured:', bridgeToken.length >= 32);
});
