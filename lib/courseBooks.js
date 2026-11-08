// Lesson packs: student notes/workbooks for Grades 1-8 and the teacher answer keys.
// The PDFs live in the private nova-research-curriculum repository (lesson-packs/),
// not in this app repository, and are read on the server with the same read-only
// token as the textbooks (see lib/novaBooks.js). lesson-packs/manifest.json is the
// allow-list: an id or a file that is not in it is never fetched.
//   - a student gets only the student packs for their own grade (checked in the routes);
//   - answer keys are for teachers only.
const novaBooks = require('./novaBooks');

const PREFIX = 'lesson-packs/';
const FILE = /^[a-z0-9_-]+(\/[a-z0-9_-]+){0,3}\.pdf$/i;
const TTL = 10 * 60 * 1000;
const SUBJECT_ORDER = ['english', 'urdu', 'mathematics', 'general science', 'science', 'physics', 'chemistry', 'biology', 'history', 'humanities', 'islamiyat'];

let cache = null; let cacheAt = 0; let pending = null;

function idFor(file) {
  return String(file).replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function rank(subject) {
  const s = String(subject).toLowerCase();
  const i = SUBJECT_ORDER.findIndex((x) => s.startsWith(x));
  return i === -1 ? SUBJECT_ORDER.length : i;
}

function clean(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((b) => b && typeof b.file === 'string' && FILE.test(b.file) && !b.file.includes('..'))
    .map((b) => ({
      id: idFor(b.file), grade: Number(b.grade), term: Number(b.term), subject: String(b.subject).slice(0, 80),
      kind: b.kind === 'answer-key' ? 'answer-key' : 'student', file: b.file, size: Number(b.size) || 0
    }))
    .filter((b) => b.grade >= 1 && b.grade <= 12 && b.term >= 1 && b.term <= 3 && (b.kind === 'student') === !/answer/i.test(b.file))
    .sort((a, b) => a.grade - b.grade || a.term - b.term || (a.kind === b.kind ? 0 : a.kind === 'answer-key' ? 1 : -1) || rank(a.subject) - rank(b.subject) || a.subject.localeCompare(b.subject));
}

async function load() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  if (!pending) {
    pending = (async () => {
      try {
        const buf = await novaBooks.getFile(PREFIX + 'manifest.json');
        cache = clean(JSON.parse(buf.toString('utf8'))); cacheAt = Date.now();
      } catch (err) {
        if (!cache) throw err; // keep the last good list if GitHub is briefly unreachable
        console.error('[courseBooks] using the previous list:', err.message);
      } finally { pending = null; }
      return cache;
    })();
  }
  return pending;
}

// 'Grade 8' -> 8. Anything without a grade number gives null.
function gradeNumber(grade) {
  const m = String(grade || '').match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

async function list({ grade, kind } = {}) {
  return (await load()).filter((b) => (grade === undefined || b.grade === grade) && (!kind || b.kind === kind));
}

async function find(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,120}$/.test(id)) return null;
  return (await load()).find((b) => b.id === id) || null;
}

function publicView(b) {
  return { id: b.id, grade: b.grade, term: b.term, subject: b.subject, kind: b.kind, sizeKb: Math.round(b.size / 1024) };
}

async function send(res, b) {
  const buf = await novaBooks.getFile(PREFIX + b.file);
  const name = `Nova-Grade-${b.grade}-Term-${b.term}-${b.subject.replace(/[^a-z0-9]+/gi, '-')}.pdf`.replace(/-+/g, '-');
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buf);
}

module.exports = { configured: novaBooks.configured, list, find, gradeNumber, publicView, send, _reset: () => { cache = null; cacheAt = 0; pending = null; } };
