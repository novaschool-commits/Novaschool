const express = require('express');
const { get, all, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate, requireRole('teacher'));

async function getTeacher(req) {
  return get('SELECT * FROM teachers WHERE user_id = $1', [req.user.id]);
}

function currentDayName() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const day = req.query.day || currentDayName(); // real weekday by default; override with ?day= for testing

  const todaysClasses = await all(
    `SELECT id, start_time, subject, section_code, room, meeting_link
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

  const mySectionsRows = await all(
    'SELECT DISTINCT section_code FROM timetable WHERE teacher_id = $1 ORDER BY section_code',
    [teacher.id]
  );

  res.json({
    teacher: { name: `${teacher.first_name} ${teacher.last_name}`, subject: teacher.subject },
    day,
    todaysClasses,
    gradingQueue: gradingQueue.map(q => ({ ...q, pending: Number(q.pending) })),
    roster: { section: primarySection ? primarySection.section_code : null, students: roster },
    messages,
    mySections: mySectionsRows.map(r => r.section_code)
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

router.post('/timetable/:id/link', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const timetableId = Number(req.params.id);
  const { meeting_link } = req.body || {};

  const slot = await get('SELECT * FROM timetable WHERE id = $1 AND teacher_id = $2', [timetableId, teacher.id]);
  if (!slot) return res.status(404).json({ error: 'Class slot not found for you.' });

  await run('UPDATE timetable SET meeting_link = $1 WHERE id = $2', [meeting_link || null, timetableId]);
  res.json({ message: meeting_link ? 'Meeting link saved.' : 'Meeting link cleared.' });
}));

router.get('/lessons', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const lessons = await all(
    'SELECT id, title, subject, section_code, video_url, description, created_at FROM lessons WHERE teacher_id = $1 ORDER BY created_at DESC',
    [teacher.id]
  );
  res.json({ lessons });
}));

router.post('/lessons', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { title, subject, section_code, video_url, description } = req.body || {};
  if (!title || !subject || !section_code || !video_url) {
    return res.status(400).json({ error: 'title, subject, section_code, and video_url are required.' });
  }

  const allowedSection = await get(
    'SELECT 1 FROM timetable WHERE teacher_id = $1 AND section_code = $2 LIMIT 1',
    [teacher.id, section_code]
  );
  if (!allowedSection) {
    return res.status(403).json({ error: 'You do not teach a class in that section.' });
  }

  await run(
    'INSERT INTO lessons (title, subject, section_code, teacher_id, video_url, description) VALUES ($1,$2,$3,$4,$5,$6)',
    [title, subject, section_code, teacher.id, video_url, description || null]
  );
  res.status(201).json({ message: 'Lesson added.' });
}));

router.delete('/lessons/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const lessonId = Number(req.params.id);
  const lesson = await get('SELECT * FROM lessons WHERE id = $1 AND teacher_id = $2', [lessonId, teacher.id]);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found for you.' });

  await run('DELETE FROM lessons WHERE id = $1', [lessonId]);
  res.json({ message: 'Lesson deleted.' });
}));

// ---------- Tests & Quizzes ----------

router.get('/exams', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const exams = await all(
    `SELECT e.id, e.title, e.subject, e.section_code, e.duration_minutes, e.is_published,
            (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.id) AS question_count,
            (SELECT COUNT(*) FROM exam_attempts WHERE exam_id = e.id AND status = 'submitted') AS pending_grading
     FROM exams e WHERE e.teacher_id = $1 ORDER BY e.created_at DESC`,
    [teacher.id]
  );

  res.json({ exams: exams.map(e => ({
    id: e.id, title: e.title, subject: e.subject, sectionCode: e.section_code,
    durationMinutes: e.duration_minutes, isPublished: e.is_published,
    questionCount: Number(e.question_count), pendingGrading: Number(e.pending_grading)
  })) });
}));

router.post('/exams', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { title, subject, section_code, duration_minutes } = req.body || {};
  if (!title || !subject || !section_code) {
    return res.status(400).json({ error: 'title, subject, and section_code are required.' });
  }
  const allowedSection = await get('SELECT 1 FROM timetable WHERE teacher_id = $1 AND section_code = $2 LIMIT 1', [teacher.id, section_code]);
  if (!allowedSection) return res.status(403).json({ error: 'You do not teach a class in that section.' });

  const r = await run(
    'INSERT INTO exams (title, subject, section_code, teacher_id, duration_minutes) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [title, subject, section_code, teacher.id, Number(duration_minutes) || 30]
  );
  res.status(201).json({ message: 'Test created. Add questions, then publish it.', examId: r.rows[0].id });
}));

router.post('/exams/:id/questions', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1 AND teacher_id = $2', [examId, teacher.id]);
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

router.post('/exams/:id/publish', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1 AND teacher_id = $2', [examId, teacher.id]);
  if (!exam) return res.status(404).json({ error: 'Test not found.' });

  const countRow = await get('SELECT COUNT(*) AS c FROM exam_questions WHERE exam_id = $1', [examId]);
  if (Number(countRow.c) === 0) return res.status(400).json({ error: 'Add at least one question before publishing.' });

  await run('UPDATE exams SET is_published = TRUE WHERE id = $1', [examId]);
  res.json({ message: 'Test published — students in this section can now see and take it.' });
}));

router.get('/exams/:id/attempts', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const examId = Number(req.params.id);
  const exam = await get('SELECT * FROM exams WHERE id = $1 AND teacher_id = $2', [examId, teacher.id]);
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

router.get('/exams/attempts/:attemptId', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const attemptId = Number(req.params.attemptId);
  const attempt = await get(
    `SELECT a.*, e.teacher_id, e.title AS exam_title, st.first_name, st.last_name
     FROM exam_attempts a JOIN exams e ON e.id = a.exam_id JOIN students st ON st.id = a.student_id
     WHERE a.id = $1`,
    [attemptId]
  );
  if (!attempt || attempt.teacher_id !== teacher.id) return res.status(404).json({ error: 'Attempt not found.' });

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

router.post('/exams/attempts/:attemptId/grade', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const attemptId = Number(req.params.attemptId);
  const attempt = await get(
    `SELECT a.*, e.teacher_id, e.title AS exam_title, e.subject FROM exam_attempts a
     JOIN exams e ON e.id = a.exam_id WHERE a.id = $1`,
    [attemptId]
  );
  if (!attempt || attempt.teacher_id !== teacher.id) return res.status(404).json({ error: 'Attempt not found.' });

  const { grades } = req.body || {}; // [{ question_id, marks_awarded }] — descriptive questions only
  for (const g of (grades || [])) {
    await run('UPDATE exam_answers SET marks_awarded = $1 WHERE attempt_id = $2 AND question_id = $3', [g.marks_awarded, attemptId, g.question_id]);
  }

  const totalsRow = await get('SELECT COALESCE(SUM(marks_awarded), 0) AS total FROM exam_answers WHERE attempt_id = $1', [attemptId]);
  const maxRow = await get(
    'SELECT COALESCE(SUM(marks),0) AS max FROM exam_questions WHERE exam_id = (SELECT exam_id FROM exam_attempts WHERE id = $1)',
    [attemptId]
  );
  const totalScore = Number(totalsRow.total);

  await run("UPDATE exam_attempts SET total_score = $1, status = 'graded' WHERE id = $2", [totalScore, attemptId]);

  await run(
    'INSERT INTO grades (student_id, subject, assessment, score) VALUES ($1,$2,$3,$4)',
    [attempt.student_id, attempt.subject, `Test: ${attempt.exam_title}`, `${totalScore}/${Number(maxRow.max)}`]
  );

  res.json({ message: 'Grading saved and published to the student\u2019s gradebook.' });
}));

// ---------- Timetable management ----------

router.get('/timetable', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const sectionCode = req.query.section;
  if (!sectionCode) return res.status(400).json({ error: 'section query parameter is required.' });

  const allowedSection = await get('SELECT 1 FROM timetable WHERE teacher_id = $1 AND section_code = $2 LIMIT 1', [teacher.id, sectionCode]);
  const teachesHere = !!allowedSection || (await get('SELECT 1 FROM sections WHERE class_teacher_id = $1 AND section_code = $2', [teacher.id, sectionCode]));
  if (!teachesHere) return res.status(403).json({ error: 'You do not teach a class in that section.' });

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
    teacherName: r.teacher_first ? `${r.teacher_first} ${r.teacher_last}` : 'Unassigned',
    isMine: r.teacher_id === teacher.id
  })) });
}));

router.post('/timetable', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { section_code, day_of_week, start_time, subject, room } = req.body || {};
  if (!section_code || !day_of_week || !start_time || !subject) {
    return res.status(400).json({ error: 'section_code, day_of_week, start_time, and subject are required.' });
  }
  const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (!validDays.includes(day_of_week)) {
    return res.status(400).json({ error: 'day_of_week must be Monday–Friday.' });
  }

  const teachesHere = await get('SELECT 1 FROM timetable WHERE teacher_id = $1 AND section_code = $2 LIMIT 1', [teacher.id, section_code])
    || await get('SELECT 1 FROM sections WHERE class_teacher_id = $1 AND section_code = $2', [teacher.id, section_code]);
  if (!teachesHere) return res.status(403).json({ error: 'You do not teach a class in that section.' });

  const clash = await get(
    'SELECT 1 FROM timetable WHERE section_code = $1 AND day_of_week = $2 AND start_time = $3',
    [section_code, day_of_week, start_time]
  );
  if (clash) return res.status(409).json({ error: 'This section already has a period at that day and time.' });

  await run(
    'INSERT INTO timetable (section_code, day_of_week, start_time, subject, room, teacher_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [section_code, day_of_week, start_time, subject, room || null, teacher.id]
  );
  res.status(201).json({ message: 'Period added.' });
}));

router.patch('/timetable/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const id = Number(req.params.id);
  const slot = await get('SELECT * FROM timetable WHERE id = $1 AND teacher_id = $2', [id, teacher.id]);
  if (!slot) return res.status(404).json({ error: 'Period not found, or it belongs to another teacher.' });

  const { subject, room, start_time, day_of_week } = req.body || {};
  await run(
    'UPDATE timetable SET subject = COALESCE($1, subject), room = $2, start_time = COALESCE($3, start_time), day_of_week = COALESCE($4, day_of_week) WHERE id = $5',
    [subject || null, room !== undefined ? room : slot.room, start_time || null, day_of_week || null, id]
  );
  res.json({ message: 'Period updated.' });
}));

router.delete('/timetable/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const id = Number(req.params.id);
  const slot = await get('SELECT * FROM timetable WHERE id = $1 AND teacher_id = $2', [id, teacher.id]);
  if (!slot) return res.status(404).json({ error: 'Period not found, or it belongs to another teacher.' });

  await run('DELETE FROM timetable WHERE id = $1', [id]);
  res.json({ message: 'Period removed.' });
}));

module.exports = router;
