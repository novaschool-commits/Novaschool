const express = require('express');
const { get, all, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate, requireRole('teacher'));

async function getTeacher(req) {
  return get('SELECT * FROM teachers WHERE user_id = $1', [req.user.id]);
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const day = req.query.day || 'Monday';

  const todaysClasses = await all(
    `SELECT start_time, subject, section_code, room
     FROM timetable WHERE teacher_id = $1 AND day_of_week = $2
     ORDER BY start_time`,
    [teacher.id, day]
  );

  const gradingQueue = await all(
    `SELECT a.id AS assignment_id, a.title, a.section_code, COUNT(s.id) AS pending
     FROM assignments a
     JOIN submissions s ON s.assignment_id = a.id AND s.status = 'submitted'
     WHERE a.teacher_id = $1
     GROUP BY a.id
     ORDER BY pending DESC`,
    [teacher.id]
  );

  const primarySection = await get('SELECT section_code FROM sections WHERE class_teacher_id = $1 LIMIT 1', [teacher.id]);
  const roster = primarySection
    ? await all('SELECT first_name, last_name, admission_no FROM students WHERE section_code = $1 ORDER BY last_name', [primarySection.section_code])
    : [];

  const rawMessages = await all(
    'SELECT sender_id, body, sent_at FROM messages WHERE recipient_id = $1 ORDER BY sent_at DESC LIMIT 10',
    [req.user.id]
  );
  const messages = [];
  for (const r of rawMessages) {
    const student = await get('SELECT first_name, last_name FROM students WHERE user_id = $1', [r.sender_id]);
    const parent = !student ? await get('SELECT first_name, last_name FROM parents WHERE user_id = $1', [r.sender_id]) : null;
    const from = student ? `${student.first_name} ${student.last_name} (Student)`
      : parent ? `${parent.first_name} ${parent.last_name} (Parent)` : 'Unknown';
    messages.push({ from, body: r.body, sentAt: r.sent_at });
  }

  res.json({
    teacher: { name: `${teacher.first_name} ${teacher.last_name}`, subject: teacher.subject },
    day,
    todaysClasses,
    gradingQueue: gradingQueue.map(q => ({ ...q, pending: Number(q.pending) })),
    roster: { section: primarySection ? primarySection.section_code : null, students: roster },
    messages
  });
}));

router.get('/assignments/:id/submissions', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const assignmentId = Number(req.params.id);
  const assignment = await get('SELECT * FROM assignments WHERE id = $1 AND teacher_id = $2', [assignmentId, teacher.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

  const submissions = await all(
    `SELECT s.id, s.status, s.marks, st.first_name, st.last_name
     FROM submissions s JOIN students st ON st.id = s.student_id
     WHERE s.assignment_id = $1 AND s.status = 'submitted'
     ORDER BY st.last_name`,
    [assignmentId]
  );

  res.json({ assignment: { id: assignment.id, title: assignment.title, maxMarks: assignment.max_marks }, submissions });
}));

router.post('/submissions/:id/grade', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const submissionId = Number(req.params.id);
  const { marks } = req.body || {};

  const submission = await get(
    `SELECT s.*, a.teacher_id, a.max_marks, a.subject, a.title FROM submissions s
     JOIN assignments a ON a.id = s.assignment_id WHERE s.id = $1`,
    [submissionId]
  );

  if (!submission || submission.teacher_id !== teacher.id) {
    return res.status(404).json({ error: 'Submission not found for your assignments.' });
  }
  if (marks === undefined || marks < 0 || marks > submission.max_marks) {
    return res.status(400).json({ error: `Marks must be between 0 and ${submission.max_marks}.` });
  }

  await run("UPDATE submissions SET marks = $1, status = 'graded' WHERE id = $2", [marks, submissionId]);

  await run(
    'INSERT INTO grades (student_id, subject, assessment, score) VALUES ($1, $2, $3, $4)',
    [submission.student_id, submission.subject, submission.title, `${marks}/${submission.max_marks}`]
  );

  res.json({ message: 'Grade recorded.' });
}));

module.exports = router;
