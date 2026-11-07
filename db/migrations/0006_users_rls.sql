-- requires: ALLOW_RLS_ENFORCEMENT
-- 0006 · Row-level security for shared logins and platform catalogs (GATED,
-- Phase P3). Apply together with 0004, only when the app connects as a
-- member of nova_app and every request sets its school (Phase P3 code).
-- Rollback: db/migrations/rollback/0006_users_rls.down.sql
--
-- users is shared by all schools (one person, one login). The app may see a
-- login row only when it is:
--   * the signed-in person's own (app.user_id), or
--   * the one login being signed in to or created in this transaction
--     (app.account_email), or
--   * a member of the school the request acts for.
-- New logins may be inserted (the caller then adds the membership in the
-- same transaction). Logins are never deleted by the app.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_read ON users;
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_read ON users FOR SELECT TO nova_app USING (
  id = NULLIF(current_setting('app.user_id', true), '')::INTEGER
  OR (NULLIF(current_setting('app.account_email', true), '') IS NOT NULL
      AND email = current_setting('app.account_email', true))
  OR EXISTS (SELECT 1 FROM institution_memberships m
              WHERE m.user_id = users.id AND m.institution_id = nova_context_institution())
);
CREATE POLICY users_update ON users FOR UPDATE TO nova_app USING (
  id = NULLIF(current_setting('app.user_id', true), '')::INTEGER
  OR EXISTS (SELECT 1 FROM institution_memberships m
              WHERE m.user_id = users.id AND m.institution_id = nova_context_institution())
) WITH CHECK (true);
CREATE POLICY users_insert ON users FOR INSERT TO nova_app WITH CHECK (
  NULLIF(current_setting('app.account_email', true), '') IS NOT NULL
  AND email = current_setting('app.account_email', true)
);
REVOKE DELETE ON users FROM nova_app;

-- Platform catalogs without a school column are read-only for the app; only
-- migrations and the startup catalog seeding (as the owner) change them.
REVOKE INSERT, UPDATE, DELETE ON
  permissions, subjects, topics, locales, translation_keys, translations,
  learning_outcomes, outcome_prerequisites, curriculum_pathways, pathway_mappings,
  grade_levels, lab_engines, lab_catalog_plan, content_sources, content_provenance
FROM nova_app;
