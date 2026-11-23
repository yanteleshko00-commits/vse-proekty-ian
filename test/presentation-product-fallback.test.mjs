import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderProductImageFallback } from '../server.js';

test('locally designed product generates a readable-size PNG in light and dark themes', async () => {
  const product = {
    format: 'Мини-гайд', title: 'Как использовать солнечную энергию дома',
    subtitle: 'Простой план оценки расходов и экономии электроэнергии',
    audience: 'Для учащихся 9 класса',
    sections: [
      { heading: 'Как работает система', body: 'Фотогальванические панели преобразуют энергию света в электрический ток. Инвертор делает этот ток пригодным для приборов.' },
      { heading: 'Откуда берётся экономия', body: 'Днём панели могут покрывать часть потребления. Реальная экономия зависит от погоды, места установки и тарифов.' },
      { heading: 'Как проверить результат', body: 'Сравните дневную выработку, потребление приборов и стоимость электроэнергии. Записывайте условия расчёта.' }
    ],
    steps: [
      'Запишите потребление основных приборов в киловатт-часах.',
      'Оцените доступную дневную выработку солнечной панели.',
      'Сравните потребление и выработку без выдуманных показателей.'
    ],
    checklist: [
      'Указаны мощность панели и длительность освещения.',
      'Проверены единицы измерения и формулы.',
      'Учтено, что ночью панели электричество не производят.'
    ],
    takeaway: 'Солнечные панели могут снизить расход электроэнергии из сети, но результат зависит от условий установки.'
  };
  for (const theme of [
    { bg: 'F4F7FB', surface: 'FFFFFF', ink: '18243A', muted: '67758A', accent: '315EDB', accent2: 'AFC5FF' },
    { bg: '10172A', surface: '1D2940', ink: 'F3F7FF', muted: 'B8C4DA', accent: '6D5DFB', accent2: '28D7C5' }
  ]) {
    const data = await renderProductImageFallback(product, theme);
    assert.ok(data.length > 18000);
    const meta = await sharp(data).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 1240);
    assert.equal(meta.height, 1754);
  }
});
