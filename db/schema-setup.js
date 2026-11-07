// Applies the legacy schema (db/schema.sql) and the built-in catalogs
// (permissions, Virtual Lab) as the table owner. The app does this itself
// on start only when it connects as the owner; once it uses its limited login,
// run this after any release that changes db/schema.sql or the catalogs:
//
//   MIGRATION_DATABASE_URL=<owner connection> node db/schema-setup.js --yes
require('dotenv').config();
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) { console.error('Set MIGRATION_DATABASE_URL to the owner connection.'); process.exit(1); }
const host = new URL(url).hostname;
console.log(`Target database host: ${host}`);
if (!/^(localhost|127\.0\.0\.1)$/.test(host) && !process.argv.includes('--yes')) {
  console.error('Refusing to change a non-local database without --yes. Check the host above first.');
  process.exit(1);
}
process.env.DATABASE_URL = url; // db/index.js connects with DATABASE_URL
const db = require('./index');
(async () => {
  await db.migrate();
  await require('./seed-permissions').seedPermissions();
  await require('./seed-lab').seedLabExperiments();
  console.log('Schema and catalogs are up to date.');
  await db.pool.end();
})().catch((err) => { console.error('Failed:', err.message); process.exit(1); });
