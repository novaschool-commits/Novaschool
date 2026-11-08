// Lesson packs: read from the curriculum repository; the manifest is an allow-list,
// unsafe or mislabelled entries are dropped, and the routes check role and grade.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.CURRICULUM_TOKEN = 'unit-test-token';
process.env.CURRICULUM_API_BASE = 'http://127.0.0.1:39418';
const { start } = require('../fixtures/mock-github');
const books = require('../../lib/courseBooks');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let server;
test.before(async () => { server = await start(39418, 'unit-test-token'); });
test.after(() => server.close());

test('the manifest keeps only safe, correctly labelled PDFs', async () => {
  books._reset();
  const all = await books.list();
  assert.deepEqual(all.map((b) => b.id), [
    'grade-2-term-1-english', 'answer-keys-grade-2-term-1-answer-key',
    'grade-8-term-1-urdu', 'grade-8-term-1-mathematics', 'answer-keys-grade-8-term-1-answer-key'
  ]);
  assert.ok(all.every((b) => !b.file.includes('..') && b.file.endsWith('.pdf')));
  assert.ok((await books.list({ kind: 'student' })).every((b) => !/answer/.test(b.file)), 'an answer key is never a student pack');
  assert.deepEqual((await books.list({ grade: 8, kind: 'student' })).map((b) => b.subject), ['Urdu', 'Mathematics']);
});

test('ids are validated and unknown ids are never resolved', async () => {
  books._reset();
  assert.equal(await books.find('../../server'), null);
  assert.equal(await books.find('grade-2/term-1/english'), null);
  assert.equal(await books.find('nope-not-a-book'), null);
  assert.equal((await books.find('grade-2-term-1-english')).file, 'grade-2/term-1/english.pdf');
});

test('a pack is sent as a PDF download with safe headers', async () => {
  books._reset();
  const b = await books.find('grade-8-term-1-mathematics');
  const sent = {}; const res = { set(k, v) { sent[k.toLowerCase()] = v; return this; }, send(buf) { sent.body = buf; } };
  await books.send(res, b);
  assert.equal(sent['content-type'], 'application/pdf');
  assert.equal(sent['cache-control'], 'private, no-store');
  assert.match(sent['content-disposition'], /^attachment; filename="Nova-Grade-8-Term-1-Mathematics\.pdf"$/);
  assert.equal(sent.body.subarray(0, 4).toString(), '%PDF');
});

test('grade text is read as a number', () => {
  assert.equal(books.gradeNumber('Grade 8'), 8);
  assert.equal(books.gradeNumber('grade 10'), 10);
  assert.equal(books.gradeNumber('KG'), null);
});

test('students get only student packs for their own grade; answer keys are teacher-only; no PDFs in the app repo', () => {
  const s = read('routes/student.js');
  assert.ok(s.includes("if (!book || book.kind !== 'student') return res.status(404)"));
  assert.ok(s.includes('if (!grade || book.grade !== grade) return res.status(403)'));
  assert.ok(read('routes/teacher.js').includes("router.use(authenticate, requireRole('teacher'))"));
  assert.equal(fs.existsSync(path.join(root, 'public', 'course-books')), false, 'books must not be public files');
  assert.equal(fs.existsSync(path.join(root, 'content', 'course-books')), false, 'packs live in the curriculum repository');
});
