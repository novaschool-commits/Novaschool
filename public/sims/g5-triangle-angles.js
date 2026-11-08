(function () {
  const { svg, setup, slider, readout } = Sim;
  const { stage, controls } = setup({ title: 'Angles in a triangle', grade: 5, subject: 'Mathematics',
    intro: 'Change the shape of the triangle. The three angles always add up to the same total.',
    notice: ['The angles of every triangle add up to 180°.', 'If you know two angles, subtract them from 180° to find the third.', 'A right-angled triangle has one 90° angle.'] });
  const W = 600, H = 380; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let A = 60, B = 50;
  const rd = readout(controls, [['a', 'Angle A'], ['b', 'Angle B'], ['c', 'Angle C'], ['s', 'Total']]);
  slider(controls, { label: 'Angle A', min: 10, max: 150, value: 60, unit: '°', onInput: (v) => { A = v; if (A + B > 170) B = 170 - A; draw(); } });
  slider(controls, { label: 'Angle B', min: 10, max: 150, value: 50, unit: '°', onInput: (v) => { B = Math.min(v, 170 - A); draw(); } });
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    const a = A * Math.PI / 180, b = B * Math.PI / 180, L = 420, x0 = 90, y0 = 330;
    const t = L * Math.sin(b) / Math.sin(a + b); let px = x0 + t * Math.cos(a), py = y0 - t * Math.sin(a);
    const s = Math.min(1, 290 / (y0 - py)); const P = [x0 + (px - x0) * s, y0 - (y0 - py) * s], Q = [x0, y0], R = [x0 + L * s, y0];
    svg('polygon', { points: [Q, R, P].map((p) => p.join(',')).join(' '), fill: '#DBEAFE', stroke: '#1D5FD1', 'stroke-width': 3 }, root);
    const arc = (p, a0, a1, col, lab) => { const r = 34; svg('path', { d: `M${p[0]},${p[1]} L${p[0] + r * Math.cos(a0)},${p[1] - r * Math.sin(a0)} A${r},${r} 0 0 0 ${p[0] + r * Math.cos(a1)},${p[1] - r * Math.sin(a1)} Z`, fill: col, opacity: 0.7 }, root); svg('text', { x: p[0] + 52 * Math.cos((a0 + a1) / 2) - 12, y: p[1] - 52 * Math.sin((a0 + a1) / 2) + 5, 'font-size': 15, 'font-weight': 700 }, root, lab); };
    const C = 180 - A - B;
    arc(Q, 0, a, '#F87171', A + '°'); arc(R, Math.PI - b, Math.PI, '#34D399', B + '°'); const ang = (f, t) => Math.atan2(f[1] - t[1], t[0] - f[0]); let p0 = ang(P, R), p1 = ang(P, Q); if (p1 < p0) p1 += 2 * Math.PI; arc(P, p0, p1, '#FBBF24', C + '°');
    svg('text', { x: Q[0] - 22, y: Q[1] + 20, 'font-size': 16, 'font-weight': 700 }, root, 'A'); svg('text', { x: R[0] + 8, y: R[1] + 20, 'font-size': 16, 'font-weight': 700 }, root, 'B'); svg('text', { x: P[0] - 6, y: P[1] - 12, 'font-size': 16, 'font-weight': 700 }, root, 'C');
    rd.set('a', A + '°'); rd.set('b', B + '°'); rd.set('c', `180 − ${A} − ${B} = ${C}°`); rd.set('s', `${A} + ${B} + ${C} = 180°`);
  }
  draw();
})();
