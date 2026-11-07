-- Rollback for 0007: removes the app role's privileges in this database.
-- Roles belong to the whole server (and to every Neon branch), so the role
-- itself is kept. Switch the app back to the owner connection first; the
-- login can then be removed with DROP ROLE nova_app_login.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM nova_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM nova_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nova_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nova_app;
REVOKE EXECUTE ON FUNCTION nova_current_institution(), nova_context_institution() FROM nova_app;
REVOKE USAGE ON SCHEMA public FROM nova_app;
