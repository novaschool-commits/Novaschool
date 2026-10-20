// API security and regression tests. They change data, so run them ONLY
// against a server on a disposable database filled with demo data:
//
//   1. Create a throwaway local database (or a new Neon branch you will delete).
//   2. DATABASE_URL=<that database> SEED_DEMO=true JWT_SECRET=<40+ random chars> npm start
//   3. In another session: BASE_URL=http://localhost:3000 npm run test:api
//
// Uses only Node's built-in test runner and fetch (Node 18+). The WebSocket
// test needs Node 22+ (global WebSocket) and is skipped otherwise.
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) && process.env.ALLOW_REMOTE_TEST !== 'true') {
  throw new Error(`Refusing to run data-changing tests against ${BASE}. Use a local server on a disposable database.`);
}
const DEMO_PASSWORD = 'password123';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
const uniq = () => Math.random().toString(36).slice(2, 8);

async function call(path, { method = 'GET', token, body, ip } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['X-Forwarded-For'] = ip; // trusted from the first proxy hop only
  const res = await fetch(BASE + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) { /* not JSON */ }
  return { status: res.status, data, headers: res.headers };
}
async function login(email, password = DEMO_PASSWORD, ip) {
  const r = await call('/auth/login', { method: 'POST', body: { email, password }, ip });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

test('S12/S13: health check reveals no counts; security headers are set', async () => {
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.data), ['status']);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('S13: cross-origin requests get no CORS permission by default', async () => {
  const res = await fetch(BASE + '/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('S1: admission with a script in the photo field is refused', async () => {
  const r = await call('/admissions/apply', { method: 'POST', ip: '198.51.100.10', body: {
    applicant_name: 'Test ' + uniq(), grade_applied: 'Grade 8', parent_email: 'p@test.invalid', contact_phone: '0300',
    photo_base64: 'x" onerror="alert(1)', document_base64: PDF } });
  assert.equal(r.status, 400);
});

test('S1: a document that is not PDF, Word or image is refused', async () => {
  const r = await call('/admissions/apply', { method: 'POST', ip: '198.51.100.11', body: {
    applicant_name: 'Test ' + uniq(), grade_applied: 'Grade 8', parent_email: 'p@test.invalid', contact_phone: '0300',
    photo_base64: PNG, document_base64: Buffer.from('<html><script>alert(1)</script>').toString('base64') } });
  assert.equal(r.status, 400);
});

test('S8: valid application gets a one-time entrance-test token', async () => {
  const r = await call('/admissions/apply', { method: 'POST', ip: '198.51.100.12', body: {
    applicant_name: 'Valid ' + uniq(), grade_applied: 'Grade 8', parent_email: 'p@test.invalid', contact_phone: '0300',
    photo_base64: PNG, document_base64: PDF, document_filename: '../../cv".pdf' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.entranceToken, /^[0-9a-f]{48}$/);
  const id = r.data.applicationId;
  const noToken = await call(`/admissions/${id}/entrance-test`, { method: 'POST', ip: '198.51.100.12', body: { answers: [] } });
  assert.equal(noToken.status, 403);
  const first = await call(`/admissions/${id}/entrance-test`, { method: 'POST', ip: '198.51.100.12', body: { answers: [], entrance_token: r.data.entranceToken } });
  if (first.status === 404) return; // no questions configured on this database
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const second = await call(`/admissions/${id}/entrance-test`, { method: 'POST', ip: '198.51.100.12', body: { answers: [], entrance_token: r.data.entranceToken } });
  assert.equal(second.status, 403);
});

test('S3: public application form is rate limited per connection', async () => {
  const ip = '198.51.100.' + (50 + Math.floor(Math.random() * 100));
  let last;
  for (let i = 0; i < 6; i++) {
    last = await call('/admissions/apply', { method: 'POST', ip, body: { applicant_name: '' } }); // invalid, but counted
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});

test('S4: suspending a student ends their existing session', async () => {
  const admin = await login('admin@novaschool.pk');
  const sections = await call('/admin/sections', { token: admin });
  const sectionCode = sections.data.sections[0].sectionCode;
  const email = `s.${uniq()}@test.invalid`;
  const created = await call('/admin/students', { method: 'POST', token: admin, body: {
    first_name: 'Suspend', last_name: 'Me', admission_no: 'T-' + uniq(), section_code: sectionCode, email, password: 'longpassword1' } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const student = await login(email, 'longpassword1');
  assert.equal((await call('/auth/me', { token: student })).status, 200);
  const s = await call(`/admin/students/${created.data.studentId}/status`, { method: 'PATCH', token: admin, body: { status: 'suspended' } });
  assert.equal(s.status, 200);
  assert.equal((await call('/auth/me', { token: student })).status, 401);
});

test('S4: changing a password signs out other devices and keeps this one', async () => {
  const admin = await login('admin@novaschool.pk');
  const sections = await call('/admin/sections', { token: admin });
  const email = `p.${uniq()}@test.invalid`;
  const created = await call('/admin/students', { method: 'POST', token: admin, body: {
    first_name: 'Pass', last_name: 'Change', admission_no: 'T-' + uniq(), section_code: sections.data.sections[0].sectionCode, email, password: 'firstpassword1' } });
  assert.equal(created.status, 201);
  const phone = await login(email, 'firstpassword1');
  const laptop = await login(email, 'firstpassword1');
  const r = await call('/auth/change-password', { method: 'POST', token: phone, body: { currentPassword: 'firstpassword1', newPassword: 'secondpassword2' } });
  assert.equal(r.status, 200);
  assert.ok(r.data.token);
  assert.equal((await call('/auth/me', { token: laptop })).status, 401);
  assert.equal((await call('/auth/me', { token: phone })).status, 401);
  assert.equal((await call('/auth/me', { token: r.data.token })).status, 200);
});

test('S4: a tampered or unsigned token is refused', async () => {
  const token = await login('student@novaschool.pk');
  const [h, p, s] = token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  payload.role = 'admin';
  const forged = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), s].join('.');
  assert.equal((await call('/admin/overview', { token: forged })).status, 401);
  const none = [Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url'), p, ''].join('.');
  assert.equal((await call('/auth/me', { token: none })).status, 401);
});

test('S7: a teacher cannot set homework or start a class in a section they do not teach', async () => {
  const admin = await login('admin@novaschool.pk');
  const teacher = await login('teacher@novaschool.pk');
  const mine = (await call('/teacher/dashboard', { token: teacher })).data.mySections || [];
  let other = (await call('/admin/sections', { token: admin })).data.sections.map(s => s.sectionCode).find(c => !mine.includes(c));
  if (!other) {
    other = 'Z' + uniq().slice(0, 3).toUpperCase();
    const mk = await call('/admin/sections', { method: 'POST', token: admin, body: { section_code: other, grade: 'Grade 9', name: 'Z' } });
    assert.ok([200, 201].includes(mk.status), JSON.stringify(mk.data));
  }
  const hw = await call('/teacher/assignments', { method: 'POST', token: teacher, body: { title: 'x', subject: 'Math', section_code: other } });
  assert.equal(hw.status, 403);
  const live = await call('/teacher/live-session/start', { method: 'POST', token: teacher, body: { section_code: other } });
  assert.equal(live.status, 403);
});

test('S10: reading private messages needs messages.oversee (admin has it)', async () => {
  const admin = await login('admin@novaschool.pk');
  assert.equal((await call('/admin/messages', { token: admin })).status, 200);
  const teacher = await login('teacher@novaschool.pk');
  assert.equal((await call('/admin/messages', { token: teacher })).status, 403);
});

test('Bug fix: an auto-marked test reaches the gradebook', async (t) => {
  const teacher = await login('teacher@novaschool.pk');
  const student = await login('student@novaschool.pk');
  const me = (await call('/auth/me', { token: student })).data.user;
  const mine = (await call('/teacher/dashboard', { token: teacher })).data.mySections || [];
  if (!mine.includes(me.profile.section_code)) return t.skip('demo teacher does not teach the demo student');
  const title = 'Auto ' + uniq();
  const ex = await call('/teacher/exams', { method: 'POST', token: teacher, body: { title, subject: 'Mathematics', section_code: me.profile.section_code, duration_minutes: 10 } });
  assert.equal(ex.status, 201, JSON.stringify(ex.data));
  const q = await call(`/teacher/exams/${ex.data.examId}/questions`, { method: 'POST', token: teacher, body: { question_text: '2+2?', question_type: 'mcq', options: ['3', '4'], correct_answer: '4', marks: 1 } });
  assert.equal(q.status, 201);
  assert.equal((await call(`/teacher/exams/${ex.data.examId}/publish`, { method: 'POST', token: teacher })).status, 200);
  const start = await call(`/student/exams/${ex.data.examId}/start`, { method: 'POST', token: student });
  assert.equal(start.status, 200);
  const sub = await call(`/student/exams/${ex.data.examId}/submit`, { method: 'POST', token: student, body: { answers: [{ question_id: start.data.questions[0].id, answer: '4' }] } });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  const gb = await call('/teacher/gradebook', { token: teacher });
  assert.ok(gb.data.grades.some(g => g.assessment === `Test: ${title}` && g.score === '1/1'), 'grade row written');
});

test('S4/S11: WebSocket refuses a revoked session', async (t) => {
  if (typeof WebSocket === 'undefined') return t.skip('needs Node 22+');
  const admin = await login('admin@novaschool.pk');
  const teacher = await login('teacher@novaschool.pk');
  const me = (await call('/auth/me', { token: teacher })).data.user;
  assert.equal((await call(`/admin/security/force-logout/${me.id}`, { method: 'POST', token: admin })).status, 200);
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws/whiteboard');
  const reply = await new Promise((resolve, reject) => {
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', token: teacher, whiteboardId: 1 }));
    ws.onmessage = e => resolve(JSON.parse(e.data));
    ws.onerror = reject;
    setTimeout(() => reject(new Error('timeout')), 5000);
  });
  ws.close();
  assert.equal(reply.type, 'error');
});

// Last, because it uses up this connection's sign-in allowance.
test('Parent result card: own child only', async () => {
  const parent = await login('parent@novaschool.pk', DEMO_PASSWORD, '198.51.100.40');
  const kids = await call('/parent/children', { token: parent });
  assert.equal(kids.status, 200);
  assert.ok(kids.data.children.length > 0, 'demo parent should have a linked child');
  const childId = kids.data.children[0].id;

  const own = await call(`/parent/report-card/${childId}`, { token: parent });
  assert.equal(own.status, 200);
  assert.ok(Array.isArray(own.data.grades));
  assert.ok(own.data.student && own.data.student.name);

  const admin = await login('admin@novaschool.pk', DEMO_PASSWORD, '198.51.100.41');
  const all = await call('/admin/students', { token: admin });
  const other = (all.data.students || []).find(s => !kids.data.children.some(c => c.id === s.id));
  if (other) {
    const r = await call(`/parent/report-card/${other.id}`, { token: parent });
    assert.equal(r.status, 403, 'a parent must not see another family\'s child');
  }
  assert.equal((await call('/parent/report-card/abc', { token: parent })).status, 400);

  const student = await login('student@novaschool.pk', DEMO_PASSWORD, '198.51.100.42');
  assert.equal((await call(`/parent/report-card/${childId}`, { token: student })).status, 403);
  const mine = await call('/student/report-card', { token: student });
  assert.equal(mine.status, 200, 'student report card still works after the refactor');
});

test('S2: repeated wrong passwords are blocked with 429', async () => {
  const ip = '203.0.113.' + Math.floor(Math.random() * 200);
  const email = `nobody.${uniq()}@test.invalid`;
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await call('/auth/login', { method: 'POST', ip, body: { email, password: 'wrong-password' } })).status);
  assert.deepEqual(codes.slice(0, 8), Array(8).fill(401));
  assert.equal(codes[8], 429);
});
