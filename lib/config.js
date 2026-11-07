// Runtime configuration, checked once at startup (audit findings S5, S6).
const crypto = require('crypto');

const env = process.env;
const isProduction = env.NODE_ENV === 'production' || env.RENDER === 'true';

function resolveJwtSecret() {
  const s = env.JWT_SECRET;
  if (s && s.length >= 32 && s !== 'change-this-to-a-long-random-string' && s !== 'novaschool-dev-secret-change-me') {
    return { secret: s, source: 'env' };
  }
  if (isProduction) {
    // Never fall back to a guessable value where real users exist.
    throw new Error('JWT_SECRET is missing or shorter than 32 characters. Set a long random value in the environment before starting in production.');
  }
  // Local development only: a random secret for this process. Sessions end
  // when the server restarts, which is acceptable on a developer machine.
  console.warn('[config] JWT_SECRET not set or too short; using a random development secret for this run.');
  return { secret: crypto.randomBytes(48).toString('hex'), source: 'ephemeral' };
}

const jwt = resolveJwtSecret();

function flag(name, defaultValue) {
  const v = env[name];
  if (v === undefined || v === '') return defaultValue;
  return v === 'true' || v === '1';
}

module.exports = {
  isProduction,
  jwtSecret: jwt.secret,
  jwtSecretSource: jwt.source,
  // Demo accounts (password "password123") are created only when explicitly
  // asked for, and never in production.
  seedDemo: flag('SEED_DEMO', false) && !isProduction,
  // The legacy idempotent schema.sql still runs on start by default so the
  // current Render deploy keeps working. Numbered migrations in
  // db/migrations never run on start; they run only via `npm run migrate`.
  migrateOnStart: flag('MIGRATE_ON_START', true),
  allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  pgRejectUnauthorized: flag('PGSSL_REJECT_UNAUTHORIZED', false),
  // The school that public pages (admission form, news, public courses,
  // staff activation) act for until each school has its own address.
  publicInstitutionId: (() => {
    const n = Number(env.PUBLIC_INSTITUTION_ID || 1);
    if (!Number.isInteger(n) || n <= 0) throw new Error('PUBLIC_INSTITUTION_ID must be a positive whole number.');
    return n;
  })()
};
