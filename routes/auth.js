const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run } = require('../db');
const { authenticate, signSession, revokeSessions } = require('../middleware/auth');
const { notifyAdmin } = require('../middleware/permissions');
const { createLimiter, clientIp, limitByIp } = require('../lib/rateLimit');

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

// Brute-force protection (finding S2): at most 8 tries per email per IP and
// 300 per IP in 15 minutes (a whole school can share one public address).
// Both limits answer 429 with Retry-After.
const loginPerIpEmail = createLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
const loginPerIp = createLimiter({ windowMs: 15 * 60 * 1000, max: 300 });
// A real hash of a random value, so an unknown email costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync(require('crypto').randomBytes(16).toString('hex'), 10);

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (email.length > 254 || password.length > 200) {
      return res.status(400).json({ error: 'Incorrect email or password.' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const ip = clientIp(req);
    const ipCheck = loginPerIp.hit(ip);
    const pairCheck = loginPerIpEmail.hit(`${ip}|${normalizedEmail}`);
    if (!ipCheck.allowed || !pairCheck.allowed) {
      const wait = Math.max(ipCheck.retryAfterSec, pairCheck.retryAfterSec);
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minutes.` });
    }

    const user = await get('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !passwordOk) {
      await run('INSERT INTO failed_login_attempts (email) VALUES ($1)', [normalizedEmail]);
      // Keep the table bounded (finding S3).
      if (Math.random() < 0.05) await run("DELETE FROM failed_login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days'");
      const recentFails = await get(
        "SELECT COUNT(*) AS c FROM failed_login_attempts WHERE email = $1 AND attempted_at >= NOW() - INTERVAL '24 hours'",
        [normalizedEmail]
      );
      if (Number(recentFails.c) === 3) {
        await notifyAdmin('security.suspicious_login', `3+ failed login attempts for ${normalizedEmail} in the last 24 hours.`, 'critical', 'security');
      }
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    if (user.role === 'staff') {
      const staffRow = await get('SELECT status FROM staff WHERE user_id = $1', [user.id]);
      if (!staffRow || staffRow.status !== 'active') {
        return res.status(403).json({ error: 'Your staff account is not active. Contact an administrator.' });
      }
    }
    if (['student', 'teacher', 'parent'].includes(user.role)) {
      const table = user.role === 'student' ? 'students' : user.role === 'teacher' ? 'teachers' : 'parents';
      const profileRow = await get(`SELECT status FROM ${table} WHERE user_id = $1`, [user.id]);
      if (profileRow && profileRow.status === 'suspended') {
        return res.status(403).json({ error: 'This account has been suspended. Contact the school administration.' });
      }
    }

    loginPerIpEmail.reset(`${ip}|${normalizedEmail}`);
    const profile = await profileFor(user);
    const token = signSession(user);
    await run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

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

const passwordChangeLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are both required.' });
    }
    if (newPassword.length < 8 || newPassword.length > 200) {
      return res.status(400).json({ error: 'New password must be between 8 and 200 characters.' });
    }
    const limit = passwordChangeLimiter.hit(String(req.user.id));
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSec));
      return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
    }

    const user = await get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    // Changing the password signs out every other device (finding S4). This
    // device gets a fresh token so the person stays signed in here.
    const updated = await get(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING id, email, role, token_version',
      [newHash, user.id]
    );
    res.json({ message: 'Password changed. Other devices have been signed out.', token: signSession(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ---------- Staff activation (management-team invite flow) ----------
// No email-sending is wired up — the admin shares the activation link
// (containing this token) with the invited staff member directly.

const activationLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const limitActivation = limitByIp(activationLimiter, 'Too many attempts. Please wait and try again.');

router.get('/activate-staff/:token', limitActivation, async (req, res) => {
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

router.post('/activate-staff', limitActivation, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || typeof password !== 'string' || !token || !password) return res.status(400).json({ error: 'token and password are required.' });
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
