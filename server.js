import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
const publicDir = path.join(__dirname, 'public');
const fontPath = path.join(__dirname, 'assets', 'DejaVuSans.ttf');
const outputRoot = path.join(__dirname, '.generated');

await fs.mkdir(outputRoot, { recursive: true });

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
if (!client) console.warn('OPENAI_API_KEY не задан. ИИ-генерация недоступна.');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

function clean(value, max = 20000) {
  return String(value ?? '').trim().slice(0, max);
}

function safeJson(text) {
  const raw = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  throw new Error('ИИ вернул некорректный формат проекта.');
}

function normalizeProject(p, slides) {
  const presentation = Array.isArray(p.presentation) ? p.presentation : [];
  while (presentation.length < slides) presentation.push({ title: `Слайд ${presentation.length + 1}`, bullets: [], speakerNotes: '' });
  return {
    writtenProject: typeof p.writtenProject === 'string' ? p.writtenProject : JSON.stringify(p.writtenProject ?? '', null, 2),
    product: typeof p.product === 'string' ? p.product : JSON.stringify(p.product ?? '', null, 2),
    presentation: presentation.slice(0, slides).map((s, i) => ({
      title: clean(s?.title || `Слайд ${i + 1}`, 300),
      bullets: Array.isArray(s?.bullets) ? s.bullets.map(x => clean(x, 1000)).filter(Boolean).slice(0, 8) : [],
      speakerNotes: clean(s?.speakerNotes || '', 3000)
    })),
    defense: typeof p.defense === 'string' ? p.defense : JSON.stringify(p.defense ?? '', null, 2),
    sources: Array.isArray(p.sources) ? p.sources.map(x => typeof x === 'string' ? x : JSON.stringify(x)).filter(Boolean) : []
  };
}

function makePdfBuffer(title, sections) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 55, bottom: 55, left: 55, right: 55 }, autoFirstPage: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    if (fontExists()) doc.font(fontPath);
    doc.fontSize(22).text(title, { align: 'center' });
    doc.moveDown(1.2);
    for (const section of sections) {
      if (section.heading) {
        doc.fontSize(15).text(section.heading, { paragraphGap: 6 });
        doc.moveDown(0.2);
      }
      doc.fontSize(11.5).text(String(section.text ?? ''), { align: 'left', lineGap: 4, paragraphGap: 8 });
      doc.moveDown(0.4);
    }
    doc.end();
  });
}

function fontExists() {
  return true;
}

async function makeDocxBuffer(d, p) {
  const children = [];
  children.push(new Paragraph({ text: 'ИНДИВИДУАЛЬНЫЙ ИТОГОВЫЙ ПРОЕКТ', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
  children.push(new Paragraph({ text: `Тема: «${d.topic}»`, alignment: AlignmentType.CENTER }));
  children.push(new Paragraph({ text: `Автор: ${d.firstName} ${d.lastName}` }));
  children.push(new Paragraph({ text: `Класс: ${d.className || '—'}` }));
  children.push(new Paragraph({ text: `Школа: ${d.school || '—'}` }));
  children.push(new Paragraph({ text: '' }));
  const lines = p.writtenProject.split(/\n+/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) { children.push(new Paragraph({ text: '' })); continue; }
    const upper = t.toUpperCase();
    const heading = /^(ВВЕДЕНИЕ|ГЛАВА|ЗАКЛЮЧЕНИЕ|СПИСОК|СОДЕРЖАНИЕ|ПРАКТИЧЕСКАЯ ЧАСТЬ|ТЕОРЕТИЧЕСКАЯ ЧАСТЬ)/.test(upper);
    children.push(new Paragraph({
      children: [new TextRun({ text: t, bold: heading })],
      spacing: { after: 180 }
    }));
  }
  children.push(new Paragraph({ text: 'Источники', heading: HeadingLevel.HEADING_1 }));
  for (const s of p.sources) children.push(new Paragraph({ text: s, bullet: { level: 0 } }));
  return Packer.toBuffer(new Document({ sections: [{ properties: {}, children }] }));
}

async function makeZip(files) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', c => chunks.push(c));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    for (const f of files) archive.append(f.buffer, { name: f.name });
    archive.finalize();
  });
}

function presentationPdfSections(p) {
  return p.presentation.flatMap((s, i) => [
    { heading: `СЛАЙД ${i + 1}. ${s.title}`, text: s.bullets.length ? s.bullets.map(b => `• ${b}`).join('\n') : 'Основное содержание слайда.' },
    { heading: 'Текст выступления', text: s.speakerNotes || '—' }
  ]);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(client), model }));

app.post('/api/generate-project', async (req, res) => {
  try {
    if (!client) return res.status(503).json({ error: 'OpenAI API не настроен. Добавьте OPENAI_API_KEY в .env на сервере.' });
    const firstName = clean(req.body?.firstName, 100);
    const lastName = clean(req.body?.lastName, 100);
    const className = clean(req.body?.className, 30);
    const school = clean(req.body?.school, 300);
    const topic = clean(req.body?.topic, 500);
    const slides = Math.max(1, Math.min(30, Number(req.body?.slides) || 12));
    const extraRequirements = clean(req.body?.extraRequirements, 5000);
    if (!topic) return res.status(400).json({ error: 'Укажите тему проекта.' });

    const prompt = `Ты создаёшь школьный индивидуальный проект на русском языке.\n\nДанные ученика:\nИмя: ${firstName}\nФамилия: ${lastName}\nКласс: ${className}\nШкола: ${school}\nТема: ${topic}\nКоличество слайдов: ${slides}\nДополнительные требования: ${extraRequirements || 'нет'}\n\nВерни ТОЛЬКО JSON без markdown со свойствами: writtenProject, product, presentation, defense, sources.\nwrittenProject — содержательный текст проекта с введением, актуальностью, целью, задачами, проблемой/объектом/предметом/гипотезой когда уместно, теорией, практикой, заключением. Не выдумывай проведённые измерения, опросы или результаты.\nproduct — конкретный проектный продукт и его готовое содержание.\npresentation — массив ровно из ${slides} объектов {title, bullets, speakerNotes}.\ndefense — связный текст защиты, согласованный с презентацией.\nsources — массив источников. Не выдумывай точные URL: если не уверен, укажи название источника и пометку «ссылку проверить».\nУчитывай российскую школьную практику, но не заявляй 100% соответствие требованиям конкретной школы или ФГОС.\nКлючевое требование: текст проекта, презентация, продукт и защита должны быть согласованы между собой.`;

    const response = await client.responses.create({
      model,
      input: [{ role: 'user', content: prompt }]
    });
    const project = normalizeProject(safeJson(response.output_text), slides);

    const data = { firstName, lastName, className, school, topic, slides };
    const docx = await makeDocxBuffer(data, project);
    const presentationPdf = await makePdfBuffer(`Презентация проекта: ${topic}`, presentationPdfSections(project));
    const defensePdf = await makePdfBuffer(`Текст защиты: ${topic}`, [{ heading: 'Выступление', text: project.defense }]);
    const bookletPdf = await makePdfBuffer(`Проектный продукт: ${topic}`, [{ heading: 'Готовый продукт', text: project.product }]);

    const files = [
      { name: 'Индивидуальный_проект.docx', buffer: docx, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { name: 'Презентация_проекта.pdf', buffer: presentationPdf, mime: 'application/pdf' },
      { name: 'Текст_защиты.pdf', buffer: defensePdf, mime: 'application/pdf' },
      { name: 'Буклет.pdf', buffer: bookletPdf, mime: 'application/pdf' }
    ];
    const zip = await makeZip(files);
    files.push({ name: 'Весь_проект.zip', buffer: zip, mime: 'application/zip' });

    const filePayload = Object.fromEntries(files.map(f => [f.name, { mime: f.mime, base64: f.buffer.toString('base64') }]));
    res.json({ ok: true, project, files: filePayload, model });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error?.message || 'Ошибка при создании проекта.' });
  }
});

app.use((_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.listen(port, '0.0.0.0', () => console.log(`Все проекты #Ian: http://localhost:${port}`));
