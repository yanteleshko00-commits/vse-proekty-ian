import crypto from 'node:crypto';

export function internalAliceTokenValid(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string' || expected.length < 32) return false;
  const one = Buffer.from(presented);
  const two = Buffer.from(expected);
  return one.length === two.length && crypto.timingSafeEqual(one, two);
}

export function imageStudioAliceReady(env = process.env) {
  return Boolean(String(env.YANDEX_API_KEY || '').trim() &&
    String(env.YANDEX_FOLDER_ID || '').trim() &&
    String(env.ALICE_INTERNAL_TOKEN || '').trim().length >= 32);
}

// Uses Image Studio's existing YANDEX_API_KEY and YANDEX_FOLDER_ID.
// No credentials are ever returned to the presentation server or to the browser.
export async function forwardAliceText(body, env = process.env, fetchImpl = fetch) {
  const key = String(env.YANDEX_API_KEY || '').trim().replace(/^Api-Key\s+/i, '').trim();
  const folderId = String(env.YANDEX_FOLDER_ID || '').trim();
  if (!key || !folderId) {
    const error = new Error('В Image Studio не настроены ключ Яндекса или каталог.');
    error.status = 503;
    throw error;
  }

  const instructions = String(body?.instructions || '').trim();
  const input = String(body?.input || '').trim();
  if (!instructions || !input || instructions.length > 30000 || input.length > 100000) {
    const error = new Error('Некорректные параметры генерации текста.');
    error.status = 400;
    throw error;
  }
  const modelName = String(env.YANDEX_TEXT_MODEL || 'aliceai-llm');
  const model = modelName.startsWith('gpt://') ? modelName : 'gpt://' + folderId + '/' + modelName;
  const timeout = Math.max(1000, Math.min(55000, Number(body?.timeoutMs) || 35000));
  const upstream = await fetchImpl('https://ai.api.cloud.yandex.net/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(timeout),
    headers: {
      Authorization: 'Api-Key ' + key,
      'OpenAI-Project': folderId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: instructions + (body.jsonMode ? '\nВерни один валидный JSON-объект без Markdown.' : '') },
        { role: 'user', content: input }
      ],
      temperature: 0.3,
      max_tokens: 10000,
      stream: false
    })
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = upstream.status === 401 || upstream.status === 403
      ? 'У ключа Яндекса нет доступа к Alice AI LLM. Нужны роль ai.languageModels.user и scope yc.ai.foundationModels.execute.'
      : upstream.status === 429 ? 'Яндекс ограничил частоту запросов или исчерпана квота.'
      : 'Yandex AI Studio вернул HTTP ' + upstream.status + '.';
    const error = new Error(message);
    error.status = upstream.status;
    throw error;
  }
  const content = data?.choices?.[0]?.message?.content;
  const output = typeof content === 'string' ? content
    : Array.isArray(content) ? content.map(item => item?.text || '').join('') : '';
  if (!output.trim()) {
    const error = new Error('Alice AI LLM не вернула текст.');
    error.status = 502;
    throw error;
  }
  return output;
}
