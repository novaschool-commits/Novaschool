-- Synthetic single-school data, written the way today's app writes it
-- (no institution_id). No real people; every name is invented for tests.
INSERT INTO users (id, email, password_hash, role) VALUES
  (101, 'a.admin@test.invalid',    'x', 'admin'),
  (102, 'a.teacher@test.invalid',  'x', 'teacher'),
  (103, 'a.student1@test.invalid', 'x', 'student'),
  (104, 'a.student2@test.invalid', 'x', 'student'),
  (105, 'a.parent@test.invalid',   'x', 'parent'),
  (106, 'a.orphan@test.invalid',   'x', 'student');
SELECT setval('users_id_seq', 200);

INSERT INTO admins (user_id, first_name, last_name) VALUES (101, 'Alpha', 'Admin');
INSERT INTO teachers (id, user_id, first_name, last_name, subject) VALUES (11, 102, 'Alpha', 'Teacher', 'Physics');
INSERT INTO sections (section_code, grade, name, class_teacher_id) VALUES ('A8', 'Grade 8', 'A', 11);
INSERT INTO students (id, user_id, admission_no, first_name, last_name, section_code) VALUES
  (21, 103, 'A-001', 'Amina', 'Alpha', 'A8'),
  (22, 104, 'A-002', 'Asad',  'Alpha', 'A8');
INSERT INTO parents (id, user_id, first_name, last_name) VALUES (31, 105, 'Parent', 'Alpha');
INSERT INTO student_parent_map (student_id, parent_id) VALUES (21, 31);
INSERT INTO timetable (section_code, day_of_week, start_time, subject, teacher_id) VALUES ('A8', 'Monday', '09:00', 'Physics', 11);
INSERT INTO assignments (id, title, subject, section_code, teacher_id) VALUES (41, 'Alpha homework', 'Physics', 'A8', 11);
INSERT INTO submissions (assignment_id, student_id, submitted_at, body_text, file_base64) VALUES (41, 21, NOW(), 'answer', 'QUxQSEFTRUNSRVQ=');
INSERT INTO attendance (student_id, date, status) VALUES (21, '2026-10-01', 'present'), (22, '2026-10-01', 'absent');
INSERT INTO grades (student_id, subject, assessment, score) VALUES (21, 'Physics', 'Alpha quiz', '8/10');
INSERT INTO invoices (student_id, term, amount_due) VALUES (21, 'Term 1', 4500);
INSERT INTO exams (id, title, subject, section_code, teacher_id, is_published) VALUES (51, 'Alpha test', 'Physics', 'A8', 11, TRUE);
INSERT INTO exam_questions (exam_id, question_text, question_type, options, correct_answer, marks) VALUES (51, 'Q1', 'mcq', '["a","b"]', 'a', 1);
INSERT INTO messages (sender_id, recipient_id, body) VALUES (103, 102, 'Alpha private message');
INSERT INTO lab_experiments (id, slug, type, title, subject, status) VALUES (61, 'platform-series', 'circuit', 'Platform series circuit', 'Physics', 'published');
INSERT INTO lab_experiment_versions (experiment_id, version_number, config) VALUES (61, 1, '{}');
