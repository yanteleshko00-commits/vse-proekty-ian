import { chromium } from 'playwright';
import sharp from 'sharp';

const W = 794;
const H = 1123;
const MAX_HTML = 180000;
const FONT_LIST = 'Inter, Manrope, Montserrat, Onest, Golos Text, Rubik, Nunito, Raleway, PT Sans, PT Serif, Roboto Slab, Arial, sans-serif';

const CONCEPT_PROMPT = 'Ты — арт-директор печатных учебных материалов. Придумай 2 заметно разные концепции A4-памятки под тему и содержание продукта. Верни только JSON: {"concepts":[{"name":"...","mood":"...","metaphor":"...","palette":{"bg":"#......","surface":"#......","ink":"#......","muted":"#......","accent":"#......","accent2":"#......"},"fonts":{"heading":"...","body":"..."},"composition":"..."}]}. Верни ровно requestedVariants концепции. Цвета только HEX, высокий контраст. Шрифты выбирай из списка: ' + FONT_LIST + '. Композиции должны отличаться сеткой, масштабом заголовка и расположением смысловых блоков. Не делай обе концепции синими карточками на белом фоне. Не меняй текст и не выдумывай факты.';

const LAYOUT_PROMPT = 'Ты — профессиональный арт-директор и frontend-верстальщик печатных материалов. Верни только JSON вида {"html":"полный HTML-документ"}.\n' +
'Размер страницы строго 794×1123 CSS px. html и body: margin:0;width:794px;height:1123px;overflow:hidden. Обязательный корневой .page с точным размером 794×1123px, box-sizing:border-box, padding 40–48px.\n' +
'Используй CSS Grid/Flex; absolute только для декора, не для текста. Цвета, настроение и композиция должны соответствовать переданной концепции. Шрифты только из концепции и системного fallback. Никаких внешних ресурсов и Google Fonts.\n' +
'Заголовок 40–58px, основной текст 14–17px, любой текст не меньше 14px. Не менее трёх уровней типографики, достаточные поля и не менее 12% свободного пространства. Иконки — CSS или инлайн-SVG. Emoji запрещены.\n' +
'Весь текст из product обязателен: format, title, subtitle, audience, все sections[].heading и sections[].body, каждый steps, checklist и takeaway. Копируй дословно, не сокращай, не перефразируй, не исправляй пунктуацию и ничего не выдумывай. Если не помещается, перестрой сетку и интервалы, но не уменьшай шрифт ниже 14px и не удаляй текст.\n' +
'Запрещены script, iframe, object, embed, form, link, img, src, href, внешние URL, @import и CSS url(). Только полный HTML, встроенный CSS и SVG.';

function normalize(value) {
  return String(value ?? '').normalize('NFC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
}
function parseJson(value) {
  const source = String(value || '').trim();
  try { return JSON.parse(source); } catch {}
  const match = source.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error('Дизайнер вернул некорректный JSON.');
}
function requiredText(product) {
  return [
    ['Формат', product.format], ['Название', product.title], ['Подзаголовок', product.subtitle], ['Аудитория', product.audience],
    ...(product.sections || []).flatMap((s, i) => [['Заголовок раздела ' + (i + 1), s.heading], ['Текст раздела ' + (i + 1), s.body]]),
    ...(product.steps || []).map((v, i) => ['Шаг ' + (i + 1), v]),
    ...(product.checklist || []).map((v, i) => ['Пункт списка ' + (i + 1), v]),
    ['Главный вывод', product.takeaway]
  ].filter(([label, value]) => typeof value === 'string' && value.trim()).map(([label, value]) => ({ label, value, normalized: normalize(value) }));
}
function productPayload(product, theme, concept, requestedVariants) {
  return {
    product: {
      format: product.format, title: product.title, subtitle: product.subtitle, audience: product.audience,
      sections: product.sections, steps: product.steps, checklist: product.checklist, takeaway: product.takeaway
    },
    theme: {
      bg: theme?.bg || 'F7F8FA', ink: theme?.ink || '18243A',
      accent: theme?.accent || '315EDB', accent2: theme?.accent2 || 'AFC5FF'
    },
    concept,
    requestedVariants
  };
}
function safeHtml(input) {
  const html = String(input || '').trim();
  if (html.length < 1000 || html.length > MAX_HTML) throw new Error('HTML-макет имеет неподходящий размер.');
  if (!/^<!doctype\s+html/i.test(html) || !/<html[\s>]/i.test(html) || !/<\/html>/i.test(html) || !/<head[\s>]/i.test(html)) {
    throw new Error('Дизайнер не вернул полный HTML-документ.');
  }
  if (!/class\s*=\s*["'][^"']*\bpage\b/i.test(html)) throw new Error('В HTML отсутствует контейнер .page.');
  const forbidden = [
    [/<\s*script\b/i, 'JavaScript'], [/<\s*(iframe|object|embed|form|video|audio|base|img)\b/i, 'активный или внешний элемент'],
    [/<\s*foreignObject\b/i, 'SVG foreignObject'], [/<\s*link\b/i, 'внешний ресурс'],
    [/<\s*meta\b(?![^>]*\bcharset\s*=)[^>]*>/i, 'внешняя мета-настройка'],
    [/\son[a-z0-9_-]+\s*=/i, 'обработчик события'], [/javascript\s*:/i, 'javascript URL'],
    [/@import\b/i, 'CSS import'], [/url\s*\(/i, 'CSS URL'],
    [/\s(?:src|href|xlink:href)\s*=/i, 'внешняя ссылка или ресурс']
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(html)) throw new Error('HTML отклонён: обнаружен запрещённый элемент (' + label + ').');
  }
  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; connect-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\';">';
  return html.replace(/<head([^>]*)>/i, match => match + csp);
}
function scoreIssues(issues) {
  const critical = issues.some(issue => /отсутствует исходный текст|размер страницы/i.test(issue));
  return (critical ? 0 : 100) - issues.length * 12;
}
async function render(browser, html, product) {
  const context = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 2,
    javaScriptEnabled: false, serviceWorkers: 'block'
  });
  try {
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('about:') || url.startsWith('data:')) return route.continue();
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 12000 });
    const audit = await page.evaluate(({ width, height, required }) => {
      const issues = [];
      const root = document.querySelector('.page');
      if (!root) return ['Не найден контейнер .page'];
      const box = root.getBoundingClientRect();
      if (Math.abs(box.width - width) > 1 || Math.abs(box.height - height) > 1) issues.push('Размер страницы должен быть 794×1123 px.');
      const bodyText = String(root.innerText || '').normalize('NFC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
      const missing = required.filter(item => !bodyText.includes(item.normalized));
      if (missing.length) issues.push('Отсутствует исходный текст: ' + missing.slice(0, 5).map(item => item.label).join(', '));

      const leaves = Array.from(root.querySelectorAll('*')).filter(el => el.children.length === 0 && (el.textContent || '').trim());
      const small = [], clipped = [], outside = [], lowContrast = [];
      const color = value => {
        const match = String(value || '').match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const p = match[1].split(',').map(Number);
        if (p.length < 3 || p.some(Number.isNaN)) return null;
        return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
      };
      const luminance = c => {
        const f = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const findBackground = el => {
        for (let node = el; node && node !== root.parentElement; node = node.parentElement) {
          const cs = getComputedStyle(node);
          if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
          const bg = color(cs.backgroundColor);
          if (bg && bg.a > 0.95) return bg;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      };
      for (const el of leaves) {
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const size = parseFloat(cs.fontSize) || 0;
        const label = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36);
        if (size > 0 && size < 13.99) small.push(label);
        if (rect.left < box.left - 1 || rect.top < box.top - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1) outside.push(label);
        if (cs.overflow !== 'visible' && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)) clipped.push(label);
        const fg = color(cs.color), bg = findBackground(el);
        if (fg && bg && fg.a > 0.95 && size < 24) {
          const a = luminance(fg), b = luminance(bg);
          if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5) lowContrast.push(label);
        }
      }
      if (small.length) issues.push('Есть текст меньше 14px: ' + small.slice(0, 4).join('; '));
      if (clipped.length) issues.push('Есть обрезанный текст: ' + clipped.slice(0, 4).join('; '));
      if (outside.length) issues.push('Текст вышел за границы: ' + outside.slice(0, 4).join('; '));
      if (lowContrast.length) issues.push('Низкий контраст: ' + lowContrast.slice(0, 4).join('; '));
      return issues;
    }, { width: W, height: H, required: requiredText(product) });

    const png = await page.screenshot({ type: 'png', fullPage: false, timeout: 12000, animations: 'disabled' });
    const meta = await sharp(png).metadata();
    if (meta.width !== W * 2 || meta.height !== H * 2) throw new Error('Рендер имеет неверный размер.');
    return { png, issues: audit };
  } finally {
    await context.close().catch(() => {});
  }
}
let renderQueue = Promise.resolve();
function serializeRender(task) {
  const next = renderQueue.then(task, task);
  renderQueue = next.then(() => undefined, () => undefined);
  return next;
}
function timeout(promise, ms, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

export async function designProduct(product, theme, aiJson, reviewScreenshot = null) {
  if (typeof aiJson !== 'function') throw new Error('Не подключён генератор дизайн-концепций.');
  const started = Date.now();
  const budget = Math.max(30000, Math.min(120000, Number(process.env.PRODUCT_BUDGET_MS) || 100000));
  const maxVariants = Math.max(1, Math.min(2, Number(process.env.PRODUCT_VARIANTS) || 2));
  const remaining = () => Math.max(0, budget - (Date.now() - started));

  const conceptData = await timeout(aiJson(CONCEPT_PROMPT, productPayload(product, theme, null, maxVariants), Math.min(28000, remaining())), Math.max(1000, Math.min(30000, remaining())), 'Арт-директор не уложился в лимит времени.');
  const rawConcepts = Array.isArray(conceptData?.concepts) ? conceptData.concepts : (conceptData?.palette ? [conceptData] : []);
  const concepts = rawConcepts.slice(0, maxVariants).filter(c => c && c.palette && c.fonts);
  if (!concepts.length) throw new Error('Не удалось получить ни одной дизайн-концепции.');

  const layouts = await Promise.all(concepts.map(async (concept, index) => {
    try {
      const result = await timeout(aiJson(LAYOUT_PROMPT, productPayload(product, theme, concept, 1), Math.min(35000, remaining())), Math.max(1000, Math.min(38000, remaining())), 'Верстальщик не уложился в лимит времени.');
      const html = safeHtml(typeof result === 'string' ? parseJson(result).html : result?.html);
      return { concept, html, index };
    } catch (error) {
      console.warn('[product-design] Вариант ' + (index + 1) + ' не создан: ' + (error?.message || error));
      return null;
    }
  }));
  const candidates = layouts.filter(Boolean);
  if (!candidates.length) throw new Error('Не удалось создать HTML-макет ни для одной концепции.');

  return await serializeRender(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    try {
      const rendered = [];
      for (const candidate of candidates) {
        try {
          const result = await render(browser, candidate.html, product);
          rendered.push({ ...candidate, ...result, total: scoreIssues(result.issues), critic: null });
        } catch (error) {
          console.warn('[product-design] Рендер варианта ' + (candidate.index + 1) + ' не удался: ' + (error?.message || error));
        }
      }
      if (!rendered.length) throw new Error('Chromium не смог отрендерить ни один макет.');
      rendered.sort((a, b) => b.total - a.total);
      let best = rendered[0];

      if (reviewScreenshot && remaining() > 9000) {
        try {
          const critic = await timeout(reviewScreenshot(best.png, product), Math.min(9000, remaining()), 'Критик не успел оценить скриншот.');
          if (critic && Number.isFinite(Number(critic.score))) {
            best.critic = { score: Math.max(1, Math.min(10, Number(critic.score))), issues: Array.isArray(critic.issues) ? critic.issues.slice(0, 5) : [] };
            if (best.critic.score < 8 && !best.critic.issues.length) best.critic.issues.push({ where: 'оценка дизайна', fix: 'Улучши визуальную иерархию, баланс блоков и читаемость.' });
          }
        } catch (error) {
          console.warn('[product-design] Оценка скриншота пропущена: ' + (error?.message || error));
        }
      }

      const fixes = [
        ...best.issues.map(fix => ({ where: 'автопроверка', fix })),
        ...(best.critic?.issues || [])
      ];
      const rounds = Math.max(0, Math.min(1, Number(process.env.PRODUCT_REFINE_ROUNDS ?? 1)));
      if (rounds && fixes.length && remaining() > 18000) {
        try {
          const revised = await timeout(aiJson(
            LAYOUT_PROMPT + '\nИсправь переданный полный HTML по issuesToFix. Сохрани все исходные тексты дословно и удачную композицию. Верни JSON {"html":"..."} без пояснений.',
            { ...productPayload(product, theme, best.concept, 1), previousHtml: best.html, issuesToFix: fixes },
            Math.min(35000, remaining())
          ), Math.max(1000, Math.min(38000, remaining())), 'Автоисправление не уложилось в лимит времени.');
          const revisedHtml = safeHtml(typeof revised === 'string' ? parseJson(revised).html : revised?.html);
          const next = await render(browser, revisedHtml, product);
          const candidate = { ...best, html: revisedHtml, ...next, critic: null, total: scoreIssues(next.issues) };
          if (reviewScreenshot && remaining() > 9000) {
            try {
              const critic = await timeout(reviewScreenshot(candidate.png, product), Math.min(9000, remaining()), 'Критик не успел оценить исправленный макет.');
              if (critic && Number.isFinite(Number(critic.score))) {
                candidate.critic = { score: Math.max(1, Math.min(10, Number(critic.score))), issues: Array.isArray(critic.issues) ? critic.issues.slice(0, 5) : [] };
              }
            } catch {}
          }
          const bestScore = best.total + (best.critic ? best.critic.score : 7);
          const nextScore = candidate.total + (candidate.critic ? candidate.critic.score : 7);
          if (nextScore > bestScore) best = candidate;
        } catch (error) {
          console.warn('[product-design] Автоисправление пропущено: ' + (error?.message || error));
        }
      }

      if (best.issues.length) throw new Error('Макет не прошёл обязательную проверку: ' + best.issues.slice(0, 3).join(' '));
      console.log('[product-design] Готово за ' + (Date.now() - started) + ' мс; вариантов=' + rendered.length + '; ошибок проверки=0.');
      return await sharp(best.png).png().toBuffer();
    } finally {
      await browser.close().catch(() => {});
    }
  });
}
