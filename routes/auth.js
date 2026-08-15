const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../db');
const { authenticate, SECRET } = require('../middleware/auth');

const router = express.Router();

async function profileFor(user) {
  if (user.role === 'student') {
    return get('SELECT first_name, last_name, admission_no, section_code FROM students WHERE user_id = $1', [user.id]);
  }
  if (user.role === 'parent') {
    return get('SELECT first_name, last_name FROM parents WHERE user_id = $1', [user.id]);
  }
  if (user.role === 'teacher') {
    return get('SELECT first_name, last_name, subject FROM teachers WHERE user_id = $1', [user.id]);
  }
  if (user.role === 'admin') {
    return get('SELECT first_name, last_name, title FROM admins WHERE user_id = $1', [user.id]);
  }
  if (user.role === 'staff') {
    return get(
      `SELECT s.first_name, s.last_name, s.status, sr.name AS role_name
       FROM staff s LEFT JOIN staff_roles sr ON sr.id = s.staff_role_id WHERE s.user_id = $1`,
      [user.id]
    );
  }
  return null;
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await get('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase().trim()]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    if (user.role === 'staff') {
      const staffRow = await get('SELECT status FROM staff WHERE user_id = $1', [user.id]);
      if (!staffRow || staffRow.status !== 'active') {
        return res.status(403).json({ error: 'Your staff account is not active. Contact an administrator.' });
      }
    }

    const profile = await profileFor(user);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, profile }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await get('SELECT id, email, role FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: { ...user, profile: await profileFor(user) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are both required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const user = await get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    await run('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ---------- Staff activation (management-team invite flow) ----------
// No email-sending is wired up — the admin shares the activation link
// (containing this token) with the invited staff member directly.

router.get('/activate-staff/:token', async (req, res) => {
  try {
    const staffRow = await get(
      `SELECT s.id, s.first_name, s.last_name, s.status, s.activation_expires, u.email, sr.name AS role_name
       FROM staff s JOIN users u ON u.id = s.user_id LEFT JOIN staff_roles sr ON sr.id = s.staff_role_id
       WHERE s.activation_token = $1`,
      [req.params.token]
    );
    if (!staffRow) return res.status(404).json({ error: 'Invalid or already-used activation link.' });
    if (staffRow.status !== 'invited') return res.status(400).json({ error: 'This account has already been activated.' });
    if (new Date(staffRow.activation_expires) < new Date()) return res.status(400).json({ error: 'This activation link has expired. Ask an admin to resend it.' });

    res.json({
      email: staffRow.email, firstName: staffRow.first_name, lastName: staffRow.last_name,
      roleName: staffRow.role_name || 'Unassigned'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/activate-staff', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'token and password are required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const staffRow = await get('SELECT * FROM staff WHERE activation_token = $1', [token]);
    if (!staffRow) return res.status(404).json({ error: 'Invalid or already-used activation link.' });
    if (staffRow.status !== 'invited') return res.status(400).json({ error: 'This account has already been activated.' });
    if (new Date(staffRow.activation_expires) < new Date()) return res.status(400).json({ error: 'This activation link has expired. Ask an admin to resend it.' });

    const passwordHash = bcrypt.hashSync(password, 10);
    await run('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, staffRow.user_id]);
    await run(
      "UPDATE staff SET status = 'active', activated_at = CURRENT_TIMESTAMP, activation_token = NULL, activation_expires = NULL WHERE id = $1",
      [staffRow.id]
    );
    res.json({ message: 'Account activated — you can log in now.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
