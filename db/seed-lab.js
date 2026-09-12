const { get, run } = require('./index');

// Seeds exactly one real starter Virtual Lab experiment so the catalog
// isn't empty on first deploy — idempotent (ON CONFLICT DO NOTHING), safe
// to run on every boot alongside seedPermissions(). Admins/staff with
// labs.manage can create further experiments for real through the app;
// this is just enough real content to prove the engine end-to-end.
async function seedLabExperiments() {
  const existing = await get('SELECT id FROM lab_experiments WHERE slug = $1', ['series-circuit-basics']);
  if (existing) return;

  const config = {
    voltage: 9,
    resistance: 3,
    connections: [
      { id: 'battery-switch', from: 'Battery', to: 'Switch' },
      { id: 'switch-bulb', from: 'Switch', to: 'Bulb' },
      { id: 'bulb-battery', from: 'Bulb', to: 'Battery' }
    ]
  };

  const exp = await get(
    `INSERT INTO lab_experiments
       (slug, type, title, subject, curriculum, grade, topic, objective, learn_points,
        equipment_summary, safety_info, background_theory, instructions, estimated_minutes, difficulty, status, current_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'published',1)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [
      'series-circuit-basics', 'circuit', 'Building a Simple Series Circuit',
      'Physics', 'Pakistani SNC', 'Grade 7', 'Electricity',
      'Build a complete series circuit and understand how current, voltage, and resistance relate through Ohm\'s law.',
      'A circuit must form a complete loop for current to flow. Ohm\'s law (I = V/R) lets you calculate the current once a circuit is complete.',
      'A 9V battery, a switch, a light bulb, and connecting wires.',
      'This is a virtual simulation — no real electrical components are involved.',
      'A series circuit has only one path for current to flow. Every component must be connected in a single loop, and the switch must be closed, for current to flow and the bulb to light.',
      'Connect the battery, switch, and bulb into a complete loop using the three wire segments, then close the switch. Once the circuit is complete, check your reading on the ammeter.',
      10, 'beginner'
    ]
  );
  if (exp) {
    await run('INSERT INTO lab_experiment_versions (experiment_id, version_number, config) VALUES ($1,1,$2)', [exp.id, JSON.stringify(config)]);
    console.log('[server] Seeded starter Virtual Lab experiment: Building a Simple Series Circuit');
  }
}

module.exports = { seedLabExperiments };
