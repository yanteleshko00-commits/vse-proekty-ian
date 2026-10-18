import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';

funcapp = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
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
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
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
    accent: clean(s?.accent, '#18865B'),
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
      accent: '#18865B',
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

function wrapText(doc, text, x, y, width, options = {}) {
  doc.text(String(text || ''), x, y, {
    width,
    align: options.align || 'left',
    lineGap: options.lineGap ?? 3,
    continued: false
  });
}

function drawRoundedCard(doc, x, y, w, h) {
  doc.roundedRect(x, y, w, h, 18).fill(activeTheme.card);
  doc.roundedRect(x, y, w, h, 18).lineWidth(1).stroke(activeTheme.line);
}

function drawBulletList(doc, bullets, x, y, w, maxLines = 6) {
  let yy = y;
  const items = (bullets || []).slice(0, maxLines);
  for (const bullet of items) {
    doc.circle(x + 7, yy + 8, 4).fill(activeTheme.primary);
    doc.fontSize(18).fillColor(activeTheme.dark);
    doc.text(bullet, x + 23, yy, { width: w - 23, lineGap: 4 });
    yy += Math.max(38, doc.heightOfString(bullet, { width: w - 23, lineGap: 4 }) + 13);
  }
}

function drawBarChart(doc, data, x, y, w, h) {
  if (!Array.isArray(data) || !data.length) return false;
  const rows = data
    .map(d => ({ label: clean(d?.label), value: Number(d?.value) }))
    .filter(d => d.label && Number.isFinite(d.value));
  if (!rows.length) return false;

  const max = Math.max(...rows.map(r => r.value), 1);
  const rowH = Math.min(48, (h - 20) / rows.length);

  rows.forEach((r, i) => {
    const yy = y + i * rowH;
    const barW = Math.max(4, (r.value / max) * (w - 170));
    doc.fontSize(13).fillColor(activeTheme.dark);
    doc.text(r.label, x, yy + 5, { width: 145 });
    doc.roundedRect(x + 150, yy + 4, w - 170, 25, 7).fill(activeTheme.soft);
    doc.roundedRect(x + 150, yy + 4, barW, 25, 7).fill(activeTheme.primary);
    doc.fontSize(12).fillColor(activeTheme.primary);
    doc.text(String(r.value), x + 155 + barW, yy + 7, { width: 40 });
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
        .text(clean(cell), xx + 7, yy + 8, { width: cw - 14, height: rh - 12 });
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
    doc.fontSize(14).fillColor('#FFFFFF').text(String(i + 1), xx + bw / 2 - 5, y + 22, { width: 10, align: 'center' });
    doc.fontSize(13).fillColor(activeTheme.dark).text(item, xx + 10, y + 62, { width: bw - 20, align: 'center', lineGap: 3 });
    if (i < items.length - 1) {
      doc.moveTo(xx + bw + 3, y + h / 2).lineTo(xx + bw + gap - 3, y + h / 2)
        .lineWidth(2).stroke(activeTheme.line);
    }
  });
  return true;
}

function drawVisual(doc, slide, x, y, w, h) {
  drawRoundedCard(doc, x, y, w, h);
  if (slide.visualTitle) {
    doc.fontSize(15).fillColor(activeTheme.primary).text(slide.visualTitle, x + 18, y + 16, { width: w - 36 });
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
    } catch (_) {}
  }

  if (type === 'bar' && drawBarChart(doc, data, x + 18, y + 55, w - 36, h - 75)) return;
  if (type === 'table' && drawTable(doc, data, x + 18, y + 50, w - 36, h - 68)) return;
  if (type === 'process' && drawProcess(doc, data, x + 18, y + 65, w - 36, h - 90)) return;

  if (type === 'quote') {
    doc.fontSize(23).fillColor(activeTheme.dark).text(`“${clean(data)}”`, x + 28, y + 80, {
      width: w - 56,
      align: 'center',
      lineGap: 6
    });
    return;
  }

  if (type === 'formula') {
    doc.fontSize(28).fillColor(activeTheme.primary).text(clean(data), x + 20, y + h / 2 - 20, {
      width: w - 40,
      align: 'center'
    });
    return;
  }

  doc.circle(x + w / 2, y + h / 2 - 8, 44).fill(activeTheme.primary);
  doc.fontSize(34).fillColor('#FFFFFF').text('✓', x + w / 2 - 16, y + h / 2 - 29, { width: 32, align: 'center' });
  doc.fontSize(14).fillColor(activeTheme.muted).text('Ключевая идея проекта', x + 20, y + h / 2 + 50, {
    width: w - 40,
    align: 'center'
  });
}

async function generateSlideImages(slides, topic, dir) {
  if (!client) return;
  const candidates = slides.filter(s => s.visualType === 'image').slice(0, MAX_AI_IMAGES);
  if (!candidates.length) return;

  let generated = 0;
  for (const slide of candidates) {
    const prompt = slide.imagePrompt || `Educational illustration for a school presentation about ${topic}. Topic of this slide: ${slide.title}. Clean modern academic style, realistic or polished editorial illustration, no text, no labels, landscape composition, suitable for a presentation.`;
    try {
      const result = await client.images.generate({
        model: IMAGE_MODEL,
        prompt,
        size: '1536x1024',
        quality: 'low'
      });
      const item = result?.data?.[0];
      if (!item?.b64_json) continue;
      const filePath = path.join(dir, `slide-image-${generated + 1}.png`);
      fs.writeFileSync(filePath, Buffer.from(item.b64_json, 'base64'));
      slide.imagePath = filePath;
      generated += 1;
    } catch (error) {
      console.warn('Не удалось создать изображение для слайда:', error?.message || error);
    }
  }

  // Если картинок меньше, чем image-слайдов, переиспользуем уже созданные.
  const available = slides.filter(s => s.imagePath);
  if (available.length) {
    let cursor = 0;
    for (const slide of slides) {
      if (slide.visualType === 'image' && !slide.imagePath) {
        slide.imagePath = available[cursor % available.length].imagePath;
        cursor += 1;
      }
    }
  }
}

function renderPresentationPdf(slides, topic, outputPath, design = {}) {
  // AI selects a visual direction for each project; fallback is randomized.
  const requestedTheme = clean(design.palette).toLowerCase();
  activeTheme = THEMES.find(t => t.name === requestedTheme) || THEMES[Math.floor(Math.random() * THEMES.length)];
const allowedLayouts = ['split', 'editorial', 'visual-first', 'cards', 'minimal', 'statement'];
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

    if (fs.existsSync(fontPath)) doc.registerFont('ProjectFont', fontPath);

    slides.forEach((slide, index) => {
      doc.addPage();
      const W = 960, H = 540;
            const slideBackground = slide.background === 'dark'
        ? '#172033'
        : slide.background === 'soft'
          ? (activeTheme.soft || '#F1F5F2')
          : '#FFFFFF';

      const slideAccent = /^#[0-9A-Fa-f]{6}$/.test(slide.accent || '')
        ? slide.accent
        : activeTheme.primary;

      doc.rect(0, 0, W, H).fill(slideBackground);
      doc.rect(0, 0, W, 12).fill(slideAccent);

      if (index === 0) {
        if (activeTheme.cover === 'wave') {
          doc.save();
          doc.moveTo(700, 0).lineTo(960, 0).lineTo(960, 540).lineTo(790, 540).bezierCurveTo(850, 390, 650, 240, 700, 0).fill(activeTheme.soft);
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
          .text(slide.title, 60, 120, { width: 650, lineGap: 7 });

        if (slide.subtitle) {
          doc.fontSize(20).fillColor(activeTheme.muted)
            .text(slide.subtitle, 60, 250, { width: 620, lineGap: 5 });
        }

        doc.fontSize(13).fillColor(activeTheme.primary)
          .text('Индивидуальный проект', 60, 430, { width: 300 });
      } else {
        doc.font('ProjectFont').fontSize(28).fillColor(activeTheme.dark)
          .text(slide.title, 50, 42, { width: 860, lineGap: 4 });

        doc.fontSize(11).fillColor(activeTheme.muted)
          .text(`${topic}  •  ${slide.number}`, 50, 90, { width: 860 });
 
const hasVisual = slide.visualType && slide.visualType !== 'none';

const layoutCycle = ['split', 'editorial', 'visual-first', 'cards', 'minimal', 'statement'];

const layoutForSlide = layoutCycle.includes(slide.layout)
  ? slide.layout
  : layoutCycle[
      (Math.max(0, layoutCycle.indexOf(activeLayout)) + index - 1 + layoutCycle.length)
      % layoutCycle.length
    ];
             if (layoutForSlide === 'statement') {
          const mainText = slide.headline || slide.title;

          doc.roundedRect(55, 125, 850, 315, 22).fill(activeTheme.soft);
          doc.rect(55, 125, 9, 315).fill(slideAccent);

          doc.font('ProjectFont')
            .fontSize(32)
            .fillColor(slide.background === 'dark' ? '#FFFFFF' : activeTheme.dark)
            .text(mainText, 90, 165, {
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
        } else if (layoutForSlide === 'minimal') {
          doc.rect(55, 135, 8, 290).fill(slideAccent);
          drawBulletList(doc, slide.bullets, 90, 150, 790, 6);
        } else if (layoutForSlide === 'editorial') {
          doc.rect(55, 130, 260, 330).fill(activeTheme.soft);
          doc.font('ProjectFont')
            .fontSize(21)
            .fillColor(activeTheme.primary)
            .text(slide.subtitle || 'Ключевые тезисы', 75, 155, {
              width: 220,
              lineGap: 5
            });
          drawBulletList(doc, slide.bullets, 350, 140, 540, 6);
        } else if (hasVisual && layoutForSlide === 'visual-first') {
          drawVisual(doc, slide, 55, 120, 500, 345);
          drawBulletList(doc, slide.bullets, 585, 140, 315, 5);
        } else if (hasVisual && layoutForSlide === 'editorial') {
          drawVisual(doc, slide, 55, 130, 385, 325);
          doc.rect(465, 130, 3, 325).fill(slideAccent);
          drawBulletList(doc, slide.bullets, 495, 140, 400, 5);
        } else if (hasVisual) {
          drawBulletList(doc, slide.bullets, 55, 130, 430, 5);
          drawVisual(doc, slide, 520, 125, 385, 335);
        } else {
          drawRoundedCard(doc, 55, 125, 850, 335);
          drawBulletList(doc, slide.bullets, 80, 155, 800, 6);
        }

          if (slide.emphasis) {
            doc.fontSize(19)
              .fillColor(slideAccent)
              .text(slide.emphasis, 90, 355, {
                width: 760,
                height: 55,
                ellipsis: true
              });
          }
        } else if (hasVisual && layoutForSlide === 'visual-first') {
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
            .text(slide.subtitle || 'Ключевые тезисы', 75, 155, { width: 220, lineGap: 5 });
          drawBulletList(doc, slide.bullets, 350, 140, 540, 6);
        } else {
          drawRoundedCard(doc, 55, 125, 850, 335);
          drawBulletList(doc, slide.bullets, 80, 155, 800, 6);
        }

        if (slide.subtitle) {
          doc.fontSize(12).fillColor(activeTheme.primary)
            .text(slide.subtitle, 55, 478, { width: 850, align: 'left' });
        }
      }

      // Брендинг показываем только на первом слайде,
      // чтобы он не повторялся на каждом слайде.
      if (index === 0) {
        doc.fontSize(10).fillColor(activeTheme.muted)
          .text('Все проекты #Ian', 50, 515, { width: 200 });
      }
    });

    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function renderTextPdf(title, sections, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true });
    const out = fs.createWriteStream(outputPath);
    doc.pipe(out);

   (fs.existsSync(fontPath)) doc.registerFont('ProjectFont', fontPath);
    doc.font('ProjectFont').fontSize(22).fillColor(activeTheme.primary).text(title);
    doc.moveDown(0.7);

    for (const section of sections) {
      doc.fontSize(15).fillColor(activeTheme.dark).text(clean(section.title));
      doc.moveDown(0.25);
      doc.fontSize(11).fillColor('#303B35').text(clean(section.text), {
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

  for (const s of sections) {
    children.push(new Paragraph({ text: clean(s.title), heading: HeadingLevel.HEADING_1 }));
    const paragraphs = Array.isArray(s.paragraphs) ? s.paragraphs : [s.text || ''];
    for (const p of paragraphs) {
      children.push(new Paragraph({
        children: [new TextRun(clean(p))]
      }));
    }
  }

  children.push(new Paragraph({ text: 'Проектный продукт', heading: HeadingLevel.HEADING_1 }));
  children.push(new Paragraph(clean(project.product?.description || 'Практический продукт по теме проекта.')));

  const doc = new Document({
    sections: [{ children }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

async function generateWithAI({ firstName, lastName, className, school, topic, slidesCount, extraRequirements }) {
  if (!client) throw new Error('OPENAI_API_KEY не настроен на сервере.');

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

Очень важно: presentation — это НЕ описание будущих слайдов.
presentation — это готовое содержимое каждого слайда, которое можно сразу вывести в PDF.
Каждый слайд должен иметь конкретный заголовок и конкретный текст/данные.

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
  "design": {"palette":"botanical|ocean|editorial|violet|midnight|citrus", "layout":"split|editorial|visual-first|cards|minimal", "visualConcept":"краткое описание уникального художественного направления презентации"},
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
      "layout":"split|editorial|visual-first|cards|minimal|statement",
"background":"light|soft|dark",
"accent":"#18865B",
"headline":"Главная мысль слайда",
"emphasis":"Ключевой вывод"
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

Правила презентации:
- перед созданием слайдов самостоятельно выбери дизайн-палитру и макет на основе конкретной темы; не выбирай автоматически один и тот же стиль для разных тем;
- в поле design задай palette одним из значений botanical, ocean, editorial, violet, midnight, citrus; layout выбери из split, editorial, visual-first, cards, minimal; visualConcept опиши конкретное художественное направление этой работы;
- выбор должен быть тематическим: история — музейная/архивная редакционная подача, география — картографическая/пейзажная, биология — научная/натуралистическая, литература — книжная/редакционная, технологии — техническая/современная, экология — природная; не своди каждую тему к этим примерам, придумай подходящий вариант;
- ровно ${slidesCount} слайдов;
- 1-й слайд: тема, ученик/класс при необходимости;
- далее: актуальность, цель, задачи, теория, методы, практическая часть, результат, продукт, выводы, источники — адаптируй к теме;
- не пиши "на слайде будет изображение", "можно добавить график", "здесь будет..." и подобные описания;
- bullets должны быть готовыми короткими тезисами;
- используй visualType=image на 4–6 содержательных слайдах, где уместна иллюстрация; для каждого такого слайда обязательно заполняй imagePrompt коротким описанием нужной картинки;
- не делай все слайды одинаковыми: чередуй фото/иллюстрацию, короткие тезисы, таблицу, график, цитату, формулу и последовательность шагов там, где это подходит теме;
- избегай повторяющейся композиции: выбирай visualType и плотность текста по смыслу каждого слайда; не вставляй декоративную схему без пользы;
- imagePrompt должен каждый раз описывать конкретный уникальный объект/сцену для этого слайда, а не общую картинку по теме;
- для разных тем выбирай соответствующую визуальную подачу: научная — чистая инфографика/лабораторные фото, история — архивная/музейная атмосфера, география — карты/ландшафты, литература — книжная/редакционная, экология — природная фотография, технологии — современная предметная съёмка;
- imagePrompt должен описывать именно тему слайда, без текста внутри изображения;
- если нужен график, используй visualType=bar и visualData как массив объектов {"label":"...","value":число};
- если нужна таблица, visualType=table и visualData как массив строк-массивов;
- если нужен процесс, visualType=process и visualData как массив коротких шагов;
- не выдумывай измерения, опросы и результаты. Если реальных данных нет, используй качественные выводы или явно обозначай примерные/иллюстративные данные;
- не придумывай точные URL источников, если не уверен;
- презентация должна быть пригодна для школьной защиты.
- Каждый слайд должен иметь собственную композицию, соответствующую его смыслу.
- Чередуй визуальные и текстовые слайды, не повторяй одинаковый тип визуализации подряд без необходимости.
- Используй короткие тезисы, конкретные примеры и наглядные данные, если они доступны.
- Выбирай спокойные, согласованные цвета; не используй больше трёх основных цветов на одном слайде.
- Не добавляй декоративные элементы, если они мешают содержанию.
- Не выдумывай статистику, цитаты, результаты исследований или факты ради оформления.
- Сохраняй цель, задачи, факты и выводы проекта без изменений ради дизайна.
Правила визуального дизайна:
- Сначала разработай оригинальную концепцию всей презентации: опиши настроение, палитру, типографику и визуальный язык.
- Каждый слайд должен иметь собственную композицию, выбранную по смыслу, а не случайно.
- Для каждого слайда заполни поля layout, background, accent, headline и emphasis.
- layout выбирай из: split, editorial, visual-first, cards, minimal, statement.
- background выбирай из: light, soft, dark.
- accent — дополнительный цвет в HEX-формате, согласованный с общей палитрой.
- headline — короткая выразительная фраза, если она помогает раскрыть главную мысль.
- emphasis — ключевое слово или короткий вывод для визуального выделения.
- Используй крупные заголовки, фотографии, схемы, сравнения, временные линии и инфографику.
- Чередуй композиции: не размещай все слайды по схеме «заголовок + список + карточка».
- На большинстве содержательных слайдов используй 1–3 коротких тезиса; максимум 4, если тема требует.
- Не переноси длинные абзацы из письменного проекта в презентацию.
- Для каждого изображения указывай конкретный imagePrompt с объектом, ракурсом, освещением и стилем.
- Изображения не должны содержать текст, подписи или логотипы.
- Используй графики только при наличии достоверных данных; не выдумывай числа.
- Не создавай бессмысленные таблицы, декоративные схемы и повторяющиеся иконки.
- Обложка должна быть выразительной; выводы — краткими и хорошо заметными.
- Все элементы должны помещаться в границы слайда, а текст должен оставаться читаемым.
- Сохраняй фактическую точность и смысл школьного проекта.


`;

  const response = await client.responses.create({
    model: MODEL,
    input: prompt
  });

  return safeJson(response.output_text);
}

app.post('/api/chat', async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен на сервере.' });
    const question = clean(req.body.question);
    if (!question) return res.status(400).json({ error: 'Напиши вопрос.' });
    if (question.length > 6000) return res.status(400).json({ error: 'Вопрос слишком длинный (максимум 6000 символов).' });
    const response = await client.responses.create({
      model: MODEL,
      input: `Ты полезный русскоязычный помощник. Отвечай понятно, точно и по делу. Для школьных вопросов объясняй простыми словами. Не выдумывай источники и факты.\n\nВопрос пользователя: ${question}`
    });
    res.json({ ok: true, answer: response.output_text || 'Не удалось получить текст ответа.' });
  } catch (error) {
    console.error('Ошибка /api/chat:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Не удалось получить ответ.' });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен на сервере.' });
    const prompt = clean(req.body.prompt);
    if (!prompt) return res.status(400).json({ error: 'Опиши изображение.' });
    if (prompt.length > 3000) return res.status(400).json({ error: 'Описание слишком длинное (максимум 3000 символов).' });
    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt: `Create one high-quality image based on this description. Do not add text, letters, logos or watermarks unless explicitly requested. Description: ${prompt}`,
      size: '1024x1024',
      quality: 'low'
    });
    const item = result?.data?.[0];
    if (!item?.b64_json) throw new Error('Модель не вернула файл изображения. Проверь доступность модели изображений и лимиты API.');
    res.json({ ok: true, image: item.b64_json, mime: 'image/png' });
  } catch (error) {
    console.error('Ошибка /api/generate-image:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Не удалось создать изображение.' });
  }
});
// Редактирование проекта и повторная сборка всех файлов
app.post('/api/edit-project', async (req, res) => {
  let dir;

  try {
    if (!client) {
      return res.status(503).json({
        ok: false,
        error: 'OPENAI_API_KEY не настроен на сервере.'
      });
    }

    if (!fs.existsSync(fontPath)) {
      return res.status(500).json({
        ok: false,
        error: 'На сервере отсутствует шрифт assets/DejaVuSans.ttf.'
      });
    }

    const { project, instruction } = req.body || {};

    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      return res.status(400).json({
        ok: false,
        error: 'Не передан проект.'
      });
    }

    if (
      typeof instruction !== 'string' ||
      !instruction.trim() ||
      instruction.length > 3000
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Опиши изменения (до 3000 символов).'
      });
    }

    const response = await client.responses.create({
      model: MODEL,
      instructions:
        'Ты редактируешь существующий школьный индивидуальный проект. ' +
        'Внеси запрошенные изменения, сохрани остальные важные разделы. ' +
        'Верни полный обновлённый проект в формате JSON. Используй json для ответа. ' +
        'Структура: writtenProject, product, design, presentation, defense, sources. ' +
        'presentation должен быть массивом готовых слайдов. ' +
        'Не выдумывай реальные результаты исследований и источники.',

input: JSON.stringify({
  task: 'Return the result as JSON.',
  project,
  requestedChanges: instruction.trim()
}),
text: {
  format: { type: 'json_object' }
}

    });

    const raw = safeJson(response.output_text);

    const slideCount = Math.min(
      Math.max(
        Array.isArray(project.presentation)
          ? project.presentation.length
          : 12,
        5
      ),
      30
    );

    const updatedProject = {
      ...raw,
      design:
        raw.design && typeof raw.design === 'object'
          ? raw.design
          : {},
      presentation: normalizeSlides(raw.presentation, slideCount)
    };

    const topic = clean(
      updatedProject.writtenProject?.title ||
      project.writtenProject?.title,
      'Индивидуальный проект'
    );

    dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vse-proekty-edit-')
    );

    const docxPath = path.join(dir, 'Индивидуальный_проект.docx');
    const presentationPath = path.join(dir, 'Презентация_проекта.pdf');
    const defensePath = path.join(dir, 'Текст_защиты.pdf');
    const bookletPath = path.join(dir, 'Буклет.pdf');
    const zipPath = path.join(dir, 'Весь_проект.zip');

    await makeDocx(updatedProject, docxPath);

    await generateSlideImages(updatedProject.presentation, topic, dir);

    await renderPresentationPdf(
      updatedProject.presentation,
      topic,
      presentationPath,
      updatedProject.design
    );

    const defenseSections = Array.isArray(
      updatedProject.defense?.sections
    )
      ? updatedProject.defense.sections
      : [{
          title: 'Защита',
          text: updatedProject.defense?.text || ''
        }];

    await renderTextPdf(
      updatedProject.defense?.title || 'Текст защиты',
      defenseSections,
      defensePath
    );

    await renderTextPdf(
      updatedProject.product?.title || 'Буклет проекта',
      [
        {
          title: 'Описание продукта',
          text: updatedProject.product?.description || ''
        },
        {
          title: 'Шаги выполнения',
          text: Array.isArray(updatedProject.product?.steps)
            ? updatedProject.product.steps.join('\n')
            : ''
        }
      ],
      bookletPath
    );

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

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

    const files = {};

    for (const name of fileNames) {
      const filePath = path.join(dir, name);

      files[name] = {
        base64: fs.readFileSync(filePath).toString('base64'),
        mime: name.endsWith('.docx')
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : name.endsWith('.zip')
            ? 'application/zip'
            : 'application/pdf'
      };
    }

    return res.json({
      ok: true,
      project: updatedProject,
      files
    });
  } catch (error) {
    console.error('Ошибка /api/edit-project:', error?.message || error);

    return res.status(500).json({
      ok: false,
      error: error?.message || 'Не удалось изменить проект.'
    });
  } finally {
    if (dir) {
      fs.rm(dir, { recursive: true, force: true }, error => {
        if (error) {
          console.warn('Не удалось удалить временные файлы:', error.message);
        }
      });
    }
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
  try {
    const firstName = clean(req.body.firstName);
    const lastName = clean(req.body.lastName);
    const className = clean(req.body.className);
    const school = clean(req.body.school);
    const topic = clean(req.body.topic);
    const slidesCount = Math.min(Math.max(Number(req.body.slides) || 12, 5), 30);
    const extraRequirements = clean(req.body.extraRequirements);

    if (!topic) return res.status(400).json({ error: 'Введите тему проекта.' });
    if (!fs.existsSync(fontPath)) {
      return res.status(500).json({ error: 'На сервере отсутствует шрифт assets/DejaVuSans.ttf.' });
    }

    const raw = await generateWithAI({
      firstName, lastName, className, school, topic,
      slidesCount, extraRequirements
    });

    const project = {
      ...raw,
      design: raw.design && typeof raw.design === 'object' ? raw.design : {},
      presentation: normalizeSlides(raw.presentation, slidesCount)
    };

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vse-proekty-'));

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
      : [{ title: 'Защита', text: project.defense?.text || '' }];

    await renderTextPdf(
      project.defense?.title || 'Текст защиты',
      defenseSections,
      defensePath
    );

    await renderTextPdf(
      project.product?.title || 'Буклет проекта',
      [
        { title: 'Описание продукта', text: project.product?.description || '' },
        { title: 'Шаги выполнения', text: Array.isArray(project.product?.steps) ? project.product.steps.join('\n') : '' }
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
      archive.file(docxPath, { name: 'Индивидуальный_проект.docx' });
      archive.file(presentationPath, { name: 'Презентация_проекта.pdf' });
      archive.file(defensePath, { name: 'Текст_защиты.pdf' });
      archive.file(bookletPath, { name: 'Буклет.pdf' });
      archive.finalize();
    });

    const fileNames = [
      'Индивидуальный_проект.docx',
      'Презентация_проекта.pdf',
      'Текст_защиты.pdf',
      'Буклет.pdf',
      'Весь_проект.zip'
    ];

    const files = {};
    for (const name of fileNames) {
      const p = path.join(dir, name);
      files[name] = {
        base64: fs.readFileSync(p).toString('base64'),
        mime: name.endsWith('.docx')
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : name.endsWith('.zip')
            ? 'application/zip'
            : 'application/pdf'
      };
    }

    res.json({
      ok: true,
      project,
      files
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error?.message || 'Не удалось создать проект.'
    });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Все проекты #Ian: http://0.0.0.0:${PORT}`);
});
