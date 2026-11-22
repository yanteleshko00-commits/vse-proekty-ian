/**
 * School curriculum routing, not a database of proprietary textbooks.
 * The specific textbook page or problem text remains the source of truth.
 */
export const MATH_KINDS = ['auto', 'algebra', 'geometry', 'probability', 'statistics'];
export const MATH_LEVELS = ['basic', 'advanced'];

export function inferMathKind(problem, requested = 'auto') {
  if (MATH_KINDS.includes(requested) && requested !== 'auto') return requested;
  const input = String(problem || '').toLowerCase();
  if (/вероятност|случайн\w*\s*(?:событ|опыт|величин)|испытани|бернулл|комбинатор|перестанов|сочетани|размещени|подброс|монет|игральн|кубик|вынут\w*\s*шар|дерево\s*событ|байес|независим\w*\s*событ/.test(input)) return 'probability';
  if (/треугольник|треугольник[аеуом]*|окружност|радиус|диаметр|прямоугольник|угол|геометр|ромб|трапец|параллелограмм|многоугольник|биссектрис|стереометр|призм|пирамид|сфер|цилиндр|конус|подобие|касательн/.test(input)) return 'geometry';
  if (/статистик|медиан|средн\w*\s*арифмет|дисперси|стандартн\w*\s*отклонен|среднеквадратич|размах|мод[ауые]\s*(?:наблюден|выборк|ряд|числ|данн)|выборк|гистограмм|столбчат\w*\s*диаграмм|частот\w*\s*(?:таблиц|ряд|распределен)|квартил|корреляци/.test(input)) return 'statistics';
  return 'algebra';
}

const gradeThemes = {
  elementary: '5–6 классы: натуральные числа, дроби, десятичные дроби, проценты, пропорции, простые уравнения, геометрические измерения, таблицы и диаграммы.',
  middle: '7–9 классы: выражения, уравнения, функции и графики, планиметрия; вероятности равновозможных исходов, деревья и графы, описательная статистика, группировка данных, комбинаторный перебор.',
  senior: '10–11 классы: функции, тригонометрия, начала анализа, стереометрия; условная вероятность, независимость, дерево вероятностей, испытания Бернулли, случайные величины, распределения, математическое ожидание, дисперсия и стандартное отклонение.'
};
const topicDescriptions = {
  algebra: 'Алгебра: арифметика, дроби, проценты, выражения, степени, корни, уравнения и системы, неравенства, функции, графики, последовательности, тригонометрия и начала анализа — по заданному классу.',
  geometry: 'Геометрия: планиметрия, равенство и подобие фигур, теорема Пифагора, окружность, площади, координаты, векторы, стереометрия. Соблюдай обозначения, разделы «Дано», «Найти», «Решение», «Ответ», обосновывай свойства.',
  probability: 'Вероятность: исходы и события, равновозможные исходы, классическая вероятность, дополнение, объединение событий, условная вероятность и независимость, дерево событий, комбинаторика (перестановки, размещения, сочетания), испытания Бернулли, биномиальная модель, полная вероятность и формула Байеса по уровню. Обязательно укажи пространство исходов и учти выбор с возвращением или без.',
  statistics: 'Статистика: диаграммы и таблицы, абсолютная и относительная частота, среднее, медиана, мода, размах, квартили (обозначь соглашение), выборка, дисперсия, стандартное отклонение, распределения, математическое ожидание. Отличай дисперсию ряда с делением на n от исправленной выборочной дисперсии с делением на n−1.'
};

export function mathStudyGuide({grade = 8, level = 'basic', kind = 'algebra', textbook = ''} = {}) {
  const g = Number.isInteger(grade) && grade >= 5 && grade <= 11 ? grade : 8;
  const studyLevel = MATH_LEVELS.includes(level) ? level : 'basic';
  const type = topicDescriptions[kind] ? kind : 'algebra';
  const reference = String(textbook || '').trim().slice(0, 220);
  return [
    'Класс: ' + g + '; уровень: ' + (studyLevel === 'advanced' ? 'углублённый' : 'базовый') + '.',
    g <= 6 ? gradeThemes.elementary : g <= 9 ? gradeThemes.middle : gradeThemes.senior,
    topicDescriptions[type],
    'При темах за пределами выбранного класса не отказывайся от решения: объясни необходимые новые понятия.',
    'Сохраняй точные дроби и корни до округления, приближения обозначай ≈.',
    'Вероятности лежат от 0 до 1; у полного распределения сумма вероятностей равна 1. Для статистики сначала сортируй ряд, называй n и используемое соглашение дисперсии.',
    'Если есть прикреплённый текст учебника, следуй ему, а не выдумывай задачу по ссылке на учебник.',
    reference ? 'Указанный учебник или номер: «' + reference + '». Это справочная информация. Без самого условия или вложенной страницы не выдумывай содержание.' : 'Конкретный учебник не указан: используй школьные определения и понятное оформление.'
  ].join('\n');
}

export function calculateBasicStatistics(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 100 || !values.every(Number.isFinite)) throw new Error('Некорректный ряд данных');
  const sorted = [...values].sort((a,b)=>a-b);
  const n = sorted.length;
  const mean = sorted.reduce((s,v)=>s+v,0)/n;
  const median = n%2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2;
  const counts = new Map();
  for (const v of sorted) counts.set(v,(counts.get(v)||0)+1);
  const maxFreq = Math.max(...counts.values());
  const modes = maxFreq === 1 ? [] : [...counts].filter(([,f])=>f===maxFreq).map(([v])=>v);
  const variance = sorted.reduce((s,v)=>s+(v-mean)**2,0)/n;
  return {n,mean,median,modes,min:sorted[0],max:sorted[n-1],range:sorted[n-1]-sorted[0],variance,standardDeviation:Math.sqrt(variance)};
}

// Only clearly delimited numeric data: avoid guessing from paragraph numbers or decimal commas.
export function datasetHint(problem) {
  const m=String(problem||'').match(/(?:данные|значения|выборка|числа)\s*:\s*([-+]?\d+(?:\.\d+)?(?:\s*[,;]\s*[-+]?\d+(?:\.\d+)?){2,49})(?=\s|[.!?]|$)/i);
  if (!m) return '';
  const nums = m[1].split(/\s*[,;]\s*/).map(Number);
  if (nums.length > 50 || nums.some(v=>!Number.isFinite(v))) return '';
  const s=calculateBasicStatistics(nums),fmt=n=>Number(n.toPrecision(12)).toString();
  return 'Контрольные вычисления для явно заданного набора: n='+s.n+'; среднее='+fmt(s.mean)+'; медиана='+fmt(s.median)
    +'; мода='+(s.modes.length?s.modes.join(', '):'нет повторяющегося значения')+'; размах='+fmt(s.range)
    +'; дисперсия (деление на n)='+fmt(s.variance)+'; стандартное отклонение='+fmt(s.standardDeviation)
    +'. Используй эти значения для самопроверки, но покажи пользователю решение по шагам.';
}
