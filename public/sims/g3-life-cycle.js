(function () {
  const { svg, setup, toggle, buttons, readout, loop } = Sim;
  const { stage, controls } = setup({ title: 'Life cycles', grade: 3, subject: 'General Science',
    intro: 'Pick a living thing and step through its life cycle.',
    notice: ['A life cycle is the stages a living thing goes through as it grows.', 'At the end it makes new young, and the cycle starts again.', 'Grow a bean in a jar and record its stages.'] });
  const C = {
    butterfly: [['🥚', 'egg', 'A butterfly lays tiny eggs on a leaf.'], ['🐛', 'caterpillar', 'The caterpillar eats leaves and grows.'], ['🫘', 'pupa', 'It makes a case and changes inside.'], ['🦋', 'butterfly', 'An adult butterfly comes out and lays eggs.']],
    plant: [['🌰', 'seed', 'A seed in the soil takes in water.'], ['🌱', 'seedling', 'A root goes down and a shoot comes up.'], ['🌿', 'plant', 'The plant grows leaves and makes food.'], ['🌼', 'flower', 'Flowers make new seeds.']],
    hen: [['🥚', 'egg', 'A hen sits on her egg to keep it warm.'], ['🐣', 'chick', 'A chick hatches out of the egg.'], ['🐥', 'young bird', 'The chick grows feathers.'], ['🐔', 'hen', 'The adult hen lays eggs.']],
  };
  const W = 520, H = 420, c = 260, cy = 210; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let k = 'butterfly', s = 0, t = 0;
  const rd = readout(controls, [['n', 'Stage'], ['d', 'What happens']]);
  toggle(controls, ['Butterfly', 'Plant', 'Hen'], (i) => { k = ['butterfly', 'plant', 'hen'][i]; s = 0; });
  buttons(controls, [{ label: 'Next stage →', primary: true, onClick: () => { s = (s + 1) % 4; t = 0; } }]);
  loop((dt) => {
    t = Math.min(1, t + dt * 2); while (root.firstChild) root.removeChild(root.firstChild);
    svg('circle', { cx: c, cy, r: 150, fill: 'none', stroke: '#CBD5E1', 'stroke-width': 4, 'stroke-dasharray': '10 10' }, root);
    C[k].forEach((st, i) => { const a = i / 4 * 2 * Math.PI - Math.PI / 2, x = c + 150 * Math.cos(a), y = cy + 150 * Math.sin(a); const on = i === s;
      svg('circle', { cx: x, cy: y, r: on ? 52 : 40, fill: on ? '#DBEAFE' : '#fff', stroke: on ? '#1D5FD1' : '#CBD5E1', 'stroke-width': 3 }, root);
      svg('text', { x, y: y + (on ? 16 : 12), 'text-anchor': 'middle', 'font-size': on ? 46 * (0.6 + 0.4 * t) : 32 }, root, st[0]);
      svg('text', { x, y: y + (on ? 74 : 58), 'text-anchor': 'middle', 'font-size': 15, 'font-weight': on ? 700 : 400 }, root, st[1]); });
    rd.set('n', `${s + 1} of 4 · ${C[k][s][1]}`); rd.set('d', C[k][s][2]);
  });
})();
