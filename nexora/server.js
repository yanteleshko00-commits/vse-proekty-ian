import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(here, 'public');
const port = Number(process.env.PORT || 10000);
const authBase = (process.env.AUTH_PUBLIC_URL || 'https://ecosystem-auth-service.onrender.com').replace(/\/$/, '');
const clientId = process.env.OAUTH_CLIENT_ID || 'nexora';
const clientSecret = process.env.OAUTH_CLIENT_SECRET || '';
const sessionSecret = process.env.SESSION_SECRET || '';
const production = process.env.NODE_ENV === 'production';

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || (production ? 'https' : 'http');
  return proto + '://' + req.headers.host;
}

function parseCookies(req) {
  const result = {};
  for (const item of (req.headers.cookie || '').split(';')) {
    const index = item.indexOf('=');
    if (index < 0) continue;
    const key = item.slice(0, index).trim();
    try { result[key] = decodeURIComponent(item.slice(index + 1).trim()); } catch {}
  }
  return result;
}

function cookie(name, value, maxAge) {
  const parts = [name + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAge];
  if (production) parts.push('Secure');
  return parts.join('; ');
}

function signature(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function makeSessionCookie(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    name: user.name,
    email: user.email,
    usage: user.usage || null,
    issuedAt: Date.now()
  })).toString('base64url');
  return payload + '.' + signature(payload);
}

function readSession(req) {
  if (!sessionSecret || sessionSecret.length < 32) return null;
  const token = parseCookies(req).nexora_session;
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = Buffer.from(signature(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const user = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!user.id || !user.name || Date.now() - user.issuedAt > 7 * 86400000) return null;
    return user;
  } catch {
    return null;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

function redirect(res, location, headers = {}) {
  send(res, 302, '', { Location: location, ...headers });
}

function secureRandom(size = 32) {
  return crypto.randomBytes(size).toString('base64url');
}

async function startLogin(req, res) {
  if (!clientSecret || clientSecret.length < 32 || !sessionSecret || sessionSecret.length < 32) {
    return send(res, 503, 'NEXORA ID ещё не настроен. Проверьте переменные OAUTH_CLIENT_SECRET и SESSION_SECRET в Render.');
  }
  const state = secureRandom(32);
  const verifier = secureRandom(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = appUrl(req) + '/auth/callback';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  const oauthCookie = Buffer.from(JSON.stringify({ state, verifier, redirectUri })).toString('base64url');
  const headers = { 'Set-Cookie': cookie('nexora_oauth', oauthCookie, 300) };
  redirect(res, authBase + '/oauth/authorize?' + params.toString(), headers);
}

async function finishLogin(req, res, url) {
  const query = url.searchParams;
  const code = query.get('code');
  const state = query.get('state');
  const cookies = parseCookies(req);
  const oauthRaw = cookies.nexora_oauth;
  if (!code || !state || !oauthRaw) return redirect(res, '/?login=failed');
  let oauth;
  try { oauth = JSON.parse(Buffer.from(oauthRaw, 'base64url').toString('utf8')); } catch { return redirect(res, '/?login=failed'); }
  if (!oauth.state || oauth.state !== state || !oauth.verifier || !oauth.redirectUri) {
    return redirect(res, '/?login=failed', { 'Set-Cookie': cookie('nexora_oauth', '', 0) });
  }
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: oauth.redirectUri,
      code,
      code_verifier: oauth.verifier
    });
    const response = await fetch(authBase + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.user) {
      console.error('NEXORA OAuth exchange failed:', response.status, data.error || 'unknown_error');
      return redirect(res, '/?login=failed', { 'Set-Cookie': cookie('nexora_oauth', '', 0) });
    }
    const headers = {
      'Set-Cookie': [
        cookie('nexora_session', makeSessionCookie(data.user), 604800),
        cookie('nexora_oauth', '', 0)
      ]
    };
    redirect(res, '/', headers);
  } catch (error) {
    console.error('NEXORA OAuth request failed:', error.message);
    redirect(res, '/?login=failed', { 'Set-Cookie': cookie('nexora_oauth', '', 0) });
  }
}

const server = http.createServer(async (req, res) => {
  const base = appUrl(req);
  let url;
  try { url = new URL(req.url, base); } catch { return send(res, 400, 'Bad Request'); }

  if (url.pathname === '/health') {
    const ready = Boolean(clientSecret.length >= 32 && sessionSecret.length >= 32 && (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || req.headers.host));
    return send(res, 200, JSON.stringify({
      ok: true,
      service: 'nexora-lobby',
      oauthConfigured: ready,
      authService: authBase
    }), { 'Content-Type': 'application/json; charset=utf-8' });
  }

  if (url.pathname === '/auth/start' && req.method === 'GET') return startLogin(req, res);
  if (url.pathname === '/auth/callback' && req.method === 'GET') return finishLogin(req, res, url);
  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    return redirect(res, '/', { 'Set-Cookie': cookie('nexora_session', '', 0) });
  }
  if (url.pathname === '/api/me' && req.method === 'GET') {
    const user = readSession(req);
    if (!user) return send(res, 401, JSON.stringify({ error: 'not_signed_in' }), { 'Content-Type': 'application/json; charset=utf-8' });
    return send(res, 200, JSON.stringify({ user }), { 'Content-Type': 'application/json; charset=utf-8' });
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = await readFile(join(publicDir, 'index.html'));
      return send(res, 200, html, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'",
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
    } catch (error) {
      console.error('NEXORA page read failed:', error.message);
      return send(res, 500, 'Не удалось открыть NEXORA.');
    }
  }

  return send(res, 404, 'Not Found');
});

server.listen(port, () => {
  console.log('NEXORA lobby listening on port ' + port);
});
