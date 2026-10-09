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
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const MAX_AI_IMAGES = 6;

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
    visualType: clean(s?.visualType, 'none').toLowerCase(),
    visualTitle: clean(s?.visualTitle),
    visualData: s?.visualData ?? null,
    imagePrompt: clean(s?.imagePrompt),
    imagePath: null,
    note: clean(s?.note)
  }));

  // AI sometimes returns visualType=none even when an illustration is requested.
  // Convert several content slides with a visual title into real AI-image slides.
  const imageCandidates = result
    .filter((s, i) => i > 0 && ['none', 'image'].includes(s.visualType) && (s.visualTitle || s.bullets.length))
    .slice(0, Math.min(MAX_AI_IMAGES, 6));
  for (const slide of imageCandidates) {
    slide.visualType = 'image';
    if (!slide.imagePrompt) {
      slide.imagePrompt = `Educational illustration for the slide «${slide.title}». Show the concrete object, scene, or process described by this slide. Clean modern realistic academic style, no text, labels, letters, or numbers, landscape composition.`;
    }
  }

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

function wrapText(doc, text, x, y, width, options = {}) {
  doc.text(String(text || ''), x, y, {
    width,
    align: options.align || 'left',
    lineGap: options.lineGap ?? 3,
    continued: false
  });
}

function drawRoundedCard(doc, x, y, w, h) {
  doc.roundedRect(x, y, w, h, 18).fill('#F1F8F4');
  doc.roundedRect(x, y, w, h, 18).lineWidth(1).stroke('#D5E9DE');
}

function drawBulletList(doc, bullets, x, y, w, maxLines = 6) {
  let yy = y;
  const items = (bullets || []).slice(0, maxLines);
  for (const bullet of items) {
    doc.circle(x + 7, yy + 8, 4).fill('#18A66A');
    doc.fontSize(18).fillColor('#17231D');
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
    doc.fontSize(13).fillColor('#17231D');
    doc.text(r.label, x, yy + 5, { width: 145 });
    doc.roundedRect(x + 150, yy + 4, w - 170, 25, 7).fill('#DCEDE4');
    doc.roundedRect(x + 150, yy + 4, barW, 25, 7).fill('#18A66A');
    doc.fontSize(12).fillColor('#087546');
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
        .fill(ri === 0 ? '#18A66A' : '#F5FAF7')
        .lineWidth(0.8)
        .stroke('#CFE3D8');
      doc.fontSize(12)
        .fillColor(ri === 0 ? '#FFFFFF' : '#17231D')
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
    doc.circle(xx + bw / 2, y + 30, 18).fill('#18A66A');
    doc.fontSize(14).fillColor('#FFFFFF').text(String(i + 1), xx + bw / 2 - 5, y + 22, { width: 10, align: 'center' });
    doc.fontSize(13).fillColor('#17231D').text(item, xx + 10, y + 62, { width: bw - 20, align: 'center', lineGap: 3 });
    if (i < items.length - 1) {
      doc.moveTo(xx + bw + 3, y + h / 2).lineTo(xx + bw + gap - 3, y + h / 2)
        .lineWidth(2).stroke('#9CCEB5');
    }
  });
  return true;
}

function drawVisual(doc, slide, x, y, w, h) {
  drawRoundedCard(doc, x, y, w, h);
  if (slide.visualTitle) {
    doc.fontSize(15).fillColor('#087546').text(slide.visualTitle, x + 18, y + 16, { width: w - 36 });
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
    doc.fontSize(23).fillColor('#17231D').text(`“${clean(data)}”`, x + 28, y + 80, {
      width: w - 56,
      align: 'center',
      lineGap: 6
    });
    return;
  }

  if (type === 'formula') {
    doc.fontSize(28).fillColor('#087546').text(clean(data), x + 20, y + h / 2 - 20, {
      width: w - 40,
      align: 'center'
    });
    return;
  }

  // Полезный fallback вместо фиктивных зелёных карточек: тематическая подпись.
  const fallbackText = slide.visualTitle || slide.title || 'Главная идея';
  doc.save();
  doc.roundedRect(x + 16, y + 58, w - 32, h - 76, 14).fill('#F4F7FA');
  doc.roundedRect(x + 16, y + 58, w - 32, h - 76, 14).lineWidth(1).stroke('#D8E1E8');
  doc.circle(x + w / 2, y + 135, 34).fill('#E0EAF1');
  doc.circle(x + w / 2, y + 135, 18).fill('#7895A8');
  doc.fontSize(17).fillColor('#243746').text(fallbackText, x + 35, y + 195, {
    width: w - 70, align: 'center', lineGap: 4
  });
  doc.restore();
}

async function generateSlideImages(slides, topic, dir) {
  if (!client) return;
  const candidates = slides.filter(s => s.visualType === 'image').slice(0, MAX_AI_IMAGES);
  if (!candidates.length) return;

  let generated = 0;
  for (const slide of candidates) {
    const prompt = `Create a high-quality, topic-specific visual for a school presentation. Overall topic: ${topic}. This slide: ${slide.title}. Specific visual brief: ${slide.imagePrompt || slide.visualTitle || slide.bullets.join('; ')}. Show a concrete real subject or scene, with clear visual focus, realistic lighting, thoughtful composition, and editorial educational photography style. The image must be genuinely different from generic icons, abstract gradients, checkmarks, cards, diagrams, and UI mockups. No text, no labels, no letters, no numbers, no watermarks. Landscape 3:2 composition. Make this image unique to this exact slide.`;
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

  // Не дублируем одну и ту же картинку на других слайдах: при сбое остаётся тематическая графика.
}

function themeForTopic(topic) {
  const t = String(topic || '').toLowerCase();
  if (/географ|земл|океан|климат|природ|эколог|живот|растен/.test(t)) return { accent: '#247BA0', pale: '#EAF5FA', soft: '#CDEAF4', dark: '#163A4A', name: 'природная научная палитра: океанический синий и светлый голубой' };
  if (/истор|пирамид|древн|археолог|культур|литератур|искусств/.test(t)) return { accent: '#B77935', pale: '#FBF1E3', soft: '#F0D8B7', dark: '#4B3321', name: 'историческая палитра: песочный, охра и тёплый тёмный' };
  if (/информат|компьют|технолог|робот|программ|искусственн.*интеллект|ии|электрон/.test(t)) return { accent: '#6554C0', pale: '#F0EDFC', soft: '#DAD4F7', dark: '#282044', name: 'технологичная палитра: индиго и холодный светлый фон' };
  if (/хим|физик|биолог|медицин|здоров|энерг|электр/.test(t)) return { accent: '#168A72', pale: '#E8F7F2', soft: '#C7EDE2', dark: '#173F36', name: 'научная палитра: бирюзовый и чистые светлые оттенки' };
  if (/эконом|бизнес|финанс|предприним|социолог|опрос/.test(t)) return { accent: '#C04B62', pale: '#FBECEF', soft: '#F3D1D8', dark: '#4A2630', name: 'современная деловая палитра: бордово-розовый и светлый фон' };
  return { accent: '#18A66A', pale: '#F1F8F4', soft: '#D5E9DE', dark: '#17231D', name: 'современная нейтральная палитра с зелёным акцентом' };
}

function renderPresentationPdf(slides, topic, outputPath) {
  const theme = themeForTopic(topic);
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

      doc.rect(0, 0, W, H).fill('#FFFFFF');
      doc.rect(0, 0, 960, 12).fill(theme.accent);

      if (index === 0) {
        doc.circle(820, 100, 115).fill(theme.pale);
        doc.circle(820, 100, 72).fill(theme.soft);
        doc.circle(820, 100, 35).fill(theme.accent);

        doc.font('ProjectFont').fontSize(38).fillColor(theme.dark)
          .text(slide.title, 60, 120, { width: 650, lineGap: 7 });

        if (slide.subtitle) {
          doc.fontSize(20).fillColor('#68756E')
            .text(slide.subtitle, 60, 250, { width: 620, lineGap: 5 });
        }

        doc.fontSize(13).fillColor(theme.accent)
          .text('Индивидуальный проект', 60, 430, { width: 300 });
      } else {
        doc.font('ProjectFont').fontSize(28).fillColor(theme.dark)
          .text(slide.title, 50, 42, { width: 860, lineGap: 4 });

        doc.fontSize(11).fillColor('#68756E')
          .text(`${topic}  •  ${slide.number}`, 50, 90, { width: 860 });

        const hasVisual = slide.visualType && slide.visualType !== 'none';
        if (hasVisual) {
          // Чередуем композицию слайдов: визуал слева/справа, чтобы презентация не выглядела копией одного шаблона.
          const visualLeft = index % 2 === 0;
          if (visualLeft) {
            drawVisual(doc, slide, 55, 125, 385, 335);
            drawBulletList(doc, slide.bullets, 475, 130, 430, 5);
          } else {
            drawBulletList(doc, slide.bullets, 55, 130, 430, 5);
            drawVisual(doc, slide, 520, 125, 385, 335);
          }
        } else {
          doc.roundedRect(55, 125, 850, 335, 18).fill(theme.pale);
          doc.roundedRect(55, 125, 850, 335, 18).lineWidth(1).stroke(theme.soft);
          // Чередуем акцентную линию у текстовых слайдов.
          if (index % 3 === 0) doc.rect(55, 125, 8, 335).fill(theme.accent);
          drawBulletList(doc, slide.bullets, 80, 155, 800, 6);
        }

        if (slide.subtitle) {
          doc.fontSize(12).fillColor(theme.accent)
            .text(slide.subtitle, 55, 478, { width: 850, align: 'left' });
        }
      }

      // Брендинг показываем только на первом слайде,
      // чтобы он не повторялся на каждом слайде.
      if (index === 0) {
        doc.fontSize(10).fillColor('#8A978F')
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

    if (fs.existsSync(fontPath)) doc.registerFont('ProjectFont', fontPath);
    doc.font('ProjectFont').fontSize(22).fillColor('#087546').text(title);
    doc.moveDown(0.7);

    for (const section of sections) {
      doc.fontSize(15).fillColor('#17231D').text(clean(section.title));
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

Правила презентации:
- ровно ${slidesCount} слайдов;
- сначала самостоятельно выбери визуальную концепцию, которая подходит именно теме: палитра, настроение, тип иллюстраций и графики; не используй автоматически один и тот же зелёный стиль для всех тем;
- используй разные композиции: обложка, крупное фото, фото + тезисы, сравнение, схема/процесс, таблица/данные, выводы с крупными акцентами; не повторяй один макет на каждом слайде;
- изображения должны быть конкретными для темы слайда, без текста и декоративных абстрактных заглушек;
- 1-й слайд: тема, ученик/класс при необходимости;
- далее: актуальность, цель, задачи, теория, методы, практическая часть, результат, продукт, выводы, источники — адаптируй к теме;
- не пиши "на слайде будет изображение", "можно добавить график", "здесь будет..." и подобные описания;
- bullets должны быть готовыми короткими тезисами;
- используй visualType=image максимум на 6 содержательных слайдах, где уместна настоящая иллюстрация; для каждого такого слайда обязательно заполняй imagePrompt конкретной уникальной сценой/объектом; не проси абстрактные карточки, галочки, интерфейсы или текст внутри изображения;
- imagePrompt должен описывать именно тему слайда, без текста внутри изображения; для разных слайдов меняй ракурс, тип композиции и конкретный объект, сохраняя единую концепцию презентации;
- если нужен график, используй visualType=bar и visualData как массив объектов {"label":"...","value":число};
- если нужна таблица, visualType=table и visualData как массив строк-массивов;
- если нужен процесс, visualType=process и visualData как массив коротких шагов;
- не выдумывай измерения, опросы и результаты. Если реальных данных нет, используй качественные выводы или явно обозначай примерные/иллюстративные данные;
- не придумывай точные URL источников, если не уверен;
- презентация должна быть пригодна для школьной защиты.
`;

  const response = await client.responses.create({
    model: MODEL,
    input: prompt
  });

  return safeJson(response.output_text);
}

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
      presentationPath
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
