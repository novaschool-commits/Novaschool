const express = require('express');
const bcrypt = require('bcryptjs');
const { get, all, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePermission, logAudit, userHasPermission } = require('../middleware/permissions');
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

  const studentStatus = await get("SELECT COUNT(*) FILTER (WHERE status='active') AS active, COUNT(*) FILTER (WHERE status='suspended') AS suspended, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month FROM students");
  const teacherStatus = await get("SELECT COUNT(*) FILTER (WHERE status='active') AS active, COUNT(*) FILTER (WHERE status='suspended') AS suspended, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month FROM teachers");
  const parentStatus = await get("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='active') AS active FROM parents");
  const staffStatus = await get("SELECT COUNT(*) FILTER (WHERE status='active') AS active, COUNT(*) FILTER (WHERE status='invited') AS invited, COUNT(*) AS total FROM staff");
  const pendingAdmissions = Number((await get("SELECT COUNT(*) AS c FROM admission_applications WHERE status = 'pending'")).c);
  const pendingTeacherApps = Number((await get("SELECT COUNT(*) AS c FROM teacher_applications WHERE status = 'pending'")).c);
  const courseStatus = await get("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='published') AS published, COUNT(*) FILTER (WHERE status='draft') AS draft, COUNT(DISTINCT subject) AS subjects FROM courses");
  const totalClasses = Number((await get('SELECT COUNT(*) AS c FROM sections')).c);
  const activeExams = Number((await get("SELECT COUNT(*) AS c FROM exams WHERE is_published = TRUE")).c);
  const totalAssignments = Number((await get('SELECT COUNT(*) AS c FROM assignments')).c);
  const pendingSubmissions = Number((await get(
    "SELECT (SELECT COUNT(*) FROM submissions WHERE status='submitted') + (SELECT COUNT(*) FROM exam_attempts WHERE status='submitted') AS c"
  )).c);
  const resultsRecorded = Number((await get('SELECT COUNT(*) AS c FROM grades')).c);
  // DAU/WAU here means "logged in within the window" (from real last_login
  // timestamps) — a fair, honest proxy given the app has no session/event
  // tracking, not a claim of continuous activity.
  const activityRow = await get(
    "SELECT COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '1 day') AS dau, COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '7 days') AS wau FROM users"
  );

  res.json({
    totalStudents, totalTeachers,
    feeCollectionPct,
    attendancePct: Number(attRow.pct) || 0,
    enrollmentByGrade,
    students: { active: Number(studentStatus.active), suspended: Number(studentStatus.suspended), newThisMonth: Number(studentStatus.new_this_month) },
    teachers: { active: Number(teacherStatus.active), suspended: Number(teacherStatus.suspended), newThisMonth: Number(teacherStatus.new_this_month) },
    parents: { total: Number(parentStatus.total), active: Number(parentStatus.active) },
    staff: { total: Number(staffStatus.total), active: Number(staffStatus.active), invited: Number(staffStatus.invited) },
    pendingAdmissions, pendingTeacherApps,
    courses: { total: Number(courseStatus.total), published: Number(courseStatus.published), draft: Number(courseStatus.draft), subjects: Number(courseStatus.subjects) },
    totalClasses, activeExams, totalAssignments, pendingSubmissions, resultsRecorded,
    activity: { dau: Number(activityRow.dau), wau: Number(activityRow.wau) }
  });
}));

router.get('/approvals', requirePermission('reports.view'), asyncHandler(async (req, res) => {
  const pendingAdmissions = Number((await get("SELECT COUNT(*) AS c FROM admission_applications WHERE status = 'pending'")).c);
  const pendingTeacherApps = Number((await get("SELECT COUNT(*) AS c FROM teacher_applications WHERE status = 'pending'")).c);
  const pendingStaffInvites = Number((await get("SELECT COUNT(*) AS c FROM staff WHERE status = 'invited'")).c);
  const pendingFeeConfirmations = Number((await get("SELECT COUNT(*) AS c FROM invoices WHERE status = 'pending_confirmation'")).c);
  res.json({
    items: [
      { label: 'Student admissions', count: pendingAdmissions, page: 'overview', anchor: 'admissions' },
      { label: 'Teacher applications', count: pendingTeacherApps, page: 'overview', anchor: 'teacher-applications' },
      { label: 'Staff invitations pending activation', count: pendingStaffInvites, page: 'management', anchor: 'staff' },
      { label: 'Fee payments awaiting confirmation', count: pendingFeeConfirmations, page: 'overview', anchor: 'fees' }
    ].filter(i => i.count > 0)
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

// ---------- Organization: Academic Years, Terms, Campuses ----------

router.get('/academic-years', requirePermission('settings.view'), asyncHandler(async (req, res) => {
  const years = await all('SELECT * FROM academic_years ORDER BY start_date DESC NULLS LAST, id DESC');
  res.json({ years: years.map(y => ({ id: y.id, name: y.name, startDate: y.start_date, endDate: y.end_date, isCurrent: y.is_current })) });
}));

router.post('/academic-years', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const { name, start_date, end_date } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const r = await run('INSERT INTO academic_years (name, start_date, end_date) VALUES ($1,$2,$3) RETURNING id', [name, start_date || null, end_date || null]);
  await logAudit(req, 'academic_year.created', 'academic_year', r.rows[0].id, { name });
  res.status(201).json({ message: 'Academic year created.', yearId: r.rows[0].id });
}));

router.post('/academic-years/:id/set-current', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const year = await get('SELECT * FROM academic_years WHERE id = $1', [id]);
  if (!year) return res.status(404).json({ error: 'Academic year not found.' });
  await run('UPDATE academic_years SET is_current = FALSE WHERE is_current = TRUE');
  await run('UPDATE academic_years SET is_current = TRUE WHERE id = $1', [id]);
  await logAudit(req, 'academic_year.set_current', 'academic_year', id, { name: year.name });
  res.json({ message: `${year.name} set as the current academic year.` });
}));

router.delete('/academic-years/:id', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const year = await get('SELECT * FROM academic_years WHERE id = $1', [id]);
  if (!year) return res.status(404).json({ error: 'Academic year not found.' });
  await run('DELETE FROM academic_years WHERE id = $1', [id]);
  await logAudit(req, 'academic_year.deleted', 'academic_year', id, { name: year.name });
  res.json({ message: 'Academic year removed (and any terms under it).' });
}));

router.get('/terms', requirePermission('settings.view'), asyncHandler(async (req, res) => {
  const yearId = req.query.academic_year_id;
  const terms = yearId
    ? await all('SELECT * FROM terms WHERE academic_year_id = $1 ORDER BY start_date NULLS LAST, id', [Number(yearId)])
    : await all('SELECT * FROM terms ORDER BY start_date NULLS LAST, id');
  res.json({ terms: terms.map(t => ({ id: t.id, academicYearId: t.academic_year_id, name: t.name, startDate: t.start_date, endDate: t.end_date })) });
}));

router.post('/terms', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const { academic_year_id, name, start_date, end_date } = req.body || {};
  if (!academic_year_id || !name) return res.status(400).json({ error: 'academic_year_id and name are required.' });
  const year = await get('SELECT id FROM academic_years WHERE id = $1', [academic_year_id]);
  if (!year) return res.status(400).json({ error: 'That academic year does not exist.' });
  const r = await run('INSERT INTO terms (academic_year_id, name, start_date, end_date) VALUES ($1,$2,$3,$4) RETURNING id', [academic_year_id, name, start_date || null, end_date || null]);
  res.status(201).json({ message: 'Term added.', termId: r.rows[0].id });
}));

router.delete('/terms/:id', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const term = await get('SELECT * FROM terms WHERE id = $1', [id]);
  if (!term) return res.status(404).json({ error: 'Term not found.' });
  await run('DELETE FROM terms WHERE id = $1', [id]);
  res.json({ message: 'Term removed.' });
}));

router.get('/campuses', requirePermission('settings.view'), asyncHandler(async (req, res) => {
  const campuses = await all('SELECT * FROM campuses ORDER BY name');
  res.json({ campuses: campuses.map(c => ({ id: c.id, name: c.name, address: c.address })) });
}));

router.post('/campuses', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const { name, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const r = await run('INSERT INTO campuses (name, address) VALUES ($1,$2) RETURNING id', [name, address || null]);
  await logAudit(req, 'campus.created', 'campus', r.rows[0].id, { name });
  res.status(201).json({ message: 'Campus added.', campusId: r.rows[0].id });
}));

router.delete('/campuses/:id', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const campus = await get('SELECT * FROM campuses WHERE id = $1', [id]);
  if (!campus) return res.status(404).json({ error: 'Campus not found.' });
  await run('DELETE FROM campuses WHERE id = $1', [id]);
  await logAudit(req, 'campus.deleted', 'campus', id, { name: campus.name });
  res.json({ message: 'Campus removed.' });
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
  const rows = await all('SELECT t.id, t.first_name, t.last_name, t.subject, t.status, t.created_at, u.email FROM teachers t JOIN users u ON u.id = t.user_id ORDER BY t.last_name');
  res.json({ teachers: rows.map(r => ({ id: r.id, first_name: r.first_name, last_name: r.last_name, subject: r.subject, status: r.status, createdAt: r.created_at, email: r.email })) });
}));

router.patch('/teachers/:id/status', requirePermission('teachers.suspend'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'status must be active or suspended.' });
  const teacher = await get('SELECT * FROM teachers WHERE id = $1', [id]);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });
  await run('UPDATE teachers SET status = $1 WHERE id = $2', [status, id]);
  await logAudit(req, status === 'suspended' ? 'teacher.suspended' : 'teacher.reactivated', 'teacher', id, { name: `${teacher.first_name} ${teacher.last_name}` });
  res.json({ message: `${teacher.first_name} ${teacher.last_name} ${status === 'suspended' ? 'suspended' : 'reactivated'}.` });
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
    `SELECT s.id, s.first_name, s.last_name, s.admission_no, s.section_code, s.status, s.created_at, u.email
     FROM students s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.last_name`
  );
  res.json({ students: rows.map(r => ({ ...r, createdAt: r.created_at })) });
}));

router.patch('/students/:id/status', requirePermission('students.suspend'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'status must be active or suspended.' });
  const student = await get('SELECT * FROM students WHERE id = $1', [id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  await run('UPDATE students SET status = $1 WHERE id = $2', [status, id]);
  await logAudit(req, status === 'suspended' ? 'student.suspended' : 'student.reactivated', 'student', id, { name: `${student.first_name} ${student.last_name}` });
  res.json({ message: `${student.first_name} ${student.last_name} ${status === 'suspended' ? 'suspended' : 'reactivated'}.` });
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

router.get('/parents', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT p.id, p.first_name, p.last_name, p.status, u.email,
            (SELECT string_agg(s.first_name || ' ' || s.last_name, ', ') FROM student_parent_map spm JOIN students s ON s.id = spm.student_id WHERE spm.parent_id = p.id) AS children
     FROM parents p JOIN users u ON u.id = p.user_id ORDER BY p.last_name`
  );
  res.json({ parents: rows.map(r => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, status: r.status, email: r.email, children: r.children || null })) });
}));

router.patch('/parents/:id/status', requirePermission('students.edit'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'status must be active or suspended.' });
  const parent = await get('SELECT * FROM parents WHERE id = $1', [id]);
  if (!parent) return res.status(404).json({ error: 'Parent not found.' });
  await run('UPDATE parents SET status = $1 WHERE id = $2', [status, id]);
  await logAudit(req, status === 'suspended' ? 'parent.suspended' : 'parent.reactivated', 'parent', id, { name: `${parent.first_name} ${parent.last_name}` });
  res.json({ message: `${parent.first_name} ${parent.last_name} ${status === 'suspended' ? 'suspended' : 'reactivated'}.` });
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
    `SELECT c.id, c.subject, c.curriculum, c.level, c.title, c.description, c.created_at, c.status, c.published_at,
            t.first_name AS teacher_first, t.last_name AS teacher_last,
            (SELECT COUNT(*) FROM course_topics WHERE course_id = c.id) AS topic_count,
            (SELECT COUNT(*) FROM course_lessons cl JOIN course_topics ct ON ct.id = cl.topic_id WHERE ct.course_id = c.id) AS lesson_count,
            (SELECT COUNT(DISTINCT cp.student_id) FROM course_progress cp
               JOIN course_lessons cl2 ON cl2.id = cp.lesson_id JOIN course_topics ct2 ON ct2.id = cl2.topic_id
               WHERE ct2.course_id = c.id) AS students_engaged,
            (SELECT COUNT(*) FROM course_progress cp3
               JOIN course_lessons cl3 ON cl3.id = cp3.lesson_id JOIN course_topics ct3 ON ct3.id = cl3.topic_id
               WHERE ct3.course_id = c.id) AS total_completions
     FROM courses c LEFT JOIN teachers t ON t.id = c.owner_teacher_id
     ORDER BY c.subject, c.curriculum, c.level`
  );
  res.json({ courses: rows.map(r => {
    const lessonCount = Number(r.lesson_count);
    const studentsEngaged = Number(r.students_engaged);
    const possibleCompletions = lessonCount * studentsEngaged;
    const completionPct = possibleCompletions > 0 ? Math.round((Number(r.total_completions) / possibleCompletions) * 1000) / 10 : null;
    return {
      id: r.id, subject: r.subject, curriculum: r.curriculum, level: r.level, title: r.title, description: r.description,
      teacher: r.teacher_first ? `${r.teacher_first} ${r.teacher_last}` : 'Unassigned',
      topicCount: Number(r.topic_count), lessonCount, createdAt: r.created_at,
      status: r.status, publishedAt: r.published_at, studentsEngaged, completionPct
    };
  }) });
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
  const id = Number(req.params.id);
  const course = await get('SELECT id, title, status FROM courses WHERE id = $1', [id]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  if (course.status === 'published') return res.status(400).json({ error: 'This course is already published.' });
  await run('UPDATE courses SET status = \'published\', published_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  await logAudit(req, 'course.published', 'course', id, { title: course.title });
  res.json({ message: `"${course.title}" is now published and visible on the public course catalog.` });
}));

router.post('/courses/:id/unpublish', requirePermission('courses.publish'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const course = await get('SELECT id, title, status FROM courses WHERE id = $1', [id]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  if (course.status === 'draft') return res.status(400).json({ error: 'This course is already a draft.' });
  await run('UPDATE courses SET status = \'draft\' WHERE id = $1', [id]);
  await logAudit(req, 'course.unpublished', 'course', id, { title: course.title });
  res.json({ message: `"${course.title}" moved back to draft and removed from the public course catalog.` });
}));

// Generic 4-state transition (draft/under_review/published/archived). The
// older publish-check/unpublish endpoints above still work unchanged for
// anything already calling them — this is additive, not a replacement.
router.post('/courses/:id/set-status', requirePermission('courses.edit', 'courses.publish'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const validStatuses = ['draft', 'under_review', 'published', 'archived'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
  if (status === 'published' && !(await userHasPermission(req, 'courses.publish'))) {
    return res.status(403).json({ error: 'Only someone with courses.publish can publish a course.' });
  }
  const course = await get('SELECT id, title, status FROM courses WHERE id = $1', [id]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  await run(
    `UPDATE courses SET status = $1, published_at = CASE WHEN $1 = 'published' AND status != 'published' THEN CURRENT_TIMESTAMP ELSE published_at END WHERE id = $2`,
    [status, id]
  );
  await logAudit(req, 'course.status_changed', 'course', id, { title: course.title, from: course.status, to: status });
  res.json({ message: `"${course.title}" moved to ${status.replace('_', ' ')}.` });
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

// ---------- Reports (role-specific — each section only appears in the
// staff dashboard if the viewer's role also grants the underlying view
// permission for that data) ----------

router.get('/reports/exam-summary', requirePermission('results.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT e.subject,
            COUNT(a.id) AS attempts_graded,
            ROUND(AVG(100.0 * a.total_score / NULLIF(mx.max_marks, 0)), 1) AS avg_pct,
            SUM(CASE WHEN a.total_score >= 0.5 * mx.max_marks THEN 1 ELSE 0 END) AS pass_count
     FROM exam_attempts a
     JOIN exams e ON e.id = a.exam_id
     JOIN (SELECT exam_id, SUM(marks) AS max_marks FROM exam_questions GROUP BY exam_id) mx ON mx.exam_id = a.exam_id
     WHERE a.status = 'graded'
     GROUP BY e.subject ORDER BY e.subject`
  );
  res.json({ bySubject: rows.map(r => ({
    subject: r.subject, attemptsGraded: Number(r.attempts_graded),
    avgPct: r.avg_pct !== null ? Number(r.avg_pct) : null, passCount: Number(r.pass_count)
  })) });
}));

router.get('/reports/admissions-summary', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const rows = await all('SELECT status, COUNT(*) AS c FROM admission_applications GROUP BY status');
  res.json({ byStatus: rows.map(r => ({ status: r.status, count: Number(r.c) })) });
}));

// ---------- Grade configuration (letter-grade bands) ----------

router.get('/grade-bands', requirePermission('results.view'), asyncHandler(async (req, res) => {
  const rows = await all('SELECT * FROM grade_bands ORDER BY min_pct DESC');
  res.json({ bands: rows.map(b => ({ id: b.id, label: b.label, minPct: Number(b.min_pct), maxPct: Number(b.max_pct) })) });
}));

router.post('/grade-bands', requirePermission('results.edit'), asyncHandler(async (req, res) => {
  const { label, min_pct, max_pct } = req.body || {};
  if (!label || min_pct === undefined || max_pct === undefined) {
    return res.status(400).json({ error: 'label, min_pct, and max_pct are required.' });
  }
  if (Number(min_pct) > Number(max_pct)) return res.status(400).json({ error: 'min_pct cannot be greater than max_pct.' });
  const r = await run('INSERT INTO grade_bands (label, min_pct, max_pct) VALUES ($1,$2,$3) RETURNING id', [label, min_pct, max_pct]);
  res.status(201).json({ message: 'Grade band added.', bandId: r.rows[0].id });
}));

router.delete('/grade-bands/:id', requirePermission('results.edit'), asyncHandler(async (req, res) => {
  await run('DELETE FROM grade_bands WHERE id = $1', [Number(req.params.id)]);
  res.json({ message: 'Grade band removed.' });
}));

// ---------- Exams & question banks (school-wide — every teacher's exams,
// not just one teacher's own, matching the pre-seeded Exam Manager role
// which already pairs assignments.* with results.* permissions) ----------

router.get('/exams', requirePermission('assignments.view'), asyncHandler(async (req, res) => {
  const exams = await all(
    `SELECT e.id, e.title, e.subject, e.section_code, e.duration_minutes, e.is_published, e.scheduled_at,
            t.first_name AS teacher_first, t.last_name AS teacher_last,
            (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.id) AS question_count,
            (SELECT COUNT(*) FROM exam_attempts WHERE exam_id = e.id AND status = 'submitted') AS pending_grading
     FROM exams e LEFT JOIN teachers t ON t.id = e.teacher_id ORDER BY e.scheduled_at NULLS LAST, e.created_at DESC`
  );
  res.json({ exams: exams.map(e => ({
    id: e.id, title: e.title, subject: e.subject, sectionCode: e.section_code,
    durationMinutes: e.duration_minutes, isPublished: e.is_published, scheduledAt: e.scheduled_at,
    teacher: e.teacher_first ? `${e.teacher_first} ${e.teacher_last}` : 'Unassigned',
    questionCount: Number(e.question_count), pendingGrading: Number(e.pending_grading)
  })) });
}));

router.post('/exams', requirePermission('assignments.create'), asyncHandler(async (req, res) => {
  const { title, subject, section_code, duration_minutes, teacher_id, scheduled_at } = req.body || {};
  if (!title || !subject || !section_code) {
    return res.status(400).json({ error: 'title, subject, and section_code are required.' });
  }
  const section = await get('SELECT section_code FROM sections WHERE section_code = $1', [section_code]);
  if (!section) return res.status(400).json({ error: `Section "${section_code}" doesn't exist.` });
  if (teacher_id) {
    const teacher = await get('SELECT id FROM teachers WHERE id = $1', [teacher_id]);
    if (!teacher) return res.status(400).json({ error: 'That teacher does not exist.' });
  }
  const r = await run(
    'INSERT INTO exams (title, subject, section_code, teacher_id, duration_minutes, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [title, subject, section_code, teacher_id || null, Number(duration_minutes) || 30, scheduled_at || null]
  );
  await logAudit(req, 'exam.created', 'exam', r.rows[0].id, { title, subject, section_code });
  res.status(201).json({ message: 'Test created. Add questions, then publish it.', examId: r.rows[0].id });
}));

router.post('/exams/:id/schedule', requirePermission('assignments.edit'), asyncHandler(async (req, res) => {
  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });
  const { scheduled_at } = req.body || {};
  await run('UPDATE exams SET scheduled_at = $1 WHERE id = $2', [scheduled_at || null, examId]);
  res.json({ message: scheduled_at ? 'Test scheduled.' : 'Schedule cleared.' });
}));

router.post('/exams/:id/questions', requirePermission('assignments.edit'), asyncHandler(async (req, res) => {
  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });

  const { question_text, question_type, options, correct_answer, marks } = req.body || {};
  if (!question_text || !['mcq', 'descriptive'].includes(question_type)) {
    return res.status(400).json({ error: 'question_text and a valid question_type (mcq/descriptive) are required.' });
  }
  if (question_type === 'mcq' && (!Array.isArray(options) || options.length < 2 || !correct_answer)) {
    return res.status(400).json({ error: 'MCQ questions need at least 2 options and a correct_answer.' });
  }
  const posRow = await get('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM exam_questions WHERE exam_id = $1', [examId]);
  await run(
    'INSERT INTO exam_questions (exam_id, question_text, question_type, options, correct_answer, marks, position) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [examId, question_text, question_type,
     question_type === 'mcq' ? JSON.stringify(options) : null,
     question_type === 'mcq' ? correct_answer : null,
     Number(marks) || 1, posRow.next]
  );
  res.status(201).json({ message: 'Question added.' });
}));

router.get('/exams/:id', requirePermission('assignments.view'), asyncHandler(async (req, res) => {
  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });
  const questions = await all('SELECT * FROM exam_questions WHERE exam_id = $1 ORDER BY position, id', [examId]);
  res.json({
    exam: { id: exam.id, title: exam.title, subject: exam.subject, sectionCode: exam.section_code, durationMinutes: exam.duration_minutes, isPublished: exam.is_published, scheduledAt: exam.scheduled_at },
    questions: questions.map(q => ({ id: q.id, questionText: q.question_text, questionType: q.question_type, options: q.options, correctAnswer: q.correct_answer, marks: q.marks }))
  });
}));

router.delete('/exams/:id/questions/:qid', requirePermission('assignments.edit'), asyncHandler(async (req, res) => {
  const examId = Number(req.params.id);
  const exam = await get('SELECT is_published FROM exams WHERE id = $1', [examId]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });
  if (exam.is_published) return res.status(400).json({ error: 'Unpublish the test before removing questions from it.' });
  await run('DELETE FROM exam_questions WHERE id = $1 AND exam_id = $2', [Number(req.params.qid), examId]);
  res.json({ message: 'Question removed.' });
}));

router.post('/exams/:id/publish', requirePermission('assignments.edit'), asyncHandler(async (req, res) => {
  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });
  const countRow = await get('SELECT COUNT(*) AS c FROM exam_questions WHERE exam_id = $1', [examId]);
  if (Number(countRow.c) === 0) return res.status(400).json({ error: 'Add at least one question before publishing.' });
  await run('UPDATE exams SET is_published = TRUE WHERE id = $1', [examId]);
  await logAudit(req, 'exam.published', 'exam', examId, { title: exam.title });
  res.json({ message: 'Test published — students in this section can now see and take it.' });
}));

router.post('/exams/:id/unpublish', requirePermission('assignments.edit'), asyncHandler(async (req, res) => {
  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });
  await run('UPDATE exams SET is_published = FALSE WHERE id = $1', [examId]);
  await logAudit(req, 'exam.unpublished', 'exam', examId, { title: exam.title });
  res.json({ message: 'Test moved back to draft.' });
}));

router.delete('/exams/:id', requirePermission('assignments.edit'), asyncHandler(async (req, res) => {
  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });
  await run('DELETE FROM exam_answers WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = $1)', [examId]);
  await run('DELETE FROM exam_attempts WHERE exam_id = $1', [examId]);
  await run('DELETE FROM exam_questions WHERE exam_id = $1', [examId]);
  await run('DELETE FROM exams WHERE id = $1', [examId]);
  await logAudit(req, 'exam.deleted', 'exam', examId, { title: exam.title });
  res.json({ message: 'Test removed.' });
}));

router.get('/exams/:id/attempts', requirePermission('results.view'), asyncHandler(async (req, res) => {
  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });
  const attempts = await all(
    `SELECT a.id, a.status, a.auto_score, a.total_score, a.submitted_at, st.first_name, st.last_name
     FROM exam_attempts a JOIN students st ON st.id = a.student_id
     WHERE a.exam_id = $1 AND a.status IN ('submitted','graded')
     ORDER BY a.submitted_at DESC`,
    [examId]
  );
  res.json({ exam: { id: exam.id, title: exam.title }, attempts: attempts.map(a => ({
    id: a.id, status: a.status, studentName: `${a.first_name} ${a.last_name}`,
    autoScore: Number(a.auto_score), totalScore: a.total_score !== null ? Number(a.total_score) : null,
    submittedAt: a.submitted_at
  })) });
}));

router.get('/exams/attempts/:attemptId', requirePermission('results.view'), asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const attempt = await get(
    `SELECT a.*, e.title AS exam_title, st.first_name, st.last_name
     FROM exam_attempts a JOIN exams e ON e.id = a.exam_id JOIN students st ON st.id = a.student_id
     WHERE a.id = $1`,
    [attemptId]
  );
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  const answers = await all(
    `SELECT ea.id AS answer_id, ea.student_answer, ea.is_correct, ea.marks_awarded,
            q.id AS question_id, q.question_text, q.question_type, q.options, q.correct_answer, q.marks
     FROM exam_answers ea JOIN exam_questions q ON q.id = ea.question_id
     WHERE ea.attempt_id = $1 ORDER BY q.position, q.id`,
    [attemptId]
  );
  res.json({
    attempt: { id: attempt.id, studentName: `${attempt.first_name} ${attempt.last_name}`, examTitle: attempt.exam_title, status: attempt.status },
    answers
  });
}));

router.post('/exams/attempts/:attemptId/grade', requirePermission('results.enter'), asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const attempt = await get(
    `SELECT a.*, e.title AS exam_title, e.subject FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1`,
    [attemptId]
  );
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });

  const { grades } = req.body || {};
  for (const g of (grades || [])) {
    await run('UPDATE exam_answers SET marks_awarded = $1 WHERE attempt_id = $2 AND question_id = $3', [g.marks_awarded, attemptId, g.question_id]);
  }

  const stillUngraded = await get(
    `SELECT COUNT(*) AS c FROM exam_answers ea JOIN exam_questions eq ON eq.id = ea.question_id
     WHERE ea.attempt_id = $1 AND eq.question_type = 'descriptive' AND ea.marks_awarded IS NULL`,
    [attemptId]
  );
  if (Number(stillUngraded.c) > 0) {
    const remaining = Number(stillUngraded.c);
    return res.json({ message: `Saved. ${remaining} question${remaining === 1 ? '' : 's'} still need${remaining === 1 ? 's' : ''} a mark before this can be published.` });
  }

  const totalsRow = await get('SELECT COALESCE(SUM(marks_awarded), 0) AS total FROM exam_answers WHERE attempt_id = $1', [attemptId]);
  const maxRow = await get(
    'SELECT COALESCE(SUM(marks),0) AS max FROM exam_questions WHERE exam_id = (SELECT exam_id FROM exam_attempts WHERE id = $1)',
    [attemptId]
  );
  const totalScore = Number(totalsRow.total);
  await run("UPDATE exam_attempts SET total_score = $1, status = 'graded' WHERE id = $2", [totalScore, attemptId]);

  const scoreText = `${totalScore}/${Number(maxRow.max)}`;
  const assessmentLabel = `Test: ${attempt.exam_title}`;
  const existingGrade = await get(
    'SELECT id FROM grades WHERE student_id = $1 AND subject = $2 AND assessment = $3',
    [attempt.student_id, attempt.subject, assessmentLabel]
  );
  if (existingGrade) {
    await run('UPDATE grades SET score = $1, recorded_at = CURRENT_TIMESTAMP WHERE id = $2', [scoreText, existingGrade.id]);
  } else {
    await run(
      'INSERT INTO grades (student_id, subject, assessment, score) VALUES ($1,$2,$3,$4)',
      [attempt.student_id, attempt.subject, assessmentLabel, scoreText]
    );
  }
  await logAudit(req, 'exam.graded', 'exam_attempt', attemptId, { examTitle: attempt.exam_title, totalScore });
  res.json({ message: `Graded — ${scoreText}. Result published to the student's gradebook.` });
}));

// ---------- Fee payment confirmations ----------
// Parents can only *claim* they've paid (routes/parent.js) — no payment
// gateway is connected, so nothing is actually marked paid until an admin
// confirms it here, ideally against a real bank/cash record.

router.get('/invoices/pending-confirmation', requirePermission('settings.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT i.id, i.term, i.amount_due, i.due_date, i.payment_note, i.payment_claimed_at,
            st.first_name, st.last_name, st.admission_no
     FROM invoices i JOIN students st ON st.id = i.student_id
     WHERE i.status = 'pending_confirmation' ORDER BY i.payment_claimed_at ASC`
  );
  res.json({ invoices: rows.map(r => ({
    id: r.id, term: r.term, amountDue: r.amount_due, dueDate: r.due_date,
    paymentNote: r.payment_note, claimedAt: r.payment_claimed_at,
    studentName: `${r.first_name} ${r.last_name}`, admissionNo: r.admission_no
  })) });
}));

router.post('/invoices/:id/confirm-payment', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const invoice = await get('SELECT * FROM invoices WHERE id = $1', [Number(req.params.id)]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (invoice.status !== 'pending_confirmation') return res.status(409).json({ error: 'This invoice isn\u2019t awaiting confirmation.' });

  await run("UPDATE invoices SET status = 'paid', amount_paid = amount_due WHERE id = $1", [invoice.id]);
  await logAudit(req, 'invoice.payment_confirmed', 'invoice', invoice.id, { amount: invoice.amount_due });
  res.json({ message: 'Payment confirmed — the parent will see this invoice as paid.' });
}));

router.post('/invoices/:id/reject-payment', requirePermission('settings.edit'), asyncHandler(async (req, res) => {
  const invoice = await get('SELECT * FROM invoices WHERE id = $1', [Number(req.params.id)]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (invoice.status !== 'pending_confirmation') return res.status(409).json({ error: 'This invoice isn\u2019t awaiting confirmation.' });

  const newStatus = invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10) ? 'overdue' : 'pending';
  await run(`UPDATE invoices SET status = $1, payment_note = NULL, payment_claimed_at = NULL WHERE id = $2`, [newStatus, invoice.id]);
  await logAudit(req, 'invoice.payment_rejected', 'invoice', invoice.id, null);
  res.json({ message: 'Payment claim rejected \u2014 the parent will see this invoice as unpaid again.' });
}));

module.exports = router;
