-- 0002 · Multi-school foundation, BACKFILL and CONSTRAIN.
-- Every existing row belongs to the one school that exists (institution 1);
-- that is a fact about today's database, not a guess. The migration then
-- proves parent and child rows agree, and stops (rolling back) if not.
-- Rollback: db/migrations/rollback/0002_tenancy_backfill.down.sql

DO $$
DECLARE t TEXT; n BIGINT;
BEGIN
  IF (SELECT COUNT(*) FROM institutions) <> 1 THEN
    RAISE EXCEPTION 'Backfill assumes exactly one institution; found %. Stop and review.', (SELECT COUNT(*) FROM institutions);
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'admins','teachers','parents','staff','students','student_parent_map','sections','timetable',
    'lessons','lesson_watch_confirmations','attendance','assignments','submissions','grades','invoices',
    'messages','announcements','admission_applications','study_materials','class_sessions','school_settings',
    'teacher_applications','entrance_test_questions','exams','exam_questions','exam_attempts','exam_answers',
    'courses','course_topics','course_lessons','course_progress','staff_roles','staff_role_permissions',
    'audit_logs','whiteboards','whiteboard_pages','staff_notifications','staff_tasks','staff_task_comments',
    'support_tickets','support_ticket_replies','academic_years','terms','campuses','grade_bands',
    'admin_notifications','lab_attempts','lab_attempt_events','lab_assignments'
  ] LOOP
    EXECUTE format('UPDATE %I SET institution_id = 1 WHERE institution_id IS NULL', t);
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE institution_id IS NULL', t) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'Backfill left % rows without a school in %', n, t; END IF;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN institution_id SET NOT NULL', t);
  END LOOP;
END $$;

-- Memberships for every existing account, from the role and profile it has.
INSERT INTO institution_memberships (institution_id, user_id, role, status)
SELECT 1, u.id, u.role,
       CASE
         WHEN u.role = 'student' THEN COALESCE((SELECT status FROM students WHERE user_id = u.id), 'active')
         WHEN u.role = 'teacher' THEN COALESCE((SELECT status FROM teachers WHERE user_id = u.id), 'active')
         WHEN u.role = 'parent'  THEN COALESCE((SELECT status FROM parents  WHERE user_id = u.id), 'active')
         WHEN u.role = 'staff'   THEN COALESCE((SELECT status FROM staff    WHERE user_id = u.id), 'invited')
         ELSE 'active'
       END
  FROM users u
ON CONFLICT (institution_id, user_id, role) DO NOTHING;

-- Parent and child rows must belong to the same school. With one school this
-- always holds; the check stays as a guard for later migrations.
DO $$
DECLARE bad BIGINT;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM submissions c JOIN assignments p ON p.id = c.assignment_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM exam_questions c JOIN exams p ON p.id = c.exam_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM exam_attempts c JOIN exams p ON p.id = c.exam_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM exam_answers c JOIN exam_attempts p ON p.id = c.attempt_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM course_topics c JOIN courses p ON p.id = c.course_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM course_lessons c JOIN course_topics p ON p.id = c.topic_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM whiteboard_pages c JOIN whiteboards p ON p.id = c.whiteboard_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM lab_attempt_events c JOIN lab_attempts p ON p.id = c.attempt_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM staff_task_comments c JOIN staff_tasks p ON p.id = c.task_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM support_ticket_replies c JOIN support_tickets p ON p.id = c.ticket_id WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM students c JOIN sections p ON p.section_code = c.section_code WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM timetable c JOIN sections p ON p.section_code = c.section_code WHERE c.institution_id <> p.institution_id) +
    (SELECT COUNT(*) FROM student_parent_map m JOIN students s ON s.id = m.student_id WHERE m.institution_id <> s.institution_id) +
    (SELECT COUNT(*) FROM student_parent_map m JOIN parents p ON p.id = m.parent_id WHERE m.institution_id <> p.institution_id)
  INTO bad;
  IF bad > 0 THEN RAISE EXCEPTION 'Found % child rows whose school differs from their parent row. Stop and review.', bad; END IF;
END $$;

-- Duplicate parent links would make the unique index below fail. Stop with a
-- clear message instead of deleting anything.
DO $$
DECLARE d BIGINT;
BEGIN
  SELECT COUNT(*) INTO d FROM (
    SELECT student_id, parent_id FROM student_parent_map GROUP BY student_id, parent_id HAVING COUNT(*) > 1
  ) x;
  IF d > 0 THEN RAISE EXCEPTION '% duplicate parent-child links found. Review student_parent_map before migrating.', d; END IF;
END $$;

-- Per-school unique keys, added beside the current global ones. The global
-- keys stay until the contract step, because existing foreign keys and code
-- still rely on them while only one school exists.
CREATE UNIQUE INDEX IF NOT EXISTS sections_institution_code_uq ON sections (institution_id, section_code);
CREATE UNIQUE INDEX IF NOT EXISTS students_institution_admission_uq ON students (institution_id, admission_no) WHERE admission_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_roles_institution_key_uq ON staff_roles (institution_id, role_key);
CREATE UNIQUE INDEX IF NOT EXISTS student_parent_map_uq ON student_parent_map (institution_id, student_id, parent_id);

-- Rows a person must look at before the contract step; never fixed automatically.
CREATE OR REPLACE VIEW tenancy_review_queue AS
  SELECT 'user_without_profile' AS issue, u.id::TEXT AS ref, u.email AS detail
    FROM users u
   WHERE NOT EXISTS (SELECT 1 FROM students WHERE user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM teachers WHERE user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM parents WHERE user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM admins WHERE user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM staff WHERE user_id = u.id)
  UNION ALL
  SELECT 'parent_link_incomplete', m.id::TEXT, 'student_parent_map row with a missing side'
    FROM student_parent_map m WHERE m.student_id IS NULL OR m.parent_id IS NULL
  UNION ALL
  SELECT 'timetable_without_teacher', t.id::TEXT, t.section_code || ' ' || t.day_of_week || ' ' || t.start_time
    FROM timetable t WHERE t.teacher_id IS NULL
  UNION ALL
  SELECT 'student_without_section', s.id::TEXT, COALESCE(s.admission_no, '(no admission number)')
    FROM students s WHERE s.section_code IS NULL;
