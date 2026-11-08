(function () {
  const { svg, setup, slider, toggle, readout, buttons, msg } = Sim;
  const { stage, controls } = setup({ title: 'Telling the time', grade: 2, subject: 'Mathematics',
    intro: 'Move the slider to turn the clock in 5-minute steps. Then try the challenge.',
    notice: ['The short hand shows the hour; the long hand shows the minutes.', 'Each number on the clock is 5 minutes for the long hand.', 'a.m. is from midnight to midday; p.m. is from midday to midnight.'] });
  const W = 400, H = 400, c = 200; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let mins = 9 * 60 + 15, pm = false, goal = null;
  const rd = readout(controls, [['t', 'Time']]); const m = msg(controls);
  const sl = slider(controls, { label: 'Turn the clock', min: 0, max: 143, value: 111, format: () => '', onInput: (v) => { mins = (v * 5) % 720; draw(); } });
  toggle(controls, ['a.m.', 'p.m.'], (k) => { pm = k === 1; draw(); });
  buttons(controls, [{ label: 'Give me a challenge', primary: true, onClick: () => { goal = (Math.floor(Math.random() * 12) * 60 + Math.floor(Math.random() * 12) * 5); m.show('Show ' + fmt(goal) + ' on the clock.'); } }]);
  svg('circle', { cx: c, cy: c, r: 180, fill: '#fff', stroke: '#1E3A8A', 'stroke-width': 8 }, root);
  for (let i = 1; i <= 12; i++) { const a = i / 12 * 2 * Math.PI; svg('text', { x: c + 145 * Math.sin(a), y: c - 145 * Math.cos(a) + 9, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700 }, root, String(i)); }
  for (let i = 0; i < 60; i++) { const a = i / 60 * 2 * Math.PI, r1 = i % 5 ? 170 : 162; svg('line', { x1: c + r1 * Math.sin(a), y1: c - r1 * Math.cos(a), x2: c + 176 * Math.sin(a), y2: c - 176 * Math.cos(a), stroke: '#334155', 'stroke-width': i % 5 ? 1 : 3 }, root); }
  const hh = svg('line', { x1: c, y1: c, stroke: '#0F172A', 'stroke-width': 10, 'stroke-linecap': 'round' }, root), mh = svg('line', { x1: c, y1: c, stroke: '#2563EB', 'stroke-width': 6, 'stroke-linecap': 'round' }, root); svg('circle', { cx: c, cy: c, r: 9, fill: '#0F172A' }, root);
  function fmt(x) { const h = Math.floor(x / 60) % 12 || 12, mm = x % 60; return `${h}:${String(mm).padStart(2, '0')}`; }
  function draw() {
    const ma = (mins % 60) / 60 * 2 * Math.PI, ha = ((mins / 60) % 12) / 12 * 2 * Math.PI;
    mh.setAttribute('x2', c + 135 * Math.sin(ma)); mh.setAttribute('y2', c - 135 * Math.cos(ma)); hh.setAttribute('x2', c + 90 * Math.sin(ha)); hh.setAttribute('y2', c - 90 * Math.cos(ha));
    rd.set('t', fmt(mins) + (pm ? ' p.m.' : ' a.m.'));
    if (goal !== null && mins % 720 === goal) { m.show('Well done! That is ' + fmt(goal) + '.', true); goal = null; }
  }
  void sl; draw();
})();
