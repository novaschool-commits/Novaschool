-- Rollback for 0006: removes the login-row policies and restores write access
-- to platform catalogs for the app role.
DROP POLICY IF EXISTS users_read ON users;
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_insert ON users;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_app') THEN
    GRANT DELETE ON users TO nova_app;
    GRANT INSERT, UPDATE, DELETE ON
      permissions, subjects, topics, locales, translation_keys, translations,
      learning_outcomes, outcome_prerequisites, curriculum_pathways, pathway_mappings,
      grade_levels, lab_engines, lab_catalog_plan, content_sources, content_provenance
    TO nova_app;
  END IF;
END $$;
