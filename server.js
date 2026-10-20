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
  if (config.migrateOnStart) {
    await migrate();            // legacy idempotent schema.sql only
    await seedPermissions();    // idempotent catalog
    await seedLabExperiments(); // idempotent
  } else {
    console.log('[server] MIGRATE_ON_START=false: schema and catalogs were not touched.');
  }

  if (config.seedDemo) {
    const { rows } = await pool.query('SELECT COUNT(*) AS c FROM students');
    if (Number(rows[0].c) === 0) {
      console.log('[server] SEED_DEMO=true and the database is empty: creating demo data.');
      await seed({ force: false });
    }
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
