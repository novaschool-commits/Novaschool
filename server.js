require('dotenv').config();
const http = require('http');

const config = require('./lib/config'); // fails fast on an unsafe production config
const app = require('./app');
const { pool, migrate } = require('./db');
const { seed } = require('./db/seed');
const { seedPermissions } = require('./db/seed-permissions');
const { seedLabExperiments } = require('./db/seed-lab');
const { attachWhiteboardWS } = require('./ws/whiteboard');

const PORT = process.env.PORT || 3000;

async function start() {
  // The app's limited login (migration 0007) cannot change tables; the owner
  // runs `npm run db:schema` instead. Only the table owner applies schema.sql.
  let ownsTables = false;
  if (config.migrateOnStart) {
    const { rows } = await pool.query("SELECT COALESCE((SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'), current_user) = current_user AS owner");
    ownsTables = rows[0].owner;
    if (!ownsTables) console.log('[server] Connected with the limited app login: schema and catalogs are left to `npm run db:schema` (owner).');
  }
  if (config.migrateOnStart && ownsTables) {
    await migrate();            // legacy idempotent schema.sql only
    await seedPermissions();    // idempotent catalog
    await seedLabExperiments(); // idempotent
  } else if (!config.migrateOnStart) {
    console.log('[server] MIGRATE_ON_START=false: schema and catalogs were not touched.');
  }

  if (config.seedDemo) {
    const { rows } = await pool.query('SELECT COUNT(*) AS c FROM students');
    if (Number(rows[0].c) === 0) {
      console.log('[server] SEED_DEMO=true and the database is empty: creating demo data.');
      await seed({ force: false });
    }
  }

  // Phase P3: sign-in needs the multi-school tables (migrations 0001-0003, 0005).
  const { rows: ready } = await pool.query("SELECT to_regclass('public.institution_memberships') AS t");
  if (!ready[0].t) {
    console.error('\n[server] The multi-school tables are missing. Run the migrations, then start again:\n' +
      '  MIGRATION_DATABASE_URL=<owner connection> npm run migrate -- --yes\n');
    await pool.end();
    process.exit(1);
  }

  const server = http.createServer(app);
  attachWhiteboardWS(server);
  server.listen(PORT, () => {
    console.log(`\nNova School server running at http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
