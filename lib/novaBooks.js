// Nova textbooks: the Grade 1-12 books from the private nova-research-curriculum
// repository, each as a printable PDF and a tap-a-word reader page.
// Grades 1-8 have one book per term (id g4-maths-term-1). Grades 9-12 follow the
// FBISE year-long syllabus, so each subject is one book for the whole year
// (id g9-physics, term 0) and may have a teacher answer key (answers.pdf),
// which is only ever sent to teachers (see routes/teacher.js).
//
// The files are read from GitHub on the server with a read-only token, so the
// app repository stays small and always shows the latest pushed books:
//   CURRICULUM_TOKEN  fine-grained GitHub token, read-only "Contents" on that one repo (server only)
//   CURRICULUM_REPO   owner/repo (default novaschool-commits/nova-research-curriculum)
//   CURRICULUM_REF    branch (default main)
// dist/catalog.json in that repository is the allow-list: an id or a path that is
// not in it is never fetched. Students get only their own grade (checked in the routes).
const crypto = require('crypto');
const { jwtSecret } = require('./config');

const env = process.env;
const REPO = env.CURRICULUM_REPO || 'novaschool-commits/nova-research-curriculum';
const REF = env.CURRICULUM_REF || 'main';
const API = (env.CURRICULUM_API_BASE || 'https://api.github.com').replace(/\/$/, '');
const ID = /^g(?:[1-9]|1[0-2])-[a-z0-9-]{1,80}$/;
const FILE = /^dist\/grade-(?:[1-9]|1[0-2])\/[a-z0-9-]{1,80}\/(student\.pdf|reader\.html|answers\.pdf)$/;
// The id, the folder and the term must agree: junior books end in -term-1..3,
// senior (year-long) books have no term in the name and term 0.
function shapeOk(b) {
  const folder = b.pdf.split('/')[2];
  if (b.id !== `g${b.grade}-${folder}` || b.reader !== `dist/grade-${b.grade}/${folder}/reader.html` || b.pdf !== `dist/grade-${b.grade}/${folder}/student.pdf`) return false;
  if (b.answers && b.answers !== `dist/grade-${b.grade}/${folder}/answers.pdf`) return false;
  if (b.grade <= 8) return b.term >= 1 && b.term <= 3 && folder.endsWith(`-term-${b.term}`);
  return b.term === 0 && !/-term-\d$/.test(folder);
}
const CATALOG_TTL = 10 * 60 * 1000;
const FILE_TTL = 6 * 60 * 60 * 1000;
const CACHE_LIMIT = 40 * 1024 * 1024; // bytes kept in memory (the free plan has 512 MB)
const LINK_TTL = 2 * 60 * 60 * 1000;  // a reader link works for two hours
const SUBJECT_ORDER = ['english', 'urdu', 'math', 'general science', 'science', 'physics', 'chemistry', 'biology', 'history', 'islamiyat', 'computer', 'digital', 'economics', 'civics', 'education'];

function configured() { return Boolean(env.CURRICULUM_TOKEN); }

// ---------- fetching from GitHub, with a small in-memory cache ----------

const files = new Map(); // path -> { buf, at }
let cachedBytes = 0;

async function fetchFile(filePath) {
  if (!configured()) throw Object.assign(new Error('Books are not connected yet.'), { status: 503 });
  const url = `${API}/repos/${REPO}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(REF)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${env.CURRICULUM_TOKEN}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nova-school-app' }
    });
    if (!res.ok) {
      console.error(`[novaBooks] GitHub answered ${res.status} for ${filePath}`);
      throw Object.assign(new Error('The book could not be loaded right now. Please try again in a minute.'), { status: 502 });
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err.status) throw err;
    console.error('[novaBooks]', err.name === 'AbortError' ? 'timed out' : err.message);
    throw Object.assign(new Error('The book could not be loaded right now. Please try again in a minute.'), { status: 502 });
  } finally { clearTimeout(timer); }
}

async function getFile(filePath) {
  const hit = files.get(filePath);
  if (hit && Date.now() - hit.at < FILE_TTL) { files.delete(filePath); files.set(filePath, hit); return hit.buf; }
  const buf = await fetchFile(filePath);
  if (hit) { cachedBytes -= hit.buf.length; files.delete(filePath); }
  if (buf.length < CACHE_LIMIT / 4) {
    files.set(filePath, { buf, at: Date.now() }); cachedBytes += buf.length;
    for (const [k, v] of files) { if (cachedBytes <= CACHE_LIMIT) break; files.delete(k); cachedBytes -= v.buf.length; }
  }
  return buf;
}

// ---------- the catalog (allow-list) ----------

let catalog = null; let catalogAt = 0; let pending = null;

function rank(subject) {
  const s = String(subject).toLowerCase();
  const i = SUBJECT_ORDER.findIndex((x) => s.startsWith(x));
  return i === -1 ? SUBJECT_ORDER.length : i;
}

function clean(raw) {
  const list = Array.isArray(raw && raw.books) ? raw.books : [];
  return list
    .filter((b) => b && typeof b.id === 'string' && ID.test(b.id) && typeof b.pdf === 'string' && typeof b.reader === 'string' && FILE.test(b.pdf) && FILE.test(b.reader) && b.pdf.endsWith('student.pdf') && b.reader.endsWith('reader.html')
      && (b.answers === undefined || b.answers === null || (typeof b.answers === 'string' && FILE.test(b.answers) && b.answers.endsWith('answers.pdf'))))
    .map((b) => ({
      id: b.id, grade: Number(b.grade), term: Number(b.term),
      subject: String(b.subject).slice(0, 80), title: String(b.title).slice(0, 80),
      language: b.language === 'ur' ? 'ur' : 'en', chapters: Number(b.chapters) || 0,
      pdf: b.pdf, reader: b.reader, pdfKb: Number(b.pdfKb) || 0, readerKb: Number(b.readerKb) || 0,
      answers: b.answers || null, answersKb: Number(b.answersKb) || 0
    }))
    .filter((b) => Number.isInteger(b.grade) && b.grade >= 1 && b.grade <= 12 && Number.isInteger(b.term) && shapeOk(b))
    .sort((a, b) => a.grade - b.grade || a.term - b.term || rank(a.subject) - rank(b.subject) || a.subject.localeCompare(b.subject));
}

async function load() {
  if (catalog && Date.now() - catalogAt < CATALOG_TTL) return catalog;
  if (!pending) {
    pending = (async () => {
      try {
        const buf = await fetchFile('dist/catalog.json');
        catalog = clean(JSON.parse(buf.toString('utf8'))); catalogAt = Date.now();
      } catch (err) {
        if (!catalog) throw err; // keep serving the last good list if GitHub is briefly unreachable
        console.error('[novaBooks] using the previous catalog:', err.message);
      } finally { pending = null; }
      return catalog;
    })();
  }
  return pending;
}

async function list({ grade } = {}) {
  const all = await load();
  return grade === undefined ? all : all.filter((b) => b.grade === grade);
}

async function find(id) {
  if (typeof id !== 'string' || !ID.test(id)) return null;
  return (await load()).find((b) => b.id === id) || null;
}

// ---------- reader links ----------
// The reader opens in its own tab, where the sign-in token is not sent, so the
// list gives each book a short-lived signed link instead. The link names the
// user and the book; it never contains the session token.

const linkKey = crypto.createHmac('sha256', jwtSecret).update('nova-books-reader-link').digest();

function sign(userId, id, exp) {
  return crypto.createHmac('sha256', linkKey).update(`${userId}.${id}.${exp}`).digest('base64url');
}

function readerLink(userId, id, now = Date.now()) {
  const exp = Math.floor((now + LINK_TTL) / 1000);
  return `/books/read/${id}?u=${encodeURIComponent(userId)}&e=${exp}&s=${sign(userId, id, exp)}`;
}

function checkLink(id, q, now = Date.now()) {
  if (!ID.test(String(id)) || !q || typeof q.s !== 'string' || !/^\d{1,12}$/.test(String(q.u)) || !/^\d{9,11}$/.test(String(q.e))) return false;
  if (Number(q.e) * 1000 < now) return false;
  const want = Buffer.from(sign(String(q.u), id, String(q.e)));
  const got = Buffer.from(q.s);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// teacher: true adds whether an answer key exists (its path is never sent).
function publicView(b, userId, { teacher = false } = {}) {
  const v = { id: b.id, grade: b.grade, term: b.term, subject: b.subject, title: b.title, language: b.language, chapters: b.chapters, pdfKb: b.pdfKb, readerKb: b.readerKb };
  if (teacher && b.answers) { v.hasAnswers = true; v.answersKb = b.answersKb; }
  if (userId !== undefined) v.readerUrl = readerLink(userId, b.id);
  return v;
}

// ---------- sending ----------

function fileName(b, extra = '') {
  const when = b.term ? `-Term-${b.term}` : '';
  return `Nova-Grade-${b.grade}-${b.subject}${when}${extra}.pdf`.replace(/[^a-z0-9.]+/gi, '-').replace(/-+/g, '-');
}

async function sendPdf(res, b) {
  const buf = await getFile(b.pdf);
  const name = fileName(b);
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buf);
}

// Teacher answer key. Only routes/teacher.js calls this; never expose it to students.
async function sendAnswers(res, b) {
  if (!b.answers) throw Object.assign(new Error('This book has no answer key.'), { status: 404 });
  const buf = await getFile(b.answers);
  const name = fileName(b, '-Answer-Key');
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buf);
}

// The reader is our own page (built in the curriculum repo). It gets a strict
// policy of its own: inline script and styles only, Google Fonts, no network
// calls, and it cannot be framed.
const READER_CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com', 'img-src data:', "connect-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"
].join('; ');

async function sendReader(res, b) {
  const buf = await getFile(b.reader);
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Content-Security-Policy', READER_CSP);
  res.set('Referrer-Policy', 'no-referrer');
  res.send(buf);
}

module.exports = {
  configured, list, find, publicView, sendPdf, sendAnswers, sendReader, readerLink, checkLink, getFile,
  _reset: () => { catalog = null; catalogAt = 0; pending = null; files.clear(); cachedBytes = 0; }
};
