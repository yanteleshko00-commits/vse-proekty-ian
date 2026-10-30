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
import sharp from 'sharp';

const app = express();
const PORT = Number(process.env.PORT || 3000);
// Use a supported OpenAI API model ID; don't let a stale OPENAI_MODEL setting select a non-API product name.
const MODEL = 'gpt-4.1-mini';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
// Keep requests below common hosting/proxy limits; slow image lookups are bounded separately.
const REQUEST_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 95000);
const MAX_SLIDES = 100;
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
function normalizeSlideType(type, index) {
  const allowed = ['cover', 'cards', 'comparison', 'stat', 'process', 'quote', 'image', 'table'];
  return allowed.includes(type) ? type : (index === 0 ? 'cover' : 'cards');
}

const PROJECT_CONTENT_INSTRUCTIONS = 'Ты — методист и автор школьных проектов. Верни только JSON с полями problem, goal, tasks (4-6), relevance, object, subject, hypothesis, theory [{heading,text}], practice {method,materials,steps,result,limitations}, mainPoints, conclusion, sources [{title,url}]. Пиши по-русски на уровне 9 класса. Не выдумывай опросы, эксперименты, статистику, источники и ссылки. Если данных практики нет, предложи выполнимую работу и обозначь результат как планируемый.';
const PRODUCT_INSTRUCTIONS = 'Ты — дизайнер учебных проектных продуктов. Создай самостоятельный готовый материал, который можно использовать отдельно от презентации. Верни только JSON: format, title, subtitle, audience, sections [{heading,body}], steps, checklist, takeaway. Выбери подходящий формат: памятка, буклет, чек-лист, мини-гайд, карточки, инструкция. Дай 3-5 содержательных разделов и конкретные практические пункты. Всё должно опираться на projectContent, не выдумывай факты.';
function xmlEscape(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function wrapProductText(value, maxChars, maxLines) {
  const words=cleanText(value,900).split(/\s+/).filter(Boolean), lines=[]; let line='';
  for(const word of words){const next=line?line+' '+word:word;if(next.length>maxChars&&line){lines.push(line);line=word;}else line=next;if(lines.length>=maxLines)break;}
  if(line&&lines.length<maxLines)lines.push(line);
  return lines;
}
async function generateProjectContent(topic, body) {
  const raw=await aiJson(PROJECT_CONTENT_INSTRUCTIONS,{topic,student:{className:cleanText(body.className,30),school:cleanText(body.school,100)},requirements:cleanText(body.extraRequirements||body.requirements,1200)},55000);
  const practice=raw.practice&&typeof raw.practice==='object'?raw.practice:{};
  const result={
    problem:normalizeText(raw.problem||'',500),goal:normalizeText(raw.goal||'',350),
    tasks:(Array.isArray(raw.tasks)?raw.tasks:[]).map(x=>normalizeText(x,220)).filter(Boolean).slice(0,8),
    relevance:normalizeText(raw.relevance||'',500),object:normalizeText(raw.object||'',250),subject:normalizeText(raw.subject||'',250),hypothesis:normalizeText(raw.hypothesis||'',350),
    theory:(Array.isArray(raw.theory)?raw.theory:[]).map(x=>({heading:normalizeText(x?.heading||'',100),text:normalizeText(x?.text||'',650)})).filter(x=>x.heading&&x.text).slice(0,6),
    practice:{method:normalizeText(practice.method||'',300),materials:normalizeText(practice.materials||'',350),steps:(Array.isArray(practice.steps)?practice.steps:[]).map(x=>normalizeText(x,240)).filter(Boolean).slice(0,8),result:normalizeText(practice.result||'',600),limitations:normalizeText(practice.limitations||'',350)},
    mainPoints:(Array.isArray(raw.mainPoints)?raw.mainPoints:[]).map(x=>normalizeText(x,240)).filter(Boolean).slice(0,8),
    conclusion:normalizeText(raw.conclusion||'',700),
    sources:(Array.isArray(raw.sources)?raw.sources:[]).map(x=>({title:normalizeText(x?.title||'',180),url:cleanText(x?.url||'',500)})).filter(x=>x.title).slice(0,12)
  };
  if(!result.problem||!result.goal||result.tasks.length<3||!result.conclusion)throw new Error('Не удалось подготовить полноценную основу проекта: отсутствуют обязательные разделы.');
  return result;
}
async function generateFinalProduct(topic, projectContent, requestedFormat='') {
  const raw=await aiJson(PRODUCT_INSTRUCTIONS,{topic,requestedFormat:cleanText(requestedFormat,60),projectContent,outputRules:'Создай полезный самостоятельный продукт с конкретными рекомендациями и практическими пунктами.'},50000);
  const product={
    format:normalizeText(raw.format||requestedFormat||'Памятка',40),title:normalizeText(raw.title||topic,90),
    subtitle:normalizeText(raw.subtitle||'Практический материал по теме проекта',180),audience:normalizeText(raw.audience||'Для учащихся',100),
    sections:(Array.isArray(raw.sections)?raw.sections:[]).map(x=>({heading:normalizeText(x?.heading||'',70),body:normalizeText(x?.body||'',420)})).filter(x=>x.heading&&x.body).slice(0,5),
    steps:(Array.isArray(raw.steps)?raw.steps:[]).map(x=>normalizeText(x,180)).filter(Boolean).slice(0,5),
    checklist:(Array.isArray(raw.checklist)?raw.checklist:[]).map(x=>normalizeText(x,150)).filter(Boolean).slice(0,5),
    takeaway:normalizeText(raw.takeaway||projectContent.conclusion,300)
  };
  if(product.sections.length<2||(!product.steps.length&&!product.checklist.length))throw new Error('Итоговый продукт неполный: нужны разделы и практические пункты.');
  return product;
}
async function renderProductImage(product,theme) {
  const accent='#'+(theme?.accent||COLORS.blue.accent),ink='#'+(theme?.ink||COLORS.blue.ink),muted='#'+(theme?.muted||COLORS.blue.muted),pale='#'+(theme?.accent2||COLORS.blue.accent2);
  const chunks=[];let y=330;
  for(const section of product.sections.slice(0,4)){
    chunks.push('<rect x="72" y="'+y+'" width="1096" height="210" rx="28" fill="#fff" stroke="'+pale+'" stroke-width="3"/>');
    chunks.push('<text x="112" y="'+(y+58)+'" font-family="Arial" font-size="34" font-weight="700" fill="'+accent+'">'+xmlEscape(section.heading)+'</text>');
    wrapProductText(section.body,62,3).forEach((line,i)=>chunks.push('<text x="112" y="'+(y+112+i*42)+'" font-family="Arial" font-size="25" fill="'+ink+'">'+xmlEscape(line)+'</text>'));
    y+=232;
  }
  const items=(product.checklist.length?product.checklist:product.steps).slice(0,4), listY=Math.min(y+8,1370);
  chunks.push('<rect x="72" y="'+listY+'" width="1096" height="250" rx="28" fill="'+pale+'" opacity=".34"/>');
  chunks.push('<text x="112" y="'+(listY+58)+'" font-family="Arial" font-size="32" font-weight="700" fill="'+accent+'">'+(product.checklist.length?'Проверь себя':'Что делать')+'</text>');
  items.forEach((item,i)=>{chunks.push('<circle cx="126" cy="'+(listY+108+i*42)+'" r="8" fill="'+accent+'"/>');chunks.push('<text x="152" y="'+(listY+117+i*42)+'" font-family="Arial" font-size="23" fill="'+ink+'">'+xmlEscape(wrapProductText(item,65,1)[0]||item)+'</text>');});
  const takeaway=wrapProductText(product.takeaway,75,2).join(' ');
  const subtitle=wrapProductText(product.subtitle,75,2).map((line,i)=>'<text x="84" y="'+(250+i*38)+'" font-family="Arial" font-size="25" fill="'+muted+'">'+xmlEscape(line)+'</text>').join('');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754"><rect width="1240" height="1754" fill="#f7f9fc"/><rect width="1240" height="24" fill="'+accent+'"/><text x="82" y="100" font-family="Arial" font-size="24" font-weight="700" fill="'+accent+'">'+xmlEscape(product.format.toUpperCase())+' • ИТОГОВЫЙ ПРОДУКТ</text><text x="82" y="190" font-family="Arial" font-size="52" font-weight="700" fill="'+ink+'">'+xmlEscape(product.title)+'</text>'+subtitle+chunks.join('')+'<text x="82" y="1655" font-family="Arial" font-size="22" fill="'+muted+'">'+xmlEscape(takeaway)+'</text><text x="82" y="1710" font-family="Arial" font-size="18" fill="'+muted+'">Все проекты #Ian • '+xmlEscape(product.audience)+'</text></svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}
function createProductPdfBuffer(plan) {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:0,info:{Title:plan.product.title,Author:'Все проекты #Ian'}}),chunks=[];
    doc.on('data',x=>chunks.push(x));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    doc.image(plan.product.imageBytes,0,0,{fit:[595.28,841.89],align:'center',valign:'center'});doc.end();
  });
}

function normalizePlan(raw, topic, requestedCount, theme) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('ИИ вернул неверную структуру презентации.');
  if (containsCorruptedText(raw) || containsCorruptedText(topic)) {
    const error = new Error('ИИ вернул текст с ошибкой кодировки. Презентация не создана, чтобы не выдавать испорченный текст за готовую работу.');
    error.status = 502; throw error;
  }
  const inputSlides = Array.isArray(raw.slides) ? raw.slides : [];
  if (inputSlides.length !== requestedCount) {
    const error = new Error(`ИИ вернул ${inputSlides.length} слайдов вместо ${requestedCount}. Шаблонные слайды не будут подставлены вместо содержания — попробуй ещё раз.`);
    error.status = 502; throw error;
  }
  const slides = inputSlides.map((s, i) => ({
    type: normalizeSlideType(s.type, i),
    title: normalizeText(s.title || '', 90),
    subtitle: normalizeText(s.subtitle || '', 140),
    body: normalizeText(s.body || '', 300),
    bullets: (Array.isArray(s.bullets) ? s.bullets : []).slice(0, 4).map(x => normalizeText(x, 100)).filter(Boolean),
    cards: (Array.isArray(s.cards) ? s.cards : []).slice(0, 4).map(card => ({
      title: normalizeText(card?.title || '', 55), text: normalizeText(card?.text || '', 110), value: normalizeText(card?.value || '', 25)
    })).filter(card => card.title || card.text),
    leftTitle: normalizeText(s.leftTitle || 'Сторона A', 55),
    rightTitle: normalizeText(s.rightTitle || 'Сторона B', 55),
    leftItems: (Array.isArray(s.leftItems) ? s.leftItems : []).slice(0, 4).map(x => normalizeText(x, 100)).filter(Boolean),
    rightItems: (Array.isArray(s.rightItems) ? s.rightItems : []).slice(0, 4).map(x => normalizeText(x, 100)).filter(Boolean),
    steps: (Array.isArray(s.steps) ? s.steps : []).slice(0, 5).map(x => normalizeText(x, 100)).filter(Boolean),
    quote: normalizeText(s.quote || '', 230),
    statistic: normalizeText(s.statistic || '', 35),
    statisticLabel: normalizeText(s.statisticLabel || '', 110),
    table: Array.isArray(s.table) ? s.table.slice(0, 6).map(row => Array.isArray(row) ? row.slice(0, 4).map(x => normalizeText(x, 70)) : []) : [],
    imageQuery: normalizeText(s.imageQuery || '', 180),
    imageUrl: '', imageCredit: '', notes: normalizeText(s.notes || '', 300)
  }));
  if (slides.some(s => !s.title || !s.imageQuery)) throw new Error('В презентации есть слайд без заголовка или описания изображения.');
  slides[0].type = 'cover';
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).slice(0, 10)
    .map(source => typeof source === 'string'
      ? { title: normalizeText(source, 160), url: '' }
      : { title: normalizeText(source?.title || source?.name || 'Источник', 160), url: cleanText(source?.url || '', 500) })
    .filter(source => source.title);
  return {
    title: normalizeText(raw.title || topic, 140), theme,
    summary: normalizeText(raw.summary || '', 500),
    designDirection: normalizeText(raw.designDirection || 'Цельная редакционная композиция с тематическими фотографиями и разными макетами.', 500),
    colorMood: normalizeText(raw.colorMood || '', 120), slides, sources,
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
    }, { timeout: requestTimeout }), requestTimeout, 'ИИ ' + provider.name);
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
  const deadline = Date.now() + Math.min(timeout, 60000);
  for (const provider of providers) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      const output = await callAIProvider(provider, instructions, input, jsonMode, Math.min(16000, remaining));
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
function scoreAIJsonCandidate(parsed, payload) {
  const requestedSlides = Number.parseInt(payload?.requestedSlides, 10);
  const isPresentation = Boolean(payload?.topic && Number.isInteger(requestedSlides) && requestedSlides > 0);
  const issues = isPresentation ? validatePresentationPlan(parsed, requestedSlides) : [];
  const slides = Array.isArray(parsed?.slides) ? parsed.slides : [];
  const titles = slides.map(slide => cleanText(slide?.title, 100).toLocaleLowerCase('ru')).filter(Boolean);
  const queries = slides.map(slide => cleanText(slide?.imageQuery, 180).toLocaleLowerCase('en')).filter(Boolean);
  const types = slides.map(slide => String(slide?.type || '')).filter(Boolean);
  const contentValues = slides.flatMap(slide => [
    slide?.subtitle, slide?.body, slide?.quote, slide?.statisticLabel,
    ...(Array.isArray(slide?.bullets) ? slide.bullets : []),
    ...(Array.isArray(slide?.steps) ? slide.steps : []),
    ...(Array.isArray(slide?.cards) ? slide.cards.flatMap(card => [card?.title, card?.text]) : []),
    ...(Array.isArray(slide?.leftItems) ? slide.leftItems : []),
    ...(Array.isArray(slide?.rightItems) ? slide.rightItems : [])
  ]).filter(value => typeof value === 'string' && value.trim());
  const wordCount = contentValues.join(' ').split(/\s+/).filter(Boolean).length;
  const baseScore = issues.length === 0 ? 100000 : 50000 - issues.length * 2500;
  const score = baseScore + Math.min(700, wordCount * 2)
    + new Set(titles).size * 20 + new Set(queries).size * 10 + new Set(types).size * 14;
  return { score, issues, slideCount: slides.length };
}

async function aiJson(instructions, payload, timeout = REQUEST_TIMEOUT_MS) {
  const input = 'Return a valid json object matching the requested schema.\nPayload: ' + JSON.stringify(payload);
  const providers = configuredAIProviders();
  if (!providers.length) {
    throw new Error('Не подключены API-ключи ИИ. Добавь хотя бы один рабочий API-ключ провайдера в Render.');
  }

  // All configured providers start together. A failed provider cannot cancel the others.
  const perProviderTimeout = Math.max(4000, Math.min(16000, timeout));
  const waveStartedAt = Date.now();
  const attempts = await Promise.all(providers.map(async provider => {
    const startedAt = Date.now();
    try {
      const output = await callAIProvider(provider, instructions, input, true, perProviderTimeout);
      if (!cleanText(output, 12000)) throw new Error('Пустой ответ.');
      const parsed = extractJson(output);
      if (containsCorruptedText(parsed)) throw new Error('Ответ содержит повреждённый текст/ошибку кодировки.');
      const quality = scoreAIJsonCandidate(parsed, payload);
      return {
        ok: true, provider: provider.name, parsed,
        score: quality.score, issues: quality.issues, slideCount: quality.slideCount,
        elapsedMs: Date.now() - startedAt
      };
    } catch (error) {
      const message = cleanText(error?.message || 'неизвестная ошибка', 350)
        .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[ключ скрыт]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [скрыт]');
      return { ok: false, provider: provider.name, error: message, elapsedMs: Date.now() - startedAt };
    }
  }));

  const successes = attempts.filter(attempt => attempt.ok);
  const failures = attempts.filter(attempt => !attempt.ok);
  failures.forEach(attempt => {
    console.warn('[AI competition] ' + attempt.provider + ' не прошёл: ' + attempt.error + ' (' + attempt.elapsedMs + ' мс)');
  });

  if (!successes.length) {
    const reasons = failures.map(attempt => attempt.provider + ': ' + attempt.error).join(' | ')
      || 'Провайдеры не успели ответить в отведённое время.';
    if (payload && payload.topic && !payload.currentProject) {
      console.error('[AI competition] Все провайдеры провалились. Не создаю шаблонную презентацию.');
      const error = new Error('Не удалось получить пригодный ответ от ИИ. Диагностика: ' + reasons + '. Проверь ключи, лимиты и Render Logs.');
      error.status = 503;
      error.code = 'AI_PROVIDERS_UNAVAILABLE';
      throw error;
    }
    const error = new Error('Все подключённые ИИ недоступны или вернули некорректный JSON. Диагностика: ' + reasons);
    error.status = 503;
    throw error;
  }

  // Quality validation outranks response speed; speed breaks ties only.
  successes.sort((a, b) => b.score - a.score || a.elapsedMs - b.elapsedMs);
  successes.forEach((candidate, index) => {
    console.log('[AI competition] #' + (index + 1) + ' ' + candidate.provider
      + ': score=' + candidate.score + ', issues=' + candidate.issues.length
      + ', slides=' + candidate.slideCount + ', time=' + candidate.elapsedMs + 'ms');
  });
  const winner = successes[0];
  console.log('[AI competition] Победитель: ' + winner.provider
    + ' (score=' + winner.score + '), сравнено ответов: ' + successes.length
    + '/' + providers.length + ', общая длительность=' + (Date.now() - waveStartedAt) + 'ms.');
  return winner.parsed;
}
const PLANNER_INSTRUCTIONS = `
Ты — редактор школьных презентаций, исследователь и профессиональный арт-директор. Верни только один валидный JSON-объект, без Markdown и комментариев.
ЦЕЛЬ: подготовить содержательную презентацию, которую ученик сможет понять и защитить. Это не набор карточек с общими словами. Сначала продумай сюжетную линию, затем напиши каждый слайд как отдельный законченный смысловой шаг.
СОДЕРЖАНИЕ:
- Пиши по-русски на школьном уровне, объясняй сложное простыми словами без искажения фактов.
- Верни ровно requestedSlides слайдов. Не пропускай, не объединяй и не добавляй слайды.
- Логика: обложка → контекст/исследовательский вопрос → конкретные объяснения и факты → реальные примеры → практическое применение → ещё один содержательный аспект темы на последнем слайде.
- Не делай отдельных слайдов «Источники», «Итоги», «Выводы». Источники укажи в поле sources. Последний слайд раскрывает тему, а не является пустым заключением.
- Каждый слайд сообщает новую информацию: факт, причину, механизм, сравнение, пример, метод, наблюдение или ограничение. Не повторяй предыдущий слайд другими словами.
- Запрещены шаблонные заголовки без конкретики: «Основные элементы», «Главная идея», «Развитие темы», «Пример из практики», «Актуальность темы», «Практические аспекты».
- Не выдумывай проценты, статистику, цитаты, исследования, организации, URL и результаты экспериментов. Не утверждай, что ученик проводил опрос или эксперимент, если данных нет.
- Заголовок до 8 слов, body до 45 слов, не более 4 коротких bullets. Убери повторы, общие слова и длинные абзацы.
- cards: 2–4 конкретные карточки с уникальными заголовками и объяснениями. comparison: конкретные сопоставимые пункты с обеих сторон. process: 2–5 реальных шагов. stat: число только если оно обосновано; не придумывай цифры. table: заголовок и содержательные строки.
- Не оставляй пустые слайды и текст-заполнитель. Практическая часть должна предлагать выполнимый метод, а не поддельные результаты.
ВИЗУАЛЬНАЯ КОНЦЕПЦИЯ:
- В designDirection задай цельную арт-дирекцию: настроение, визуальный язык, принципы композиции и контраст. colorMood — 2–4 подходящих цвета словами.
- Используй только type из: cover,cards,comparison,stat,process,quote,image,table.
- Меняй композиции по смыслу; не используй один type более двух раз подряд.
- Каждый слайд обязан иметь отдельный imageQuery на английском: конкретная фотографическая сцена по содержанию именно этого слайда (объект + действие/место/условие). Запросы различаются по объекту, ракурсу и сцене. Не используй один общий запрос для всей темы, логотипы, флаги, схемы и изображения с надписями.
- Для каждого type заполняй нужные поля реальным содержанием.
ПЕРЕД ОТВЕТОМ ПРОВЕРЬ точное число слайдов, уникальность заголовков, содержательность каждого слайда, разные imageQuery, отсутствие шаблонов, вымышленных чисел и фиктивных источников.
Верни поля: title, summary, designDirection, colorMood, practicalPart, defense, sources [{title,url}], slides [{type,title,subtitle,body,bullets,cards,leftTitle,rightTitle,leftItems,rightItems,steps,quote,statistic,statisticLabel,table,imageQuery,notes}].
`;

function validatePresentationPlan(raw, requestedCount) {
  const issues = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['ответ не является JSON-объектом'];
  if (!Array.isArray(raw.slides)) return ['отсутствует массив slides'];
  if (raw.slides.length !== requestedCount) issues.push(`нужно ровно ${requestedCount} слайдов, получено ${raw.slides.length}`);
  const slides = raw.slides.slice(0, requestedCount);
  const titleCounts = new Map(), imageQueries = new Map(), repeatedBodies = new Map();
  const genericTitle = /^(?:развитие темы|основные элементы|главная идея|актуальность темы|пример из практики|практические аспекты|раздел \d+)(?:\s|:|$)/i;
  slides.forEach((slide, index) => {
    const prefix = `слайд ${index + 1}`;
    if (!slide || typeof slide !== 'object') { issues.push(`${prefix}: отсутствует объект`); return; }
    const title = cleanText(slide.title, 100).replace(/[.!?]+$/, '').toLocaleLowerCase('ru');
    if (!title) issues.push(`${prefix}: пустой заголовок`);
    if (title) titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
    if (title && genericTitle.test(title)) issues.push(`${prefix}: шаблонный заголовок «${slide.title}»`);
    if (/^(?:источники|итоги|выводы|заключение)(?:\s|:|$)/i.test(title)) issues.push(`${prefix}: запрещён пустой финальный слайд с источниками или общим заключением`);
    const allowedTypes = ['cover', 'cards', 'comparison', 'stat', 'process', 'quote', 'image', 'table'];
    if (!allowedTypes.includes(String(slide.type || ''))) issues.push(`${prefix}: неподдерживаемый тип макета`);
    const query = cleanText(slide.imageQuery, 180).toLocaleLowerCase('en').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!query) issues.push(`${prefix}: нет собственного imageQuery`);
    if (query) imageQueries.set(query, (imageQueries.get(query) || 0) + 1);
    const parts = [
      slide.subtitle, slide.body, slide.quote, slide.statisticLabel,
      ...(Array.isArray(slide.bullets) ? slide.bullets : []),
      ...(Array.isArray(slide.steps) ? slide.steps : []),
      ...(Array.isArray(slide.cards) ? slide.cards.flatMap(card => [card?.title, card?.text]) : []),
      ...(Array.isArray(slide.leftItems) ? slide.leftItems : []),
      ...(Array.isArray(slide.rightItems) ? slide.rightItems : []),
      ...(Array.isArray(slide.table) ? slide.table.flat() : [])
    ].filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean);
    if (parts.join(' ').length < 32) issues.push(`${prefix}: недостаточно содержательного текста`);
    const type = normalizeSlideType(slide.type, index);
    if (type === 'cards' && !(Array.isArray(slide.cards) && slide.cards.filter(card => card?.title && card?.text).length >= 2)) {
      issues.push(`${prefix}: для макета cards нужны минимум две полностью заполненные карточки`);
    }
    if (type === 'stat' && !cleanText(slide.statistic || slide.statisticLabel || slide.body, 180)) {
      issues.push(`${prefix}: для макета stat нужен конкретный факт или тезис`);
    }
    if (type === 'comparison' &&
        (!(Array.isArray(slide.leftItems) && slide.leftItems.filter(Boolean).length >= 2) ||
         !(Array.isArray(slide.rightItems) && slide.rightItems.filter(Boolean).length >= 2))) {
      issues.push(`${prefix}: сравнение должно содержать минимум два пункта с каждой стороны`);
    }
    if (type === 'process' &&
        !(Array.isArray(slide.steps) && slide.steps.filter(Boolean).length >= 2) &&
        !(Array.isArray(slide.bullets) && slide.bullets.filter(Boolean).length >= 3)) {
      issues.push(`${prefix}: процесс должен содержать шаги`);
    }
    if (type === 'table' && !(Array.isArray(slide.table) && slide.table.filter(row => Array.isArray(row) && row.some(Boolean)).length >= 3)) {
      issues.push(`${prefix}: таблица должна содержать заголовок и две содержательные строки`);
    }
    const bodyKey = cleanText(slide.body, 300).toLocaleLowerCase('ru').replace(/[.,!?:;()«»"—-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (bodyKey.length >= 45) repeatedBodies.set(bodyKey, (repeatedBodies.get(bodyKey) || 0) + 1);
  });
  for (const [title, count] of titleCounts) if (count > 1) issues.push(`повторяется заголовок «${title}»`);
  for (const count of repeatedBodies.values()) if (count > 1) issues.push('повторяется один и тот же текст на нескольких слайдах');
  const requiredUniqueQueries = Math.max(1, Math.ceil(slides.length * 0.8));
  if (slides.length > 1 && imageQueries.size < requiredUniqueQueries) issues.push(`нужно не менее ${requiredUniqueQueries} разных запросов изображений, получено ${imageQueries.size}`);
  return [...new Set(issues)].slice(0, 20);
}
async function generateValidatedPresentation(topic, requestedCount, payload, instructions = PLANNER_INSTRUCTIONS) {
  let raw = await aiJson(instructions, payload);
  let issues = validatePresentationPlan(raw, requestedCount);
  if (issues.length) {
    console.warn('[presentation-quality] План не прошёл проверку; запрашиваю исправление:', issues.join('; '));
    const repairInstructions = instructions + `

РЕЖИМ ИСПРАВЛЕНИЯ: предыдущий JSON не прошёл автоматическую проверку. Верни ПОЛНЫЙ исправленный JSON, а не список изменений. Сохрани тему и точное количество слайдов. Исправь каждую проблему, не маскируй нехватку текста шаблонами.
Ошибки проверки:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\\n')}
`;
    raw = await aiJson(repairInstructions, {
      topic, requestedSlides: requestedCount, originalRequest: payload,
      previousDraft: raw, validationErrors: issues,
      outputRules: `Верни ровно ${requestedCount} неповторяющихся слайдов и все требуемые поля. Исправь каждую ошибку из validationErrors.`
    });
    issues = validatePresentationPlan(raw, requestedCount);
  }
  if (issues.length) {
    const error = new Error('ИИ не смог подготовить презентацию, прошедшую проверку качества: ' + issues.slice(0, 5).join('; ') + '. Попробуй ещё раз или укажи более конкретную тему.');
    error.status = 502; error.code = 'PRESENTATION_QUALITY_CHECK_FAILED'; throw error;
  }
  return raw;
}

async function commonsImage(query, used) {
  // Несколько коротких запросов повышают шанс найти тематическую фотографию.
  const queries = [
    String(query || '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim(),
    String(query || '').split(/[—:,.!?]/)[0].trim(),
    String(query || '').split(/\s+/).slice(0, 5).join(' ').trim()
  ].filter((q, i, a) => q.length >= 3 && a.indexOf(q) === i);
  for (const q of queries) {
    try {
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.search = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: q,
        gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo',
        iiprop: 'url|mime', iiurlwidth: '1400', format: 'json', origin: '*'
      }).toString();
      const res = await withTimeout(fetch(url, {
        headers: { 'User-Agent': 'IanProjectPresentation/1.1 (educational presentation generator; contact: site owner)' },
        signal: AbortSignal.timeout(4200)
      }), 4500, 'Поиск изображения');
      if (!res.ok) continue;
      const data = await res.json();
      const pages = Object.values(data.query?.pages || {});
      // Prefer real photographic formats and skip SVG/animated assets.
      pages.sort((a, b) => {
        const score = p => {
          const info = p.imageinfo?.[0] || {};
          const mime = info.mime || '';
          const title = (p.title || '').toLowerCase();
          return (['image/jpeg', 'image/png'].includes(mime) ? 4 : 0)
            + (/\.(jpg|jpeg|png)$/i.test(title) ? 2 : 0)
            - (/logo|icon|flag|map|diagram|symbol/i.test(title) ? 5 : 0);
        };
        return score(b) - score(a);
      });
      for (const page of pages) {
        const info = page.imageinfo?.[0];
        const candidate = info?.thumburl || info?.url;
        if (!candidate || !/^https:\/\/upload\.wikimedia\.org\//i.test(candidate)) continue;
        if (used.has(candidate)) continue;
        if (!['image/jpeg', 'image/png'].includes(info?.mime || '')) continue;
        used.add(candidate);
        return { url: candidate, credit: `${page.title || 'Изображение'} — Wikimedia Commons`, title: page.title || '' };
      }
    } catch (err) {
      console.warn('Wikimedia search attempt failed:', err.message);
    }
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
  }, { timeout: 8000 }), 8000, 'Генерация изображения');
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
    const query = cleanText(slide.imageQuery, 180).toLocaleLowerCase('en').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const found = await commonsImage(query, used);
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
  const realImageCount = plan.slides.filter(slide => Boolean(slide.imageBytes)).length;
  console.log(`[images] Найдено реальных изображений: ${realImageCount}/${plan.slides.length}`);
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
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.16, fill: { color: theme.accent2, transparency: 4 }, line: { color: theme.accent2, transparency: 100 } });
  if (s.imageBytes) {
    try {
      slide.addImage({ data: `data:${s.imageMime};base64,${s.imageBytes.toString('base64')}`, x, y, w, h, sizingCrop: true });
      return;
    } catch (error) { console.warn('PPTX image embed failed:', error.message); }
  }
  // Разные векторные композиции вместо одной повторяющейся заглушки, если фотопоиск недоступен.
  const type = normalizeSlideType(s.type, 0);
  const accent = theme.accent, pale = theme.accent2;
  const ix = x + w * 0.12, iy = y + h * 0.12, iw = w * 0.76, ih = h * 0.76;
  const seed = [...String(s.title || '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  if (type === 'process') {
    const cy = y + h * 0.48;
    for (let i = 0; i < 4; i++) {
      const cx = ix + iw * (i + 0.5) / 4;
      if (i < 3) slide.addShape('line', { x: cx + 0.12, y: cy, w: iw / 4 - 0.24, h: 0, line: { color: accent, transparency: 20, width: 2, endArrowType: 'triangle' } });
      slide.addShape('ellipse', { x: cx - 0.22, y: cy - 0.22, w: 0.44, h: 0.44, fill: { color: i % 2 ? pale : accent }, line: { color: 'FFFFFF', transparency: 30, width: 1.5 } });
      addText(slide, String(i + 1), cx - 0.15, cy - 0.12, 0.3, 0.22, { fontSize: 11, bold: true, color: i % 2 ? theme.ink : 'FFFFFF', align: 'center' });
    }
  } else if (type === 'comparison') {
    const half = (iw - 0.14) / 2;
    slide.addShape('roundRect', { x: ix, y: iy + ih * 0.12, w: half, h: ih * 0.76, rectRadius: 0.1, fill: { color: 'FFFFFF', transparency: 8 }, line: { color: accent, transparency: 35, width: 1.3 } });
    slide.addShape('roundRect', { x: ix + half + 0.14, y: iy + ih * 0.12, w: half, h: ih * 0.76, rectRadius: 0.1, fill: { color: pale, transparency: 12 }, line: { color: pale, transparency: 15, width: 1.3 } });
    for (let i = 0; i < 3; i++) {
      const yy = iy + ih * (0.36 + i * 0.17);
      slide.addShape('line', { x: ix + 0.14, y: yy, w: half - 0.28, h: 0, line: { color: accent, transparency: 15, width: 2 } });
      slide.addShape('line', { x: ix + half + 0.28, y: yy, w: half - 0.28, h: 0, line: { color: theme.muted, transparency: 35, width: 2 } });
    }
  } else if (type === 'stat') {
    const radius = Math.min(iw, ih) * 0.31;
    slide.addShape('ellipse', { x: x + w * 0.12, y: y + h * 0.18, w: radius * 2, h: radius * 2, fill: { color: accent, transparency: 5 }, line: { color: 'FFFFFF', transparency: 65, width: 2 } });
    slide.addShape('ellipse', { x: x + w * 0.24, y: y + h * 0.31, w: radius * 1.22, h: radius * 1.22, fill: { color: pale, transparency: 6 }, line: { color: pale, transparency: 100 } });
    for (let i = 0; i < 4; i++) {
      const bh = ih * (0.2 + ((seed + i * 7) % 5) * 0.1);
      slide.addShape('roundRect', { x: x + w * (0.57 + i * 0.09), y: y + h * 0.82 - bh, w: w * 0.055, h: bh, rectRadius: 0.05, fill: { color: i % 2 ? pale : accent }, line: { color: 'FFFFFF', transparency: 100 } });
    }
  } else if (type === 'table') {
    const rows = 4, cols = 3, cw = iw / cols, rh = ih / rows;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      slide.addShape('rect', { x: ix + col * cw, y: iy + row * rh, w: cw, h: rh, fill: { color: row === 0 ? accent : (col === 0 ? pale : 'FFFFFF'), transparency: row === 0 ? 0 : 8 }, line: { color: pale, transparency: 18, width: 0.8 } });
    }
  } else if (type === 'quote') {
    addText(slide, '“', x + w * 0.12, y + h * 0.03, w * 0.7, h * 0.8, { fontSize: Math.min(96, h * 28), bold: true, color: accent, valign: 'mid' });
    slide.addShape('line', { x: ix, y: y + h * 0.78, w: iw * 0.68, h: 0, line: { color: accent, transparency: 10, width: 3 } });
  } else if (type === 'cards') {
    const cw = iw * 0.43, ch = ih * 0.34;
    for (let i = 0; i < 3; i++) {
      const col = i === 2 ? 1 : i, row = i === 2 ? 1 : 0;
      const xx = ix + col * (cw + iw * 0.06), yy = iy + row * (ch + ih * 0.1);
      slide.addShape('roundRect', { x: xx, y: yy, w: cw, h: ch, rectRadius: 0.1, fill: { color: 'FFFFFF', transparency: 5 }, line: { color: i % 2 ? pale : accent, transparency: 35, width: 1.1 } });
      slide.addShape('line', { x: xx + 0.12, y: yy + ch * 0.34, w: cw * 0.65, h: 0, line: { color: accent, width: 2 } });
      slide.addShape('line', { x: xx + 0.12, y: yy + ch * 0.58, w: cw * 0.5, h: 0, line: { color: pale, width: 2 } });
    }
  } else {
    const offset = (seed % 5) * 0.045;
    slide.addShape('ellipse', { x: ix + iw * (0.08 + offset), y: iy + ih * 0.08, w: iw * 0.72, h: ih * 0.72, fill: { color: accent, transparency: 18 }, line: { color: accent, transparency: 100 } });
    slide.addShape('ellipse', { x: ix + iw * (0.4 - offset), y: iy + ih * 0.22, w: iw * 0.48, h: ih * 0.6, fill: { color: pale, transparency: 12 }, line: { color: pale, transparency: 100 } });
    slide.addShape('roundRect', { x: ix + iw * 0.16, y: iy + ih * 0.52, w: iw * 0.65, h: ih * 0.25, rectRadius: 0.1, fill: { color: 'FFFFFF', transparency: 8 }, line: { color: 'FFFFFF', transparency: 65, width: 1 } });
  }
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
  pptx.author = 'Все проекты #Ian';
  pptx.subject = plan.title;
  pptx.title = plan.title;
  pptx.company = 'Все проекты #Ian';
  pptx.lang = 'ru-RU';
  const theme = plan.theme || COLORS.blue;
  pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'ru-RU' };

  plan.slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    const type = i === 0 ? 'cover' : normalizeSlideType(s.type, i);
    const title = s.title || plan.title;
    if (type === 'cover') {
      slide.background = { color: theme.accent };
      slide.addShape('ellipse', { x: 9.8, y: -1.05, w: 4.2, h: 4.2, fill: { color: 'FFFFFF', transparency: 84 }, line: { color: 'FFFFFF', transparency: 100 } });
      slide.addShape('ellipse', { x: 10.7, y: 0.1, w: 2.4, h: 2.4, fill: { color: theme.accent2, transparency: 28 }, line: { color: theme.accent2, transparency: 100 } });
      addText(slide, 'ТЕМА ИССЛЕДОВАНИЯ', 0.78, 0.72, 5.7, 0.32, { fontSize: 11, bold: true, color: 'FFFFFF', charSpacing: 2.2 });
      addText(slide, title, 0.78, 1.45, 5.8, 2.3, { fontSize: 34, bold: true, color: 'FFFFFF', valign: 'mid' });
      addText(slide, s.subtitle || s.body || plan.summary, 0.82, 4.08, 5.65, 1.12, { fontSize: 17, color: 'EFF3FF', valign: 'top' });
      slide.addShape('line', { x: 0.82, y: 5.55, w: 4.5, h: 0, line: { color: 'FFFFFF', transparency: 45, width: 1.2 } });
      addText(slide, 'Все проекты #Ian', 0.82, 5.75, 3.8, 0.32, { fontSize: 11, color: 'FFFFFF' });
      addImageOrPlaceholder(slide, s, 7.05, 1.12, 5.55, 5.0, theme);
      addText(slide, '01', 11.85, 6.9, 0.55, 0.22, { fontSize: 10, color: 'FFFFFF', align: 'right' });
      return;
    }

    slide.background = { color: i % 4 === 2 ? 'FFFFFF' : theme.bg };
    slide.addShape('rect', { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: theme.accent }, line: { color: theme.accent } });
    slide.addShape('ellipse', { x: 11.55, y: -0.8, w: 2.45, h: 2.45, fill: { color: theme.accent2, transparency: 76 }, line: { color: theme.accent2, transparency: 100 } });
    addText(slide, title, 0.72, 0.43, 8.45, 0.78, { fontSize: 27, bold: true, color: theme.ink, valign: 'mid' });
    slide.addShape('line', { x: 0.72, y: 1.29, w: 11.88, h: 0, line: { color: theme.accent2, transparency: 18, width: 1.1 } });

    if (type === 'cards') {
      const cards = (s.cards || []).slice(0, 4);
      const columns = cards.length <= 2 ? Math.max(1, cards.length) : 2;
      const cardW = 8.45 / columns - 0.14;
      const cardH = cards.length <= 2 ? 3.7 : 2.15;
      cards.forEach((card, index) => {
        const col = index % columns, row = Math.floor(index / columns);
        const x = 0.72 + col * (8.45 / columns);
        const y = cards.length <= 2 ? 2.0 : 1.55 + row * 2.37;
        slide.addShape('roundRect', { x, y, w: cardW, h: cardH, rectRadius: 0.14, fill: { color: 'FFFFFF', transparency: 7 }, line: { color: theme.accent2, transparency: 37, width: 1 } });
        if (card.value) addText(slide, card.value, x + 0.22, y + 0.2, cardW - 0.45, 0.4, { fontSize: 19, bold: true, color: theme.accent });
        addText(slide, card.title, x + 0.22, y + (card.value ? 0.68 : 0.25), cardW - 0.45, 0.48, { fontSize: 16, bold: true, color: theme.ink });
        addText(slide, card.text, x + 0.22, y + (card.value ? 1.18 : 0.83), cardW - 0.45, cardH - (card.value ? 1.35 : 0.98), { fontSize: 12.5, color: theme.muted, valign: 'top' });
      });
      addImageOrPlaceholder(slide, s, 9.58, 1.62, 2.95, 4.72, theme);
    } else if (type === 'comparison') {
      const panelY = 1.55, panelH = 4.85, panelW = 4.1;
      [s.leftTitle, s.rightTitle].forEach((label, side) => {
        const x = 0.72 + side * 4.35;
        slide.addShape('roundRect', { x, y: panelY, w: panelW, h: panelH, rectRadius: 0.14, fill: { color: 'FFFFFF', transparency: 5 }, line: { color: theme.accent2, transparency: 35, width: 1 } });
        slide.addShape('roundRect', { x: x + 0.18, y: panelY + 0.18, w: panelW - 0.36, h: 0.67, rectRadius: 0.1, fill: { color: side === 0 ? theme.accent : theme.accent2 }, line: { color: side === 0 ? theme.accent : theme.accent2, transparency: 100 } });
        addText(slide, label, x + 0.32, panelY + 0.28, panelW - 0.64, 0.42, { fontSize: 16, bold: true, color: side === 0 ? 'FFFFFF' : theme.ink });
        addBullets(slide, side ? s.rightItems : s.leftItems, x + 0.3, panelY + 1.08, panelW - 0.6, theme, 4);
      });
      addImageOrPlaceholder(slide, s, 9.62, 1.58, 2.95, 4.78, theme);
    } else if (type === 'stat') {
      const main = s.statistic || s.statisticLabel || s.body || title;
      addText(slide, main, 0.82, 1.78, 6.0, 2.0, { fontSize: 43, bold: true, color: theme.accent, valign: 'mid' });
      addText(slide, s.statisticLabel || s.body || s.subtitle, 0.88, 4.0, 5.9, 1.4, { fontSize: 19, color: theme.ink, valign: 'top' });
      addImageOrPlaceholder(slide, s, 7.35, 1.55, 5.05, 4.85, theme);
    } else if (type === 'process') {
      const steps = (s.steps?.length ? s.steps : s.bullets || []).slice(0, 5);
      const cardW = 4.07;
      steps.forEach((step, index) => {
        const col = index % 2, row = Math.floor(index / 2);
        const x = 0.72 + col * 4.25, y = 1.52 + row * 1.58;
        slide.addShape('roundRect', { x, y, w: cardW, h: 1.36, rectRadius: 0.13, fill: { color: 'FFFFFF', transparency: 5 }, line: { color: theme.accent2, transparency: 35, width: 1 } });
        slide.addShape('ellipse', { x: x + 0.18, y: y + 0.25, w: 0.55, h: 0.55, fill: { color: theme.accent }, line: { color: theme.accent, transparency: 100 } });
        addText(slide, String(index + 1), x + 0.18, y + 0.35, 0.55, 0.28, { fontSize: 14, bold: true, color: 'FFFFFF', align: 'center' });
        addText(slide, step, x + 0.88, y + 0.18, cardW - 1.05, 0.98, { fontSize: 14, color: theme.ink, valign: 'mid' });
      });
      addImageOrPlaceholder(slide, s, 9.58, 1.52, 2.95, 4.78, theme);
      if (s.body) addText(slide, s.body, 0.78, 6.35, 8.1, 0.35, { fontSize: 12, color: theme.muted });
    } else if (type === 'quote') {
      addText(slide, 'КЛЮЧЕВАЯ МЫСЛЬ', 0.84, 1.7, 6.7, 0.38, { fontSize: 10, bold: true, color: theme.accent, charSpacing: 2 });
      addText(slide, `“${s.quote || s.body || title}”`, 0.84, 2.25, 6.95, 2.95, { fontSize: 29, bold: true, color: theme.ink, valign: 'mid' });
      if (s.subtitle) addText(slide, s.subtitle, 0.9, 5.5, 6.8, 0.62, { fontSize: 14, color: theme.muted, valign: 'top' });
      addImageOrPlaceholder(slide, s, 8.15, 1.55, 4.42, 4.9, theme);
    } else if (type === 'table') {
      const rows = (s.table || []).slice(0, 6), columns = Math.max(1, ...rows.map(row => row.length));
      const tableX = 0.72, tableY = 1.58, tableW = 8.45, colW = tableW / columns, rowH = 0.74;
      rows.forEach((row, rowIndex) => row.slice(0, 4).forEach((cell, colIndex) => {
        const x = tableX + colIndex * colW, y = tableY + rowIndex * rowH;
        slide.addShape('rect', { x, y, w: colW, h: rowH, fill: { color: rowIndex === 0 ? theme.accent : (colIndex === 0 ? theme.accent2 : 'FFFFFF'), transparency: rowIndex === 0 ? 0 : 5 }, line: { color: theme.accent2, transparency: 12, width: 0.7 } });
        addText(slide, cell, x + 0.08, y + 0.07, colW - 0.16, rowH - 0.14, { fontSize: rowIndex === 0 ? 12.5 : 11.5, bold: rowIndex === 0 || colIndex === 0, color: rowIndex === 0 ? 'FFFFFF' : theme.ink, valign: 'mid' });
      }));
      addImageOrPlaceholder(slide, s, 9.58, 1.58, 2.95, 4.7, theme);
    } else if (type === 'image') {
      addImageOrPlaceholder(slide, s, 0.75, 1.55, 5.75, 4.85, theme);
      addText(slide, s.body || s.subtitle, 6.85, 1.68, 5.3, 1.52, { fontSize: 19, color: theme.ink, valign: 'top' });
      addBullets(slide, s.bullets, 6.9, 3.45, 5.1, theme, 4);
    } else {
      addText(slide, s.body || s.subtitle, 0.85, 1.62, 7.5, 1.55, { fontSize: 19, color: theme.ink, valign: 'top' });
      addBullets(slide, s.bullets, 0.9, 3.45, 7.35, theme, 4);
      addImageOrPlaceholder(slide, s, 8.82, 1.55, 3.7, 4.85, theme);
    }
    slide.addShape('line', { x: 0.72, y: 6.78, w: 11.88, h: 0, line: { color: theme.accent2, transparency: 35, width: 0.8 } });
    addText(slide, 'ВСЕ ПРОЕКТЫ #IAN', 0.75, 6.92, 3.6, 0.22, { fontSize: 8, bold: true, color: theme.muted, charSpacing: 1 });
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
    ...(plan.projectContent ? [new Paragraph({ text: 'Проблема', heading: HeadingLevel.HEADING_1 }), new Paragraph(plan.projectContent.problem), new Paragraph({ text: 'Цель', heading: HeadingLevel.HEADING_1 }), new Paragraph(plan.projectContent.goal), new Paragraph({ text: 'Задачи', heading: HeadingLevel.HEADING_1 }), ...plan.projectContent.tasks.map(x => new Paragraph({ text: x, bullet: { level: 0 } })), new Paragraph({ text: 'Теоретическая часть', heading: HeadingLevel.HEADING_1 }), ...plan.projectContent.theory.flatMap(x => [new Paragraph({ text: x.heading, heading: HeadingLevel.HEADING_2 }), new Paragraph(x.text)]), new Paragraph({ text: 'Практическая часть', heading: HeadingLevel.HEADING_1 }), new Paragraph(plan.projectContent.practice.method), ...plan.projectContent.practice.steps.map(x => new Paragraph({ text: x, bullet: { level: 0 } })), new Paragraph(plan.projectContent.practice.result), new Paragraph({ text: 'Заключение', heading: HeadingLevel.HEADING_1 }), new Paragraph(plan.projectContent.conclusion)] : []),
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
      const isQuote = slide.type === 'quote';
      const slideBg = (i % 4 === 2 && !isCover && !isQuote) ? theme.accent2 : theme.bg;
      doc.rect(0, 0, 960, 540).fill(isCover ? color(theme.accent) : color(slideBg));
      if (!isCover) {
        doc.rect(0, 0, 12, 540).fill(color(theme.accent));
        // Soft layered glass-like shapes in the background, kept behind slide content.
        if (!isQuote) {
          doc.circle(910, 28, 118).fill(color('FFFFFF')).opacity(0.32);
          doc.circle(930, 62, 42).fill(color(theme.accent2)).opacity(0.7);
          doc.moveTo(48, 92).lineTo(912, 92).lineWidth(1).strokeColor(color(theme.accent2)).strokeOpacity(0.85).stroke();
        }
      }

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
        // Topic-oriented editorial illustration fallback when a real photo could not be fetched.
        doc.save();
        doc.roundedRect(625, 135, 280, 255, 26).fill(color('FFFFFF'));
        doc.circle(770, 245, 82).fill(color(theme.accent2));
        doc.circle(810, 210, 37).fill(color(theme.accent));
        doc.roundedRect(665, 310, 190, 18, 9).fill(color(theme.bg));
        doc.roundedRect(665, 341, 145, 12, 6).fill(color(theme.accent2));
        doc.roundedRect(665, 365, 165, 10, 5).fill(color(theme.accent));
        doc.restore();
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
    { name: 'Итоговый_продукт.pdf', mime: 'application/pdf', create: createProductPdfBuffer },
    { name: 'Итоговый_продукт.png', mime: 'image/png', create: async p => p.product.imageBytes },
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
    projectContent: plan.projectContent || null,
    product: plan.product ? { format: plan.product.format, title: plan.product.title, subtitle: plan.product.subtitle, audience: plan.product.audience, sections: plan.product.sections, steps: plan.product.steps, checklist: plan.product.checklist, takeaway: plan.product.takeaway } : null,
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
  if (!topic) { const error = new Error('Укажи тему проекта или презентации.'); error.status = 400; throw error; }
  const count = clampInt(body.slidesCount ?? body.slides ?? body.presentationSlides, 1, MAX_SLIDES, 12);
  const theme = inferTheme(topic, body.style || '');
  const projectContent = await generateProjectContent(topic, body);
  const payload = {
    topic, requestedSlides: count, projectContent,
    style: body.style || 'современный, профессиональный, соответствующий теме',
    student: {
      firstName: cleanText(body.firstName, 60),
      lastName: cleanText(body.lastName, 60),
      className: cleanText(body.className, 30),
      school: cleanText(body.school, 100)
    },
    extraRequirements: cleanText(body.extraRequirements || body.requirements, 1200),
    requiredStructure: ['обложка и введение', 'исследовательский вопрос или проблема', 'факты и объяснения', 'практическая часть или применение', 'содержательное раскрытие темы на последнем слайде'],
    outputRules: 'Верни ровно requestedSlides слайдов, каждый с конкретным содержанием и собственным imageQuery. Не добавляй фиктивную статистику, результаты, шаблоны или вымышленные ссылки.'
  };
  const raw = await generateValidatedPresentation(topic, count, payload, PLANNER_INSTRUCTIONS + '\nОБЯЗАТЕЛЬНО опирайся на projectContent из входных данных. Не выдумывай результаты практики.');
  const plan = normalizePlan(raw, topic, count, theme);
  plan.projectContent = projectContent;
  plan.product = await generateFinalProduct(topic, projectContent, body.productType);
  plan.product.imageBytes = await renderProductImage(plan.product, theme);
  plan.defense = (plan.defense || '') + '\n\nПрактический результат проекта — ' + plan.product.format + ' «' + plan.product.title + '». Покажите готовый материал и объясните, как им пользоваться.';
  await attachImages(plan);
  plan.slides.push({ type: 'image', title: 'Практический результат: ' + plan.product.title, subtitle: plan.product.format, body: 'Итоговый продукт проекта — готовый материал на основе исследования.', bullets: [plan.product.takeaway, ...plan.product.checklist.slice(0, 2)].filter(Boolean), imageBytes: plan.product.imageBytes, imageMime: 'image/png', imageCredit: 'Итоговый продукт проекта', isProductSlide: true });
  const built = await withTimeout(buildFiles(plan), 55000, 'Сборка файлов');
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

const generationJobs = new Map();
function pruneGenerationJobs(){const cutoff=Date.now()-30*60*1000;for(const [id,job] of generationJobs)if(job.updatedAt<cutoff&&job.status!=="running")generationJobs.delete(id);}
app.post('/api/generate-project/start', asyncRoute(async (req,res)=>{
  pruneGenerationJobs();const id=crypto.randomUUID();const job={id,status:'running',createdAt:Date.now(),updatedAt:Date.now(),result:null,error:null};generationJobs.set(id,job);
  Promise.resolve().then(()=>generateProject(req.body||{})).then(result=>{job.status='completed';job.result=result;job.updatedAt=Date.now();}).catch(error=>{job.status='failed';job.error=cleanText(error?.message||'Не удалось создать проект.',1000);job.updatedAt=Date.now();console.error('[background-generation]',id,error?.stack||error);});
  res.status(202).json({jobId:id,status:'running'});
}));
app.get('/api/generation-jobs/:id',(req,res)=>{const job=generationJobs.get(req.params.id);if(!job)return res.status(404).json({error:'Задача не найдена. Возможно, сервер перезапускался.'});job.updatedAt=Date.now();res.json({jobId:job.id,status:job.status,result:job.status==='completed'?job.result:undefined,error:job.error});});

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
  const allOldSlides = project.presentation || project.slides;
  const oldSlides = allOldSlides.filter(slide => !slide?.isProductSlide);
  const count = clampInt(oldSlides.length, 1, MAX_SLIDES, 8);
  const editTopic = cleanText(project.title, 180) || 'Презентация';
  const editPayload = {
    topic: editTopic, requestedSlides: count, currentProject: project, instruction,
    outputRules: `Верни ровно ${count} качественных слайдов. Не теряй полезные факты и практическую часть. Не добавляй общие шаблоны.`
  };
  const editInstructions = PLANNER_INSTRUCTIONS + '\nРедактируй переданный проект с учётом инструкции. Сохрани тему и точное число слайдов. Сохрани качественный материал, но исправляй повторы, пустые поля и неясные объяснения.';
  const raw = await generateValidatedPresentation(editTopic, count, editPayload, editInstructions);
  const plan = normalizePlan(raw, editTopic, count, inferTheme(project.title || '', ''));
  plan.projectContent = project.projectContent || null;
  plan.product = await generateFinalProduct(editTopic, plan.projectContent || { conclusion: plan.summary }, project.product?.format || 'памятка');
  plan.product.imageBytes = await renderProductImage(plan.product, plan.theme);
  plan.defense = (plan.defense || '') + '\n\nПрактический результат проекта — ' + plan.product.format + ' «' + plan.product.title + '».';
  const prior = new Set();
  oldSlides.forEach((slide, index) => {
    if (plan.slides[index] && slide.imageUrl && !prior.has(slide.imageUrl)) {
      plan.slides[index].imageUrl = slide.imageUrl;
      prior.add(slide.imageUrl);
    }
  });
  await attachImages(plan);
  plan.slides.push({ type: 'image', title: 'Практический результат: ' + plan.product.title, subtitle: plan.product.format, body: 'Итоговый продукт проекта.', bullets: [plan.product.takeaway, ...plan.product.checklist.slice(0, 2)].filter(Boolean), imageBytes: plan.product.imageBytes, imageMime: 'image/png', imageCredit: 'Итоговый продукт проекта', isProductSlide: true });
  const built = await withTimeout(buildFiles(plan), 55000, 'Сборка файлов');
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
