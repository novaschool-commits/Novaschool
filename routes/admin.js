const express = require('express');
const bcrypt = require('bcryptjs');
const { get, all, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePermission, logAudit } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
// Every route below now checks a specific permission instead of a blanket
// "must be admin" gate. Super Admin (role === 'admin') always passes, per
// requirePermission()'s own rule — this changes nothing for existing admin
// accounts. It's what lets a scoped Management Team member (e.g. "Student
// Manager") reach only the routes their role actually grants.
router.use(authenticate);

router.get('/overview', requirePermission('reports.view'), asyncHandler(async (req, res) => {
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

router.get('/admissions', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const rows = await all(
    `SELECT id, applicant_name, grade_applied, parent_email, contact_phone, guardian_id, status, submitted_at,
            photo_base64, document_filename, entrance_score
     FROM admission_applications WHERE status = $1 ORDER BY submitted_at DESC`,
    [status]
  );
  res.json({ applications: rows.map(r => ({
    id: r.id, applicantName: r.applicant_name, gradeApplied: r.grade_applied, parentEmail: r.parent_email,
    contactPhone: r.contact_phone, guardianId: r.guardian_id,
    status: r.status, submittedAt: r.submitted_at, hasPhoto: !!r.photo_base64, photoBase64: r.photo_base64,
    documentFilename: r.document_filename, entranceScore: r.entrance_score
  })) });
}));

router.get('/admissions/:id/document', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const application = await get('SELECT document_base64, document_filename FROM admission_applications WHERE id = $1', [id]);
  if (!application || !application.document_base64) return res.status(404).json({ error: 'No document on file.' });
  res.json({ documentBase64: application.document_base64, filename: application.document_filename });
}));

router.post('/admissions/:id/decision', requirePermission('students.create'), asyncHandler(async (req, res) => {
  const { decision } = req.body || {}; // 'approved' | 'declined'
  if (!['approved', 'declined'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'declined'." });
  }
  const id = Number(req.params.id);
  const application = await get('SELECT * FROM admission_applications WHERE id = $1', [id]);
  if (!application) return res.status(404).json({ error: 'Application not found.' });

  await run('UPDATE admission_applications SET status = $1 WHERE id = $2', [decision, id]);
  await logAudit(req, `admission.${decision}`, 'admission_application', id, { applicantName: application.applicant_name });
  res.json({ message: `Application for ${application.applicant_name} marked ${decision}.` });
}));

router.get('/sections', requirePermission('students.view', 'courses.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT se.section_code, se.grade, se.name, se.capacity, se.curriculum,
            t.first_name AS teacher_first, t.last_name AS teacher_last,
            COUNT(st.id) AS student_count
     FROM sections se
     LEFT JOIN teachers t ON t.id = se.class_teacher_id
     LEFT JOIN students st ON st.section_code = se.section_code
     GROUP BY se.id, t.first_name, t.last_name ORDER BY se.grade`
  );

  const sections = rows.map(r => ({
    sectionCode: r.section_code,
    grade: r.grade,
    sectionName: r.name,
    curriculum: r.curriculum || 'Pakistani',
    studentCount: Number(r.student_count),
    capacity: r.capacity,
    classTeacher: r.teacher_first ? `${r.teacher_first} ${r.teacher_last}` : 'Unassigned'
  }));

  res.json({ sections });
}));

// ---------- Teacher recruitment applications ----------

router.get('/teacher-applications', requirePermission('teachers.view'), asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const rows = await all(
    `SELECT id, applicant_name, subject_applied, email, phone, status, submitted_at,
            photo_base64, document_filename, entrance_score, co_curricular
     FROM teacher_applications WHERE status = $1 ORDER BY submitted_at DESC`,
    [status]
  );
  res.json({ applications: rows.map(r => ({
    id: r.id, applicantName: r.applicant_name, subjectApplied: r.subject_applied, email: r.email, phone: r.phone,
    status: r.status, submittedAt: r.submitted_at, photoBase64: r.photo_base64,
    documentFilename: r.document_filename, entranceScore: r.entrance_score, coCurricular: r.co_curricular
  })) });
}));

router.get('/teacher-applications/:id/document', requirePermission('teachers.view'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const application = await get('SELECT document_base64, document_filename FROM teacher_applications WHERE id = $1', [id]);
  if (!application || !application.document_base64) return res.status(404).json({ error: 'No document on file.' });
  res.json({ documentBase64: application.document_base64, filename: application.document_filename });
}));

router.post('/teacher-applications/:id/decision', requirePermission('teachers.create'), asyncHandler(async (req, res) => {
  const { decision } = req.body || {};
  if (!['approved', 'declined'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'declined'." });
  }
  const id = Number(req.params.id);
  const application = await get('SELECT * FROM teacher_applications WHERE id = $1', [id]);
  if (!application) return res.status(404).json({ error: 'Application not found.' });

  await run('UPDATE teacher_applications SET status = $1 WHERE id = $2', [decision, id]);
  await logAudit(req, `teacher_application.${decision}`, 'teacher_application', id, { applicantName: application.applicant_name });
  res.json({ message: `Application for ${application.applicant_name} marked ${decision}.` });
}));

// ---------- Announcements / media ----------

router.post('/announcements', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const { title, body, audience } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const validAudience = ['all', 'students', 'parents', 'teachers'].includes(audience) ? audience : 'all';

  await run('INSERT INTO announcements (title, body, audience) VALUES ($1,$2,$3)', [title, body || null, validAudience]);
  res.status(201).json({ message: 'Announcement posted.' });
}));

router.get('/announcements-all', requirePermission('settings.view'), asyncHandler(async (req, res) => {
  const rows = await all('SELECT id, title, body, audience, created_at FROM announcements ORDER BY created_at DESC LIMIT 30');
  res.json({ announcements: rows });
}));

router.delete('/announcements/:id', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  await run('DELETE FROM announcements WHERE id = $1', [Number(req.params.id)]);
  res.json({ message: 'Announcement removed.' });
}));

// ---------- Entrance test question banks ----------

router.get('/entrance-test-questions', requirePermission('settings.view'), asyncHandler(async (req, res) => {
  const type = req.query.type === 'teacher' ? 'teacher_recruitment' : 'student_admission';
  const rows = await all('SELECT id, question_text, options, correct_answer, position FROM entrance_test_questions WHERE test_type = $1 ORDER BY position, id', [type]);
  res.json({ questions: rows });
}));

router.post('/entrance-test-questions', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
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

router.delete('/entrance-test-questions/:id', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  await run('DELETE FROM entrance_test_questions WHERE id = $1', [Number(req.params.id)]);
  res.json({ message: 'Question removed.' });
}));

router.get('/messages', requirePermission('settings.view'), asyncHandler(async (req, res) => {
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

router.get('/settings', requirePermission('settings.view'), asyncHandler(async (req, res) => {
  const row = await get('SELECT exam_authority_status, exam_authority_name FROM school_settings WHERE id = 1');
  res.json({ examAuthorityStatus: row.exam_authority_status, examAuthorityName: row.exam_authority_name });
}));

router.post('/settings', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const { exam_authority_status, exam_authority_name } = req.body || {};
  if (!['not_registered', 'pending', 'registered'].includes(exam_authority_status)) {
    return res.status(400).json({ error: 'exam_authority_status must be not_registered, pending, or registered.' });
  }
  await run('UPDATE school_settings SET exam_authority_status = $1, exam_authority_name = $2 WHERE id = 1', [exam_authority_status, exam_authority_name || null]);
  res.json({ message: 'Settings updated.' });
}));

// ---------- People management: create real accounts ----------

router.post('/teachers', requirePermission('teachers.create'), asyncHandler(async (req, res) => {
  const { first_name, last_name, email, password, subject } = req.body || {};
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const existing = await get('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const userRow = await run('INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id', [email.toLowerCase().trim(), bcrypt.hashSync(password, 10), 'teacher']);
  const userId = userRow.rows[0].id;
  await run('INSERT INTO teachers (user_id, first_name, last_name, subject) VALUES ($1,$2,$3,$4)', [userId, first_name, last_name, subject || null]);

  await logAudit(req, 'teacher.created', 'teacher', userId, { email: email.toLowerCase().trim() });
  res.status(201).json({ message: `Teacher account created for ${first_name} ${last_name}. They can log in with ${email}.` });
}));

router.get('/teachers', requirePermission('teachers.view'), asyncHandler(async (req, res) => {
  const rows = await all('SELECT t.id, t.first_name, t.last_name, t.subject, u.email FROM teachers t JOIN users u ON u.id = t.user_id ORDER BY t.last_name');
  res.json({ teachers: rows });
}));

router.post('/students', requirePermission('students.create'), asyncHandler(async (req, res) => {
  const { first_name, last_name, admission_no, section_code, email, password } = req.body || {};
  if (!first_name || !last_name || !admission_no || !section_code) {
    return res.status(400).json({ error: 'First name, last name, admission number, and section are required.' });
  }

  const section = await get('SELECT section_code FROM sections WHERE section_code = $1', [section_code]);
  if (!section) return res.status(400).json({ error: `Section "${section_code}" doesn't exist yet — create it first.` });

  const existingAdm = await get('SELECT id FROM students WHERE admission_no = $1', [admission_no]);
  if (existingAdm) return res.status(409).json({ error: 'That admission number is already in use.' });

  let userId = null;
  if (email && password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const existingEmail = await get('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existingEmail) return res.status(409).json({ error: 'An account with that email already exists.' });
    const userRow = await run('INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id', [email.toLowerCase().trim(), bcrypt.hashSync(password, 10), 'student']);
    userId = userRow.rows[0].id;
  }

  const studentRow = await run(
    'INSERT INTO students (user_id, admission_no, first_name, last_name, section_code) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [userId, admission_no, first_name, last_name, section_code]
  );

  await logAudit(req, 'student.created', 'student', studentRow.rows[0].id, { admissionNo: admission_no });
  res.status(201).json({
    message: userId ? `Student account created for ${first_name} ${last_name}. They can log in with ${email}.` : `Student ${first_name} ${last_name} added (no login — roster only).`,
    studentId: studentRow.rows[0].id
  });
}));

router.get('/students', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT s.id, s.first_name, s.last_name, s.admission_no, s.section_code, u.email
     FROM students s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.last_name`
  );
  res.json({ students: rows });
}));

router.post('/parents', requirePermission('students.create'), asyncHandler(async (req, res) => {
  const { first_name, last_name, email, password, student_id } = req.body || {};
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const existing = await get('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const userRow = await run('INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id', [email.toLowerCase().trim(), bcrypt.hashSync(password, 10), 'parent']);
  const parentRow = await run('INSERT INTO parents (user_id, first_name, last_name) VALUES ($1,$2,$3) RETURNING id', [userRow.rows[0].id, first_name, last_name]);

  if (student_id) {
    await run('INSERT INTO student_parent_map (student_id, parent_id) VALUES ($1,$2)', [student_id, parentRow.rows[0].id]);
  }

  await logAudit(req, 'parent.created', 'parent', parentRow.rows[0].id, { email: email.toLowerCase().trim() });
  res.status(201).json({ message: `Parent account created for ${first_name} ${last_name}. They can log in with ${email}.` });
}));

// ---------- Sections / classes ----------

router.post('/sections', requirePermission('courses.edit', 'settings.edit'), asyncHandler(async (req, res) => {
  const { section_code, grade, name, capacity, class_teacher_id, curriculum } = req.body || {};
  if (!section_code || !grade || !name) {
    return res.status(400).json({ error: 'Section code, grade, and section name are required.' });
  }

  const existing = await get('SELECT section_code FROM sections WHERE section_code = $1', [section_code]);
  if (existing) return res.status(409).json({ error: `Section "${section_code}" already exists.` });

  await run(
    'INSERT INTO sections (section_code, grade, name, capacity, class_teacher_id, curriculum) VALUES ($1,$2,$3,$4,$5,$6)',
    [section_code, grade, name, Number(capacity) || 30, class_teacher_id || null, curriculum || 'Pakistani']
  );
  await logAudit(req, 'section.created', 'section', section_code, { grade, curriculum });
  res.status(201).json({ message: `Section ${section_code} created.` });
}));

router.delete('/sections/:code', requirePermission('courses.edit', 'settings.edit'), asyncHandler(async (req, res) => {
  const code = req.params.code;
  const studentCount = await get('SELECT COUNT(*) AS c FROM students WHERE section_code = $1', [code]);
  if (Number(studentCount.c) > 0) {
    return res.status(409).json({ error: `Can't delete — ${studentCount.c} student(s) are still assigned to this section. Move them first.` });
  }
  await run('DELETE FROM timetable WHERE section_code = $1', [code]);
  await run('DELETE FROM sections WHERE section_code = $1', [code]);
  res.json({ message: `Section ${code} deleted.` });
}));

router.get('/live-classes', requirePermission('reports.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT cs.id, cs.section_code, cs.started_at, t.first_name, t.last_name
     FROM class_sessions cs JOIN teachers t ON t.id = cs.teacher_id
     WHERE cs.ended_at IS NULL ORDER BY cs.started_at DESC`
  );
  res.json({ sessions: rows.map(r => ({
    id: r.id, sectionCode: r.section_code, startedAt: r.started_at, teacherName: `${r.first_name} ${r.last_name}`
  })) });
}));

// ---------- Timetable (admin — full authority, any section/teacher) ----------

router.get('/timetable', requirePermission('courses.view'), asyncHandler(async (req, res) => {
  const sectionCode = req.query.section;
  if (!sectionCode) return res.status(400).json({ error: 'section query parameter is required.' });

  const rows = await all(
    `SELECT t.id, t.day_of_week, t.start_time, t.subject, t.room, t.teacher_id,
            tc.first_name AS teacher_first, tc.last_name AS teacher_last
     FROM timetable t LEFT JOIN teachers tc ON tc.id = t.teacher_id
     WHERE t.section_code = $1 ORDER BY
       CASE t.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END,
       t.start_time`,
    [sectionCode]
  );

  res.json({ periods: rows.map(r => ({
    id: r.id, day: r.day_of_week, startTime: r.start_time, subject: r.subject, room: r.room,
    teacherId: r.teacher_id, teacherName: r.teacher_first ? `${r.teacher_first} ${r.teacher_last}` : 'Unassigned'
  })) });
}));

router.post('/timetable', requirePermission('courses.edit'), asyncHandler(async (req, res) => {
  const { section_code, day_of_week, start_time, subject, room, teacher_id } = req.body || {};
  if (!section_code || !day_of_week || !start_time || !subject) {
    return res.status(400).json({ error: 'section_code, day_of_week, start_time, and subject are required.' });
  }
  const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (!validDays.includes(day_of_week)) return res.status(400).json({ error: 'day_of_week must be Monday–Friday.' });

  const section = await get('SELECT section_code FROM sections WHERE section_code = $1', [section_code]);
  if (!section) return res.status(400).json({ error: `Section "${section_code}" doesn't exist yet — create it first.` });

  const clash = await get('SELECT 1 FROM timetable WHERE section_code = $1 AND day_of_week = $2 AND start_time = $3', [section_code, day_of_week, start_time]);
  if (clash) return res.status(409).json({ error: 'This section already has a period at that day and time.' });

  await run(
    'INSERT INTO timetable (section_code, day_of_week, start_time, subject, room, teacher_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [section_code, day_of_week, start_time, subject, room || null, teacher_id || null]
  );
  res.status(201).json({ message: 'Period added.' });
}));

router.patch('/timetable/:id', requirePermission('courses.edit'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const slot = await get('SELECT * FROM timetable WHERE id = $1', [id]);
  if (!slot) return res.status(404).json({ error: 'Period not found.' });

  const { subject, room, start_time, day_of_week, teacher_id } = req.body || {};
  await run(
    'UPDATE timetable SET subject = COALESCE($1, subject), room = $2, start_time = COALESCE($3, start_time), day_of_week = COALESCE($4, day_of_week), teacher_id = $5 WHERE id = $6',
    [subject || null, room !== undefined ? room : slot.room, start_time || null, day_of_week || null, teacher_id !== undefined ? (teacher_id || null) : slot.teacher_id, id]
  );
  res.json({ message: 'Period updated.' });
}));

router.delete('/timetable/:id', requirePermission('courses.edit'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const slot = await get('SELECT * FROM timetable WHERE id = $1', [id]);
  if (!slot) return res.status(404).json({ error: 'Period not found.' });

  await run('DELETE FROM timetable WHERE id = $1', [id]);
  res.json({ message: 'Period removed.' });
}));

// ============================================================
// Academic Management: cross-school course & results oversight.
// Separate from routes/teacher.js on purpose — teachers keep managing
// their own courses/grading exactly as before, untouched. This gives
// Course Manager / Content Manager / Exam Manager staff (and Admins)
// a read/oversight surface across ALL teachers' courses and results,
// without touching teacher.js at all.
// ============================================================

router.get('/courses', requirePermission('courses.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT c.id, c.subject, c.curriculum, c.level, c.title, c.description, c.created_at,
            t.first_name AS teacher_first, t.last_name AS teacher_last,
            (SELECT COUNT(*) FROM course_topics WHERE course_id = c.id) AS topic_count,
            (SELECT COUNT(*) FROM course_lessons cl JOIN course_topics ct ON ct.id = cl.topic_id WHERE ct.course_id = c.id) AS lesson_count
     FROM courses c LEFT JOIN teachers t ON t.id = c.owner_teacher_id
     ORDER BY c.subject, c.curriculum, c.level`
  );
  res.json({ courses: rows.map(r => ({
    id: r.id, subject: r.subject, curriculum: r.curriculum, level: r.level, title: r.title, description: r.description,
    teacher: r.teacher_first ? `${r.teacher_first} ${r.teacher_last}` : 'Unassigned',
    topicCount: Number(r.topic_count), lessonCount: Number(r.lesson_count), createdAt: r.created_at
  })) });
}));

router.post('/courses', requirePermission('courses.create'), asyncHandler(async (req, res) => {
  const { subject, curriculum, level, title, description, owner_teacher_id } = req.body || {};
  if (!subject || !curriculum || !level || !title) {
    return res.status(400).json({ error: 'subject, curriculum, level, and title are required.' });
  }
  if (owner_teacher_id) {
    const teacher = await get('SELECT id FROM teachers WHERE id = $1', [owner_teacher_id]);
    if (!teacher) return res.status(400).json({ error: 'That teacher does not exist.' });
  }
  const r = await run(
    'INSERT INTO courses (subject, curriculum, level, title, description, owner_teacher_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [subject, curriculum, level, title, description || null, owner_teacher_id || null]
  );
  await logAudit(req, 'course.created', 'course', r.rows[0].id, { subject, curriculum, level, title });
  res.status(201).json({ message: 'Course created.', courseId: r.rows[0].id });
}));

router.delete('/courses/:id', requirePermission('courses.edit'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const course = await get('SELECT * FROM courses WHERE id = $1', [id]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const topicIds = (await all('SELECT id FROM course_topics WHERE course_id = $1', [id])).map(t => t.id);
  for (const topicId of topicIds) {
    await run('DELETE FROM course_progress WHERE lesson_id IN (SELECT id FROM course_lessons WHERE topic_id = $1)', [topicId]);
    await run('DELETE FROM course_lessons WHERE topic_id = $1', [topicId]);
  }
  await run('DELETE FROM course_topics WHERE course_id = $1', [id]);
  await run('DELETE FROM courses WHERE id = $1', [id]);
  await logAudit(req, 'course.deleted', 'course', id, { title: course.title });
  res.json({ message: 'Course removed.' });
}));

router.post('/courses/:id/publish-check', requirePermission('courses.publish'), asyncHandler(async (req, res) => {
  // "Publishing" here means marking a course as ready-for-students in the
  // audit trail — the app doesn't currently have a draft/published flag on
  // courses, so this just records the decision without changing any data
  // until that column exists. Kept intentionally honest rather than faking it.
  const id = Number(req.params.id);
  const course = await get('SELECT id, title FROM courses WHERE id = $1', [id]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  await logAudit(req, 'course.publish_reviewed', 'course', id, { title: course.title });
  res.json({ message: 'Publish review recorded. Note: courses have no draft/published state yet in the schema — this only logs the review.' });
}));

// ---------- Results oversight (Exam Manager / Admin) ----------

router.get('/results/overview', requirePermission('results.view'), asyncHandler(async (req, res) => {
  const bySection = await all(
    `SELECT s.section_code, s.grade,
            COUNT(g.id) AS grade_count
     FROM sections s
     LEFT JOIN students st ON st.section_code = s.section_code
     LEFT JOIN grades g ON g.student_id = st.id
     GROUP BY s.section_code, s.grade ORDER BY s.grade`
  );
  const pendingGrading = await get(
    `SELECT COUNT(*) AS c FROM submissions WHERE status = 'submitted'`
  );
  res.json({
    bySection: bySection.map(r => ({ sectionCode: r.section_code, grade: r.grade, recordedGrades: Number(r.grade_count) })),
    pendingGrading: Number(pendingGrading.c)
  });
}));

module.exports = router;
