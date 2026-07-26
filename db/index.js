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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon (and most hosted Postgres) requires SSL; local Postgres usually doesn't.
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }
});

// Small helpers so route code reads close to plain SQL.
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

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

module.exports = { pool, all, get, run, migrate };
