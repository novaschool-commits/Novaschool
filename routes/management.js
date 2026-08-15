const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePermission, logAudit } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

// ---------- Permission catalog (Super Admin only — this defines what
// roles CAN be granted, so it isn't itself delegable) ----------

router.get('/permissions', requireRole('admin'), asyncHandler(async (req, res) => {
  const rows = await all('SELECT permission_key, category, label FROM permissions ORDER BY category, permission_key');
  const byCategory = {};
  rows.forEach(r => {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push({ key: r.permission_key, label: r.label });
  });
  res.json({ categories: byCategory });
}));

// ---------- Management-team roles ----------

router.get('/roles', requireRole('admin'), asyncHandler(async (req, res) => {
  const roles = await all('SELECT id, role_key, name, is_system FROM staff_roles ORDER BY is_system DESC, name');
  const perms = await all('SELECT staff_role_id, permission_key FROM staff_role_permissions');
  const byRole = {};
  perms.forEach(p => { (byRole[p.staff_role_id] = byRole[p.staff_role_id] || []).push(p.permission_key); });
  res.json({ roles: roles.map(r => ({
    id: r.id, roleKey: r.role_key, name: r.name, isSystem: r.is_system,
    permissions: byRole[r.id] || []
  })) });
}));

router.post('/roles', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, permissions } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const roleKey = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!roleKey) return res.status(400).json({ error: 'That name produces an empty role key — try a different name.' });

  const existing = await get('SELECT id FROM staff_roles WHERE role_key = $1', [roleKey]);
  if (existing) return res.status(409).json({ error: 'A role with a matching name already exists.' });

  const inserted = await get(
    'INSERT INTO staff_roles (role_key, name, is_system) VALUES ($1,$2,FALSE) RETURNING id',
    [roleKey, name]
  );
  const permList = Array.isArray(permissions) ? permissions : [];
  for (const key of permList) {
    await run('INSERT INTO staff_role_permissions (staff_role_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [inserted.id, key]);
  }
  await logAudit(req, 'role.created', 'staff_role', inserted.id, { name, permissions: permList });
  res.status(201).json({ message: 'Role created.', id: inserted.id });
}));

router.patch('/roles/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const role = await get('SELECT * FROM staff_roles WHERE id = $1', [id]);
  if (!role) return res.status(404).json({ error: 'Role not found.' });

  const { name, permissions } = req.body || {};
  if (name && !role.is_system) {
    await run('UPDATE staff_roles SET name = $1 WHERE id = $2', [name, id]);
  }
  if (Array.isArray(permissions)) {
    await run('DELETE FROM staff_role_permissions WHERE staff_role_id = $1', [id]);
    for (const key of permissions) {
      await run('INSERT INTO staff_role_permissions (staff_role_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, key]);
    }
  }
  await logAudit(req, 'role.updated', 'staff_role', id, { name, permissions });
  res.json({ message: 'Role updated.' });
}));

router.delete('/roles/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const role = await get('SELECT * FROM staff_roles WHERE id = $1', [id]);
  if (!role) return res.status(404).json({ error: 'Role not found.' });
  if (role.is_system) return res.status(400).json({ error: 'Built-in roles can\'t be deleted — adjust its permissions instead.' });

  const inUse = await get('SELECT id FROM staff WHERE staff_role_id = $1 LIMIT 1', [id]);
  if (inUse) return res.status(409).json({ error: 'This role is assigned to at least one staff member — reassign them first.' });

  await run('DELETE FROM staff_roles WHERE id = $1', [id]);
  await logAudit(req, 'role.deleted', 'staff_role', id, { name: role.name });
  res.json({ message: 'Role deleted.' });
}));

// ---------- Management-team staff (Super Admin only) ----------

router.get('/staff', requireRole('admin'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT s.id, s.first_name, s.last_name, s.status, s.invited_at, s.activated_at,
            u.email, sr.id AS role_id, sr.name AS role_name
     FROM staff s JOIN users u ON u.id = s.user_id
     LEFT JOIN staff_roles sr ON sr.id = s.staff_role_id
     ORDER BY s.invited_at DESC`
  );
  res.json({ staff: rows.map(r => ({
    id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email,
    status: r.status, roleId: r.role_id, roleName: r.role_name || 'Unassigned',
    invitedAt: r.invited_at, activatedAt: r.activated_at
  })) });
}));

router.post('/staff/invite', requireRole('admin'), asyncHandler(async (req, res) => {
  const { email, first_name, last_name, staff_role_id } = req.body || {};
  if (!email || !first_name || !last_name) {
    return res.status(400).json({ error: 'email, first_name, and last_name are required.' });
  }
  const normalizedEmail = String(email).toLowerCase().trim();
  const existingUser = await get('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existingUser) return res.status(409).json({ error: 'An account with this email already exists.' });

  if (staff_role_id) {
    const role = await get('SELECT id FROM staff_roles WHERE id = $1', [staff_role_id]);
    if (!role) return res.status(400).json({ error: 'That role does not exist.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const unusablePassword = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const user = await get('INSERT INTO users (email, password_hash, role) VALUES ($1,$2,\'staff\') RETURNING id', [normalizedEmail, unusablePassword]);
  const staffRow = await get(
    `INSERT INTO staff (user_id, first_name, last_name, staff_role_id, status, invited_by, activation_token, activation_expires)
     VALUES ($1,$2,$3,$4,'invited',$5,$6,$7) RETURNING id`,
    [user.id, first_name, last_name, staff_role_id || null, req.user.id, token, expires]
  );

  await logAudit(req, 'staff.invited', 'staff', staffRow.id, { email: normalizedEmail });

  // No email-sending is wired up yet — return the activation token so the
  // admin can share the link manually. Wire this to a real mailer before
  // relying on it for a real hire.
  res.status(201).json({
    message: 'Staff member invited. Share this activation link with them — it expires in 7 days.',
    staffId: staffRow.id,
    activationToken: token
  });
}));

router.post('/staff/:id/resend-invite', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const staffRow = await get('SELECT * FROM staff WHERE id = $1', [id]);
  if (!staffRow) return res.status(404).json({ error: 'Staff member not found.' });
  if (staffRow.status !== 'invited') return res.status(400).json({ error: 'This account has already been activated.' });

  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await run('UPDATE staff SET activation_token = $1, activation_expires = $2 WHERE id = $3', [token, expires, id]);
  await logAudit(req, 'staff.invite_resent', 'staff', id, null);
  res.json({ message: 'New activation link generated.', activationToken: token });
}));

router.patch('/staff/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const staffRow = await get('SELECT * FROM staff WHERE id = $1', [id]);
  if (!staffRow) return res.status(404).json({ error: 'Staff member not found.' });

  const { staff_role_id, status } = req.body || {};
  const validStatuses = ['active', 'suspended', 'removed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
  }
  if (staff_role_id) {
    const role = await get('SELECT id FROM staff_roles WHERE id = $1', [staff_role_id]);
    if (!role) return res.status(400).json({ error: 'That role does not exist.' });
  }

  await run(
    'UPDATE staff SET staff_role_id = COALESCE($1, staff_role_id), status = COALESCE($2, status) WHERE id = $3',
    [staff_role_id || null, status || null, id]
  );
  await logAudit(req, 'staff.updated', 'staff', id, { staff_role_id, status });
  res.json({ message: 'Staff record updated.' });
}));

// ---------- Audit logs (Super Admin only) ----------

router.get('/audit-logs', requireRole('admin'), asyncHandler(async (req, res) => {
  const { action, limit } = req.query;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  params.push(Math.min(Number(limit) || 100, 500));

  const rows = await all(
    `SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.created_at, al.actor_role, u.email AS actor_email
     FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
     ${where} ORDER BY al.created_at DESC LIMIT $${idx}`,
    params
  );
  res.json({ logs: rows.map(r => ({
    id: r.id, action: r.action, targetType: r.target_type, targetId: r.target_id,
    details: r.details, createdAt: r.created_at, actorRole: r.actor_role, actorEmail: r.actor_email
  })) });
}));

// ---------- Academic architecture: curriculum/board/level catalog ----------
// Readable by any authenticated staff/admin; editable by admins or staff
// with courses.publish (Academic Manager's default permission set).

router.get('/curriculums', asyncHandler(async (req, res) => {
  const rows = await all('SELECT id, name FROM curriculums ORDER BY name');
  res.json({ curriculums: rows });
}));

router.post('/curriculums', requirePermission('courses.publish'), asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const inserted = await get('INSERT INTO curriculums (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id', [name]);
  if (!inserted) return res.status(409).json({ error: 'That curriculum already exists.' });
  await logAudit(req, 'curriculum.created', 'curriculum', inserted.id, { name });
  res.status(201).json({ message: 'Curriculum added.', id: inserted.id });
}));

router.get('/boards', asyncHandler(async (req, res) => {
  const { curriculum_id } = req.query;
  const rows = curriculum_id
    ? await all('SELECT id, curriculum_id, name FROM boards WHERE curriculum_id = $1 ORDER BY name', [curriculum_id])
    : await all('SELECT id, curriculum_id, name FROM boards ORDER BY name');
  res.json({ boards: rows });
}));

router.post('/boards', requirePermission('courses.publish'), asyncHandler(async (req, res) => {
  const { curriculum_id, name } = req.body || {};
  if (!curriculum_id || !name) return res.status(400).json({ error: 'curriculum_id and name are required.' });
  const curriculum = await get('SELECT id FROM curriculums WHERE id = $1', [curriculum_id]);
  if (!curriculum) return res.status(400).json({ error: 'That curriculum does not exist.' });
  const inserted = await get(
    'INSERT INTO boards (curriculum_id, name) VALUES ($1,$2) ON CONFLICT (curriculum_id, name) DO NOTHING RETURNING id',
    [curriculum_id, name]
  );
  if (!inserted) return res.status(409).json({ error: 'That board already exists under this curriculum.' });
  await logAudit(req, 'board.created', 'board', inserted.id, { curriculum_id, name });
  res.status(201).json({ message: 'Board added.', id: inserted.id });
}));

router.get('/academic-levels', asyncHandler(async (req, res) => {
  const { curriculum_id } = req.query;
  const rows = curriculum_id
    ? await all('SELECT id, curriculum_id, name, position FROM academic_levels WHERE curriculum_id = $1 ORDER BY position, name', [curriculum_id])
    : await all('SELECT id, curriculum_id, name, position FROM academic_levels ORDER BY curriculum_id, position, name');
  res.json({ levels: rows });
}));

router.post('/academic-levels', requirePermission('courses.publish'), asyncHandler(async (req, res) => {
  const { curriculum_id, name, position } = req.body || {};
  if (!curriculum_id || !name) return res.status(400).json({ error: 'curriculum_id and name are required.' });
  const curriculum = await get('SELECT id FROM curriculums WHERE id = $1', [curriculum_id]);
  if (!curriculum) return res.status(400).json({ error: 'That curriculum does not exist.' });
  const inserted = await get(
    'INSERT INTO academic_levels (curriculum_id, name, position) VALUES ($1,$2,$3) ON CONFLICT (curriculum_id, name) DO NOTHING RETURNING id',
    [curriculum_id, name, position || 0]
  );
  if (!inserted) return res.status(409).json({ error: 'That level already exists under this curriculum.' });
  await logAudit(req, 'academic_level.created', 'academic_level', inserted.id, { curriculum_id, name });
  res.status(201).json({ message: 'Level added.', id: inserted.id });
}));

module.exports = router;
