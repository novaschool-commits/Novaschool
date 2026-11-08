(function () {
  const { svg, setup, buttons, readout, msg } = Sim;
  const { stage, controls } = setup({ title: 'Balance-scale equation solver', grade: 6, subject: 'Mathematics',
    intro: 'An equation is a balance. Each box is x; each small block is 1. Do the same to both sides to keep it level until one x is left.',
    notice: ['Taking the same amount from both sides keeps the scale level.', 'Doing something to one side only makes the scale tip — the equation is no longer true.', 'When one box is left, the other side shows the value of x.'] });
  const EQS = [[2, 3, 11], [3, 1, 13], [4, 2, 10], [2, 5, 9], [5, 0, 15], [3, 4, 16], [6, 2, 20]];
  let k = 0, s;
  const W = 600, H = 340;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const g = svg('g', {}, root);
  const rd = readout(controls, [['eq', 'Equation'], ['x', 'x =']]);
  const m = msg(controls);
  function reset() { const [a, b, c] = EQS[k % EQS.length]; s = { a, b, c, lb: b, rb: c, lx: a, ok: true }; m.hide(); draw(); }
  buttons(controls, [
    { label: 'Take 1 from both sides', primary: true, onClick: () => { if (s.lb > 0 && s.rb > 0) { s.lb--; s.rb--; m.hide(); } else m.show('There are no single blocks left on the x side.'); draw(); } },
    { label: 'Share both sides by the number of boxes', onClick: () => { if (s.lb > 0) return m.show('First remove the single blocks next to the boxes.'); if (s.lx === 1) return m.show('Only one box is left already.'); if (s.rb % s.lx) return m.show('That does not share equally.'); s.rb /= s.lx; s.lx = 1; draw(); } },
    { label: 'Take 1 from the left only', onClick: () => { if (s.lb > 0) { s.lb--; s.ok = false; m.show('The scale tips! Changing one side only breaks the balance.'); draw(); } } },
    { label: 'New equation', onClick: () => { k++; reset(); } },
    { label: 'Start again', onClick: reset },
  ]);
  function draw() {
    while (g.firstChild) g.removeChild(g.firstChild);
    const xv = (s.c - s.b) / s.a;
    const left = s.lx * xv + s.lb, right = s.rb;
    const tilt = Math.max(-12, Math.min(12, (left - right) * 4));
    svg('polygon', { points: `${W / 2 - 30},${H - 20} ${W / 2 + 30},${H - 20} ${W / 2},${H - 240}`, fill: '#CBD5E1' }, g);
    const beam = svg('g', { transform: `rotate(${tilt} ${W / 2} ${H - 240})` }, g);
    svg('rect', { x: 60, y: H - 246, width: W - 120, height: 12, rx: 6, fill: '#475569' }, beam);
    [[110, s.lx, s.lb], [W - 290, 0, s.rb]].forEach(([x0, nx, nb]) => {
      svg('line', { x1: x0 + 90, y1: H - 240, x2: x0 + 90, y2: H - 110, stroke: '#64748B', 'stroke-width': 2 }, beam);
      svg('rect', { x: x0, y: H - 110, width: 180, height: 8, rx: 4, fill: '#94A3B8' }, beam);
      let i = 0;
      for (let j = 0; j < nx; j++, i++) { const cx = x0 + 6 + (i % 6) * 29, cy = H - 140 - Math.floor(i / 6) * 30; svg('rect', { x: cx, y: cy, width: 26, height: 28, rx: 4, fill: '#1D5FD1' }, beam); svg('text', { x: cx + 13, y: cy + 19, fill: '#fff', 'font-size': 14, 'text-anchor': 'middle', 'font-weight': 700 }, beam, 'x'); }
      for (let j = 0; j < nb; j++, i++) { const cx = x0 + 6 + (i % 6) * 29, cy = H - 132 - Math.floor(i / 6) * 22; svg('rect', { x: cx + 4, y: cy, width: 18, height: 20, rx: 3, fill: '#F59E0B' }, beam); }
    });
    const lhs = (s.lx === 1 ? 'x' : s.lx + 'x') + (s.lb ? ' + ' + s.lb : '');
    rd.set('eq', s.ok ? `${lhs} = ${s.rb}` : 'not balanced');
    rd.set('x', s.ok && s.lx === 1 && s.lb === 0 ? String(s.rb) : '?');
    if (s.ok && s.lx === 1 && s.lb === 0) m.show(`Solved: x = ${s.rb}. Check: ${s.a} × ${s.rb} + ${s.b} = ${s.c}.`, true);
  }
  reset();
})();
