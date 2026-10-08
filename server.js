import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';

const publicDir = path.join(process.cwd(), 'public');
const fontPath = path.join(process.cwd(), 'assets', 'DejaVuSans.ttf');

app.use(express.json({ limit: '12mb' }));
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
  const fallbackTitles = [
    'Введение и актуальность', 'Цель и задачи', 'Основные понятия', 'Теоретическая часть',
    'Методы и ход работы', 'Практическая часть', 'Результаты', 'Проектный продукт',
    'Практическая ценность', 'Выводы', 'Источники', 'Спасибо за внимание'
  ];
  const result = source.slice(0, count).map((s, i) => ({
    number: i + 1,
    title: clean(s?.title, fallbackTitles[i] || `Итоги проекта — часть ${i + 1}`),
    subtitle: clean(s?.subtitle),
    bullets: Array.isArray(s?.bullets)
      ? s.bullets.map(x => clean(x)).filter(Boolean).slice(0, 5)
      : [],
    visualType: clean(s?.visualType, 'image'),
    visualTitle: clean(s?.visualTitle),
    visualData: s?.visualData ?? null,
    imagePrompt: clean(s?.imagePrompt),
    layout: clean(s?.layout, i === 0 ? 'cover' : 'split'),
    note: clean(s?.note)
  }));

  while (result.length < count) {
    const n = result.length + 1;
    result.push({
      number: n,
      title: fallbackTitles[n - 1] || `Итоги проекта — часть ${n}`,
      subtitle: 'Содержание сформировано по теме проекта.',
      bullets: ['Ключевой тезис проекта.', 'Связь с целью и задачами.', 'Практическая значимость.'],
      visualType: n % 3 === 0 ? 'process' : 'image',
      visualTitle: 'Ключевая идея',
      visualData: n % 3 === 0 ? ['Изучение', 'Анализ', 'Практика', 'Вывод'] : null,
      imagePrompt: '',
      layout: n % 2 ? 'cards' : 'split',
      note: ''
    });
  }
  return result;
}

async function extractSchoolRequirements(dataUrl, fileName='') {
  if (!dataUrl) return '';
  const m = String(dataUrl).match(/^data:[^;]+;base64,(.+)$/s);
  if (!m) return '';
  const buffer = Buffer.from(m[1], 'base64');
  if (buffer.length > 6 * 1024 * 1024) throw new Error('Файл требований слишком большой. Максимум 6 МБ.');
  const ext = path.extname(fileName).toLowerCase();
  try {
    if (ext === '.pdf') {
      const parsed = await pdfParse(buffer);
      return clean(parsed.text).slice(0, 30000);
    }
    if (ext === '.docx') {
      const parsed = await mammoth.extractRawText({ buffer });
      return clean(parsed.value).slice(0, 30000);
    }
    if (ext === '.doc') return 'Файл .doc загружен. Для точного чтения лучше сохранить его как .docx или PDF.';
  } catch (err) {
    console.warn('Не удалось прочитать требования школы:', err?.message || err);
    return `Файл требований загружен (${fileName}), но текст автоматически прочитать не удалось. Учитывай только дополнительные требования из формы.`;
  }
  return '';
}

function themeFromProject(theme = {}) {
  const palettes = {
    green: { primary:'#18A66A', dark:'#087546', light:'#E8F7EF', pale:'#F5FBF7', text:'#17231D' },
    blue: { primary:'#2878D8', dark:'#164A8A', light:'#EAF3FF', pale:'#F6FAFF', text:'#142235' },
    purple: { primary:'#7C5CFC', dark:'#4A35A8', light:'#F0ECFF', pale:'#FAF9FF', text:'#201A35' },
    orange: { primary:'#F28B30', dark:'#A9550C', light:'#FFF0DF', pale:'#FFF9F2', text:'#2D2118' },
    teal: { primary:'#0E9F9A', dark:'#08706D', light:'#E4F7F6', pale:'#F4FCFC', text:'#172827' }
  };
  return palettes[clean(theme.palette,'green')] || palettes.green;
}

function hexToRgb(hex){
  const h=hex.replace('#','');
  return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};
}
function mixHex(a,b,t){
  const A=hexToRgb(a),B=hexToRgb(b);
  const f=n=>Math.round(A[n]*(1-t)+B[n]*t).toString(16).padStart(2,'0');
  return `#${f('r')}${f('g')}${f('b')}`;
}

function imageFileName(prompt, index){
  return path.join(os.tmpdir(), `vse-img-${index}-${crypto.createHash('sha1').update(prompt).digest('hex').slice(0,10)}.png`);
}

async function generateSlideImages(slides, topic, dir, theme){
  if (!client || typeof client.images?.generate !== 'function') return;
  const candidates = slides
    .map((s,i)=>({s,i}))
    .filter(({s})=>s.imagePrompt && s.visualType !== 'none')
    .slice(0, 6);
  for (const {s,i} of candidates){
    try{
      const prompt = `Create a clean school-project illustration for a presentation about "${topic}". ${s.imagePrompt}. Style: ${theme?.imageStyle || 'modern educational editorial illustration'}, no text, no logos, no watermark, landscape composition, clear focal subject, suitable for a 16:9 slide, visually rich but not photorealistic unless the topic requires it.`;
      const result = await client.images.generate({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size:'1536x1024', quality:'medium' });
      const b64 = result?.data?.[0]?.b64_json;
      if (!b64) continue;
      const file = path.join(dir, `slide-${i+1}.png`);
      fs.writeFileSync(file, Buffer.from(b64,'base64'));
      s.imagePath = file;
    }catch(err){
      console.warn(`Image generation failed for slide ${i+1}:`, err?.message || err);
    }
  }
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

function drawImageCover(doc, file, x, y, w, h, radius=18){
  try{
    doc.save();
    doc.roundedRect(x,y,w,h,radius).clip();
    doc.image(file,x,y,{fit:[w,h],align:'center',valign:'center'});
    doc.restore();
    return true;
  }catch{return false;}
}

function drawVisual(doc, slide, x, y, w, h, theme) {
  if (slide.imagePath && drawImageCover(doc, slide.imagePath, x, y, w, h, 20)) {
    doc.save();
    doc.roundedRect(x,y,w,h,20).lineWidth(1).stroke(theme.light);
    doc.restore();
    if (slide.visualTitle) {
      doc.roundedRect(x+14,y+14,Math.min(w-28,250),32,16).fill('#FFFFFF').fillOpacity(0.88);
      doc.font('ProjectFont').fontSize(13).fillColor(theme.dark).text(slide.visualTitle,x+26,y+23,{width:Math.min(w-52,230)});
    }
    return;
  }
  drawRoundedCard(doc, x, y, w, h);
  if (slide.visualTitle) doc.font('ProjectFont').fontSize(15).fillColor(theme.dark).text(slide.visualTitle, x + 18, y + 16, { width: w - 36 });
  const type = slide.visualType, data = slide.visualData;
  if (type === 'bar' && drawBarChart(doc, data, x + 18, y + 55, w - 36, h - 75)) return;
  if (type === 'table' && drawTable(doc, data, x + 18, y + 50, w - 36, h - 68)) return;
  if (type === 'process' && drawProcess(doc, data, x + 18, y + 65, w - 36, h - 90)) return;
  if (type === 'quote') { doc.font('ProjectFont').fontSize(22).fillColor(theme.text).text(`“${clean(data)}”`, x+28,y+85,{width:w-56,align:'center',lineGap:6}); return; }
  if (type === 'formula') { doc.font('ProjectFont').fontSize(28).fillColor(theme.dark).text(clean(data),x+20,y+h/2-20,{width:w-40,align:'center'}); return; }
  // Rich fallback illustration made from vector shapes, never an empty card.
  const cx=x+w/2, cy=y+h/2;
  doc.circle(cx,cy-15,72).fill(theme.light);
  doc.circle(cx,cy-15,48).fill(theme.primary);
  doc.font('ProjectFont').fontSize(30).fillColor('#FFFFFF').text('✦',cx-18,cy-36,{width:36,align:'center'});
  doc.roundedRect(x+35,y+h-80,w-70,42,21).fill(theme.pale).stroke(theme.light);
  doc.font('ProjectFont').fontSize(12).fillColor(theme.dark).text('Визуальный блок по теме',x+55,y+h-67,{width:w-110,align:'center'});
}

function renderPresentationPdf(slides, topic, outputPath, themeData={}) {
  return new Promise((resolve, reject) => {
    const theme = themeFromProject(themeData);
    const doc = new PDFDocument({ size:[960,540], margins:{top:0,left:0,right:0,bottom:0}, autoFirstPage:false, info:{Title:`Презентация — ${topic}`,Author:'Все проекты #Ian'} });
    const out=fs.createWriteStream(outputPath); doc.pipe(out);
    if(fs.existsSync(fontPath)) doc.registerFont('ProjectFont',fontPath);
    slides.forEach((slide,index)=>{
      doc.addPage(); const W=960,H=540;
      const alt=mixHex(theme.primary,'#FFFFFF',0.78);
      doc.rect(0,0,W,H).fill(theme.pale);
      doc.rect(0,0,W,10).fill(theme.primary);
      doc.circle(875,75,130).fill(alt); doc.circle(900,110,75).fill(theme.light);
      if(index===0 || slide.layout==='cover'){
        if(slide.imagePath) drawImageCover(doc,slide.imagePath,560,55,350,400,28);
        else { doc.roundedRect(570,75,310,350,28).fill(theme.light); doc.circle(725,235,82).fill(theme.primary); doc.font('ProjectFont').fontSize(46).fillColor('#FFFFFF').text('✦',695,205,{width:60,align:'center'}); }
        doc.font('ProjectFont').fontSize(40).fillColor(theme.text).text(slide.title,55,105,{width:455,lineGap:7});
        if(slide.subtitle) doc.font('ProjectFont').fontSize(18).fillColor('#617068').text(slide.subtitle,58,265,{width:430,lineGap:5});
        if(slide.bullets?.length) drawBulletList(doc,slide.bullets.slice(0,3),60,325,430,3);
        doc.font('ProjectFont').fontSize(12).fillColor(theme.dark).text('Индивидуальный проект • Все проекты #Ian',60,490,{width:400});
      } else {
        const layout=slide.layout || (slide.imagePath?'split':'cards');
        doc.font('ProjectFont').fontSize(28).fillColor(theme.text).text(slide.title,48,36,{width:760,lineGap:4});
        doc.font('ProjectFont').fontSize(10).fillColor('#708078').text(`${topic}  •  ${String(slide.number).padStart(2,'0')}`,50,82,{width:700});
        if(layout==='full-image' && slide.imagePath){
          drawImageCover(doc,slide.imagePath,48,110,864,340,24);
          if(slide.bullets?.length){doc.save();doc.roundedRect(70,390,820,52,18).fill('#FFFFFF').fillOpacity(0.92);doc.restore();doc.font('ProjectFont').fontSize(12).fillColor(theme.text).text(slide.bullets.slice(0,2).join('  •  '),90,408,{width:780,align:'center'});}
        } else if(layout==='cards') {
          const bullets=slide.bullets?.slice(0,4)||[]; const cols=bullets.length<=2?2:2; const gap=18, cardW=(864-gap)/cols;
          bullets.forEach((b,i)=>{const col=i%2,row=Math.floor(i/2),xx=48+col*(cardW+gap),yy=118+row*150;doc.roundedRect(xx,yy,cardW,128,22).fill(i%2?theme.light:'#FFFFFF').stroke(theme.light);doc.circle(xx+28,yy+30,10).fill(theme.primary);doc.font('ProjectFont').fontSize(15).fillColor(theme.text).text(b,xx+50,yy+22,{width:cardW-70,lineGap:4});});
          if(slide.imagePath) drawImageCover(doc,slide.imagePath,48,425,864,70,18);
        } else {
          drawBulletList(doc,slide.bullets,52,120,420,5);
          drawVisual(doc,slide,520,112,392,325,theme);
        }
        if(slide.subtitle) doc.font('ProjectFont').fontSize(11).fillColor(theme.dark).text(slide.subtitle,52,485,{width:850});
        doc.font('ProjectFont').fontSize(9).fillColor('#89958F').text('Все проекты #Ian',50,518,{width:180});
      }
    });
    doc.end(); out.on('finish',resolve); out.on('error',reject);
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

async function generateWithAI({ firstName, lastName, className, school, topic, slidesCount, extraRequirements, schoolRequirements }) {
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
Требования школы из файла: ${schoolRequirements || 'файл не загружен'}

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
  "theme":{"palette":"green|blue|purple|orange|teal","imageStyle":"...","reason":"..."},
  "presentation": [
    {
      "title":"...",
      "subtitle":"...",
      "bullets":["..."],
      "visualType":"image|bar|table|process|quote|formula|none",
      "visualTitle":"...",
      "visualData":[],
      "imagePrompt":"Короткий конкретный промпт для тематической иллюстрации без текста",
      "layout":"cover|split|cards|full-image",
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
- ровно ${slidesCount} содержательных слайдов;
- не оставляй пустых слайдов и не используй заглушки;
- 1-й слайд: тема, ученик/класс при необходимости;
- далее: актуальность, цель, задачи, теория, методы, практическая часть, результат, продукт, выводы, источники — адаптируй к теме;
- не пиши "на слайде будет изображение", "можно добавить график", "здесь будет..." и подобные описания;
- bullets должны быть готовыми короткими тезисами;
- если нужен график, используй visualType=bar и visualData как массив объектов {"label":"...","value":число};
- если нужна таблица, visualType=table и visualData как массив строк-массивов;
- если нужен процесс, visualType=process и visualData как массив коротких шагов;
- для большинства содержательных слайдов используй visualType=image и imagePrompt;
- imagePrompt должен описывать конкретную тематическую сцену, предмет, эксперимент или инфографический объект без текста;
- выбирай layout так, чтобы не оставалось больших пустых областей;
- theme должен подходить к теме проекта и задавать палитру и стиль иллюстраций;
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
    fontConfigured: fs.existsSync(fontPath),
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
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
    const schoolRequirements = clean(req.body.schoolRequirements);
    const schoolRequirementsName = clean(req.body.schoolRequirementsName);

    if (!topic) return res.status(400).json({ error: 'Введите тему проекта.' });
    if (!fs.existsSync(fontPath)) {
      return res.status(500).json({ error: 'На сервере отсутствует шрифт assets/DejaVuSans.ttf.' });
    }

    const schoolRequirementsText = await extractSchoolRequirements(schoolRequirements, schoolRequirementsName);

    const raw = await generateWithAI({
      firstName, lastName, className, school, topic,
      slidesCount, extraRequirements, schoolRequirements: schoolRequirementsText
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

    await generateSlideImages(project.presentation, topic, dir, project.theme || {});

    await renderPresentationPdf(
      project.presentation,
      topic,
      presentationPath,
      project.theme || {}
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
