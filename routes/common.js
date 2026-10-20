const express = require('express');
const { all, get, run } = require('../db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { notifyStaffWithPermission, userHasPermission, notifyAdmin } = require('../middleware/permissions');
const crypto = require('crypto');
const { checkImage, checkDocument, cleanFileName } = require('../lib/validate');
const { createLimiter, limitByIp } = require('../lib/rateLimit');

// Public forms: at most 5 applications and 10 test submissions per IP per hour
// (finding S3).
const applyLimit = limitByIp(createLimiter({ windowMs: 60 * 60 * 1000, max: 5 }), 'Too many applications from this connection. Please try again later.');
const testLimit = limitByIp(createLimiter({ windowMs: 60 * 60 * 1000, max: 10 }), 'Too many attempts from this connection. Please try again later.');

function textField(v, max) {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null;
}

// Validates the uploaded photo and document (finding S1): only real images
// and real PDF / Word / image documents are stored.
function validateUploads(photo, doc, { photoRequired, docRequired }) {
  if (photo) { const r = checkImage(photo); if (!r.ok) return r.reason === 'too_large' ? 'The photo is too large. Please use one under 3.5 MB.' : 'The photo must be a JPEG, PNG or WebP image.'; }
  else if (photoRequired) return 'A photo is required.';
  if (doc) { const r = checkDocument(doc); if (!r.ok) return r.reason === 'too_large' ? 'The document is too large. Please use one under 3.5 MB.' : 'The document must be a PDF, Word file or image.'; }
  else if (docRequired) return 'A document is required.';
  return null;
}

const router = express.Router();

// Basic guard so someone can't stuff a giant file into the database — this
// stores uploads inline (base64) since there's no cloud storage wired up yet.
// Fine for a small school; swap for real object storage (S3/GCS) once volume grows.

async function gradeEntranceAnswers(testType, answers) {
  const questions = await all('SELECT * FROM entrance_test_questions WHERE test_type = $1', [testType]);
  if (!questions.length) return null;
  const qMap = {};
  questions.forEach(q => { qMap[q.id] = q; });
  let score = 0;
  (answers || []).forEach(a => {
    const q = qMap[a.question_id];
    if (q && (a.answer || '').trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase()) score += 1;
  });
  return `${score}/${questions.length}`;
}

// ---------- Public news / announcements (no login required) ----------
router.get('/public/announcements', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT title, body, created_at FROM announcements WHERE audience = 'all' ORDER BY created_at DESC LIMIT 12`
  );
  res.json({ announcements: rows });
}));

// ---------- Public platform stats (no login required) ----------
// Real counts for the homepage stats band — no invented numbers.
router.get('/public/stats', asyncHandler(async (req, res) => {
  const [students, teachers, courses, attempts] = await Promise.all([
    get(`SELECT COUNT(*)::int AS c FROM students`),
    get(`SELECT COUNT(*)::int AS c FROM teachers`),
    get(`SELECT COUNT(*)::int AS c FROM courses`),
    get(`SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE total_score > 0 AND auto_score / total_score >= 0.5)::int AS passing
         FROM exam_attempts WHERE status = 'graded' AND total_score > 0`)
  ]);
  const successRate = attempts && attempts.total > 0 ? Math.round((attempts.passing / attempts.total) * 100) : null;
  res.json({
    students: students ? students.c : 0,
    teachers: teachers ? teachers.c : 0,
    courses: courses ? courses.c : 0,
    successRate
  });
}));

// ---------- Public course catalog (no login required) ----------
// Same courses table the student dashboard reads from — just without
// per-student progress, since there's no logged-in student to attach it to.
router.get('/public/courses', asyncHandler(async (req, res) => {
  const { subject, curriculum, level } = req.query;
  const conditions = ["c.status = 'published'"];
  const params = [];
  let idx = 1;
  if (subject) { conditions.push(`c.subject = $${idx++}`); params.push(subject); }
  if (curriculum) { conditions.push(`c.curriculum = $${idx++}`); params.push(curriculum); }
  if (level) { conditions.push(`c.level = $${idx++}`); params.push(level); }
  const where = 'WHERE ' + conditions.join(' AND ');

  const courses = await all(
    `SELECT c.id, c.subject, c.curriculum, c.level, c.title, c.description,
            t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
            (SELECT COUNT(*) FROM course_lessons cl JOIN course_topics ct ON ct.id = cl.topic_id WHERE ct.course_id = c.id) AS lesson_count
     FROM courses c LEFT JOIN teachers t ON t.id = c.owner_teacher_id
     ${where}
     ORDER BY c.subject, c.curriculum, c.level
     LIMIT 24`,
    params
  );

  res.json({ courses: courses.map(c => ({
    id: c.id, subject: c.subject, curriculum: c.curriculum, level: c.level,
    title: c.title, description: c.description,
    teacher: c.teacher_first_name ? `${c.teacher_first_name} ${c.teacher_last_name}` : null,
    lessonCount: Number(c.lesson_count)
  })) });
}));

// ---------- Public entrance/screening test (no login required) ----------
router.get('/entrance-test/:type', asyncHandler(async (req, res) => {
  const type = req.params.type === 'teacher' ? 'teacher_recruitment' : 'student_admission';
  const questions = await all(
    'SELECT id, question_text, options FROM entrance_test_questions WHERE test_type = $1 ORDER BY position, id',
    [type]
  );
  res.json({ questions });
}));

// ---------- Student admission application (no login required) ----------
// Fee schedule:
//  Pakistani curriculum: Grade 1-5 -> Rs 500/month, Grade 6-12 -> Rs 1000/month
//  International (UK/O-Level/A-Level): lower classes -> $5/month, senior -> $10/month
//  "Senior" = grade number > 5, or any O Level/AS Level/A Level/IGCSE label.
function computeMonthlyFee(curriculum, gradeApplied) {
  const g = (gradeApplied || '').toLowerCase();
  const numMatch = g.match(/(\d+)/);
  const gradeNum = numMatch ? parseInt(numMatch[1], 10) : null;
  const isSenior = gradeNum !== null ? gradeNum > 5 : /o level|as level|a level|igcse/.test(g);
  if ((curriculum || '').toLowerCase().startsWith('international')) {
    return { amount: isSenior ? 10 : 5, currency: 'USD' };
  }
  return { amount: isSenior ? 1000 : 500, currency: 'PKR' };
}

router.post('/admissions/apply', applyLimit, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const applicant_name = textField(body.applicant_name, 120);
  const grade_applied = textField(body.grade_applied, 40);
  const parent_email = textField(body.parent_email, 254);
  const contact_phone = textField(body.contact_phone, 30);
  const guardian_id = textField(body.guardian_id, 40);
  const curriculum = textField(body.curriculum, 60);
  const { photo_base64, document_base64 } = body;
  if (!applicant_name || !grade_applied || !parent_email || !contact_phone) {
    return res.status(400).json({ error: 'Student name, grade, parent email, and a contact phone number are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent_email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!photo_base64 || !document_base64) {
    return res.status(400).json({ error: 'A student photo and the student bio-data or a supporting document are required.' });
  }
  const uploadError = validateUploads(photo_base64, document_base64, { photoRequired: true, docRequired: true });
  if (uploadError) return res.status(400).json({ error: uploadError });

  const fee = computeMonthlyFee(curriculum, grade_applied);
  const entranceToken = crypto.randomBytes(24).toString('hex');

  const r = await run(
    `INSERT INTO admission_applications
       (applicant_name, grade_applied, parent_email, status, photo_base64, document_base64, document_filename, curriculum, monthly_fee, fee_currency, contact_phone, guardian_id, entrance_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [applicant_name, grade_applied, parent_email, 'pending', photo_base64.trim(), document_base64.trim(), cleanFileName(body.document_filename), curriculum || 'Pakistani', fee.amount, fee.currency, contact_phone, guardian_id, entranceToken]
  );
  await notifyStaffWithPermission('students.view', 'admission.applied', `New admission application from ${applicant_name} (Grade ${grade_applied}).`, 'students');
  await notifyAdmin('admission.applied', `New admission application from ${applicant_name} (Grade ${grade_applied}).`, 'normal', 'overview');
  res.status(201).json({
    message: `Application received for ${applicant_name}. The school will reach out to ${parent_email} within 5 business days.`,
    applicationId: r.rows[0].id,
    entranceToken,
    voucher: { applicantName: applicant_name, gradeApplied: grade_applied, curriculum: curriculum || 'Pakistani', amount: fee.amount, currency: fee.currency }
  });
}));

// One attempt per application, proven by the token returned at application
// time (finding S8). The token is cleared once used.
async function submitEntranceTest(table, testType, req, res) {
  const id = Number(req.params.id);
  const token = (req.body || {}).entrance_token;
  if (!Number.isInteger(id) || typeof token !== 'string' || token.length !== 48) {
    return res.status(403).json({ error: 'This test link is not valid.' });
  }
  const application = await get(`SELECT id, entrance_token, entrance_score FROM ${table} WHERE id = $1`, [id]);
  if (!application || !application.entrance_token || application.entrance_score !== null ||
      !crypto.timingSafeEqual(Buffer.from(application.entrance_token), Buffer.from(token))) {
    return res.status(403).json({ error: 'This test has already been taken or the link is not valid.' });
  }
  const score = await gradeEntranceAnswers(testType, (req.body || {}).answers);
  if (score === null) return res.status(404).json({ error: 'No entrance test is set up yet.' });
  const upd = await run(
    `UPDATE ${table} SET entrance_score = $1, entrance_token = NULL WHERE id = $2 AND entrance_token = $3 AND entrance_score IS NULL`,
    [score, id, token]
  );
  if (upd.rowCount !== 1) return res.status(409).json({ error: 'This test has already been submitted.' });
  res.json({ message: `Entrance test submitted. Score: ${score}.`, score });
}

router.post('/admissions/:id/entrance-test', testLimit, asyncHandler((req, res) =>
  submitEntranceTest('admission_applications', 'student_admission', req, res)));

// ---------- Teacher recruitment application (no login required) ----------
router.post('/teacher-applications/apply', applyLimit, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const applicant_name = textField(body.applicant_name, 120);
  const subject_applied = textField(body.subject_applied, 80);
  const email = textField(body.email, 254);
  const phone = textField(body.phone, 30);
  const co_curricular = textField(body.co_curricular, 2000);
  const { photo_base64, document_base64 } = body;
  if (!applicant_name || !subject_applied || !email || !phone) {
    return res.status(400).json({ error: 'Name, subject, email, and phone are all required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!photo_base64) return res.status(400).json({ error: 'A photo is required.' });
  if (!document_base64) return res.status(400).json({ error: 'A CV (PDF preferred) is required.' });
  const uploadError = validateUploads(photo_base64, document_base64, { photoRequired: true, docRequired: true });
  if (uploadError) return res.status(400).json({ error: uploadError });

  const entranceToken = crypto.randomBytes(24).toString('hex');
  const r = await run(
    'INSERT INTO teacher_applications (applicant_name, subject_applied, email, phone, status, photo_base64, document_base64, document_filename, co_curricular, entrance_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [applicant_name, subject_applied, email, phone, 'pending', photo_base64.trim(), document_base64.trim(), cleanFileName(body.document_filename), co_curricular, entranceToken]
  );
  await notifyStaffWithPermission('teachers.view', 'teacher_application.applied', `New teacher application from ${applicant_name} (${subject_applied}).`, 'teachers');
  await notifyAdmin('teacher_application.applied', `New teacher application from ${applicant_name} (${subject_applied}).`, 'normal', 'overview');
  res.status(201).json({
    message: `Application received for ${applicant_name}. The school will be in touch at ${email}.`,
    applicationId: r.rows[0].id,
    entranceToken
  });
}));

router.post('/teacher-applications/:id/entrance-test', testLimit, asyncHandler((req, res) =>
  submitEntranceTest('teacher_applications', 'teacher_recruitment', req, res)));

// Any logged-in role can see announcements addressed to "all" plus their own audience.
router.get('/announcements', authenticate, asyncHandler(async (req, res) => {
  const audience = req.user.role === 'student' ? 'students'
    : req.user.role === 'parent' ? 'parents'
    : req.user.role === 'teacher' ? 'teachers'
    : 'all';

  const rows = await all(
    `SELECT title, body, created_at FROM announcements
     WHERE audience IN ('all', $1) ORDER BY created_at DESC LIMIT 10`,
    [audience]
  );

  res.json({ announcements: rows });
}));

// ---------- Messaging (shared across all roles) ----------

async function resolvePerson(userId) {
  const tables = [['students', 'student'], ['parents', 'parent'], ['teachers', 'teacher'], ['admins', 'admin']];
  for (const [table, role] of tables) {
    const row = await get(`SELECT first_name, last_name FROM ${table} WHERE user_id = $1`, [userId]);
    if (row) return { userId, name: `${row.first_name} ${row.last_name}`, role };
  }
  const staffRow = await get(
    `SELECT s.first_name, s.last_name, sr.name AS role_name FROM staff s
     LEFT JOIN staff_roles sr ON sr.id = s.staff_role_id WHERE s.user_id = $1 AND s.status = 'active'`,
    [userId]
  );
  if (staffRow) return { userId, name: `${staffRow.first_name} ${staffRow.last_name}`, role: staffRow.role_name || 'Staff' };
  return { userId, name: 'Unknown', role: '' };
}

// Who is this person allowed to message? Kept deliberately restrictive —
// students and parents can only reach teachers/admin/management staff, not
// each other directly. Staff reach mirrors admin's — same trust level,
// since they're admin-invited management-team members — not narrowed to
// their specific permissions, to keep this simple.
async function getActiveStaffUserIds() {
  const rows = await all(`SELECT user_id FROM staff WHERE status = 'active' AND user_id IS NOT NULL`);
  return rows.map(r => r.user_id);
}

async function getAllowedContacts(user) {
  if (user.role === 'student') {
    const student = await get('SELECT * FROM students WHERE user_id = $1', [user.id]);
    if (!student) return [];
    const teacherRows = await all(
      `SELECT DISTINCT t.user_id FROM timetable tt JOIN teachers t ON t.id = tt.teacher_id WHERE tt.section_code = $1 AND t.user_id IS NOT NULL`,
      [student.section_code]
    );
    const adminRows = await all('SELECT user_id FROM admins WHERE user_id IS NOT NULL');
    return [...teacherRows.map(r => r.user_id), ...adminRows.map(r => r.user_id), ...(await getActiveStaffUserIds())];
  }
  if (user.role === 'parent') {
    const parent = await get('SELECT * FROM parents WHERE user_id = $1', [user.id]);
    if (!parent) return [];
    const teacherRows = await all(
      `SELECT DISTINCT t.user_id FROM student_parent_map m
       JOIN students st ON st.id = m.student_id
       JOIN timetable tt ON tt.section_code = st.section_code
       JOIN teachers t ON t.id = tt.teacher_id
       WHERE m.parent_id = $1 AND t.user_id IS NOT NULL`,
      [parent.id]
    );
    const adminRows = await all('SELECT user_id FROM admins WHERE user_id IS NOT NULL');
    return [...teacherRows.map(r => r.user_id), ...adminRows.map(r => r.user_id), ...(await getActiveStaffUserIds())];
  }
  if (user.role === 'teacher') {
    const teacher = await get('SELECT * FROM teachers WHERE user_id = $1', [user.id]);
    if (!teacher) return [];
    const sectionRows = await all('SELECT DISTINCT section_code FROM timetable WHERE teacher_id = $1', [teacher.id]);
    const sectionCodes = sectionRows.map(r => r.section_code);
    const adminRows = await all('SELECT user_id FROM admins WHERE user_id IS NOT NULL');
    const staffIds = await getActiveStaffUserIds();
    if (!sectionCodes.length) {
      return [...adminRows.map(r => r.user_id), ...staffIds];
    }
    const placeholders = sectionCodes.map((_, i) => `$${i + 1}`).join(',');
    const studentRows = await all(`SELECT user_id FROM students WHERE section_code IN (${placeholders}) AND user_id IS NOT NULL`, sectionCodes);
    const parentRows = await all(
      `SELECT DISTINCT p.user_id FROM student_parent_map m
       JOIN students st ON st.id = m.student_id JOIN parents p ON p.id = m.parent_id
       WHERE st.section_code IN (${placeholders}) AND p.user_id IS NOT NULL`,
      sectionCodes
    );
    return [...studentRows.map(r => r.user_id), ...parentRows.map(r => r.user_id), ...adminRows.map(r => r.user_id), ...staffIds];
  }
  if (user.role === 'admin' || user.role === 'staff') {
    const teacherRows = await all('SELECT user_id FROM teachers WHERE user_id IS NOT NULL');
    const parentRows = await all('SELECT user_id FROM parents WHERE user_id IS NOT NULL');
    const studentRows = await all('SELECT user_id FROM students WHERE user_id IS NOT NULL');
    const staffIds = (await getActiveStaffUserIds()).filter(id => id !== user.id); // don't list yourself
    const adminRows = await all('SELECT user_id FROM admins WHERE user_id IS NOT NULL');
    return [...teacherRows.map(r => r.user_id), ...parentRows.map(r => r.user_id), ...studentRows.map(r => r.user_id), ...staffIds, ...adminRows.map(r => r.user_id)];
  }
  return [];
}

router.get('/messages/contacts', authenticate, asyncHandler(async (req, res) => {
  const ids = [...new Set(await getAllowedContacts(req.user))];
  const contacts = [];
  for (const id of ids) contacts.push(await resolvePerson(id));
  res.json({ contacts: contacts.sort((a, b) => a.name.localeCompare(b.name)) });
}));

router.get('/messages/threads', authenticate, asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT sender_id, recipient_id, body, sent_at, read_at FROM messages
     WHERE sender_id = $1 OR recipient_id = $1 ORDER BY sent_at DESC`,
    [req.user.id]
  );
  const byPartner = {};
  for (const r of rows) {
    const partnerId = r.sender_id === req.user.id ? r.recipient_id : r.sender_id;
    if (!byPartner[partnerId]) byPartner[partnerId] = { lastBody: r.body, lastAt: r.sent_at, unread: 0 };
    if (r.recipient_id === req.user.id && !r.read_at) byPartner[partnerId].unread += 1;
  }
  const threads = [];
  for (const partnerId of Object.keys(byPartner)) {
    const person = await resolvePerson(Number(partnerId));
    threads.push({ ...person, ...byPartner[partnerId] });
  }
  threads.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json({ threads });
}));

router.get('/messages/thread/:userId', authenticate, asyncHandler(async (req, res) => {
  const partnerId = Number(req.params.userId);
  const rows = await all(
    `SELECT id, sender_id, recipient_id, body, sent_at FROM messages
     WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY sent_at ASC`,
    [req.user.id, partnerId]
  );
  await run('UPDATE messages SET read_at = $1 WHERE recipient_id = $2 AND sender_id = $3 AND read_at IS NULL', [new Date().toISOString(), req.user.id, partnerId]);

  const partner = await resolvePerson(partnerId);
  res.json({ partner, messages: rows.map(r => ({ id: r.id, body: r.body, sentAt: r.sent_at, outgoing: r.sender_id === req.user.id })) });
}));

router.post('/messages', authenticate, asyncHandler(async (req, res) => {
  const { recipient_id, body } = req.body || {};
  if (!recipient_id || !body || !body.trim()) return res.status(400).json({ error: 'recipient_id and a message body are required.' });

  const allowed = await getAllowedContacts(req.user);
  if (!allowed.includes(Number(recipient_id))) {
    return res.status(403).json({ error: 'You can only message teachers, admin, or (for teachers) your own students and their parents.' });
  }

  await run('INSERT INTO messages (sender_id, recipient_id, body, sent_at) VALUES ($1,$2,$3,$4)', [req.user.id, recipient_id, body.trim(), new Date().toISOString()]);
  res.status(201).json({ message: 'Sent.' });
}));

// Group message: same underlying messages table (one row per recipient), so
// it shows up in admin oversight exactly like any other message — there's no
// separate "group conversation" object to hide anything in.
router.post('/messages/group', authenticate, asyncHandler(async (req, res) => {
  const { recipient_ids, body } = req.body || {};
  if (!Array.isArray(recipient_ids) || !recipient_ids.length || !body || !body.trim()) {
    return res.status(400).json({ error: 'recipient_ids (array) and a message body are required.' });
  }

  const allowed = new Set(await getAllowedContacts(req.user));
  const validIds = recipient_ids.map(Number).filter(id => allowed.has(id));
  if (!validIds.length) return res.status(403).json({ error: 'None of the selected recipients are allowed contacts.' });

  const sendable = validIds;

  const sentAt = new Date().toISOString();
  for (const id of sendable) {
    await run('INSERT INTO messages (sender_id, recipient_id, body, sent_at) VALUES ($1,$2,$3,$4)', [req.user.id, id, body.trim(), sentAt]);
  }
  res.status(201).json({ message: `Sent to ${sendable.length} recipient${sendable.length === 1 ? '' : 's'}.` });
}));

// ---------- Support tickets ----------
// Any authenticated role can raise a ticket and see their own. Only a
// staff/admin with support.manage can see and manage everyone's tickets —
// note only the staff dashboard has a UI for this so far; student/parent/
// teacher-facing ticket screens are a separate, not-yet-built increment.

router.post('/support-tickets', authenticate, asyncHandler(async (req, res) => {
  const { subject, description, category } = req.body || {};
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'subject is required.' });
  const validCategories = ['student', 'teacher', 'technical', 'general'];
  if (category && !validCategories.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${validCategories.join(', ')}.` });
  }
  const r = await run(
    'INSERT INTO support_tickets (raised_by_user_id, raised_by_role, subject, description, category) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [req.user.id, req.user.role, subject.trim(), description || null, category || 'general']
  );
  await notifyStaffWithPermission('support.manage', 'ticket.raised', `New support ticket: "${subject.trim()}".`, 'support');
  res.status(201).json({ message: 'Ticket submitted. Support will follow up.', ticketId: r.rows[0].id });
}));

router.get('/support-tickets/mine', authenticate, asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT t.*, (SELECT COUNT(*) FROM support_ticket_replies WHERE ticket_id = t.id) AS reply_count
     FROM support_tickets t WHERE t.raised_by_user_id = $1 ORDER BY t.created_at DESC`,
    [req.user.id]
  );
  res.json({ tickets: rows.map(formatTicket) });
}));

router.get('/support-tickets', authenticate, asyncHandler(async (req, res) => {
  if (!(await userHasPermission(req, 'support.manage'))) {
    return res.status(403).json({ error: 'You do not have permission to view all tickets.' });
  }
  const status = req.query.status;
  const rows = await all(
    `SELECT t.*, u.email AS raised_by_email, s.first_name AS assignee_first, s.last_name AS assignee_last,
            (SELECT COUNT(*) FROM support_ticket_replies WHERE ticket_id = t.id) AS reply_count
     FROM support_tickets t
     JOIN users u ON u.id = t.raised_by_user_id
     LEFT JOIN staff s ON s.id = t.assigned_to_staff_id
     ${status ? 'WHERE t.status = $1' : ''}
     ORDER BY (t.status IN ('resolved','closed')), t.created_at DESC`,
    status ? [status] : []
  );
  res.json({ tickets: rows.map(r => ({
    ...formatTicket(r), raisedByEmail: r.raised_by_email,
    assigneeName: r.assignee_first ? `${r.assignee_first} ${r.assignee_last}` : null
  })) });
}));

function formatTicket(r) {
  return {
    id: r.id, subject: r.subject, description: r.description, category: r.category, status: r.status,
    raisedByRole: r.raised_by_role, createdAt: r.created_at, resolvedAt: r.resolved_at,
    replyCount: Number(r.reply_count || 0)
  };
}

router.get('/support-tickets/:id', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await get('SELECT * FROM support_tickets WHERE id = $1', [id]);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const canManage = await userHasPermission(req, 'support.manage');
  if (ticket.raised_by_user_id !== req.user.id && !canManage) {
    return res.status(403).json({ error: 'You do not have access to this ticket.' });
  }
  const replies = await all(
    `SELECT r.id, r.body, r.created_at, r.author_user_id, u.role AS author_role,
            COALESCE(s.first_name || ' ' || s.last_name, a.first_name || ' ' || a.last_name, t.first_name || ' ' || t.last_name, st.first_name || ' ' || st.last_name)
              AS author_name
     FROM support_ticket_replies r
     JOIN users u ON u.id = r.author_user_id
     LEFT JOIN staff s ON s.user_id = r.author_user_id
     LEFT JOIN admins a ON a.user_id = r.author_user_id
     LEFT JOIN teachers t ON t.user_id = r.author_user_id
     LEFT JOIN students st ON st.user_id = r.author_user_id
     WHERE r.ticket_id = $1 ORDER BY r.created_at ASC`,
    [id]
  );
  res.json({
    ticket: formatTicket(ticket),
    replies: replies.map(r => ({ id: r.id, body: r.body, createdAt: r.created_at, authorRole: r.author_role, authorName: r.author_name || 'Unknown', mine: r.author_user_id === req.user.id }))
  });
}));

router.post('/support-tickets/:id/reply', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await get('SELECT * FROM support_tickets WHERE id = $1', [id]);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const canManage = await userHasPermission(req, 'support.manage');
  if (ticket.raised_by_user_id !== req.user.id && !canManage) {
    return res.status(403).json({ error: 'You do not have access to this ticket.' });
  }
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Reply cannot be empty.' });
  await run('INSERT INTO support_ticket_replies (ticket_id, author_user_id, body) VALUES ($1,$2,$3)', [id, req.user.id, body.trim()]);
  if (canManage && ticket.raised_by_role === 'staff') {
    const raiserStaff = await get('SELECT id FROM staff WHERE user_id = $1', [ticket.raised_by_user_id]);
    if (raiserStaff) {
      await run('INSERT INTO staff_notifications (staff_id, type, message, target_page) VALUES ($1,$2,$3,$4)',
        [raiserStaff.id, 'ticket.reply', `New reply on your ticket: "${ticket.subject}".`, 'support']);
    }
  }
  res.status(201).json({ message: 'Reply added.' });
}));

router.patch('/support-tickets/:id', authenticate, asyncHandler(async (req, res) => {
  if (!(await userHasPermission(req, 'support.manage'))) {
    return res.status(403).json({ error: 'You do not have permission to manage tickets.' });
  }
  const id = Number(req.params.id);
  const ticket = await get('SELECT * FROM support_tickets WHERE id = $1', [id]);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const { status, assigned_to_staff_id } = req.body || {};
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
  if (assigned_to_staff_id) {
    const staffRow = await get('SELECT id FROM staff WHERE id = $1 AND status = $2', [assigned_to_staff_id, 'active']);
    if (!staffRow) return res.status(400).json({ error: 'That staff member does not exist or is not active.' });
  }
  await run(
    `UPDATE support_tickets SET
       status = COALESCE($1, status), assigned_to_staff_id = COALESCE($2, assigned_to_staff_id),
       resolved_at = CASE WHEN $1 IN ('resolved','closed') AND status NOT IN ('resolved','closed') THEN CURRENT_TIMESTAMP
                          WHEN $1 IS NOT NULL AND $1 NOT IN ('resolved','closed') THEN NULL ELSE resolved_at END
     WHERE id = $3`,
    [status || null, assigned_to_staff_id || null, id]
  );
  if (assigned_to_staff_id) {
    await run('INSERT INTO staff_notifications (staff_id, type, message, target_page) VALUES ($1,$2,$3,$4)',
      [assigned_to_staff_id, 'ticket.assigned', `Ticket assigned to you: "${ticket.subject}".`, 'support']);
  }
  res.json({ message: 'Ticket updated.' });
}));

module.exports = router;
