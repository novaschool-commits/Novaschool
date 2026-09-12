const express = require('express');
const { get, all, run } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

async function getStudent(req) {
  if (req.user.role !== 'student') return null;
  return get('SELECT * FROM students WHERE user_id = $1', [req.user.id]);
}

// ============================================================
// Admin/Staff: experiment catalog management (labs.view / labs.manage)
// ============================================================

router.get('/experiments', requirePermission('labs.view'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT e.*, (SELECT COUNT(*) FROM lab_attempts a WHERE a.experiment_id = e.id) AS attempt_count
     FROM lab_experiments e ORDER BY e.created_at DESC`
  );
  res.json({ experiments: rows.map(r => ({
    id: r.id, slug: r.slug, type: r.type, title: r.title, subject: r.subject, curriculum: r.curriculum,
    grade: r.grade, topic: r.topic, difficulty: r.difficulty, status: r.status,
    estimatedMinutes: r.estimated_minutes, currentVersion: r.current_version, attemptCount: Number(r.attempt_count)
  })) });
}));

router.post('/experiments', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const {
    slug, type, title, subject, curriculum, grade, topic, objective, learn_points,
    equipment_summary, safety_info, background_theory, instructions, estimated_minutes, difficulty, config
  } = req.body || {};
  if (!slug || !type || !title || !subject || !config) {
    return res.status(400).json({ error: 'slug, type, title, subject, and config are required.' });
  }
  const existing = await get('SELECT id FROM lab_experiments WHERE slug = $1', [slug]);
  if (existing) return res.status(409).json({ error: 'An experiment with this slug already exists.' });

  let parsedConfig;
  try { parsedConfig = typeof config === 'string' ? JSON.parse(config) : config; }
  catch (e) { return res.status(400).json({ error: 'config must be valid JSON.' }); }

  const validDifficulties = ['beginner', 'intermediate', 'advanced'];
  if (difficulty && !validDifficulties.includes(difficulty)) {
    return res.status(400).json({ error: `difficulty must be one of: ${validDifficulties.join(', ')}.` });
  }

  const exp = await get(
    `INSERT INTO lab_experiments (slug, type, title, subject, curriculum, grade, topic, objective, learn_points,
       equipment_summary, safety_info, background_theory, instructions, estimated_minutes, difficulty, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [slug, type, title, subject, curriculum || null, grade || null, topic || null, objective || null, learn_points || null,
     equipment_summary || null, safety_info || null, background_theory || null, instructions || null,
     Number(estimated_minutes) || 15, difficulty || 'beginner', req.user.id]
  );
  await run('INSERT INTO lab_experiment_versions (experiment_id, version_number, config) VALUES ($1,1,$2)', [exp.id, JSON.stringify(parsedConfig)]);
  res.status(201).json({ message: 'Experiment created as a draft.', experimentId: exp.id });
}));

router.get('/experiments/:id', requirePermission('labs.view'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  const version = await get(
    'SELECT * FROM lab_experiment_versions WHERE experiment_id = $1 AND version_number = $2',
    [id, exp.current_version]
  );
  res.json({ experiment: exp, config: version ? version.config : null });
}));

router.patch('/experiments/:id', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });

  const {
    title, subject, curriculum, grade, topic, objective, learn_points, equipment_summary,
    safety_info, background_theory, instructions, estimated_minutes, difficulty, config
  } = req.body || {};

  await run(
    `UPDATE lab_experiments SET
       title = COALESCE($1, title), subject = COALESCE($2, subject), curriculum = COALESCE($3, curriculum),
       grade = COALESCE($4, grade), topic = COALESCE($5, topic), objective = COALESCE($6, objective),
       learn_points = COALESCE($7, learn_points), equipment_summary = COALESCE($8, equipment_summary),
       safety_info = COALESCE($9, safety_info), background_theory = COALESCE($10, background_theory),
       instructions = COALESCE($11, instructions), estimated_minutes = COALESCE($12, estimated_minutes),
       difficulty = COALESCE($13, difficulty)
     WHERE id = $14`,
    [title, subject, curriculum, grade, topic, objective, learn_points, equipment_summary,
     safety_info, background_theory, instructions, estimated_minutes ? Number(estimated_minutes) : null, difficulty, id]
  );

  // A new config creates a new version rather than mutating the old one, so
  // students who already attempted the previous version keep a result
  // that's still meaningful against what they actually did.
  if (config) {
    let parsedConfig;
    try { parsedConfig = typeof config === 'string' ? JSON.parse(config) : config; }
    catch (e) { return res.status(400).json({ error: 'config must be valid JSON.' }); }
    const newVersion = exp.current_version + 1;
    await run('INSERT INTO lab_experiment_versions (experiment_id, version_number, config) VALUES ($1,$2,$3)', [id, newVersion, JSON.stringify(parsedConfig)]);
    await run('UPDATE lab_experiments SET current_version = $1 WHERE id = $2', [newVersion, id]);
  }
  res.json({ message: 'Experiment updated.' });
}));

router.post('/experiments/:id/publish', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  await run("UPDATE lab_experiments SET status = 'published' WHERE id = $1", [id]);
  res.json({ message: `"${exp.title}" is now published — students can find and attempt it.` });
}));

router.post('/experiments/:id/unpublish', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  await run("UPDATE lab_experiments SET status = 'draft' WHERE id = $1", [id]);
  res.json({ message: `"${exp.title}" moved back to draft.` });
}));

// ============================================================
// Student: browse catalog, run experiments, track attempts
// ============================================================

router.get('/catalog', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(403).json({ error: 'Only students can browse the Virtual Lab.' });

  const experiments = await all(
    `SELECT e.id, e.slug, e.title, e.subject, e.curriculum, e.grade, e.topic, e.difficulty, e.estimated_minutes,
            (SELECT MAX(score) FROM lab_attempts a WHERE a.experiment_id = e.id AND a.student_id = $1 AND a.status = 'completed') AS best_score,
            (SELECT COUNT(*) FROM lab_attempts a WHERE a.experiment_id = e.id AND a.student_id = $1) AS attempt_count
     FROM lab_experiments e WHERE e.status = 'published' ORDER BY e.subject, e.title`,
    [student.id]
  );
  res.json({ experiments: experiments.map(e => ({
    id: e.id, slug: e.slug, title: e.title, subject: e.subject, curriculum: e.curriculum, grade: e.grade,
    topic: e.topic, difficulty: e.difficulty, estimatedMinutes: e.estimated_minutes,
    bestScore: e.best_score !== null ? Number(e.best_score) : null, attemptCount: Number(e.attempt_count)
  })) });
}));

router.get('/experiments/:id/detail', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(403).json({ error: 'Only students can view experiment details.' });
  const exp = await get("SELECT * FROM lab_experiments WHERE id = $1 AND status = 'published'", [Number(req.params.id)]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  res.json({ experiment: {
    id: exp.id, title: exp.title, subject: exp.subject, curriculum: exp.curriculum, grade: exp.grade, topic: exp.topic,
    objective: exp.objective, learnPoints: exp.learn_points, equipmentSummary: exp.equipment_summary,
    safetyInfo: exp.safety_info, backgroundTheory: exp.background_theory, instructions: exp.instructions,
    estimatedMinutes: exp.estimated_minutes, difficulty: exp.difficulty
  } });
}));

router.post('/attempts', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(403).json({ error: 'Only students can start an experiment attempt.' });
  const { experiment_id, mode } = req.body || {};
  const exp = await get("SELECT * FROM lab_experiments WHERE id = $1 AND status = 'published'", [experiment_id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  const version = await get('SELECT * FROM lab_experiment_versions WHERE experiment_id = $1 AND version_number = $2', [exp.id, exp.current_version]);

  const attempt = await get(
    'INSERT INTO lab_attempts (experiment_id, experiment_version_id, student_id, mode) VALUES ($1,$2,$3,$4) RETURNING id',
    [exp.id, version.id, student.id, mode === 'guided' ? 'guided' : 'challenge']
  );
  res.status(201).json({ attemptId: attempt.id, experimentType: exp.type, config: version.config });
}));

router.get('/attempts/:id', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(403).json({ error: 'Only students can view their own attempts.' });
  const attempt = await get('SELECT * FROM lab_attempts WHERE id = $1 AND student_id = $2', [Number(req.params.id), student.id]);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  const version = await get('SELECT config FROM lab_experiment_versions WHERE id = $1', [attempt.experiment_version_id]);
  const exp = await get('SELECT type FROM lab_experiments WHERE id = $1', [attempt.experiment_id]);
  res.json({ attempt, experimentType: exp.type, config: version.config });
}));

router.post('/attempts/:id/event', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(403).json({ error: 'Only students can log attempt events.' });
  const attemptId = Number(req.params.id);
  const attempt = await get('SELECT * FROM lab_attempts WHERE id = $1 AND student_id = $2', [attemptId, student.id]);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'This attempt has already ended.' });

  const { event_type, detail, state } = req.body || {};
  if (!event_type) return res.status(400).json({ error: 'event_type is required.' });
  await run('INSERT INTO lab_attempt_events (attempt_id, event_type, detail) VALUES ($1,$2,$3)', [attemptId, event_type, detail ? JSON.stringify(detail) : null]);

  if (event_type === 'mistake') await run('UPDATE lab_attempts SET mistakes_count = mistakes_count + 1 WHERE id = $1', [attemptId]);
  if (event_type === 'hint') await run('UPDATE lab_attempts SET hints_used = hints_used + 1 WHERE id = $1', [attemptId]);
  if (state !== undefined) await run('UPDATE lab_attempts SET state = $1 WHERE id = $2', [JSON.stringify(state), attemptId]);

  res.json({ message: 'Recorded.' });
}));

router.post('/attempts/:id/complete', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(403).json({ error: 'Only students can complete their own attempts.' });
  const attemptId = Number(req.params.id);
  const attempt = await get('SELECT * FROM lab_attempts WHERE id = $1 AND student_id = $2', [attemptId, student.id]);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'This attempt has already ended.' });

  // Score is derived server-side from mistakes/hints this attempt actually
  // accumulated via /event calls — not taken from whatever the client
  // claims at completion time. Note: a determined student could still call
  // the API directly to under-report mistakes; this is fine for a v1
  // learning tool, not a high-stakes exam integrity system.
  const score = Math.max(5, 100 - Math.min(80, attempt.mistakes_count * 15) - Math.min(15, attempt.hints_used * 5));
  await run("UPDATE lab_attempts SET status = 'completed', score = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2", [score, attemptId]);
  res.json({ message: 'Experiment completed.', score });
}));

router.post('/attempts/:id/abandon', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(403).json({ error: 'Only students can abandon their own attempts.' });
  const attemptId = Number(req.params.id);
  const attempt = await get('SELECT * FROM lab_attempts WHERE id = $1 AND student_id = $2', [attemptId, student.id]);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  if (attempt.status === 'in_progress') {
    await run("UPDATE lab_attempts SET status = 'abandoned' WHERE id = $1", [attemptId]);
  }
  res.json({ message: 'OK' });
}));

module.exports = router;
