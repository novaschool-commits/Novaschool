// Rate limiter (findings S2, S3).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLimiter, clientIp, limitByIp } = require('../../lib/rateLimit');

function clock(start = 0) { let t = start; return { now: () => t, advance: ms => { t += ms; } }; }

test('allows up to max hits, then blocks with a retry time', () => {
  const c = clock();
  const l = createLimiter({ windowMs: 60000, max: 3, now: c.now });
  assert.equal(l.hit('a').allowed, true);
  assert.equal(l.hit('a').allowed, true);
  assert.equal(l.hit('a').allowed, true);
  const r = l.hit('a');
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfterSec, 60);
});

test('keys are independent', () => {
  const l = createLimiter({ windowMs: 60000, max: 1, now: () => 0 });
  assert.equal(l.hit('a').allowed, true);
  assert.equal(l.hit('b').allowed, true);
  assert.equal(l.hit('a').allowed, false);
});

test('window resets after it expires', () => {
  const c = clock();
  const l = createLimiter({ windowMs: 1000, max: 1, now: c.now });
  l.hit('a');
  assert.equal(l.hit('a').allowed, false);
  c.advance(1001);
  assert.equal(l.hit('a').allowed, true);
});

test('reset clears a key (successful login)', () => {
  const l = createLimiter({ windowMs: 1000, max: 1, now: () => 0 });
  l.hit('a'); l.reset('a');
  assert.equal(l.hit('a').allowed, true);
});

test('memory is swept once many keys have expired', () => {
  const c = clock();
  const l = createLimiter({ windowMs: 10, max: 1, now: c.now });
  for (let i = 0; i < 6000; i++) l.hit('k' + i);
  c.advance(20);
  l.hit('new');
  assert.ok(l.size() < 10, `size ${l.size()}`);
});

test('client IP comes from Express (trust proxy: one hop), never the raw header', () => {
  assert.equal(clientIp({ ip: '198.51.100.7', headers: { 'x-forwarded-for': '1.1.1.1, 198.51.100.7' }, socket: {} }), '198.51.100.7');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.1.1.1' }, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
});

test('middleware answers 429 with Retry-After when over the limit', () => {
  const mw = limitByIp(createLimiter({ windowMs: 60000, max: 1, now: () => 0 }), 'slow down');
  const req = { ip: '1.2.3.4', headers: {}, socket: {} };
  let nextCalls = 0;
  const res = { headers: {}, statusCode: 200, body: null,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; } };
  mw(req, res, () => { nextCalls++; });
  mw(req, res, () => { nextCalls++; });
  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '60');
  assert.equal(res.body.error, 'slow down');
});
