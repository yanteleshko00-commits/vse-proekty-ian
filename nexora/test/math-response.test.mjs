import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMathResponse } from '../math-response.js';

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
