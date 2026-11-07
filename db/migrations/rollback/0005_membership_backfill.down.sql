-- Rollback for 0005: intentionally does nothing. The rows it added cannot be
-- told apart from memberships created by the app, and removing them would
-- lock those people out. Memberships are harmless to code before Phase P3.
SELECT 1;
