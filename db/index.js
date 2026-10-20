const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error(
    '\nMissing DATABASE_URL.\n' +
    'Set it to a Postgres connection string (e.g. from Neon) in your .env file\n' +
    'or in your host\'s environment variables. See .env.example.\n'
  );
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1|host=\/|@\/|%2F/.test(process.env.DATABASE_URL);
const rejectUnauthorized = process.env.PGSSL_REJECT_UNAUTHORIZED === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon (and most hosted Postgres) requires TLS. Certificate checking is
  // opt-in (PGSSL_REJECT_UNAUTHORIZED=true) until it has been tested against
  // the live database; see docs/RELEASE-GATE-REPORT.md, risk R-08.
  ssl: isLocal ? false : { rejectUnauthorized }
});

async function all(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}
async function get(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}
async function run(sql, params = []) {
  const { rows, rowCount } = await pool.query(sql, params);
  return { rows, rowCount };
}

// Runs fn(client) inside one transaction; rolls back on any error (finding S14).
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* connection already broken */ }
    throw err;
  } finally {
    client.release();
  }
}

// Legacy schema, idempotent; still applied on start (see lib/config.js).
async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

module.exports = { pool, all, get, run, withTransaction, migrate };
