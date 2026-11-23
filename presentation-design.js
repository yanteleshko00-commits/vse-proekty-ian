// Shared, dependency-free presentation rules. Keep these consistent across
// initial generation, edit flow, PowerPoint, and PDF.
export function contentSlideCount(totalSlides) {
  if (!Number.isInteger(totalSlides) || totalSlides < 7 || totalSlides > 100) {
    throw new RangeError('Количество слайдов должно быть от 7 до 100.');
  }
  // The finished project product has its own real slide, included in the total.
  return totalSlides - 1;
}

export function appendProductSlide(plan, product, totalSlides) {
  if (!plan || !Array.isArray(plan.slides) || plan.slides.length !== contentSlideCount(totalSlides)) {
    throw new Error('Количество содержательных слайдов не совпадает с заказанным.');
  }
  if (!product || !product.imageBytes) {
    throw new Error('Нельзя добавить итоговый продукт без готового изображения.');
  }
  plan.slides.push({
    type: 'image',
    title: 'Практический результат: ' + product.title,
    subtitle: product.format,
    body: 'Итоговый продукт проекта — готовый материал по теме исследования.',
    bullets: [product.takeaway, ...(product.checklist || []).slice(0, 2)].filter(Boolean),
    imageBytes: product.imageBytes,
    imageMime: 'image/png',
    imageCredit: 'Итоговый продукт проекта',
    isProductSlide: true
  });
  if (plan.slides.length !== totalSlides) throw new Error('Ошибка количества слайдов итоговой презентации.');
  return plan;
}

export function imageFrameRatio(slide, index = 1) {
  const type = index === 0 ? 'cover' : (slide?.type || 'image');
  const ratioByType = {
    cover: 13.333 / 7.5,
    cards: 2.95 / 4.72,
    comparison: 2.95 / 4.78,
    stat: 5.05 / 4.85,
    process: 2.95 / 4.78,
    quote: 4.42 / 4.9,
    table: 2.95 / 4.7,
    image: 5.75 / 4.85
  };
  return ratioByType[type] || 3.7 / 4.85;
}

// Ignore words describing the photograph rather than its subject.
const IMAGE_GENERIC_WORDS = new Set([
  'cinematic', 'photorealistic', 'photo', 'photograph', 'photography', 'editorial',
  'high', 'quality', 'sharp', 'focus', 'beautiful', 'background', 'view', 'wide', 'angle',
  'lighting', 'light', 'depth', 'field', 'close', 'up', 'ultra', 'realistic',
  'educational', 'professional', 'natural', 'image', 'shot', 'landscape',
  'illustration', 'presentation', 'showing', 'visible', 'soft', 'bright',
  'sunny', 'morning', 'afternoon', 'daylight', 'texture', 'generic',
  'clear', 'detail', 'oblique', 'diagonal', 'three', 'quarter', 'full',
  'style', 'portrait', 'horizontal', 'vertical', 'facing', 'foreground',
  'person', 'adult', 'scene', 'composition', 'with', 'from', 'into',
  'over', 'under', 'while', 'near', 'against', 'this', 'that', 'about',
  'their', 'there', 'along', 'beside', 'including', 'using', 'through',
  'the', 'and', 'for', 'are', 'has', 'have', 'its', 'was', 'were', 'not',
  'out', 'one', 'two', 'of', 'on', 'an', 'in', 'at', 'to', 'a'
]);

function imageSubjectTokens(input) {
  return String(input || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(word => word.length >= 4 && !IMAGE_GENERIC_WORDS.has(word));
}

export function imageSearchQueries(input) {
  const core = imageSubjectTokens(input);
  if (!core.length) return [];
  const phrases = [
    core.slice(0, 7).join(' '),
    core.slice(0, 4).join(' '),
    core.slice(-4).join(' ')
  ];
  // Common scientific synonyms improve recall for descriptive AI prompts.
  if (core.some(w => /^(?:photovoltaic|solar|inverter)$/.test(w))) {
    phrases.push('solar panels', 'photovoltaic solar panels');
  }
  return [...new Set(phrases.filter(q => q.length >= 3))];
}

// The title must describe the *subject*, not just a camera style or location.
// Without a match, intentionally use a diagram rather than a random stock photo.
export function imageCandidateScore(title, query, searchIndex = 0) {
  const name = String(title || '').toLowerCase()
    .replace(/^file:/, '').replace(/\.[a-z0-9]{2,5}$/i, '');
  if (/\b(?:logo|emblem|flag|icon|watermark|coat of arms|svg|map|diagram|chart|clipart|screenshot)\b/i.test(name)) return -100;
  const words = [...new Set(imageSubjectTokens(query))];
  if (!words.length) return -100;
  const titleWords = new Set(imageSubjectTokens(name));
  const shared = words.filter(word => titleWords.has(word) ||
    [...titleWords].some(t => t.startsWith(word) || word.startsWith(t))).length;

  // Images of unrelated objects (e.g. a bird on a solar-cell slide) must fail
  // even if their titles accidentally contain generic photography vocabulary.
  const solarRequested = words.some(word =>
    /^(solar|photovoltaic|inverter|renewables?)$/.test(word));
  const solarMatched = /\b(?:solar|photovoltaic|panel|panels|inverter|renewables?|pv)\b/i.test(name);
  if (solarRequested && !solarMatched) return -100;

  if (shared === 0 && !(solarRequested && solarMatched)) return -100;
  return shared * 8 + (solarRequested && solarMatched ? 9 : 0) -
    Math.max(0, Number(searchIndex) || 0) * 0.15;
}

/**
 * Wikimedia Commons imageinfo currently serves thumbnails from thumb.wikimedia.org
 * (and some original images from upload.wikimedia.org).
 * Keep an explicit host allow-list to prevent SSRF.
 */
export function isTrustedWikimediaImageUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'thumb.wikimedia.org' || parsed.hostname === 'upload.wikimedia.org');
  } catch {
    return false;
  }
}
