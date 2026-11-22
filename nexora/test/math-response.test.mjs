import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMathResponse } from '../math-response.js';
import { explainDecimalFraction, explainNestedFraction, fractionHelpForProblem, appendFractionWorking } from '../math-fractions.js';
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
  assert.equal(inferMathKind('Игральную кость бросили дважды. Найдите вероятность двух шестёрок.'), 'probability_statistics');
  assert.equal(inferMathKind('Найдите медиану треугольника ABC'), 'geometry');
  assert.equal(inferMathKind('Даны значения: 2, 3, 3, 5, 7. Найдите медиану и размах.'), 'probability_statistics');
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
  assert.equal(solution.kind,'probability_statistics');
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
  assert.equal(solution.kind,'probability_statistics');
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
  const guide=mathStudyGuide({grade:11,level:'advanced',kind:'probability_statistics',textbook:'Автор, номер 59'});
  assert.match(guide,/углублённый/);
  assert.match(guide,/Вероятность и статистика/);
  assert.match(guide,/не выдумывай/);
});

test('recognizes one official school subject and correctly routes both subtopics', () => {
  assert.equal(inferMathKind('Найдите среднее арифметическое 1, 2, 3'), 'probability_statistics');
  assert.equal(inferMathKind('Определите вероятность события'), 'probability_statistics');
  assert.equal(inferMathKind('', 'statistics'), 'probability_statistics');
  assert.equal(inferMathKind('', 'probability'), 'probability_statistics');
});
test('parses complete probability formula: symbols, substitution and calculations', () => {
  const text = [
    'ТИП: probability_statistics',
    'ДАНО: 5 красных и 3 синих шара.',
    'НАЙТИ: P(A)',
    'РЕШЕНИЕ:',
    '1. Исходы равновозможны, применим классическое определение.',
    'ФОРМУЛА: P(A) = m / n',
    'ОБОЗНАЧЕНИЯ: m — благоприятные исходы; n — все равновозможные исходы.',
    'ПОДСТАНОВКА: P(A) = 5 / (5 + 3)',
    'ВЫЧИСЛЕНИЕ: P(A) = 5 / 8 = 0,625',
    'ОТВЕТ: 5/8'
  ].join('\n');
  const x = parseMathResponse(text, 'probability_statistics');
  assert.equal(x.kind,'probability_statistics');
  assert.equal(x.steps[0].formula,'P(A) = m / n');
  assert.match(x.steps[0].symbols,/благоприятные/);
  assert.match(x.steps[0].substitution,/5 \/ \(5 \+ 3\)/);
  assert.match(x.steps[0].calculation,/0,625/);
});
test('uses verifiable curriculum URL rather than imaginary textbook pages', () => {
  const guide=mathStudyGuide({grade:8,level:'basic',kind:'probability_statistics',textbook:'Ященко, №27'});
  assert.match(guide,/edsoo\.ru/);
  assert.match(guide,/media\.prosv\.ru/);
  assert.match(guide,/не выдумывай/);
  assert.match(guide,/подстановку/);
});

test('5/8 uses multiplier 125 in both numerator and denominator', () => {
  const x=explainDecimalFraction(5,8);
  assert.equal(x.factor,125);
  assert.equal(x.base,1000);
  assert.equal(x.decimal,'0,625');
  assert.equal(x.step.substitution,'5/8 = (5 × 125)/(8 × 125)');
  assert.equal(x.step.calculation,'625/1000 = 0,625');
});
test('fraction multiplier depends on denominator and reductions', () => {
  const x=explainDecimalFraction(3,40);
  assert.equal(x.factor,25);
  assert.equal(x.step.calculation,'75/1000 = 0,075');
  assert.equal(explainDecimalFraction(6,8).decimal,'0,75');
  assert.equal(explainDecimalFraction(1,3).terminates,false);
  assert.equal(explainDecimalFraction(1,0),null);
});
test('nested fraction uses reciprocal and reduces exactly', () => {
  const x=explainNestedFraction(1,2,3,4);
  assert.equal(x.value,'2/3');
  assert.match(x.step.substitution,/\(4\/3\)/);
  assert.match(x.step.calculation,/4\/6 = 2\/3/);
  assert.match(fractionHelpForProblem('Вычислите (1/2)/(3/4)'),/умножения на обратную/);
});
test('append exact fraction expansion to AI answer without duplicating one it already gave',()=>{
  const x={answer:'P(A) = 5/8',steps:[{text:'Пять подходящих исходов из восьми равновозможных.'}]};
  appendFractionWorking(x);
  assert.equal(x.steps.length,2);
  assert.match(x.steps[1].substitution,/5 × 125/);
  assert.equal(x.steps[1].calculation,'625/1000 = 0,625');
  appendFractionWorking(x);
  assert.equal(x.steps.length,2);
});

test('adds 5/8 x 125 expansion even when final AI answer only says 0,625',()=>{
  const x={answer:'0,625',steps:[{text:'Вычисляем вероятность.',formula:'P(A)=m/n',substitution:'P(A)=5/8',calculation:'P(A)=0,625'}]};
  appendFractionWorking(x);
  assert.equal(x.steps.length,2);
  assert.equal(x.steps[1].calculation,'625/1000 = 0,625');
});
test('does not add fraction conversion for intermediate unrelated fractions',()=>{
  const x={answer:'1',steps:[{formula:'1/2 + 1/2 = 1'}]};
  appendFractionWorking(x);
  assert.equal(x.steps.length,1);
});
