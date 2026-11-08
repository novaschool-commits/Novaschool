// Course books: the Nova Research Curriculum as downloadable PDFs.
// Files live in content/course-books (never under public/), so every
// download goes through a route that checks who is asking:
//   - a student gets only the student edition for their own grade;
//   - answer keys are for teachers only.
// The manifest is the allow-list: an id that is not in it is never served.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'content', 'course-books');
const SUBJECT_ORDER = ['english', 'urdu', 'mathematics', 'general science', 'science', 'physics', 'chemistry', 'biology', 'history', 'humanities', 'islamiyat'];

let cache = null;

function idFor(file) {
  return String(file).replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function rank(subject) {
  const s = String(subject).toLowerCase();
  const i = SUBJECT_ORDER.findIndex((x) => s.startsWith(x));
  return i === -1 ? SUBJECT_ORDER.length : i;
}

function load() {
  if (cache) return cache;
  let raw = [];
  try { raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')); } catch (e) { raw = []; }
  cache = raw
    .filter((b) => b && typeof b.file === 'string' && /^[a-z0-9/_-]+\.pdf$/i.test(b.file) && !b.file.includes('..'))
    .map((b) => {
      const abs = path.join(ROOT, b.file);
      let size = 0;
      try { size = fs.statSync(abs).size; } catch (e) { size = 0; }
      return { id: idFor(b.file), grade: Number(b.grade), term: Number(b.term), subject: String(b.subject), kind: b.kind === 'answer-key' ? 'answer-key' : 'student', file: b.file, size };
    })
    .filter((b) => b.size > 0)
    .sort((a, b) => a.grade - b.grade || a.term - b.term || (a.kind === b.kind ? 0 : a.kind === 'answer-key' ? 1 : -1) || rank(a.subject) - rank(b.subject) || a.subject.localeCompare(b.subject));
  return cache;
}

// 'Grade 8' -> 8. Anything without a grade number gives null.
function gradeNumber(grade) {
  const m = String(grade || '').match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

function list({ grade, kind } = {}) {
  return load().filter((b) => (grade === undefined || b.grade === grade) && (!kind || b.kind === kind));
}

function find(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,120}$/.test(id)) return null;
  return load().find((b) => b.id === id) || null;
}

function publicView(b) {
  return { id: b.id, grade: b.grade, term: b.term, subject: b.subject, kind: b.kind, sizeKb: Math.round(b.size / 1024) };
}

// Streams one book as a download. `root` keeps sendFile inside the folder.
function send(res, b) {
  const name = `Nova-Grade-${b.grade}-Term-${b.term}-${b.subject.replace(/[^a-z0-9]+/gi, '-')}.pdf`.replace(/-+/g, '-');
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.sendFile(b.file, { root: ROOT, dotfiles: 'deny', headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"` } });
}

module.exports = { list, find, gradeNumber, publicView, send, ROOT, _reset: () => { cache = null; } };
