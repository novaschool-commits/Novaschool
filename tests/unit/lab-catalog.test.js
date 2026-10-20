// The planned 100-experiment Virtual Lab catalog.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'db/data/lab_catalog_plan.json'), 'utf8')).experiments;
const migration = fs.readFileSync(path.join(root, 'db/migrations/0003_foundation_modules.sql'), 'utf8');
const engines = new Map([...migration.matchAll(/\('([a-z_0-9]+)', '(physics|chemistry|biology|computer_science)', '[^']+', '(available|planned)'/g)]
  .map(m => [m[1], { subject: m[2], status: m[3] }]));

test('100 experiments, 25 per subject, unique codes', () => {
  assert.equal(plan.length, 100);
  for (const s of ['physics', 'chemistry', 'biology', 'computer_science']) {
    assert.equal(plan.filter(e => e.subject === s).length, 25, s);
  }
  assert.equal(new Set(plan.map(e => e.code)).size, 100);
  assert.equal(new Set(plan.map(e => e.title.toLowerCase())).size, 100);
});

test('every experiment uses a registered engine of its own subject', () => {
  for (const e of plan) {
    const eng = engines.get(e.engine);
    assert.ok(eng, `${e.code}: unknown engine ${e.engine}`);
    assert.equal(eng.subject, e.subject, e.code);
  }
});

test('only experiments on a built engine are marked available', () => {
  for (const e of plan) {
    if (e.status === 'available') assert.equal(engines.get(e.engine).status, 'available', e.code);
    else assert.equal(e.status, 'planned', e.code);
  }
  assert.equal(plan.filter(e => e.status === 'available').length, 3);
});

test('grade bands use the agreed values', () => {
  for (const e of plan) assert.match(e.grade_band, /^G(6-8|9-10|11-12)$/, e.code);
});
