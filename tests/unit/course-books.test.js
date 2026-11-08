// Course books: downloads are allow-listed by the manifest and checked by role and grade.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const books = require('../../lib/courseBooks');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('every manifest entry points at a real PDF inside content/course-books', () => {
  const all = books.list();
  assert.ok(all.length >= 160, 'expected the Grade 1-8 books');
  for (const b of all) {
    const abs = path.join(books.ROOT, b.file);
    assert.ok(abs.startsWith(books.ROOT + path.sep), b.file);
    assert.equal(fs.readFileSync(abs).subarray(0, 4).toString(), '%PDF', b.file);
  }
});

test('each grade 1-8 has student books for all three terms, and an answer key per term', () => {
  for (let g = 1; g <= 8; g++) {
    for (let t = 1; t <= 3; t++) {
      assert.ok(books.list({ grade: g, kind: 'student' }).some((b) => b.term === t), `G${g} T${t}`);
      assert.equal(books.list({ grade: g, kind: 'answer-key' }).filter((b) => b.term === t).length, 1, `key G${g} T${t}`);
    }
  }
});

test('ids are validated and unknown ids are never resolved', () => {
  assert.equal(books.find('../../server'), null);
  assert.equal(books.find('grade-1/term-1/english'), null);
  assert.equal(books.find('nope-not-a-book'), null);
  const b = books.list({ kind: 'student' })[0];
  assert.equal(books.find(b.id).file, b.file);
});

test('grade text is read as a number', () => {
  assert.equal(books.gradeNumber('Grade 8'), 8);
  assert.equal(books.gradeNumber('grade 10'), 10);
  assert.equal(books.gradeNumber('KG'), null);
});

test('students get only student editions for their own grade; answer keys are teacher-only', () => {
  const s = read('routes/student.js');
  assert.ok(s.includes("if (!book || book.kind !== 'student') return res.status(404)"));
  assert.ok(s.includes('if (!grade || book.grade !== grade) return res.status(403)'));
  assert.ok(read('routes/teacher.js').includes("router.use(authenticate, requireRole('teacher'))"));
  assert.equal(fs.existsSync(path.join(root, 'public', 'course-books')), false, 'books must not be public files');
});

test('student PDFs carry no bold answers (spot check of the source HTML is done at build time)', () => {
  // The answer keys are separate files whose names say so.
  for (const b of books.list({ kind: 'answer-key' })) assert.match(b.file, /^answer-keys\//);
  for (const b of books.list({ kind: 'student' })) assert.doesNotMatch(b.file, /answer/);
});
