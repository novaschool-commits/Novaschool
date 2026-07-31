// Seeds the database with a realistic demo school: 1 admin, 3 teachers,
// 4 sections, ~32 students (2 of them logged-in demo accounts), a term's
// worth of timetable, attendance, homework, grades, invoices, messages,
// announcements and pending admissions.
//
// Run automatically on first server start if the DB is empty, or force a
// clean reseed any time with:   npm run seed

const bcrypt = require('bcryptjs');
const { pool } = require('./index');

const DEMO_PASSWORD = 'password123';

function hash(pw) {
  return bcrypt.hashSync(pw, 10);
}

// Returns 'YYYY-MM-DD' for `daysAgo` calendar days before today (negative = future).
function dateDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function seed({ force = false } = {}) {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM students');
  if (Number(rows[0].c) > 0 && !force) {
    console.log('[seed] Database already has data — skipping. Use --force to reseed.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (force) {
      const tables = [
        'submissions', 'assignments', 'attendance', 'timetable', 'grades',
        'invoices', 'messages', 'announcements', 'admission_applications',
        'student_parent_map', 'students', 'parents', 'sections', 'teachers', 'admins', 'users'
      ];
      for (const t of tables) await client.query(`DELETE FROM ${t}`);
    }

    async function insertUser(email, role) {
      const r = await client.query('INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id', [email, hash(DEMO_PASSWORD), role]);
      return r.rows[0].id;
    }
    async function insertAdmin(userId, first, last, title) {
      await client.query('INSERT INTO admins (user_id, first_name, last_name, title) VALUES ($1,$2,$3,$4)', [userId, first, last, title]);
    }
    async function insertTeacher(userId, first, last, subject) {
      const r = await client.query('INSERT INTO teachers (user_id, first_name, last_name, subject) VALUES ($1,$2,$3,$4) RETURNING id', [userId, first, last, subject]);
      return r.rows[0].id;
    }
    async function insertSection(code, grade, name, capacity, classTeacherId) {
      await client.query('INSERT INTO sections (section_code, grade, name, capacity, class_teacher_id) VALUES ($1,$2,$3,$4,$5)', [code, grade, name, capacity, classTeacherId]);
    }
    async function insertParent(userId, first, last) {
      const r = await client.query('INSERT INTO parents (user_id, first_name, last_name) VALUES ($1,$2,$3) RETURNING id', [userId, first, last]);
      return r.rows[0].id;
    }
    async function insertStudent(userId, admNo, first, last, sectionCode) {
      const r = await client.query('INSERT INTO students (user_id, admission_no, first_name, last_name, section_code) VALUES ($1,$2,$3,$4,$5) RETURNING id', [userId, admNo, first, last, sectionCode]);
      return r.rows[0].id;
    }
    async function insertMap(studentId, parentId) {
      await client.query('INSERT INTO student_parent_map (student_id, parent_id) VALUES ($1,$2)', [studentId, parentId]);
    }
    async function insertTimetable(sectionCode, day, time, subject, room, teacherId) {
      await client.query('INSERT INTO timetable (section_code, day_of_week, start_time, subject, room, teacher_id) VALUES ($1,$2,$3,$4,$5,$6)', [sectionCode, day, time, subject, room, teacherId]);
    }
    async function insertAttendance(studentId, date, status) {
      await client.query('INSERT INTO attendance (student_id, date, status) VALUES ($1,$2,$3)', [studentId, date, status]);
    }
    async function insertAssignment(title, subject, sectionCode, teacherId, dueDate, maxMarks) {
      const r = await client.query('INSERT INTO assignments (title, subject, section_code, teacher_id, due_date, max_marks) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [title, subject, sectionCode, teacherId, dueDate, maxMarks]);
      return r.rows[0].id;
    }
    async function insertSubmission(assignmentId, studentId, submittedAt, marks, status) {
      await client.query('INSERT INTO submissions (assignment_id, student_id, submitted_at, marks, status) VALUES ($1,$2,$3,$4,$5)', [assignmentId, studentId, submittedAt, marks, status]);
    }
    async function insertGrade(studentId, subject, assessment, score) {
      await client.query('INSERT INTO grades (student_id, subject, assessment, score) VALUES ($1,$2,$3,$4)', [studentId, subject, assessment, score]);
    }
    async function insertInvoice(studentId, term, amountDue, amountPaid, dueDate, status) {
      await client.query('INSERT INTO invoices (student_id, term, amount_due, amount_paid, due_date, status) VALUES ($1,$2,$3,$4,$5,$6)', [studentId, term, amountDue, amountPaid, dueDate, status]);
    }
    async function insertMessage(senderId, recipientId, body, sentAt) {
      await client.query('INSERT INTO messages (sender_id, recipient_id, body, sent_at) VALUES ($1,$2,$3,$4)', [senderId, recipientId, body, sentAt]);
    }
    async function insertAnnouncement(title, body, audience) {
      await client.query('INSERT INTO announcements (title, body, audience) VALUES ($1,$2,$3)', [title, body, audience]);
    }
    async function insertAdmission(name, grade, email, status) {
      await client.query('INSERT INTO admission_applications (applicant_name, grade_applied, parent_email, status) VALUES ($1,$2,$3,$4)', [name, grade, email, status]);
    }
    async function insertLesson(title, subject, sectionCode, teacherId, videoUrl, description) {
      await client.query('INSERT INTO lessons (title, subject, section_code, teacher_id, video_url, description) VALUES ($1,$2,$3,$4,$5,$6)', [title, subject, sectionCode, teacherId, videoUrl, description]);
    }
    async function insertCourse(subject, curriculum, level, title, description, teacherId) {
      const r = await client.query('INSERT INTO courses (subject, curriculum, level, title, description, owner_teacher_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [subject, curriculum, level, title, description, teacherId]);
      return r.rows[0].id;
    }
    async function insertCourseTopic(courseId, title, position) {
      const r = await client.query('INSERT INTO course_topics (course_id, title, position) VALUES ($1,$2,$3) RETURNING id', [courseId, title, position]);
      return r.rows[0].id;
    }
    async function insertCourseLesson(topicId, title, videoUrl, position) {
      await client.query('INSERT INTO course_lessons (topic_id, title, content_type, video_url, position) VALUES ($1,$2,$3,$4,$5)', [topicId, title, 'video', videoUrl, position]);
    }

    // ---------- Admin ----------
    const adminUserId = await insertUser('admin@novaschool.pk', 'admin');
    await insertAdmin(adminUserId, 'James', 'Osei', 'Principal / Admin');

    // ---------- Teachers ----------
    const elenaUserId = await insertUser('teacher@novaschool.pk', 'teacher');
    const elenaId = await insertTeacher(elenaUserId, 'Elena', 'Whitfield', 'Math');

    const marcusUserId = await insertUser('marcus.ade@novaschool.pk', 'teacher');
    const marcusId = await insertTeacher(marcusUserId, 'Marcus', 'Ade', 'Science');

    const sofiaUserId = await insertUser('sofia.delgado@novaschool.pk', 'teacher');
    const sofiaId = await insertTeacher(sofiaUserId, 'Sofia', 'Delgado', 'English');

    // ---------- Sections ----------
    await insertSection('8B', 'Grade 8', 'B', 32, elenaId);
    await insertSection('9A', 'Grade 9', 'A', 34, marcusId);
    await insertSection('4A', 'Grade 4', 'A', 26, sofiaId);
    await insertSection('12A', 'Grade 12', 'A', 23, elenaId);

    // ---------- Parent (Renata Silva) ----------
    const renataUserId = await insertUser('parent@novaschool.pk', 'parent');
    const renataId = await insertParent(renataUserId, 'Renata', 'Silva');

    // ---------- Demo student #1: Aiden Silva (Grade 8B) ----------
    const aidenUserId = await insertUser('student@novaschool.pk', 'student');
    const aidenId = await insertStudent(aidenUserId, 'A2019-0142', 'Aiden', 'Silva', '8B');
    await insertMap(aidenId, renataId);

    // ---------- Demo student #2: Mira Silva (Grade 4A, no login of her own) ----------
    const miraId = await insertStudent(null, 'A2021-0087', 'Mira', 'Silva', '4A');
    await insertMap(miraId, renataId);

    // ---------- Roster-only students to populate sections/rosters ----------
    const rosterNames = [
      ['Priya', 'Nair'], ['Marcus', 'Cole'], ['Lena', 'Fischer'], ['Omar', 'Haddad'], ['Tia', 'Brooks'],
      ['Noah', 'Reyes'], ['Ines', 'Park'], ['Caleb', 'Odom']
    ];
    const sectionsToFill = ['8B', '9A', '4A', '12A'];
    let admNoCounter = 200;
    const rosterIdsBySection = { '8B': [], '9A': [], '4A': [], '12A': [] };
    for (let sIdx = 0; sIdx < sectionsToFill.length; sIdx++) {
      const code = sectionsToFill[sIdx];
      for (const [fn, ln] of rosterNames) {
        const admNo = `A20${20 + sIdx}-0${admNoCounter++}`;
        const id = await insertStudent(null, admNo, fn, ln, code);
        rosterIdsBySection[code].push(id);
      }
    }

    // ---------- Timetable: full Mon–Fri week for 8B (drives student dashboard) ----------
    const week8B = {
      Monday:    [['09:00','Math','Rm 204',elenaId],['09:50','Science','Rm 118',marcusId],['10:40','Break','',null],['11:00','English','Rm 302',sofiaId],['11:50','History','Rm 210',null],['12:40','Lunch','',null],['13:30','Art','Studio 2',null],['14:20','PE','Field A',null]],
      Tuesday:   [['09:00','English','Rm 302',sofiaId],['09:50','Math','Rm 204',elenaId],['10:40','Break','',null],['11:00','PE','Field A',null],['11:50','Science','Rm 118',marcusId],['12:40','Lunch','',null],['13:30','History','Rm 210',null],['14:20','Art','Studio 2',null]],
      Wednesday: [['09:00','Science','Rm 118',marcusId],['09:50','Math','Rm 204',elenaId],['10:40','Break','',null],['11:00','English','Rm 302',sofiaId],['11:50','Art','Studio 2',null],['12:40','Lunch','',null],['13:30','History','Rm 210',null],['14:20','PE','Field A',null]],
      Thursday:  [['09:00','Math','Rm 204',elenaId],['09:50','History','Rm 210',null],['10:40','Break','',null],['11:00','Science','Rm 118',marcusId],['11:50','English','Rm 302',sofiaId],['12:40','Lunch','',null],['13:30','PE','Field A',null],['14:20','Art','Studio 2',null]],
      Friday:    [['09:00','English','Rm 302',sofiaId],['09:50','Art','Studio 2',null],['10:40','Break','',null],['11:00','Math','Rm 204',elenaId],['11:50','Science','Rm 118',marcusId],['12:40','Lunch','',null],['13:30','History','Rm 210',null],['14:20','PE','Field A',null]],
    };
    for (const [day, periods] of Object.entries(week8B)) {
      for (const [time, subject, room, teacherId] of periods) {
        await insertTimetable('8B', day, time, subject, room, teacherId);
      }
    }
    await insertTimetable('9A', 'Monday', '11:00', 'Math', 'Rm 118', elenaId);
    await insertTimetable('12A', 'Monday', '13:30', 'Math', 'Rm 211', elenaId);

    // ---------- Attendance: last ~30 school (weekday) days for Aiden & Mira ----------
    async function seedAttendance(studentId, presentRate) {
      let daysAdded = 0, back = 0;
      while (daysAdded < 30) {
        back += 1;
        const d = new Date();
        d.setDate(d.getDate() - back);
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;
        const roll = Math.random();
        const status = roll < presentRate ? 'present' : (roll < presentRate + 0.05 ? 'late' : 'absent');
        await insertAttendance(studentId, d.toISOString().slice(0, 10), status);
        daysAdded += 1;
      }
    }
    await seedAttendance(aidenId, 0.94);
    await seedAttendance(miraId, 0.90);

    // ---------- Homework: 3 open assignments for 8B (Aiden has not submitted yet) ----------
    const psId = await insertAssignment('Problem Set 6', 'Math', '8B', elenaId, dateDaysAgo(-0), 100);
    await insertAssignment('Cell Biology Lab Report', 'Science', '8B', marcusId, dateDaysAgo(-1), 100);
    await insertAssignment('Essay: The Great Gatsby, Ch.1-3', 'English', '8B', sofiaId, dateDaysAgo(-2), 100);

    for (const sid of rosterIdsBySection['8B'].slice(0, 6)) {
      await insertSubmission(psId, sid, new Date().toISOString(), null, 'submitted');
    }

    const worksheetId = await insertAssignment('Worksheet 4 — Linear Equations', 'Math', '9A', elenaId, dateDaysAgo(-1), 50);
    for (const sid of rosterIdsBySection['9A'].slice(0, 5)) {
      await insertSubmission(worksheetId, sid, new Date().toISOString(), null, 'submitted');
    }

    // ---------- Past, already-graded work -> feeds the gradebook ----------
    await insertGrade(aidenId, 'Math', 'Quiz 4', '92/100');
    await insertGrade(aidenId, 'Science', 'Lab 3', '88/100');
    await insertGrade(aidenId, 'English', 'Essay 1', 'A-');
    await insertGrade(aidenId, 'History', 'Unit Test 2', '79/100');
    await insertGrade(miraId, 'Math', 'Quiz 2', '85/100');
    await insertGrade(miraId, 'Reading', 'Comprehension Quiz', '90/100');

    // ---------- Fees ----------
    await insertInvoice(aidenId, 'Term 2', 250, 0, '2026-08-15', 'pending');
    await insertInvoice(miraId, 'Term 2', 170, 0, '2026-08-15', 'pending');

    // ---------- Messages ----------
    await insertMessage(elenaUserId, renataUserId, 'Aiden is doing great on quadratics — quick note about Friday\u2019s quiz format.', new Date().toISOString());
    await insertMessage(adminUserId, renataUserId, 'Term 2 fee invoice has been issued.', new Date().toISOString());
    await insertMessage(renataUserId, elenaUserId, 'Question about Friday\u2019s quiz format.', new Date().toISOString());
    await insertMessage(aidenUserId, elenaUserId, 'Can I resubmit Problem Set 5?', new Date().toISOString());

    // ---------- Announcements ----------
    await insertAnnouncement('Term 2 report cards publish Friday', 'Report cards will be available on the Grades tab from Friday, 5 PM.', 'all');
    await insertAnnouncement('Science fair sign-ups open now', 'Sign up with your section teacher by end of week.', 'students');
    await insertAnnouncement('Library extended hours this week', 'The digital library help desk is staffed until 7 PM this week.', 'all');
    await insertAnnouncement('Parent-teacher conferences: Aug 20-21', 'Booking links will be sent to registered parent emails.', 'parents');

    // ---------- Pending admissions (for admin demo) ----------
    await insertAdmission('Sofia Marin', 'Grade 3', 'family.marin@example.com', 'pending');
    await insertAdmission('Devon Ackah', 'Grade 9', 'family.ackah@example.com', 'pending');
    await insertAdmission('Wren Castellanos', 'Grade 1', 'family.castellanos@example.com', 'pending');

    // ---------- Sample recorded lesson (clearly a placeholder — replace via the teacher dashboard) ----------
    await insertLesson(
      'Sample lesson video (edit or delete this)',
      'Science', '8B', marcusId,
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'This is placeholder content so you can see how recorded lessons display. Add your own from the teacher dashboard.'
    );

    // ---------- Sample self-paced course (structure demo only — NOT real curriculum content) ----------
    const sampleCourseId = await insertCourse(
      'Mathematics', 'Pakistani SNC', 'Grade 8',
      'Sample course structure (edit or delete this)',
      'This is a placeholder showing how subject/curriculum/level courses are organized — replace with real content from the teacher dashboard.',
      elenaId
    );
    const sampleTopicId = await insertCourseTopic(sampleCourseId, 'Sample Topic 1', 1);
    await insertCourseLesson(sampleTopicId, 'Sample lesson (edit or delete this)', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 1);

    // ---------- Sample entrance test questions (placeholders — manage from the admin dashboard) ----------
    async function insertEntranceQ(testType, text, options, correct, position) {
      await client.query(
        'INSERT INTO entrance_test_questions (test_type, question_text, options, correct_answer, position) VALUES ($1,$2,$3,$4,$5)',
        [testType, text, JSON.stringify(options), correct, position]
      );
    }
    await insertEntranceQ('student_admission', 'What is 7 + 8?', ['13', '15', '17', '21'], '15', 1);
    await insertEntranceQ('student_admission', 'Which of these is a vowel?', ['B', 'E', 'K', 'T'], 'E', 2);
    await insertEntranceQ('teacher_recruitment', 'What is the boiling point of water at sea level (°C)?', ['90', '100', '110', '120'], '100', 1);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('[seed] Demo data loaded. Login with any of:');
  console.log('  student@novaschool.pk / password123  (Aiden Silva, Grade 8B)');
  console.log('  parent@novaschool.pk  / password123  (Renata Silva)');
  console.log('  teacher@novaschool.pk / password123  (Elena Whitfield, Math)');
  console.log('  admin@novaschool.pk   / password123  (James Osei, Principal/Admin)');
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  const { migrate, pool } = require('./index');
  migrate()
    .then(() => seed({ force }))
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { seed };
