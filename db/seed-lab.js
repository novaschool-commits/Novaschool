const { get, run } = require('./index');

// Seeds real starter Virtual Lab experiments so the catalog isn't empty on
// first deploy — idempotent per-experiment (ON CONFLICT DO NOTHING), safe
// to run on every boot alongside seedPermissions(). Each experiment is
// checked independently so adding a new one here doesn't get skipped just
// because an earlier one already exists. Admins/staff with labs.manage can
// create further experiments for real through the app; this just seeds
// enough real content to prove the engine end-to-end.

async function seedExperiment({ slug, type, title, subject, curriculum, grade, topic, objective, learnPoints, equipmentSummary, safetyInfo, backgroundTheory, instructions, estimatedMinutes, difficulty, config }) {
  const existing = await get('SELECT id FROM lab_experiments WHERE slug = $1', [slug]);
  if (existing) return;

  const exp = await get(
    `INSERT INTO lab_experiments
       (slug, type, title, subject, curriculum, grade, topic, objective, learn_points,
        equipment_summary, safety_info, background_theory, instructions, estimated_minutes, difficulty, status, current_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'published',1)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [slug, type, title, subject, curriculum, grade, topic, objective, learnPoints, equipmentSummary, safetyInfo, backgroundTheory, instructions, estimatedMinutes, difficulty]
  );
  if (exp) {
    await run('INSERT INTO lab_experiment_versions (experiment_id, version_number, config) VALUES ($1,1,$2)', [exp.id, JSON.stringify(config)]);
    console.log(`[server] Seeded starter Virtual Lab experiment: ${title}`);
  }
}

async function seedLabExperiments() {
  await seedExperiment({
    slug: 'series-circuit-basics', type: 'circuit', title: 'Building a Simple Series Circuit',
    subject: 'Physics', curriculum: 'Pakistani SNC', grade: 'Grade 7', topic: 'Electricity',
    objective: 'Build a complete series circuit and understand how current, voltage, and resistance relate through Ohm\'s law.',
    learnPoints: 'A circuit must form a complete loop for current to flow. Ohm\'s law (I = V/R) lets you calculate the current once a circuit is complete.',
    equipmentSummary: 'A 9V battery, a switch, a light bulb, and connecting wires.',
    safetyInfo: 'This is a virtual simulation — no real electrical components are involved.',
    backgroundTheory: 'A series circuit has only one path for current to flow. Every component must be connected in a single loop, and the switch must be closed, for current to flow and the bulb to light.',
    instructions: 'Connect the battery, switch, and bulb into a complete loop using the three wire segments, then close the switch. Once the circuit is complete, check your reading on the ammeter.',
    estimatedMinutes: 10, difficulty: 'beginner',
    config: {
      voltage: 9, resistance: 3,
      connections: [
        { id: 'battery-switch', from: 'Battery', to: 'Switch' },
        { id: 'switch-bulb', from: 'Switch', to: 'Bulb' },
        { id: 'bulb-battery', from: 'Bulb', to: 'Battery' }
      ]
    }
  });

  await seedExperiment({
    slug: 'parallel-circuit-basics', type: 'circuit_parallel', title: 'Building a Parallel Circuit',
    subject: 'Physics', curriculum: 'Pakistani SNC', grade: 'Grade 8', topic: 'Electricity',
    objective: 'Build a parallel circuit and observe how current divides independently between branches.',
    learnPoints: 'In a parallel circuit, each branch has its own complete path. Voltage is the same across every branch, but current divides based on each branch\'s resistance — and disconnecting one branch doesn\'t stop current in the others, unlike a series circuit.',
    equipmentSummary: 'A 9V battery, a switch, two light bulbs of different resistance, and connecting wires.',
    safetyInfo: 'This is a virtual simulation — no real electrical components are involved.',
    backgroundTheory: 'A parallel circuit has more than one path for current to flow. Each branch is wired independently between the same two points, so every branch experiences the same voltage but can carry a different current depending on its own resistance.',
    instructions: 'Connect each branch\'s two wire segments to complete that branch, then close the switch. Try connecting only one branch first and see what happens to the other bulb — then complete both branches and check your circuit.',
    estimatedMinutes: 12, difficulty: 'intermediate',
    config: {
      voltage: 9,
      branches: [
        { id: 'branch1', label: 'Bulb 1', resistance: 6, connections: [{ id: 'b1-wire1', from: 'Battery', to: 'Bulb 1' }, { id: 'b1-wire2', from: 'Bulb 1', to: 'Battery' }] },
        { id: 'branch2', label: 'Bulb 2', resistance: 3, connections: [{ id: 'b2-wire1', from: 'Battery', to: 'Bulb 2' }, { id: 'b2-wire2', from: 'Bulb 2', to: 'Battery' }] }
      ]
    }
  });
}

module.exports = { seedLabExperiments };
