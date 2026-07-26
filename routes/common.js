const express = require('express');
const { all } = require('../db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

// Any logged-in role can see announcements addressed to "all" plus their own audience.
router.get('/announcements', authenticate, asyncHandler(async (req, res) => {
  const audience = req.user.role === 'student' ? 'students'
    : req.user.role === 'parent' ? 'parents'
    : req.user.role === 'teacher' ? 'teachers'
    : 'all';

  const rows = await all(
    `SELECT title, body, created_at FROM announcements
     WHERE audience IN ('all', $1) ORDER BY created_at DESC LIMIT 10`,
    [audience]
  );

  res.json({ announcements: rows });
}));

module.exports = router;
