-- 0001 · Multi-school foundation, EXPAND step (additive only).
-- Adds organisations, institutions, memberships and per-school settings, and
-- an empty institution_id column on every school-owned table. Existing code
-- keeps working: new rows get the transition default described below.
-- Rollback: db/migrations/rollback/0001_tenancy_expand.down.sql

CREATE TABLE IF NOT EXISTS organisations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institutions (
  id SERIAL PRIMARY KEY,
  organisation_id INTEGER REFERENCES organisations(id),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name TEXT NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('requested','verifying','setup','active','suspended','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One person, one login (users), many memberships. A role is granted inside a
-- school, never globally.
CREATE TABLE IF NOT EXISTS institution_memberships (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('student','parent','teacher','admin','staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended','removed')),
  campus_ids INTEGER[],
  locale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (institution_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS institution_memberships_user_idx ON institution_memberships (user_id);

CREATE TABLE IF NOT EXISTS institution_settings (
  institution_id INTEGER PRIMARY KEY REFERENCES institutions(id),
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  default_locale TEXT NOT NULL DEFAULT 'en',
  allowed_locales TEXT[] NOT NULL DEFAULT ARRAY['en'],
  digit_style TEXT NOT NULL DEFAULT 'western' CHECK (digit_style IN ('western','urdu')),
  week_start TEXT NOT NULL DEFAULT 'monday',
  currency TEXT NOT NULL DEFAULT 'PKR',
  enabled_modules TEXT[] NOT NULL DEFAULT ARRAY['core','lab','assessment']
);

-- Platform-wide switches, one row.
CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- While the platform has exactly one school, rows written by code that does
  -- not yet set a school context belong to this institution. It is set to
  -- NULL when a second school is activated; from then on a missing context
  -- produces NULL, which the NOT NULL constraints (migration 0002) reject:
  -- missing context fails closed.
  legacy_default_institution_id INTEGER REFERENCES institutions(id)
);

-- The single existing school becomes institution 1. Its name comes from the
-- existing settings row, never from a guess.
INSERT INTO institutions (id, slug, name, lifecycle)
SELECT 1, 'novaschool', COALESCE(NULLIF(TRIM(s.school_name), ''), 'Nova School'), 'active'
  FROM school_settings s WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;
INSERT INTO institutions (id, slug, name, lifecycle)
VALUES (1, 'novaschool', 'Nova School', 'active')
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('institutions', 'id'), GREATEST((SELECT MAX(id) FROM institutions), 1));

INSERT INTO platform_settings (id, legacy_default_institution_id) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

INSERT INTO institution_settings (institution_id, timezone)
SELECT 1, COALESCE(s.timezone, 'Asia/Karachi') FROM school_settings s WHERE s.id = 1
ON CONFLICT (institution_id) DO NOTHING;

-- The school a statement acts for: the transaction's app.institution_id, or,
-- only during the single-school transition, the legacy default.
CREATE OR REPLACE FUNCTION nova_current_institution() RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.institution_id', true), '')::INTEGER,
    (SELECT legacy_default_institution_id FROM platform_settings WHERE id = 1)
  )
$$;

-- The school context strictly from the transaction, with no fallback. Used by
-- row-level security so a missing context never matches anything.
CREATE OR REPLACE FUNCTION nova_context_institution() RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.institution_id', true), '')::INTEGER
$$;

-- School-owned tables: required to belong to exactly one school.
DO $$
DECLARE t TEXT;
BEGIN
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
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS institution_id INTEGER REFERENCES institutions(id)', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN institution_id SET DEFAULT nova_current_institution()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (institution_id)', t || '_institution_idx', t);
  END LOOP;
END $$;

-- Shared catalogs: NULL means "provided by the platform to every school".
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['curriculums','boards','academic_levels','lab_experiments','lab_experiment_versions'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS institution_id INTEGER REFERENCES institutions(id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (institution_id)', t || '_institution_idx', t);
  END LOOP;
END $$;
