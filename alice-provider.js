// Yandex AI Studio text generation (Alice AI LLM).
// Distinct from Alice AI ART, which produces images instead of project text.
// https://aistudio.yandex.ru/docs/ai-studio/operations/generation/completions-basic
const ALICE_URL = 'https://ai.api.cloud.yandex.net/v1/chat/completions';

export function aliceProviderFromEnv(env = process.env) {
  const key = String(env.YANDEX_API_KEY || env.ALICE_API_KEY || '')
    .trim().replace(/^Api-Key\s+/i, '').trim();
  const folderId = String(env.YANDEX_FOLDER_ID || '').trim();
  if (!key || !folderId) {
    // The Image Studio already owns the Yandex credentials. Never copy or expose
    // them: proxy text generation over a secret-authenticated server-to-server API.
    const internalToken = String(env.ALICE_INTERNAL_TOKEN || '').trim();
    if (internalToken.length < 32) return null;
    return {
      name: 'Alice AI LLM',
      type: 'alice-proxy',
      model: 'aliceai-llm',
      internalToken,
      url: 'https://nexora-image-studio.onrender.com/internal/alice/chat'
    };
  }

  const selected = String(env.YANDEX_TEXT_MODEL || env.YANDEX_MODEL || 'aliceai-llm').trim();
  const model = selected.startsWith('gpt://')
    ? selected : 'gpt://' + folderId + '/' + selected;
  return { name: 'Alice AI LLM', type: 'alice', key, folderId, model };
}

export async function requestAliceAIText(provider, instructions, input, jsonMode, timeoutMs, fetchImpl = fetch) {
  const deadline = Math.max(1000, Math.min(60000, Number(timeoutMs) || 35000));
  const response = await fetchImpl(ALICE_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(deadline),
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Api-Key ' + provider.key,
      'OpenAI-Project': provider.folderId
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: instructions +
          (jsonMode ? '\nОтвет строго в виде одного JSON-объекта без Markdown.' : '') },
        { role: 'user', content: input }
      ],
      max_tokens: 10000,
      temperature: 0.3,
      stream: false
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = data?.error?.message || data?.message || data?.error?.code || 'Ошибка API';
    const error = new Error('Alice AI LLM HTTP ' + response.status + ': ' +
      String(raw).replaceAll(provider.key, '[ключ скрыт]').slice(0, 220));
    error.status = response.status;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content
    : Array.isArray(content) ? content.map(item => item?.text || '').join('') : '';
  if (!text.trim()) throw new Error('Alice AI LLM вернула пустой ответ.');
  return text;
}


export async function requestAliceTextViaImageStudio(provider, instructions, input, jsonMode, timeoutMs, fetchImpl = fetch) {
  if (provider.type !== 'alice-proxy' || !provider.internalToken || provider.internalToken.length < 32) {
    throw new Error('Внутренний шлюз Алисы не настроен.');
  }
  const timeout = Math.max(1000, Math.min(60000, Number(timeoutMs) || 35000));
  const response = await fetchImpl(provider.url, {
    method: 'POST',
    signal: AbortSignal.timeout(timeout),
    headers: {
      'Content-Type': 'application/json',
      'X-NEXORA-Internal-Token': provider.internalToken
    },
    body: JSON.stringify({
      instructions: String(instructions).slice(0, 30000),
      input: String(input).slice(0, 100000),
      jsonMode: Boolean(jsonMode),
      timeoutMs: timeout
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = String(data.message || 'Ошибка сервиса Алисы').replaceAll(provider.internalToken, '[скрыто]');
    const error = new Error('Alice AI LLM через Image Studio: HTTP ' + response.status + ': ' + reason.slice(0, 220));
    error.status = response.status;
    throw error;
  }
  if (typeof data.output !== 'string' || !data.output.trim()) {
    throw new Error('Alice AI LLM через Image Studio вернула пустой ответ.');
  }
  return data.output;
}
