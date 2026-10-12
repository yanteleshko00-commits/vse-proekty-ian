import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const MAX_AI_IMAGES = 6;

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
const downloadableFiles = new Map();

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
  const items = (bullets || []).slice(0, maxLines);

  for (const bullet of items) {
    doc.circle(x + 7, yy + 8, 4).fill(activeTheme.primary);
    doc.fontSize(18).fillColor(activeTheme.dark);
    doc.text(bullet, x + 23, yy, {
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
    .filter(d => d.label && Number.isFinite(d.value));

  if (!rows.length) return false;

  const max = Math.max(...rows.map(r => r.value), 1);
  const rowH = Math.min(48, (h - 20) / rows.length);

  rows.forEach((r, i) => {
    const yy = y + i * rowH;
    const barW = Math.max(4, (r.value / max) * (w - 170));

    doc.fontSize(13).fillColor(activeTheme.dark);
    doc.text(r.label, x, yy + 5, { width: 145 });

    doc.roundedRect(x + 150, yy + 4, w - 170, 25, 7)
      .fill(activeTheme.soft);

    doc.roundedRect(x + 150, yy + 4, barW, 25, 7)
      .fill(activeTheme.primary);

    doc.fontSize(12).fillColor(activeTheme.primary);
    doc.text(String(r.value), x + 155 + barW, yy + 7, {
      width: 40
    });
  });

  return true;
}

function drawTable(doc, data, x, y, w, h) {
  if (!Array.isArray(data) || !data.length) return false;

  const rows = data.filter(r => Array.isArray(r)).slice(0, 7);
  if (!rows.length) return false;

  const cols = Math.max(...rows.map(r => r.length));
  const cw = w / cols;
  const rh = Math.min(52, h / rows.length);

  rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const xx = x + ci * cw;
      const yy = y + ri * rh;

      doc.rect(xx, yy, cw, rh)
        .fill(ri === 0 ? activeTheme.primary : activeTheme.card)
        .lineWidth(0.8)
        .stroke(activeTheme.line);

      doc.fontSize(12)
        .fillColor(ri === 0 ? '#FFFFFF' : activeTheme.dark)
        .text(clean(cell), xx + 7, yy + 8, {
          width: cw - 14,
          height: rh - 12
        });
    });
  });

  return true;
}

function drawProcess(doc, data, x, y, w, h) {
  if (!Array.isArray(data) || !data.length) return false;

  const items = data.map(clean).filter(Boolean).slice(0, 5);
  if (!items.length) return false;

  const gap = 12;
  const bw = (w - gap * (items.length - 1)) / items.length;

  items.forEach((item, i) => {
    const xx = x + i * (bw + gap);

    drawRoundedCard(doc, xx, y, bw, h);

    doc.circle(xx + bw / 2, y + 30, 18).fill(activeTheme.primary);
    doc.fontSize(14).fillColor('#FFFFFF')
      .text(String(i + 1), xx + bw / 2 - 5, y + 22, {
        width: 10,
        align: 'center'
      });

    doc.fontSize(13).fillColor(activeTheme.dark)
      .text(item, xx + 10, y + 62, {
        width: bw - 20,
        align: 'center',
        lineGap: 3
      });

    if (i < items.length - 1) {
      doc.moveTo(xx + bw + 3, y + h / 2)
        .lineTo(xx + bw + gap - 3, y + h / 2)
        .lineWidth(2)
        .stroke(activeTheme.line);
    }
  });

  return true;
}

function drawVisual(doc, slide, x, y, w, h) {
  drawRoundedCard(doc, x, y, w, h);

  if (slide.visualTitle) {
    doc.fontSize(15).fillColor(activeTheme.primary)
      .text(slide.visualTitle, x + 18, y + 16, {
        width: w - 36
      });
  }

  const type = slide.visualType;
  const data = slide.visualData;
  const imageY = slide.visualTitle ? y + 52 : y + 18;
  const imageH = slide.visualTitle ? h - 68 : h - 36;

  if (type === 'image' && slide.imagePath && fs.existsSync(slide.imagePath)) {
    try {
      doc.image(slide.imagePath, x + 14, imageY, {
        fit: [w - 28, imageH],
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
    doc.fontSize(23).fillColor(activeTheme.dark)
      .text(`“${clean(data)}”`, x + 28, y + 80, {
        width: w - 56,
        align: 'center',
        lineGap: 6
      });
    return;
  }

  if (type === 'formula') {
    doc.fontSize(28).fillColor(activeTheme.primary)
      .text(clean(data), x + 20, y + h / 2 - 20, {
        width: w - 40,
        align: 'center'
      });
    return;
  }

  doc.circle(x + w / 2, y + h / 2 - 8, 44).fill(activeTheme.primary);
  doc.fontSize(34).fillColor('#FFFFFF')
    .text('✓', x + w / 2 - 16, y + h / 2 - 29, {
      width: 32,
      align: 'center'
    });

  doc.fontSize(14).fillColor(activeTheme.muted)
    .text('Ключевая идея проекта', x + 20, y + h / 2 + 50, {
      width: w - 40,
      align: 'center'
    });
}async function searchCommonsImages(query, limit = 6) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query.slice(0, 200),
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '1200'
  });

  const response = await fetch(
    `https://commons.wikimedia.org/w/api.php?${params}`,
    {
      headers: {
        'User-Agent': 'VseProektyIan/1.0 (school project website)'
      },
      signal: AbortSignal.timeout(12000)
    }
  );

  if (!response.ok) {
    throw new Error('Сервис поиска изображений временно недоступен.');
  }

  const data = await response.json();
  const pages = Object.values(data.query?.pages || {});

  return pages.map(page => {
    const info = page.imageinfo?.[0];
    if (!info) return null;

    const url = info.thumburl || info.url;

    if (!url || !url.startsWith('https://')) return null;
    if (!String(info.mime || '').startsWith('image/')) return null;

    return {
      title: String(page.title || 'Изображение').replace(/^File:/, ''),
      url
    };
  }).filter(Boolean);
}

async function generateSlideImages(slides, topic, dir) {
  const candidates = slides
    .filter(slide => slide.visualType === 'image')
    .slice(0, MAX_AI_IMAGES);

  let downloaded = 0;

  for (const slide of candidates) {
    const query = [
      slide.imagePrompt,
      slide.title,
      topic
    ].filter(Boolean).join(' ');

    try {
      const images = await searchCommonsImages(query, 8);

      for (const image of images) {
        try {
          const response = await fetch(image.url, {
            signal: AbortSignal.timeout(15000)
          });

          if (!response.ok) continue;

          const mime = response.headers.get('content-type') || '';
          if (!mime.startsWith('image/')) continue;

          const buffer = Buffer.from(await response.arrayBuffer());

          if (buffer.length < 1000 || buffer.length > 12 * 1024 * 1024) {
            continue;
          }

          const extension = mime.includes('png')
            ? 'png'
            : mime.includes('webp')
              ? 'webp'
              : 'jpg';

          const filePath = path.join(
            dir,
            `slide-image-${downloaded + 1}.${extension}`
          );

          fs.writeFileSync(filePath, buffer);
          slide.imagePath = filePath;
          downloaded++;
          break;
        } catch {}
      }
    } catch (error) {
      console.warn(
        'Ошибка поиска изображений:',
        error?.message || error
      );
    }
  }

  console.log(`Найдено изображений для презентации: ${downloaded}`);
}

function renderPresentationPdf(slides, topic, outputPath, design = {}) {
  const requestedTheme = clean(design.palette).toLowerCase();

  activeTheme = THEMES.find(theme => theme.name === requestedTheme)
    || THEMES[Math.floor(Math.random() * THEMES.length)];

  const allowedLayouts = [
    'split',
    'editorial',
    'visual-first',
    'cards',
    'minimal'
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
    }

    slides.forEach((slide, index) => {
      doc.addPage();

      const W = 960;
      const H = 540;

      doc.rect(0, 0, W, H).fill('#FFFFFF');
      doc.rect(0, 0, W, 12).fill(activeTheme.primary);

      if (index === 0) {
        if (activeTheme.cover === 'wave') {
          doc.save();
          doc.moveTo(700, 0)
            .lineTo(960, 0)
            .lineTo(960, 540)
            .lineTo(790, 540)
            .bezierCurveTo(850, 390, 650, 240, 700, 0)
            .fill(activeTheme.soft);
          doc.restore();

          doc.circle(820, 115, 62).fill(activeTheme.primary);
          doc.circle(820, 115, 35).fill(activeTheme.accent);
        } else if (activeTheme.cover === 'block') {
          doc.rect(730, 0, 230, 540).fill(activeTheme.soft);
          doc.rect(770, 70, 145, 400).fill(activeTheme.line);
          doc.rect(805, 105, 145, 330).fill(activeTheme.primary);
          doc.circle(835, 145, 16).fill(activeTheme.accent);
        } else {
          doc.circle(820, 100, 115).fill(activeTheme.soft);
          doc.circle(820, 100, 72).fill(activeTheme.line);
          doc.circle(820, 100, 35).fill(activeTheme.primary);
        }

        doc.font('ProjectFont').fontSize(38).fillColor(activeTheme.dark)
          .text(slide.title, 60, 120, {
            width: 650,
            lineGap: 7
          });

        if (slide.subtitle) {
          doc.fontSize(20).fillColor(activeTheme.muted)
            .text(slide.subtitle, 60, 250, {
              width: 620,
              lineGap: 5
            });
        }

        doc.fontSize(13).fillColor(activeTheme.primary)
          .text('Индивидуальный проект', 60, 430, {
            width: 300
          });
      } else {
        doc.font('ProjectFont').fontSize(28).fillColor(activeTheme.dark)
          .text(slide.title, 50, 42, {
            width: 860,
            lineGap: 4
          });

        doc.fontSize(11).fillColor(activeTheme.muted)
          .text(`${topic}  •  ${slide.number}`, 50, 90, {
            width: 860
          });

        const hasVisual = slide.visualType && slide.visualType !== 'none';

        const layoutForSlide = activeLayout === 'cards' && index % 2 === 0
          ? 'split'
          : activeLayout === 'minimal' && !hasVisual
            ? 'minimal'
            : activeLayout;

        if (hasVisual && layoutForSlide === 'visual-first') {
          drawVisual(doc, slide, 55, 120, 500, 345);
          drawBulletList(doc, slide.bullets, 585, 140, 315, 5);
        } else if (hasVisual && layoutForSlide === 'editorial') {
          drawVisual(doc, slide, 55, 130, 385, 325);
          doc.rect(465, 130, 3, 325).fill(activeTheme.accent);
          drawBulletList(doc, slide.bullets, 495, 140, 400, 5);
        } else if (hasVisual) {
          drawBulletList(doc, slide.bullets, 55, 130, 430, 5);
          drawVisual(doc, slide, 520, 125, 385, 335);
        } else if (layoutForSlide === 'minimal') {
          doc.rect(55, 135, 8, 290).fill(activeTheme.primary);
          drawBulletList(doc, slide.bullets, 90, 150, 790, 6);
        } else if (layoutForSlide === 'editorial') {
          doc.rect(55, 130, 260, 330).fill(activeTheme.soft);

          doc.font('ProjectFont').fontSize(21).fillColor(activeTheme.primary)
            .text(slide.subtitle || 'Ключевые тезисы', 75, 155, {
              width: 220,
              lineGap: 5
            });

          drawBulletList(doc, slide.bullets, 350, 140, 540, 6);
        } else {
          drawRoundedCard(doc, 55, 125, 850, 335);
          drawBulletList(doc, slide.bullets, 80, 155, 800, 6);
        }

        if (slide.subtitle) {
          doc.fontSize(12).fillColor(activeTheme.primary)
            .text(slide.subtitle, 55, 478, {
              width: 850,
              align: 'left'
            });
        }
      }

      if (index === 0) {
        doc.fontSize(10).fillColor(activeTheme.muted)
          .text('Все проекты #Ian', 50, 515, {
            width: 200
          });
      }
    });

    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function renderTextPdf(title, sections, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      autoFirstPage: true
    });

    const out = fs.createWriteStream(outputPath);
    doc.pipe(out);

    if (fs.existsSync(fontPath)) {
      doc.registerFont('ProjectFont', fontPath);
    }

    doc.font('ProjectFont').fontSize(22)
      .fillColor(activeTheme.primary)
      .text(title);

    doc.moveDown(0.7);

    for (const section of sections) {
      doc.fontSize(15).fillColor(activeTheme.dark)
        .text(clean(section.title));

      doc.moveDown(0.25);

      doc.fontSize(11).fillColor('#303B35')
        .text(clean(section.text), {
          lineGap: 5,
          paragraphGap: 8
        });

      doc.moveDown(0.7);
    }

    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function makeDocx(project, outputPath) {
  const children = [
    new Paragraph({
      text: project.writtenProject?.title || 'Индивидуальный проект',
      heading: HeadingLevel.TITLE
    })
  ];

  const sections = Array.isArray(project.writtenProject?.sections)
    ? project.writtenProject.sections
    : [];

  for (const section of sections) {
    children.push(new Paragraph({
      text: clean(section.title),
      heading: HeadingLevel.HEADING_1
    }));

    const paragraphs = Array.isArray(section.paragraphs)
      ? section.paragraphs
      : [section.text || ''];

    for (const paragraph of paragraphs) {
      children.push(new Paragraph({
        children: [new TextRun(clean(paragraph))]
      }));
    }
  }

  children.push(new Paragraph({
    text: 'Проектный продукт',
    heading: HeadingLevel.HEADING_1
  }));

  children.push(new Paragraph(
    clean(project.product?.description || 'Практический продукт по теме проекта.')
  ));

  const doc = new Document({
    sections: [{ children }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
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
    throw new Error('OPENAI_API_KEY не настроен на сервере.');
  }

  const prompt = `
Ты создаёшь полноценный школьный индивидуальный проект на русском языке.

Данные:
Ученик: ${firstName || 'не указан'} ${lastName || ''}
Класс: ${className || 'не указан'}
Школа: ${school || 'не указана'}
Тема: ${topic}
Количество слайдов: ${slidesCount}
Дополнительные требования: ${extraRequirements || 'нет'}

Верни ТОЛЬКО JSON.

presentation — это готовое содержимое слайдов, а не описание того, что на них должно быть.
Каждый слайд должен иметь конкретный заголовок и конкретные тезисы.

Формат:
{
  "writtenProject": {
    "title": "...",
    "sections": [
      {"title":"Введение","paragraphs":["...","..."]},
      {"title":"...","paragraphs":["..."]}
    ]
  },
  "product": {
    "title":"...",
    "description":"...",
    "steps":["..."]
  },
  "design": {
    "palette":"botanical|ocean|editorial|violet|midnight|citrus",
    "layout":"split|editorial|visual-first|cards|minimal",
    "visualConcept":"описание художественного направления презентации"
  },
  "presentation": [
    {
      "title":"...",
      "subtitle":"...",
      "bullets":["..."],
      "visualType":"none|image|bar|table|process|quote|formula",
      "visualTitle":"...",
      "visualData":[],
      "imagePrompt":"...",
      "note":"..."
    }
  ],
  "defense": {
    "title":"...",
    "sections":[
      {"title":"Вступление","text":"..."},
      {"title":"Слайд 1","text":"..."}
    ]
  },
  "sources":["..."]
}

Правила:
- Выбирай дизайн и макет под конкретную тему проекта.
- История: музейная или архивная подача; география: карты и ландшафты; биология: научная и натуралистическая; литература: книжная; технологии: техническая; экология: природная.
- Ровно ${slidesCount} слайдов.
- Первый слайд: тема и данные ученика, если они указаны.
- Остальные слайды: актуальность, цель, задачи, теория, методы, практическая часть, результаты, продукт, выводы и источники — адаптируй к теме.
- Не пиши «здесь будет изображение», «можно добавить график» и подобные фразы.
- bullets должны быть готовыми короткими тезисами.
- Используй visualType=image на 4–6 содержательных слайдах, если уместно.
- Для каждого image-слайда заполняй imagePrompt уникальным описанием конкретной сцены без текста внутри изображения.
- Чередуй изображения, тезисы, таблицы, графики, цитаты, формулы и процессы, когда это полезно.
- Не выдумывай измерения, опросы и результаты.
- Если данных нет, используй качественные выводы или явно обозначай примерные данные.
- Не придумывай точные URL источников, если не уверен.
- Проект должен быть пригоден для школьной защиты.
`;

  const response = await client.responses.create({
    model: MODEL,
    input: prompt
  });

  return safeJson(response.output_text);
}app.post('/api/chat', async (req, res) => {
  try {
    if (!client) {
      return res.status(503).json({
        error: 'OPENAI_API_KEY не настроен на сервере.'
      });
    }

    const question = clean(
      req.body.question || req.body.message || req.body.prompt
    );

    if (!question) {
      return res.status(400).json({ error: 'Напиши вопрос.' });
    }

    if (question.length > 6000) {
      return res.status(400).json({
        error: 'Вопрос слишком длинный (максимум 6000 символов).'
      });
    }

    const response = await client.responses.create({
      model: MODEL,
      input: `Ты полезный русскоязычный помощник. Отвечай понятно, точно и по делу. Для школьных вопросов объясняй простыми словами. Не выдумывай источники и факты.\n\nВопрос пользователя: ${question}`
    });

    res.json({
      ok: true,
      answer: response.output_text || 'Не удалось получить текст ответа.'
    });
  } catch (error) {
    console.error('Ошибка /api/chat:', error?.message || error);

    res.status(500).json({
      error: error?.message || 'Не удалось получить ответ.'
    });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    const prompt = clean(req.body.prompt);

    if (!prompt) {
      return res.status(400).json({ error: 'Опиши изображение.' });
    }

    if (prompt.length > 3000) {
      return res.status(400).json({
        error: 'Описание слишком длинное (максимум 3000 символов).'
      });
    }

    const images = await searchCommonsImages(prompt, 8);

    if (!images.length) {
      return res.status(404).json({
        error: 'Подходящие изображения не найдены. Попробуй изменить описание.'
      });
    }

    res.json({ ok: true, images });
  } catch (error) {
    console.error('Ошибка /api/generate-image:', error?.message || error);

    res.status(500).json({
      error: error?.message || 'Не удалось найти изображение.'
    });
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

// Скачивание созданных файлов
app.get('/api/download/:id', (req, res) => {
  const file = downloadableFiles.get(req.params.id);

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).json({ error: 'Файл не найден.' });
  }

  res.download(file.path, file.name);
});

app.post('/api/generate-project', async (req, res) => {
  let dir;

  try {
    const firstName = clean(req.body.firstName);
    const lastName = clean(req.body.lastName);
    const className = clean(req.body.className);

    const school = clean(
      req.body.school || req.body.schoolName
    );

    const topic = clean(req.body.topic);

    const slidesCount = Math.min(
      Math.max(Number(req.body.slides ?? req.body.slideCount) || 12, 5),
      30
    );

    const extraRequirements = clean(
      req.body.extraRequirements || req.body.requirements
    );

    if (!topic) {
      return res.status(400).json({ error: 'Введите тему проекта.' });
    }

    if (!fs.existsSync(fontPath)) {
      return res.status(500).json({
        error: 'На сервере отсутствует шрифт assets/DejaVuSans.ttf.'
      });
    }

    const raw = await generateWithAI({
      firstName,
      lastName,
      className,
      school,
      topic,
      slidesCount,
      extraRequirements
    });

    const project = {
      ...raw,
      design: raw.design && typeof raw.design === 'object'
        ? raw.design
        : {},
      presentation: normalizeSlides(raw.presentation, slidesCount)
    };

    dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vse-proekty-')
    );

    const docxPath = path.join(dir, 'Индивидуальный_проект.docx');
    const presentationPath = path.join(dir, 'Презентация_проекта.pdf');
    const defensePath = path.join(dir, 'Текст_защиты.pdf');
    const bookletPath = path.join(dir, 'Буклет.pdf');
    const zipPath = path.join(dir, 'Весь_проект.zip');

    await makeDocx(project, docxPath);

    await generateSlideImages(project.presentation, topic, dir);

    await renderPresentationPdf(
      project.presentation,
      topic,
      presentationPath,
      project.design
    );

    const defenseSections = Array.isArray(project.defense?.sections)
      ? project.defense.sections
      : [{
          title: 'Защита',
          text: project.defense?.text || ''
        }];

    await renderTextPdf(
      project.defense?.title || 'Текст защиты',
      defenseSections,
      defensePath
    );

    await renderTextPdf(
      project.product?.title || 'Буклет проекта',
      [
        {
          title: 'Описание продукта',
          text: project.product?.description || ''
        },
        {
          title: 'Шаги выполнения',
          text: Array.isArray(project.product?.steps)
            ? project.product.steps.join('\n')
            : ''
        }
      ],
      bookletPath
    );

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);

      archive.pipe(output);

      archive.file(docxPath, {
        name: 'Индивидуальный_проект.docx'
      });

      archive.file(presentationPath, {
        name: 'Презентация_проекта.pdf'
      });

      archive.file(defensePath, {
        name: 'Текст_защиты.pdf'
      });

      archive.file(bookletPath, {
        name: 'Буклет.pdf'
      });

      archive.finalize();
    });

    const fileNames = [
      'Индивидуальный_проект.docx',
      'Презентация_проекта.pdf',
      'Текст_защиты.pdf',
      'Буклет.pdf',
      'Весь_проект.zip'
    ];

    const mimeTypes = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip'
    };

    const files = fileNames.map(name => {
      const filePath = path.join(dir, name);
      const id = randomUUID();

      downloadableFiles.set(id, {
        path: filePath,
        name
      });

      return {
        name,
        url: `/api/download/${id}`,
        mime: mimeTypes[path.extname(name)] || 'application/octet-stream'
      };
    });

    res.json({
      ok: true,
      project,
      files
    });
  } catch (error) {
    console.error('Ошибка /api/generate-project:', error);

    res.status(500).json({
      error: error?.message || 'Не удалось создать проект.'
    });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Все проекты #Ian запущен на порту ${PORT}`);
});
