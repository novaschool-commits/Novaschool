(function () {
  const { svg, setup, slider, readout } = Sim;
  const { stage, controls } = setup({ title: 'Pythagoras: squares on the sides', grade: 8, subject: 'Mathematics',
    intro: 'Change the two shorter sides of the right-angled triangle. Compare the areas of the squares.',
    notice: ['The two smaller squares together have the same area as the big square: a² + b² = c².', 'c, the hypotenuse, is the longest side, opposite the right angle.', 'Try 3 and 4, then 5 and 12: whole-number triples.'] });
  const W = 600, H = 560; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let a = 3, b = 4;
  const rd = readout(controls, [['a', 'a²'], ['b', 'b²'], ['s', 'a² + b²'], ['c', 'c']]);
  slider(controls, { label: 'a', min: 1, max: 12, value: 3, onInput: (v) => { a = v; draw(); } });
  slider(controls, { label: 'b', min: 1, max: 12, value: 4, onInput: (v) => { b = v; draw(); } });
  const sq = (pts, fill, label, lx, ly) => { svg('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill, stroke: '#0F172A', 'stroke-width': 2, opacity: 0.85 }, root); svg('text', { x: lx, y: ly, 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle' }, root, label); };
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    const s = Math.min(170 / Math.max(a, b), 300 / (a + b)); const A = a * s, B = b * s;
    const ox = 230, oy = 330; // right angle at (ox, oy); a goes up, b goes right
    const P = [ox, oy], Q = [ox, oy - A], R = [ox + B, oy];
    sq([P, Q, [ox - A, oy - A], [ox - A, oy]], '#FDE68A', `a² = ${a * a}`, ox - A / 2, oy - A / 2 + 5);
    sq([P, R, [ox + B, oy + B], [ox, oy + B]], '#BFDBFE', `b² = ${b * b}`, ox + B / 2, oy + B / 2 + 5);
    const dx = R[0] - Q[0], dy = R[1] - Q[1];
    sq([Q, R, [R[0] + dy, R[1] - dx], [Q[0] + dy, Q[1] - dx]], '#BBF7D0', `c² = ${a * a + b * b}`, (Q[0] + R[0]) / 2 + dy / 2, (Q[1] + R[1]) / 2 - dx / 2 + 5);
    svg('polygon', { points: [P, Q, R].map((p) => p.join(',')).join(' '), fill: '#fff', stroke: '#DC2626', 'stroke-width': 3 }, root);
    svg('rect', { x: ox, y: oy - 14, width: 14, height: 14, fill: 'none', stroke: '#DC2626', 'stroke-width': 2 }, root);
    const c = Math.sqrt(a * a + b * b);
    rd.set('a', String(a * a)); rd.set('b', String(b * b)); rd.set('s', String(a * a + b * b)); rd.set('c', Number.isInteger(c) ? String(c) + ' (whole number!)' : c.toFixed(3));
  }
  draw();
})();
