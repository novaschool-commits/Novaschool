const express = require('express');
const { get, all, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/overview', asyncHandler(async (req, res) => {
  const totalStudents = Number((await get('SELECT COUNT(*) AS c FROM students')).c);
  const totalTeachers = Number((await get('SELECT COUNT(*) AS c FROM teachers')).c);

  const feeRow = await get('SELECT SUM(amount_due) AS due, SUM(amount_paid) AS paid FROM invoices');
  const due = Number(feeRow.due) || 0;
  const paid = Number(feeRow.paid) || 0;
  const feeCollectionPct = due ? Math.round((paid / due) * 1000) / 10 : 0;

  const attRow = await get(
    "SELECT ROUND(100.0 * SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct FROM attendance"
  );

  const enrollmentByGrade = (await all(
    `SELECT se.grade, COUNT(st.id) AS count
     FROM students st JOIN sections se ON se.section_code = st.section_code
     GROUP BY se.grade ORDER BY se.grade`
  )).map(r => ({ grade: r.grade, count: Number(r.count) }));

  res.json({
    totalStudents,
    totalTeachers,
    feeCollectionPct,
    attendancePct: Number(attRow.pct) || 0,
    enrollmentByGrade
  });
}));

router.get('/admissions', asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const rows = await all(
    `SELECT id, applicant_name, grade_applied, parent_email, status, submitted_at,
            photo_base64, document_filename, entrance_score
     FROM admission_applications WHERE status = $1 ORDER BY submitted_at DESC`,
    [status]
  );
  res.json({ applications: rows.map(r => ({
    id: r.id, applicantName: r.applicant_name, gradeApplied: r.grade_applied, parentEmail: r.parent_email,
    status: r.status, submittedAt: r.submitted_at, hasPhoto: !!r.photo_base64, photoBase64: r.photo_base64,
    documentFilename: r.document_filename, entranceScore: r.entrance_score
  })) });
}));

router.get('/admissions/:id/document', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const application = await get('SELECT document_base64, document_filename FROM admission_applications WHERE id = $1', [id]);
  if (!application || !application.document_base64) return res.status(404).json({ error: 'No document on file.' });
  res.json({ documentBase64: application.document_base64, filename: application.document_filename });
}));

router.post('/admissions/:id/decision', asyncHandler(async (req, res) => {
  const { decision } = req.body || {}; // 'approved' | 'declined'
  if (!['approved', 'declined'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'declined'." });
  }
  const id = Number(req.params.id);
  const application = await get('SELECT * FROM admission_applications WHERE id = $1', [id]);
  if (!application) return res.status(404).json({ error: 'Application not found.' });

  await run('UPDATE admission_applications SET status = $1 WHERE id = $2', [decision, id]);
  res.json({ message: `Application for ${application.applicant_name} marked ${decision}.` });
}));

router.get('/sections', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT se.section_code, se.grade, se.name, se.capacity,
            t.first_name AS teacher_first, t.last_name AS teacher_last,
            COUNT(st.id) AS student_count
     FROM sections se
     LEFT JOIN teachers t ON t.id = se.class_teacher_id
     LEFT JOIN students st ON st.section_code = se.section_code
     GROUP BY se.id, t.first_name, t.last_name ORDER BY se.grade`
  );

  const sections = rows.map(r => ({
    grade: r.grade,
    sectionName: r.name,
    studentCount: Number(r.student_count),
    capacity: r.capacity,
    classTeacher: r.teacher_first ? `${r.teacher_first} ${r.teacher_last}` : 'Unassigned'
  }));

  res.json({ sections });
}));

// ---------- Teacher recruitment applications ----------

router.get('/teacher-applications', asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const rows = await all(
    `SELECT id, applicant_name, subject_applied, email, phone, status, submitted_at,
            photo_base64, document_filename, entrance_score
     FROM teacher_applications WHERE status = $1 ORDER BY submitted_at DESC`,
    [status]
  );
  res.json({ applications: rows.map(r => ({
    id: r.id, applicantName: r.applicant_name, subjectApplied: r.subject_applied, email: r.email, phone: r.phone,
    status: r.status, submittedAt: r.submitted_at, photoBase64: r.photo_base64,
    documentFilename: r.document_filename, entranceScore: r.entrance_score
  })) });
}));

router.get('/teacher-applications/:id/document', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const application = await get('SELECT document_base64, document_filename FROM teacher_applications WHERE id = $1', [id]);
  if (!application || !application.document_base64) return res.status(404).json({ error: 'No document on file.' });
  res.json({ documentBase64: application.document_base64, filename: application.document_filename });
}));

router.post('/teacher-applications/:id/decision', asyncHandler(async (req, res) => {
  const { decision } = req.body || {};
  if (!['approved', 'declined'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'declined'." });
  }
  const id = Number(req.params.id);
  const application = await get('SELECT * FROM teacher_applications WHERE id = $1', [id]);
  if (!application) return res.status(404).json({ error: 'Application not found.' });

  await run('UPDATE teacher_applications SET status = $1 WHERE id = $2', [decision, id]);
  res.json({ message: `Application for ${application.applicant_name} marked ${decision}.` });
}));

// ---------- Announcements / media ----------

router.post('/announcements', asyncHandler(async (req, res) => {
  const { title, body, audience } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const validAudience = ['all', 'students', 'parents', 'teachers'].includes(audience) ? audience : 'all';

  await run('INSERT INTO announcements (title, body, audience) VALUES ($1,$2,$3)', [title, body || null, validAudience]);
  res.status(201).json({ message: 'Announcement posted.' });
}));

router.get('/announcements-all', asyncHandler(async (req, res) => {
  const rows = await all('SELECT id, title, body, audience, created_at FROM announcements ORDER BY created_at DESC LIMIT 30');
  res.json({ announcements: rows });
}));

router.delete('/announcements/:id', asyncHandler(async (req, res) => {
  await run('DELETE FROM announcements WHERE id = $1', [Number(req.params.id)]);
  res.json({ message: 'Announcement removed.' });
}));

// ---------- Entrance test question banks ----------

router.get('/entrance-test-questions', asyncHandler(async (req, res) => {
  const type = req.query.type === 'teacher' ? 'teacher_recruitment' : 'student_admission';
  const rows = await all('SELECT id, question_text, options, correct_answer, position FROM entrance_test_questions WHERE test_type = $1 ORDER BY position, id', [type]);
  res.json({ questions: rows });
}));

router.post('/entrance-test-questions', asyncHandler(async (req, res) => {
  const { test_type, question_text, options, correct_answer } = req.body || {};
  if (!['student_admission', 'teacher_recruitment'].includes(test_type) || !question_text || !Array.isArray(options) || options.length < 2 || !correct_answer) {
    return res.status(400).json({ error: 'test_type, question_text, at least 2 options, and correct_answer are required.' });
  }
  const posRow = await get('SELECT COALESCE(MAX(position),0)+1 AS next FROM entrance_test_questions WHERE test_type = $1', [test_type]);
  await run(
    'INSERT INTO entrance_test_questions (test_type, question_text, options, correct_answer, position) VALUES ($1,$2,$3,$4,$5)',
    [test_type, question_text, JSON.stringify(options), correct_answer, posRow.next]
  );
  res.status(201).json({ message: 'Question added.' });
}));

router.delete('/entrance-test-questions/:id', asyncHandler(async (req, res) => {
  await run('DELETE FROM entrance_test_questions WHERE id = $1', [Number(req.params.id)]);
  res.json({ message: 'Question removed.' });
}));

router.get('/messages', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT m.id, m.sender_id, m.recipient_id, m.body, m.sent_at,
            su.email AS sender_email, ru.email AS recipient_email
     FROM messages m JOIN users su ON su.id = m.sender_id JOIN users ru ON ru.id = m.recipient_id
     ORDER BY m.sent_at DESC LIMIT 50`
  );

  async function nameFor(userId, table) {
    const tables = [['students', 'Student'], ['parents', 'Parent'], ['teachers', 'Teacher'], ['admins', 'Admin']];
    for (const [t, label] of tables) {
      const row = await get(`SELECT first_name, last_name FROM ${t} WHERE user_id = $1`, [userId]);
      if (row) return `${row.first_name} ${row.last_name} (${label})`;
    }
    return 'Unknown';
  }

  const messages = [];
  for (const r of rows) {
    messages.push({
      id: r.id, body: r.body, sentAt: r.sent_at,
      from: await nameFor(r.sender_id), to: await nameFor(r.recipient_id)
    });
  }

  res.json({ messages });
}));

// ---------- School settings (exam authority status) ----------

router.get('/settings', asyncHandler(async (req, res) => {
  const row = await get('SELECT exam_authority_status, exam_authority_name FROM school_settings WHERE id = 1');
  res.json({ examAuthorityStatus: row.exam_authority_status, examAuthorityName: row.exam_authority_name });
}));

router.post('/settings', asyncHandler(async (req, res) => {
  const { exam_authority_status, exam_authority_name } = req.body || {};
  if (!['not_registered', 'pending', 'registered'].includes(exam_authority_status)) {
    return res.status(400).json({ error: 'exam_authority_status must be not_registered, pending, or registered.' });
  }
  await run('UPDATE school_settings SET exam_authority_status = $1, exam_authority_name = $2 WHERE id = 1', [exam_authority_status, exam_authority_name || null]);
  res.json({ message: 'Settings updated.' });
}));

module.exports = router;
