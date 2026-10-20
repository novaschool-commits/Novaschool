-- Tenant isolation, enforced by PostgreSQL row-level security.
-- Runs after all migrations including the gated 0004, with schools A (1) and
-- B (2) loaded. Every check below runs as the restricted application role
-- nova_app, the same role the app will use in Phase P3.
\set ON_ERROR_STOP on

-- T0: the runtime role cannot bypass the policies.
DO $$ BEGIN
  ASSERT (SELECT NOT rolbypassrls AND NOT rolsuper FROM pg_roles WHERE rolname = 'nova_app'), 'T0: nova_app must not bypass RLS';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'nova_app'), 'T0: nova_app owns no tables';
END $$;

-- T1: every table with an institution_id has RLS enabled, forced, and a policy.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                  (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
              AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = c.relname AND column_name = 'institution_id') LOOP
    ASSERT r.relrowsecurity AND r.relforcerowsecurity AND r.policies > 0,
      format('T1: %s is not protected (rls=%s force=%s policies=%s)', r.relname, r.relrowsecurity, r.relforcerowsecurity, r.policies);
  END LOOP;
END $$;

-- T2: school A sees only its own students, submissions, grades and messages.
BEGIN;
SET LOCAL ROLE nova_app;
SELECT set_config('app.institution_id', '1', true);
DO $$ BEGIN
  ASSERT (SELECT COUNT(*) FROM students) = 2, 'T2: A sees its 2 students';
  ASSERT NOT EXISTS (SELECT 1 FROM students WHERE id = 23), 'T2: A cannot read B student by guessed id';
  ASSERT NOT EXISTS (SELECT 1 FROM submissions WHERE file_base64 = 'QlJBVk9TRUNSRVQ='), 'T2: A cannot read B file content';
  ASSERT NOT EXISTS (SELECT 1 FROM grades WHERE assessment = 'Bravo quiz'), 'T2: A cannot read B grades';
  ASSERT NOT EXISTS (SELECT 1 FROM messages WHERE body LIKE 'Bravo%'), 'T2: A cannot read B messages';
  -- Search and export paths: a name that exists only in B finds nothing.
  ASSERT (SELECT COUNT(*) FROM students WHERE first_name ILIKE '%zebulon%') = 0, 'T2: search does not cross schools';
  ASSERT (SELECT COUNT(*) FROM (SELECT s.first_name, g.score FROM students s JOIN grades g ON g.student_id = s.id) x) = 1, 'T2: export join stays in A';
END $$;
COMMIT;

-- T3: writes into the other school touch nothing.
BEGIN;
SET LOCAL ROLE nova_app;
SELECT set_config('app.institution_id', '1', true);
DO $$
DECLARE n INT;
BEGIN
  UPDATE students SET first_name = 'Hacked' WHERE id = 23; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'T3: update of B row affected rows';
  DELETE FROM grades WHERE assessment = 'Bravo quiz'; GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'T3: delete of B row affected rows';
END $$;
COMMIT;
DO $$ BEGIN
  ASSERT (SELECT first_name FROM students WHERE id = 23) = 'Zebulon', 'T3: B row unchanged';
  ASSERT EXISTS (SELECT 1 FROM grades WHERE assessment = 'Bravo quiz'), 'T3: B grade still there';
END $$;

-- T4: inserting a row for the other school, or moving a row there, is refused.
BEGIN;
SET LOCAL ROLE nova_app;
SELECT set_config('app.institution_id', '1', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO grades (student_id, subject, assessment, score, institution_id) VALUES (21, 'Physics', 'forged', '1/1', 2);
    RAISE EXCEPTION 'T4 failed: cross-school insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE grades SET institution_id = 2 WHERE assessment = 'Alpha quiz';
    RAISE EXCEPTION 'T4 failed: moving a row to another school succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
COMMIT;

-- T5: no school context means no rows, and inserts fail (fail closed).
BEGIN;
SET LOCAL ROLE nova_app;
DO $$ BEGIN
  ASSERT (SELECT COUNT(*) FROM students) = 0, 'T5: no context must see nothing';
  ASSERT (SELECT COUNT(*) FROM messages) = 0, 'T5: no context must see no messages';
  BEGIN
    INSERT INTO announcements (title) VALUES ('no context');
    RAISE EXCEPTION 'T5 failed: insert without context succeeded';
  EXCEPTION WHEN insufficient_privilege OR not_null_violation THEN NULL; END;
END $$;
COMMIT;

-- T6: an unknown or invalid school context matches nothing.
BEGIN;
SET LOCAL ROLE nova_app;
SELECT set_config('app.institution_id', '999', true);
DO $$ BEGIN ASSERT (SELECT COUNT(*) FROM students) = 0, 'T6: unknown school sees nothing'; END $$;
COMMIT;

-- T7: context set with SET LOCAL ends with the transaction (no leak through a
-- pooled connection to the next request).
BEGIN;
SELECT set_config('app.institution_id', '2', true);
COMMIT;
BEGIN;
SET LOCAL ROLE nova_app;
DO $$ BEGIN
  ASSERT COALESCE(current_setting('app.institution_id', true), '') = '', 'T7: context leaked past COMMIT';
  ASSERT (SELECT COUNT(*) FROM students) = 0, 'T7: next transaction must start with no school';
END $$;
COMMIT;
BEGIN;
SELECT set_config('app.institution_id', '2', true);
ROLLBACK;
DO $$ BEGIN ASSERT COALESCE(current_setting('app.institution_id', true), '') = '', 'T7: context leaked past ROLLBACK'; END $$;

-- T8: shared catalog: platform rows visible to both schools; a school's
-- private rows only to that school; schools cannot write platform rows.
BEGIN;
SET LOCAL ROLE nova_app;
SELECT set_config('app.institution_id', '2', true);
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM lab_experiments WHERE slug = 'platform-series'), 'T8: B sees platform experiment';
  ASSERT NOT EXISTS (SELECT 1 FROM lab_experiments WHERE slug = 'alpha-private'), 'T8: B cannot see A private experiment';
  BEGIN
    INSERT INTO lab_experiments (slug, type, title, subject, institution_id) VALUES ('b-platform', 'circuit', 'x', 'Physics', NULL);
    RAISE EXCEPTION 'T8 failed: school wrote a platform row';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE lab_experiments SET title = 'defaced' WHERE slug = 'platform-series';
    IF EXISTS (SELECT 1 FROM lab_experiments WHERE title = 'defaced') THEN RAISE EXCEPTION 'T8 failed: school edited a platform row'; END IF;
  END;
END $$;
COMMIT;
BEGIN;
SET LOCAL ROLE nova_app;
SELECT set_config('app.institution_id', '1', true);
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM lab_experiments WHERE slug = 'alpha-private'), 'T8: A sees its own private experiment'; END $$;
COMMIT;

-- T9: one person in two schools sees only the active school's scope, plus
-- their own memberships list (for the school switcher).
BEGIN;
SET LOCAL ROLE nova_app;
SELECT set_config('app.institution_id', '1', true), set_config('app.user_id', '102', true);
DO $$ BEGIN
  ASSERT (SELECT COUNT(*) FROM institution_memberships WHERE user_id = 102) = 2, 'T9: user sees both own memberships';
  ASSERT NOT EXISTS (SELECT 1 FROM institution_memberships WHERE user_id = 201), 'T9: user cannot list B staff while in A';
  ASSERT NOT EXISTS (SELECT 1 FROM students WHERE id = 23), 'T9: B data hidden while A is active';
  ASSERT (SELECT COUNT(*) FROM institutions) = 1, 'T9: only the active school is visible';
END $$;
COMMIT;
BEGIN;
SET LOCAL ROLE nova_app;
SELECT set_config('app.institution_id', '2', true), set_config('app.user_id', '102', true);
DO $$ BEGIN
  ASSERT (SELECT COUNT(*) FROM students) = 1 AND EXISTS (SELECT 1 FROM students WHERE id = 23), 'T9: switching to B shows only B';
END $$;
COMMIT;

-- T10: a deactivated membership is visible as such; the app must refuse it.
-- (RLS scopes rows by school; refusing a suspended membership is the app's
-- job and is covered by the API tests.)
UPDATE institution_memberships SET status = 'suspended' WHERE institution_id = 2 AND user_id = 102;
DO $$ BEGIN ASSERT (SELECT status FROM institution_memberships WHERE institution_id = 2 AND user_id = 102) = 'suspended', 'T10'; END $$;

-- T11: any other role without a policy (for example the app connecting as a
-- non-bypass owner by mistake) sees nothing: default deny under FORCE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_test_other') THEN
    CREATE ROLE nova_test_other NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT SELECT ON students, grades TO nova_test_other;
BEGIN;
SET LOCAL ROLE nova_test_other;
SELECT set_config('app.institution_id', '1', true);
DO $$ BEGIN ASSERT (SELECT COUNT(*) FROM students) = 0, 'T11: role without policy must see nothing'; END $$;
COMMIT;
REVOKE ALL ON students, grades FROM nova_test_other;

-- T12: with two schools active, code that forgets the context cannot write
-- (the transition default is off).
DO $$ BEGIN
  BEGIN
    INSERT INTO announcements (title) VALUES ('forgot context');
    RAISE EXCEPTION 'T12 failed: insert without school succeeded after transition';
  EXCEPTION WHEN not_null_violation THEN NULL; END;
END $$;

\echo 'test_tenancy: all assertions passed'
