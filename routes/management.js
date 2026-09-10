const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePermission, logAudit, userHasPermission, notifyAdmin } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

// ---------- Self permissions (any authenticated staff/admin) ----------
// Lets the frontend know what to show a given signed-in user without
// duplicating the permission table client-side. Admins implicitly have
// everything; staff get exactly what their assigned role grants.

router.get('/my-permissions', asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    return res.json({ role: 'admin', roleName: 'Super Admin', status: 'active', permissions: null }); // null = unrestricted
  }
  if (req.user.role !== 'staff') {
    return res.status(403).json({ error: 'You do not have access to this resource.' });
  }
  const staffRow = await get('SELECT status, staff_role_id FROM staff WHERE user_id = $1', [req.user.id]);
  if (!staffRow) return res.status(404).json({ error: 'Staff profile not found.' });
  if (staffRow.status !== 'active') {
    return res.json({ role: 'staff', roleName: null, status: staffRow.status, permissions: [] });
  }
  const roleRow = staffRow.staff_role_id ? await get('SELECT name FROM staff_roles WHERE id = $1', [staffRow.staff_role_id]) : null;
  const rows = staffRow.staff_role_id
    ? await all('SELECT permission_key FROM staff_role_permissions WHERE staff_role_id = $1', [staffRow.staff_role_id])
    : [];
  res.json({ role: 'staff', roleName: roleRow ? roleRow.name : 'Unassigned', status: staffRow.status, permissions: rows.map(r => r.permission_key) });
}));

// ---------- Own profile (any authenticated staff member) ----------

router.get('/my-profile', asyncHandler(async (req, res) => {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ error: 'You do not have access to this resource.' });
  }
  const row = await get(
    `SELECT s.first_name, s.last_name, s.status, s.invited_at, s.activated_at, s.employee_id, s.department,
            u.email, u.last_login, sr.name AS role_name
     FROM staff s JOIN users u ON u.id = s.user_id
     LEFT JOIN staff_roles sr ON sr.id = s.staff_role_id
     WHERE s.user_id = $1`,
    [req.user.id]
  );
  if (!row) return res.status(404).json({ error: 'Staff profile not found.' });
  const permRows = await get('SELECT staff_role_id FROM staff WHERE user_id = $1', [req.user.id]);
  const permissions = permRows.staff_role_id
    ? (await all('SELECT permission_key FROM staff_role_permissions WHERE staff_role_id = $1', [permRows.staff_role_id])).map(r => r.permission_key)
    : [];
  res.json({
    firstName: row.first_name, lastName: row.last_name, email: row.email, status: row.status,
    roleName: row.role_name || 'Unassigned', employeeId: row.employee_id, department: row.department,
    invitedAt: row.invited_at, activatedAt: row.activated_at, lastLogin: row.last_login,
    permissions
  });
}));

// ---------- Notifications (staff only — real events trigger these; see
// notifyStaffWithPermission() call sites in routes/common.js) ----------

async function getOwnStaffId(req) {
  const row = await get('SELECT id FROM staff WHERE user_id = $1 AND status = $2', [req.user.id, 'active']);
  return row ? row.id : null;
}

router.get('/my-notifications', asyncHandler(async (req, res) => {
  if (req.user.role !== 'staff') return res.json({ notifications: [], unreadCount: 0 });
  const staffId = await getOwnStaffId(req);
  if (!staffId) return res.json({ notifications: [], unreadCount: 0 });

  const rows = await all(
    'SELECT id, type, message, target_page, read_at, created_at FROM staff_notifications WHERE staff_id = $1 ORDER BY created_at DESC LIMIT 30',
    [staffId]
  );
  const unreadCount = rows.filter(r => !r.read_at).length;
  res.json({
    notifications: rows.map(r => ({ id: r.id, type: r.type, message: r.message, targetPage: r.target_page, read: !!r.read_at, createdAt: r.created_at })),
    unreadCount
  });
}));

router.post('/notifications/:id/read', asyncHandler(async (req, res) => {
  const staffId = await getOwnStaffId(req);
  if (!staffId) return res.status(404).json({ error: 'Staff profile not found.' });
  await run('UPDATE staff_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = $1 AND staff_id = $2 AND read_at IS NULL', [Number(req.params.id), staffId]);
  res.json({ message: 'Marked as read.' });
}));

router.post('/notifications/read-all', asyncHandler(async (req, res) => {
  const staffId = await getOwnStaffId(req);
  if (!staffId) return res.status(404).json({ error: 'Staff profile not found.' });
  await run('UPDATE staff_notifications SET read_at = CURRENT_TIMESTAMP WHERE staff_id = $1 AND read_at IS NULL', [staffId]);
  res.json({ message: 'All notifications marked as read.' });
}));

// ---------- Global search (permission-aware — a staff member never sees a
// hit in a category their role doesn't grant view access to) ----------

router.get('/search', asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const like = `%${q}%`;
  const results = [];
  const can = async (perm) => req.user.role === 'admin' || (await userHasPermission(req, perm));
  const isAdmin = req.user.role === 'admin';
  // Page targets differ by viewer: the admin screen's own tabs are
  // overview/management/organization/analytics/system/security/settings,
  // while the staff dashboard has its own separate set (students/teachers/
  // courses/exams/support/etc). A category only appears in results if the
  // requesting viewer's own dashboard actually has somewhere to send them —
  // otherwise the click would go nowhere, which is worse than omitting it.

  if (await can('students.view')) {
    const rows = await all(
      `SELECT id, first_name, last_name, admission_no, section_code FROM students
       WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR admission_no ILIKE $1 LIMIT 5`,
      [like]
    );
    rows.forEach(r => results.push({ category: 'Students', label: `${r.first_name} ${r.last_name} — ${r.admission_no}`, sub: `Section ${r.section_code}`, page: isAdmin ? 'overview' : 'students' }));
  }
  if (await can('teachers.view')) {
    const rows = await all(
      `SELECT id, first_name, last_name, subject FROM teachers WHERE first_name ILIKE $1 OR last_name ILIKE $1 LIMIT 5`,
      [like]
    );
    rows.forEach(r => results.push({ category: 'Teachers', label: `${r.first_name} ${r.last_name}`, sub: r.subject || '', page: isAdmin ? 'overview' : 'teachers' }));
  }
  if (!isAdmin && await can('courses.view')) {
    const rows = await all(
      `SELECT id, title, subject, curriculum FROM courses WHERE title ILIKE $1 OR subject ILIKE $1 LIMIT 5`,
      [like]
    );
    rows.forEach(r => results.push({ category: 'Courses', label: r.title, sub: `${r.subject} · ${r.curriculum}`, page: 'courses' }));
  }
  if (isAdmin && (await can('students.view'))) {
    const rows = await all(
      `SELECT p.id, p.first_name, p.last_name FROM parents p WHERE p.first_name ILIKE $1 OR p.last_name ILIKE $1 LIMIT 5`,
      [like]
    );
    rows.forEach(r => results.push({ category: 'Parents', label: `${r.first_name} ${r.last_name}`, sub: '', page: 'overview' }));
  }
  if (isAdmin && (await can('staff.view'))) {
    const rows = await all(
      `SELECT id, first_name, last_name FROM staff WHERE first_name ILIKE $1 OR last_name ILIKE $1 LIMIT 5`,
      [like]
    );
    rows.forEach(r => results.push({ category: 'Staff', label: `${r.first_name} ${r.last_name}`, sub: '', page: 'management' }));
  }
  if (isAdmin && (await can('reports.view'))) {
    const rows = await all(
      `SELECT section_code, grade FROM sections WHERE section_code ILIKE $1 LIMIT 5`,
      [like]
    );
    rows.forEach(r => results.push({ category: 'Classes', label: `Section ${r.section_code}`, sub: `Grade ${r.grade}`, page: 'overview' }));
  }
  if (!isAdmin && await can('assignments.view')) {
    const examRows = await all(`SELECT id, title, subject, section_code FROM exams WHERE title ILIKE $1 LIMIT 5`, [like]);
    examRows.forEach(r => results.push({ category: 'Exams', label: r.title, sub: `${r.subject} · Section ${r.section_code}`, page: 'exams' }));
    // Homework assignments have no dedicated management page in either
    // dashboard yet (only exams do) — omitted rather than sent to the
    // wrong tab. Flagging as a real gap, not a decision to leave silent.
  }
  if (!isAdmin && await can('support.manage')) {
    const rows = await all(`SELECT id, subject, status FROM support_tickets WHERE subject ILIKE $1 LIMIT 5`, [like]);
    rows.forEach(r => results.push({ category: 'Support requests', label: r.subject, sub: r.status, page: 'support' }));
  }
  res.json({ results });
}));

// ---------- Tasks ----------
// Everyone with a staff account can see and update their OWN assigned
// tasks (no permission needed, same as Profile/Messages). Assigning tasks
// to someone else requires tasks.assign (or admin).

router.get('/my-tasks', asyncHandler(async (req, res) => {
  const staffId = await getOwnStaffId(req);
  if (!staffId) return res.json({ tasks: [] });
  const rows = await all(
    `SELECT t.*, (SELECT COUNT(*) FROM staff_task_comments WHERE task_id = t.id) AS comment_count
     FROM staff_tasks t WHERE t.assigned_to_staff_id = $1
     ORDER BY (t.status = 'completed'), t.due_date NULLS LAST, t.created_at DESC`,
    [staffId]
  );
  res.json({ tasks: rows.map(formatTask) });
}));

router.get('/tasks/assigned-by-me', requirePermission('tasks.assign'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT t.*, s.first_name AS assignee_first, s.last_name AS assignee_last,
            (SELECT COUNT(*) FROM staff_task_comments WHERE task_id = t.id) AS comment_count
     FROM staff_tasks t JOIN staff s ON s.id = t.assigned_to_staff_id
     WHERE t.assigned_by_user_id = $1 ORDER BY (t.status = 'completed'), t.due_date NULLS LAST, t.created_at DESC`,
    [req.user.id]
  );
  res.json({ tasks: rows.map(r => ({ ...formatTask(r), assigneeName: `${r.assignee_first} ${r.assignee_last}` })) });
}));

function formatTask(r) {
  return {
    id: r.id, title: r.title, description: r.description, priority: r.priority, status: r.status,
    dueDate: r.due_date, relatedLabel: r.related_label, createdAt: r.created_at, completedAt: r.completed_at,
    commentCount: Number(r.comment_count || 0)
  };
}

router.post('/tasks', requirePermission('tasks.assign'), asyncHandler(async (req, res) => {
  const { assigned_to_staff_id, title, description, priority, due_date, related_label } = req.body || {};
  if (!assigned_to_staff_id || !title) return res.status(400).json({ error: 'assigned_to_staff_id and title are required.' });
  const assignee = await get('SELECT id FROM staff WHERE id = $1 AND status = $2', [assigned_to_staff_id, 'active']);
  if (!assignee) return res.status(400).json({ error: 'That staff member does not exist or is not active.' });
  const validPriorities = ['low', 'medium', 'high'];
  if (priority && !validPriorities.includes(priority)) return res.status(400).json({ error: `priority must be one of: ${validPriorities.join(', ')}.` });

  const r = await run(
    `INSERT INTO staff_tasks (assigned_to_staff_id, assigned_by_user_id, title, description, priority, due_date, related_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [assigned_to_staff_id, req.user.id, title, description || null, priority || 'medium', due_date || null, related_label || null]
  );
  await run('INSERT INTO staff_notifications (staff_id, type, message, target_page) VALUES ($1,$2,$3,$4)',
    [assigned_to_staff_id, 'task.assigned', `New task assigned: "${title}".`, 'tasks']);
  await logAudit(req, 'task.assigned', 'staff_task', r.rows[0].id, { assigned_to_staff_id, title });
  res.status(201).json({ message: 'Task assigned.', taskId: r.rows[0].id });
}));

router.get('/tasks/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const task = await get('SELECT * FROM staff_tasks WHERE id = $1', [id]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const staffId = await getOwnStaffId(req);
  const isOwner = staffId && task.assigned_to_staff_id === staffId;
  const isAssigner = task.assigned_by_user_id === req.user.id;
  if (!isOwner && !isAssigner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have access to this task.' });
  }
  const comments = await all(
    `SELECT c.id, c.body, c.created_at, c.author_user_id,
            COALESCE(s.first_name || ' ' || s.last_name, a.first_name || ' ' || a.last_name) AS author_name
     FROM staff_task_comments c
     LEFT JOIN staff s ON s.user_id = c.author_user_id
     LEFT JOIN admins a ON a.user_id = c.author_user_id
     WHERE c.task_id = $1 ORDER BY c.created_at ASC`,
    [id]
  );
  res.json({
    task: formatTask({ ...task, comment_count: comments.length }),
    comments: comments.map(c => ({ id: c.id, body: c.body, createdAt: c.created_at, authorName: c.author_name || 'Unknown', mine: c.author_user_id === req.user.id }))
  });
}));

router.patch('/tasks/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const task = await get('SELECT * FROM staff_tasks WHERE id = $1', [id]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const staffId = await getOwnStaffId(req);
  const isOwner = staffId && task.assigned_to_staff_id === staffId;
  const isAssigner = task.assigned_by_user_id === req.user.id;
  if (!isOwner && !isAssigner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have access to this task.' });
  }

  const { status, title, description, priority, due_date } = req.body || {};
  const validStatuses = ['pending', 'in_progress', 'completed', 'needs_review'];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
  // The assignee can only change status; only the assigner/admin can edit the task's details.
  if ((title || description !== undefined || priority || due_date !== undefined) && !isAssigner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the person who assigned this task can edit its details.' });
  }

  await run(
    `UPDATE staff_tasks SET
       status = COALESCE($1, status), title = COALESCE($2, title), description = COALESCE($3, description),
       priority = COALESCE($4, priority), due_date = COALESCE($5, due_date),
       completed_at = CASE WHEN $1 = 'completed' AND status != 'completed' THEN CURRENT_TIMESTAMP WHEN $1 IS NOT NULL AND $1 != 'completed' THEN NULL ELSE completed_at END
     WHERE id = $6`,
    [status || null, title || null, description || null, priority || null, due_date || null, id]
  );
  res.json({ message: 'Task updated.' });
}));

router.delete('/tasks/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const task = await get('SELECT * FROM staff_tasks WHERE id = $1', [id]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.assigned_by_user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the person who assigned this task can delete it.' });
  }
  await run('DELETE FROM staff_tasks WHERE id = $1', [id]);
  res.json({ message: 'Task removed.' });
}));

router.post('/tasks/:id/comments', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const task = await get('SELECT * FROM staff_tasks WHERE id = $1', [id]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const staffId = await getOwnStaffId(req);
  const isOwner = staffId && task.assigned_to_staff_id === staffId;
  const isAssigner = task.assigned_by_user_id === req.user.id;
  if (!isOwner && !isAssigner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have access to this task.' });
  }
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment cannot be empty.' });
  await run('INSERT INTO staff_task_comments (task_id, author_user_id, body) VALUES ($1,$2,$3)', [id, req.user.id, body.trim()]);
  // Notify the other party (assignee gets notified of assigner comments, and vice versa).
  const notifyTargetStaffId = isAssigner ? task.assigned_to_staff_id : null;
  if (notifyTargetStaffId) {
    await run('INSERT INTO staff_notifications (staff_id, type, message, target_page) VALUES ($1,$2,$3,$4)',
      [notifyTargetStaffId, 'task.comment', `New comment on task: "${task.title}".`, 'tasks']);
  }
  res.status(201).json({ message: 'Comment added.' });
}));

router.get('/assignable-staff', requirePermission('tasks.assign', 'support.manage'), asyncHandler(async (req, res) => {
  const rows = await all(`SELECT id, first_name, last_name FROM staff WHERE status = 'active' ORDER BY first_name`);
  res.json({ staff: rows.map(r => ({ id: r.id, name: `${r.first_name} ${r.last_name}` })) });
}));

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

router.get('/staff', requirePermission('staff.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT s.id, s.first_name, s.last_name, s.status, s.invited_at, s.activated_at, s.employee_id, s.department,
            u.email, u.last_login, sr.id AS role_id, sr.name AS role_name
     FROM staff s JOIN users u ON u.id = s.user_id
     LEFT JOIN staff_roles sr ON sr.id = s.staff_role_id
     ORDER BY s.invited_at DESC`
  );
  res.json({ staff: rows.map(r => ({
    id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email,
    status: r.status, roleId: r.role_id, roleName: r.role_name || 'Unassigned',
    invitedAt: r.invited_at, activatedAt: r.activated_at, lastLogin: r.last_login,
    employeeId: r.employee_id, department: r.department
  })) });
}));

// A non-admin staff member with staff.invite/staff.edit must never be able
// to hand out a role with MORE permissions than their own — otherwise a
// permission-holder could mint themselves (or a colleague) admin-equivalent
// access. Admins are exempt (they can already do anything).
async function assertNoPrivilegeEscalation(req, targetStaffRoleId) {
  if (req.user.role === 'admin' || !targetStaffRoleId) return null;
  const actorPerms = new Set((await all(
    'SELECT permission_key FROM staff_role_permissions WHERE staff_role_id = $1',
    [req.staff.staff_role_id]
  )).map(r => r.permission_key));
  const targetPerms = (await all(
    'SELECT permission_key FROM staff_role_permissions WHERE staff_role_id = $1',
    [targetStaffRoleId]
  )).map(r => r.permission_key);
  const escalates = targetPerms.some(p => !actorPerms.has(p));
  return escalates ? 'You cannot assign a role with more permissions than your own.' : null;
}

router.post('/staff/invite', requirePermission('staff.invite'), asyncHandler(async (req, res) => {
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
    const escalationError = await assertNoPrivilegeEscalation(req, staff_role_id);
    if (escalationError) return res.status(403).json({ error: escalationError });
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
  if (req.user.role === 'staff') {
    await notifyAdmin('staff.invited', `A staff member invited a new staff account: ${normalizedEmail}.`, 'normal', 'management');
  }

  // No email-sending is wired up yet — return the activation token so the
  // admin can share the link manually. Wire this to a real mailer before
  // relying on it for a real hire.
  res.status(201).json({
    message: 'Staff member invited. Share this activation link with them — it expires in 7 days.',
    staffId: staffRow.id,
    activationToken: token
  });
}));

router.post('/staff/:id/resend-invite', requirePermission('staff.invite'), asyncHandler(async (req, res) => {
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

router.patch('/staff/:id', requirePermission('staff.edit', 'staff.suspend'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const staffRow = await get('SELECT * FROM staff WHERE id = $1', [id]);
  if (!staffRow) return res.status(404).json({ error: 'Staff member not found.' });

  if (req.user.role === 'staff' && staffRow.user_id === req.user.id) {
    return res.status(403).json({ error: 'You cannot modify your own staff record.' });
  }

  const { staff_role_id, status, employee_id, department } = req.body || {};
  const validStatuses = ['active', 'suspended', 'removed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
  }
  if (status && !(await userHasPermission(req, 'staff.suspend'))) {
    return res.status(403).json({ error: 'You do not have permission to change staff status.' });
  }
  if ((staff_role_id || employee_id !== undefined || department !== undefined) && !(await userHasPermission(req, 'staff.edit'))) {
    return res.status(403).json({ error: 'You do not have permission to edit staff details.' });
  }
  if (staff_role_id) {
    const role = await get('SELECT id FROM staff_roles WHERE id = $1', [staff_role_id]);
    if (!role) return res.status(400).json({ error: 'That role does not exist.' });
    const escalationError = await assertNoPrivilegeEscalation(req, staff_role_id);
    if (escalationError) return res.status(403).json({ error: escalationError });
  }

  await run(
    'UPDATE staff SET staff_role_id = COALESCE($1, staff_role_id), status = COALESCE($2, status), employee_id = COALESCE($3, employee_id), department = COALESCE($4, department) WHERE id = $5',
    [staff_role_id || null, status || null, employee_id || null, department || null, id]
  );
  await logAudit(req, 'staff.updated', 'staff', id, { staff_role_id, status, employee_id, department });
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
