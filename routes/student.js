const express = require('express');
const { get, all, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate, requireRole('student'));

async function getStudent(req) {
  return get('SELECT * FROM students WHERE user_id = $1', [req.user.id]);
}

function currentDayName() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const day = req.query.day || currentDayName(); // real weekday by default; override with ?day= for testing

  const timetable = await all(
    `SELECT start_time, subject, room, meeting_link FROM timetable
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

router.get('/lessons', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const lessons = await all(
    `SELECT l.id, l.title, l.subject, l.video_url, l.description, l.created_at,
            t.first_name AS teacher_first, t.last_name AS teacher_last
     FROM lessons l LEFT JOIN teachers t ON t.id = l.teacher_id
     WHERE l.section_code = $1 ORDER BY l.created_at DESC`,
    [student.section_code]
  );

  res.json({ lessons });
}));

// ---------- Tests & Quizzes ----------

router.get('/exams', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const exams = await all(
    `SELECT e.id, e.title, e.subject, e.duration_minutes,
            (SELECT COALESCE(SUM(marks),0) FROM exam_questions WHERE exam_id = e.id) AS max_marks,
            a.id AS attempt_id, a.status AS attempt_status, a.total_score
     FROM exams e
     LEFT JOIN exam_attempts a ON a.exam_id = e.id AND a.student_id = $1
     WHERE e.section_code = $2 AND e.is_published = TRUE
     ORDER BY e.created_at DESC`,
    [student.id, student.section_code]
  );

  res.json({ exams: exams.map(e => ({
    id: e.id, title: e.title, subject: e.subject, durationMinutes: e.duration_minutes,
    maxMarks: Number(e.max_marks),
    status: e.attempt_status || 'not_started',
    totalScore: e.total_score !== null ? Number(e.total_score) : null
  })) });
}));

router.get('/exams/:id', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1 AND section_code = $2 AND is_published = TRUE', [examId, student.section_code]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });

  const attempt = await get('SELECT * FROM exam_attempts WHERE exam_id = $1 AND student_id = $2', [examId, student.id]);

  // Questions are only sent once the student has actually started — never leak
  // correct_answer to the client, ever, at any stage.
  let questions = [];
  if (attempt) {
    questions = await all(
      'SELECT id, question_text, question_type, options, marks FROM exam_questions WHERE exam_id = $1 ORDER BY position, id',
      [examId]
    );
  }

  res.json({
    exam: { id: exam.id, title: exam.title, subject: exam.subject, durationMinutes: exam.duration_minutes },
    attempt: attempt ? {
      id: attempt.id, status: attempt.status, startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at, totalScore: attempt.total_score !== null ? Number(attempt.total_score) : null
    } : null,
    questions
  });
}));

router.post('/exams/:id/start', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1 AND section_code = $2 AND is_published = TRUE', [examId, student.section_code]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });

  let attempt = await get('SELECT * FROM exam_attempts WHERE exam_id = $1 AND student_id = $2', [examId, student.id]);
  if (!attempt) {
    const r = await run(
      'INSERT INTO exam_attempts (exam_id, student_id, started_at, status) VALUES ($1,$2,$3,$4) RETURNING id, started_at, status',
      [examId, student.id, new Date().toISOString(), 'in_progress']
    );
    attempt = r.rows[0];
  }

  const questions = await all(
    'SELECT id, question_text, question_type, options, marks FROM exam_questions WHERE exam_id = $1 ORDER BY position, id',
    [examId]
  );

  res.json({
    attempt: { id: attempt.id, status: attempt.status, startedAt: attempt.started_at },
    durationMinutes: exam.duration_minutes,
    questions
  });
}));

router.post('/exams/:id/submit', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const examId = Number(req.params.id);
  const { answers } = req.body || {}; // [{ question_id, answer }]

  const attempt = await get('SELECT * FROM exam_attempts WHERE exam_id = $1 AND student_id = $2', [examId, student.id]);
  if (!attempt) return res.status(404).json({ error: 'You have not started this test.' });
  if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'This test has already been submitted.' });

  const questions = await all('SELECT * FROM exam_questions WHERE exam_id = $1', [examId]);
  const questionMap = {};
  questions.forEach(q => { questionMap[q.id] = q; });

  let autoScore = 0;
  let hasDescriptive = false;

  for (const ans of (answers || [])) {
    const q = questionMap[ans.question_id];
    if (!q) continue;
    if (q.question_type === 'mcq') {
      const isCorrect = (ans.answer || '').trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase();
      const marksAwarded = isCorrect ? q.marks : 0;
      autoScore += marksAwarded;
      await run(
        `INSERT INTO exam_answers (attempt_id, question_id, student_answer, is_correct, marks_awarded)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET student_answer = $3, is_correct = $4, marks_awarded = $5`,
        [attempt.id, q.id, ans.answer || '', isCorrect, marksAwarded]
      );
    } else {
      hasDescriptive = true;
      await run(
        `INSERT INTO exam_answers (attempt_id, question_id, student_answer, is_correct, marks_awarded)
         VALUES ($1,$2,$3,NULL,NULL)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET student_answer = $3, marks_awarded = NULL`,
        [attempt.id, q.id, ans.answer || '']
      );
    }
  }

  const newStatus = hasDescriptive ? 'submitted' : 'graded';
  const totalScore = hasDescriptive ? null : autoScore;

  await run(
    'UPDATE exam_attempts SET submitted_at = $1, status = $2, auto_score = $3, total_score = $4 WHERE id = $5',
    [new Date().toISOString(), newStatus, autoScore, totalScore, attempt.id]
  );

  if (!hasDescriptive) {
    const exam = await get('SELECT title FROM exams WHERE id = $1', [examId]);
    const maxMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    await run(
      'INSERT INTO grades (student_id, subject, assessment, score) VALUES ($1,$2,$3,$4)',
      [student.id, exam.subject, `Test: ${exam.title}`, `${autoScore}/${maxMarks}`]
    );
  }

  res.json({
    message: hasDescriptive
      ? 'Submitted. Some answers need your teacher to grade them by hand — your score will show up once that\u2019s done.'
      : `Submitted and auto-graded: ${autoScore} marks.`,
    status: newStatus
  });
}));

module.exports = router;
