const express = require('express');
const { get, all, run } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission, userHasPermission } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authenticate);

async function getStudent(req) {
  if (req.user.role !== 'student') return null;
  return get('SELECT * FROM students WHERE user_id = $1', [req.user.id]);
}

async function getTeacher(req) {
  if (req.user.role !== 'teacher') return null;
  return get('SELECT * FROM teachers WHERE user_id = $1', [req.user.id]);
}

// Teachers aren't covered by the requirePermission system at all (it only
// recognizes admin/staff) — assigning labs needs to work for teachers too,
// so this checks both paths rather than reusing requirePermission directly.
async function canManageLabAssignments(req) {
  if (req.user.role === 'admin' || req.user.role === 'teacher') return true;
  if (req.user.role === 'staff') return userHasPermission(req, 'labs.manage');
  return false;
}

// ============================================================
// Supported experiment types — the honest source of truth for what the
// engine can actually render. Kept in sync with LAB_RENDERERS on the
// frontend: a type only belongs here once a real renderer exists for it,
// so validation can never approve a config nothing can play.
// ============================================================

const SUPPORTED_LAB_TYPES = {
  circuit: {
    label: 'Series Circuit',
    validate(config) {
      const errors = [];
      if (!config || typeof config !== 'object') return [{ field: 'config', message: 'config must be an object.' }];
      if (typeof config.voltage !== 'number' || config.voltage <= 0) {
        errors.push({ field: 'voltage', message: 'voltage is required and must be a positive number.' });
      }
      if (typeof config.resistance !== 'number' || config.resistance <= 0) {
        errors.push({ field: 'resistance', message: 'resistance is required and must be a positive number.' });
      }
      if (!Array.isArray(config.connections) || config.connections.length === 0) {
        errors.push({ field: 'connections', message: 'connections must be a non-empty array.' });
      } else {
        const ids = [];
        config.connections.forEach((c, i) => {
          if (!c || typeof c !== 'object') { errors.push({ field: `connections[${i}]`, message: 'Each connection must be an object.' }); return; }
          if (!c.id || typeof c.id !== 'string') errors.push({ field: `connections[${i}].id`, message: 'id is required and must be a string.' });
          else ids.push(c.id);
          if (!c.from || typeof c.from !== 'string') errors.push({ field: `connections[${i}].from`, message: 'from is required and must be a string.' });
          if (!c.to || typeof c.to !== 'string') errors.push({ field: `connections[${i}].to`, message: 'to is required and must be a string.' });
        });
        if (new Set(ids).size !== ids.length) errors.push({ field: 'connections', message: 'connection ids must be unique.' });
      }
      return errors;
    }
  },
  circuit_parallel: {
    label: 'Parallel Circuit',
    validate(config) {
      const errors = [];
      if (!config || typeof config !== 'object') return [{ field: 'config', message: 'config must be an object.' }];
      if (typeof config.voltage !== 'number' || config.voltage <= 0) {
        errors.push({ field: 'voltage', message: 'voltage is required and must be a positive number.' });
      }
      if (!Array.isArray(config.branches) || config.branches.length < 2) {
        errors.push({ field: 'branches', message: 'branches must be an array with at least 2 branches.' });
      } else {
        const branchIds = [];
        config.branches.forEach((b, i) => {
          if (!b || typeof b !== 'object') { errors.push({ field: `branches[${i}]`, message: 'Each branch must be an object.' }); return; }
          if (!b.id || typeof b.id !== 'string') errors.push({ field: `branches[${i}].id`, message: 'id is required and must be a string.' });
          else branchIds.push(b.id);
          if (!b.label || typeof b.label !== 'string') errors.push({ field: `branches[${i}].label`, message: 'label is required and must be a string.' });
          if (typeof b.resistance !== 'number' || b.resistance <= 0) {
            errors.push({ field: `branches[${i}].resistance`, message: 'resistance is required and must be a positive number.' });
          }
          if (!Array.isArray(b.connections) || b.connections.length !== 2) {
            errors.push({ field: `branches[${i}].connections`, message: 'Each branch needs exactly 2 connections.' });
          } else {
            b.connections.forEach((c, j) => {
              if (!c || typeof c !== 'object' || !c.id || !c.from || !c.to) {
                errors.push({ field: `branches[${i}].connections[${j}]`, message: 'Each connection needs id, from, and to.' });
              }
            });
          }
        });
        if (new Set(branchIds).size !== branchIds.length) errors.push({ field: 'branches', message: 'branch ids must be unique.' });
      }
      return errors;
    }
  }
};

function validateExperimentDefinition(type, config) {
  const spec = SUPPORTED_LAB_TYPES[type];
  if (!spec) {
    return {
      valid: false,
      errors: [{ field: 'type', message: `"${type}" isn't a supported experiment type yet. Supported types: ${Object.keys(SUPPORTED_LAB_TYPES).join(', ')}.` }]
    };
  }
  const errors = spec.validate(config);
  return { valid: errors.length === 0, errors };
}

router.get('/supported-types', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  res.json({ types: Object.entries(SUPPORTED_LAB_TYPES).map(([type, spec]) => ({ type, label: spec.label })) });
}));

router.post('/experiments/validate', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const { type, config } = req.body || {};
  if (!type) return res.status(400).json({ valid: false, errors: [{ field: 'type', message: 'type is required.' }] });
  let parsedConfig;
  try { parsedConfig = typeof config === 'string' ? JSON.parse(config) : config; }
  catch (e) { return res.json({ valid: false, errors: [{ field: 'config', message: 'config must be valid JSON.' }] }); }
  res.json(validateExperimentDefinition(type, parsedConfig));
}));

// ============================================================
// Admin/Staff: experiment catalog management (labs.view / labs.manage)
// ============================================================

router.get('/experiments', asyncHandler(async (req, res) => {
  if (req.user.role !== 'teacher' && !(await userHasPermission(req, 'labs.view')) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have permission to view the Virtual Lab catalog.' });
  }

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

  const { valid, errors: fieldErrors } = validateExperimentDefinition(type, parsedConfig);
  if (!valid) return res.status(400).json({ error: 'Config failed validation.', fieldErrors });

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
    const { valid, errors: fieldErrors } = validateExperimentDefinition(exp.type, parsedConfig);
    if (!valid) return res.status(400).json({ error: 'Config failed validation.', fieldErrors });
    const newVersion = exp.current_version + 1;
    await run('INSERT INTO lab_experiment_versions (experiment_id, version_number, config) VALUES ($1,$2,$3)', [id, newVersion, JSON.stringify(parsedConfig)]);
    await run('UPDATE lab_experiments SET current_version = $1 WHERE id = $2', [newVersion, id]);
  }
  res.json({ message: 'Experiment updated.' });
}));

// Shared by publish/approve — never let an experiment reach "published"
// without re-checking its *current* saved config, since validation didn't
// always exist (older drafts/edits could predate this check).
async function assertCurrentConfigValid(exp) {
  const version = await get('SELECT config FROM lab_experiment_versions WHERE experiment_id = $1 AND version_number = $2', [exp.id, exp.current_version]);
  if (!version) return { valid: false, errors: [{ field: 'config', message: 'This experiment has no saved config to publish.' }] };
  return validateExperimentDefinition(exp.type, version.config);
}

router.post('/experiments/:id/publish', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  const { valid, errors: fieldErrors } = await assertCurrentConfigValid(exp);
  if (!valid) return res.status(400).json({ error: 'This experiment\'s config fails validation and cannot be published.', fieldErrors });
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

router.post('/experiments/:id/submit-review', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  if (exp.status !== 'draft') return res.status(400).json({ error: 'Only a draft experiment can be submitted for review.' });
  const { valid, errors: fieldErrors } = await assertCurrentConfigValid(exp);
  if (!valid) return res.status(400).json({ error: 'This experiment\'s config fails validation and cannot be submitted for review.', fieldErrors });
  await run("UPDATE lab_experiments SET status = 'submitted_for_review' WHERE id = $1", [id]);
  res.json({ message: `"${exp.title}" submitted for review.` });
}));

router.post('/experiments/:id/approve', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  if (exp.status !== 'submitted_for_review') return res.status(400).json({ error: 'Only an experiment submitted for review can be approved.' });
  const { valid, errors: fieldErrors } = await assertCurrentConfigValid(exp);
  if (!valid) return res.status(400).json({ error: 'This experiment\'s config fails validation and cannot be approved.', fieldErrors });
  await run("UPDATE lab_experiments SET status = 'published' WHERE id = $1", [id]);
  res.json({ message: `"${exp.title}" approved and published.` });
}));

router.post('/experiments/:id/archive', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  if (exp.status === 'archived') return res.status(400).json({ error: 'This experiment is already archived.' });
  await run("UPDATE lab_experiments SET status = 'archived' WHERE id = $1", [id]);
  res.json({ message: `"${exp.title}" archived.` });
}));

router.post('/experiments/:id/restore', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  if (exp.status !== 'archived') return res.status(400).json({ error: 'Only an archived experiment can be restored.' });
  await run("UPDATE lab_experiments SET status = 'draft' WHERE id = $1", [id]);
  res.json({ message: `"${exp.title}" restored to draft.` });
}));

// ============================================================
// Staff/Teacher: preview mode — the same play interface a student sees,
// used to test-play an experiment (any status, including draft) before it
// ever reaches a student. Separate attempt rows (is_preview=true,
// student_id NULL) so previewing never pollutes real student data or
// results dashboards.
// ============================================================

router.post('/experiments/:id/preview-attempt', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exp = await get('SELECT * FROM lab_experiments WHERE id = $1', [id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  const version = await get('SELECT * FROM lab_experiment_versions WHERE experiment_id = $1 AND version_number = $2', [exp.id, exp.current_version]);
  if (!version) return res.status(400).json({ error: 'This experiment has no saved config to preview.' });
  const { mode } = req.body || {};
  const effectiveMode = mode === 'guided' ? 'guided' : 'challenge';
  const attempt = await get(
    `INSERT INTO lab_attempts (experiment_id, experiment_version_id, student_id, mode, is_preview, previewed_by_user_id)
     VALUES ($1,$2,NULL,$3,true,$4) RETURNING id`,
    [exp.id, version.id, effectiveMode, req.user.id]
  );
  res.status(201).json({ attemptId: attempt.id, experimentType: exp.type, config: version.config, mode: effectiveMode, isPreview: true });
}));

router.post('/attempts/:id/preview-complete', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.id);
  const attempt = await get('SELECT * FROM lab_attempts WHERE id = $1 AND is_preview = true AND previewed_by_user_id = $2', [attemptId, req.user.id]);
  if (!attempt) return res.status(404).json({ error: 'Preview attempt not found.' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'This preview has already ended.' });
  const score = Math.max(5, 100 - Math.min(80, attempt.mistakes_count * 15) - Math.min(15, attempt.hints_used * 5));
  await run("UPDATE lab_attempts SET status = 'completed', score = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2", [score, attemptId]);
  res.json({ message: 'Preview completed.', score });
}));

router.post('/attempts/:id/preview-abandon', requirePermission('labs.manage'), asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.id);
  const attempt = await get('SELECT * FROM lab_attempts WHERE id = $1 AND is_preview = true AND previewed_by_user_id = $2', [attemptId, req.user.id]);
  if (!attempt) return res.status(404).json({ error: 'Preview attempt not found.' });
  if (attempt.status === 'in_progress') await run("UPDATE lab_attempts SET status = 'abandoned' WHERE id = $1", [attemptId]);
  res.json({ message: 'OK' });
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
  const { experiment_id, mode, assignment_id } = req.body || {};

  let assignment = null;
  if (assignment_id) {
    assignment = await get('SELECT * FROM lab_assignments WHERE id = $1', [Number(assignment_id)]);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    // A student can only attempt an assignment given to their own section —
    // never trust a client-supplied assignment_id without checking this.
    if (assignment.section_code !== student.section_code) {
      return res.status(403).json({ error: 'This assignment was not given to your section.' });
    }
    if (assignment.due_at && new Date(assignment.due_at) < new Date()) {
      return res.status(400).json({ error: 'This assignment is overdue and no longer accepts new attempts.' });
    }
    if (assignment.attempt_limit !== null) {
      const countRow = await get('SELECT COUNT(*) AS c FROM lab_attempts WHERE assignment_id = $1 AND student_id = $2', [assignment.id, student.id]);
      if (Number(countRow.c) >= assignment.attempt_limit) {
        return res.status(400).json({ error: `You've used all ${assignment.attempt_limit} attempt${assignment.attempt_limit === 1 ? '' : 's'} allowed for this assignment.` });
      }
    }
  }

  const exp = await get("SELECT * FROM lab_experiments WHERE id = $1 AND status = 'published'", [assignment ? assignment.experiment_id : experiment_id]);
  if (!exp) return res.status(404).json({ error: 'Experiment not found.' });
  // Assignment-linked attempts are pinned to the version that existed when
  // the assignment was created — never the experiment's current version —
  // so a later edit to the experiment can't retroactively change what an
  // already-assigned attempt is scored against.
  const version = assignment
    ? await get('SELECT * FROM lab_experiment_versions WHERE id = $1', [assignment.experiment_version_id])
    : await get('SELECT * FROM lab_experiment_versions WHERE experiment_id = $1 AND version_number = $2', [exp.id, exp.current_version]);
  // A teacher-set assignment mode is enforced regardless of what the client
  // sends — a student can't turn a Challenge assignment into Guided.
  const effectiveMode = assignment ? assignment.mode : (mode === 'guided' ? 'guided' : 'challenge');

  const attempt = await get(
    'INSERT INTO lab_attempts (experiment_id, experiment_version_id, student_id, mode, assignment_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [exp.id, version.id, student.id, effectiveMode, assignment ? assignment.id : null]
  );
  res.status(201).json({ attemptId: attempt.id, experimentType: exp.type, config: version.config, mode: effectiveMode });
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
  const attemptId = Number(req.params.id);
  const student = await getStudent(req);
  // Same endpoint serves two owners: a student logging events on their own
  // real attempt, or a staff/teacher previewer logging events on their own
  // preview attempt — the renderer code calls this identically either way,
  // so the distinction is made here rather than by branching the frontend.
  let attempt = student ? await get('SELECT * FROM lab_attempts WHERE id = $1 AND student_id = $2', [attemptId, student.id]) : null;
  if (!attempt) {
    attempt = await get('SELECT * FROM lab_attempts WHERE id = $1 AND is_preview = true AND previewed_by_user_id = $2', [attemptId, req.user.id]);
  }
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

// ============================================================
// Teacher assignments (also usable by staff/admin with labs.manage)
// ============================================================

router.post('/assignments', asyncHandler(async (req, res) => {
  if (!(await canManageLabAssignments(req))) return res.status(403).json({ error: 'You do not have permission to assign Virtual Lab experiments.' });
  const teacher = await getTeacher(req);
  const { experiment_id, section_code, mode, due_at, attempt_limit, instructions } = req.body || {};
  if (!experiment_id || !section_code) return res.status(400).json({ error: 'experiment_id and section_code are required.' });

  const exp = await get("SELECT * FROM lab_experiments WHERE id = $1 AND status = 'published'", [experiment_id]);
  if (!exp) return res.status(400).json({ error: 'That experiment does not exist or is not published.' });
  const section = await get('SELECT section_code FROM sections WHERE section_code = $1', [section_code]);
  if (!section) return res.status(400).json({ error: `Section "${section_code}" doesn't exist.` });
  if (attempt_limit !== undefined && attempt_limit !== null && (!Number.isInteger(attempt_limit) || attempt_limit < 1)) {
    return res.status(400).json({ error: 'attempt_limit must be a positive whole number, or omitted for unlimited.' });
  }

  // Pinned to the experiment's version *right now* — editing the experiment
  // later never changes what this assignment (or attempts against it) means.
  const version = await get('SELECT id FROM lab_experiment_versions WHERE experiment_id = $1 AND version_number = $2', [exp.id, exp.current_version]);
  const assignment = await get(
    `INSERT INTO lab_assignments (experiment_id, experiment_version_id, teacher_id, created_by_user_id, section_code, mode, due_at, attempt_limit, instructions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [exp.id, version.id, teacher ? teacher.id : null, req.user.id, section_code, mode === 'guided' ? 'guided' : 'challenge', due_at || null, attempt_limit || null, instructions || null]
  );
  res.status(201).json({ message: `"${exp.title}" assigned to Section ${section_code}.`, assignmentId: assignment.id });
}));

router.get('/assignments', asyncHandler(async (req, res) => {
  if (!(await canManageLabAssignments(req))) return res.status(403).json({ error: 'You do not have permission to view Virtual Lab assignments.' });
  const teacher = await getTeacher(req);
  // A teacher sees only their own assignments; staff/admin with labs.manage see all.
  const rows = await all(
    `SELECT la.*, e.title AS experiment_title, e.subject,
            (SELECT COUNT(DISTINCT student_id) FROM lab_attempts WHERE assignment_id = la.id) AS students_attempted,
            (SELECT COUNT(DISTINCT student_id) FROM lab_attempts WHERE assignment_id = la.id AND status = 'completed') AS students_completed
     FROM lab_assignments la JOIN lab_experiments e ON e.id = la.experiment_id
     ${teacher ? 'WHERE la.teacher_id = $1' : ''}
     ORDER BY la.created_at DESC`,
    teacher ? [teacher.id] : []
  );
  res.json({ assignments: rows.map(r => ({
    id: r.id, experimentTitle: r.experiment_title, subject: r.subject, sectionCode: r.section_code,
    mode: r.mode, dueAt: r.due_at, attemptLimit: r.attempt_limit, instructions: r.instructions,
    studentsAttempted: Number(r.students_attempted), studentsCompleted: Number(r.students_completed)
  })) });
}));

router.get('/assignments/:id/results', asyncHandler(async (req, res) => {
  if (!(await canManageLabAssignments(req))) return res.status(403).json({ error: 'You do not have permission to view Virtual Lab results.' });
  const assignmentId = Number(req.params.id);
  const assignment = await get(
    `SELECT la.*, e.title AS experiment_title FROM lab_assignments la JOIN lab_experiments e ON e.id = la.experiment_id WHERE la.id = $1`,
    [assignmentId]
  );
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const teacher = await getTeacher(req);
  if (teacher && assignment.teacher_id !== teacher.id) return res.status(403).json({ error: 'This assignment belongs to a different teacher.' });

  const students = await all('SELECT id, first_name, last_name FROM students WHERE section_code = $1 ORDER BY last_name', [assignment.section_code]);
  const attemptRows = await all(
    `SELECT student_id, status, score, mistakes_count, hints_used, started_at, completed_at
     FROM lab_attempts WHERE assignment_id = $1 ORDER BY started_at DESC`,
    [assignmentId]
  );
  const byStudent = new Map();
  attemptRows.forEach(a => {
    if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, []);
    byStudent.get(a.student_id).push(a);
  });

  const now = new Date();
  const overdue = assignment.due_at && new Date(assignment.due_at) < now;
  const results = students.map(s => {
    const attempts = byStudent.get(s.id) || [];
    const completed = attempts.find(a => a.status === 'completed');
    const best = attempts.reduce((max, a) => (a.score !== null && (max === null || a.score > max) ? a.score : max), null);
    let status = 'not_started';
    if (completed) status = 'completed';
    else if (attempts.length > 0 && attempts[0].status === 'in_progress') status = 'in_progress';
    else if (overdue && attempts.length === 0) status = 'overdue';
    else if (assignment.attempt_limit && attempts.length >= assignment.attempt_limit && !completed) status = 'locked';
    return {
      studentId: s.id, studentName: `${s.first_name} ${s.last_name}`, status,
      attemptsUsed: attempts.length, bestScore: best,
      mistakes: attempts.reduce((sum, a) => sum + a.mistakes_count, 0),
      hints: attempts.reduce((sum, a) => sum + a.hints_used, 0),
      lastActivity: attempts[0] ? (attempts[0].completed_at || attempts[0].started_at) : null
    };
  });

  res.json({ assignment: { id: assignment.id, experimentTitle: assignment.experiment_title, sectionCode: assignment.section_code, dueAt: assignment.due_at, attemptLimit: assignment.attempt_limit, mode: assignment.mode }, results });
}));

router.get('/assignments/:id/results/:studentId', asyncHandler(async (req, res) => {
  if (!(await canManageLabAssignments(req))) return res.status(403).json({ error: 'You do not have permission to view Virtual Lab results.' });
  const assignmentId = Number(req.params.id);
  const studentId = Number(req.params.studentId);
  const assignment = await get('SELECT * FROM lab_assignments WHERE id = $1', [assignmentId]);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  const teacher = await getTeacher(req);
  if (teacher && assignment.teacher_id !== teacher.id) return res.status(403).json({ error: 'This assignment belongs to a different teacher.' });

  const attempts = await all(
    'SELECT * FROM lab_attempts WHERE assignment_id = $1 AND student_id = $2 ORDER BY started_at DESC',
    [assignmentId, studentId]
  );
  const events = attempts.length
    ? await all('SELECT event_type, detail, created_at FROM lab_attempt_events WHERE attempt_id = $1 ORDER BY created_at ASC', [attempts[0].id])
    : [];
  res.json({
    attempts: attempts.map(a => ({ id: a.id, status: a.status, score: a.score, mistakesCount: a.mistakes_count, hintsUsed: a.hints_used, startedAt: a.started_at, completedAt: a.completed_at })),
    events: events.map(e => ({ eventType: e.event_type, detail: e.detail, createdAt: e.created_at }))
  });
}));

router.get('/my-assignments', asyncHandler(async (req, res) => {
  const student = await getStudent(req);
  if (!student) return res.status(403).json({ error: 'Only students can view their assigned labs.' });

  const rows = await all(
    `SELECT la.*, e.title AS experiment_title, e.subject,
            t.first_name AS teacher_first, t.last_name AS teacher_last
     FROM lab_assignments la
     JOIN lab_experiments e ON e.id = la.experiment_id
     LEFT JOIN teachers t ON t.id = la.teacher_id
     WHERE la.section_code = $1 ORDER BY la.due_at NULLS LAST, la.created_at DESC`,
    [student.section_code]
  );

  const now = new Date();
  const results = [];
  for (const r of rows) {
    const attempts = await all('SELECT status, score FROM lab_attempts WHERE assignment_id = $1 AND student_id = $2 ORDER BY started_at DESC', [r.id, student.id]);
    const completed = attempts.find(a => a.status === 'completed');
    const best = attempts.reduce((max, a) => (a.score !== null && (max === null || a.score > max) ? a.score : max), null);
    const overdue = r.due_at && new Date(r.due_at) < now;
    let status = 'not_started';
    if (completed) status = 'completed';
    else if (attempts.length > 0 && attempts[0].status === 'in_progress') status = 'in_progress';
    else if (r.attempt_limit && attempts.length >= r.attempt_limit) status = 'locked';
    else if (overdue) status = 'overdue';
    results.push({
      id: r.id, experimentId: r.experiment_id, experimentTitle: r.experiment_title, subject: r.subject,
      teacherName: r.teacher_first ? `${r.teacher_first} ${r.teacher_last}` : null,
      mode: r.mode, dueAt: r.due_at, attemptLimit: r.attempt_limit, instructions: r.instructions,
      attemptsUsed: attempts.length, bestScore: best, status
    });
  }
  res.json({ assignments: results });
}));

module.exports = router;
