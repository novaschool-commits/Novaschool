-- Undo 0002: relax NOT NULL, drop per-school keys, memberships and the review view.
DROP VIEW IF EXISTS tenancy_review_queue;
DROP INDEX IF EXISTS sections_institution_code_uq, students_institution_admission_uq, staff_roles_institution_key_uq, student_parent_map_uq;
DELETE FROM institution_memberships;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'institution_id' AND is_nullable = 'NO'
             AND table_name NOT IN ('institution_memberships','institution_settings','practice_attempts','mastery_records') LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN institution_id DROP NOT NULL', r.table_name);
  END LOOP;
END $$;
