-- A second, synthetic school for the tenant-isolation API tests (Phase P3).
-- Run ONLY against a throwaway local database, as its owner, after the demo
-- data and migrations 0001-0006. Every row is fake. Password for all
-- school-B logins: schoolbpass1
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  b INTEGER := 2;
  pw TEXT := crypt('schoolbpass1', gen_salt('bf', 10));
  u_admin INTEGER; u_teacher INTEGER; u_student INTEGER; u_parent INTEGER;
  t_id INTEGER; s_id INTEGER; p_id INTEGER; a_id INTEGER; wb_id INTEGER; cs_id INTEGER;
BEGIN
  INSERT INTO institutions (id, slug, name, lifecycle) VALUES (b, 'second-school', 'Second School (test)', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO users (email, password_hash, role) VALUES ('admin@school-b.test', pw, 'admin') RETURNING id INTO u_admin;
  INSERT INTO users (email, password_hash, role) VALUES ('teacher@school-b.test', pw, 'teacher') RETURNING id INTO u_teacher;
  INSERT INTO users (email, password_hash, role) VALUES ('student@school-b.test', pw, 'student') RETURNING id INTO u_student;
  INSERT INTO users (email, password_hash, role) VALUES ('parent@school-b.test', pw, 'parent') RETURNING id INTO u_parent;
  INSERT INTO institution_memberships (institution_id, user_id, role) VALUES
    (b, u_admin, 'admin'), (b, u_teacher, 'teacher'), (b, u_student, 'student'), (b, u_parent, 'parent');

  INSERT INTO admins (user_id, first_name, last_name, title, institution_id) VALUES (u_admin, 'Bina', 'Admin', 'Principal', b);
  INSERT INTO teachers (user_id, first_name, last_name, subject, institution_id) VALUES (u_teacher, 'Bilal', 'Teacher', 'Physics', b) RETURNING id INTO t_id;
  INSERT INTO sections (section_code, grade, name, capacity, class_teacher_id, institution_id) VALUES ('ZB1', 'Grade 7', 'B1', 30, t_id, b);
  INSERT INTO students (user_id, admission_no, first_name, last_name, section_code, institution_id)
    VALUES (u_student, 'SCHOOLB-001', 'Bushra', 'SecretStudent', 'ZB1', b) RETURNING id INTO s_id;
  INSERT INTO parents (user_id, first_name, last_name, institution_id) VALUES (u_parent, 'Babar', 'SecretParent', b) RETURNING id INTO p_id;
  INSERT INTO student_parent_map (student_id, parent_id, institution_id) VALUES (s_id, p_id, b);
  INSERT INTO timetable (section_code, day_of_week, start_time, subject, room, teacher_id, institution_id)
    VALUES ('ZB1', 'Monday', '09:00', 'Physics', 'B-Lab', t_id, b);

  INSERT INTO announcements (title, body, audience, institution_id) VALUES ('School B secret announcement', 'only for school B', 'all', b);
  INSERT INTO admission_applications (applicant_name, grade_applied, parent_email, status, institution_id)
    VALUES ('B Applicant Secret', 'Grade 7', 'family@school-b.test', 'pending', b);
  INSERT INTO assignments (title, subject, section_code, teacher_id, due_date, max_marks, description, institution_id)
    VALUES ('School B secret homework', 'Physics', 'ZB1', t_id, CURRENT_DATE + 7, 20, 'B only', b) RETURNING id INTO a_id;
  INSERT INTO submissions (assignment_id, student_id, submitted_at, status, body_text, institution_id)
    VALUES (a_id, s_id, CURRENT_TIMESTAMP, 'submitted', 'School B secret answer', b);
  INSERT INTO grades (student_id, subject, assessment, score, institution_id) VALUES (s_id, 'Physics', 'School B secret quiz', '19/20', b);
  INSERT INTO invoices (student_id, term, amount_due, due_date, status, institution_id) VALUES (s_id, 'Term B', 5000, CURRENT_DATE + 30, 'pending', b);
  INSERT INTO messages (sender_id, recipient_id, body, institution_id) VALUES (u_parent, u_teacher, 'School B private message', b);
  INSERT INTO exams (title, subject, section_code, teacher_id, duration_minutes, is_published, institution_id)
    VALUES ('School B secret test', 'Physics', 'ZB1', t_id, 20, TRUE, b);
  INSERT INTO class_sessions (teacher_id, section_code, is_locked, institution_id) VALUES (t_id, 'ZB1', TRUE, b) RETURNING id INTO cs_id;
  INSERT INTO whiteboards (class_session_id, teacher_id, section_code, subject, status, institution_id)
    VALUES (cs_id, t_id, 'ZB1', 'Physics', 'live', b) RETURNING id INTO wb_id;
  INSERT INTO whiteboard_pages (whiteboard_id, position, institution_id) VALUES (wb_id, 0, b);
END $$;

-- From now on a missing school context must fail closed (decision D5).
UPDATE platform_settings SET legacy_default_institution_id = NULL WHERE id = 1;
