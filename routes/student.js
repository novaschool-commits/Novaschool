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

router.get('/assignments', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const rows = await all(
    `SELECT a.id, a.title, a.subject, a.due_date, a.max_marks,
            s.id AS submission_id, s.status AS submission_status, s.marks, s.submitted_at
     FROM assignments a
     LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = $1
     WHERE a.section_code = $2
     ORDER BY a.due_date ASC NULLS LAST`,
    [student.id, student.section_code]
  );

  const today = new Date().toISOString().slice(0, 10);
  res.json({ assignments: rows.map(r => {
    let status = 'pending';
    if (r.submission_status === 'graded') status = 'graded';
    else if (r.submission_status === 'submitted') status = 'submitted';
    else if (r.due_date && r.due_date < today) status = 'overdue';
    return {
      id: r.id, title: r.title, subject: r.subject, dueDate: r.due_date, maxMarks: r.max_marks,
      status, marks: r.marks, submittedAt: r.submitted_at
    };
  }) });
}));

router.get('/assignments/:id', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const assignmentId = Number(req.params.id);
  const assignment = await get('SELECT * FROM assignments WHERE id = $1', [assignmentId]);
  if (!assignment || assignment.section_code !== student.section_code) {
    return res.status(404).json({ error: 'Assignment not found for your section.' });
  }
  const submission = await get(
    'SELECT id, status, marks, feedback, body_text, file_name, submitted_at FROM submissions WHERE assignment_id = $1 AND student_id = $2',
    [assignmentId, student.id]
  );

  res.json({
    assignment: {
      id: assignment.id, title: assignment.title, subject: assignment.subject,
      description: assignment.description, dueDate: assignment.due_date, maxMarks: assignment.max_marks
    },
    submission: submission ? {
      status: submission.status, marks: submission.marks, feedback: submission.feedback,
      bodyText: submission.body_text, fileName: submission.file_name, submittedAt: submission.submitted_at
    } : null
  });
}));

router.get('/assignments/:id/submission-file', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const submission = await get(
    'SELECT file_base64, file_name, file_mime FROM submissions WHERE assignment_id = $1 AND student_id = $2',
    [Number(req.params.id), student.id]
  );
  if (!submission || !submission.file_base64) return res.status(404).json({ error: 'No file on this submission.' });
  res.json({ fileBase64: submission.file_base64, fileName: submission.file_name, fileMime: submission.file_mime });
}));

const MAX_SUBMISSION_BASE64 = 5_000_000; // ~3.7MB decoded, safely under the 6MB request body limit

router.post('/assignments/:id/submit', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const assignmentId = Number(req.params.id);
  const assignment = await get('SELECT * FROM assignments WHERE id = $1', [assignmentId]);
  if (!assignment || assignment.section_code !== student.section_code) {
    return res.status(404).json({ error: 'Assignment not found for your section.' });
  }

  const { body_text, file_base64, file_name, file_mime } = req.body || {};
  if (!body_text && !file_base64) {
    return res.status(400).json({ error: 'Add a written answer or attach a file before submitting.' });
  }
  if (file_base64 && file_base64.length > MAX_SUBMISSION_BASE64) {
    return res.status(413).json({ error: 'File is too large (limit ~3.7MB). Please use a smaller file.' });
  }

  const existing = await get('SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2', [assignmentId, student.id]);
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted this assignment.' });
  }

  await run(
    `INSERT INTO submissions (assignment_id, student_id, submitted_at, status, body_text, file_base64, file_name, file_mime)
     VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7)`,
    [assignmentId, student.id, new Date().toISOString(), body_text || null, file_base64 || null, file_name || null, file_mime || null]
  );

  res.status(201).json({ message: `"${assignment.title}" submitted.` });
}));

router.get('/lessons', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const lessons = await all(
    `SELECT l.id, l.title, l.subject, l.video_url, l.description, l.created_at, l.lecture_date,
            t.first_name AS teacher_first, t.last_name AS teacher_last,
            a.status AS attendance_status,
            lwc.id AS confirmation_id
     FROM lessons l LEFT JOIN teachers t ON t.id = l.teacher_id
     LEFT JOIN attendance a ON a.student_id = $2 AND a.date = l.lecture_date
     LEFT JOIN lesson_watch_confirmations lwc ON lwc.lesson_id = l.id AND lwc.student_id = $2
     WHERE l.section_code = $1 ORDER BY l.created_at DESC`,
    [student.section_code, student.id]
  );

  res.json({ lessons: lessons.map(l => ({
    ...l,
    wasAbsent: l.attendance_status === 'absent',
    alreadyConfirmed: !!l.confirmation_id
  })) });
}));

router.post('/lessons/:id/confirm-watched', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const lessonId = Number(req.params.id);
  const lesson = await get('SELECT * FROM lessons WHERE id = $1 AND section_code = $2', [lessonId, student.section_code]);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found for your section.' });
  if (!lesson.lecture_date) return res.status(400).json({ error: 'This recording is not tied to a specific class date.' });

  const existing = await get('SELECT id FROM lesson_watch_confirmations WHERE student_id = $1 AND lesson_id = $2', [student.id, lessonId]);
  if (existing) return res.json({ message: 'Already confirmed — nothing more to do.' });

  await run('INSERT INTO lesson_watch_confirmations (student_id, lesson_id) VALUES ($1,$2)', [student.id, lessonId]);

  const attendanceRow = await get('SELECT * FROM attendance WHERE student_id = $1 AND date = $2', [student.id, lesson.lecture_date]);
  if (attendanceRow && attendanceRow.status === 'absent') {
    await run("UPDATE attendance SET status = 'present' WHERE id = $1", [attendanceRow.id]);
    return res.json({ message: `Thanks for watching — your attendance for ${lesson.lecture_date} has been updated to present.` });
  }

  res.json({ message: 'Confirmed — thanks for watching.' });
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

// ---------- Self-paced Courses ----------

router.get('/courses', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const { subject, curriculum, level } = req.query;
  const conditions = [];
  const params = [student.id];
  let idx = 2;
  if (subject) { conditions.push(`c.subject = $${idx++}`); params.push(subject); }
  if (curriculum) { conditions.push(`c.curriculum = $${idx++}`); params.push(curriculum); }
  if (level) { conditions.push(`c.level = $${idx++}`); params.push(level); }
  const whereExtra = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  const courses = await all(
    `SELECT c.id, c.subject, c.curriculum, c.level, c.title, c.description,
            (SELECT COUNT(*) FROM course_lessons cl JOIN course_topics ct ON ct.id = cl.topic_id WHERE ct.course_id = c.id) AS lesson_count,
            (SELECT COUNT(*) FROM course_progress cp
               JOIN course_lessons cl2 ON cl2.id = cp.lesson_id
               JOIN course_topics ct2 ON ct2.id = cl2.topic_id
               WHERE ct2.course_id = c.id AND cp.student_id = $1) AS completed_count
     FROM courses c WHERE 1=1 ${whereExtra}
     ORDER BY c.subject, c.curriculum, c.level`,
    params
  );

  res.json({ courses: courses.map(c => ({
    id: c.id, subject: c.subject, curriculum: c.curriculum, level: c.level,
    title: c.title, description: c.description,
    lessonCount: Number(c.lesson_count), completedCount: Number(c.completed_count)
  })) });
}));

router.get('/courses/:id', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const courseId = Number(req.params.id);
  const course = await get('SELECT * FROM courses WHERE id = $1', [courseId]);
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const topics = await all('SELECT id, title FROM course_topics WHERE course_id = $1 ORDER BY position, id', [courseId]);
  const lessons = await all(
    `SELECT cl.id, cl.topic_id, cl.title, cl.content_type, cl.video_url, cl.body_text
     FROM course_lessons cl JOIN course_topics ct ON ct.id = cl.topic_id
     WHERE ct.course_id = $1 ORDER BY cl.position, cl.id`,
    [courseId]
  );
  const completedRows = await all(
    `SELECT cp.lesson_id FROM course_progress cp
     JOIN course_lessons cl ON cl.id = cp.lesson_id JOIN course_topics ct ON ct.id = cl.topic_id
     WHERE ct.course_id = $1 AND cp.student_id = $2`,
    [courseId, student.id]
  );
  const completedIds = new Set(completedRows.map(r => r.lesson_id));

  res.json({
    course: { id: course.id, subject: course.subject, curriculum: course.curriculum, level: course.level, title: course.title, description: course.description },
    topics: topics.map(t => ({
      id: t.id, title: t.title,
      lessons: lessons.filter(l => l.topic_id === t.id).map(l => ({
        id: l.id, title: l.title, contentType: l.content_type, videoUrl: l.video_url, bodyText: l.body_text,
        completed: completedIds.has(l.id)
      }))
    }))
  });
}));

router.post('/courses/lessons/:lessonId/complete', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const lessonId = Number(req.params.lessonId);
  const lesson = await get('SELECT id FROM course_lessons WHERE id = $1', [lessonId]);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });

  await run(
    'INSERT INTO course_progress (student_id, lesson_id) VALUES ($1,$2) ON CONFLICT (student_id, lesson_id) DO NOTHING',
    [student.id, lessonId]
  );
  res.json({ message: 'Marked complete.' });
}));

router.delete('/courses/lessons/:lessonId/complete', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  await run('DELETE FROM course_progress WHERE student_id = $1 AND lesson_id = $2', [student.id, Number(req.params.lessonId)]);
  res.json({ message: 'Unmarked.' });
}));

// Grades 1-8 get an online, school-published report card. Grade 9-12 and
// O/A Level are, by default, arranged manually through the relevant external
// board/examination authority near the student — until Nova School itself
// registers as an examination-autonomous body (see admin settings), at which
// point this switches to school-issued for those grades too.
function isLowerGrade(sectionGrade) {
  const m = (sectionGrade || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) <= 8 : false; // non-numeric labels (O Level, A Level) count as higher
}

router.get('/report-card', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const section = await get('SELECT grade FROM sections WHERE section_code = $1', [student.section_code]);
  const lower = isLowerGrade(section ? section.grade : '');

  const grades = await all('SELECT subject, assessment, score, recorded_at FROM grades WHERE student_id = $1 ORDER BY subject, recorded_at', [student.id]);
  const attendanceRows = await all('SELECT status FROM attendance WHERE student_id = $1', [student.id]);
  const total = attendanceRows.length;
  const present = attendanceRows.filter(r => r.status === 'present').length;
  const attendancePct = total ? Math.round((present / total) * 100) : null;

  const settings = await get('SELECT exam_authority_status, exam_authority_name FROM school_settings WHERE id = 1');
  const schoolIsAuthority = settings && settings.exam_authority_status === 'registered';

  // Only numeric "x/y" scores can feed the charts — letter grades (A-, etc.) are shown in the table but skipped here.
  const numericGrades = grades
    .map(g => {
      const m = /(\d+)\s*\/\s*(\d+)/.exec(g.score);
      return m ? { subject: g.subject, pct: (Number(m[1]) / Number(m[2])) * 100, recordedAt: g.recorded_at } : null;
    })
    .filter(Boolean);

  const bySubject = {};
  numericGrades.forEach(g => {
    if (!bySubject[g.subject]) bySubject[g.subject] = [];
    bySubject[g.subject].push(g.pct);
  });
  const subjectAverages = Object.entries(bySubject).map(([subject, pcts]) => ({
    subject, avgPct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
  }));

  const byMonth = {};
  numericGrades.forEach(g => {
    const month = new Date(g.recordedAt).toISOString().slice(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(g.pct);
  });
  const monthlyHistory = Object.entries(byMonth)
    .map(([month, pcts]) => ({ month, avgPct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  res.json({
    student: { name: `${student.first_name} ${student.last_name}`, admissionNo: student.admission_no, section: student.section_code, grade: section ? section.grade : '' },
    officiallyIssued: lower || schoolIsAuthority,
    examAuthorityStatus: settings ? settings.exam_authority_status : 'not_registered',
    examAuthorityName: settings ? settings.exam_authority_name : null,
    grades,
    attendancePct,
    subjectAverages,
    monthlyHistory
  });
}));

// ---------- Study materials library (student view) ----------

router.get('/materials', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const section = await get('SELECT grade FROM sections WHERE section_code = $1', [student.section_code]);
  const grade = section ? section.grade : null;
  if (!grade) return res.json({ grade: null, materials: [] });

  const subject = req.query.subject;
  const params = [grade];
  let subjectClause = '';
  if (subject) { params.push(subject); subjectClause = 'AND subject = $2'; }

  const rows = await all(
    `SELECT sm.id, sm.subject, sm.title, sm.description, sm.material_type, sm.file_name, sm.video_url, sm.created_at,
            t.first_name, t.last_name
     FROM study_materials sm JOIN teachers t ON t.id = sm.teacher_id
     WHERE sm.grade = $1 ${subjectClause}
     ORDER BY sm.subject, sm.created_at DESC`,
    params
  );

  res.json({ grade, materials: rows.map(r => ({
    id: r.id, subject: r.subject, title: r.title, description: r.description,
    materialType: r.material_type, fileName: r.file_name, videoUrl: r.video_url, createdAt: r.created_at,
    uploadedBy: `${r.first_name} ${r.last_name}`
  })) });
}));

router.get('/materials/:id/file', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const section = await get('SELECT grade FROM sections WHERE section_code = $1', [student.section_code]);
  const material = await get('SELECT file_base64, file_name, file_mime, grade FROM study_materials WHERE id = $1', [Number(req.params.id)]);
  if (!material || !material.file_base64) return res.status(404).json({ error: 'No file on this material.' });
  if (!section || material.grade !== section.grade) return res.status(403).json({ error: 'This material is not available to your grade.' });

  res.json({ fileBase64: material.file_base64, fileName: material.file_name, fileMime: material.file_mime });
}));

// ---------- Virtual classroom whiteboard (student side) ----------

router.get('/whiteboard/current', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const wb = await get(
    `SELECT w.id, w.subject, w.status, t.first_name, t.last_name, t.user_id AS teacher_user_id
     FROM whiteboards w JOIN teachers t ON t.id = w.teacher_id
     JOIN class_sessions cs ON cs.id = w.class_session_id
     WHERE w.section_code = $1 AND cs.ended_at IS NULL
     ORDER BY w.created_at DESC LIMIT 1`,
    [student.section_code]
  );
  res.json({ whiteboard: wb ? { id: wb.id, subject: wb.subject, teacherName: `${wb.first_name} ${wb.last_name}`, teacherUserId: wb.teacher_user_id } : null });
}));

router.get('/whiteboards', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const rows = await all(
    `SELECT w.id, w.subject, w.status, w.created_at, t.first_name, t.last_name
     FROM whiteboards w JOIN teachers t ON t.id = w.teacher_id
     WHERE w.section_code = $1 AND w.status IN ('saved','live') ORDER BY w.created_at DESC LIMIT 50`,
    [student.section_code]
  );
  res.json({ whiteboards: rows.map(r => ({ id: r.id, subject: r.subject, status: r.status, createdAt: r.created_at, teacherName: `${r.first_name} ${r.last_name}` })) });
}));

router.get('/whiteboard/:id', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const wb = await get('SELECT * FROM whiteboards WHERE id = $1 AND section_code = $2', [Number(req.params.id), student.section_code]);
  if (!wb || wb.status === 'archived') return res.status(404).json({ error: 'Whiteboard not found.' });
  const pages = await all('SELECT id, position, snapshot FROM whiteboard_pages WHERE whiteboard_id = $1 ORDER BY position', [wb.id]);
  res.json({ whiteboard: wb, pages });
}));

module.exports = router;
