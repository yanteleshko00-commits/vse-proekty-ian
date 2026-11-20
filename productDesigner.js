import { chromium } from 'playwright';
import sharp from 'sharp';

const W = 794, H = 1123, SCALE = 2;
const MAX_HTML = 180000;
const FONT_LIST = 'Inter, Manrope, Montserrat, Onest, Golos Text, Rubik, Nunito, Raleway, PT Sans, PT Serif, Roboto, Arial, sans-serif';

const CONCEPT_PROMPT = 'Ты — арт-директор печатных учебных материалов. Придумай оригинальную дизайн-концепцию для A4, вертикально. Верни JSON: {"name":"...","mood":"...","metaphor":"...","palette":{"bg":"#...","surface":"#...","ink":"#...","muted":"#...","accent":"#...","accent2":"#..."},"fonts":{"heading":"...","body":"..."},"composition":"..."}. Все цвета HEX, контраст высокий. Шрифты выбирай из списка с поддержкой кириллицы: ' + FONT_LIST + '. Не используй один шаблон для всех тем. Подбери палитру и композицию под содержание. Не меняй и не выдумывай текст.';
const LAYOUT_PROMPT = 'Ты — профессиональный дизайнер печатных материалов. Верни JSON строго вида {"html":"полный HTML-документ"}. Страница строго 794×1123 CSS px, .page с этими размерами, box-sizing:border-box, overflow:hidden, padding 42–48px. Используй CSS Grid/Flex, переменные палитры, выразительную композицию и типографическую иерархию. Основной текст 14–17px, нигде не меньше 14px; заголовок 40–58px. Оставь свободное пространство. Сохрани ВЕСЬ переданный текст дословно: не сокращай, не перефразируй, не пропускай пункты. Если не помещается, перестрой сетку и интервалы, но не уменьшай кегль ниже 14px. Иконки — inline SVG/CSS. Не используй emoji, JavaScript, iframe, внешние картинки, внешние скрипты или ресурсы. Весь дизайн должен быть внутри .page.';

function normalize(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
}
function parseJson(value) {
  const source = String(value || '').trim();
  try { return JSON.parse(source); } catch {}
  const match = source.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error('Дизайнер вернул некорректный JSON.');
}
function requiredText(product) {
  return [product.title, product.subtitle, product.audience,
    ...(product.sections || []).flatMap(s => [s.heading, s.body]),
    ...(product.steps || []), ...(product.checklist || []), product.takeaway]
    .filter(v => typeof v === 'string' && v.trim());
}
function safeHtml(input) {
  let html = String(input || '');
  if (html.length > MAX_HTML) throw new Error('HTML-макет слишком большой.');
  if (!/<!doctype\s+html/i.test(html) || !/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) throw new Error('Дизайнер не вернул полный HTML-документ.');
  html = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|iframe|object|embed|form|video|audio|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|form|video|audio|base)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(src|href)\s*=\s*(["'])\s*(https?:|file:|javascript:|data:text\/html)[\s\S]*?\2/gi, '')
    .replace(/url\s*\(\s*(['"]?)\s*(https?:|file:|javascript:)[^)]*\)/gi, 'none');
  if (/<\s*(script|iframe|object|embed|form|video|audio)\b/i.test(html) || /\son[a-z]+\s*=/i.test(html)) throw new Error('HTML содержит запрещённые элементы.');
  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; style-src \'unsafe-inline\'; font-src \'none\';">';
  return html.replace(/<head([^>]*)>/i, match => match + csp);
}
function payload(product, theme, concept) {
  return {
    product: { format:product.format, title:product.title, subtitle:product.subtitle, audience:product.audience,
      sections:product.sections, steps:product.steps, checklist:product.checklist, takeaway:product.takeaway },
    theme: { bg:theme && theme.bg || 'F7F8FA', ink:theme && theme.ink || '18243A', accent:theme && theme.accent || '315EDB', accent2:theme && theme.accent2 || 'AFC5FF' },
    concept
  };
}
async function render(browser, html, product) {
  const context = await browser.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:SCALE, javaScriptEnabled:false, serviceWorkers:'block' });
  try {
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil:'domcontentloaded', timeout:14000 });
    const audit = await page.evaluate(({width,height,required}) => {
      const issues = [];
      const root = document.querySelector('.page') || document.body.firstElementChild;
      if (!root) return {issues:['Не найден контейнер страницы']};
      const box = root.getBoundingClientRect();
      if (Math.abs(box.width-width)>2 || Math.abs(box.height-height)>2) issues.push('Контейнер страницы должен быть 794×1123 px.');
      const elements = [...root.querySelectorAll('*')];
      const small = elements.filter(el => el.textContent && el.textContent.trim() && el.children.length===0 && parseFloat(getComputedStyle(el).fontSize)<14).length;
      if (small) issues.push('Есть текст меньше 14 px: '+small+' элементов.');
      const clipped = elements.filter(el => el.textContent && el.textContent.trim() && (getComputedStyle(el).overflow==='hidden' || getComputedStyle(el).overflowY==='hidden') && el.scrollHeight>el.clientHeight+2).slice(0,5);
      if (clipped.length) issues.push('Возможно обрезан текст: '+clipped.map(el=>(el.textContent||'').trim().slice(0,40)).join('; '));
      const text = (root.innerText||'').replace(/\s+/g,' ').toLocaleLowerCase('ru');
      const missing = required.filter(item => !text.includes(item));
      if (missing.length) issues.push('Не найден полный исходный текст: '+missing.slice(0,5).join(' | '));
      const out = elements.filter(el => {
        if (!el.textContent || !el.textContent.trim()) return false;
        const r=el.getBoundingClientRect();
        return r.width>0 && (r.left<box.left-1 || r.top<box.top-1 || r.right>box.right+1 || r.bottom>box.bottom+1);
      }).length;
      if (out) issues.push('Текстовые элементы выходят за границы страницы: '+out+'.');
      return {issues};
    }, {width:W,height:H,required:requiredText(product).map(normalize)});
    const png = await page.screenshot({type:'png',fullPage:false,timeout:14000});
    const meta = await sharp(png).metadata();
    if (meta.width!==W*SCALE || meta.height!==H*SCALE) throw new Error('Рендер имеет неверный размер.');
    return {png,issues:audit.issues};
  } finally { await context.close(); }
}

export async function designProduct(product, theme, aiJson) {
  const started = Date.now(), remaining = () => 55000-(Date.now()-started);
  const conceptData = await aiJson(CONCEPT_PROMPT, payload(product,theme,null), Math.min(23000,remaining()));
  const concept = conceptData && conceptData.palette && conceptData.fonts ? conceptData : null;
  if (!concept) throw new Error('Не удалось получить дизайн-концепцию.');
  const first = await aiJson(LAYOUT_PROMPT + '\nКонцепция: ' + JSON.stringify(concept), payload(product,theme,concept), Math.min(23000,remaining()));
  const firstData = typeof first === 'string' ? parseJson(first) : first;
  let html = safeHtml(firstData.html);
  const browser = await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    let result = await render(browser,html,product);
    if (result.issues.length && remaining()>18000) {
      const fix = await aiJson(LAYOUT_PROMPT + '\nИсправь полный HTML по ошибкам проверки, сохрани удачную композицию. Верни JSON {"html":"..."} без пояснений.',
        {...payload(product,theme,concept),previousHtml:html,validationIssues:result.issues}, Math.min(18000,remaining()));
      const fixData = typeof fix === 'string' ? parseJson(fix) : fix;
      const nextHtml = safeHtml(fixData.html);
      const next = await render(browser,nextHtml,product);
      if (next.issues.length < result.issues.length) result=next;
    }
    if (result.issues.length) throw new Error('Макет не прошёл автопроверку: '+result.issues.slice(0,3).join(' '));
    console.log('[product-design] Макет создан и проверен за '+(Date.now()-started)+' мс.');
    return await sharp(result.png).png().toBuffer();
  } finally { await browser.close(); }
}
