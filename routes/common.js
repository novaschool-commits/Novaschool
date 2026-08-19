const express = require('express');
const { all, get, run } = require('../db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

// Basic guard so someone can't stuff a giant file into the database — this
// stores uploads inline (base64) since there's no cloud storage wired up yet.
// Fine for a small school; swap for real object storage (S3/GCS) once volume grows.
const MAX_BASE64_LEN = 5_000_000; // roughly ~3.7MB decoded, safely under the 6MB request body limit

function tooLarge(str) {
  return typeof str === 'string' && str.length > MAX_BASE64_LEN;
}

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
  const conditions = [];
  const params = [];
  let idx = 1;
  if (subject) { conditions.push(`c.subject = $${idx++}`); params.push(subject); }
  if (curriculum) { conditions.push(`c.curriculum = $${idx++}`); params.push(curriculum); }
  if (level) { conditions.push(`c.level = $${idx++}`); params.push(level); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

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

router.post('/admissions/apply', asyncHandler(async (req, res) => {
  const { applicant_name, grade_applied, parent_email, contact_phone, guardian_id, curriculum, photo_base64, document_base64, document_filename } = req.body || {};
  if (!applicant_name || !grade_applied || !parent_email || !contact_phone) {
    return res.status(400).json({ error: 'Student name, grade, parent email, and a contact phone number are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent_email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (tooLarge(photo_base64) || tooLarge(document_base64)) return res.status(413).json({ error: 'Photo or document is too large. Please use a smaller file (under ~4MB).' });

  const fee = computeMonthlyFee(curriculum, grade_applied);

  const r = await run(
    `INSERT INTO admission_applications
       (applicant_name, grade_applied, parent_email, status, photo_base64, document_base64, document_filename, curriculum, monthly_fee, fee_currency, contact_phone, guardian_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [applicant_name, grade_applied, parent_email, 'pending', photo_base64 || null, document_base64 || null, document_filename || null, curriculum || 'Pakistani', fee.amount, fee.currency, contact_phone, guardian_id || null]
  );
  res.status(201).json({
    message: `Application received for ${applicant_name}. The school will reach out to ${parent_email} within 5 business days.`,
    applicationId: r.rows[0].id,
    voucher: { applicantName: applicant_name, gradeApplied: grade_applied, curriculum: curriculum || 'Pakistani', amount: fee.amount, currency: fee.currency }
  });
}));

router.post('/admissions/:id/entrance-test', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const application = await get('SELECT id FROM admission_applications WHERE id = $1', [id]);
  if (!application) return res.status(404).json({ error: 'Application not found.' });

  const score = await gradeEntranceAnswers('student_admission', (req.body || {}).answers);
  if (score === null) return res.status(404).json({ error: 'No entrance test is set up yet.' });

  await run('UPDATE admission_applications SET entrance_score = $1 WHERE id = $2', [score, id]);
  res.json({ message: `Entrance test submitted. Score: ${score}.`, score });
}));

// ---------- Teacher recruitment application (no login required) ----------
router.post('/teacher-applications/apply', asyncHandler(async (req, res) => {
  const { applicant_name, subject_applied, email, phone, photo_base64, document_base64, document_filename, co_curricular } = req.body || {};
  if (!applicant_name || !subject_applied || !email || !phone) {
    return res.status(400).json({ error: 'Name, subject, email, and phone are all required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!photo_base64) return res.status(400).json({ error: 'A photo is required.' });
  if (!document_base64) return res.status(400).json({ error: 'A CV (PDF preferred) is required.' });
  if (tooLarge(photo_base64) || tooLarge(document_base64)) return res.status(413).json({ error: 'Photo or document is too large. Please use a smaller file (under ~4MB).' });

  const r = await run(
    'INSERT INTO teacher_applications (applicant_name, subject_applied, email, phone, status, photo_base64, document_base64, document_filename, co_curricular) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [applicant_name, subject_applied, email, phone, 'pending', photo_base64, document_base64, document_filename || null, co_curricular || null]
  );
  res.status(201).json({
    message: `Application received for ${applicant_name}. The school will be in touch at ${email}.`,
    applicationId: r.rows[0].id
  });
}));

router.post('/teacher-applications/:id/entrance-test', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const application = await get('SELECT id FROM teacher_applications WHERE id = $1', [id]);
  if (!application) return res.status(404).json({ error: 'Application not found.' });

  const score = await gradeEntranceAnswers('teacher_recruitment', (req.body || {}).answers);
  if (score === null) return res.status(404).json({ error: 'No entrance test is set up yet.' });

  await run('UPDATE teacher_applications SET entrance_score = $1 WHERE id = $2', [score, id]);
  res.json({ message: `Entrance test submitted. Score: ${score}.`, score });
}));

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
  return { userId, name: 'Unknown', role: '' };
}

// Who is this person allowed to message? Kept deliberately restrictive —
// students and parents can only reach teachers/admin, not each other directly.
async function getAllowedContacts(user) {
  if (user.role === 'student') {
    const student = await get('SELECT * FROM students WHERE user_id = $1', [user.id]);
    if (!student) return [];
    const teacherRows = await all(
      `SELECT DISTINCT t.user_id FROM timetable tt JOIN teachers t ON t.id = tt.teacher_id WHERE tt.section_code = $1 AND t.user_id IS NOT NULL`,
      [student.section_code]
    );
    const adminRows = await all('SELECT user_id FROM admins WHERE user_id IS NOT NULL');
    return [...teacherRows, ...adminRows].map(r => r.user_id);
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
    return [...teacherRows, ...adminRows].map(r => r.user_id);
  }
  if (user.role === 'teacher') {
    const teacher = await get('SELECT * FROM teachers WHERE user_id = $1', [user.id]);
    if (!teacher) return [];
    const sectionRows = await all('SELECT DISTINCT section_code FROM timetable WHERE teacher_id = $1', [teacher.id]);
    const sectionCodes = sectionRows.map(r => r.section_code);
    if (!sectionCodes.length) {
      const adminRows = await all('SELECT user_id FROM admins WHERE user_id IS NOT NULL');
      return adminRows.map(r => r.user_id);
    }
    const placeholders = sectionCodes.map((_, i) => `$${i + 1}`).join(',');
    const studentRows = await all(`SELECT user_id FROM students WHERE section_code IN (${placeholders}) AND user_id IS NOT NULL`, sectionCodes);
    const parentRows = await all(
      `SELECT DISTINCT p.user_id FROM student_parent_map m
       JOIN students st ON st.id = m.student_id JOIN parents p ON p.id = m.parent_id
       WHERE st.section_code IN (${placeholders}) AND p.user_id IS NOT NULL`,
      sectionCodes
    );
    const adminRows = await all('SELECT user_id FROM admins WHERE user_id IS NOT NULL');
    return [...studentRows, ...parentRows, ...adminRows].map(r => r.user_id);
  }
  if (user.role === 'admin') {
    const teacherRows = await all('SELECT user_id FROM teachers WHERE user_id IS NOT NULL');
    const parentRows = await all('SELECT user_id FROM parents WHERE user_id IS NOT NULL');
    const studentRows = await all('SELECT user_id FROM students WHERE user_id IS NOT NULL');
    return [...teacherRows, ...parentRows, ...studentRows].map(r => r.user_id);
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

module.exports = router;
