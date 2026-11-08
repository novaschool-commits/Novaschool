// Nova textbooks: the catalog is an allow-list, files come only from it, and reader links are signed.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CURRICULUM_TOKEN = 'unit-test-token';
process.env.CURRICULUM_API_BASE = 'http://127.0.0.1:39417';
const { start } = require('../fixtures/mock-github');
const books = require('../../lib/novaBooks');

let server;
test.before(async () => { server = await start(39417, 'unit-test-token'); });
test.after(() => server.close());

test('the catalog keeps only well-formed books and drops unsafe paths and ids', async () => {
  books._reset();
  const all = await books.list();
  assert.deepEqual(all.map((b) => b.id), ['g2-english-term-1', 'g8-physics-term-1']);
  assert.deepEqual((await books.list({ grade: 8 })).map((b) => b.id), ['g8-physics-term-1']);
  assert.equal(await books.find('../etc'), null);
  assert.equal(await books.find('g8-sneaky-term-1'), null);
  assert.equal(await books.find('g2-english-term-1/../../x'), null);
});

test('a book PDF and reader are fetched and sent with safe headers', async () => {
  books._reset();
  const b = await books.find('g2-english-term-1');
  const sent = {}; const res = { set(k, v) { sent[k.toLowerCase()] = v; return this; }, send(buf) { sent.body = buf; } };
  await books.sendPdf(res, b);
  assert.equal(sent['content-type'], 'application/pdf');
  assert.match(sent['content-disposition'], /^attachment; filename="Nova-Grade-2-English-Term-1\.pdf"$/);
  assert.equal(sent.body.subarray(0, 4).toString(), '%PDF');
  await books.sendReader(res, b);
  assert.match(sent['content-type'], /^text\/html/);
  assert.match(sent['content-security-policy'], /default-src 'none'/);
  assert.match(sent['content-security-policy'], /connect-src 'none'/);
  assert.match(sent.body.toString(), /Tap a word/);
});

test('reader links are signed per user and book and expire', () => {
  const now = Date.now();
  const q = Object.fromEntries(new URL('http://x' + books.readerLink(7, 'g2-english-term-1', now)).searchParams);
  assert.equal(books.checkLink('g2-english-term-1', q, now), true);
  assert.equal(books.checkLink('g8-physics-term-1', q, now), false, 'another book');
  assert.equal(books.checkLink('g2-english-term-1', { ...q, u: '8' }, now), false, 'another user');
  assert.equal(books.checkLink('g2-english-term-1', { ...q, s: q.s.slice(0, -2) + 'AA' }, now), false, 'tampered');
  assert.equal(books.checkLink('g2-english-term-1', q, now + 3 * 60 * 60 * 1000), false, 'expired');
  assert.equal(books.checkLink('g2-english-term-1', {}, now), false);
  assert.ok(!books.readerLink(7, 'g2-english-term-1').includes('Bearer'));
});

test('without a token the books are reported as not connected', async () => {
  const saved = process.env.CURRICULUM_TOKEN;
  delete process.env.CURRICULUM_TOKEN; books._reset();
  assert.equal(books.configured(), false);
  await assert.rejects(books.list(), /not connected/);
  process.env.CURRICULUM_TOKEN = saved;
});

test('a wrong token gives a friendly error, not GitHub details', async () => {
  const saved = process.env.CURRICULUM_TOKEN;
  process.env.CURRICULUM_TOKEN = 'wrong'; books._reset();
  await assert.rejects(books.list(), (e) => e.status === 502 && !/credentials/i.test(e.message));
  process.env.CURRICULUM_TOKEN = saved; books._reset();
});
