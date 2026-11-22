import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(here, 'public');
const port = Number(process.env.PORT || 10000);
const apiBase = (process.env.NEXORA_IMAGE_API_URL || 'https://nexora-lobby.onrender.com').replace(/\/$/, '');
const MAX_REQUEST_BYTES = 14 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 28 * 1024 * 1024;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw Object.assign(new Error('payload_too_large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function getImageApiHealth() {
  try {
    const response = await fetch(apiBase + '/health', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok && Boolean(data.ok),
      service: 'nexora-image-studio',
      imageGeneratorConfigured: Boolean(data.imageGeneratorConfigured),
      imageProviders: Array.isArray(data.imageProviders) ? data.imageProviders : [],
      apiService: data.service || 'nexora-image-api'
    };
  } catch {
    return {
      ok: false,
      service: 'nexora-image-studio',
      imageGeneratorConfigured: false,
      imageProviders: [],
      error: 'image_api_unavailable'
    };
  }
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch {
    return send(res, 400, 'Bad Request');
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    const health = await getImageApiHealth();
    return send(res, health.ok ? 200 : 503, JSON.stringify(health), {
      'Content-Type': 'application/json; charset=utf-8'
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/images/generate') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return send(res, error.status || 400, JSON.stringify({
        error: error.message === 'payload_too_large' ? 'payload_too_large' : 'invalid_request',
        message: error.message === 'payload_too_large'
          ? 'Запрос слишком большой. Уменьшите исходное изображение.'
          : 'Не удалось прочитать запрос.'
      }), { 'Content-Type': 'application/json; charset=utf-8' });
    }

    try {
      const headers = {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Accept': 'application/json'
      };
      // Preserve the client IP supplied by Render so the shared API can rate-limit per visitor.
      if (req.headers['x-forwarded-for']) headers['x-forwarded-for'] = req.headers['x-forwarded-for'];
      if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent'];

      const upstream = await fetch(apiBase + '/api/images/generate', {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(210000)
      });
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      if (responseBody.length > MAX_RESPONSE_BYTES) {
        return send(res, 502, JSON.stringify({
          error: 'response_too_large',
          message: 'Сервер генерации вернул слишком большой файл.'
        }), { 'Content-Type': 'application/json; charset=utf-8' });
      }
      return send(res, upstream.status, responseBody, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
      });
    } catch (error) {
      console.error('NEXORA Image API proxy failed:', error.name || 'Error', error.message || '');
      return send(res, error.name === 'TimeoutError' ? 504 : 502, JSON.stringify({
        error: 'image_api_unavailable',
        message: error.name === 'TimeoutError'
          ? 'Сервер генерации не ответил вовремя. Попробуйте ещё раз.'
          : 'Не удалось связаться с сервером генерации NEXORA.'
      }), { 'Content-Type': 'application/json; charset=utf-8' });
    }
  }

  if (req.method !== 'GET' || !['/', '/index.html'].includes(url.pathname)) {
    return send(res, 404, 'Not Found');
  }

  try {
    const html = await readFile(join(publicDir, 'index.html'));
    return send(res, 200, html, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
  } catch (error) {
    console.error('NEXORA Image Studio page read failed:', error.message);
    return send(res, 500, 'Не удалось открыть NEXORA Image Studio.');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.info('NEXORA Image Studio listening on port ' + port);
});
