-- Runs after migrations 0001-0003 on the single-school fixture.
\set ON_ERROR_STOP on

DO $$ BEGIN
  ASSERT (SELECT COUNT(*) FROM institutions) = 1, 'B1: exactly one institution after backfill';
  ASSERT (SELECT legacy_default_institution_id FROM platform_settings) = 1, 'B1: transition default is school 1';
END $$;

-- B2: no school-owned row is left without a school.
DO $$
DECLARE r RECORD; n BIGINT;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'institution_id' AND is_nullable = 'NO' LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE institution_id IS NULL', r.table_name) INTO n;
    ASSERT n = 0, format('B2: %s has %s rows without a school', r.table_name, n);
  END LOOP;
END $$;

DO $$ BEGIN
  -- B3: fixture rows all belong to school 1 and nothing was lost.
  ASSERT (SELECT COUNT(*) FROM students) = 2, 'B3: student count unchanged';
  ASSERT (SELECT COUNT(*) FROM students WHERE institution_id = 1) = 2, 'B3: students in school 1';
  ASSERT (SELECT COUNT(*) FROM submissions WHERE institution_id = 1) = 1, 'B3: submissions in school 1';
  -- B4: one membership per existing account, with the right role.
  ASSERT (SELECT COUNT(*) FROM institution_memberships) = (SELECT COUNT(*) FROM users), 'B4: one membership per user';
  ASSERT (SELECT role FROM institution_memberships WHERE user_id = 102) = 'teacher', 'B4: teacher role kept';
  -- B5: the account with no profile row is listed for review, not altered.
  ASSERT EXISTS (SELECT 1 FROM tenancy_review_queue WHERE issue = 'user_without_profile' AND detail = 'a.orphan@test.invalid'), 'B5: orphan listed';
  -- B6: legacy-style inserts (no school given) still land in school 1 during the transition.
  INSERT INTO announcements (title) VALUES ('legacy insert');
  ASSERT (SELECT institution_id FROM announcements WHERE title = 'legacy insert') = 1, 'B6: transition default';
  DELETE FROM announcements WHERE title = 'legacy insert';
  -- B7: platform catalog rows stay shared (no school).
  ASSERT (SELECT institution_id FROM lab_experiments WHERE id = 61) IS NULL, 'B7: platform lab row is shared';
END $$;

\echo 'test_backfill: all assertions passed'
