const jwt = require('jsonwebtoken');
const { get, run } = require('../db');
const { jwtSecret } = require('../lib/config');

const SECRET = jwtSecret;
const TOKEN_TTL = '12h';

function signSession(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tokenVersion: user.token_version || 0 },
    SECRET,
    { expiresIn: TOKEN_TTL, algorithm: 'HS256' }
  );
}

// Checks a token against the database on every use (finding S4):
// signature and expiry, the current token_version (remote sign-out, password
// change, suspension), the current role, and that the account is active.
// Shared by HTTP requests and the whiteboard WebSocket.
async function verifySession(token) {
  let payload;
  try {
    payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return { ok: false, error: 'Invalid or expired session. Please log in again.' };
  }
  if (typeof payload.id !== 'number' || typeof payload.tokenVersion !== 'number') {
    return { ok: false, error: 'Invalid or expired session. Please log in again.' };
  }
  const row = await get(
    `SELECT u.token_version, u.role,
            COALESCE(st.status, t.status, p.status, sf.status, 'active') AS status
       FROM users u
       LEFT JOIN students st ON st.user_id = u.id
       LEFT JOIN teachers t  ON t.user_id = u.id
       LEFT JOIN parents p   ON p.user_id = u.id
       LEFT JOIN staff sf    ON sf.user_id = u.id
      WHERE u.id = $1`,
    [payload.id]
  );
  if (!row || row.token_version !== payload.tokenVersion || row.role !== payload.role) {
    return { ok: false, error: 'Your session has ended. Please log in again.' };
  }
  if (row.status !== 'active') {
    return { ok: false, error: 'This account is not active. Contact the school administration.' };
  }
  return { ok: true, user: { id: payload.id, email: payload.email, role: payload.role, tokenVersion: payload.tokenVersion } };
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing authentication token.' });
  try {
    const result = await verifySession(token);
    if (!result.ok) return res.status(401).json({ error: result.error });
    req.user = result.user;
    next();
  } catch (err) {
    next(err);
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

// Ends every session a user has (used on suspension, role or password change).
async function revokeSessions(userId, client) {
  const sql = 'UPDATE users SET token_version = token_version + 1 WHERE id = $1';
  if (client) return client.query(sql, [userId]);
  return run(sql, [userId]);
}

module.exports = { authenticate, requireRole, verifySession, signSession, revokeSessions, SECRET };
