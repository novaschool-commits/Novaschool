// Startup configuration (findings S5, S6). Each case runs lib/config.js in a
// fresh Node process with a controlled environment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const CONFIG = path.join(__dirname, '..', '..', 'lib', 'config.js');
function load(env) {
  const r = spawnSync(process.execPath, ['-e', `const c=require(${JSON.stringify(CONFIG)}); console.log(JSON.stringify({src:c.jwtSecretSource, seed:c.seedDemo, prod:c.isProduction, len:c.jwtSecret.length, mig:c.migrateOnStart}))`],
    { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}

test('production refuses to start without a strong JWT secret', () => {
  for (const env of [{ NODE_ENV: 'production' }, { RENDER: 'true' }, { RENDER: 'true', JWT_SECRET: 'short' },
                     { RENDER: 'true', JWT_SECRET: 'change-this-to-a-long-random-string' }]) {
    const r = load(env);
    assert.notEqual(r.code, 0, JSON.stringify(env));
    assert.match(r.err, /JWT_SECRET/);
  }
});

test('production starts with a long secret, and demo seeding stays off even if asked', () => {
  const r = load({ RENDER: 'true', JWT_SECRET: 'x'.repeat(40), SEED_DEMO: 'true' });
  assert.equal(r.code, 0, r.err);
  const c = JSON.parse(r.out);
  assert.equal(c.src, 'env');
  assert.equal(c.seed, false);
  assert.equal(c.prod, true);
});

test('development without a secret uses a random one, never the old default', () => {
  const a = JSON.parse(load({}).out);
  assert.equal(a.src, 'ephemeral');
  assert.ok(a.len >= 64);
});

test('demo seeding is off unless SEED_DEMO=true outside production', () => {
  assert.equal(JSON.parse(load({}).out).seed, false);
  assert.equal(JSON.parse(load({ SEED_DEMO: 'true' }).out).seed, true);
});

test('legacy schema on start can be switched off', () => {
  assert.equal(JSON.parse(load({}).out).mig, true);
  assert.equal(JSON.parse(load({ MIGRATE_ON_START: 'false' }).out).mig, false);
});
