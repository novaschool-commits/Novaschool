(function () {
  const { svg, setup, slider, toggle, buttons, readout, loop } = Sim;
  const { stage, controls } = setup({ title: 'Frog hops: adding and taking away', grade: 1, subject: 'Mathematics',
    intro: 'Choose a starting number and how many hops. The frog hops forward to add, or back to take away.',
    notice: ['Adding means hopping forward on the number line.', 'Taking away means hopping back.', 'Count each hop out loud.'] });
  const W = 600, H = 220; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let a = 6, b = 5, sub = false, pos = 6, target = 6, hopT = 1;
  const rd = readout(controls, [['s', 'Sum']]);
  toggle(controls, ['Add +', 'Take away −'], (k) => { sub = k === 1; reset(); });
  slider(controls, { label: 'Start at', min: 0, max: 20, value: 6, onInput: (v) => { a = v; reset(); } });
  slider(controls, { label: 'Hops', min: 0, max: 10, value: 5, onInput: (v) => { b = v; reset(); } });
  buttons(controls, [{ label: 'Hop!', primary: true, onClick: () => { pos = a; target = Math.max(0, Math.min(20, sub ? a - b : a + b)); hopT = 0; } }]);
  const X = (v) => 25 + v * 27.5;
  const line = svg('g', {}, root); svg('line', { x1: 15, y1: 160, x2: 585, y2: 160, stroke: '#0F172A', 'stroke-width': 3 }, line);
  for (let i = 0; i <= 20; i++) { svg('line', { x1: X(i), y1: 150, x2: X(i), y2: 170, stroke: '#0F172A', 'stroke-width': 2 }, line); svg('text', { x: X(i), y: 195, 'text-anchor': 'middle', 'font-size': 15 }, line, String(i)); }
  const trail = svg('g', {}, root);
  const frog = svg('g', {}, root); svg('ellipse', { cx: 0, cy: 0, rx: 16, ry: 12, fill: '#22C55E', stroke: '#15803D', 'stroke-width': 2 }, frog); svg('circle', { cx: -6, cy: -10, r: 4, fill: '#fff' }, frog); svg('circle', { cx: 6, cy: -10, r: 4, fill: '#fff' }, frog);
  function reset() { pos = a; target = a; hopT = 1; while (trail.firstChild) trail.removeChild(trail.firstChild); }
  loop((dt) => {
    let x = X(pos), y = 135;
    if (pos !== target) { hopT += dt * 2.5; const dir = target > pos ? 1 : -1; if (hopT >= 1) { svg('path', { d: `M${X(pos)},150 Q${X(pos + dir / 2)},95 ${X(pos + dir)},150`, fill: 'none', stroke: '#16A34A', 'stroke-width': 2, 'stroke-dasharray': '4 4' }, trail); pos += dir; hopT = 0; } else { x = X(pos + dir * hopT); y = 135 - Math.sin(hopT * Math.PI) * 45; } }
    frog.setAttribute('transform', `translate(${x},${y})`);
    const res = Math.max(0, Math.min(20, sub ? a - b : a + b));
    rd.set('s', `${a} ${sub ? '−' : '+'} ${b} = ${pos === target && target === res ? res : '?'}`);
  });
})();
