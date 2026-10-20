// Per-request school context for row-level security (multi-school Phase P3).
// NOT wired into routes in release candidate 1: the policies that read this
// context are in the gated migration 0004, which stays off until every route
// runs through withTenant(). Kept here so that work starts from a tested shape
// (see tests/db/tenancy.sql, which exercises the same set_config calls).
const { pool } = require('../db');

// Runs fn(client) in one transaction with the school and user set via
// set_config(..., true), which lasts only until COMMIT/ROLLBACK: a pooled
// connection never keeps one request's school for the next.
async function withTenant({ institutionId, userId }, fn) {
  if (!Number.isInteger(institutionId) || institutionId <= 0) {
    throw Object.assign(new Error('No school context for this request.'), { status: 403 });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.institution_id', $1, true), set_config('app.user_id', $2, true)",
      [String(institutionId), userId ? String(userId) : '']
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withTenant };
