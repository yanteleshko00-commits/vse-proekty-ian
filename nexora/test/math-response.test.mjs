import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMathResponse } from '../math-response.js';
import { inferMathKind, mathStudyGuide, calculateBasicStatistics, datasetHint } from '../math-curriculum.js';

test('accepts structured algebra solution without JSON', () => {
  const raw = [
    'ТИП: algebra',
    'НАЗВАНИЕ: Квадратное уравнение',
    'ДАНО: x² − 4x + 3 = 0',
    'НАЙТИ: x',
    'РЕШЕНИЕ:',
    '1. Разложим на множители.',
    'ФОРМУЛА: (x − 1)(x − 3) = 0',
    '2. Запишем корни.',
    'ФОРМУЛА: x₁ = 1; x₂ = 3',
    'ОТВЕТ: 1; 3',
    'ПРОВЕРКА: Оба корня подходят.'
  ].join('\n');
  const x = parseMathResponse(raw, 'algebra', 'x² − 4x + 3 = 0');
  assert.equal(x.answer, '1; 3');
  assert.equal(x.steps.length, 2);
  assert.equal(x.steps[0].formula, '(x − 1)(x − 3) = 0');
  assert.equal(x.kind, 'algebra');
});
test('parses geometry with diagram and given/find', () => {
  const raw = [
    'ТИП: geometry',
    'НАЗВАНИЕ: Теорема Пифагора',
    'ДАНО:',
    '- ∠A = 90°',
    '- AB = 6 см',
    '- AC = 8 см',
    'НАЙТИ: BC',
    'РЕШЕНИЕ:',
    '1. Применим теорему Пифагора.',
    'ФОРМУЛА: BC² = AB² + AC²',
    '2. Вычислим гипотенузу.',
    'ФОРМУЛА: BC = 10 см',
    'ОТВЕТ: BC = 10 см',
    'ЧЕРТЁЖ: right_triangle'
  ].join('\n');
  const x = parseMathResponse(raw, 'geometry', 'В прямоугольном треугольнике ABC AB = 6 см, AC = 8 см.');
  assert.equal(x.diagram.kind, 'right_triangle');
  assert.deepEqual(x.diagram.labels, ['A', 'B', 'C']);
  assert.equal(x.given.length, 3);
  assert.equal(x.find[0], 'BC');
});
test('preserves valid JSON responses from older provider models', () => {
  const x = parseMathResponse('{"kind":"algebra","answer":"x=2","steps":[{"title":"Шаг 1","text":"2x=4","formula":"x=2"}]}');
  assert.equal(x.answer, 'x=2');
});
test('does not silently invent an answer for malformed output', () => {
  assert.throws(() => parseMathResponse('{"answer":"x=2","steps":[{"bad": ]}'), /unstructured_ai_response/);
});
test('asks a question when problem is under-specified', () => {
  const x = parseMathResponse('УТОЧНЕНИЕ: Какова длина стороны AB?', 'geometry');
  assert.equal(x.needs_clarification, true);
  assert.equal(x.answer, '');
});

test('routes basic textbook probability tasks', () => {
  assert.equal(inferMathKind('Игральную кость бросили дважды. Найдите вероятность двух шестёрок.'), 'probability');
  assert.equal(inferMathKind('Найдите медиану треугольника ABC'), 'geometry');
  assert.equal(inferMathKind('Даны значения: 2, 3, 3, 5, 7. Найдите медиану и размах.'), 'statistics');
});
test('parses probability with required steps and answer', () => {
  const solution = parseMathResponse([
    'ТИП: probability', 'НАЗВАНИЕ: Вероятность красного шара',
    'ДАНО:', '- 5 красных шаров', '- 3 синих шара',
    'НАЙТИ: P(красный)', 'РЕШЕНИЕ:',
    '1. Всего 8 равновозможных исходов.',
    'ФОРМУЛА: n = 5 + 3 = 8',
    '2. Вычислим вероятность.',
    'ФОРМУЛА: P = 5 / 8 = 0,625',
    'ОТВЕТ: 5/8 = 0,625'
  ].join('\n'), 'probability', 'В коробке 5 красных и 3 синих шара.');
  assert.equal(solution.kind,'probability');
  assert.equal(solution.answer,'5/8 = 0,625');
  assert.equal(solution.steps.length,2);
  assert.equal(solution.diagram.kind,'none');
});
test('parses statistics solution, including data and variance', () => {
  const solution = parseMathResponse([
    'ТИП: statistics', 'НАЗВАНИЕ: Характеристики ряда',
    'ДАНО: 2, 3, 3, 5, 7', 'НАЙТИ: среднее и дисперсию',
    'РЕШЕНИЕ:', '1. Число элементов n = 5.',
    'ФОРМУЛА: n = 5', '2. Вычислим среднее.',
    'ФОРМУЛА: (2+3+3+5+7)/5 = 4',
    '3. Дисперсия ряда.',
    'ФОРМУЛА: (4+1+1+1+9)/5 = 3,2',
    'ОТВЕТ: среднее 4, дисперсия 3,2'
  ].join('\n'), 'statistics');
  assert.equal(solution.kind,'statistics');
  assert.equal(solution.steps.length,3);
  assert.equal(solution.given[0],'2, 3, 3, 5, 7');
});
test('computes descriptive statistics independently and distinguishes sample variance', () => {
  const x=calculateBasicStatistics([2,3,3,5,7]);
  assert.equal(x.n,5);
  assert.equal(x.mean,4);
  assert.equal(x.median,3);
  assert.deepEqual(x.modes,[3]);
  assert.equal(x.range,5);
  assert.equal(x.variance,3.2);
  assert.match(datasetHint('Данные: 2, 3, 3, 5, 7. Найдите характеристики.'), /дисперсия \(деление на n\)=3.2/);
  assert.equal(datasetHint('В книге №37 найдите среднее 1, 2, 3.'),'');
});
test('describes advanced classes without inventing a textbook exercise', () => {
  const guide=mathStudyGuide({grade:11,level:'advanced',kind:'probability',textbook:'Автор, номер 59'});
  assert.match(guide,/углублённый/);
  assert.match(guide,/Байеса/);
  assert.match(guide,/не выдумывай/);
});
