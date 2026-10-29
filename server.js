import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, ImageRun } from 'docx';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';
import archiver from 'archiver';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
const PORT = Number(process.env.PORT || 3000);
// Use a supported OpenAI API model ID; don't let a stale OPENAI_MODEL setting select a non-API product name.
const MODEL = 'gpt-4.1-mini';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
// Keep requests below common hosting/proxy limits; slow image lookups are bounded separately.
const REQUEST_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 95000);
const MAX_SLIDES = 20;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PDF_FONT_PATH = path.resolve(process.cwd(), 'DejaVuSans.ttf');
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 })
  : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const COLORS = {
  blue: { bg: 'F3F6FC', ink: '18243A', muted: '63718A', accent: '315EDB', accent2: 'AFC5FF' },
  business: { bg: 'F3F5F8', ink: '172033', muted: '637083', accent: '244B83', accent2: 'A8BDD4' },
  it: { bg: '10172A', ink: 'F3F7FF', muted: 'B8C4DA', accent: '6D5DFB', accent2: '28D7C5' },
  eco: { bg: 'F2F7F0', ink: '20382B', muted: '617667', accent: '26734B', accent2: 'B9D9A8' },
  education: { bg: 'F7F3FF', ink: '28223A', muted: '736A83', accent: '7452C8', accent2: 'D6C9FA' },
  science: { bg: 'F1F7FA', ink: '18313E', muted: '5B7682', accent: '167D9A', accent2: 'A8DCE8' }
};

function cleanText(value, max = 1500) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}
function safeName(value) {
  return cleanText(value, 100).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_') || 'presentation';
}
function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function normalizeText(text, max = 240) {
  const s = cleanText(text, max * 2).replace(/\s+/g, ' ');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.65 ? cut.slice(0, lastSpace) : cut) + '…';
}
function inferTheme(topic, requested = '') {
  const t = `${topic} ${requested}`.toLowerCase();
  if (/эколог|природ|климат|переработ|зелён|зелен|биолог|растен/.test(t)) return COLORS.eco;
  if (/it\b|айти|программ|нейросет|искусственн.*интеллект|робот|цифров|кибер/.test(t)) return COLORS.it;
  if (/бизнес|эконом|финанс|маркетинг|предприним|менеджмент/.test(t)) return COLORS.business;
  if (/физик|хими|космос|астроном|наук|технолог/.test(t)) return COLORS.science;
  if (/образован|школ|обучен|истори|литератур|общество/.test(t)) return COLORS.education;
  return COLORS.blue;
}
function extractJson(outputText) {
  const text = String(outputText || '').trim();
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error('ИИ вернул ответ не в формате JSON.');
}

function containsCorruptedText(value) {
  if (typeof value === 'string') {
    // Detect common UTF-8/Windows-1251 mojibake and replacement/control characters.
    return /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]|(?:Р[џЃ‚ѓ„…†‡€‰ЉЊЋЌЍЎЏђ‘’“”•–—™љњћќўџ])|(?:С[ЂЃ‚ѓ„…†‡€‰ЉЊЋЌЍЎЏђ‘’“”•–—™љњћќўџ])|(?:Ã.|Â.|Ð.|Ñ.)|(?:Ôò|Ä´|Â©)/u.test(value);
  }
  if (Array.isArray(value)) return value.some(containsCorruptedText);
  if (value && typeof value === 'object') return Object.values(value).some(containsCorruptedText);
  return false;
}
function createLocalFallbackPlan(payload) {
  const topic = cleanText(payload?.topic, 180) || 'Тема проекта';
  const count = clampInt(payload?.requestedSlides, 4, MAX_SLIDES, 8);
  const requirements = cleanText(payload?.extraRequirements, 500);
  const sections = [
    { type: 'cover', title: topic, subtitle: 'Исследование темы и её практического значения', body: 'Учебная презентация: основные понятия, анализ и выводы.' },
    { type: 'cards', title: 'Почему эта тема важна', body: 'Чтобы понять тему, нужно рассмотреть её значение, причины интереса к ней и влияние на повседневную жизнь.', bullets: ['Актуальность темы', 'Связь с реальной жизнью', 'Вопросы, требующие изучения'] },
    { type: 'comparison', title: 'Основные понятия', body: 'Перед анализом важно определить ключевые понятия и не смешивать факты с предположениями.', leftTitle: 'Что изучаем', rightTitle: 'Что проверяем', leftItems: ['Определение темы', 'Основные элементы', 'Примеры применения'], rightItems: ['Надёжность информации', 'Разные точки зрения', 'Практические ограничения'] },
    { type: 'process', title: 'Как устроен процесс', body: 'Рассмотрите тему последовательно: от исходных условий к результатам и возможным последствиям.', steps: ['Сформулировать вопрос', 'Собрать информацию', 'Сравнить факты', 'Сделать обоснованный вывод'] },
    { type: 'cards', title: 'Факторы и причины', body: 'На результат обычно влияет несколько факторов. Их следует рассматривать вместе, учитывая контекст.', cards: [{ title: 'Условия', text: 'Обстоятельства, в которых проявляется явление.' }, { title: 'Участники', text: 'Люди, системы или объекты, влияющие на результат.' }, { title: 'Ресурсы', text: 'Время, знания и средства, необходимые для решения.' }] },
    { type: 'image', title: 'Пример из практики', body: 'Подберите конкретный пример по теме и объясните, что он показывает. Не выдавайте предположение за доказанный факт.' },
    { type: 'stat', title: 'Как оценивать информацию', body: 'Проверяйте дату, автора, первоисточник и согласованность сведений в нескольких независимых материалах.', statistic: '3 шага', statisticLabel: 'Найти источник · проверить данные · сравнить подтверждения' },
    { type: 'comparison', title: 'Плюсы и ограничения', body: 'У любого подхода есть сильные стороны и условия, при которых он работает хуже.', leftTitle: 'Преимущества', rightTitle: 'Ограничения', leftItems: ['Возможная польза', 'Практическое применение', 'Потенциал развития'], rightItems: ['Зависимость от условий', 'Возможные риски', 'Необходимость проверки'] },
    { type: 'process', title: 'Практическая часть', body: requirements || 'Предложите небольшое исследование: сформулируйте цель, опишите метод, зафиксируйте наблюдения и объясните результат.', steps: ['Определить цель', 'Выбрать метод', 'Собрать наблюдения', 'Проанализировать результат', 'Сформулировать вывод'] },
    { type: 'conclusion', title: 'Выводы', body: 'Подведите итог по изученным вопросам. Отделите подтверждённые сведения от предположений и укажите, что требует дальнейшего изучения.', bullets: ['Цель исследования определена', 'Ключевые вопросы рассмотрены', 'Практическое значение сформулировано'] },
    { type: 'sources', title: 'Источники для проверки', body: 'Перед сдачей добавьте реальные источники, которыми вы пользовались: учебник, официальные публикации и проверенные материалы.', bullets: ['Учебные материалы по теме', 'Официальные сайты профильных организаций', 'Научные или справочные публикации'] }
  ];
  const slides = Array.from({ length: count }, (_, i) => {
    const base = sections[i % sections.length];
    return { ...base, title: i >= sections.length ? base.title + ' — часть ' + (Math.floor(i / sections.length) + 1) : base.title,
      bullets: base.bullets ? [...base.bullets] : [], cards: base.cards ? base.cards.map(c => ({ ...c })) : [],
      leftItems: base.leftItems ? [...base.leftItems] : [], rightItems: base.rightItems ? [...base.rightItems] : [],
      steps: base.steps ? [...base.steps] : [], table: [], imageQuery: topic + ' ' + base.title,
      notes: 'Резервный вариант: автоматически сформирован без доступного ИИ. Проверьте и уточните факты перед использованием.' };
  });
  slides[0].title = topic;
  slides[0].type = 'cover';
  slides[slides.length - 1].type = 'conclusion';
  slides[slides.length - 1].title = 'Итоги и дальнейшая проверка';
  return {
    title: topic,
    summary: 'Создан резервный вариант, потому что подключённые ИИ сейчас недоступны. Проверьте факты и добавьте реальные источники перед использованием.',
    practicalPart: requirements || 'Для практической части сформулируйте цель, выберите подходящий метод исследования, запишите наблюдения и объясните полученные результаты.',
    defense: 'Кратко представьте актуальность темы, цель и задачи, основные результаты, практическую значимость и выводы. Проверьте все факты и источники перед защитой.',
    sources: [],
    slides
  };
}

function normalizeSlideType(type, index) {
  const allowed = ['cover', 'cards', 'comparison', 'stat', 'process', 'quote', 'image', 'table', 'conclusion', 'sources'];
  return allowed.includes(type) ? type : (index === 0 ? 'cover' : 'cards');
}
function normalizePlan(raw, topic, requestedCount, theme) {
  // Never export garbled AI text. Use the built-in Russian outline instead.
  if (containsCorruptedText(raw) || containsCorruptedText(topic)) {
    console.warn('[text-encoding] Повреждённый текст обнаружен; заменяю план резервным русским вариантом.');
    const safeTopic = containsCorruptedText(topic) ? 'Учебный проект' : topic;
    return normalizePlan(
      createLocalFallbackPlan({ topic: safeTopic, requestedSlides: requestedCount }),
      safeTopic,
      requestedCount,
      theme
    );
  }
  const inputSlides = Array.isArray(raw.slides) ? raw.slides : [];
  const slides = inputSlides.slice(0, requestedCount).map((s, i) => ({
    type: normalizeSlideType(s.type, i),
    title: normalizeText(s.title || (i === 0 ? topic : `Раздел ${i + 1}`), 90),
    subtitle: normalizeText(s.subtitle || '', 140),
    body: normalizeText(s.body || '', 300),
    bullets: (Array.isArray(s.bullets) ? s.bullets : []).slice(0, 4).map(x => normalizeText(x, 100)).filter(Boolean),
    cards: (Array.isArray(s.cards) ? s.cards : []).slice(0, 4).map(c => ({
      title: normalizeText(c.title || 'Ключевая идея', 55),
      text: normalizeText(c.text || '', 110),
      value: normalizeText(c.value || '', 25)
    })),
    leftTitle: normalizeText(s.leftTitle || 'Преимущества', 55),
    rightTitle: normalizeText(s.rightTitle || 'Ограничения', 55),
    leftItems: (Array.isArray(s.leftItems) ? s.leftItems : []).slice(0, 4).map(x => normalizeText(x, 100)),
    rightItems: (Array.isArray(s.rightItems) ? s.rightItems : []).slice(0, 4).map(x => normalizeText(x, 100)),
    steps: (Array.isArray(s.steps) ? s.steps : []).slice(0, 5).map(x => normalizeText(x, 100)),
    quote: normalizeText(s.quote || s.body || '', 230),
    statistic: normalizeText(s.statistic || '', 35),
    statisticLabel: normalizeText(s.statisticLabel || '', 110),
    table: Array.isArray(s.table) ? s.table.slice(0, 6).map(r => Array.isArray(r) ? r.slice(0, 4).map(x => normalizeText(x, 70)) : []) : [],
    imageQuery: normalizeText(s.imageQuery || `${topic} ${s.title || ''}`, 180),
    imageUrl: '',
    imageCredit: '',
    notes: normalizeText(s.notes || '', 300)
  }));
  // Keep requested count exact. Fill missing slots with meaningful, distinct section layouts.
  const fallbackTypes = ['cover', 'cards', 'comparison', 'stat', 'process', 'image', 'quote', 'conclusion', 'table', 'sources'];
  while (slides.length < requestedCount) {
    const i = slides.length;
    slides.push({
      type: fallbackTypes[i % fallbackTypes.length],
      title: i === requestedCount - 1 ? 'Итоги и источники' : `Следующий шаг: ${topic}`,
      subtitle: '',
      body: i === requestedCount - 1 ? 'Проверьте источники и используйте данные в контексте.' : `Ключевые выводы по теме «${topic}».`,
      bullets: ['Главная идея', 'Практическое значение', 'Что можно изучить дальше'],
      cards: [], leftTitle: 'Возможности', rightTitle: 'Что учесть',
      leftItems: ['Потенциальная польза'], rightItems: ['Ограничения и условия'],
      steps: ['Изучить вопрос', 'Проверить данные', 'Сделать вывод'],
      quote: '', statistic: '', statisticLabel: '', table: [],
      imageQuery: `${topic} ${i + 1}`, imageUrl: '', imageCredit: '', notes: ''
    });
  }
  // Enforce a logical start/end even if the model ignored the requested structure.
  if (slides.length) slides[0].type = 'cover';
  if (slides.length > 1 && !['conclusion', 'sources', 'quote'].includes(slides.at(-1).type)) {
    slides.at(-1).type = 'conclusion';
    slides.at(-1).title = 'Выводы';
  }
  const sources = (Array.isArray(raw.sources) ? raw.sources : [])
    .slice(0, 10)
    .map(s => typeof s === 'string' ? { title: normalizeText(s, 160), url: '' } : {
      title: normalizeText(s.title || s.name || 'Источник', 160),
      url: cleanText(s.url || '', 500)
    });
  return {
    title: normalizeText(raw.title || topic, 140),
    theme: theme,
    summary: normalizeText(raw.summary || '', 500),
    slides,
    sources,
    practicalPart: normalizeText(raw.practicalPart || '', 1200),
    defense: normalizeText(raw.defense || '', 1800)
  };
}
async function withTimeout(promise, ms, label = 'Операция') {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: превышено время ожидания.`)), ms); })
    ]);
  } finally { clearTimeout(timer); }
}
function configuredAIProviders() {
  const providers = [];
  // Try providers with free tiers/free routing before potentially billable providers.
  if (process.env.GEMINI_API_KEY) providers.push({ name: 'Google Gemini', type: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-3.8-flash' });
  if (process.env.OPENROUTER_API_KEY) providers.push({ name: 'OpenRouter Free', type: 'openai-compatible', key: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1', model: 'openrouter/free', freeOnly: true });
  if (process.env.GROQ_API_KEY) providers.push({ name: 'Groq', type: 'openai-compatible', key: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1', model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b' });
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) providers.push({ name: 'Cloudflare Workers AI', type: 'cloudflare', accountId: process.env.CLOUDFLARE_ACCOUNT_ID, key: process.env.CLOUDFLARE_API_TOKEN, model: process.env.CLOUDFLARE_AI_MODEL || '@cf/openai/gpt-oss-120b' });
  if (process.env.OPENAI_API_KEY) providers.push({ name: 'OpenAI', type: 'openai' });
  return providers;
}
function providerErrorMessage(data, status) {
  const message = data?.error?.message || data?.message || data?.errors?.[0]?.message || (typeof data === 'string' ? data : 'HTTP ' + status);
  return cleanText(String(message), 350);
}
async function callAIProvider(provider, instructions, input, jsonMode, timeout) {
  const requestTimeout = Math.min(timeout, 18000);
  const signal = AbortSignal.timeout(requestTimeout);
  if (provider.type === 'openai') {
    const result = await withTimeout(openai.responses.create({
      model: MODEL, instructions, input, max_output_tokens: 10000,
      ...(jsonMode ? { text: { format: { type: 'json_object' } } } : {})
    }), requestTimeout, 'ИИ ' + provider.name);
    return result.output_text || '';
  }
  if (provider.type === 'gemini') {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(provider.model) + ':generateContent?key=' + encodeURIComponent(process.env.GEMINI_API_KEY);
    const response = await fetch(url, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { maxOutputTokens: 10000, ...(jsonMode ? { responseMimeType: 'application/json' } : {}) }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(provider.name + ': ' + providerErrorMessage(data, response.status));
    return (data.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('');
  }
  if (provider.type === 'openai-compatible') {
    const response = await fetch(provider.baseURL + '/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + provider.key, ...(provider.name === 'OpenRouter Free' ? { 'HTTP-Referer': 'https://vse-proekty-ian.onrender.com', 'X-Title': 'Все проекты #Ian' } : {}) },
      body: JSON.stringify({ model: provider.model, messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }], max_tokens: 10000, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(provider.name + ': ' + providerErrorMessage(data, response.status));
    return data.choices?.[0]?.message?.content || '';
  }
  if (provider.type === 'cloudflare') {
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(provider.accountId) + '/ai/run/' + provider.model;
    const response = await fetch(url, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + provider.key },
      body: JSON.stringify({ messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }], max_tokens: 10000 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(provider.name + ': ' + providerErrorMessage(data, response.status));
    return data.result?.response || data.result?.choices?.[0]?.message?.content || '';
  }
  throw new Error('Неизвестный ИИ-провайдер: ' + provider.name);
}
async function runAIWithFallback(instructions, input, jsonMode, timeout = REQUEST_TIMEOUT_MS) {
  const providers = configuredAIProviders();
  if (!providers.length) throw new Error('Не подключены API-ключи ИИ. Добавь OPENAI_API_KEY и ключи резервных бесплатных провайдеров в Render.');
  const failures = [];
  // Use one shared AI time budget instead of spending 18 seconds on every provider.
  // Otherwise several unavailable providers can outlive the Render request timeout.
  const deadline = Date.now() + Math.min(timeout, 24000);
  for (const provider of providers) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      const output = await callAIProvider(provider, instructions, input, jsonMode, Math.min(10000, remaining));
      if (!cleanText(output, 12000)) throw new Error(provider.name + ': пустой ответ.');
      return { output, provider: provider.name };
    } catch (error) {
      const message = cleanText(error?.message || 'неизвестная ошибка', 350).replace(/sk-[A-Za-z0-9_-]{16,}/g, '[ключ скрыт]').replace(/Bearer\s+\S+/gi, 'Bearer [скрыт]');
      failures.push(provider.name + ': ' + message);
      console.warn('[AI fallback] ' + provider.name + ' недоступен: ' + message);
    }
  }
  const error = new Error('Все подключённые ИИ временно недоступны. ' + failures.join(' | '));
  error.status = 503;
  throw error;
}
async function aiJson(instructions, payload, timeout = REQUEST_TIMEOUT_MS) {
  const input = 'Return a valid json object matching the requested schema.\nPayload: ' + JSON.stringify(payload);
  const providers = configuredAIProviders();
  if (!providers.length) throw new Error('Не подключены API-ключи ИИ. Добавь OPENAI_API_KEY и ключи резервных бесплатных провайдеров в Render.');
  const failures = [];
  // Keep all provider attempts inside one bounded deadline so the local fallback can run.
  const deadline = Date.now() + Math.min(timeout, 24000);
  for (const provider of providers) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      const output = await callAIProvider(provider, instructions, input, true, Math.min(10000, remaining));
      const parsed = extractJson(output);
      if (containsCorruptedText(parsed)) {
        throw new Error(provider.name + ': ответ содержит повреждённый текст/ошибку кодировки.');
      }
      console.log('[AI fallback] Генерация выполнена через ' + provider.name + '.');
      return parsed;
    } catch (error) {
      const message = cleanText(error?.message || 'неизвестная ошибка', 350).replace(/sk-[A-Za-z0-9_-]{16,}/g, '[ключ скрыт]').replace(/Bearer\s+\S+/gi, 'Bearer [скрыт]');
      failures.push(provider.name + ': ' + message);
      console.warn('[AI fallback] ' + provider.name + ' недоступен: ' + message);
    }
  }
  if (payload && payload.topic && !payload.currentProject) {
    console.error('[AI fallback] Все ИИ недоступны; создаю локальный резервный план без внешнего ИИ.');
    return createLocalFallbackPlan(payload);
  }
  const error = new Error('Все подключённые ИИ недоступны или исчерпали лимиты. ' + failures.join(' | '));
  error.status = 503;
  throw error;
}
const PLANNER_INSTRUCTIONS = `
Ты опытный автор и дизайнер презентаций. Верни ТОЛЬКО JSON-объект.
Создай презентацию на русском языке с точным количеством слайдов, указанным в запросе.
Каждый слайд должен иметь один type из: cover,cards,comparison,stat,process,quote,image,table,conclusion,sources.
Обязательная логика: обложка/введение, проблема, факты или аналитика, решение/практическая часть, выводы и источники.
Не придумывай статистику, цитаты, исследования, названия источников или URL. Если достоверное число неизвестно, не используй его как факт.
Текст краткий: заголовок до 8 слов, body до 35 слов, до 4 bullets, каждый до 14 слов.
Меняй макеты и ритм слайдов. Не повторяй одинаковые заголовки и формулировки. Не добавляй название сайта, логотипы или фразу «Индивидуальный проект» без необходимости.
Для каждого слайда дай imageQuery — конкретное визуальное описание, отличающееся от остальных.
Для cards заполни cards [{title,text,value}]; для comparison заполни leftTitle,rightTitle,leftItems,rightItems; для stat заполни statistic,statisticLabel; для process заполни steps; для quote — quote; для table — table как массив строк, первая строка заголовки; для conclusion/sources — краткие итоги/источники.
Верни поля: title, summary, practicalPart, defense, sources [{title,url}], slides [{type,title,subtitle,body,bullets,cards,leftTitle,rightTitle,leftItems,rightItems,steps,quote,statistic,statisticLabel,table,imageQuery,notes}].
`;
async function commonsImage(query, used) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|extmetadata',
    iiurlwidth: '1400', format: 'json', origin: '*'
  }).toString();
  const res = await withTimeout(fetch(url, {
    headers: { 'User-Agent': 'IanProjectPresentation/1.0 (presentation generator)' },
    signal: AbortSignal.timeout(2500)
  }), 3000, 'Поиск изображения');
  if (!res.ok) return null;
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {});
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const candidate = info?.thumburl || info?.url;
    if (!candidate || !/^https:\/\/upload\.wikimedia\.org\//i.test(candidate)) continue;
    if (used.has(candidate)) continue;
    const mime = info?.mime || '';
    if (!mime.startsWith('image/')) continue;
    const title = page.title || '';
    const credit = `${title} — Wikimedia Commons`;
    used.add(candidate);
    return { url: candidate, credit, title };
  }
  return null;
}
async function downloadImage(url) {
  const response = await withTimeout(fetch(url, { signal: AbortSignal.timeout(3000) }), 4000, 'Загрузка изображения');
  if (!response.ok) throw new Error(`Изображение вернуло HTTP ${response.status}`);
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim();
  // Не переименовываем WebP в PNG: это повреждает файл при встраивании в PPTX.
  if (!['image/jpeg', 'image/png', 'image/gif'].includes(mime)) throw new Error('Формат изображения не поддерживается для PPTX');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Недопустимый размер изображения');
  return { bytes, mime };
}
async function generateImageBuffer(prompt) {
  if (!openai || process.env.ENABLE_AI_IMAGE_GENERATION !== 'true') return null;
  const result = await withTimeout(openai.images.generate({
    model: IMAGE_MODEL,
    prompt: `Создай качественную редакционную иллюстрацию для образовательной презентации. Без текста, надписей и логотипов. Тема: ${prompt}`,
    size: '1536x1024',
    quality: 'low'
  }), 8000, 'Генерация изображения');
  const b64 = result.data?.[0]?.b64_json;
  return b64 ? { bytes: Buffer.from(b64, 'base64'), mime: 'image/png' } : null;
}
async function attachImages(plan) {
  const used = new Set();
  // Ограниченный пул: не перегружаем Wikimedia и уменьшаем вероятность тайм-аутов.
  // commonsImage резервирует URL в Set сразу после ответа, поэтому повторов меньше.
  let nextSlide = 0;
  const workerCount = Math.min(10, plan.slides.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextSlide < plan.slides.length) {
      const slide = plan.slides[nextSlide++];
      try {
        const found = await commonsImage(slide.imageQuery || `${plan.title} ${slide.title}`, used);
        if (!found) continue;
        const image = await downloadImage(found.url);
        slide.imageUrl = found.url;
        slide.imageCredit = found.credit;
        slide.imageMime = image.mime;
        slide.imageBytes = image.bytes;
      } catch (err) {
        console.warn('Image lookup failed:', err.message);
      }
    }
  });
  await Promise.all(workers);
  // AI-картинки включаются только настройкой в Render; лимит защищает время и стоимость.
  if (process.env.ENABLE_AI_IMAGE_GENERATION === 'true') {
    let generatedCount = 0;
    // One short AI-image fallback per deck: internet images cover the remaining slides.
    // This prevents sequential image requests from exhausting the whole generation timeout.
    for (const slide of plan.slides) {
      if (slide.imageBytes || generatedCount >= 1) continue;
      try {
        const generated = await generateImageBuffer(slide.imageQuery || slide.title);
        if (generated) {
          slide.imageBytes = generated.bytes;
          slide.imageMime = generated.mime;
          slide.imageCredit = 'Иллюстрация создана ИИ';
          generatedCount++;
        }
      } catch (err) {
        console.warn('AI image failed:', err.message);
      }
    }
  }
}
function addText(slide, text, x, y, w, h, opts = {}) {
  if (!text) return;
  slide.addText(String(text), {
    x, y, w, h, fontFace: 'Aptos', fontSize: 18, color: '18243A',
    breakLine: false, margin: 0.03, valign: 'mid', fit: 'shrink',
    ...opts
  });
}
function addImageOrPlaceholder(slide, s, x, y, w, h, theme) {
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.12, fill: { color: theme.accent2 }, line: { color: theme.accent2, transparency: 100 } });
  if (s.imageBytes) {
    try {
      slide.addImage({ data: `data:${s.imageMime};base64,${s.imageBytes.toString('base64')}`, x, y, w, h, sizingCrop: true });
      return;
    } catch (e) { console.warn('PPTX image embed failed:', e.message); }
  }
  addText(slide, 'Иллюстрация по теме', x + 0.15, y + h / 2 - 0.2, w - 0.3, 0.4, {
    fontSize: 14, bold: true, color: theme.ink, align: 'center'
  });
}
function addBullets(slide, items, x, y, w, theme, max = 4) {
  let yy = y;
  for (const item of (items || []).slice(0, max)) {
    slide.addShape('ellipse', { x, y: yy + 0.09, w: 0.12, h: 0.12, fill: { color: theme.accent }, line: { color: theme.accent } });
    addText(slide, normalizeText(item, 110), x + 0.22, yy, w - 0.22, 0.55, { fontSize: 17, color: theme.ink, valign: 'top' });
    yy += 0.62;
  }
}
function addSlideNumber(slide, i, total, theme) {
  addText(slide, `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 11.1, 6.95, 1.3, 0.22, {
    fontSize: 9, color: theme.muted, align: 'right'
  });
}
function buildPptx(plan) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Генератор презентаций';
  pptx.subject = plan.title;
  pptx.title = plan.title;
  pptx.company = 'Все проекты #Ian';
  pptx.lang = 'ru-RU';
  const theme = plan.theme || COLORS.blue;
  pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'ru-RU' };

  plan.slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: theme.bg };
    slide.addShape('rect', { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: theme.accent }, line: { color: theme.accent } });
    const title = s.title || plan.title;
    const type = s.type;
    if (type === 'cover') {
      slide.background = { color: theme.accent };
      addText(slide, 'ПРЕЗЕНТАЦИЯ', 0.75, 0.65, 4.8, 0.3, { fontSize: 11, bold: true, color: 'FFFFFF', charSpacing: 2 });
      addText(slide, title, 0.75, 1.35, 6.2, 2.3, { fontSize: 32, bold: true, color: 'FFFFFF', breakLine: false, valign: 'mid' });
      addText(slide, s.subtitle || s.body || plan.summary, 0.78, 4.0, 5.7, 1.15, { fontSize: 17, color: 'EAF0FF', valign: 'top' });
      addImageOrPlaceholder(slide, s, 7.3, 1.15, 5.0, 4.9, theme);
    } else if (type === 'cards') {
      addText(slide, title, 0.7, 0.45, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      const cards = (s.cards?.length ? s.cards : (s.bullets || []).slice(0, 3).map((text, j) => ({ title: `Идея ${j + 1}`, text, value: '' }))).slice(0, 4);
      const cols = cards.length === 4 ? 2 : Math.max(1, cards.length);
      const cw = 11.7 / cols;
      cards.forEach((c, j) => {
        const col = j % cols, row = Math.floor(j / cols);
        const x = 0.7 + col * cw, y = 1.5 + row * 2.25;
        slide.addShape('roundRect', { x, y, w: cw - 0.2, h: 1.9, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: theme.accent2, transparency: 45 } });
        if (c.value) addText(slide, c.value, x + 0.22, y + 0.18, cw - 0.65, 0.45, { fontSize: 23, bold: true, color: theme.accent });
        addText(slide, c.title, x + 0.22, y + (c.value ? 0.7 : 0.22), cw - 0.65, 0.4, { fontSize: 17, bold: true, color: theme.ink });
        addText(slide, c.text, x + 0.22, y + 1.15, cw - 0.65, 0.55, { fontSize: 13, color: theme.muted, valign: 'top' });
      });
    } else if (type === 'comparison') {
      addText(slide, title, 0.7, 0.45, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      [s.leftTitle, s.rightTitle].forEach((t, j) => {
        const x = 0.75 + j * 6.0;
        slide.addShape('roundRect', { x, y: 1.45, w: 5.65, h: 4.9, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: theme.accent2, transparency: 40 } });
        addText(slide, t, x + 0.25, 1.7, 5.1, 0.5, { fontSize: 20, bold: true, color: theme.accent });
        addBullets(slide, j ? s.rightItems : s.leftItems, x + 0.3, 2.45, 5.0, theme);
      });
    } else if (type === 'stat') {
      addText(slide, title, 0.75, 0.55, 11.7, 0.7, { fontSize: 27, bold: true, color: theme.ink });
      addText(slide, s.statistic || 'Ключевой вывод', 0.85, 1.65, 6.2, 2.0, { fontSize: 47, bold: true, color: theme.accent });
      addText(slide, s.statisticLabel || s.body, 0.9, 3.8, 6.0, 1.3, { fontSize: 21, color: theme.ink, valign: 'top' });
      addImageOrPlaceholder(slide, s, 7.4, 1.6, 4.7, 4.4, theme);
    } else if (type === 'process') {
      addText(slide, title, 0.7, 0.45, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      const steps = (s.steps?.length ? s.steps : s.bullets).slice(0, 5);
      steps.forEach((step, j) => {
        const x = 0.75 + j * (11.8 / Math.max(steps.length, 1));
        slide.addShape('ellipse', { x, y: 2.0, w: 0.65, h: 0.65, fill: { color: theme.accent }, line: { color: theme.accent } });
        addText(slide, String(j + 1), x, 2.12, 0.65, 0.3, { fontSize: 16, bold: true, color: 'FFFFFF', align: 'center' });
        addText(slide, step, x - 0.05, 2.9, 1.8, 1.45, { fontSize: 14, color: theme.ink, valign: 'top' });
        if (j < steps.length - 1) slide.addShape('line', { x: x + 0.72, y: 2.32, w: 1.45, h: 0, line: { color: theme.accent2, width: 2, endArrowType: 'triangle' } });
      });
      addText(slide, s.body, 0.8, 5.25, 11.5, 0.75, { fontSize: 15, color: theme.muted });
    } else if (type === 'quote') {
      slide.background = { color: theme.accent2 };
      addText(slide, 'КЛЮЧЕВАЯ МЫСЛЬ', 0.9, 0.8, 10.8, 0.35, { fontSize: 11, bold: true, color: theme.ink, charSpacing: 2 });
      addText(slide, `“${s.quote || s.body || title}”`, 0.9, 1.65, 10.9, 3.5, { fontSize: 29, bold: true, color: theme.ink, valign: 'mid' });
      addText(slide, s.subtitle, 0.95, 5.6, 10.5, 0.45, { fontSize: 15, color: theme.ink });
    } else if (type === 'table') {
      addText(slide, title, 0.7, 0.45, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      const rows = s.table?.length ? s.table : [['Параметр', 'Описание'], ['Основная идея', s.body || 'Требуется уточнение']];
      const colW = 11.7 / Math.max(1, ...rows.map(r => r.length));
      rows.slice(0, 6).forEach((row, ri) => row.slice(0, 4).forEach((cell, ci) => {
        const x = 0.7 + ci * colW, y = 1.45 + ri * 0.72;
        slide.addShape('rect', { x, y, w: colW, h: 0.7, fill: { color: ri === 0 ? theme.accent : 'FFFFFF' }, line: { color: theme.accent2, width: 0.6 } });
        addText(slide, cell, x + 0.08, y + 0.06, colW - 0.16, 0.58, { fontSize: ri === 0 ? 13 : 12, bold: ri === 0, color: ri === 0 ? 'FFFFFF' : theme.ink });
      }));
    } else if (type === 'image') {
      addText(slide, title, 0.7, 0.5, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      addImageOrPlaceholder(slide, s, 0.75, 1.45, 5.6, 4.8, theme);
      addText(slide, s.body, 6.8, 1.65, 5.1, 1.25, { fontSize: 19, color: theme.ink, valign: 'top' });
      addBullets(slide, s.bullets, 6.8, 3.2, 5.0, theme);
    } else if (type === 'sources') {
      addText(slide, title || 'Источники', 0.7, 0.5, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      addBullets(slide, plan.sources.map(x => x.url ? `${x.title} — ${x.url}` : x.title), 0.85, 1.5, 11.0, theme, 6);
      if (!plan.sources.length) addText(slide, 'Добавьте проверенные источники, использованные при подготовке материала.', 0.9, 1.6, 10.5, 1.2, { fontSize: 18, color: theme.muted });
    } else {
      addText(slide, title, 0.7, 0.5, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      addText(slide, s.body, 0.85, 1.55, 7.0, 1.2, { fontSize: 20, color: theme.ink, valign: 'top' });
      addBullets(slide, s.bullets, 0.9, 3.0, 6.5, theme);
      addImageOrPlaceholder(slide, s, 8.2, 1.6, 3.8, 4.2, theme);
    }
    addSlideNumber(slide, i, plan.slides.length, theme);
  });
  return pptx;
}
async function createPptxBuffer(plan) {
  const pptx = buildPptx(plan);
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));
}
async function createDocxBuffer(plan) {
  const children = [
    new Paragraph({ text: plan.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: plan.summary || '' }),
    new Paragraph({ text: 'Содержание презентации', heading: HeadingLevel.HEADING_1 })
  ];
  plan.slides.forEach((s, i) => {
    children.push(new Paragraph({ text: `${i + 1}. ${s.title}`, heading: HeadingLevel.HEADING_2 }));
    if (s.body) children.push(new Paragraph(s.body));
    for (const b of s.bullets || []) children.push(new Paragraph({ text: b, bullet: { level: 0 } }));
    for (const c of s.cards || []) children.push(new Paragraph({ children: [new TextRun({ text: `${c.title}: `, bold: true }), new TextRun(c.text)] }));
  });
  if (plan.practicalPart) {
    children.push(new Paragraph({ text: 'Практическая часть', heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph(plan.practicalPart));
  }
  children.push(new Paragraph({ text: 'Источники', heading: HeadingLevel.HEADING_1 }));
  for (const src of plan.sources) children.push(new Paragraph(src.url ? `${src.title}: ${src.url}` : src.title));
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
function createPresentationPdfBuffer(plan) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [960, 540],
      margin: 0,
      autoFirstPage: false,
      info: { Title: `${plan.title} — презентация`, Author: 'Все проекты #Ian' }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Embed a Unicode font so Russian text renders correctly in generated PDFs.
    if (fs.existsSync(PDF_FONT_PATH)) doc.font(PDF_FONT_PATH);
    const theme = plan.theme || COLORS.blue;
    const color = value => `#${String(value || 'FFFFFF').replace(/^#/, '')}`;

    for (const [i, slide] of plan.slides.entries()) {
      doc.addPage({ size: [960, 540], margin: 0 });
      const isCover = slide.type === 'cover';
      doc.rect(0, 0, 960, 540).fill(isCover ? color(theme.accent) : color(theme.bg));
      if (!isCover) doc.rect(0, 0, 12, 540).fill(color(theme.accent));

      if (isCover) {
        doc.fontSize(13).fillColor('#FFFFFF').text('ПРЕЗЕНТАЦИЯ', 50, 48, { width: 430 });
        doc.fontSize(34).fillColor('#FFFFFF').text(normalizeText(slide.title || plan.title, 95), 50, 108, {
          width: slide.imageBytes ? 510 : 820,
          height: 150,
          ellipsis: true
        });
        doc.fontSize(17).fillColor('#F1F5FF').text(normalizeText(slide.subtitle || slide.body || plan.summary, 240), 52, 290, {
          width: slide.imageBytes ? 470 : 780,
          height: 100,
          ellipsis: true
        });
      } else if (slide.type === 'quote') {
        doc.fontSize(12).fillColor(color(theme.ink)).text('КЛЮЧЕВАЯ МЫСЛЬ', 48, 55, { width: 800 });
        doc.fontSize(28).fillColor(color(theme.ink)).text(normalizeText(slide.quote || slide.body || slide.title, 250), 48, 125, {
          width: 820,
          height: 230,
          ellipsis: true
        });
        if (slide.subtitle) doc.fontSize(15).fillColor(color(theme.ink)).text(normalizeText(slide.subtitle, 150), 50, 400, { width: 780, height: 55, ellipsis: true });
      } else {
        doc.fontSize(27).fillColor(color(theme.ink)).text(normalizeText(slide.title || plan.title, 100), 45, 33, {
          width: slide.imageBytes ? 570 : 850,
          height: 68,
          ellipsis: true
        });

        const contentWidth = slide.imageBytes ? 535 : 850;
        let y = 120;
        if (slide.statistic) {
          doc.fontSize(34).fillColor(color(theme.accent)).text(normalizeText(slide.statistic, 50), 48, y, { width: contentWidth, height: 62, ellipsis: true });
          y += 72;
        }
        const intro = slide.body || slide.statisticLabel || slide.subtitle || '';
        if (intro) {
          doc.fontSize(17).fillColor(color(theme.ink)).text(normalizeText(intro, 310), 48, y, {
            width: contentWidth,
            height: 92,
            ellipsis: true
          });
          y += 105;
        }

        const bulletItems = slide.type === 'comparison'
          ? [...(slide.leftItems || []).slice(0, 2), ...(slide.rightItems || []).slice(0, 2)]
          : slide.type === 'process'
            ? (slide.steps || []).slice(0, 4)
            : (slide.bullets || []).slice(0, 4);
        for (const item of bulletItems) {
          if (y > 440) break;
          doc.circle(54, y + 8, 4).fill(color(theme.accent));
          doc.fontSize(14).fillColor(color(theme.ink)).text(normalizeText(item, 140), 68, y, {
            width: contentWidth - 20,
            height: 44,
            ellipsis: true
          });
          y += 48;
        }

        if (slide.cards?.length && y < 430) {
          for (const card of slide.cards.slice(0, 2)) {
            doc.roundedRect(48, y, Math.min(contentWidth, 500), 55, 8).fill(color('FFFFFF'));
            doc.fontSize(12).fillColor(color(theme.accent)).text(normalizeText(card.title, 55), 60, y + 7, { width: Math.min(contentWidth, 475), height: 18, ellipsis: true });
            doc.fontSize(10).fillColor(color(theme.ink)).text(normalizeText(card.text, 115), 60, y + 27, { width: Math.min(contentWidth, 475), height: 20, ellipsis: true });
            y += 62;
          }
        }
      }

      if (slide.imageBytes) {
        try {
          const x = isCover ? 605 : 625;
          const y = isCover ? 95 : 130;
          const w = isCover ? 300 : 285;
          const h = isCover ? 340 : 265;
          doc.roundedRect(x - 8, y - 8, w + 16, h + 16, 12).fill(color(isCover ? 'FFFFFF' : theme.accent2));
          doc.image(slide.imageBytes, x, y, { fit: [w, h], align: 'center', valign: 'center' });
        } catch (error) {
          console.warn('PDF image embed failed:', error.message);
        }
      } else if (!isCover && slide.type !== 'quote') {
        // Декоративная фигура сохраняет аккуратный макет, даже если фото недоступно.
        doc.circle(820, 410, 54).fill(color(theme.accent2));
        doc.circle(870, 450, 22).fill(color(theme.accent));
      }

      doc.fontSize(9).fillColor(color(isCover ? 'FFFFFF' : theme.muted)).text(
        `${String(i + 1).padStart(2, '0')} / ${String(plan.slides.length).padStart(2, '0')}`,
        835, 505, { width: 80, align: 'right' }
      );
    }
    doc.end();
  });
}

function createPdfBuffer(plan) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true, info: { Title: plan.title, Author: 'Генератор презентаций' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    // PDFKit's built-in fonts do not cover Cyrillic reliably; embed DejaVu Sans.
    if (fs.existsSync(PDF_FONT_PATH)) doc.font(PDF_FONT_PATH);
    doc.fontSize(24).fillColor('#244B83').text(plan.title);
    doc.moveDown().fontSize(11).fillColor('#222222').text(plan.summary || '');
    plan.slides.forEach((s, i) => {
      doc.addPage();
      doc.fontSize(10).fillColor('#63718A').text(`СЛАЙД ${i + 1} / ${plan.slides.length}`);
      doc.moveDown(0.5).fontSize(22).fillColor('#244B83').text(s.title);
      doc.moveDown().fontSize(12).fillColor('#222222').text(s.body || '');
      for (const b of s.bullets || []) doc.moveDown(0.4).fontSize(11).text(`• ${b}`);
      if (s.cards?.length) {
        doc.moveDown();
        for (const c of s.cards) doc.fontSize(11).text(`${c.title}: ${c.text}`);
      }
      if (s.imageCredit) doc.moveDown().fontSize(8).fillColor('#666666').text(`Иллюстрация: ${s.imageCredit}`);
    });
    if (plan.practicalPart) {
      doc.addPage().fontSize(22).fillColor('#244B83').text('Практическая часть');
      doc.moveDown().fontSize(12).fillColor('#222222').text(plan.practicalPart);
    }
    doc.addPage().fontSize(22).fillColor('#244B83').text('Источники');
    plan.sources.forEach(s => doc.moveDown().fontSize(10).fillColor('#222222').text(s.url ? `${s.title}: ${s.url}` : s.title));
    doc.end();
  });
}
function createDefensePdfBuffer(plan) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: 54,
      info: { Title: 'Текст защиты — ' + plan.title, Author: 'Все проекты #Ian' }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    if (fs.existsSync(PDF_FONT_PATH)) doc.font(PDF_FONT_PATH);
    const theme = plan.theme || COLORS.blue;
    doc.fillColor('#' + theme.accent).fontSize(23).text('Текст защиты проекта');
    doc.moveDown(0.5);
    doc.fillColor('#' + theme.ink).fontSize(17).text(plan.title || 'Учебный проект');
    doc.moveDown();
    doc.fillColor('#' + theme.muted).fontSize(10).text('Подготовленный текст выступления');
    doc.moveDown();
    doc.fillColor('#' + theme.ink).fontSize(12).text(
      plan.defense || ('Здравствуйте. Представляю проект на тему «' + plan.title + '». ' + (plan.summary || '') + ' ' + (plan.practicalPart || 'В ходе работы были рассмотрены основные аспекты темы и сформулированы выводы.')),
      { lineGap: 5, paragraphGap: 8 }
    );
    if (plan.practicalPart) {
      doc.moveDown();
      doc.fillColor('#' + theme.accent).fontSize(15).text('Практическая часть');
      doc.moveDown(0.4);
      doc.fillColor('#' + theme.ink).fontSize(11).text(plan.practicalPart, { lineGap: 4 });
    }
    if (plan.sources && plan.sources.length) {
      doc.moveDown();
      doc.fillColor('#' + theme.accent).fontSize(14).text('Источники');
      doc.moveDown(0.3);
      doc.fillColor('#' + theme.ink).fontSize(9);
      for (const source of plan.sources) doc.text('• ' + (source.url ? source.title + ' — ' + source.url : source.title), { paragraphGap: 3 });
    }
    doc.end();
  });
}

function createBookletPdfBuffer(plan) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margin: 26, autoFirstPage: false,
      info: { Title: 'Буклет — ' + plan.title, Author: 'Все проекты #Ian' }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    if (fs.existsSync(PDF_FONT_PATH)) doc.font(PDF_FONT_PATH);
    const theme = plan.theme || COLORS.blue;
    const pageW = 842, pageH = 595, margin = 26, gap = 14;
    const panelW = (pageW - margin * 2 - gap * 2) / 3;
    const panelX = [margin, margin + panelW + gap, margin + 2 * (panelW + gap)];
    doc.addPage({ size: 'A4', layout: 'landscape', margin: 26 });
    doc.rect(0, 0, pageW, pageH).fill('#' + theme.bg);
    doc.rect(0, 0, pageW, 12).fill('#' + theme.accent);
    for (let i = 0; i < 3; i++) {
      doc.roundedRect(panelX[i], 28, panelW, pageH - 56, 12).fill('#FFFFFF');
      if (i > 0) doc.moveTo(panelX[i] - gap / 2, 38).lineTo(panelX[i] - gap / 2, pageH - 38).lineWidth(0.7).stroke('#' + theme.accent2);
    }
    doc.fillColor('#' + theme.accent).fontSize(10).text('УЧЕБНЫЙ ПРОЕКТ', panelX[0] + 16, 48, { width: panelW - 32 });
    doc.fillColor('#' + theme.ink).fontSize(20).text(normalizeText(plan.title || 'Проект', 90), panelX[0] + 16, 76, { width: panelW - 32, height: 92, ellipsis: true });
    doc.fillColor('#' + theme.muted).fontSize(10).text('Главное о теме', panelX[0] + 16, 184, { width: panelW - 32 });
    doc.fillColor('#' + theme.ink).fontSize(11).text(normalizeText(plan.summary || (plan.slides[1] && plan.slides[1].body) || '', 500), panelX[0] + 16, 205, { width: panelW - 32, height: 245, ellipsis: true, lineGap: 3 });
    doc.fillColor('#' + theme.accent).fontSize(14).text('Ключевые идеи', panelX[1] + 16, 48, { width: panelW - 32 });
    const ideas = (plan.slides || []).filter(s => s.type !== 'cover' && s.type !== 'sources').slice(0, 5);
    const ideaText = ideas.map((s, i) => (i + 1) + '. ' + s.title + (s.body ? ': ' + s.body : '')).join('\n\n');
    doc.fillColor('#' + theme.ink).fontSize(10).text(normalizeText(ideaText, 1300), panelX[1] + 16, 78, { width: panelW - 32, height: 420, ellipsis: true, lineGap: 3 });
    doc.fillColor('#' + theme.accent).fontSize(14).text('Практика и выводы', panelX[2] + 16, 48, { width: panelW - 32 });
    doc.fillColor('#' + theme.ink).fontSize(10).text(normalizeText(plan.practicalPart || 'Практическая часть помогает применить изученные идеи к теме проекта.', 850), panelX[2] + 16, 78, { width: panelW - 32, height: 200, ellipsis: true, lineGap: 3 });
    const conclusion = (plan.slides || []).slice().reverse().find(s => s.type === 'conclusion' || /вывод|итог/i.test(s.title || ''));
    doc.fillColor('#' + theme.accent).fontSize(12).text('Итог', panelX[2] + 16, 300, { width: panelW - 32 });
    doc.fillColor('#' + theme.ink).fontSize(10).text(normalizeText((conclusion && conclusion.body) || (conclusion && conclusion.bullets && conclusion.bullets.join(' • ')) || 'Тема рассмотрена, основные идеи систематизированы.', 400), panelX[2] + 16, 322, { width: panelW - 32, height: 100, ellipsis: true, lineGap: 3 });
    doc.fillColor('#' + theme.muted).fontSize(8).text('Все проекты #Ian', panelX[2] + 16, 500, { width: panelW - 32 });
    doc.end();
  });
}

async function createZip(files) {
  return new Promise((resolve, reject) => {
    const output = [];
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('data', d => output.push(d));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(output)));
    for (const f of files) archive.append(f.buffer, { name: f.name });
    archive.finalize();
  });
}
function toFile(name, mime, buffer) {
  return { name, mime, base64: buffer.toString('base64') };
}
async function buildFiles(plan) {
  const specs = [
    {
      name: 'Презентация_проекта.pptx',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      create: createPptxBuffer
    },
    {
      name: 'Презентация_проекта.pdf',
      mime: 'application/pdf',
      create: createPresentationPdfBuffer
    },
    {
      name: 'Индивидуальный_проект.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      create: createDocxBuffer
    },
    {
      name: 'Проект_текст.pdf',
      mime: 'application/pdf',
      create: createPdfBuffer
    },
    {
      name: 'Текст_защиты.pdf',
      mime: 'application/pdf',
      create: createDefensePdfBuffer
    },
    {
      name: 'Буклет.pdf',
      mime: 'application/pdf',
      create: createBookletPdfBuffer
    }
  ];

  const results = await Promise.allSettled(specs.map(async (spec) => ({
    ...spec,
    buffer: await withTimeout(spec.create(plan), 30000, `Файл ${spec.name}`)
  })));

  const files = [];
  const fileErrors = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && Buffer.isBuffer(result.value.buffer) && result.value.buffer.length) {
      files.push(toFile(result.value.name, result.value.mime, result.value.buffer));
    } else {
      const error = result.status === 'rejected' ? result.reason : new Error('Файл пустой.');
      const message = cleanText(error?.message || 'Неизвестная ошибка создания файла.', 260);
      console.error(`[buildFiles] ${specs[i].name}:`, error?.stack || error);
      fileErrors.push({ name: specs[i].name, message });
    }
  }

  if (files.length) {
    try {
      const zipParts = files.map(file => ({
        name: file.name,
        buffer: Buffer.from(file.base64, 'base64')
      }));
      const zip = await withTimeout(createZip(zipParts), 10000, 'Создание ZIP');
      files.push(toFile('Весь_проект.zip', 'application/zip', zip));
    } catch (error) {
      console.error('[buildFiles] Весь_проект.zip:', error?.stack || error);
      fileErrors.push({
        name: 'Весь_проект.zip',
        message: cleanText(error?.message || 'Не удалось собрать архив.', 260)
      });
    }
  }

  // Возвращаем готовый проект даже при сбое одного из необязательных форматов.
  return { files, fileErrors };
}
function publicProject(plan) {
  return {
    title: plan.title,
    summary: plan.summary,
    presentation: plan.slides.map(({ imageBytes, imageMime, imageData, ...s }) => s),
    slides: plan.slides.map(({ imageBytes, imageMime, imageData, ...s }) => s),
    practicalPart: plan.practicalPart,
    defense: plan.defense,
    sources: plan.sources,
    slideCount: plan.slides.length
  };
}
async function generateProject(body) {
  const topic = cleanText(body.topic, 180);
  if (!topic) {
    const e = new Error('Укажи тему проекта или презентации.');
    e.status = 400; throw e;
  }
  const count = clampInt(body.slidesCount ?? body.slides ?? body.presentationSlides, 4, MAX_SLIDES, 8);
  const theme = inferTheme(topic, body.style || '');
  const raw = await aiJson(PLANNER_INSTRUCTIONS, {
    topic,
    requestedSlides: count,
    style: body.style || 'современный, профессиональный, соответствующий теме',
    student: {
      firstName: cleanText(body.firstName, 60),
      lastName: cleanText(body.lastName, 60),
      className: cleanText(body.className, 30),
      school: cleanText(body.school, 100)
    },
    extraRequirements: cleanText(body.extraRequirements || body.requirements, 1200),
    requiredStructure: ['обложка и введение', 'проблема', 'факты и аналитика', 'решение и практическая часть', 'выводы', 'источники'],
    outputRules: 'Верни ровно requestedSlides слайдов. Не добавляй фиктивную статистику и ссылки.'
  });
  const plan = normalizePlan(raw, topic, count, theme);
  await attachImages(plan);
  const built = await withTimeout(buildFiles(plan), 45000, 'Сборка файлов');
  return { project: publicProject(plan), files: built.files, fileErrors: built.fileErrors };
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get('/api/health', (_req, res) => res.json({
  ok: true, service: 'presentation-generator', model: MODEL,
  aiProviders: configuredAIProviders().map(provider => provider.name),
  imageGenerationEnabled: process.env.ENABLE_AI_IMAGE_GENERATION === 'true'
}));

app.post('/api/generate-project', asyncRoute(async (req, res) => {
  const result = await withTimeout(generateProject(req.body || {}), REQUEST_TIMEOUT_MS, 'Создание проекта');
  res.json(result);
}));

app.post('/api/edit-project', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const project = body.project;
  const instruction = cleanText(body.instruction, 1500);
  if (!project || !Array.isArray(project.presentation || project.slides) || !instruction) {
    return res.status(400).json({ error: 'Нужны project с массивом слайдов и instruction.' });
  }
  const oldSlides = project.presentation || project.slides;
  const count = clampInt(oldSlides.length, 4, MAX_SLIDES, 8);
  const raw = await aiJson(PLANNER_INSTRUCTIONS + '\nРедактируй переданный проект с учётом инструкции. Сохрани тему и точное количество слайдов.', {
    topic: cleanText(project.title, 180) || 'Презентация',
    requestedSlides: count,
    currentProject: project,
    instruction,
    outputRules: `Верни ровно ${count} слайдов. Не теряй практическую часть и источники.`
  });
  const plan = normalizePlan(raw, cleanText(project.title, 180) || 'Презентация', count, inferTheme(project.title || '', ''));
  // Reuse prior image URLs only when unique; missing images will be searched again.
  const prior = new Set();
  oldSlides.forEach((s, i) => {
    if (plan.slides[i] && s.imageUrl && !prior.has(s.imageUrl)) {
      plan.slides[i].imageUrl = s.imageUrl;
      prior.add(s.imageUrl);
    }
  });
  await attachImages(plan);
  const built = await withTimeout(buildFiles(plan), 45000, 'Сборка файлов');
  res.json({ project: publicProject(plan), files: built.files, fileErrors: built.fileErrors });
}));

app.post('/api/chat', asyncRoute(async (req, res) => {
  const question = cleanText(req.body?.question, 2000);
  if (!question) return res.status(400).json({ error: 'Напиши вопрос.' });
  const result = await runAIWithFallback(
    'Ты полезный русскоязычный помощник сайта создания школьных проектов и презентаций. Отвечай ясно, по делу, не выдумывай факты.',
    question, false, 45000
  );
  res.json({ answer: result.output || 'Не удалось сформировать ответ.', provider: result.provider });
}));

app.post('/api/generate-image', asyncRoute(async (req, res) => {
  const prompt = cleanText(req.body?.prompt, 800);
  if (!prompt) return res.status(400).json({ error: 'Укажи описание изображения.' });
  if (!openai) return res.status(503).json({ error: 'На сервере не задан OPENAI_API_KEY.' });
  const result = await withTimeout(openai.images.generate({
    model: IMAGE_MODEL,
    prompt: `Создай качественную иллюстрацию для учебной презентации. Без текста и логотипов. ${prompt}`,
    size: '1024x1024',
    quality: 'low'
  }), 60000, 'Создание изображения');
  const image = result.data?.[0]?.b64_json;
  if (!image) return res.status(502).json({ error: 'Модель не вернула изображение.' });
  res.json({ image, mime: 'image/png' });
}));

// Static site support for the existing Render deployment.
const publicDir = path.resolve(process.cwd(), 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));
app.get('/', (_req, res, next) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(200).send('Сервер генератора презентаций запущен. API: /api/health');
});

// Keep the real reason in the server log and return a sanitized message for diagnosis.
app.use((err, req, res, _next) => {
  console.error(`[${req.method} ${req.path}]`, err?.stack || err);
  if (res.headersSent) return;
  const raw = cleanText(err?.message || 'Неизвестная ошибка сервера.', 600);
  const lower = raw.toLowerCase();
  let status = Number(err?.status) || (err?.name === 'APIError' ? 502 : 500);
  let userMessage = raw;
  if (lower.includes('все подключённые ии')) {
    status = 503;
    userMessage = raw;
  } else if (err?.code === 'insufficient_quota' || lower.includes('you have no credits remaining') ||
      lower.includes('insufficient_quota') || lower.includes('billing hard limit')) {
    status = 503;
    userMessage = 'Закончились средства или доступные кредиты API OpenAI. Пополни баланс или подключи рабочий API-ключ в настройках Render.';
  } else if (status === 429 || lower.includes('rate limit')) {
    status = 429;
    userMessage = 'Слишком много запросов к ИИ. Подожди немного и попробуй ещё раз.';
  } else if (lower.includes('api key') && (lower.includes('invalid') || lower.includes('incorrect'))) {
    status = 503;
    userMessage = 'API-ключ ИИ недействителен. Проверь OPENAI_API_KEY в настройках Render.';
  }
  userMessage = cleanText(userMessage, 600)
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[ключ скрыт]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [скрыт]');
  res.status(status).json({
    error: userMessage || 'Не удалось завершить генерацию. Проверь настройки сервера.',
    details: process.env.NODE_ENV === 'development' ? userMessage : undefined
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Presentation server listening on port ${PORT}`);
  if (!process.env.OPENAI_API_KEY) console.warn('OPENAI_API_KEY is not configured.');
});
