// Normalize inconsistent chat-model output without executing model-provided content.
const sections = /^(?:#{1,5}\s*)?(?:\*{1,2}|__)?\s*(ТИП|НАЗВАНИЕ|ДАНО|НАЙТИ|УСЛОВИЕ|РЕШЕНИЕ|ОТВЕТ|ПРОВЕРКА|ЧЕРТ[ЕЁ]Ж|ПРИМЕЧАНИЕ|УТОЧНЕНИЕ)\s*(?:\*{1,2}|__)?\s*(?:[:：–—-]\s*(.*))?$/i;
const trimLine = v => String(v || '').replace(/^\s*(?:[-•]\s*)/, '').replace(/^\s*\*\*(.*?)\*\*\s*$/, '$1').trim();
const text = v => typeof v === 'string' ? v : '';
const max = (v, size) => text(v).trim().slice(0, size);

function readTextSections(content) {
  const raw = text(content).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').replace(/^\s*\x60{3}[^\n]*\n?/gm, '').replace(/\r/g, '').slice(0, 26000);
  const result = Object.create(null);
  let current = '';
  for (const candidate of raw.split('\n')) {
    const line = candidate.trim();
    if (!line) continue;
    const plain = line.replace(/^#{1,5}\s*/, '').replace(/\*\*/g, '').replace(/__/g, '');
    const m = plain.match(sections);
    if (m) {
      current = m[1].toUpperCase().replace('Ё', 'Е');
      result[current] ||= [];
      if (m[2]?.trim()) result[current].push(m[2].trim());
      continue;
    }
    if (!current) continue;
    result[current].push(line);
  }
  return result;
}
function listItems(lines, limit = 10) {
  return (lines || []).slice(0, limit).map(trimLine).filter(Boolean).map(x => x.slice(0, 500));
}
function stepItems(lines) {
  const items = [];
  let current = null;
  const start = () => {
    if (items.length >= 12) return null;
    current = { title: 'Шаг ' + (items.length + 1), text: '', formula: '' };
    items.push(current);
    return current;
  };
  for (const src of (lines || []).slice(0, 60)) {
    const line = trimLine(src);
    if (!line) continue;
    const number = line.match(/^(?:(?:шаг)\s*)?(\d{1,2})[.)]\s*(.*)$/i);
    const formula = line.match(/^(?:формула|вычисление|преобразование)\s*[:：]\s*(.+)$/i);
    if (number) {
      if (items.length >= 12) break;
      start();
      if (number[2]) current.text = max(number[2], 1200);
      continue;
    }
    if (!current) start();
    if (!current) break;
    if (formula) {
      current.formula = [current.formula, formula[1]].filter(Boolean).join('\n').slice(0, 440);
    } else if ((line.includes('=') || line.includes('√') || line.includes('∠')) && !/[.!?]\s/.test(line) && line.length <= 180 && !current.formula) {
      current.formula = line.slice(0, 440);
    } else {
      current.text = [current.text, line].filter(Boolean).join('\n').slice(0, 1200);
    }
  }
  return items.filter(x => x.text || x.formula);
}
function guessGeometryKind(problem, lines) {
  const token = (lines || []).join(' ').toLowerCase().replace(/\s/g, '');
  if (/right_triangle|прямоугольн.*треугольник|прямоугольныйтреугольник/.test(token)) return 'right_triangle';
  if (/rectangle|прямоугольник|квадрат/.test(token)) return 'rectangle';
  if (/circle|окружност|круг|радиус/.test(token)) return 'circle';
  if (/triangle|треугольник/.test(token)) return 'triangle';
  if (/coordinate|координат/.test(token)) return 'coordinate';
  const q = problem.toLowerCase();
  if (/прямоугольн[а-я]*\s+треугольник/.test(q)) return 'right_triangle';
  if (/прямоугольник|квадрат/.test(q)) return 'rectangle';
  if (/окружност|круг|радиус/.test(q)) return 'circle';
  if (/треугольник/.test(q)) return 'triangle';
  return 'none';
}
function geometryLabels(problem, kind) {
  const p = kind === 'rectangle'
    ? problem.match(/(?:прямоугольник|квадрат)\s+([A-Za-zА-Яа-я]{4})\b/i)
    : problem.match(/треугольник\s+([A-Za-zА-Яа-я]{3})\b/i);
  return p ? p[1].toUpperCase().split('') : [];
}
export function parseMathResponse(raw, hint = 'other', problem = '') {
  if (!text(raw).trim()) throw new Error('empty_ai_response');
  let obj = null;
  const clean = text(raw).trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/, '');
  try { obj = JSON.parse(clean); } catch {}
  if (!obj && clean.startsWith('{')) {
    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace > 0) try { obj = JSON.parse(clean.slice(0, lastBrace + 1)); } catch {}
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
  const parts = readTextSections(clean);
  const kindLine = (parts['ТИП'] || []).join(' ').toLowerCase();
  const kind = kindLine.includes('geometry') || kindLine.includes('геометр') ? 'geometry'
    : kindLine.includes('algebra') || kindLine.includes('алгебр') ? 'algebra'
    : hint === 'geometry' || (hint === 'auto' && /треугольник|прямоугольник|окружност|радиус|площадь|угол/i.test(problem)) ? 'geometry'
    : hint === 'algebra' ? 'algebra' : 'other';
  const answer = max((parts['ОТВЕТ'] || []).join(' '), 600);
  const steps = stepItems(parts['РЕШЕНИЕ']);
  const clarification = max((parts['УТОЧНЕНИЕ'] || []).join(' '), 600);
  if (!answer && !clarification) throw new Error('unstructured_ai_response');
  if (answer && !steps.length) throw new Error('incomplete_ai_solution');
  const diagramKind = kind === 'geometry' ? guessGeometryKind(problem, parts['ЧЕРТЕЖ']) : 'none';
  return {
    kind, title: max((parts['НАЗВАНИЕ'] || []).join(' '), 120) || (kind === 'geometry' ? 'Геометрическая задача' : 'Решение задачи'),
    given: listItems(parts['ДАНО'] || parts['УСЛОВИЕ'] || (kind === 'geometry' ? [problem] : []), 9),
    find: listItems(parts['НАЙТИ'], 7),
    steps, answer,
    verification: max((parts['ПРОВЕРКА'] || []).join(' '), 900),
    warning: max((parts['ПРИМЕЧАНИЕ'] || []).join(' '), 500),
    needs_clarification: !!clarification && !answer,
    clarification,
    diagram: {kind: diagramKind, labels: geometryLabels(problem, diagramKind), note: 'Схематический чертёж, не в масштабе'}
  };
}
