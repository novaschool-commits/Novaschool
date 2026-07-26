const express = require('express');
const { get, all, run } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate, requireRole('parent'));

async function getParent(req) {
  return get('SELECT * FROM parents WHERE user_id = $1', [req.user.id]);
}

async function childBelongsToParent(studentId, parentId) {
  return get('SELECT 1 FROM student_parent_map WHERE student_id = $1 AND parent_id = $2', [studentId, parentId]);
}

async function displayName(userId) {
  const tables = [
    ['students', 'Student'], ['parents', 'Parent'], ['teachers', 'Teacher'], ['admins', 'Admin']
  ];
  for (const [table, label] of tables) {
    const row = await get(`SELECT first_name, last_name FROM ${table} WHERE user_id = $1`, [userId]);
    if (row) return { name: `${row.first_name} ${row.last_name}`, role: label };
  }
  return { name: 'Unknown', role: '' };
}

router.get('/children', asyncHandler(async (req, res) => {
  const parent = await getParent(req);
  if (!parent) return res.status(404).json({ error: 'Parent profile not found.' });

  const children = await all(
    `SELECT st.id, st.first_name, st.last_name, se.grade, se.name AS section_name, st.section_code
     FROM student_parent_map m
     JOIN students st ON st.id = m.student_id
     LEFT JOIN sections se ON se.section_code = st.section_code
     WHERE m.parent_id = $1`,
    [parent.id]
  );

  res.json({ parent: { name: `${parent.first_name} ${parent.last_name}` }, children });
}));

router.get('/dashboard/:studentId', asyncHandler(async (req, res) => {
  const parent = await getParent(req);
  if (!parent) return res.status(404).json({ error: 'Parent profile not found.' });

  const studentId = Number(req.params.studentId);
  if (!await childBelongsToParent(studentId, parent.id)) {
    return res.status(403).json({ error: 'This student is not linked to your account.' });
  }

  const attendanceTrendRaw = await all(
    `SELECT to_char(date, 'IYYY-"W"IW') AS week,
            ROUND(100.0 * SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) / COUNT(*)) AS pct
     FROM attendance WHERE student_id = $1 GROUP BY week ORDER BY week ASC`,
    [studentId]
  );
  const attendanceTrend = attendanceTrendRaw.slice(-6).map(r => ({ week: r.week, pct: Number(r.pct) }));

  const grades = await all(
    'SELECT subject, assessment, score FROM grades WHERE student_id = $1 ORDER BY recorded_at DESC LIMIT 8',
    [studentId]
  );

  const invoice = await get(
    'SELECT id, term, amount_due, amount_paid, due_date, status FROM invoices WHERE student_id = $1 ORDER BY id DESC LIMIT 1',
    [studentId]
  );

  res.json({ attendanceTrend, grades, invoice });
}));

router.get('/fees-summary', asyncHandler(async (req, res) => {
  const parent = await getParent(req);
  if (!parent) return res.status(404).json({ error: 'Parent profile not found.' });

  const rows = await all(
    `SELECT i.id, i.amount_due, i.amount_paid, i.due_date, i.status, st.first_name
     FROM invoices i
     JOIN students st ON st.id = i.student_id
     JOIN student_parent_map m ON m.student_id = st.id
     WHERE m.parent_id = $1`,
    [parent.id]
  );

  const totalDue = rows.reduce((sum, r) => sum + (Number(r.amount_due) - Number(r.amount_paid)), 0);
  const nearestDueDate = rows.filter(r => r.status !== 'paid').map(r => r.due_date).sort()[0] || null;

  res.json({ totalDue, nearestDueDate, invoices: rows });
}));

router.post('/invoices/:id/pay', asyncHandler(async (req, res) => {
  const parent = await getParent(req);
  if (!parent) return res.status(404).json({ error: 'Parent profile not found.' });

  const invoiceId = Number(req.params.id);
  const invoice = await get(
    `SELECT i.* FROM invoices i
     JOIN student_parent_map m ON m.student_id = i.student_id
     WHERE i.id = $1 AND m.parent_id = $2`,
    [invoiceId, parent.id]
  );

  if (!invoice) return res.status(404).json({ error: 'Invoice not found for your account.' });
  if (invoice.status === 'paid') return res.status(409).json({ error: 'This invoice is already paid.' });

  await run("UPDATE invoices SET amount_paid = amount_due, status = 'paid' WHERE id = $1", [invoiceId]);
  res.json({ message: 'Payment recorded. This demo does not move real money — wire in a payment gateway (Stripe/Razorpay) here.' });
}));

router.get('/messages', asyncHandler(async (req, res) => {
  const rows = await all(
    'SELECT sender_id, recipient_id, body, sent_at FROM messages WHERE sender_id = $1 OR recipient_id = $1 ORDER BY sent_at DESC LIMIT 20',
    [req.user.id]
  );

  const messages = [];
  for (const r of rows) {
    const counterpartId = r.sender_id === req.user.id ? r.recipient_id : r.sender_id;
    const who = await displayName(counterpartId);
    messages.push({ from: who.name, fromRole: who.role, body: r.body, sentAt: r.sent_at, outgoing: r.sender_id === req.user.id });
  }

  res.json({ messages });
}));

router.get('/announcements', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT title, body, created_at FROM announcements
     WHERE audience IN ('all', 'parents') ORDER BY created_at DESC LIMIT 6`
  );
  res.json({ announcements: rows });
}));

module.exports = router;
