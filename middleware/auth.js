const jwt = require('jsonwebtoken');
const { get } = require('../db');

const SECRET = process.env.JWT_SECRET || 'novaschool-dev-secret-change-me';

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token.' });
  }
  try {
    const payload = jwt.verify(token, SECRET); // { id, email, role, tokenVersion }
    // tokenVersion lets an admin force-invalidate a user's sessions (Security
    // Center "force logout"). Tokens issued before this feature existed have
    // no tokenVersion — they're allowed through unchecked until they expire
    // naturally or the user logs in again, so this doesn't break anyone
    // already signed in when it ships.
    if (payload.tokenVersion !== undefined) {
      const row = await get('SELECT token_version FROM users WHERE id = $1', [payload.id]);
      if (!row || row.token_version !== payload.tokenVersion) {
        return res.status(401).json({ error: 'Your session was ended remotely. Please log in again.' });
      }
    }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this resource.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, SECRET };
