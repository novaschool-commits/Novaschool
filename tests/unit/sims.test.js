// Simulations are static pages: every catalogue entry has its page and script, and pages hold no data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '..', 'public', 'sims');

test('catalogue entries each have a page and script', () => {
  const { sims } = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  assert.ok(sims.length >= 30);
  const ids = new Set();
  for (const s of sims) {
    assert.match(s.id, /^g[1-8]-[a-z0-9-]+$/);
    assert.ok(!ids.has(s.id)); ids.add(s.id);
    assert.ok(fs.existsSync(path.join(dir, s.id + '.html')), s.id);
    const js = fs.readFileSync(path.join(dir, s.id + '.js'), 'utf8');
    assert.equal(/innerHTML|fetch\(|XMLHttpRequest|localStorage\.setItem|eval\(/.test(js), false, s.id + ' must stay a self-contained page');
  }
});
