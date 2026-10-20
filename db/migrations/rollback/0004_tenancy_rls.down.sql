-- Undo 0004: turn row-level security off and remove the app role's grants.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
           AND policyname IN ('tenant_isolation','catalog_read','catalog_write','own_institution','membership_read','membership_write') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_app') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nova_app;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nova_app;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM nova_app;
    REVOKE ALL ON SCHEMA public FROM nova_app;
  END IF;
END $$;
-- The nova_app role itself is left in place (roles are cluster-wide and may
-- have login members); drop it by hand with DROP ROLE nova_app if unused.
