// Multi-school isolation through the real API (Phase P3).
//
// Needs a server on a THROWAWAY database prepared with tests/api/run-tenancy.sh:
// demo school A, synthetic school B (tests/api/fixtures_school_b.sql), all
// migrations including the gated row-level security ones, and the app
// connected as a member of nova_app (cannot bypass row-level security).
//
//   bash tests/api/run-tenancy.sh
//
// Every test signs in as one school and tries to reach the other school's
// records by listing, guessing IDs, downloading files, updating, deleting,
// messaging, reading reports and joining a live whiteboard.
const nodeTest = require('node:test');
// Runs only from tests/api/run-tenancy.sh (it needs two schools and row-level security on).
const test = process.env.TENANCY_TEST === 'true' ? nodeTest : nodeTest.skip;
const assert = require('node:assert/strict');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  throw new Error(`Refusing to run against ${BASE}. Use a local server on a disposable database.`);
}
const A = { admin: 'admin@novaschool.pk', teacher: 'teacher@novaschool.pk', student: 'student@novaschool.pk', parent: 'parent@novaschool.pk', pw: 'password123' };
const B = { admin: 'admin@school-b.test', teacher: 'teacher@school-b.test', student: 'student@school-b.test', parent: 'parent@school-b.test', pw: 'schoolbpass1' };
let ipCounter = 10;

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${ipCounter}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) { /* not JSON */ }
  return { status: res.status, data, text: JSON.stringify(data) };
}
const tokens = {};
async function as(school, role) {
  const key = (school === A ? 'A' : 'B') + role;
  if (tokens[key]) return tokens[key];
  ipCounter++;
  const r = await call('/auth/login', { method: 'POST', body: { email: school[role], password: school.pw } });
  assert.equal(r.status, 200, `login ${school[role]}: ${r.text}`);
  tokens[key] = r.data.token;
  return r.data.token;
}
const SECRET = /School B|SecretStudent|SecretParent|B Applicant Secret|school-b\.test|ZB1|Bina|Bilal/;

// IDs of school B records, read as school B (its own view).
let bIds = {};
test('setup: school B can see its own records', async () => {
  const admin = await as(B, 'admin');
  const students = await call('/admin/students', { token: admin });
  assert.equal(students.status, 200, students.text);
  assert.equal(students.data.students.length, 1);
  assert.match(students.text, /SecretStudent/);
  assert.doesNotMatch(students.text, /Aiden|Silva/, 'school B admin must not see school A students');
  const adm = await call('/admin/admissions', { token: admin });
  bIds.admission = adm.data.applications.find(a => /B Applicant Secret/.test(a.applicantName)).id;
  bIds.student = students.data.students[0].id;
  const teacher = await as(B, 'teacher');
  const asg = await call('/teacher/assignments', { token: teacher });
  bIds.assignment = asg.data.assignments[0].id;
  const wbs = await call('/teacher/whiteboards', { token: teacher });
  assert.equal(wbs.status, 200, wbs.text);
  bIds.whiteboard = (wbs.data.whiteboards || [])[0] && wbs.data.whiteboards[0].id;
  const ann = await call('/admin/announcements-all', { token: admin });
  bIds.announcement = ann.data.announcements.find(a => /School B/.test(a.title)).id;
  const me = await call('/auth/me', { token: await as(B, 'parent') });
  bIds.parentUser = me.data.user.id;
  const meT = await call('/auth/me', { token: teacher });
  bIds.teacherUser = meT.data.user.id;
  assert.ok(bIds.admission && bIds.student && bIds.assignment && bIds.announcement);
});

test('lists: school A never sees school B people, applications, announcements or messages', async () => {
  const admin = await as(A, 'admin');
  for (const path of ['/admin/students', '/admin/teachers', '/admin/parents', '/admin/admissions', '/admin/sections',
    '/admin/announcements-all', '/admin/messages', '/admin/overview', '/admin/analytics', '/admin/security/overview',
    '/admin/at-risk-students', '/admin/results/overview', '/admin/reports/exam-summary', '/admin/timetable', '/admin/exams',
    '/admin/live-classes', '/messages/contacts', '/announcements']) {
    const r = await call(path, { token: admin });
    assert.ok(r.status < 500, `${path} -> ${r.status} ${r.text}`);
    assert.doesNotMatch(r.text, SECRET, `${path} leaked school B data`);
  }
  const overview = await call('/admin/overview', { token: admin });
  assert.ok(overview.data.totalStudents > 0);
});

test('lists: school A teacher, student and parent views contain nothing from school B', async () => {
  const checks = [
    ['teacher', ['/teacher/dashboard', '/teacher/assignments', '/teacher/exams', '/teacher/whiteboards', '/teacher/gradebook', '/messages/contacts']],
    ['student', ['/student/dashboard', '/student/assignments', '/student/exams', '/student/report-card', '/student/whiteboards', '/messages/contacts']],
    ['parent', ['/parent/children', '/parent/fees-summary', '/parent/announcements', '/messages/contacts']]
  ];
  for (const [role, paths] of checks) {
    const token = await as(A, role);
    for (const path of paths) {
      const r = await call(path, { token });
      assert.ok(r.status < 500, `${role} ${path} -> ${r.status} ${r.text}`);
      assert.doesNotMatch(r.text, SECRET, `${role} ${path} leaked school B data`);
    }
  }
});

test('guessed IDs: school A cannot read school B records or files by ID', async () => {
  const admin = await as(A, 'admin');
  const doc = await call(`/admin/admissions/${bIds.admission}/document`, { token: admin });
  assert.ok([403, 404].includes(doc.status), `admission document -> ${doc.status}`);
  const teacher = await as(A, 'teacher');
  const subs = await call(`/teacher/assignments/${bIds.assignment}/submissions`, { token: teacher });
  assert.equal(subs.status, 404);
  assert.doesNotMatch(subs.text, SECRET);
  const student = await as(A, 'student');
  const asg = await call(`/student/assignments/${bIds.assignment}`, { token: student });
  assert.ok([403, 404].includes(asg.status), `student assignment -> ${asg.status}`);
  if (bIds.whiteboard) {
    const wb = await call(`/student/whiteboard/${bIds.whiteboard}`, { token: student });
    assert.ok([403, 404].includes(wb.status), `whiteboard -> ${wb.status}`);
  }
  const parent = await as(A, 'parent');
  const card = await call(`/parent/report-card/${bIds.student}`, { token: parent });
  assert.equal(card.status, 403);
  const thread = await call(`/messages/thread/${bIds.teacherUser}`, { token: parent });
  assert.doesNotMatch(thread.text, /School B private message/);
});

test('writes: school A cannot change or delete school B records', async () => {
  const admin = await as(A, 'admin');
  const sus = await call(`/admin/students/${bIds.student}/status`, { method: 'PATCH', token: admin, body: { status: 'suspended' } });
  assert.ok([400, 403, 404].includes(sus.status), `suspend other school's student -> ${sus.status} ${sus.text}`);
  await call(`/admin/announcements/${bIds.announcement}`, { method: 'DELETE', token: admin });
  const out = await call(`/admin/security/force-logout/${bIds.parentUser}`, { method: 'POST', token: admin });
  assert.equal(out.status, 404, 'cannot sign out another school\'s user');
  const decision = await call(`/admin/admissions/${bIds.admission}/decision`, { method: 'POST', token: admin, body: { decision: 'declined' } });
  assert.ok(decision.status >= 400, `decide other school's admission -> ${decision.status}`);
  const teacher = await as(A, 'teacher');
  const grade = await call('/teacher/submissions/999999/grade', { method: 'POST', token: teacher, body: { marks: 1 } });
  assert.equal(grade.status, 404);

  // School B's view is unchanged.
  const bAdmin = await as(B, 'admin');
  const students = await call('/admin/students', { token: bAdmin });
  assert.equal(students.data.students[0].status, 'active', 'school B student must still be active');
  const ann = await call('/admin/announcements-all', { token: bAdmin });
  assert.ok(ann.data.announcements.some(a => a.id === bIds.announcement), 'school B announcement must still exist');
  const adm = await call('/admin/admissions', { token: bAdmin });
  assert.equal(adm.data.applications.find(a => a.id === bIds.admission).status, 'pending');
  const me = await call('/auth/me', { token: await as(B, 'parent') });
  assert.equal(me.status, 200, 'school B parent must still be signed in');
});

test('messages: school A cannot message school B people', async () => {
  const admin = await as(A, 'admin');
  const r = await call('/messages', { method: 'POST', token: admin, body: { recipient_id: bIds.parentUser, body: 'cross-school test' } });
  assert.equal(r.status, 403);
  const g = await call('/messages/group', { method: 'POST', token: admin, body: { recipient_ids: [bIds.parentUser, bIds.teacherUser], body: 'x' } });
  assert.equal(g.status, 403);
});

test('new records land in the creator\'s school only', async () => {
  const aAdmin = await as(A, 'admin');
  const title = 'Isolation check ' + Date.now();
  const r = await call('/admin/announcements', { method: 'POST', token: aAdmin, body: { title, body: 'A only', audience: 'all' } });
  assert.ok(r.status < 300, r.text);
  const bAdmin = await as(B, 'admin');
  const bList = await call('/admin/announcements-all', { token: bAdmin });
  assert.ok(!bList.text.includes(title), 'school B must not see school A\'s new announcement');
  const aList = await call('/admin/announcements-all', { token: aAdmin });
  assert.ok(aList.text.includes(title));

  const email = `iso.${Date.now()}@test.invalid`;
  const t = await call('/admin/teachers', { method: 'POST', token: bAdmin, body: { first_name: 'Newb', last_name: 'Teacher', email, password: 'longpassword1', subject: 'Maths' } });
  assert.equal(t.status, 201, t.text);
  const login = await call('/auth/login', { method: 'POST', body: { email, password: 'longpassword1' } });
  assert.equal(login.status, 200, 'a teacher created by school B can sign in');
  const bTeachers = await call('/admin/teachers', { token: bAdmin });
  assert.ok(bTeachers.text.includes(email));
  const aTeachers = await call('/admin/teachers', { token: aAdmin });
  assert.ok(!aTeachers.text.includes(email), 'school A must not see school B\'s new teacher');

  const dup = await call('/admin/teachers', { method: 'POST', token: aAdmin, body: { first_name: 'Dup', last_name: 'Email', email: B.teacher, password: 'longpassword1' } });
  assert.equal(dup.status, 409, 'emails are unique across schools and the clash is reported, not a server error');
});

test('a token cannot be moved to another school', async () => {
  const token = await as(B, 'teacher');
  const [h, p, s] = token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  payload.ins = 1;
  const forged = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), s].join('.');
  const r = await call('/teacher/dashboard', { token: forged });
  assert.equal(r.status, 401, 'changed token is rejected by its signature');
});

test('WebSocket: a school A student cannot join a school B whiteboard', async (t) => {
  if (typeof WebSocket === 'undefined' || !bIds.whiteboard) { t.skip('needs Node 22+ and a school B whiteboard'); return; }
  const token = await as(A, 'student');
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws/whiteboard');
  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no reply')), 5000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', token, whiteboardId: bIds.whiteboard }));
    ws.onmessage = (e) => { clearTimeout(timer); resolve(JSON.parse(e.data)); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('socket error')); };
  });
  ws.close();
  assert.equal(reply.type, 'error');
});

test('public pages act for the public school only', async () => {
  const r = await call('/public/announcements');
  assert.ok(r.status < 500, r.text);
  assert.doesNotMatch(r.text, SECRET);
});
