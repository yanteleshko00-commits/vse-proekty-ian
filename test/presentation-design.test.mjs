import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentSlideCount, appendProductSlide, imageFrameRatio,
  imageSearchQueries, imageCandidateScore
} from '../presentation-design.js';

test('the final product slide is included in the requested total', () => {
  for (const count of [7, 12, 30, 100]) {
    const plan = { slides: Array.from({ length: contentSlideCount(count) }, (_, i) => ({ title: String(i) })) };
    appendProductSlide(plan, {
      title: 'Памятка', format: 'Памятка', takeaway: 'Берегите энергию',
      checklist: ['Выключайте свет'], imageBytes: Buffer.from('sample')
    }, count);
    assert.equal(plan.slides.length, count);
    assert.equal(plan.slides.at(-1).isProductSlide, true);
  }
});
test('incorrect slide count cannot be silently accepted', () => {
  assert.throws(() => contentSlideCount(6), RangeError);
  assert.throws(() => appendProductSlide({ slides: Array(12).fill({}) },
    { imageBytes: Buffer.from('x') }, 12), /не совпадает/);
});
test('photo aspect ratio is chosen for each actual slide layout', () => {
  assert.ok(Math.abs(imageFrameRatio({ type: 'image' }, 0) - 16 / 9) < 0.01);
  assert.ok(imageFrameRatio({ type: 'cards' }, 1) < 1);
  assert.ok(imageFrameRatio({ type: 'stat' }, 1) > 1);
});
test('photo search prioritizes a concrete subject over generic style words', () => {
  assert.deepEqual(imageSearchQueries('cinematic editorial solar panels on school rooftop natural light')[0],
    'solar panels on school rooftop');
  assert.deepEqual(imageSearchQueries(''), []);
  assert.ok(imageCandidateScore('Solar panels on school rooftop.jpg', 'solar panels school rooftop') >
    imageCandidateScore('Generic abstract.png', 'solar panels school rooftop'));
  assert.ok(imageCandidateScore('school logo.png', 'school') < 0);
});
