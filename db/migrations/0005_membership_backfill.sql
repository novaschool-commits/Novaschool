-- 0005 · Memberships for logins created after 0002 (Phase P3).
-- From Phase P3 every sign-in needs a school membership. Accounts made by the
-- old code after migration 0002 ran have none; while there is exactly one
-- school they all belong to it. Additive only; safe to run again.
-- Rollback: db/migrations/rollback/0005_membership_backfill.down.sql

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM institutions) <> 1 THEN
    RAISE EXCEPTION 'Membership backfill assumes exactly one institution; found %. Stop and review.', (SELECT COUNT(*) FROM institutions);
  END IF;
END $$;

INSERT INTO institution_memberships (institution_id, user_id, role, status)
SELECT (SELECT id FROM institutions), u.id, u.role,
       CASE
         WHEN u.role = 'student' THEN COALESCE((SELECT status FROM students WHERE user_id = u.id), 'active')
         WHEN u.role = 'teacher' THEN COALESCE((SELECT status FROM teachers WHERE user_id = u.id), 'active')
         WHEN u.role = 'parent'  THEN COALESCE((SELECT status FROM parents  WHERE user_id = u.id), 'active')
         WHEN u.role = 'staff'   THEN COALESCE((SELECT status FROM staff    WHERE user_id = u.id), 'invited')
         ELSE 'active'
       END
  FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM institution_memberships m WHERE m.user_id = u.id)
ON CONFLICT (institution_id, user_id, role) DO NOTHING;

-- Every login now has a school.
DO $$
DECLARE n BIGINT;
BEGIN
  SELECT COUNT(*) INTO n FROM users u WHERE NOT EXISTS (SELECT 1 FROM institution_memberships m WHERE m.user_id = u.id);
  IF n > 0 THEN RAISE EXCEPTION '% logins still have no school membership', n; END IF;
END $$;
