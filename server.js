import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';
import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const REQUEST_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 120000);
// Общий лимит на весь запрос = ИИ + картинки + сборка файлов.
// Раньше он был равен лимиту одного вызова ИИ и обрывал генерацию слишком рано.
const TOTAL_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 120000;
const MAX_SLIDES = 20;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_CONCURRENCY = 4;
const USER_AGENT = 'IanProjectPresentation/1.0 (presentation generator)';
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 })
  : null;

app.disable('x-powered-by');
app.set('trust proxy', 1); // Render стоит за прокси — нужно для корректного req.ip
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// card — фон карточек/таблиц, onAccent2 — цвет текста на фоне accent2.
// Раньше в тёмной теме IT текст был светлым на белых карточках и на бирюзовом фоне — не читался.
const COLORS = {
  blue: { bg: 'F3F6FC', card: 'FFFFFF', ink: '18243A', muted: '63718A', accent: '315EDB', accent2: 'AFC5FF', onAccent2: '18243A' },
  business: { bg: 'F3F5F8', card: 'FFFFFF', ink: '172033', muted: '637083', accent: '244B83', accent2: 'A8BDD4', onAccent2: '172033' },
  it: { bg: '10172A', card: '1B2540', ink: 'F3F7FF', muted: 'B8C4DA', accent: '6D5DFB', accent2: '28D7C5', onAccent2: '10172A' },
  eco: { bg: 'F2F7F0', card: 'FFFFFF', ink: '20382B', muted: '617667', accent: '26734B', accent2: 'B9D9A8', onAccent2: '20382B' },
  education: { bg: 'F7F3FF', card: 'FFFFFF', ink: '28223A', muted: '736A83', accent: '7452C8', accent2: 'D6C9FA', onAccent2: '28223A' },
  science: { bg: 'F1F7FA', card: 'FFFFFF', ink: '18313E', muted: '5B7682', accent: '167D9A', accent2: 'A8DCE8', onAccent2: '18313E' }
};

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}
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
  // \bit\b — раньше "it\b" срабатывало на слова вроде "credit" или "habit".
  if (/\bit\b|айти|программ|нейросет|искусственн.*интеллект|робот|цифров|кибер/.test(t)) return COLORS.it;
  if (/бизнес|эконом|финанс|маркетинг|предприним|менеджмент/.test(t)) return COLORS.business;
  if (/физик|хими|космос|астроном|наук|технолог/.test(t)) return COLORS.science;
  if (/образован|школ|обучен|истори|литератур|общество/.test(t)) return COLORS.education;
  return COLORS.blue;
}
function extractJson(outputText) {
  const text = String(outputText || '').trim();
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  throw new Error('ИИ вернул ответ не в формате JSON.');
}
function normalizeSlideType(type, index) {
  const allowed = ['cover', 'cards', 'comparison', 'stat', 'process', 'quote', 'image', 'table', 'conclusion', 'sources'];
  return allowed.includes(type) ? type : (index === 0 ? 'cover' : 'cards');
}
function normalizeSources(list) {
  return (Array.isArray(list) ? list : [])
    .filter(Boolean)
    .slice(0, 10)
    .map(s => typeof s === 'string' ? { title: normalizeText(s, 160), url: '' } : {
      title: normalizeText(s.title || s.name || 'Источник', 160),
      url: cleanText(s.url || '', 500)
    });
}
function normalizePlan(rawInput, topic, requestedCount, theme) {
  const raw = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const isObj = x => x && typeof x === 'object';
  const inputSlides = (Array.isArray(raw.slides) ? raw.slides : []).filter(isObj);
  const slides = inputSlides.slice(0, requestedCount).map((s, i) => {
    const cards = (Array.isArray(s.cards) ? s.cards : []).filter(isObj).slice(0, 4).map(c => ({
      title: normalizeText(c.title || 'Ключевая идея', 55),
      text: normalizeText(c.text || '', 110),
      value: normalizeText(c.value || '', 25)
    }));
    return {
      type: normalizeSlideType(s.type, i),
      title: normalizeText(s.title || (i === 0 ? topic : `Раздел ${i + 1}`), 90),
      subtitle: normalizeText(s.subtitle || '', 140),
      body: normalizeText(s.body || '', 300),
      bullets: (Array.isArray(s.bullets) ? s.bullets : []).slice(0, 4).map(x => normalizeText(x, 100)).filter(Boolean),
      cards,
      leftTitle: normalizeText(s.leftTitle || 'Преимущества', 55),
      rightTitle: normalizeText(s.rightTitle || 'Ограничения', 55),
      leftItems: (Array.isArray(s.leftItems) ? s.leftItems : []).slice(0, 4).map(x => normalizeText(x, 100)).filter(Boolean),
      rightItems: (Array.isArray(s.rightItems) ? s.rightItems : []).slice(0, 4).map(x => normalizeText(x, 100)).filter(Boolean),
      steps: (Array.isArray(s.steps) ? s.steps : []).slice(0, 5).map(x => normalizeText(x, 100)).filter(Boolean),
      quote: normalizeText(s.quote || s.body || '', 230),
      statistic: normalizeText(s.statistic || '', 35),
      statisticLabel: normalizeText(s.statisticLabel || '', 110),
      table: Array.isArray(s.table) ? s.table.slice(0, 6).map(r => Array.isArray(r) ? r.slice(0, 4).map(x => normalizeText(x, 70)) : []) : [],
      imageQuery: normalizeText(s.imageQuery || `${topic} ${s.title || ''}`, 180),
      imageUrl: '',
      imageCredit: '',
      notes: normalizeText(s.notes || '', 300)
    };
  });
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
    const last = slides.at(-1);
    last.type = 'conclusion';
    // Заголовок от ИИ больше не затирается; если у слайда были только карточки — переносим их в пункты.
    if (!last.bullets.length && last.cards.length) {
      last.bullets = last.cards.map(c => normalizeText(`${c.title}: ${c.text}`, 100));
    }
  }
  return {
    title: normalizeText(raw.title || topic, 140),
    theme: theme,
    summary: normalizeText(raw.summary || '', 500),
    slides,
    sources: normalizeSources(raw.sources),
    practicalPart: normalizeText(raw.practicalPart || '', 1200),
    defense: normalizeText(raw.defense || '', 1800)
  };
}
async function withTimeout(promise, ms, label = 'Операция') {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(httpError(504, `${label}: превышено время ожидания.`)), ms); })
    ]);
  } finally { clearTimeout(timer); }
}
async function aiJson(instructions, payload, timeout = REQUEST_TIMEOUT_MS) {
  if (!openai) throw httpError(503, 'На сервере не задан OPENAI_API_KEY.');
  const result = await withTimeout(openai.responses.create({
    model: MODEL,
    // The Responses API requires the word 'json' in the input messages
    // whenever text.format.type is 'json_object'. Put it in input itself,
    // not only in instructions, to satisfy that API validation reliably.
    instructions,
    input: `Return a valid json object matching the requested schema.\nPayload: ${JSON.stringify(payload)}`,
    text: { format: { type: 'json_object' } }
  }), timeout, 'Генерация ИИ');
  return extractJson(result.output_text);
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

function isWikimediaUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' && u.hostname === 'upload.wikimedia.org';
  } catch { return false; }
}
async function commonsImage(query, used) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|extmetadata|mime',
    iiurlwidth: '1400', format: 'json', origin: '*'
  }).toString();
  const res = await withTimeout(fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(12000)
  }), 14000, 'Поиск изображения');
  if (!res.ok) return null;
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {});
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const candidate = info?.thumburl || info?.url;
    if (!candidate || !isWikimediaUrl(candidate)) continue;
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
  // Wikimedia требует осмысленный User-Agent и при загрузке файла, иначе может отдать 403.
  const response = await withTimeout(fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(12000)
  }), 14000, 'Загрузка изображения');
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
  }), 60000, 'Генерация изображения');
  const b64 = result.data?.[0]?.b64_json;
  return b64 ? { bytes: Buffer.from(b64, 'base64'), mime: 'image/png' } : null;
}
async function runPool(items, limit, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }));
}
async function attachImages(plan) {
  const used = new Set();
  // Резервируем уже известные (из прошлой версии проекта) картинки заранее,
  // чтобы параллельный поиск не выбрал их для других слайдов.
  for (const slide of plan.slides) {
    if (slide.imageUrl && isWikimediaUrl(slide.imageUrl) && !used.has(slide.imageUrl)) used.add(slide.imageUrl);
    else slide.imageUrl = '';
  }
  // Не больше IMAGE_CONCURRENCY одновременных запросов: 20 запросов разом Wikimedia режет ответом 429.
  await runPool(plan.slides, IMAGE_CONCURRENCY, async (slide) => {
    try {
      // Редактирование проекта: раньше «повторное использование» картинок только копировало URL,
      // а сами файлы всё равно искались заново. Теперь старая картинка реально скачивается.
      // Адрес проверяется — иначе клиент мог бы подсунуть любой URL (SSRF).
      if (slide.imageUrl) {
        try {
          const image = await downloadImage(slide.imageUrl);
          slide.imageMime = image.mime;
          slide.imageBytes = image.bytes;
          return;
        } catch (err) {
          console.warn('Reused image failed:', err.message);
          slide.imageUrl = '';
          slide.imageCredit = '';
        }
      }
      const found = await commonsImage(slide.imageQuery || `${plan.title} ${slide.title}`, used);
      if (!found) return;
      const image = await downloadImage(found.url);
      slide.imageUrl = found.url;
      slide.imageCredit = found.credit;
      slide.imageMime = image.mime;
      slide.imageBytes = image.bytes;
    } catch (err) {
      console.warn('Image lookup failed:', err.message);
    }
  });
  // AI-картинки включаются только настройкой в Render; лимит защищает время и стоимость.
  if (process.env.ENABLE_AI_IMAGE_GENERATION === 'true') {
    let generatedCount = 0;
    for (const slide of plan.slides) {
      if (slide.imageBytes || generatedCount >= 4) continue;
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
      // sizingCrop в pptxgenjs не существует — картинка растягивалась. Правильно: sizing.type = 'cover'.
      slide.addImage({
        data: `data:${s.imageMime};base64,${s.imageBytes.toString('base64')}`,
        x, y, w, h, sizing: { type: 'cover', w, h }
      });
      return;
    } catch (e) { console.warn('PPTX image embed failed:', e.message); }
  }
  addText(slide, 'Иллюстрация по теме', x + 0.15, y + h / 2 - 0.2, w - 0.3, 0.4, {
    fontSize: 14, bold: true, color: theme.onAccent2, align: 'center'
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
        slide.addShape('roundRect', { x, y, w: cw - 0.2, h: 1.9, rectRadius: 0.12, fill: { color: theme.card }, line: { color: theme.accent2, transparency: 45 } });
        if (c.value) addText(slide, c.value, x + 0.22, y + 0.18, cw - 0.65, 0.45, { fontSize: 23, bold: true, color: theme.accent });
        addText(slide, c.title, x + 0.22, y + (c.value ? 0.7 : 0.22), cw - 0.65, 0.4, { fontSize: 17, bold: true, color: theme.ink });
        addText(slide, c.text, x + 0.22, y + 1.15, cw - 0.65, 0.55, { fontSize: 13, color: theme.muted, valign: 'top' });
      });
    } else if (type === 'comparison') {
      addText(slide, title, 0.7, 0.45, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      [s.leftTitle, s.rightTitle].forEach((t, j) => {
        const x = 0.75 + j * 6.0;
        slide.addShape('roundRect', { x, y: 1.45, w: 5.65, h: 4.9, rectRadius: 0.12, fill: { color: theme.card }, line: { color: theme.accent2, transparency: 40 } });
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
      const steps = (s.steps?.length ? s.steps : (s.bullets || [])).slice(0, 5);
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
      addText(slide, 'КЛЮЧЕВАЯ МЫСЛЬ', 0.9, 0.8, 10.8, 0.35, { fontSize: 11, bold: true, color: theme.onAccent2, charSpacing: 2 });
      addText(slide, `“${s.quote || s.body || title}”`, 0.9, 1.65, 10.9, 3.5, { fontSize: 29, bold: true, color: theme.onAccent2, valign: 'mid' });
      addText(slide, s.subtitle, 0.95, 5.6, 10.5, 0.45, { fontSize: 15, color: theme.onAccent2 });
    } else if (type === 'table') {
      addText(slide, title, 0.7, 0.45, 11.7, 0.65, { fontSize: 27, bold: true, color: theme.ink });
      const rows = s.table?.some(r => r.length) ? s.table : [['Параметр', 'Описание'], ['Основная идея', s.body || 'Требуется уточнение']];
      const colW = 11.7 / Math.max(1, ...rows.map(r => r.length));
      rows.slice(0, 6).forEach((row, ri) => row.slice(0, 4).forEach((cell, ci) => {
        const x = 0.7 + ci * colW, y = 1.45 + ri * 0.72;
        slide.addShape('rect', { x, y, w: colW, h: 0.7, fill: { color: ri === 0 ? theme.accent : theme.card }, line: { color: theme.accent2, width: 0.6 } });
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

// Стандартный шрифт PDFKit (Helvetica) НЕ поддерживает кириллицу — русский текст в PDF превращался в «кракозябры».
// Нужен TTF-шрифт с кириллицей. Ищем: папка fonts/ рядом с server.js, npm-пакет dejavu-fonts-ttf, системные шрифты.
const FONT_DIRS = [
  path.join(__dirname, 'fonts'),
  path.join(__dirname, 'node_modules', 'dejavu-fonts-ttf', 'ttf'),
  '/usr/share/fonts/truetype/dejavu',
  '/usr/share/fonts/dejavu',
  '/usr/share/fonts/TTF'
];
function findFont(file) {
  for (const dir of FONT_DIRS) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
function createPdfBuffer(plan) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true, info: { Title: plan.title, Author: 'Генератор презентаций' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const regularPath = findFont('DejaVuSans.ttf');
    const boldPath = findFont('DejaVuSans-Bold.ttf') || regularPath;
    let bodyFont = 'Helvetica', boldFont = 'Helvetica-Bold';
    if (regularPath) {
      doc.registerFont('Body', regularPath);
      doc.registerFont('Bold', boldPath);
      bodyFont = 'Body'; boldFont = 'Bold';
    } else {
      console.warn('PDF: шрифт с кириллицей не найден (fonts/DejaVuSans.ttf). Русский текст в PDF будет отображаться неверно.');
    }
    const H = size => doc.font(boldFont).fontSize(size).fillColor('#244B83');
    const P = (size, color = '#222222') => doc.font(bodyFont).fontSize(size).fillColor(color);

    H(24).text(plan.title);
    doc.moveDown();
    P(11).text(plan.summary || '');
    plan.slides.forEach((s, i) => {
      doc.addPage();
      P(10, '#63718A').text(`СЛАЙД ${i + 1} / ${plan.slides.length}`);
      doc.moveDown(0.5);
      H(22).text(s.title);
      doc.moveDown();
      P(12).text(s.body || '');
      for (const b of s.bullets || []) { doc.moveDown(0.4); P(11).text(`• ${b}`); }
      if (s.cards?.length) {
        doc.moveDown();
        for (const c of s.cards) P(11).text(`${c.title}: ${c.text}`);
      }
      if (s.imageCredit) { doc.moveDown(); P(8, '#666666').text(`Иллюстрация: ${s.imageCredit}`); }
    });
    if (plan.practicalPart) {
      doc.addPage();
      H(22).text('Практическая часть');
      doc.moveDown();
      P(12).text(plan.practicalPart);
    }
    doc.addPage();
    H(22).text('Источники');
    plan.sources.forEach(s => { doc.moveDown(); P(10).text(s.url ? `${s.title}: ${s.url}` : s.title); });
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
    archive.finalize().catch(reject);
  });
}
function toFile(name, mime, buffer) {
  return { name, mime, base64: buffer.toString('base64') };
}
async function buildFiles(plan) {
  const stem = safeName(plan.title);
  const pptx = await createPptxBuffer(plan);
  const docx = await createDocxBuffer(plan);
  const pdf = await createPdfBuffer(plan);
  const rawFiles = [
    { name: `${stem}.pptx`, mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx },
    { name: `${stem}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx },
    { name: `${stem}.pdf`, mime: 'application/pdf', buffer: pdf }
  ];
  const zip = await createZip(rawFiles);
  rawFiles.push({ name: `${stem}.zip`, mime: 'application/zip', buffer: zip });
  return rawFiles.map(f => toFile(f.name, f.mime, f.buffer));
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
  if (!topic) throw httpError(400, 'Укажи тему проекта или презентации.');
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
  const files = await withTimeout(buildFiles(plan), 60000, 'Сборка файлов');
  return { project: publicProject(plan), files };
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Простой лимитер запросов по IP: без него любой может сжечь баланс OpenAI через открытые /api/* маршруты.
function rateLimit(max, windowMs = 10 * 60 * 1000) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(req.ip, entry);
    }
    if (++entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Слишком много запросов. Подожди несколько минут и попробуй снова.' });
    }
    next();
  };
}

app.get('/api/health', (_req, res) => res.json({
  ok: true, service: 'presentation-generator', model: MODEL,
  imageGenerationEnabled: process.env.ENABLE_AI_IMAGE_GENERATION === 'true'
}));

app.post('/api/generate-project', rateLimit(15), asyncRoute(async (req, res) => {
  const result = await withTimeout(generateProject(req.body || {}), TOTAL_TIMEOUT_MS, 'Создание проекта');
  res.json(result);
}));

app.post('/api/edit-project', rateLimit(30), asyncRoute(async (req, res) => {
  const body = req.body || {};
  const project = body.project;
  const instruction = cleanText(body.instruction, 1500);
  const oldSlides = (Array.isArray(project?.presentation) ? project.presentation : Array.isArray(project?.slides) ? project.slides : [])
    .filter(s => s && typeof s === 'object');
  if (!project || !oldSlides.length || !instruction) {
    return res.status(400).json({ error: 'Нужны project с массивом слайдов и instruction.' });
  }
  const result = await withTimeout((async () => {
    const count = clampInt(oldSlides.length, 4, MAX_SLIDES, 8);
    const title = cleanText(project.title, 180) || 'Презентация';
    const raw = await aiJson(PLANNER_INSTRUCTIONS + '\nРедактируй переданный проект с учётом инструкции. Сохрани тему и точное количество слайдов.', {
      topic: title,
      requestedSlides: count,
      // Не отправляем в ИИ служебные поля картинок — они только раздувают запрос.
      currentProject: {
        title: project.title,
        summary: project.summary,
        practicalPart: project.practicalPart,
        defense: project.defense,
        sources: project.sources,
        slides: oldSlides.slice(0, MAX_SLIDES).map(({ imageUrl, imageCredit, imageBytes, imageMime, imageData, ...s }) => s)
      },
      instruction,
      outputRules: `Верни ровно ${count} слайдов. Не теряй практическую часть и источники.`
    });
    const plan = normalizePlan(raw, title, count, inferTheme(title, ''));
    // Если ИИ потерял практическую часть/защиту/источники — берём прежние.
    if (!plan.practicalPart) plan.practicalPart = normalizeText(project.practicalPart || '', 1200);
    if (!plan.defense) plan.defense = normalizeText(project.defense || '', 1800);
    if (!plan.sources.length) plan.sources = normalizeSources(project.sources);
    // Прежние картинки переиспользуются только если URL уникален и ведёт на Wikimedia (проверка — в attachImages).
    const prior = new Set();
    oldSlides.forEach((s, i) => {
      const url = typeof s.imageUrl === 'string' ? s.imageUrl : '';
      if (plan.slides[i] && url && isWikimediaUrl(url) && !prior.has(url)) {
        plan.slides[i].imageUrl = url;
        plan.slides[i].imageCredit = cleanText(s.imageCredit || '', 200);
        prior.add(url);
      }
    });
    await attachImages(plan);
    const files = await withTimeout(buildFiles(plan), 60000, 'Сборка файлов');
    return { project: publicProject(plan), files };
  })(), TOTAL_TIMEOUT_MS, 'Редактирование проекта');
  res.json(result);
}));

app.post('/api/chat', rateLimit(60), asyncRoute(async (req, res) => {
  const question = cleanText(req.body?.question, 2000);
  if (!question) return res.status(400).json({ error: 'Напиши вопрос.' });
  if (!openai) return res.status(503).json({ error: 'На сервере не задан OPENAI_API_KEY.' });
  const response = await withTimeout(openai.responses.create({
    model: MODEL,
    instructions: 'Ты полезный русскоязычный помощник сайта создания школьных проектов и презентаций. Отвечай ясно, по делу, не выдумывай факты.',
    input: question
  }), 45000, 'Ответ помощника');
  res.json({ answer: response.output_text || 'Не удалось сформировать ответ.' });
}));

app.post('/api/generate-image', rateLimit(15), asyncRoute(async (req, res) => {
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

// Неизвестные /api-маршруты — JSON, а не HTML-страница, чтобы фронтенд не падал на разборе ответа.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не найден.' }));

// Static site support for the existing Render deployment.
// index.html ищется и в public/, и рядом с server.js (в корне проекта).
// Раздаётся только public/ — корень не раздаётся целиком, чтобы не отдать наружу server.js и .env.
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  const indexPath = [path.join(publicDir, 'index.html'), path.join(__dirname, 'index.html')].find(p => fs.existsSync(p));
  if (indexPath) return res.sendFile(indexPath);
  res.status(200).send('Сервер генератора презентаций запущен. API: /api/health');
});

// Return JSON errors so the frontend can stop its progress indicator instead of hanging at 92%.
app.use((err, req, res, _next) => {
  console.error(`[${req.method} ${req.path}]`, err?.stack || err);
  if (res.headersSent) return;
  let status = 500;
  let message = 'Не удалось завершить генерацию. Попробуй ещё раз.';
  if (err instanceof OpenAI.APIError) {
    // Текст ошибок OpenAI (неверный ключ, нет модели и т.п.) наружу не отдаём — он может содержать часть ключа.
    status = err.status === 429 ? 429 : 502;
    message = status === 429
      ? 'ИИ-сервис перегружен или исчерпан лимит. Попробуй позже.'
      : 'Ошибка ИИ-сервиса. Попробуй ещё раз.';
  } else if (err?.expose && Number(err.status) >= 400 && Number(err.status) < 600) {
    status = Number(err.status);
    message = cleanText(err.message, 500);
  }
  res.status(status).json({
    error: message,
    details: process.env.NODE_ENV === 'development' ? cleanText(err?.message, 1000) : undefined
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Presentation server listening on port ${PORT}`);
  if (!process.env.OPENAI_API_KEY) console.warn('OPENAI_API_KEY is not configured.');
});
// Рекомендация Render: keep-alive дольше, чем у их прокси, иначе иногда бывают случайные 502.
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
