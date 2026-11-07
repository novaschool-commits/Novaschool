-- 0007 · Limited role for the running app (not gated).
-- The app should not connect as the table owner. This creates nova_app, a
-- role with data privileges only: it cannot create, change or drop tables,
-- cannot bypass row-level security, and cannot log in by itself. A login
-- role (made with `npm run db:app-login`, password never stored here) joins
-- it. Row-level security itself stays off until 0004/0006 are applied.
-- Safe to run again. Rollback: db/migrations/rollback/0007_app_role.down.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nova_app') THEN
    CREATE ROLE nova_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO nova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nova_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO nova_app;
GRANT EXECUTE ON FUNCTION nova_current_institution(), nova_context_institution() TO nova_app;

-- Platform records the app only reads.
REVOKE INSERT, UPDATE, DELETE ON platform_settings, institutions, organisations FROM nova_app;
DO $$ BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM nova_app;
  END IF;
END $$;

-- Tables and sequences created by later migrations (run as this owner) get
-- the same data privileges automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nova_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO nova_app;

DO $$ BEGIN
  ASSERT (SELECT NOT rolbypassrls AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb FROM pg_roles WHERE rolname = 'nova_app'),
    '0007: nova_app must not have bypass, superuser, createrole or createdb';
END $$;
