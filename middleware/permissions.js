const { get, all } = require('../db');

// requirePermission(...keys) — passes if the signed-in user is a Super Admin
// (always full access), or an active staff member whose role grants at
// least one of the given permission keys. Enforced here, server-side —
// never rely on a hidden frontend button alone.
function requirePermission(...keys) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Missing authentication token.' });

      // Super Admin: full institutional control, always.
      if (req.user.role === 'admin') return next();

      if (req.user.role !== 'staff') {
        return res.status(403).json({ error: 'You do not have access to this resource.' });
      }

      const staffRow = await get('SELECT id, status, staff_role_id FROM staff WHERE user_id = $1', [req.user.id]);
      if (!staffRow || staffRow.status !== 'active') {
        return res.status(403).json({ error: 'Your staff account is not active.' });
      }
      if (!staffRow.staff_role_id) {
        return res.status(403).json({ error: 'No role has been assigned to your account yet.' });
      }

      const rows = await all(
        'SELECT permission_key FROM staff_role_permissions WHERE staff_role_id = $1',
        [staffRow.staff_role_id]
      );
      const granted = new Set(rows.map(r => r.permission_key));
      const allowed = keys.length === 0 || keys.some(k => granted.has(k));
      if (!allowed) {
        return res.status(403).json({ error: 'You do not have permission to perform this action.' });
      }

      req.staff = staffRow;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Records an audit trail entry. Never pass credentials/tokens in `details`.
async function logAudit(req, action, targetType, targetId, details) {
  const { run } = require('../db');
  await run(
    'INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5,$6)',
    [req.user ? req.user.id : null, req.user ? req.user.role : null, action, targetType || null, targetId ? String(targetId) : null, details ? JSON.stringify(details) : null]
  );
}

module.exports = { requirePermission, logAudit };
