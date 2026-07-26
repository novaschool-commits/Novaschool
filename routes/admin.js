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
    'SELECT id, applicant_name, grade_applied, parent_email, status, submitted_at FROM admission_applications WHERE status = $1 ORDER BY submitted_at DESC',
    [status]
  );
  res.json({ applications: rows });
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

module.exports = router;
