-- requires: ALLOW_RLS_ENFORCEMENT
-- 0004 · Row-level security (GATED). Applied last, after every table exists.
-- Do NOT apply until the application sets app.institution_id in every
-- transaction (Phase P3) and connects as a member of nova_app. The migration
-- runner skips this file unless ALLOW_RLS_ENFORCEMENT=true.
-- Rollback: db/migrations/rollback/0004_tenancy_rls.down.sql
--
-- Design:
--  * Tables are owned by the migration role, which must be a superuser or
--    have BYPASSRLS so that migrations can touch every school's rows.
--  * The application runs as a role that is a member of nova_app: not the
--    owner, NOBYPASSRLS, data privileges only.
--  * FORCE ROW LEVEL SECURITY also applies the policies to the table owner
--    when it lacks BYPASSRLS, so connecting the app as the owner by mistake
--    fails closed (no rows) instead of exposing every school.
--  * Policies compare institution_id with app.institution_id, which the app
--    sets per transaction with set_config(..., true) (SET LOCAL). It ends at
--    COMMIT or ROLLBACK, so a pooled connection never carries one school's
--    context into another request. No context matches nothing.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_app') THEN
    CREATE ROLE nova_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO nova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nova_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO nova_app;
REVOKE INSERT, UPDATE, DELETE ON platform_settings, institutions, organisations FROM nova_app;
GRANT EXECUTE ON FUNCTION nova_current_institution(), nova_context_institution() TO nova_app;

DO $$
DECLARE t TEXT;
BEGIN
  -- School-owned tables: visible and writable only inside their own school.
  FOREACH t IN ARRAY ARRAY[
    'admins','teachers','parents','staff','students','student_parent_map','sections','timetable',
    'lessons','lesson_watch_confirmations','attendance','assignments','submissions','grades','invoices',
    'messages','announcements','admission_applications','study_materials','class_sessions','school_settings',
    'teacher_applications','entrance_test_questions','exams','exam_questions','exam_attempts','exam_answers',
    'courses','course_topics','course_lessons','course_progress','staff_roles','staff_role_permissions',
    'audit_logs','whiteboards','whiteboard_pages','staff_notifications','staff_tasks','staff_task_comments',
    'support_tickets','support_ticket_replies','academic_years','terms','campuses','grade_bands',
    'admin_notifications','lab_attempts','lab_attempt_events','lab_assignments','institution_settings',
    'practice_attempts','mastery_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO nova_app USING (institution_id = nova_context_institution()) WITH CHECK (institution_id = nova_context_institution())', t);
  END LOOP;

  -- Shared catalogs: platform rows (no school) are readable by everyone;
  -- a school reads and writes only its own additions.
  FOREACH t IN ARRAY ARRAY['curriculums','boards','academic_levels','lab_experiments','lab_experiment_versions',
                           'question_bank_items','glossary_terms','curriculum_frameworks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS catalog_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS catalog_write ON %I', t);
    EXECUTE format('CREATE POLICY catalog_read ON %I FOR SELECT TO nova_app USING (institution_id IS NULL OR institution_id = nova_context_institution())', t);
    EXECUTE format('CREATE POLICY catalog_write ON %I FOR ALL TO nova_app USING (institution_id = nova_context_institution()) WITH CHECK (institution_id = nova_context_institution())', t);
  END LOOP;
END $$;

-- Institutions: a request sees only its own school.
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_institution ON institutions;
CREATE POLICY own_institution ON institutions FOR SELECT TO nova_app USING (id = nova_context_institution());

-- Memberships: rows of the active school, plus the signed-in person's own
-- memberships elsewhere (needed for the school switcher, app.user_id).
ALTER TABLE institution_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_read ON institution_memberships;
DROP POLICY IF EXISTS membership_write ON institution_memberships;
CREATE POLICY membership_read ON institution_memberships FOR SELECT TO nova_app
  USING (institution_id = nova_context_institution()
         OR user_id = NULLIF(current_setting('app.user_id', true), '')::INTEGER);
CREATE POLICY membership_write ON institution_memberships FOR ALL TO nova_app
  USING (institution_id = nova_context_institution())
  WITH CHECK (institution_id = nova_context_institution());
