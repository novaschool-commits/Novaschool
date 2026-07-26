const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get } = require('../db');
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

module.exports = router;
