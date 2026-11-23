import test from 'node:test';
import assert from 'node:assert/strict';
import { commonsImage } from '../server.js';

test('presentation image search uses reachable Wikipedia API before Commons', async () => {
  const oldFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    return {
      ok: true, status: 200,
      json: async () => ({
        query: { pages: {
          '1': {
            title: 'File:Solar panels on school roof.jpg',
            imageinfo: [{ mime: 'image/jpeg',
              thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/solar.jpg/1400px-solar.jpg' }]
          }
        }}
      })
    };
  };
  try {
    const used = new Set();
    const result = await commonsImage('photorealistic solar panels roof', used, ['Солнечная энергия']);
    assert.ok(result);
    assert.match(result.credit, /Solar panels/);
    assert.equal(requested.length, 1);
    assert.match(requested[0], /^https:\/\/en\.wikipedia\.org\/w\/api\.php\?/);
    assert.equal(used.has(result.url), true);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
