-- A second synthetic school, created after the migrations as a platform
-- operator would (migration role, explicit institution_id).
INSERT INTO institutions (id, slug, name, lifecycle) VALUES (2, 'school-b', 'Bravo Test School', 'active');
SELECT setval('institutions_id_seq', 2);
INSERT INTO institution_settings (institution_id) VALUES (2);
-- With two schools there is no safe default any more: missing context must fail.
UPDATE platform_settings SET legacy_default_institution_id = NULL WHERE id = 1;

INSERT INTO users (id, email, password_hash, role) VALUES
  (201, 'b.teacher@test.invalid', 'x', 'teacher'),
  (202, 'b.student@test.invalid', 'x', 'student');
INSERT INTO teachers (id, user_id, first_name, last_name, subject, institution_id) VALUES (12, 201, 'Bravo', 'Teacher', 'Chemistry', 2);
INSERT INTO sections (section_code, grade, name, class_teacher_id, institution_id) VALUES ('B8', 'Grade 8', 'B', 12, 2);
INSERT INTO students (id, user_id, admission_no, first_name, last_name, section_code, institution_id) VALUES (23, 202, 'B-001', 'Zebulon', 'Bravo', 'B8', 2);
INSERT INTO assignments (id, title, subject, section_code, teacher_id, institution_id) VALUES (42, 'Bravo homework', 'Chemistry', 'B8', 12, 2);
INSERT INTO submissions (assignment_id, student_id, submitted_at, body_text, file_base64, institution_id) VALUES (42, 23, NOW(), 'bravo answer', 'QlJBVk9TRUNSRVQ=', 2);
INSERT INTO grades (student_id, subject, assessment, score, institution_id) VALUES (23, 'Chemistry', 'Bravo quiz', '9/10', 2);
INSERT INTO messages (sender_id, recipient_id, body, institution_id) VALUES (202, 201, 'Bravo private message', 2);

INSERT INTO institution_memberships (institution_id, user_id, role) VALUES (2, 201, 'teacher'), (2, 202, 'student');
-- One person in both schools: teacher at A (user 102), parent at B.
INSERT INTO institution_memberships (institution_id, user_id, role) VALUES (2, 102, 'parent');

-- A private lab experiment of school A, beside the platform one.
INSERT INTO lab_experiments (id, slug, type, title, subject, status, institution_id) VALUES (62, 'alpha-private', 'circuit', 'Alpha private lab', 'Physics', 'draft', 1);
