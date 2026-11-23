import test from 'node:test';
import assert from 'node:assert/strict';
import { safeHtml } from '../productDesigner.js';
const document = prefix => '<!doctype html><html><head>' + prefix +
  '<style>.page { width:794px;height:1123px;padding:40px; }'+ ' '.repeat(1200) +
  '</style></head><body><div class="page">Школьный проект</div></body></html>';

test('harmless charset and viewport metadata cannot invalidate AI product design', () => {
  const html = safeHtml(document('<meta charset="UTF-8"><meta name="viewport" content="width=device-width">'));
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(!html.includes('name="viewport"'));
  assert.ok(!html.includes('charset="UTF-8"'));
});

test('external refresh directives and remote resources remain prohibited', () => {
  assert.throws(() => safeHtml(document('<meta http-equiv="refresh" content="0;url=https://example.com">')), /запрещённый элемент/);
  assert.throws(() => safeHtml(document('<link rel="stylesheet" href="https://example.com/a.css">')), /запрещённый элемент/);
  assert.throws(() => safeHtml(document('<script>alert(1)</script>')), /запрещённый элемент/);
});
