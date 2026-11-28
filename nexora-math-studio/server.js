import {createHttpGuard} from './http-guard.js';
const httpGuard=createHttpGuard();
import {studioAccount} from './studio-account.js';
import {serviceConfig,publicHtml,boundedInt,allowStartupSmoke,createRateLimiter,clientIP} from './runtime-config.js';
const serviceUrls=serviceConfig();
import {readPublicFile,sendPublicAsset} from './public-performance.js';
import {backgroundJSON} from './background-jobs.js';
import {handleAnalytics,injectAnalytics} from './visitor-analytics.js';
import {serveBrand} from './brand.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAttachments } from './attachments.js';

const port = Number(process.env.PORT || 10000);
const here = fileURLToPath(new URL('.', import.meta.url));
const lobby=serviceUrls.lobby;
const bridgeToken = (process.env.MATH_BRIDGE_TOKEN || '').trim();
const account=studioAccount({name:'math',lobby,key:bridgeToken});
const concurrency=boundedInt(process.env.MATH_CONCURRENCY,4,1,8);
const rate=createRateLimiter({minute:boundedInt(process.env.MATH_RATE_MINUTE,4,1,60),hour:boundedInt(process.env.MATH_RATE_HOUR,25,1,600)});
let active = 0;
function respond(res, code, data, headers = {}) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers
  });
  res.end(JSON.stringify(data));
}
function allowRequest(req){return rate(clientIP(req));}

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
const backgroundMath=backgroundJSON('math',(req,res)=>account.run(req,res,solveMath),{maxActive:concurrency,maxBody:10500000});
const server = http.createServer(httpGuard.wrap(async (req, res) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { return respond(res, 400, { message: 'Некорректный адрес.' }); }
  if(['/api/visitors/ping','/nexora-visitors.js','/internal/visitors/ingest'].includes(url.pathname)&&await handleAnalytics(req,res,url.pathname,{site:'nexora-math-studio'}))return;
  if(await account.route(req,res,url))return;
  if(serveBrand(req,res,url.pathname,"NEXORA Math Studio"))return;
  if (req.method === 'GET' && url.pathname === '/health') return respond(res, 200, {
    ok: true, service: 'nexora-math-studio', bridgeConfigured: bridgeToken.length >= 32, concurrency:{active,max:concurrency},protection:httpGuard.snapshot()
  });
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html=Buffer.from(injectAnalytics(publicHtml(await readPublicFile(join(here, 'index.html')))));
      return sendPublicAsset(req,res,'index.html',html,{
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-src "+serviceUrls.lobby+" "+serviceUrls.publicLobby+"; frame-ancestors 'none'; form-action 'self'"
      });
    } catch (error) {
      console.error('Math Studio page failed:', error.message);
      return respond(res, 500, { message: 'Страница временно недоступна.' });
    }
  }
  if (req.method !== 'POST' || url.pathname !== '/api/solve') return respond(res, 404, { message: 'Не найдено.' });
  return backgroundMath(req,res);
}));
async function solveMath(req,res){
  if (!bridgeToken || bridgeToken.length < 32) return respond(res, 503, { message: 'ИИ-сервис ещё подключается. Повторите попытку позже.' });
  if (!allowRequest(req)) return respond(res, 429, { message: 'Слишком много запросов. Попробуйте через некоторое время.' });
  if (active >= concurrency) return respond(res, 503, { message: 'Сервис занят. Попробуйте чуть позже.' });
  active++;
  try {
  let input;
  try { input = await readJson(req, 10500000); if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid input'); }
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
  try {
    const upstream = await fetch(lobby + '/api/math/internal/solve', {
      method: 'POST', headers: {
        'Content-Type': 'application/json', 'x-nexora-math-key': bridgeToken
      },
      body: JSON.stringify({ problem: combinedProblem, kind, grade, level, textbook, images: attachments.images }),
      signal: AbortSignal.timeout(attachments.images.length ? 165000 : 102000)
    });
    const json = await upstream.json().catch(() => null);
    if(!json||typeof json!=='object'||Array.isArray(json))return respond(res,502,{message:'ИИ вернул некорректный ответ. Попробуйте ещё раз.'});
    return respond(res, upstream.status, json);
  } catch (error) {
    console.error('Math Studio gateway failed:', error.message);
    return respond(res, 502, { message: 'Не удалось связаться с ИИ. Попробуйте ещё раз.' });
  }
  } finally { active--; }
}
server.requestTimeout = 190000;
server.headersTimeout=15000;
server.keepAliveTimeout=5000;
server.maxHeadersCount=80;
server.listen(port, '0.0.0.0', () => {
  console.log('NEXORA Math Studio listening on port ' + port);
  console.log('Math gateway configured:', bridgeToken.length >= 32);
  // Explicitly opt-in to one diagnostic generation after startup; never run by default.
  if (allowStartupSmoke('MATH_SMOKE_TEST')) {
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
  if (allowStartupSmoke('MATH_IMAGE_SMOKE_TEST')) {
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
  if (allowStartupSmoke('MATH_TOPIC_SMOKE_TEST')) {
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
