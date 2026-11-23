import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { appendProductSlide } from '../presentation-design.js';
import { createPptxBuffer, createPresentationPdfBuffer, preparePhotosForDeck } from '../server.js';

test('a seven-slide deck builds real PowerPoint and PDF with correct counts and photo geometry', async () => {
  const photo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: '#348090' }
  }).png().toBuffer();
  const plan = {
    title: 'Как работает солнечная энергия',
    summary: 'Энергия Солнца в жизни людей',
    theme: {
      bg: '10172A', surface: '1D2940', ink: 'F3F7FF',
      muted: 'B8C4DA', accent: '6D5DFB', accent2: '28D7C5'
    },
    sources: [],
    slides: [
      { type: 'cover', title: 'Солнечная энергия', subtitle: 'Как работают солнечные панели', imageBytes: photo, imageMime: 'image/png' },
      { type: 'cards', title: 'Что делает фотомодуль', cards: [{ title: 'Свет', text: 'Фотоны попадают на кремний.' }, { title: 'Ток', text: 'Создаётся электрический ток.' }], imageBytes: photo, imageMime: 'image/png' },
      { type: 'comparison', title: 'Сравнение способов', leftTitle: 'Солнечные панели', rightTitle: 'Тепловая станция', leftItems: ['Без сжигания топлива', 'Нужен солнечный свет'], rightItems: ['Использует топливо', 'Работает ночью'], imageBytes: photo, imageMime: 'image/png' },
      { type: 'process', title: 'Свет становится электричеством', steps: ['Солнечный свет', 'Солнечная панель', 'Инвертор', 'Электричество'], imageBytes: photo, imageMime: 'image/png' },
      { type: 'table', title: 'Плюсы и ограничения', table: [['Фактор', 'Сильная сторона'], ['Экология', 'Меньше выбросов'], ['Время', 'Ночью нужна батарея']], imageBytes: photo, imageMime: 'image/png' },
      { type: 'image', title: 'Панели на крыше школы', body: 'Рассматриваем простую схему размещения.', bullets: ['Безопасность', 'Выбор места'], imageBytes: photo, imageMime: 'image/png' }
    ]
  };
  appendProductSlide(plan, { title: 'Памятка', format: 'Чек-лист', takeaway: 'Экономьте электроэнергию', checklist: ['Выключайте свет'], imageBytes: photo }, 7);
  await preparePhotosForDeck(plan);
  for (const [i, slide] of plan.slides.entries()) {
    assert.equal(slide.imageMime, 'image/jpeg');
    const metadata = await sharp(slide.imageBytes).metadata();
    if (i === 0) assert.ok(Math.abs(metadata.width / metadata.height - 16 / 9) < 0.01);
    if (i === 1) assert.ok(metadata.height > metadata.width);
  }
  const pptx = await createPptxBuffer(plan);
  assert.ok(pptx.length > 20000);
  const dir = await mkdtemp(join(tmpdir(), 'nexora-slides-test-'));
  try {
    const pptxFile = join(dir, 'test.pptx');
    await writeFile(pptxFile, pptx);
    const entries = execFileSync('unzip', ['-Z1', pptxFile], { encoding: 'utf8' }).trim().split('\n');
    assert.equal(entries.filter(line => /^ppt\/slides\/slide\d+\.xml$/.test(line)).length, 7);
  } finally { await rm(dir, { recursive: true, force: true }); }
  const pdf = await createPresentationPdfBuffer(plan);
  assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 7);
});
