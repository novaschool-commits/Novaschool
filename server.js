require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { pool, migrate } = require('./db');
const { seed } = require('./db/seed');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/student', require('./routes/student'));
app.use('/api/parent', require('./routes/parent'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/common'));

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS c FROM students');
    res.json({ status: 'ok', studentsInDatabase: Number(rows[0].c) });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Serve the frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Central error handler — catches anything asyncHandler forwards.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await migrate();

  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM students');
  if (Number(rows[0].c) === 0) {
    console.log('[server] Empty database detected — seeding demo data...');
    await seed({ force: false });
  }

  app.listen(PORT, () => {
    console.log(`\nNova School server running at http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
