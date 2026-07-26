const express = require('express');
const { get, all, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate, requireRole('student'));

async function getStudent(req) {
  return get('SELECT * FROM students WHERE user_id = $1', [req.user.id]);
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const day = req.query.day || 'Monday'; // demo school calendar runs on a fixed Mon-Fri cycle

  const timetable = await all(
    `SELECT start_time, subject, room FROM timetable
     WHERE section_code = $1 AND day_of_week = $2 ORDER BY start_time`,
    [student.section_code, day]
  );

  const attendanceRows = await all('SELECT status FROM attendance WHERE student_id = $1', [student.id]);
  const total = attendanceRows.length;
  const present = attendanceRows.filter(r => r.status === 'present').length;
  const attendancePct = total ? Math.round((present / total) * 100) : null;

  const homeworkDue = await all(
    `SELECT a.id, a.title, a.subject, a.due_date
     FROM assignments a
     WHERE a.section_code = $1
       AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = $2)
     ORDER BY a.due_date ASC`,
    [student.section_code, student.id]
  );

  const recentGrades = await all(
    'SELECT subject, assessment, score FROM grades WHERE student_id = $1 ORDER BY recorded_at DESC LIMIT 6',
    [student.id]
  );

  const announcements = await all(
    `SELECT title, body, created_at FROM announcements
     WHERE audience IN ('all', 'students') ORDER BY created_at DESC LIMIT 6`
  );

  res.json({
    student: { name: `${student.first_name} ${student.last_name}`, section: student.section_code },
    day,
    timetable,
    attendancePct,
    homeworkDue,
    recentGrades,
    announcements
  });
}));

router.post('/assignments/:id/submit', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const assignmentId = Number(req.params.id);
  const assignment = await get('SELECT * FROM assignments WHERE id = $1', [assignmentId]);
  if (!assignment || assignment.section_code !== student.section_code) {
    return res.status(404).json({ error: 'Assignment not found for your section.' });
  }

  const existing = await get('SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2', [assignmentId, student.id]);
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted this assignment.' });
  }

  await run(
    'INSERT INTO submissions (assignment_id, student_id, submitted_at, status) VALUES ($1, $2, $3, $4)',
    [assignmentId, student.id, new Date().toISOString(), 'submitted']
  );

  res.status(201).json({ message: `"${assignment.title}" submitted.` });
}));

module.exports = router;
