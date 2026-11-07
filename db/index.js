const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

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

// ---------------------------------------------------------------------------
// School context (multi-school Phase P3)
//
// Every API request and every whiteboard message runs inside a "scope". The
// first query in a scope takes one connection from the pool, opens a
// transaction and sets three transaction-local settings with
// set_config(..., true):
//   app.institution_id  the school the request acts for (row-level security)
//   app.user_id         the signed-in person (their own login and memberships)
//   app.account_email   the one login being signed in to or created
// All later queries in the scope use that same connection. The scope ends
// with COMMIT (or ROLLBACK on a server error) and the connection goes back
// to the pool, where the settings no longer exist: one request's school can
// never leak into another request. A query after the scope has ended is
// refused instead of running without context.
// ---------------------------------------------------------------------------
const scopes = new AsyncLocalStorage();

function emptyContext() {
  return { institutionId: null, userId: null, accountEmail: null };
}

async function applyContext(client, ctx) {
  await client.query(
    "SELECT set_config('app.institution_id', $1, true), set_config('app.user_id', $2, true), set_config('app.account_email', $3, true)",
    [ctx.institutionId ? String(ctx.institutionId) : '', ctx.userId ? String(ctx.userId) : '', ctx.accountEmail || '']
  );
}

async function scopeClient(scope) {
  if (scope.closed) {
    throw Object.assign(new Error('Database used after the request finished (no school context).'), { status: 500 });
  }
  if (!scope.clientPromise) {
    scope.clientPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await applyContext(client, scope.ctx);
      } catch (err) {
        client.release(err);
        throw err;
      }
      scope.client = client;
      return client;
    })();
  }
  return scope.clientPromise;
}

async function query(sql, params) {
  const scope = scopes.getStore();
  if (!scope) return pool.query(sql, params); // startup, migrations, scripts
  const client = await scopeClient(scope);
  return client.query(sql, params);
}

// Starts a scope for fn. Returns fn's result after COMMIT, or rolls back and
// rethrows. Used for WebSocket messages and anything outside an HTTP request.
async function runInTenant(ctx, fn) {
  const scope = { ctx: Object.assign(emptyContext(), ctx || {}), client: null, clientPromise: null, closed: false, savepoints: 0 };
  let result;
  try {
    result = await scopes.run(scope, fn);
  } catch (err) {
    await endScope(scope, false);
    throw err;
  }
  await endScope(scope, true);
  return result;
}

async function endScope(scope, commit) {
  if (scope.closed) return;
  scope.closed = true;
  if (!scope.clientPromise) return;
  let client;
  try { client = await scope.clientPromise; } catch (e) { return; }
  try {
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    client.release();
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* connection broken */ }
    client.release(err);
    if (commit) throw err;
  }
}

// Changes the school or person for the rest of the current scope (used once
// the session or sign-in has identified them). Safe to call before or after
// the first query.
async function setTenantContext(changes) {
  const scope = scopes.getStore();
  if (!scope) throw new Error('setTenantContext called outside a request scope.');
  Object.assign(scope.ctx, changes);
  if (scope.clientPromise && !scope.closed) {
    const client = await scope.clientPromise;
    await applyContext(client, scope.ctx);
  }
}

function currentTenantContext() {
  const scope = scopes.getStore();
  return scope ? Object.assign({}, scope.ctx) : null;
}

// Express middleware for /api: one scope per request. The transaction is
// committed BEFORE the response is sent, so a client never sees "saved" for
// something that was not saved. A 5xx response rolls the request back. If
// the commit itself fails the connection to the client is dropped rather
// than reporting success.
function tenantScope(defaultInstitutionId) {
  return (req, res, next) => {
    const scope = { ctx: Object.assign(emptyContext(), { institutionId: defaultInstitutionId || null }), client: null, clientPromise: null, closed: false, savepoints: 0 };
    req.tenantScope = scope;
    const originalEnd = res.end;
    let ending = false;
    res.end = function (...args) {
      if (ending) return originalEnd.apply(res, args);
      ending = true;
      endScope(scope, res.statusCode < 500)
        .then(() => originalEnd.apply(res, args))
        .catch((err) => {
          console.error('[db] commit failed:', err.message);
          res.destroy(err);
        });
      return res;
    };
    res.on('close', () => { if (!scope.closed) endScope(scope, false).catch(() => {}); });
    scopes.run(scope, next);
  };
}

async function all(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows;
}
async function get(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows[0] || null;
}
async function run(sql, params = []) {
  const { rows, rowCount } = await query(sql, params);
  return { rows, rowCount };
}

// Runs fn(client) as one unit (finding S14). Inside a request scope it uses
// the scope's connection with a SAVEPOINT, so it shares the school context;
// outside a scope it opens its own transaction.
async function withTransaction(fn) {
  const scope = scopes.getStore();
  if (scope) {
    const client = await scopeClient(scope);
    const name = `nova_sp_${++scope.savepoints}`;
    await client.query(`SAVEPOINT ${name}`);
    try {
      const result = await fn(client);
      await client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (err) {
      try { await client.query(`ROLLBACK TO SAVEPOINT ${name}`); } catch (e) { /* surfaced by the caller */ }
      throw err;
    }
  }
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

module.exports = {
  pool, all, get, run, withTransaction, migrate,
  tenantScope, runInTenant, setTenantContext, currentTenantContext
};
