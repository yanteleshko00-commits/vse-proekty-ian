import pptxgen from 'pptxgenjs';
import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
// Только интернет-фото; отдельная мультимодальная модель проверяет соответствие и визуальное качество.
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
const IMAGE_SEARCH_TIMEOUT_MS = 15000;

const THEMES = [
  { name: 'botanical', primary: '#18865B', dark: '#12372B', soft: '#E8F5EE', card: '#F3FAF6', line: '#C9E5D5', muted: '#64756B', accent: '#D5A23D', cover: 'circle' },
  { name: 'ocean', primary: '#1677A8', dark: '#122D43', soft: '#E5F3FA', card: '#F3F9FC', line: '#C5E1EF', muted: '#627785', accent: '#E2A64A', cover: 'wave' },
  { name: 'editorial', primary: '#8B3D32', dark: '#332522', soft: '#F7EAE6', card: '#FCF6F3', line: '#EBD0C8', muted: '#79645E', accent: '#C69A54', cover: 'block' },
  { name: 'violet', primary: '#7056A8', dark: '#2E2543', soft: '#F0EBFA', card: '#F8F5FD', line: '#DCD1F1', muted: '#706783', accent: '#C88F5B', cover: 'circle' },
  { name: 'midnight', primary: '#2E526F', dark: '#182A3A', soft: '#E8EFF5', card: '#F4F7FA', line: '#CBD8E4', muted: '#637383', accent: '#D5A64A', cover: 'block' },
  { name: 'citrus', primary: '#6A842C', dark: '#2D351E', soft: '#F0F5E3', card: '#F8FAF1', line: '#DCE7BF', muted: '#70795A', accent: '#D78D38', cover: 'wave' }
];

let activeTheme = THEMES[0];
let activeLayout = 'split';

const publicDir = path.join(process.cwd(), 'public');
const fontPath = path.join(process.cwd(), 'assets', 'DejaVuSans.ttf');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function safeJson(text) {
  if (!text) throw new Error('ИИ не вернул ответ.');

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error('ИИ вернул некорректный JSON.');
  }
}

function clean(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeSlides(slides, count) {
  const source = Array.isArray(slides) ? slides : [];

  const result = source.slice(0, count).map((s, i) => ({
    number: i + 1,
    title: clean(s?.title, `Слайд ${i + 1}`),
    subtitle: clean(s?.subtitle),
    bullets: Array.isArray(s?.bullets)
      ? s.bullets.map(x => clean(x)).filter(Boolean).slice(0, 6)
      : [],
    layout: clean(s?.layout, 'split'),
    background: clean(s?.background, 'light'),
    accent: clean(s?.accent),
    headline: clean(s?.headline),
    emphasis: clean(s?.emphasis),
    visualType: clean(s?.visualType, 'none'),
    visualTitle: clean(s?.visualTitle),
    visualData: s?.visualData ?? null,
    imagePrompt: clean(s?.imagePrompt),
    imagePath: null,
    note: clean(s?.note)
  }));

  while (result.length < count) {
    const n = result.length + 1;

    result.push({
      number: n,
      title: `Слайд ${n}`,
      subtitle: '',
      bullets: ['Материал по теме проекта.'],
      layout: 'split',
      background: 'light',
      accent: '',
      headline: '',
      emphasis: '',
      visualType: 'none',
      visualTitle: '',
      visualData: null,
      imagePrompt: '',
      imagePath: null,
      note: ''
    });
  }

  return result;
}

function drawRoundedCard(doc, x, y, w, h) {
  doc.roundedRect(x, y, w, h, 18).fill(activeTheme.card);
  doc.roundedRect(x, y, w, h, 18)
    .lineWidth(1)
    .stroke(activeTheme.line);
}

function drawBulletList(doc, bullets, x, y, w, maxLines = 6) {
  let yy = y;

  for (const bullet of (bullets || []).slice(0, maxLines)) {
    doc.circle(x + 7, yy + 8, 4).fill(activeTheme.primary);

    doc.fontSize(18)
      .fillColor(activeTheme.dark)
      .text(bullet, x + 23, yy, {
        width: w - 23,
        lineGap: 4
      });

    yy += Math.max(
      38,
      doc.heightOfString(bullet, {
        width: w - 23,
        lineGap: 4
      }) + 13
    );
  }
}

function drawBarChart(doc, data, x, y, w, h) {
  if (!Array.isArray(data) || !data.length) return false;

  const rows = data
    .map(d => ({
      label: clean(d?.label),
      value: Number(d?.value)
    }))
    .filter(d =>
      d.label &&
      Number.isFinite(d.value) &&
      d.value >= 0
    )
    .slice(0, 6);

  if (!rows.length) return false;

  const max = Math.max(...rows.map(r => r.value), 1);
  const rowH = Math.min(48, (h - 20) / rows.length);

  rows.forEach((r, i) => {
    const yy = y + i * rowH;
    const trackW = Math.max(30, w - 170);
    const barW = Math.max(2, (r.value / max) * trackW);

    doc.fontSize(12)
      .fillColor(activeTheme.dark)
      .text(r.label, x, yy + 5, {
        width: 140,
        height: rowH - 3,
        ellipsis: true
      });

    doc.roundedRect(x + 145, yy + 4, trackW, 25, 7)
      .fill(activeTheme.soft);

    doc.roundedRect(x + 145, yy + 4, barW, 25, 7)
      .fill(activeTheme.primary);

    doc.fontSize(11)
      .fillColor(activeTheme.primary)
      .text(
        String(r.value),
        Math.min(x + 150 + barW, x + w - 35),
        yy + 7,
        { width: 35 }
      );
  });

  return true;
}

function drawTable(doc, data, x, y, w, h) {
  if (!Array.isArray(data) || !data.length) return false;

  const rows = data.filter(Array.isArray).slice(0, 7);
  if (!rows.length) return false;

  const cols = Math.min(
    4,
    Math.max(...rows.map(r => r.length), 1)
  );

  const cw = w / cols;
  const rh = Math.min(52, h / rows.length);

  rows.forEach((row, ri) => {
    for (let ci = 0; ci < cols; ci++) {
      const xx = x + ci * cw;
      const yy = y + ri * rh;

      doc.rect(xx, yy, cw, rh)
        .fill(ri === 0 ? activeTheme.primary : activeTheme.card)
        .lineWidth(0.8)
        .stroke(activeTheme.line);

      doc.fontSize(ri === 0 ? 11 : 10)
        .fillColor(ri === 0 ? '#FFFFFF' : activeTheme.dark)
        .text(clean(row[ci]), xx + 6, yy + 6, {
          width: cw - 12,
          height: rh - 10,
          ellipsis: true
        });
    }
  });

  return true;
}

function drawProcess(doc, data, x, y, w, h) {
  if (!Array.isArray(data) || !data.length) return false;

  const items = data.map(clean).filter(Boolean).slice(0, 5);
  if (!items.length) return false;

  const gap = 10;
  const bw = (w - gap * (items.length - 1)) / items.length;

  items.forEach((item, i) => {
    const xx = x + i * (bw + gap);

    drawRoundedCard(doc, xx, y, bw, h);

    doc.circle(xx + bw / 2, y + 28, 16).fill(activeTheme.primary);

    doc.fontSize(13)
      .fillColor('#FFFFFF')
      .text(String(i + 1), xx + bw / 2 - 5, y + 21, {
        width: 10,
        align: 'center'
      });

    doc.fontSize(11)
      .fillColor(activeTheme.dark)
      .text(item, xx + 8, y + 55, {
        width: bw - 16,
        align: 'center',
        lineGap: 3,
        height: h - 62,
        ellipsis: true
      });

    if (i < items.length - 1) {
      doc.moveTo(xx + bw + 2, y + h / 2)
        .lineTo(xx + bw + gap - 2, y + h / 2)
        .lineWidth(2)
        .stroke(activeTheme.primary);
    }
  });

  return true;
}
function drawVisual(doc, slide, x, y, w, h) {
  drawRoundedCard(doc, x, y, w, h);

  if (slide.visualTitle) {
    doc.fontSize(15)
      .fillColor(activeTheme.primary)
      .text(slide.visualTitle, x + 18, y + 16, {
        width: w - 36,
        height: 30,
        ellipsis: true
      });
  }

  const type = slide.visualType;
  const data = slide.visualData;
  const vy = slide.visualTitle ? y + 52 : y + 18;
  const vh = slide.visualTitle ? h - 68 : h - 36;

  if (type === 'image' && slide.imagePath && fs.existsSync(slide.imagePath)) {
    try {
      doc.image(slide.imagePath, x + 14, vy, {
        fit: [w - 28, vh],
        align: 'center',
        valign: 'center'
      });
      return;
    } catch {}
  }

  if (type === 'bar' && drawBarChart(doc, data, x + 18, y + 55, w - 36, h - 75)) return;
  if (type === 'table' && drawTable(doc, data, x + 18, y + 50, w - 36, h - 68)) return;
  if (type === 'process' && drawProcess(doc, data, x + 18, y + 65, w - 36, h - 90)) return;

  if (type === 'quote') {
    doc.fontSize(22)
      .fillColor(activeTheme.dark)
      .text(`“${clean(data)}”`, x + 28, y + 80, {
        width: w - 56,
        height: h - 100,
        align: 'center',
        valign: 'center',
        lineGap: 6,
        ellipsis: true
      });
    return;
  }

  if (type === 'formula') {
    doc.fontSize(27)
      .fillColor(activeTheme.primary)
      .text(clean(data), x + 20, y + h / 2 - 20, {
        width: w - 40,
        align: 'center',
        height: 70,
        ellipsis: true
      });
    return;
  }

  doc.circle(x + w / 2, y + h / 2 - 8, 44).fill(activeTheme.primary);
  doc.fontSize(32)
    .fillColor('#FFFFFF')
    .text('✓', x + w / 2 - 16, y + h / 2 - 29, {
      width: 32,
      align: 'center'
    });

  doc.fontSize(14)
    .fillColor(activeTheme.muted)
    .text('Ключевая идея проекта', x + 20, y + h / 2 + 50, {
      width: w - 40,
      align: 'center'
    });
}

async function searchWikimediaPhotos(query, limit = 10) {
  try {
    const api = new URL('https://commons.wikimedia.org/w/api.php');
    api.searchParams.set('action', 'query');
    api.searchParams.set('generator', 'search');
    api.searchParams.set('gsrsearch', `${query} filetype:bitmap`);
    api.searchParams.set('gsrnamespace', '6');
    api.searchParams.set('gsrlimit', String(limit));
    api.searchParams.set('prop', 'imageinfo');
    api.searchParams.set('iiprop', 'url|extmetadata');
    api.searchParams.set('iiurlwidth', '1800');
    api.searchParams.set('format', 'json');
    const response = await fetch(api, {
      headers: { 'User-Agent': 'VseProektyIan/1.1 (educational presentation generator)' },
      signal: AbortSignal.timeout(IMAGE_SEARCH_TIMEOUT_MS)
    });
    if (!response.ok) return [];
    const json = await response.json();
    return Object.values(json?.query?.pages || {}).map(page => {
      const info = page?.imageinfo?.[0];
      const url = info?.thumburl || info?.url || '';
      const title = clean(page?.title).replace(/^File:/i, '').replace(/_/g, ' ');
      if (!info || !url || !/\.(jpe?g|png|webp)(\?|$)/i.test(url)) return null;
      // Avoid obvious low-quality results: logos, icons, screenshots and Wikimedia UI captures.
      if (/\b(logo|icon|favicon|screenshot|screen.?shot|wikimedia.?commons|wikipedia.?page|website.?capture|map.?of)\b/i.test(title)) return null;
      const meta = info.extmetadata || {};
      return {
        title,
        url,
        originalUrl: info.url || url,
        artist: clean(meta.Artist?.value).replace(/<[^>]*>/g, '').slice(0, 100),
        license: clean(meta.LicenseShortName?.value).replace(/<[^>]*>/g, '').slice(0, 60)
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function heuristicPhotoScore(candidate, topic, slideTitle, query) {
  const title = candidate.title.toLowerCase();
  const wanted = `${topic} ${slideTitle} ${query}`.toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 3);
  let score = 0;
  for (const word of wanted) if (title.includes(word)) score += 3;
  if (/\b(photo|photograph|portrait|landscape|laboratory|classroom|computer|laptop|forest|building|experiment)\b/i.test(title)) score += 2;
  if (/\b(drawing|diagram|chart|illustration|vector|render|model)\b/i.test(title)) score -= 2;
  if (/\b(blurry|low.?quality|thumbnail|cropped|duplicate)\b/i.test(title)) score -= 5;
  return score;
}

async function chooseBestPhoto(candidates, topic, slideTitle, query) {
  if (!candidates.length) return null;
  // Ask the vision model to judge relevance and visual quality; it selects an existing
  // web photo only and never generates or edits an image.
  if (client && candidates.length > 0) {
    try {
      const sample = candidates.slice(0, 6);
      const content = [{
        type: 'text',
        text: `Выбери ЛУЧШУЮ реальную фотографию для школьного слайда. Тема проекта: "${topic}". Заголовок слайда: "${slideTitle}". Поисковый запрос: "${query}". Оцени каждое фото по шкале 0–10: соответствие конкретному слайду, эстетика/композиция, резкость, пригодность для крупного показа. Отклоняй скриншоты сайтов/Википедии, интерфейсы ноутбуков, случайные предметы, логотипы, водяные знаки, коллажи с текстом и низкокачественные кадры. Выбирай только если оценка не ниже 7/10 и фото действительно иллюстрирует слайд. Если ни одно не подходит, верни suitable false, чтобы сервер выполнил новый поиск. JSON: {"index":0,"suitable":true,"score":8,"reason":"коротко"}. Индексы начинаются с 0.`
      }];
      for (let i = 0; i < sample.length; i++) {
        content.push({ type: 'text', text: `Вариант ${i}. Имя файла: ${sample[i].title}` });
        content.push({ type: 'image_url', image_url: { url: sample[i].url, detail: 'high' } });
      }
      const response = await client.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: 'Ты строгий арт-директор учебных презентаций и эксперт по визуальному качеству фотографий. Оценивай реальные изображения, которые приложены к сообщению. Не придумывай изображения. Отвечай только JSON.' },
          { role: 'user', content }
        ],
        max_tokens: 120
      });
      const judgement = safeJson(response.choices?.[0]?.message?.content || '');
      const idx = Number(judgement.index);
      if (judgement.suitable !== false && Number.isInteger(idx) && idx >= 0 && idx < sample.length) {
        return sample[idx];
      }
      // Model judged the entire batch unsuitable: caller should try another query.
      return null;
    } catch (error) {
      console.warn('Проверка качества фото через vision не сработала, использую текстовый отбор:', error?.message || error);
    }
  }
  return [...candidates].sort((a, b) =>
    heuristicPhotoScore(b, topic, slideTitle, query) - heuristicPhotoScore(a, topic, slideTitle, query)
  )[0] || null;
}

async function downloadWikimediaPhoto(query, outputPath, topic, slideTitle) {
  const candidates = await searchWikimediaPhotos(query, 10);
  const chosen = await chooseBestPhoto(candidates, topic, slideTitle, query);
  if (!chosen) return null;
  try {
    const imageResponse = await fetch(chosen.url, {
      headers: { 'User-Agent': 'VseProektyIan/1.1' },
      signal: AbortSignal.timeout(IMAGE_SEARCH_TIMEOUT_MS)
    });
    if (!imageResponse.ok) return null;
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (bytes.length < 12000) return null;
    const pathname = new URL(chosen.url).pathname.toLowerCase();
    const ext = pathname.endsWith('.png') ? '.png' : pathname.endsWith('.webp') ? '.webp' : '.jpg';
    const finalPath = outputPath.replace(/\.jpg$/i, ext);
    fs.writeFileSync(finalPath, bytes);
    return {
      path: finalPath,
      credit: [chosen.artist, chosen.license, 'Wikimedia Commons'].filter(Boolean).join(' · '),
      sourceTitle: chosen.title
    };
  } catch {
    return null;
  }
}

async function generateSlideImages(slides, topic, dir) {
  // Обязательное фото на каждом слайде. По каждому слайду делаем несколько разных поисков,
  // а vision-модель проверяет содержание и визуальное качество найденных кандидатов.
  let downloaded = 0;
  for (let index = 0; index < slides.length; index++) {
    const slide = slides[index];
    const filePath = path.join(dir, `slide-image-${index + 1}.jpg`);
    const title = clean(slide.title, `слайд ${index + 1}`);
    const queries = index === 0
      ? [`${topic} ${title} high quality photo`, `${topic} real photograph`, `${topic} photography`]
      : [`${title} photograph`, `${topic} ${title} real photo`, `${title} real life photo`, `${topic} photography`];
    const seenQueries = new Set();
    for (const query of queries) {
      const q = query.trim();
      if (!q || seenQueries.has(q)) continue;
      seenQueries.add(q);
      const photo = await downloadWikimediaPhoto(q, filePath, topic, title);
      if (photo) {
        slide.imagePath = photo.path;
        slide.imageCredit = photo.credit;
        slide.imageSourceTitle = photo.sourceTitle;
        downloaded++;
        break;
      }
    }
    if (!slide.imagePath) {
      console.warn(`Не найдено идеальное фото для слайда ${index + 1}: ${title}`);
    }
  }

  // Гарантируем наличие картинки в итоговом файле: если для отдельного слайда поиск не нашёл
  // подходящего кадра, используем фото по той же теме как последний резерв, вместо пустого блока.
  const found = slides.filter(s => s.imagePath && fs.existsSync(s.imagePath));
  if (found.length) {
    for (const slide of slides) {
      if (!slide.imagePath || !fs.existsSync(slide.imagePath)) {
        const fallback = found.find(s => s !== slide) || found[0];
        slide.imagePath = fallback.imagePath;
        slide.imageCredit = fallback.imageCredit;
        slide.imageSourceTitle = fallback.imageSourceTitle;
        slide.imageFallback = true;
      }
    }
  }
  console.log(`Подобрано уникальных интернет-фото: ${downloaded} из ${slides.length} слайдов.`);
}

function renderPresentationPdf(slides, topic, outputPath, design = {}) {
  const requestedTheme = clean(design.palette).toLowerCase();

  activeTheme = THEMES.find(t => t.name === requestedTheme) ||
    THEMES[Math.floor(Math.random() * THEMES.length)];

  const allowedLayouts = [
    'split',
    'editorial',
    'visual-first',
    'cards',
    'minimal',
    'statement'
  ];

  activeLayout = allowedLayouts.includes(design.layout)
    ? design.layout
    : allowedLayouts[Math.floor(Math.random() * allowedLayouts.length)];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [960, 540],
      margins: { top: 0, left: 0, right: 0, bottom: 0 },
      autoFirstPage: false,
      info: {
        Title: `Презентация — ${topic}`,
        Author: 'Все проекты #Ian'
      }
    });

    const out = fs.createWriteStream(outputPath);
    doc.pipe(out);

    if (fs.existsSync(fontPath)) {
      doc.registerFont('ProjectFont', fontPath);
    } else {
      doc.registerFont('ProjectFont', 'Helvetica');
    }

    slides.forEach((slide, index) => {
      doc.addPage();

      const W = 960;
      const H = 540;

      const slideBackground = slide.background === 'dark'
        ? '#172033'
        : slide.background === 'soft'
          ? activeTheme.soft
          : '#FFFFFF';

      const slideAccent = /^#[0-9A-Fa-f]{6}$/.test(slide.accent || '')
        ? slide.accent
        : activeTheme.primary;

      doc.rect(0, 0, W, H).fill(slideBackground);
      doc.rect(0, 0, W, 12).fill(slideAccent);

      if (index === 0) {
        if (slide.imagePath && fs.existsSync(slide.imagePath)) {
          try { doc.image(slide.imagePath, 0, 0, { cover: [W, H] }); } catch {}
        } else {
          doc.rect(0, 0, W, H).fill(activeTheme.dark);
        }
        doc.save();
        doc.fillOpacity(0.52).rect(0, 0, W, H).fill('#07131D');
        doc.fillOpacity(0.18).rect(0, 0, 650, H).fill('#000000');
        doc.restore();
        doc.rect(60, 72, 72, 5).fill(activeTheme.accent);
        doc.font('ProjectFont')
          .fontSize(39)
          .fillColor('#FFFFFF')
          .text(slide.title, 60, 125, {
            width: 760,
            height: 150,
            lineGap: 7,
            ellipsis: true
          });
        if (slide.subtitle) {
          doc.fontSize(19)
            .fillColor('#F1F5F9')
            .text(slide.subtitle, 62, 300, {
              width: 720,
              height: 85,
              lineGap: 5,
              ellipsis: true
            });
        }
      } else {
        doc.font('ProjectFont')
          .fontSize(28)
          .fillColor(slide.background === 'dark' ? '#FFFFFF' : activeTheme.dark)
          .text(slide.title, 50, 42, {
            width: 860,
            height: 42,
            lineGap: 4,
            ellipsis: true
          });

        doc.fontSize(11)
          .fillColor(activeTheme.muted)
          .text(`${topic}  •  ${slide.number}`, 50, 90, {
            width: 860
          });

        const hasVisual = slide.visualType && slide.visualType !== 'none';
        if (slide.imageCredit) {
          doc.fontSize(7).fillColor(activeTheme.muted).text(`Изображение: ${slide.imageCredit}`, 50, 518, { width: 860, height: 12, ellipsis: true });
        }

        const layouts = [
          'split',
          'editorial',
          'visual-first',
          'cards',
          'minimal',
          'statement'
        ];

        const layout = layouts.includes(slide.layout)
          ? slide.layout
          : activeLayout;

        if (layout === 'statement') {
          doc.roundedRect(55, 125, 850, 315, 22).fill(activeTheme.soft);
          doc.rect(55, 125, 9, 315).fill(slideAccent);

          doc.font('ProjectFont')
            .fontSize(32)
            .fillColor(activeTheme.dark)
            .text(slide.headline || slide.title, 90, 165, {
              width: 760,
              height: 170,
              lineGap: 7,
              ellipsis: true
            });

          if (slide.emphasis) {
            doc.fontSize(19)
              .fillColor(slideAccent)
              .text(slide.emphasis, 90, 355, {
                width: 760,
                height: 55,
                ellipsis: true
              });
          }
        } else if (hasVisual && layout === 'editorial') {
          drawVisual(doc, slide, 55, 130, 385, 325);
          doc.rect(465, 130, 3, 325).fill(slideAccent);
          drawBulletList(doc, slide.bullets, 495, 140, 400, 5);
        } else if (hasVisual && layout === 'visual-first') {
          drawVisual(doc, slide, 55, 120, 500, 345);
          drawBulletList(doc, slide.bullets, 585, 140, 315, 5);
        } else if (layout === 'minimal') {
          doc.rect(55, 135, 8, 290).fill(slideAccent);
          drawBulletList(doc, slide.bullets, 90, 150, 790, 6);
        } else if (layout === 'editorial') {
          doc.rect(55, 130, 260, 330).fill(activeTheme.soft);
          doc.font('ProjectFont')
            .fontSize(21)
            .fillColor(activeTheme.primary)
            .text(slide.subtitle || 'Ключевые тезисы', 75, 155, {
              width: 220,
              height: 90,
              lineGap: 5,
              ellipsis: true
            });

          drawBulletList(doc, slide.bullets, 350, 140, 540, 6);
        } else if (hasVisual) {
          drawBulletList(doc, slide.bullets, 55, 130, 430, 5);
          drawVisual(doc, slide, 520, 125, 385, 335);
        } else {
          drawRoundedCard(doc, 55, 125, 850, 335);
          drawBulletList(doc, slide.bullets, 80, 155, 800, 6);
        }

        if (slide.subtitle) {
          doc.fontSize(12)
            .fillColor(activeTheme.primary)
            .text(slide.subtitle, 55, 478, {
              width: 850,
              height: 22,
              ellipsis: true
            });
        }
      }

    });

    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
}
async function renderPresentationPptx(slides, topic, outputPath, design = {}) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Все проекты #Ian';
  pptx.subject = topic;
  pptx.title = `Презентация — ${topic}`;
  pptx.company = 'Все проекты #Ian';
  pptx.lang = 'ru-RU';

  const theme = THEMES.find(t => t.name === clean(design.palette).toLowerCase()) || THEMES[0];
  pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'ru-RU' };

  const hex = value => String(value || '').replace('#', '');
  const safeColor = value => /^#[0-9A-Fa-f]{6}$/.test(value || '') ? hex(value) : hex(theme.primary);

  const addPanel = (s, x, y, w, h, fill = theme.card) =>
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h,
      rectRadius: 0.12,
      line: { color: hex(theme.line), width: 1 },
      fill: { color: hex(fill) }
    });

  const addVisual = (s, data, box, textColor, accent) => {
    const { x, y, w, h } = box;
    addPanel(s, x, y, w, h, theme.card);

    let top = y + 0.16;

    if (data.visualTitle) {
      s.addText(data.visualTitle, {
        x: x + 0.18, y: top, w: w - 0.36, h: 0.35,
        fontSize: 14, bold: true,
        color: hex(theme.primary), fit: 'shrink', margin: 0.02
      });
      top += 0.42;
    }

    const type = data.visualType;
    const raw = data.visualData;

    if (type === 'image' && data.imagePath && fs.existsSync(data.imagePath)) {
      try {
        s.addImage({
          path: data.imagePath,
          x: x + 0.12, y: top,
          w: w - 0.24,
          h: Math.max(0.5, h - (top - y) - 0.14),
          sizingContain: true
        });
        return true;
      } catch {}
    }

    if (type === 'bar' && Array.isArray(raw)) {
      const rows = raw.map(r => ({
        label: clean(r?.label),
        value: Number(r?.value)
      })).filter(r => r.label && Number.isFinite(r.value) && r.value >= 0).slice(0, 6);

      if (rows.length) {
        const max = Math.max(...rows.map(r => r.value), 1);
        const rowH = Math.min(0.56, (h - (top - y) - 0.18) / rows.length);

        rows.forEach((r, i) => {
          const yy = top + i * rowH;
          const labelW = Math.min(1.35, w * 0.35);
          const bx = x + 0.18 + labelW;
          const bw = w - labelW - 0.58;
          const barW = Math.max(0.03, bw * r.value / max);

          s.addText(r.label, {
            x: x + 0.18, y: yy + 0.03,
            w: labelW - 0.08, h: rowH - 0.04,
            fontSize: 10, color: textColor,
            fit: 'shrink', margin: 0.01, valign: 'mid'
          });

          s.addShape(pptx.ShapeType.roundRect, {
            x: bx, y: yy + 0.08, w: bw, h: 0.2,
            rectRadius: 0.05,
            line: { color: hex(theme.soft), transparency: 100 },
            fill: { color: hex(theme.soft) }
          });

          s.addShape(pptx.ShapeType.roundRect, {
            x: bx, y: yy + 0.08, w: barW, h: 0.2,
            rectRadius: 0.05,
            line: { color: hex(accent), transparency: 100 },
            fill: { color: hex(accent) }
          });

          s.addText(String(r.value), {
            x: x + w - 0.45, y: yy + 0.02, w: 0.35, h: 0.3,
            fontSize: 9, color: hex(accent), fit: 'shrink', margin: 0
          });
        });

        return true;
      }
    }

    if (type === 'table' && Array.isArray(raw) && raw.length) {
      const rows = raw.filter(Array.isArray).slice(0, 7);
      const cols = Math.min(4, Math.max(...rows.map(r => r.length), 1));
      const cw = (w - 0.24) / cols;
      const rh = Math.min(0.48, (h - (top - y) - 0.12) / rows.length);

      rows.forEach((row, ri) => {
        for (let ci = 0; ci < cols; ci++) {
          const xx = x + 0.12 + ci * cw;
          const yy = top + ri * rh;

          s.addShape(pptx.ShapeType.rect, {
            x: xx, y: yy, w: cw, h: rh,
            line: { color: hex(theme.line), width: 0.5 },
            fill: { color: ri === 0 ? hex(theme.primary) : hex(theme.card) }
          });

          s.addText(clean(row[ci]), {
            x: xx + 0.04, y: yy + 0.02,
            w: cw - 0.08, h: rh - 0.04,
            fontSize: ri === 0 ? 9 : 8,
            color: ri === 0 ? 'FFFFFF' : hex(textColor),
            fit: 'shrink', margin: 0.01, valign: 'mid'
          });
        }
      });

      return true;
    }

    if (type === 'process' && Array.isArray(raw) && raw.length) {
      const items = raw.map(clean).filter(Boolean).slice(0, 5);
      const gap = 0.08;
      const bw = (w - 0.24 - gap * (items.length - 1)) / items.length;

      items.forEach((item, i) => {
        const xx = x + 0.12 + i * (bw + gap);

        s.addShape(pptx.ShapeType.roundRect, {
          x: xx, y: top, w: bw, h: h - (top - y) - 0.12,
          rectRadius: 0.08,
          line: { color: hex(theme.line), width: 0.8 },
          fill: { color: hex(theme.soft) }
        });

        s.addText(String(i + 1), {
          x: xx + bw / 2 - 0.15, y: top + 0.12,
          w: 0.3, h: 0.3,
          fontSize: 14, bold: true,
          color: hex(theme.primary), align: 'center', margin: 0
        });

        s.addText(item, {
          x: xx + 0.05, y: top + 0.52,
          w: bw - 0.1, h: h - (top - y) - 0.72,
          fontSize: 10, color: hex(textColor),
          align: 'center', valign: 'mid',
          fit: 'shrink', margin: 0.02
        });
      });

      return true;
    }

    if (type === 'quote' || type === 'formula') {
      s.addText(type === 'quote' ? `“${clean(raw)}”` : clean(raw), {
        x: x + 0.2, y: y + h * 0.3,
        w: w - 0.4, h: h * 0.4,
        fontSize: type === 'formula' ? 24 : 18,
        bold: type === 'formula',
        color: hex(accent),
        align: 'center', valign: 'mid',
        fit: 'shrink', margin: 0.04
      });
      return true;
    }

    s.addText('Ключевая идея проекта', {
      x: x + 0.15, y: y + h / 2 - 0.2,
      w: w - 0.3, h: 0.4,
      fontSize: 14, color: hex(theme.primary),
      align: 'center', valign: 'mid', margin: 0
    });

    return true;
  };

  slides.forEach((d, i) => {
    const s = pptx.addSlide();
    const bg = d.background === 'dark' ? theme.dark : d.background === 'soft' ? theme.soft : 'FFFFFF';
    const accent = safeColor(d.accent || theme.primary);
    const textColor = d.background === 'dark' ? 'FFFFFF' : theme.dark;

    s.background = { color: bg };
    s.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 13.333, h: 0.12,
      line: { color: accent, transparency: 100 },
      fill: { color: accent }
    });

    const title = clean(d.title, `Слайд ${i + 1}`);

    if (i === 0) {
      if (d.imagePath && fs.existsSync(d.imagePath)) {
        try { s.addImage({ path: d.imagePath, x: 0, y: 0, w: 13.333, h: 7.5 }); } catch {}
      } else {
        s.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: 13.333, h: 7.5,
          line: { color: hex(theme.dark), transparency: 100 },
          fill: { color: hex(theme.dark) }
        });
      }
      s.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: 13.333, h: 7.5,
        line: { color: '07131D', transparency: 100 },
        fill: { color: '07131D', transparency: 43 }
      });
      s.addShape(pptx.ShapeType.rect, {
        x: 0.8, y: 1.0, w: 0.75, h: 0.055,
        line: { color: hex(theme.accent), transparency: 100 },
        fill: { color: hex(theme.accent) }
      });
      s.addText(title, {
        x: 0.8, y: 1.55, w: 10.9, h: 1.8,
        fontSize: 32, bold: true,
        color: 'FFFFFF', breakLine: false,
        fit: 'shrink', margin: 0.05, valign: 'mid'
      });
      if (d.subtitle) {
        s.addText(d.subtitle, {
          x: 0.85, y: 3.55, w: 9.5, h: 0.9,
          fontSize: 18, color: 'F1F5F9',
          fit: 'shrink', margin: 0.05
        });
      }
    } else {
      s.addText(title, {
        x: 0.55, y: 0.38, w: 12.1, h: 0.55,
        fontSize: 24, bold: true,
        color: hex(textColor), fit: 'shrink', margin: 0.02
      });

      s.addText(`${topic}  •  ${d.number || i + 1}`, {
        x: 0.58, y: 0.98, w: 12, h: 0.25,
        fontSize: 9, color: hex(theme.muted), margin: 0
      });

      const hasVisual = d.visualType && d.visualType !== 'none';
      const layout = d.layout || design.layout || 'split';
      if (d.imageCredit) {
        s.addText(`Изображение: ${d.imageCredit}`, { x: 0.6, y: 7.12, w: 12.1, h: 0.16, fontSize: 6, color: hex(theme.muted), margin: 0, fit: 'shrink' });
      }

      if (layout === 'statement') {
        addPanel(s, 0.75, 1.55, 11.8, 4.4, theme.soft);

        s.addText(d.headline || title, {
          x: 1.2, y: 2.0, w: 10.8, h: 2.1,
          fontSize: 26, bold: true,
          color: hex(theme.dark), fit: 'shrink',
          valign: 'mid', margin: 0.06
        });

        if (d.emphasis) {
          s.addText(d.emphasis, {
            x: 1.2, y: 4.35, w: 10.8, h: 0.7,
            fontSize: 17, bold: true,
            color: accent, fit: 'shrink', margin: 0.04
          });
        }
      } else {
        const bullets = (d.bullets || []).slice(0, 6);
        const bulletText = bullets.map(v => ({
          text: clean(v),
          options: { bullet: { indent: 14 }, hanging: 3, breakLine: true }
        }));

        const visualLeft = layout === 'visual-first';
        const leftX = visualLeft ? 0.65 : 0.7;
        const leftW = hasVisual ? (visualLeft ? 5.5 : 5.2) : 11.9;

        if (bulletText.length) {
          s.addText(bulletText, {
            x: leftX, y: 1.55, w: leftW, h: 4.7,
            fontSize: 17, color: hex(textColor),
            breakLine: false, paraSpaceAfterPt: 12,
            valign: 'mid', fit: 'shrink', margin: 0.1
          });
        }

        if (hasVisual) {
          const vx = visualLeft ? 6.35 : 6.2;
          addVisual(s, d, {
            x: vx, y: 1.55, w: 6.4, h: 4.65
          }, textColor, accent);
        } else if (!bulletText.length) {
          addPanel(s, 0.7, 1.55, 11.9, 4.6);
          s.addText(d.subtitle || 'Основная информация по теме проекта', {
            x: 1.0, y: 2.2, w: 11.3, h: 2.8,
            fontSize: 21, color: hex(textColor),
            align: 'center', valign: 'mid',
            fit: 'shrink', margin: 0.1
          });
        }
      }
    }

  });

  await pptx.writeFile({ fileName: outputPath });
}

async function renderTextPdf(title, sections, outputPath) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 55, bottom: 55, left: 60, right: 55 } });
  const out = fs.createWriteStream(outputPath);
  doc.pipe(out);

  if (fs.existsSync(fontPath)) doc.registerFont('ProjectFont', fontPath);
  else doc.registerFont('ProjectFont', 'Helvetica');

  doc.font('ProjectFont').fontSize(20).fillColor('#12372B').text(title, { align: 'center' });
  doc.moveDown();

  for (const section of sections || []) {
    doc.fontSize(15).fillColor('#18865B').text(clean(section.title));
    doc.moveDown(0.4);
    doc.fontSize(12).fillColor('#222222').text(clean(section.text), {
      align: 'justify',
      lineGap: 4
    });
    doc.moveDown();
  }

  doc.end();

  await new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function makeDocx(project, outputPath) {
  const children = [];

  children.push(new Paragraph({
    text: clean(project.title, 'Учебный проект'),
    heading: HeadingLevel.TITLE
  }));

  for (const section of project.sections || []) {
    children.push(new Paragraph({
      text: clean(section.title),
      heading: HeadingLevel.HEADING_1
    }));

    for (const paragraph of clean(section.text).split(/\n+/).filter(Boolean)) {
      children.push(new Paragraph({
        children: [new TextRun(paragraph)],
        spacing: { after: 160 },
        indent: { firstLine: 720 }
      }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
}

async function generateWithAI({
  firstName,
  lastName,
  className,
  school,
  topic,
  slidesCount,
  extraRequirements
}) {
  if (!client) {
    throw new Error('Не задан OPENAI_API_KEY в настройках Render.');
  }

  const prompt = `
Создай качественный школьный индивидуальный проект на русском языке.
Тема: ${topic}
Ученик: ${firstName} ${lastName}
Класс: ${className || 'не указан'}
Школа: ${school || 'не указана'}
Количество слайдов: ровно ${slidesCount}
Дополнительные требования: ${extraRequirements || 'нет'}

Верни только корректный JSON со структурой:
{
  "title": "Название проекта",
  "sections": [
    {"title": "Введение", "text": "Текст"},
    {"title": "Цель и задачи", "text": "Текст"},
    {"title": "Теоретическая часть", "text": "Текст"},
    {"title": "Практическая часть", "text": "Текст"},
    {"title": "Заключение", "text": "Текст"},
    {"title": "Источники", "text": "Реальные источники"}
  ],
  "product": {
    "title": "Название продукта",
    "text": "Описание буклета, памятки, гайда или другого полезного продукта"
  },
  "design": {
    "palette": "ocean",
    "layout": "editorial"
  },
  "slides": [
    {
      "title": "Заголовок",
      "subtitle": "Подзаголовок",
      "bullets": ["Тезис 1", "Тезис 2"],
      "layout": "split",
      "background": "light",
      "accent": "",
      "headline": "",
      "emphasis": "",
      "visualType": "none",
      "visualTitle": "",
      "visualData": null,
      "imagePrompt": "",
      "note": ""
    }
  ]
}

Правила:
- Пиши понятно для школьника, содержательно и без повторов.
- Соблюдай структуру проекта: актуальность, цель, задачи, гипотеза при необходимости, теория, практика, выводы, источники.
- Для практической части опиши конкретные действия, результат и продукт.
- Не выдумывай статистику, эксперименты и источники. Если данные условные, прямо укажи это.
- Количество слайдов должно быть ровно ${slidesCount}.
- Слайды должны раскрывать тему по порядку и не повторять одни и те же тезисы.
- Создай современную премиальную презентацию: обложка с фотореалистичным широким изображением, крупным контрастным заголовком и без логотипа.
- Чередуй композиции слайдов: split, editorial, visual-first, cards, minimal, statement. Не повторяй один макет подряд.
- На обложке обязательно задай visualType=image и подробный imagePrompt для полноэкранного фонового изображения без текста и логотипов.
- Чередуй типы визуального оформления: image, bar, table, process, quote, formula и none; не добавляй график без реальных данных.
- Для bar используй массив объектов [{"label":"Категория","value":10}].
- Для table используй двумерный массив [["Показатель","Значение"],["Пример","Описание"]].
- Для process используй массив строк с этапами.
- Для quote используй короткую цитату или ключевую мысль.
- Для formula используй строку с формулой.
- Для image дай подробный imagePrompt на русском или английском, без надписей внутри изображения. Для каждого слайда сформулируй запрос для поиска РЕАЛЬНОЙ фотографии в интернете, которая конкретно иллюстрирует его содержание; не проси создавать картинки ИИ.
- Используй фотографии на большинстве слайдов (ориентир 9–11 из 12), если они помогают теме. Не повторяй одну фотографию на нескольких слайдах, кроме крайнего случая для обложки.
- Выбирай палитру по теме проекта: ocean, editorial, violet, midnight, citrus или botanical. Не используй зелёный по умолчанию.
- Визуально разнообразь слайды: крупные фотографии, сравнения, схемы, карточки и инфографика; оставляй достаточно свободного пространства и не перегружай текстом.
- Не ставь visualType=bar без осмысленных данных. Не создавай ложные цифры.
- Верни только JSON, без Markdown и пояснений.
`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'Ты опытный методист и дизайнер учебных презентаций. Возвращай только валидный JSON.'
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  });

  const data = safeJson(response.choices?.[0]?.message?.content || '');

  const count = Math.max(3, Math.min(25, Number(slidesCount) || 10));

  data.slides = normalizeSlides(data.slides, count);
  data.sections = Array.isArray(data.sections) ? data.sections : [];
  data.product = data.product || {
    title: 'Практический продукт',
    text: 'Практический материал по теме проекта.'
  };
  data.design = data.design || { palette: 'ocean', layout: 'editorial' };
  if (!data.design.palette || data.design.palette === 'botanical') data.design.palette = 'ocean';

  return data;
}

app.post('/api/chat', async (req, res) => {
  try {
    if (!client) throw new Error('Не задан OPENAI_API_KEY в настройках Render.');

    const message = clean(req.body?.message);
    if (!message) return res.status(400).json({ error: 'Напиши сообщение.' });

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Ты помощник сайта «Все проекты #Ian». Отвечай по-русски, кратко и понятно.' },
        { role: 'user', content: message }
      ]
    });

    res.json({ reply: response.choices?.[0]?.message?.content || '' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Ошибка ИИ.' });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    if (!client) throw new Error('Не задан OPENAI_API_KEY в настройках Render.');

    const prompt = clean(req.body?.prompt);
    if (!prompt) return res.status(400).json({ error: 'Укажи описание изображения.' });

    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: '1024x1024',
      quality: 'low'
    });

    const image = result?.data?.[0]?.b64_json;
    if (!image) throw new Error('ИИ не вернул изображение.');

    res.json({ image: `data:image/png;base64,${image}` });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Не удалось создать изображение.' });
  }
});

async function buildProjectFiles(project, topic, dir) {
  const slides = normalizeSlides(project.slides, project.slides?.length || 10);
  if (slides[0]) {
    slides[0].visualType = 'image';
    slides[0].layout = 'visual-first';
    slides[0].imagePrompt = `${topic} ${slides[0].title} real high-quality landscape photograph, visually striking, suitable as a presentation cover; no screenshots, no logos, no text overlays`;
  }
  // Фото обязательно на каждом слайде. Для остальных слайдов используем компоновки,
  // которые реально отображают фото рядом с тезисами; не оставляем statement/minimal без фото.
  slides.forEach((slide, index) => {
    slide.visualType = 'image';
    slide.visualTitle = '';
    if (index > 0 && ['statement', 'minimal', ''].includes(String(slide.layout || '').toLowerCase())) slide.layout = 'split';
  });

  await generateSlideImages(slides, topic, dir);

  const pdfPath = path.join(dir, 'presentation.pdf');
  const pptxPath = path.join(dir, 'presentation.pptx');
  const textPdfPath = path.join(dir, 'project.pdf');
  const docxPath = path.join(dir, 'project.docx');

  await renderPresentationPdf(slides, topic, pdfPath, project.design);
  await renderPresentationPptx(slides, topic, pptxPath, project.design);
  await renderTextPdf(project.title, project.sections, textPdfPath);
  await makeDocx(project, docxPath);

  const zipPath = path.join(dir, 'project-files.zip');
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.file(pdfPath, { name: 'presentation.pdf' });
    archive.file(pptxPath, { name: 'presentation.pptx' });
    archive.file(textPdfPath, { name: 'project.pdf' });
    archive.file(docxPath, { name: 'project.docx' });

    archive.finalize();
  });

  return {
    slides,
    files: {
      'Презентация_проекта.pptx': { base64: fs.readFileSync(pptxPath).toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      'Презентация_проекта.pdf': { base64: fs.readFileSync(pdfPath).toString('base64'), mime: 'application/pdf' },
      'Индивидуальный_проект.docx': { base64: fs.readFileSync(docxPath).toString('base64'), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      'Проект_текст.pdf': { base64: fs.readFileSync(textPdfPath).toString('base64'), mime: 'application/pdf' },
      'Весь_проект.zip': { base64: fs.readFileSync(zipPath).toString('base64'), mime: 'application/zip' }
    }
  };
}

app.post('/api/edit-project', async (req, res) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ian-edit-'));

  try {
    const { project, instruction } = req.body || {};
    if (!project || typeof project !== 'object') {
      return res.status(400).json({ error: 'Не найден проект для редактирования.' });
    }

    if (!client) throw new Error('Не задан OPENAI_API_KEY в настройках Render.');

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'Отредактируй школьный проект по просьбе пользователя. Сохрани структуру и верни только JSON.'
        },
        {
          role: 'user',
          content: `Проект:\n${JSON.stringify(project)}\n\nИзменение:\n${clean(instruction)}\n\nВерни полный JSON проекта с title, sections, product, design и slides.`
        }
      ],
      response_format: { type: 'json_object' }
    });

    const edited = safeJson(response.choices?.[0]?.message?.content || '');
    const topic = clean(edited.title, clean(project.title, 'Учебный проект'));
    const built = await buildProjectFiles(edited, topic, dir);

    res.json({ project: { ...edited, slides: built.slides }, files: built.files });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Не удалось отредактировать проект.' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(client),
    model: MODEL,
    fontConfigured: fs.existsSync(fontPath)
  });
});

app.post('/api/generate-project', async (req, res) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ian-project-'));

  try {
    const {
      firstName = '',
      lastName = '',
      className = '',
      school = '',
      topic = '',
      slidesCount = 10,
      extraRequirements = ''
    } = req.body || {};

    if (!clean(topic)) {
      return res.status(400).json({ error: 'Укажи тему проекта.' });
    }

    const count = Math.max(3, Math.min(25, Number(slidesCount) || 10));

    const project = await generateWithAI({
      firstName, lastName, className, school,
      topic: clean(topic),
      slidesCount: count,
      extraRequirements
    });

    const built = await buildProjectFiles(project, clean(topic), dir);

    res.json({
      project: { ...project, slides: built.slides },
      files: built.files
    });
  } catch (error) {
    console.error('Ошибка создания проекта:', error);
    res.status(500).json({
      error: error?.message || 'Не удалось создать проект.'
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'), error => {
    if (error && !res.headersSent) {
      res.status(404).send('Страница не найдена.');
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Все проекты #Ian: http://0.0.0.0:${PORT}`);
});
