// Creates (or re-keys) the app's own database login, a member of the limited
// role nova_app from migration 0007. Run as the table owner:
//
//   MIGRATION_DATABASE_URL=<owner connection> node db/app-login.js --yes
//
// Prints the new connection string ONCE, for the host's DATABASE_URL. The
// password is random and is not stored anywhere by this script. Running it
// again changes the password (the old one stops working).
require('dotenv').config();
const crypto = require('crypto');
const { Client } = require('pg');

const LOGIN = process.env.APP_LOGIN_NAME || 'nova_app_login';

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) { console.error('Set MIGRATION_DATABASE_URL to the owner connection.'); process.exit(1); }
  if (!/^[a-z_][a-z0-9_]{2,40}$/.test(LOGIN)) { console.error('APP_LOGIN_NAME must be lower-case letters, digits or _.'); process.exit(1); }
  const target = new URL(url);
  console.log(`Target database host: ${target.hostname}`);
  const local = /^(localhost|127\.0\.0\.1)$/.test(target.hostname);
  if (!local && !process.argv.includes('--yes')) {
    console.error('Refusing to change a non-local database without --yes. Check the host above first.');
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' } });
  await client.connect();
  try {
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'nova_app'");
    if (!role.rowCount) throw new Error('Role nova_app is missing: run the migrations (0007) first.');
    const password = crypto.randomBytes(24).toString('base64url'); // 192 bits
    const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [LOGIN])).rowCount > 0;
    const pw = client.escapeLiteral(password);
    if (exists) {
      // Only the password changes here: hosted PostgreSQL (Neon) refuses to
      // restate superuser/bypass attributes. They are verified below instead.
      await client.query(`ALTER ROLE ${LOGIN} WITH LOGIN PASSWORD ${pw}`);
    } else {
      await client.query(`CREATE ROLE ${LOGIN} WITH LOGIN PASSWORD ${pw} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    }
    await client.query(`GRANT nova_app TO ${LOGIN}`);
    const check = (await client.query(
      `SELECT r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole,
              pg_has_role(r.rolname, 'nova_app', 'USAGE') AS in_app_role,
              EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = r.rolname) AS owns_tables
         FROM pg_roles r WHERE r.rolname = $1`, [LOGIN])).rows[0];
    if (check.rolsuper || check.rolbypassrls || check.rolcreatedb || check.rolcreaterole || !check.in_app_role || check.owns_tables) {
      throw new Error(`Login ${LOGIN} is not limited as expected: ${JSON.stringify(check)}`);
    }
    target.username = LOGIN;
    target.password = password;
    console.log(`\n${exists ? 'Changed the password of' : 'Created'} ${LOGIN} (member of nova_app; no bypass, no table ownership).`);
    console.log('Copy this connection string into the host\'s DATABASE_URL. It is shown only once:\n');
    console.log(target.toString());
    console.log('\nDo not paste it into chats or commit it.');
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error('Failed:', err.message); process.exit(1); });
