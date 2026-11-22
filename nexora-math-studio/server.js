import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAttachments } from './attachments.js';

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
  try { input = await readJson(req, 10500000); }
  catch { return respond(res, 400, { message: 'Некорректные данные или слишком большой файл (до 7 МБ вложений).' }); }
  const problem = typeof input.problem === 'string' ? input.problem.trim() : '';
  const kind = ['probability','statistics','probability_statistics'].includes(input.kind)
    ? 'probability_statistics'
    : ['auto','algebra','geometry'].includes(input.kind) ? input.kind : 'auto';
  const level = ['basic', 'advanced'].includes(input.level) ? input.level : 'basic';
  const textbook = typeof input.textbook === 'string' ? input.textbook.trim().slice(0, 220) : '';
  const grade = Math.max(5, Math.min(11, Number.isInteger(input.grade) ? input.grade : 8));
  if (problem.length > 4000) return respond(res, 400, { message: 'Текстовое условие не должно превышать 4000 символов.' });
  let attachments;
  try { attachments = await decodeAttachments(input.attachments); }
  catch (error) { return respond(res, error.statusCode || 400, { message: error.message || 'Не удалось открыть вложение.' }); }
  if (problem.length < 5 && !attachments.documentText && !attachments.images.length) {
    return respond(res, 400, { message: 'Напишите условие или прикрепите фото либо документ с задачей.' });
  }
  const combinedProblem = [problem,attachments.documentText].filter(Boolean).join('\n\n');
  if (combinedProblem.length > 9800) return respond(res, 400, {message:'Слишком много текста в файлах. Прикрепите документ с одной-двумя задачами.'});
  active++;
  try {
    const upstream = await fetch(lobby + '/api/math/internal/solve', {
      method: 'POST', headers: {
        'Content-Type': 'application/json', 'x-nexora-math-key': bridgeToken
      },
      body: JSON.stringify({ problem: combinedProblem, kind, grade, level, textbook, images: attachments.images }),
      signal: AbortSignal.timeout(attachments.images.length ? 165000 : 102000)
    });
    const json = await upstream.json().catch(() => ({}));
    return respond(res, upstream.status, json && typeof json === 'object' ? json : { message: 'Некорректный ответ ИИ.' });
  } catch (error) {
    console.error('Math Studio gateway failed:', error.message);
    return respond(res, 502, { message: 'Не удалось связаться с ИИ. Попробуйте ещё раз.' });
  } finally { active--; }
});
server.requestTimeout = 190000;
server.listen(port, '0.0.0.0', () => {
  console.log('NEXORA Math Studio listening on port ' + port);
  console.log('Math gateway configured:', bridgeToken.length >= 32);
  // Explicitly opt-in to one diagnostic generation after startup; never run by default.
  if (process.env.MATH_SMOKE_TEST === '1') {
    setTimeout(async () => {
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({problem: 'Решите уравнение 2x + 3 = 7.', kind: 'algebra', grade: 6}),
          signal: AbortSignal.timeout(85000)
        });
        const json = await response.json().catch(() => ({}));
        const valid = Boolean(response.ok && json.ok && json.solution?.answer && json.solution?.steps?.length);
        console.info('MATH_SMOKE_RESULT', JSON.stringify({
          passed: valid, status: response.status,
          provider: valid ? json.provider : undefined,
          reason: valid ? undefined : String(json.error || json.message || 'invalid_answer').slice(0, 120)
        }));
      } catch (error) {
        console.error('MATH_SMOKE_RESULT', JSON.stringify({passed: false, reason: error.message}));
      }
    }, 2500);
  }
  if (process.env.MATH_IMAGE_SMOKE_TEST === '1') {
    setTimeout(async () => {
      try {
        const { mathTestImage } = await import('./test-image.mjs');
        const image = mathTestImage();
        const response = await fetch('http://127.0.0.1:' + port + '/api/solve', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ problem:'',kind:'auto',grade:7,attachments:[{
            name:'math-test.png',data:'data:image/png;base64,'+image.toString('base64')
          }]}),
          signal:AbortSignal.timeout(130000)
        });
        const json=await response.json().catch(()=>({}));
        const answer=String(json.solution?.answer || '');
        console.info('MATH_IMAGE_SMOKE_RESULT',JSON.stringify({
          passed: Boolean(response.ok && json.ok && answer && /2/.test(answer)),
          status:response.status,provider:json.provider,
          reason:response.ok ? undefined : String(json.error || json.message || 'invalid_solution').slice(0,140)
        }));
      } catch(error) {
        console.error('MATH_IMAGE_SMOKE_RESULT',JSON.stringify({passed:false,reason:error.message}));
      }
    }, 2800);
  }
  if (process.env.MATH_TOPIC_SMOKE_TEST === '1') {
    setTimeout(async () => {
      const cases = [
        {name:'probability',kind:'probability',grade:8,problem:'В коробке 5 красных и 3 синих шара. Выбирают один шар. Какова вероятность выбрать красный?'},
        {name:'statistics',kind:'statistics',grade:8,problem:'Даны данные: 2, 3, 3, 5, 7. Найдите среднее арифметическое, медиану и моду.'}
      ];
      for (const sample of cases) {
        try {
          const res=await fetch('http://127.0.0.1:'+port+'/api/solve',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({...sample,level:'basic',textbook:'',attachments:[]}),
            signal:AbortSignal.timeout(88000)
          });
          const body=await res.json().catch(()=>({}));
          const answer=String(body.solution?.answer||'');
          const topicCheck=sample.kind==='probability' ? /(?:0[.,]625|5\s*\/\s*8)/.test(answer) : /(?=.*4)(?=.*3)/.test(answer);

          const expanded=(body.solution?.steps||[]).some(step=>step.formula&&step.symbols&&step.substitution&&step.calculation);
          const ok=Boolean(res.ok&&body.ok&&body.solution?.kind==='probability_statistics'&&body.solution?.steps?.length&&expanded&&topicCheck);
          console.info('MATH_TOPIC_SMOKE_RESULT',JSON.stringify({
            kind:sample.kind,passed:ok,status:res.status,provider:body.provider,
            answer:ok?answer.slice(0,140):undefined,
            reason:ok?undefined:String(body.error||body.message||'invalid_answer').slice(0,120)
          }));
        }catch(error){
          console.error('MATH_TOPIC_SMOKE_RESULT',JSON.stringify({kind:sample.kind,passed:false,reason:error.message}));
        }
      }
    },2900);
  }

});
