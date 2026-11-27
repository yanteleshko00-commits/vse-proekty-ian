import {backgroundJSON} from './background-jobs.js';
import {handleAnalytics,injectAnalytics} from './visitor-analytics.js';
import {serveBrand} from './brand.js';
import http from 'node:http';
import {requestGeminiImage, requestGeminiImageRelay, firstImageProvider, DEFAULT_IMAGE_MODEL} from './gemini-image.js';
import crypto from 'node:crypto';
import { internalAliceTokenValid, imageStudioAliceReady, forwardAliceText } from './alice-text.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(here, 'public');
const port = Number(process.env.PORT || 10000);
const production = process.env.NODE_ENV === 'production';

const yandexKey = (process.env.YANDEX_API_KEY || '').trim().replace(/^Api-Key\s+/i, '').trim();
const yandexFolderId = (process.env.YANDEX_FOLDER_ID || '').trim();
const yandexMissing = [
  ...(!yandexKey ? ['YANDEX_API_KEY'] : []),
  ...(!yandexFolderId ? ['YANDEX_FOLDER_ID'] : [])
];

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}

async function readJson(req, limit = 14 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('payload_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const studioAuthSecret=()=>String(process.env.NEXORA_STUDIO_AUTH_TOKEN||process.env.NEXORA_IMAGE_RELAY_TOKEN||'').trim();
const studioLobby=(process.env.NEXORA_LOBBY_URL||'https://nexora-lobby.onrender.com').replace(/\/$/,'');
function studioCookie(name,value,maxAge){return name+'='+encodeURIComponent(value)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+maxAge+(production?'; Secure':'');}
function studioReadCookie(req,name){for(const item of String(req.headers.cookie||'').split(';')){const i=item.indexOf('=');if(i>0&&item.slice(0,i).trim()===name){try{return decodeURIComponent(item.slice(i+1).trim());}catch{return '';}}}return '';}
function studioSign(value){return crypto.createHmac('sha256',studioAuthSecret()).update('image-studio-session-v1:'+value).digest('base64url');}
function makeStudioSession(account){
  const value=Buffer.from(JSON.stringify({...account,expiresAt:Date.now()+7*86400000})).toString('base64url');
  return value+'.'+studioSign(value);
}
function readStudioSession(req){
  if(studioAuthSecret().length<32)return null;
  const parts=studioReadCookie(req,'nexora_image_session').split('.');
  if(parts.length!==2||parts[0].length>512)return null;
  const a=Buffer.from(parts[1]),b=Buffer.from(studioSign(parts[0]));
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));return p.userId&&p.sessionId&&p.expiresAt>Date.now()?p:null;}catch{return null;}
}
async function studioCall(body){
  if(studioAuthSecret().length<32)throw Object.assign(Error('Авторизация Image Studio ещё не настроена.'),{status:503});
  const response=await fetch(studioLobby+'/internal/studio-auth',{method:'POST',headers:{'Content-Type':'application/json','x-nexora-studio-token':studioAuthSecret()},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(data.message||'Не удалось проверить NEXORA ID.'),{status:response.status});
  return data;
}
const studioJson={'Content-Type':'application/json; charset=utf-8','Referrer-Policy':'no-referrer'};
function studioStart(res){
  if(studioAuthSecret().length<32)return send(res,503,'Авторизация Image Studio ещё не настроена.');
  const state=crypto.randomBytes(32).toString('base64url');
  return send(res,302,'',{Location:studioLobby+'/auth/image?state='+encodeURIComponent(state),'Set-Cookie':studioCookie('nexora_image_state',state,600),'Referrer-Policy':'no-referrer'});
}
async function studioCallback(req,res,url){
  const state=url.searchParams.get('state')||'',ticket=url.searchParams.get('ticket')||'';
  const clear=studioCookie('nexora_image_state','',0);
  if(!/^[A-Za-z0-9_-]{43}$/.test(state)||state!==studioReadCookie(req,'nexora_image_state')||!/^[A-Za-z0-9_-]{43}$/.test(ticket))return send(res,400,'Сессия входа истекла. Повторите вход.',{'Set-Cookie':clear});
  try{
    const data=await studioCall({action:'exchange',state,ticket});
    if(!data.userId||!data.sessionId)throw Error('invalid_session');
    return send(res,302,'',{Location:'/','Set-Cookie':[clear,studioCookie('nexora_image_session',makeStudioSession({userId:data.userId,sessionId:data.sessionId}),604800)],'Referrer-Policy':'no-referrer'});
  }catch{return send(res,503,'Не удалось завершить вход. Повторите попытку.',{'Set-Cookie':clear,'Referrer-Policy':'no-referrer'});}
}
let imageInFlight=false;
async function protectedImage(req,res){
  const account=readStudioSession(req);
  // Guests use the existing IP limiter and global concurrency limit.
  if(imageInFlight)return send(res,429,JSON.stringify({error:'busy',message:'Генератор занят. Повторите запрос позже.'}),studioJson);
  imageInFlight=true;
  let reservationId=null,outcome='failure';
  try{
    if(account){
      const data=await studioCall({action:'reserve',userId:account.userId,sessionId:account.sessionId});
      reservationId=data.reservationId;
      if(!reservationId)throw Error('Не получен резерв кредитов.');
    }
    await generateNexoraImage(req,res);
    if(res.statusCode>=200&&res.statusCode<300)outcome='success';
  }catch(error){
    if(!res.headersSent){const status=Number(error.status);return send(res,status>=400&&status<600?status:503,JSON.stringify({error:'image_request_failed',message:String(error.message||'Сервис временно недоступен.').slice(0,160)}),studioJson);}
  }finally{
    if(reservationId)for(let i=0;i<3;i++){try{await studioCall({action:'finalize',reservationId,outcome});break;}catch(error){if(i===2)console.error('Image usage finalization failed:',reservationId,error.name);}}
    imageInFlight=false;
  }
}
const imageRate = new Map();
function allowArgosha(req) {
  const ip = String((process.env.RENDER === 'true' || process.env.TRUST_PROXY === 'true') ? (String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim() || req.socket.remoteAddress || 'unknown') : (req.socket.remoteAddress || 'unknown'));
  const now = Date.now();
  const recent = (imageRate.get(ip) || []).filter(time => now - time < 60000);
  if (recent.length >= 12) return false;
  recent.push(now);
  imageRate.set(ip, recent);
  if (imageRate.size > 1000) {
    for (const [key, times] of imageRate) {
      if (!times.some(time => now - time < 60000)) imageRate.delete(key);
    }
  }
  return true;
}

const imageSizes = {
  square: '1024x1024',
  portrait: '768x1024',
  landscape: '1024x768',
  vertical: '768x1360',
  wide: '1360x768'
};
const imageStyles = {
  realistic: 'photorealistic, realistic materials, natural lighting, highly detailed',
  cinematic: 'cinematic composition, dramatic light, rich atmosphere, film still',
  '3d': 'high-quality 3D render, refined materials, studio lighting, detailed 3D design',
  illustration: 'beautiful digital illustration, polished artwork, clear shapes and refined details',
  anime: 'anime art style, expressive clean linework, detailed anime background',
  watercolor: 'traditional watercolor painting, soft pigment texture, delicate brushwork'
};
function imageMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}
let gigaChatTokenCache = '';
let gigaChatTokenExpiresAt = 0;
let gigaChatTokenPromise = null;

function gigaChatKeys() {
  const normalize = value => String(value || '').trim().replace(/^Basic\s+/i, '').trim();
  const entries = [
    { keySlot: 'основной', key: normalize(process.env.GIGACHAT_API_KEY) },
    { keySlot: 'основной', key: normalize(process.env.GIGACHAT_AUTH_KEY) },
    { keySlot: 'резервный', key: normalize(process.env.GIGACHAT_BACKUP_AUTH) }
  ];
  return entries.filter((entry, index) => entry.key &&
    entries.findIndex(other => other.key === entry.key) === index);
}

function safeOAuthDiagnostic(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9._~+\/= -]+/gi, '$1 [скрыто]')
    .replace(/[A-Za-z0-9+/_=-]{40,}/g, '[скрыто]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 180);
}

async function getGigaChatAccessToken() {
  if (gigaChatTokenCache && Date.now() < gigaChatTokenExpiresAt - 60000) return gigaChatTokenCache;
  if (gigaChatTokenPromise) return gigaChatTokenPromise;

  const authKeys = gigaChatKeys();
  if (!authKeys.length) throw Object.assign(new Error('GigaChat is not configured'), {
    providerName: 'GigaChat', providerCode: 'not_configured', diagnosticStage: 'oauth',
    publicMessage: 'Ключ GigaChat не настроен.'
  });

  const scope = String(process.env.GIGACHAT_SCOPE || '').trim() || 'GIGACHAT_API_PERS';
  gigaChatTokenPromise = (async () => {
    let lastAuthError;
    const authAttempts = [];
    try {
      for (const authItem of authKeys) {
        try {
          const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json',
              'RqUID': crypto.randomUUID(),
              'Authorization': 'Basic ' + authItem.key
            },
            body: new URLSearchParams({ scope }),
            signal: AbortSignal.timeout(15000)
          }).catch(error => { throw networkFailure('GigaChat', 'oauth', error); });

          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.access_token) {
            const code = safeOAuthDiagnostic(data.error || data.code || 'oauth_failed', 'oauth_failed');
            const detail = safeOAuthDiagnostic(data.error_description || data.message || '', '');
            lastAuthError = Object.assign(new Error('GigaChat OAuth HTTP ' + response.status), {
              providerName: 'GigaChat',
              upstreamStatus: response.status,
              providerCode: code,
              diagnosticStage: 'oauth',
              diagnosticDetail: detail,
              publicMessage: response.status === 401 || response.status === 403
                ? 'GigaChat отклонил ключ сервиса. Администратору нужно проверить ключ авторизации и тип доступа проекта GigaChat в настройках Image Studio.'
                : 'GigaChat отклонил OAuth-запрос (HTTP ' + response.status + '). Проверьте scope и параметры авторизации.'
            });
            authAttempts.push({
              keySlot: authItem.keySlot,
              status: response.status,
              code,
              detail
            });
            continue;
          }

          console.info('GigaChat OAuth authorized; keySlot=' + authItem.keySlot + '; scope=' + scope);
          gigaChatTokenCache = String(data.access_token);
          const expires = Number(data.expires_at);
          gigaChatTokenExpiresAt = Number.isFinite(expires) && expires > 0
            ? (expires > 100000000000 ? expires : expires * 1000)
            : Date.now() + 25 * 60 * 1000;
          return gigaChatTokenCache;
        } catch (error) {
          lastAuthError = error;
          authAttempts.push({
            keySlot: authItem.keySlot,
            status: Number(error.upstreamStatus || 0),
            code: safeOAuthDiagnostic(error.providerCode || error.name || 'request_failed', 'request_failed'),
            detail: safeOAuthDiagnostic(error.publicMessage || error.message || '', '')
          });
        }
      }
      const failure = lastAuthError || new Error('GigaChat OAuth failed');
      failure.authAttempts = authAttempts;
      failure.oauthScope = scope;
      throw failure;
    } finally {
      gigaChatTokenPromise = null;
    }
  })();
  return gigaChatTokenPromise;
}
function providerFailure(providerName, status, code, message, stage = '') {
  return Object.assign(new Error(providerName + ' HTTP ' + status), {
    providerName,
    upstreamStatus: status,
    providerCode: String(code || 'provider_error'),
    diagnosticStage: stage,
    publicMessage: message
  });
}

function networkFailure(providerName, stage, error) {
  const causeCode = String(error?.cause?.code || error?.code || error?.name || 'network_error');
  return providerFailure(providerName, 0, causeCode, providerName + ' не удалось связаться с сервером на этапе ' + stage + '.', stage);
}

async function requestOpenAIImage({ apiKey, modelPrompt, size, detailed, imageFile, signal }) {
  const headers = { 'Authorization': 'Bearer ' + apiKey };
  let endpoint;
  let requestBody;
  if (imageFile) {
    endpoint = 'https://api.openai.com/v1/images/edits';
    requestBody = new FormData();
    requestBody.append('model', 'gpt-image-2');
    requestBody.append('prompt', modelPrompt);
    requestBody.append('size', size);
    requestBody.append('quality', detailed ? 'high' : 'medium');
    requestBody.append('output_format', 'png');
    requestBody.append('image[]', new Blob([imageFile.bytes], { type: imageFile.mime }), imageFile.name);
  } else {
    endpoint = 'https://api.openai.com/v1/images/generations';
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify({
      model: 'gpt-image-2',
      prompt: modelPrompt,
      size,
      quality: detailed ? 'high' : 'medium',
      output_format: 'png'
    });
  }
  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: requestBody,
    signal: AbortSignal.any([signal, AbortSignal.timeout(180000)])
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const providerError = payload.error || {};
    const code = String(providerError.code || providerError.type || 'unknown_error');
    let message = 'OpenAI не смог создать изображение (HTTP ' + upstream.status + ').';
    if (upstream.status === 401 || upstream.status === 403) {
      message = 'OpenAI не принял API-ключ. Проверьте OPENAI_API_KEY в Render.';
    } else if (upstream.status === 429) {
      const balanceCodes = ['insufficient_quota', 'billing_hard_limit_reached', 'credit_balance_exhausted'];
      if (balanceCodes.includes(code)) {
        message = 'Баланс API-аккаунта OpenAI исчерпан или достигнут лимит расходов.';
      } else {
        message = 'OpenAI временно ограничил частоту запросов.';
      }
    } else if (upstream.status === 400) {
      message = code === 'moderation_blocked'
        ? 'Запрос не прошёл проверку безопасности. Измените описание изображения.'
        : 'OpenAI не принял запрос. Проверьте описание и параметры изображения.';
    }
    throw providerFailure('OpenAI', upstream.status, code, message);
  }
  const encoded = payload.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded) {
    throw providerFailure('OpenAI', 502, 'image_missing', 'OpenAI не вернул файл изображения.');
  }
  const imageBytes = Buffer.from(encoded, 'base64');
  if (!imageBytes.length || imageBytes.length > 18000000 || imageMime(imageBytes) !== 'image/png') {
    throw providerFailure('OpenAI', 502, 'invalid_image', 'OpenAI вернул некорректный файл изображения.');
  }
  return {
    image: 'data:image/png;base64,' + imageBytes.toString('base64'),
    provider: 'OpenAI',
    model: 'GPT Image 2'
  };
}

async function requestAliceImage({ apiKey, folderId, modelPrompt, ratio, detailed, signal }) {
  // Use only parameters documented as supported for Alice AI ART 3.0.
  // The API returns the final image in data[0].b64_json.
  const yandexSizes = {
    square: '1024x1024',
    portrait: '1024x1536',
    landscape: '1536x1024',
    vertical: '1024x1536',
    wide: '1536x1024'
  };
  const upstream = await fetch('https://ai.api.cloud.yandex.net/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': 'Api-Key ' + apiKey,
      'OpenAI-Project': folderId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'art://' + folderId + '/aliceai-image-art-3.0',
      prompt: String(modelPrompt).slice(0, 32000),
      size: yandexSizes[ratio] || '1024x1024'
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(180000)])
  }).catch(error => { throw networkFailure('Alice AI ART', 'image_generation', error); });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const code = safeOAuthDiagnostic(payload.error?.code || payload.error?.type || payload.code || 'yandex_error');
    const detail = safeOAuthDiagnostic(payload.error?.message || payload.message || payload.error_description || '');
    let msg = 'Alice AI ART не смог создать изображение (HTTP ' + upstream.status + ').';
    if (upstream.status === 401 || upstream.status === 403) {
      msg = 'Yandex AI Studio отклонил API-ключ или доступ. Проверьте ключ, его scope и роль ai.imageGeneration.user.';
    } else if (upstream.status === 429) {
      msg = 'Yandex AI Studio временно ограничил запросы или исчерпан лимит.';
    } else if (upstream.status === 400) {
      msg = 'Yandex AI Studio отклонил параметры генерации. Проверьте модель, каталог и размер.';
    }
    throw Object.assign(providerFailure('Alice AI ART', upstream.status, code, msg, 'image_generation'), { diagnosticDetail: detail });
  }
  const encoded = payload.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded) {
    throw providerFailure('Alice AI ART', 502, 'image_missing', 'Yandex не вернул файл изображения.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  const mime = imageMime(bytes);
  if (!mime || bytes.length > 18000000) {
    throw providerFailure('Alice AI ART', 502, 'invalid_image', 'Alice AI ART вернула некорректное изображение.');
  }
  return { image: 'data:' + mime + ';base64,' + bytes.toString('base64'), provider: 'Alice AI ART', model: 'Alice AI ART 3.0' };
}
async function requestGigaChatImage({ modelPrompt, ratio, detailed, signal }) {
  const token = await getGigaChatAccessToken();
  const orientation = {
    square: 'квадратная композиция 1:1',
    portrait: 'вертикальная композиция 3:4',
    landscape: 'альбомная композиция 4:3',
    vertical: 'высокая вертикальная композиция 9:16',
    wide: 'широкая альбомная композиция 16:9'
  }[ratio];
  const systemPrompt = 'Ты — профессиональный художник и генератор изображений. Создавай оригинальную визуальную работу строго по описанию пользователя. Стиль: ' +
    modelPrompt.slice(modelPrompt.indexOf('Visual style:') + 14) +
    '. Компоновка: ' + orientation +
    (detailed ? '. Максимально тщательно проработай мелкие детали, фактуры и освещение.' : '');
  const upstream = await fetch('https://api.giga.chat/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.GIGACHAT_IMAGE_MODEL || 'GigaChat-2-Max',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Нарисуй изображение по описанию: ' + modelPrompt }
      ],
      function_call: 'auto'
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(180000)])
  }).catch(error => { throw networkFailure('GigaChat', 'image_generation', error); });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = String(data.error?.message || data.message || data.error || 'provider_error').slice(0, 240);
    const selectedModel = process.env.GIGACHAT_IMAGE_MODEL || 'GigaChat-2-Max';
    const publicMessage = upstream.status === 401 || upstream.status === 403
      ? 'GigaChat отклонил запрос авторизации. Проверьте ключ и область доступа.'
      : upstream.status === 404
        ? 'GigaChat не нашёл модель или endpoint (HTTP 404). Проверьте GIGACHAT_IMAGE_MODEL; сейчас используется ' + selectedModel + '.'
        : 'GigaChat не смог создать изображение (HTTP ' + upstream.status + ').';
    throw providerFailure(
      'GigaChat',
      upstream.status,
      data.error?.code || detail,
      publicMessage,
      'image_generation'
    );
  }
  const content = data.choices?.[0]?.message?.content || '';
  const fileMatch = String(content).match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i) ||
    String(content).match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  const fileId = fileMatch && (fileMatch[1] || fileMatch[0]);
  if (!fileId || !/^[0-9a-f-]{20,}$/i.test(fileId)) {
    throw providerFailure('GigaChat', 502, 'image_missing', 'GigaChat ответил, но не вернул идентификатор изображения.');
  }
  const download = await fetch('https://api.giga.chat/v1/files/' + encodeURIComponent(fileId) + '/content', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/jpg' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)])
  }).catch(error => { throw networkFailure('GigaChat', 'image_download', error); });
  if (!download.ok) {
    throw providerFailure('GigaChat', download.status, 'image_download_failed', 'GigaChat создал изображение, но не удалось скачать результат.');
  }
  const imageBytes = Buffer.from(await download.arrayBuffer());
  const mime = imageMime(imageBytes);
  if (!imageBytes.length || imageBytes.length > 18000000 || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    throw providerFailure('GigaChat', 502, 'invalid_image', 'GigaChat вернул файл изображения неподдерживаемого формата.');
  }
  return {
    image: 'data:' + mime + ';base64,' + imageBytes.toString('base64'),
    provider: 'GigaChat',
    model: data.model || process.env.GIGACHAT_IMAGE_MODEL || 'GigaChat'
  };
}

async function generateNexoraImage(req, res) {
  const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
  if (!allowArgosha(req)) {
    return send(res, 429, JSON.stringify({ error: 'rate_limited', message: 'Слишком много запросов. Подождите минуту и попробуйте ещё раз.' }), jsonHeaders);
  }
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return send(res,415,JSON.stringify({error:'content_type',message:'Ожидается JSON-запрос.'}),jsonHeaders);
  let body;
  try { body = await readJson(req, 14 * 1024 * 1024); } catch (error) {
    return send(res, error.message === 'payload_too_large' ? 413 : 400, JSON.stringify({ error: 'invalid_request', message: 'Не удалось прочитать запрос. Попробуйте ещё раз.' }), jsonHeaders);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return send(res, 400, JSON.stringify({ error: 'invalid_request', message: 'Ожидается объект с описанием изображения.' }), jsonHeaders);
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 1200) : '';
  const ratio = typeof body.ratio === 'string' ? body.ratio : 'square';
  const style = typeof body.style === 'string' ? body.style : 'realistic';
  const detailed = body.quality === 'detailed';
  if (prompt.length < 4) return send(res, 400, JSON.stringify({ error: 'prompt_too_short', message: 'Опишите изображение чуть подробнее.' }), jsonHeaders);
  if (!Object.prototype.hasOwnProperty.call(imageSizes, ratio) || !Object.prototype.hasOwnProperty.call(imageStyles, style)) {
    return send(res, 400, JSON.stringify({ error: 'invalid_options', message: 'Выберите один из доступных форматов и стилей.' }), jsonHeaders);
  }

  let imageFile = null;
  if (typeof body.image === 'string' && body.image) {
    const comma = body.image.indexOf(',');
    const header = comma > 0 ? body.image.slice(0, comma) : '';
    const declaredMime = header === 'data:image/png;base64' ? 'image/png'
      : header === 'data:image/jpeg;base64' ? 'image/jpeg'
      : header === 'data:image/webp;base64' ? 'image/webp' : '';
    const encodedImage = comma > 0 ? body.image.slice(comma + 1) : '';
    if (!declaredMime || !encodedImage || !/^[A-Za-z0-9+/=]+$/.test(encodedImage)) {
      return send(res, 400, JSON.stringify({ error: 'invalid_image', message: 'Не удалось прочитать исходное изображение. Загрузите PNG, JPG или WebP.' }), jsonHeaders);
    }
    if (encodedImage.length > 12500000) {
      return send(res, 413, JSON.stringify({ error: 'image_too_large', message: 'Исходное изображение слишком большое. Выберите другое фото.' }), jsonHeaders);
    }
    const bytes = Buffer.from(encodedImage, 'base64');
    if (!bytes.length || bytes.length > 9000000 || imageMime(bytes) !== declaredMime) {
      return send(res, 400, JSON.stringify({ error: 'invalid_image', message: 'Файл изображения повреждён или имеет неподдерживаемый формат.' }), jsonHeaders);
    }
    const extension = declaredMime === 'image/jpeg' ? 'jpg' : declaredMime.split('/')[1];
    imageFile = { bytes, mime: declaredMime, name: 'reference.' + extension };
  }

  const openAIKey = String(process.env.OPENAI_API_KEY || '').trim();
  const hasGigaChat = gigaChatKeys().length > 0;
  const geminiKey=String(process.env.GEMINI_API_KEY||'').trim();
  const relayToken=String(process.env.NEXORA_IMAGE_RELAY_TOKEN||'').trim();
  const relayReady=relayToken.length>=32;
  const geminiModel=String(process.env.GEMINI_IMAGE_MODEL||DEFAULT_IMAGE_MODEL).trim()||DEFAULT_IMAGE_MODEL;
  const providers = [];
  if(relayReady)providers.push({name:'Gemini',run:signal=>requestGeminiImageRelay({
    token:relayToken,modelPrompt:prompt+'. Visual style: '+imageStyles[style]+(detailed?'. Fine details, carefully rendered textures, balanced composition.':''),
    ratio,imageFile,signal,imageMime
  })});
  else if(geminiKey)providers.push({name:'Gemini',run:signal=>requestGeminiImage({
    apiKey:geminiKey,model:geminiModel,modelPrompt:prompt+'. Visual style: '+imageStyles[style]+(detailed?'. Fine details, carefully rendered textures, balanced composition.':''),
    ratio,imageFile,signal,imageMime
  })});
  if (yandexKey && yandexFolderId && !imageFile) providers.push({ name: 'Alice AI ART', run: signal => requestAliceImage({
    apiKey: yandexKey, folderId: yandexFolderId,
    modelPrompt: prompt + '. Visual style: ' + imageStyles[style] + (detailed ? '. Fine details, carefully rendered textures, balanced composition.' : ''),
    ratio, detailed, signal
  }) });
  // Preserve existing alternatives only if neither preferred provider supports the request.
  const legacyOnly=providers.length===0;
  if (openAIKey && (legacyOnly || imageFile)) providers.push({ name: 'OpenAI', run: signal => requestOpenAIImage({
    apiKey: openAIKey,
    modelPrompt: prompt + '. Visual style: ' + imageStyles[style] +
      (detailed ? '. Fine details, carefully rendered textures, balanced composition.' : ''),
    size: imageSizes[ratio],
    detailed,
    imageFile,
    signal
  }) });
  if (legacyOnly && hasGigaChat && !imageFile) providers.push({ name: 'GigaChat', run: signal => requestGigaChatImage({
    modelPrompt: prompt + '. Visual style: ' + imageStyles[style] +
      (detailed ? '. Fine details, carefully rendered textures, balanced composition.' : ''),
    ratio,
    detailed,
    signal
  }) });


  if (!providers.length) {
    const editOnly = Boolean(imageFile && !openAIKey && !geminiKey && !relayReady);
    return send(res, 503, JSON.stringify({
      error: 'image_not_configured',
      message: editOnly
        ? 'Редактирование исходного фото требует GEMINI_API_KEY или OPENAI_API_KEY.'
        : 'Не подключён ни один генератор изображений. Добавьте GEMINI_API_KEY, OPENAI_API_KEY, GIGACHAT_API_KEY или YANDEX_API_KEY вместе с YANDEX_FOLDER_ID в Environment сервиса NEXORA на Render.'
    }), jsonHeaders);
  }

  try {
    const winner = await firstImageProvider(providers);
    console.info('NEXORA image generated:',winner.provider,winner.model);
    return send(res, 200, JSON.stringify({
      image: winner.image,
      provider: winner.provider,
      model: winner.model,
      providerOrder: providers.map(provider => provider.name)
    }), jsonHeaders);
  } catch (aggregateError) {
    const failures = Array.isArray(aggregateError.errors) ? aggregateError.errors : [aggregateError];
    const details = failures.map(error => ({
      provider: error.providerName || 'Неизвестный провайдер',
      status: error.upstreamStatus || 0,
      code: error.providerCode || error.name || 'request_failed',
      stage: error.diagnosticStage || 'unknown',
      message: error.publicMessage || 'Провайдер временно недоступен.',
      ...(error.oauthScope ? { oauthScope: error.oauthScope } : {}),
      ...(error.diagnosticDetail ? { detail: safeOAuthDiagnostic(error.diagnosticDetail) } : {}),
      ...(Array.isArray(error.authAttempts) ? { authAttempts: error.authAttempts } : {})
    }));
    const billingFailed = details.some(item =>
      item.provider === 'OpenAI' &&
      ['insufficient_quota', 'billing_hard_limit_reached', 'credit_balance_exhausted'].includes(item.code)
    );
    const message = details.length > 1
      ? 'Ни один подключённый генератор не завершил создание изображения. ' +
        details.map(item => item.provider + ': ' + item.message).join(' ')
      : (details[0]?.message || 'Все подключённые генераторы изображений временно недоступны.');
    console.error('NEXORA image providers failed:', JSON.stringify(details.map(({ provider, status, code, stage, oauthScope, detail, authAttempts }) => ({
      provider, status, code, stage, ...(oauthScope ? { oauthScope } : {}),
      ...(detail ? { detail } : {}), ...(authAttempts ? { authAttempts } : {})
    }))));
    const firstStatus = details[0]?.status;
    const status = details.every(item => item.status === 401 || item.status === 403) ? 503
      : !billingFailed && details.every(item => item.status === firstStatus) && [400, 422, 429].includes(firstStatus) ? firstStatus : 502;
    return send(res, status, JSON.stringify({
      error: 'all_image_providers_failed',
      message,
      providers: details.map(({ provider, status, code, stage, oauthScope, detail, authAttempts }) => ({
        provider, status, code, stage,
        ...(oauthScope ? { oauthScope } : {}),
        ...(detail ? { detail } : {}),
        ...(authAttempts ? { authAttempts } : {})
      }))
    }), jsonHeaders);
  }
}


// A secret-authenticated, server-to-server-only route. The Image Studio's
// Yandex API key and folder ID never leave its environment.
let aliceProxyWindow = { start: 0, count: 0 };
async function handleInternalAliceText(req, res) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (!internalAliceTokenValid(req.headers['x-nexora-internal-token'],
    process.env.ALICE_INTERNAL_TOKEN)) {
    return send(res, 403, JSON.stringify({ error: 'forbidden', message: 'Недоступно.' }), headers);
  }
  const now = Date.now();
  if (now - aliceProxyWindow.start > 60000) aliceProxyWindow = { start: now, count: 0 };
  if (++aliceProxyWindow.count > 60) {
    return send(res, 429, JSON.stringify({ error: 'rate_limited', message: 'Лимит внутренних запросов Алисы.' }), headers);
  }
  try {
    const body = await readJson(req, 180000);
    const output = await forwardAliceText(body);
    return send(res, 200, JSON.stringify({ output, provider: 'Alice AI LLM' }), headers);
  } catch (error) {
    const status = error.message === 'payload_too_large' ? 413
      : Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 502;
    const message = status === 502 && !error.status ? 'Временная ошибка обращения к Яндексу.'
      : status === 413 ? 'Слишком большой запрос.' : String(error.message || 'Не удалось создать текст.');
    // Intentionally do not log request bodies, tokens or user project contents.
    return send(res, status, JSON.stringify({ error: 'alice_unavailable', message: message.slice(0, 260) }), headers);
  }
}

const backgroundImage=backgroundJSON('image',protectedImage,{maxActive:2});
const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch {
    return send(res, 400, 'Bad Request');
  }

  if(['/api/visitors/ping','/nexora-visitors.js','/internal/visitors/ingest'].includes(url.pathname)&&await handleAnalytics(req,res,url.pathname,{site:'nexora-image-studio',registered:req=>Boolean(readStudioSession(req))}))return;
  if(serveBrand(req,res,url.pathname,"NEXORA Image Studio"))return;
  if (req.method === 'GET' && url.pathname === '/health') {
    const keys = gigaChatKeys();
    const hasGigaChat = keys.length > 0;
    const providers = [
      ...((process.env.NEXORA_IMAGE_RELAY_TOKEN?.trim().length>=32||process.env.GEMINI_API_KEY?.trim()) ? ['Gemini'] : []),
      ...(yandexMissing.length === 0 ? ['Alice AI ART'] : []),
      ...(process.env.OPENAI_API_KEY?.trim() ? ['OpenAI'] : []),
      ...(hasGigaChat ? ['GigaChat'] : [])
    ];
    return send(res, providers.length ? 200 : 503, JSON.stringify({
      ok: providers.length > 0,
      service: 'nexora-image-studio',
      imageGeneratorConfigured: providers.length > 0,
      authenticationConfigured:studioAuthSecret().length>=32,
      imageProviders: providers,
      yandexImage: { configured: yandexMissing.length === 0, missing: yandexMissing, model: 'aliceai-image-art-3.0' },
      aliceTextGateway: {
        configured: imageStudioAliceReady(),
        missing: [
          ...yandexMissing,
          ...(!process.env.ALICE_INTERNAL_TOKEN ? ['ALICE_INTERNAL_TOKEN'] : [])
        ],
        model: 'aliceai-llm'
      },
      geminiImage: {configured:Boolean(process.env.NEXORA_IMAGE_RELAY_TOKEN?.trim().length>=32||process.env.GEMINI_API_KEY?.trim()),viaLobby:process.env.NEXORA_IMAGE_RELAY_TOKEN?.trim().length>=32,model:process.env.GEMINI_IMAGE_MODEL||DEFAULT_IMAGE_MODEL},
      imageProvider: 'Sequential failover',
      imageModel: 'Gemini first, Alice backup',
      gigaChatAuth: {
        configured: hasGigaChat,
        primaryConfigured: keys.some(entry => entry.keySlot === 'основной'),
        backupConfigured: keys.some(entry => entry.keySlot === 'резервный'),
        scope: String(process.env.GIGACHAT_SCOPE || '').trim() || 'GIGACHAT_API_PERS',
        scopeSource: String(process.env.GIGACHAT_SCOPE || '').trim() ? 'Environment' : 'default'
      }
    }), { 'Content-Type': 'application/json; charset=utf-8' });
  }

  if (req.method === 'POST' && url.pathname === '/internal/alice/chat') {
    return handleInternalAliceText(req, res);
  }

  if(req.method==='GET'&&url.pathname==='/auth/start')return studioStart(res);
  if(req.method==='GET'&&url.pathname==='/auth/callback')return studioCallback(req,res,url);
  if (req.method === 'POST' && url.pathname === '/api/images/generate') {
    return backgroundImage(req, res);
  }

  if (req.method !== 'GET' || !['/', '/index.html'].includes(url.pathname)) {
    return send(res, 404, 'Not Found');
  }

  try {
    const html=Buffer.from(injectAnalytics(await readFile(join(publicDir, 'index.html'))));
    return send(res, 200, html, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; frame-src https://nexora-lobby-yan12312.msk1.amvera.tech; frame-ancestors 'none'",
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
  } catch (error) {
    console.error('NEXORA Image Studio page read failed:', error.message);
    return send(res, 500, 'Не удалось открыть NEXORA Image Studio.');
  }
});

server.requestTimeout=240000;
server.headersTimeout=30000;
server.listen(port, '0.0.0.0', () => {
  console.info('NEXORA Image Studio API and website listening on port ' + port);
  console.info(yandexMissing.length ? 'Yandex Image: missing ' + yandexMissing.join(', ') : 'Yandex Image: API key and folder configured');
});
