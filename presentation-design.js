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

export function imageSearchQueries(input) {
  const text = String(input || '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const words = text.split(' ').filter(Boolean);
  const stop = new Set(['cinematic', 'photorealistic', 'photo', 'photograph', 'photography', 'editorial',
    'high', 'quality', 'sharp', 'focus', 'beautiful', 'background', 'view', 'wide', 'angle',
    'lighting', 'light', 'depth', 'field', 'close', 'up', 'ultra', 'realistic', 'educational',
    'professional', 'natural', 'image', 'shot', 'landscape', 'illustration', 'presentation']);
  const core = words.filter(w => !stop.has(w.toLowerCase()));
  const phrases = [
    core.slice(0, 7).join(' '),
    core.slice(0, 4).join(' '),
    words.slice(0, 4).join(' ')
  ];
  return [...new Set(phrases.filter(q => q.length >= 3))];
}

export function imageCandidateScore(title, query, searchIndex = 0) {
  const name = String(title || '').toLowerCase();
  if (/\b(?:logo|emblem|flag|icon|watermark|coat of arms|svg|map|diagram|chart|clipart|screenshot)\b/.test(name)) return -100;
  const tokens = new Set(String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length >= 4));
  const common = [...tokens].filter(t => name.includes(t)).length;
  return common * 5 - Math.max(0, Number(searchIndex) || 0) * 0.35;
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
