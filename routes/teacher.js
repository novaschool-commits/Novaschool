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

router.get('/assignments', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const rows = await all(
    `SELECT a.id, a.title, a.subject, a.section_code, a.due_date, a.max_marks,
            COUNT(s.id) FILTER (WHERE s.status = 'submitted') AS pending_count,
            COUNT(s.id) FILTER (WHERE s.status = 'graded') AS graded_count
     FROM assignments a LEFT JOIN submissions s ON s.assignment_id = a.id
     WHERE a.teacher_id = $1 GROUP BY a.id ORDER BY a.due_date DESC NULLS LAST`,
    [teacher.id]
  );
  res.json({ assignments: rows.map(r => ({
    id: r.id, title: r.title, subject: r.subject, sectionCode: r.section_code,
    dueDate: r.due_date, maxMarks: r.max_marks,
    pendingCount: Number(r.pending_count), gradedCount: Number(r.graded_count)
  })) });
}));

router.post('/assignments', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { title, subject, section_code, due_date, max_marks, description } = req.body || {};
  if (!title || !subject || !section_code) {
    return res.status(400).json({ error: 'title, subject, and section_code are required.' });
  }
  const section = await get('SELECT section_code FROM sections WHERE section_code = $1', [section_code]);
  if (!section) return res.status(400).json({ error: `Section "${section_code}" doesn't exist.` });

  const r = await run(
    'INSERT INTO assignments (title, subject, section_code, teacher_id, due_date, max_marks, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [title, subject, section_code, teacher.id, due_date || null, Number(max_marks) || 100, description || null]
  );
  res.status(201).json({ message: 'Assignment created.', assignmentId: r.rows[0].id });
}));

router.get('/assignments/:id/submissions', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const assignmentId = Number(req.params.id);
  const assignment = await get('SELECT * FROM assignments WHERE id = $1 AND teacher_id = $2', [assignmentId, teacher.id]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

  const submissions = await all(
    `SELECT s.id, s.status, s.marks, s.body_text, s.file_name, s.feedback, s.submitted_at, st.first_name, st.last_name
     FROM submissions s JOIN students st ON st.id = s.student_id
     WHERE s.assignment_id = $1 AND s.status = 'submitted'
     ORDER BY st.last_name`,
    [assignmentId]
  );

  res.json({ assignment: { id: assignment.id, title: assignment.title, maxMarks: assignment.max_marks }, submissions });
}));

router.get('/submissions/:id/file', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const submission = await get(
    `SELECT s.file_base64, s.file_name, s.file_mime, a.teacher_id FROM submissions s
     JOIN assignments a ON a.id = s.assignment_id WHERE s.id = $1`,
    [Number(req.params.id)]
  );
  if (!submission || submission.teacher_id !== teacher.id) return res.status(404).json({ error: 'Submission not found for your assignments.' });
  if (!submission.file_base64) return res.status(404).json({ error: 'No file on this submission.' });
  res.json({ fileBase64: submission.file_base64, fileName: submission.file_name, fileMime: submission.file_mime });
}));

router.post('/submissions/:id/grade', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const submissionId = Number(req.params.id);
  const { marks, feedback } = req.body || {};

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

  await run("UPDATE submissions SET marks = $1, status = 'graded', feedback = $2 WHERE id = $3", [marks, feedback || null, submissionId]);

  // Upsert rather than blind INSERT — a teacher correcting a mark (opening
  // an already-graded submission and saving again) must update the
  // existing gradebook entry, not add a second, duplicate one.
  const scoreText = `${marks}/${submission.max_marks}`;
  const existingGrade = await get(
    'SELECT id FROM grades WHERE student_id = $1 AND subject = $2 AND assessment = $3',
    [submission.student_id, submission.subject, submission.title]
  );
  if (existingGrade) {
    await run('UPDATE grades SET score = $1, recorded_at = CURRENT_TIMESTAMP WHERE id = $2', [scoreText, existingGrade.id]);
  } else {
    await run(
      'INSERT INTO grades (student_id, subject, assessment, score) VALUES ($1, $2, $3, $4)',
      [submission.student_id, submission.subject, submission.title, scoreText]
    );
  }

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

  const { title, subject, section_code, video_url, description, lecture_date } = req.body || {};
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
    'INSERT INTO lessons (title, subject, section_code, teacher_id, video_url, description, lecture_date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [title, subject, section_code, teacher.id, video_url, description || null, lecture_date || null]
  );
  res.status(201).json({ message: lecture_date ? `Lesson added, tagged as the recording for ${lecture_date}.` : 'Lesson added.' });
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

  // Only finalize and publish once every descriptive question actually has
  // a mark — a partial save must not prematurely close grading or push an
  // incomplete score to the student's gradebook.
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

  // Upsert rather than blind INSERT — regrading (adjusting a mark and
  // saving again) must update the existing gradebook entry, not duplicate it.
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

// ---------- Self-paced Courses (management) ----------

router.get('/courses', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const courses = await all(
    `SELECT c.id, c.subject, c.curriculum, c.level, c.title, c.owner_teacher_id,
            (SELECT COUNT(*) FROM course_topics WHERE course_id = c.id) AS topic_count,
            (SELECT COUNT(*) FROM course_lessons cl JOIN course_topics ct ON ct.id = cl.topic_id WHERE ct.course_id = c.id) AS lesson_count
     FROM courses c ORDER BY c.subject, c.curriculum, c.level`
  );

  res.json({ courses: courses.map(c => ({
    id: c.id, subject: c.subject, curriculum: c.curriculum, level: c.level, title: c.title,
    topicCount: Number(c.topic_count), lessonCount: Number(c.lesson_count), isMine: c.owner_teacher_id === teacher.id
  })) });
}));

router.post('/courses', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { subject, curriculum, level, title, description } = req.body || {};
  if (!subject || !curriculum || !level || !title) {
    return res.status(400).json({ error: 'subject, curriculum, level, and title are required.' });
  }

  const r = await run(
    'INSERT INTO courses (subject, curriculum, level, title, description, owner_teacher_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [subject, curriculum, level, title, description || null, teacher.id]
  );
  res.status(201).json({ message: 'Course created.', courseId: r.rows[0].id });
}));

router.delete('/courses/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const id = Number(req.params.id);
  const course = await get('SELECT * FROM courses WHERE id = $1 AND owner_teacher_id = $2', [id, teacher.id]);
  if (!course) return res.status(404).json({ error: 'Course not found, or it belongs to another teacher.' });

  const topicIds = (await all('SELECT id FROM course_topics WHERE course_id = $1', [id])).map(t => t.id);
  for (const tid of topicIds) {
    await run('DELETE FROM course_progress WHERE lesson_id IN (SELECT id FROM course_lessons WHERE topic_id = $1)', [tid]);
    await run('DELETE FROM course_lessons WHERE topic_id = $1', [tid]);
  }
  await run('DELETE FROM course_topics WHERE course_id = $1', [id]);
  await run('DELETE FROM courses WHERE id = $1', [id]);
  res.json({ message: 'Course deleted.' });
}));

router.get('/courses/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const courseId = Number(req.params.id);
  const course = await get('SELECT * FROM courses WHERE id = $1', [courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const topics = await all('SELECT id, title FROM course_topics WHERE course_id = $1 ORDER BY position, id', [courseId]);
  const lessons = await all(
    `SELECT cl.id, cl.topic_id, cl.title, cl.content_type, cl.video_url, cl.body_text
     FROM course_lessons cl JOIN course_topics ct ON ct.id = cl.topic_id WHERE ct.course_id = $1 ORDER BY cl.position, cl.id`,
    [courseId]
  );

  res.json({
    course: { id: course.id, title: course.title, isMine: course.owner_teacher_id === teacher.id },
    topics: topics.map(t => ({ id: t.id, title: t.title, lessons: lessons.filter(l => l.topic_id === t.id) }))
  });
}));

router.post('/courses/:id/topics', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const courseId = Number(req.params.id);
  const course = await get('SELECT id FROM courses WHERE id = $1', [courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });

  const posRow = await get('SELECT COALESCE(MAX(position),0)+1 AS next FROM course_topics WHERE course_id = $1', [courseId]);
  await run('INSERT INTO course_topics (course_id, title, position) VALUES ($1,$2,$3)', [courseId, title, posRow.next]);
  res.status(201).json({ message: 'Topic added.' });
}));

router.delete('/courses/topics/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const id = Number(req.params.id);
  await run('DELETE FROM course_progress WHERE lesson_id IN (SELECT id FROM course_lessons WHERE topic_id = $1)', [id]);
  await run('DELETE FROM course_lessons WHERE topic_id = $1', [id]);
  await run('DELETE FROM course_topics WHERE id = $1', [id]);
  res.json({ message: 'Topic deleted.' });
}));

router.post('/courses/topics/:id/lessons', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const topicId = Number(req.params.id);
  const topic = await get('SELECT id FROM course_topics WHERE id = $1', [topicId]);
  if (!topic) return res.status(404).json({ error: 'Topic not found.' });

  const { title, content_type, video_url, body_text } = req.body || {};
  if (!title || !['video', 'text'].includes(content_type)) {
    return res.status(400).json({ error: 'title and a valid content_type (video/text) are required.' });
  }

  const posRow = await get('SELECT COALESCE(MAX(position),0)+1 AS next FROM course_lessons WHERE topic_id = $1', [topicId]);
  await run(
    'INSERT INTO course_lessons (topic_id, title, content_type, video_url, body_text, position) VALUES ($1,$2,$3,$4,$5,$6)',
    [topicId, title, content_type, content_type === 'video' ? video_url : null, content_type === 'text' ? body_text : null, posRow.next]
  );
  res.status(201).json({ message: 'Lesson added.' });
}));

router.delete('/courses/lessons/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const id = Number(req.params.id);
  await run('DELETE FROM course_progress WHERE lesson_id = $1', [id]);
  await run('DELETE FROM course_lessons WHERE id = $1', [id]);
  res.json({ message: 'Lesson deleted.' });
}));

// ---------- Live class chat lock ----------

router.post('/live-session/start', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { section_code } = req.body || {};
  if (!section_code) return res.status(400).json({ error: 'section_code is required.' });

  const existing = await get('SELECT id FROM class_sessions WHERE teacher_id = $1 AND section_code = $2 AND ended_at IS NULL', [teacher.id, section_code]);
  if (existing) return res.status(409).json({ error: 'A live session for this section is already running.', sessionId: existing.id });

  const session = await get('INSERT INTO class_sessions (teacher_id, section_code, is_locked) VALUES ($1,$2,TRUE) RETURNING id', [teacher.id, section_code]);
  res.status(201).json({ message: `Live class started for ${section_code} — student chat is locked until you end it.`, sessionId: session.id });
}));

router.post('/live-session/end', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { section_code } = req.body || {};
  const existing = await get('SELECT id FROM class_sessions WHERE teacher_id = $1 AND section_code = $2 AND ended_at IS NULL', [teacher.id, section_code]);
  if (!existing) return res.status(404).json({ error: 'No live session is running for this section.' });

  await run('UPDATE class_sessions SET ended_at = $1, is_locked = FALSE WHERE id = $2', [new Date().toISOString(), existing.id]);
  // Whatever whiteboard was attached to this session is now available for review.
  await run("UPDATE whiteboards SET status = 'saved', updated_at = CURRENT_TIMESTAMP WHERE class_session_id = $1 AND status = 'live'", [existing.id]);
  res.json({ message: `Live class ended for ${section_code} — student chat is unlocked.` });
}));

// ---------- Virtual classroom whiteboard (teacher side) ----------

router.post('/whiteboard/start', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { class_session_id, subject } = req.body || {};
  if (!class_session_id) return res.status(400).json({ error: 'class_session_id is required.' });

  const session = await get('SELECT * FROM class_sessions WHERE id = $1 AND teacher_id = $2', [class_session_id, teacher.id]);
  if (!session) return res.status(404).json({ error: 'Live session not found.' });
  if (session.ended_at) return res.status(400).json({ error: 'That live session has already ended.' });

  const existing = await get('SELECT id FROM whiteboards WHERE class_session_id = $1', [class_session_id]);
  if (existing) return res.json({ message: 'Resuming existing whiteboard.', whiteboardId: existing.id });

  const wb = await get(
    'INSERT INTO whiteboards (class_session_id, teacher_id, section_code, subject) VALUES ($1,$2,$3,$4) RETURNING id',
    [class_session_id, teacher.id, session.section_code, subject || null]
  );
  const firstPage = await get('INSERT INTO whiteboard_pages (whiteboard_id, position) VALUES ($1, 0) RETURNING id', [wb.id]);
  await run('UPDATE whiteboards SET current_page_id = $1 WHERE id = $2', [firstPage.id, wb.id]);
  res.status(201).json({ message: 'Whiteboard ready.', whiteboardId: wb.id });
}));

router.get('/whiteboards', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const rows = await all(
    `SELECT id, section_code, subject, status, created_at, updated_at FROM whiteboards WHERE teacher_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [teacher.id]
  );
  res.json({ whiteboards: rows });
}));

router.get('/whiteboard/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const wb = await get('SELECT * FROM whiteboards WHERE id = $1 AND teacher_id = $2', [Number(req.params.id), teacher.id]);
  if (!wb) return res.status(404).json({ error: 'Whiteboard not found.' });
  const pages = await all('SELECT id, position, snapshot FROM whiteboard_pages WHERE whiteboard_id = $1 ORDER BY position', [wb.id]);
  res.json({ whiteboard: wb, pages });
}));

router.delete('/whiteboard/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const wb = await get('SELECT * FROM whiteboards WHERE id = $1 AND teacher_id = $2', [Number(req.params.id), teacher.id]);
  if (!wb) return res.status(404).json({ error: 'Whiteboard not found.' });

  await run("UPDATE whiteboards SET status = 'archived' WHERE id = $1", [wb.id]);
  res.json({ message: 'Whiteboard archived.' });
}));

router.get('/live-sessions', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const rows = await all('SELECT section_code, started_at FROM class_sessions WHERE teacher_id = $1 AND ended_at IS NULL', [teacher.id]);
  res.json({ activeSections: rows.map(r => r.section_code) });
}));

// ---------- Study materials library ----------

const MAX_MATERIAL_BASE64 = 5_000_000; // ~3.7MB decoded, safely under the 6MB request body limit

router.post('/materials', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const { subject, grade, title, description, material_type, file_base64, file_name, file_mime, video_url } = req.body || {};
  if (!subject || !grade || !title || !material_type) {
    return res.status(400).json({ error: 'subject, grade, title, and material_type are required.' });
  }
  if (!['document', 'image', 'video'].includes(material_type)) {
    return res.status(400).json({ error: 'material_type must be document, image, or video.' });
  }
  if (material_type === 'video' && !video_url) return res.status(400).json({ error: 'video_url is required for video materials.' });
  if (material_type !== 'video' && !file_base64) return res.status(400).json({ error: 'A file is required for document/image materials.' });
  if (file_base64 && file_base64.length > MAX_MATERIAL_BASE64) return res.status(413).json({ error: 'File is too large (limit ~3.7MB). Please use a smaller file or a hosted link for large videos.' });

  await run(
    `INSERT INTO study_materials (subject, grade, title, description, material_type, file_base64, file_name, file_mime, video_url, teacher_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [subject, grade, title, description || null, material_type, file_base64 || null, file_name || null, file_mime || null, video_url || null, teacher.id]
  );
  res.status(201).json({ message: 'Material added to the library.' });
}));

router.get('/materials', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const rows = await all(
    `SELECT sm.id, sm.subject, sm.grade, sm.title, sm.description, sm.material_type, sm.file_name, sm.video_url, sm.created_at, sm.teacher_id,
            t.first_name, t.last_name
     FROM study_materials sm JOIN teachers t ON t.id = sm.teacher_id
     ORDER BY sm.created_at DESC`
  );
  res.json({ materials: rows.map(r => ({
    id: r.id, subject: r.subject, grade: r.grade, title: r.title, description: r.description,
    materialType: r.material_type, fileName: r.file_name, videoUrl: r.video_url, createdAt: r.created_at,
    uploadedBy: `${r.first_name} ${r.last_name}`, isMine: r.teacher_id === teacher.id
  })) });
}));

router.get('/materials/:id/file', asyncHandler(async (req, res) => {
  const material = await get('SELECT file_base64, file_name, file_mime FROM study_materials WHERE id = $1', [Number(req.params.id)]);
  if (!material || !material.file_base64) return res.status(404).json({ error: 'No file on this material.' });
  res.json({ fileBase64: material.file_base64, fileName: material.file_name, fileMime: material.file_mime });
}));

router.delete('/materials/:id', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

  const material = await get('SELECT * FROM study_materials WHERE id = $1 AND teacher_id = $2', [Number(req.params.id), teacher.id]);
  if (!material) return res.status(404).json({ error: 'Material not found, or it belongs to another teacher.' });

  await run('DELETE FROM study_materials WHERE id = $1', [material.id]);
  res.json({ message: 'Material removed.' });
}));

module.exports = router;
