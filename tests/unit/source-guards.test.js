// Regression guards that read the source, so a fixed problem cannot quietly
// come back. They are not a substitute for the API tests in tests/api/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('S1: the page never builds an image address from raw applicant data', () => {
  const html = read('public/index.html');
  assert.equal(/data:image\/\*;base64,\$\{/.test(html), false);
  assert.ok(html.includes('function safeImageSrc('));
  assert.equal((html.match(/safeImageSrc\(app\.photoBase64\)/g) || []).length, 6); // 3 places, test + use
});

test('S1: admin message oversight escapes message bodies', () => {
  const html = read('public/index.html');
  assert.ok(html.includes('<div class="l-sub">${escapeHtml(m.body)}</div>'));
});

test('S1: public forms validate uploads on the server', () => {
  const js = read('routes/common.js');
  assert.ok(js.includes("router.post('/admissions/apply', applyLimit"));
  assert.ok(js.includes("router.post('/teacher-applications/apply', applyLimit"));
  assert.equal((js.match(/validateUploads\(photo_base64, document_base64/g) || []).length, 2);
});

test('S4: sessions are verified against the database, including WebSocket joins', () => {
  assert.ok(read('ws/whiteboard.js').includes('await verifySession(msg.token)'));
  assert.equal(/jwt\.verify\(/.test(read('ws/whiteboard.js')), false);
  const admin = read('routes/admin.js');
  assert.equal((admin.match(/revokeSessions\(/g) || []).length, 3);
  assert.ok(read('routes/auth.js').includes('token_version = token_version + 1'));
});

test('S5: demo data is never created by a normal start', () => {
  const server = read('server.js');
  assert.ok(/if \(config\.seedDemo\)/.test(server));
  assert.ok(read('db/seed.js').includes("process.env.SEED_DEMO !== 'true'"));
});

test('S6: no hard-coded JWT fallback secret remains', () => {
  for (const f of ['middleware/auth.js', 'ws/whiteboard.js', 'routes/admin.js', 'routes/auth.js']) {
    assert.equal(read(f).includes("'novaschool-dev-secret-change-me'"), false, f);
  }
});

test('S7: teacher routes that take a section check the teacher teaches it', () => {
  const t = read('routes/teacher.js');
  assert.ok((t.match(/teachesSection\(teacher\.id, section_code\)/g) || []).length >= 2);
  assert.ok(read('routes/lab.js').includes('A teacher may assign labs only to sections they teach'));
});

test('S12: the public health check does not reveal counts', () => {
  assert.equal(read('app.js').includes('studentsInDatabase'), false);
});

test('Grade bug: auto-marked tests load the subject before writing the grade', () => {
  assert.ok(read('routes/student.js').includes("SELECT title, subject FROM exams WHERE id = $1"));
});

test('student answers and file names are escaped in teacher marking views', () => {
  const html = read('public/index.html');
  assert.equal(/\$\{a\.student_answer \|\|/.test(html), false, 'raw student_answer must not be placed in HTML');
  assert.ok(html.includes('${escapeHtml(s.body_text)}'));
  assert.ok(html.includes('Download ${escapeHtml(s.file_name)}'));
});

test('Phase P3: routes and the whiteboard never bypass the per-request school scope', () => {
  const fs = require('fs');
  const files = [...fs.readdirSync('routes').map(f => 'routes/' + f), 'ws/whiteboard.js', 'middleware/auth.js', 'middleware/permissions.js'];
  for (const f of files) {
    const src = read(f);
    assert.equal(/\bpool\b/.test(src), false, `${f} must use get/all/run/withTransaction, not the pool directly`);
  }
  assert.ok(read('app.js').includes("app.use('/api', tenantScope("), 'every /api request runs in a school scope');
  assert.ok(read('ws/whiteboard.js').includes('runInTenant(ctx, () => handleMessage(raw))'), 'every whiteboard message runs in a school scope');
});

test('Phase P3: every new login gets a school membership in the same transaction', () => {
  for (const f of ['routes/admin.js', 'routes/management.js']) {
    const src = read(f);
    const parts = src.split('INSERT INTO users').slice(1);
    assert.ok(parts.length > 0);
    for (const after of parts) {
      assert.ok(after.slice(0, 400).includes('INSERT INTO institution_memberships'), `${f}: a users insert without a membership`);
    }
  }
});
