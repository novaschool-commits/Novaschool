-- Undo 0001: remove institution_id columns and the tenancy tables.
-- Requires 0002, 0003 and 0004 to be rolled back first.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'institution_id'
             AND table_name NOT IN ('institution_memberships','institution_settings') LOOP
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS institution_id', r.table_name);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS nova_current_institution();
DROP FUNCTION IF EXISTS nova_context_institution();
DROP TABLE IF EXISTS platform_settings, institution_settings, institution_memberships, institutions, organisations CASCADE;
