// Builds the Express app without starting it, so tests can load it.
const express = require('express');
const path = require('path');

const config = require('./lib/config');
const { securityHeaders, corsAllowList } = require('./lib/securityHeaders');
const { pool, tenantScope } = require('./db');

const app = express();
app.disable('x-powered-by');
// Render's proxy adds the client address; set TRUST_PROXY_HOPS if more proxies sit in front.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(securityHeaders(config));
app.use(corsAllowList(config.allowedOrigins));
app.use(express.json({ limit: '6mb' }));
// One database scope per API request: queries share one transaction with the
// school context set (Phase P3). Public pages act for PUBLIC_INSTITUTION_ID
// until a session names the school.
app.use('/api', tenantScope(config.publicInstitutionId));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/student', require('./routes/student'));
app.use('/api/parent', require('./routes/parent'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/management', require('./routes/management'));
app.use('/api/lab', require('./routes/lab'));
app.use('/api', require('./routes/common'));

// Public health check: says only whether the database answers (finding S12).
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[health]', err.message);
    res.status(503).json({ status: 'error' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That file is too large. Please use a photo/document under about 3.5MB.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request could not be read.' });
  }
  // Unique keys are global: under row-level security another school's record
  // is invisible, so a duplicate shows up only when the insert is refused.
  if (err.code === '23505') {
    const msg = err.constraint === 'users_email_key' ? 'An account with that email already exists.' : 'That record already exists.';
    return res.status(409).json({ error: msg });
  }
  if (err.code === 'NOVA_SCOPE_CLOSED' && (req.destroyed || res.destroyed || res.writableEnded)) {
    // The browser left before the answer was ready; its work was rolled back.
    console.warn(`[api] ${req.method} ${req.originalUrl}: client left before the response; rolled back`);
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

module.exports = app;
