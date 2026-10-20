// Numbered, recorded migrations (db/migrations/NNNN_name.sql).
//
//   node db/migrate.js --status            list applied and pending files
//   node db/migrate.js --dry-run           show what would run, change nothing
//   node db/migrate.js --yes               apply pending migrations
//   node db/migrate.js --rollback 0003 --yes   run rollback/0003_*.down.sql
//
// Safety rules:
//  * Never runs on server start. Someone runs it on purpose.
//  * Uses MIGRATION_DATABASE_URL (the table-owner role) or DATABASE_URL.
//  * A non-local database needs --yes, and the target host is printed first.
//  * Files whose first line is "-- requires: ALLOW_RLS_ENFORCEMENT" are
//    skipped unless that environment variable is "true".
//  * Each file runs in its own transaction under an advisory lock, and its
//    checksum is recorded; an edited, already-applied file is reported.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const DIR = path.join(__dirname, 'migrations');
const args = process.argv.slice(2);
const has = f => args.includes(f);

function files() {
  return fs.readdirSync(DIR).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
}
function gate(sql) {
  const m = sql.split('\n', 1)[0].match(/^-- requires: ([A-Z_]+)/);
  return m ? m[1] : null;
}
function sha(sql) { return crypto.createHash('sha256').update(sql).digest('hex'); }

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) { console.error('Set MIGRATION_DATABASE_URL or DATABASE_URL.'); process.exit(1); }
  const host = (() => { try { return new URL(url).hostname || 'local socket'; } catch (e) { return 'unknown'; } })();
  const local = /^(localhost|127\.0\.0\.1|local socket|)$/.test(host);
  console.log(`Target database host: ${host}`);
  const writing = !has('--status') && !has('--dry-run');
  if (writing && !local && !has('--yes')) {
    console.error('Refusing to change a non-local database without --yes. Check the host above first.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' } });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const applied = new Map((await client.query('SELECT id, checksum FROM schema_migrations')).rows.map(r => [r.id, r.checksum]));

    if (has('--rollback')) {
      const id = args[args.indexOf('--rollback') + 1];
      const file = fs.readdirSync(path.join(DIR, 'rollback')).find(f => f.startsWith(id + '_') && f.endsWith('.down.sql'));
      const target = files().find(f => f.startsWith(id + '_'));
      if (!file || !target) { console.error(`No rollback file for ${id}.`); process.exit(1); }
      if (!applied.has(target)) { console.error(`${target} is not applied.`); process.exit(1); }
      const later = [...applied.keys()].filter(k => k > target);
      if (later.length) { console.error(`Roll back later migrations first: ${later.join(', ')}`); process.exit(1); }
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(424242)');
      await client.query(fs.readFileSync(path.join(DIR, 'rollback', file), 'utf8'));
      await client.query('DELETE FROM schema_migrations WHERE id = $1', [target]);
      await client.query('COMMIT');
      console.log(`Rolled back ${target}`);
      return;
    }

    for (const f of files()) {
      const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
      const sum = sha(sql);
      if (applied.has(f)) {
        console.log(`${applied.get(f) === sum ? 'applied ' : 'CHANGED '} ${f}`);
        continue;
      }
      const g = gate(sql);
      if (g && process.env[g] !== 'true') { console.log(`skipped  ${f} (needs ${g}=true)`); continue; }
      if (!writing) { console.log(`pending  ${f}`); continue; }
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(424242)');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [f, sum]);
        await client.query('COMMIT');
        console.log(`applied  ${f}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`FAILED   ${f}: ${err.message}\nNothing from this file was applied. Later files were not run.`);
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
