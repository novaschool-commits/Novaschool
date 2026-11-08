(function () {
  const { svg, setup, slider, toggle, readout } = Sim;
  const { stage, controls } = setup({ title: 'Ray box: reflection and refraction', grade: 8, subject: 'Physics',
    intro: 'Change the angle of the light ray. Use a mirror to see reflection, or a glass block to see refraction.',
    notice: ['Angles are measured from the normal (the dashed line at 90° to the surface).', 'Reflection: angle of incidence = angle of reflection.', 'Going into glass, light slows down and bends towards the normal.'] });
  const W = 600, H = 400, px = 300, py = 230; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let i = 40, mode = 0; const g = svg('g', {}, root);
  const rd = readout(controls, [['i', 'Angle of incidence'], ['r', 'Angle of reflection / refraction']]);
  toggle(controls, ['Plane mirror', 'Glass block'], (k) => { mode = k; draw(); });
  slider(controls, { label: 'Angle of incidence', min: 0, max: 80, value: 40, unit: '°', onInput: (v) => { i = v; draw(); } });
  const ray = (x1, y1, x2, y2, c) => { svg('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': 4 }, g); const a = Math.atan2(y2 - y1, x2 - x1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2; svg('path', { d: `M${mx - 10 * Math.cos(a - 0.5)},${my - 10 * Math.sin(a - 0.5)} L${mx},${my} L${mx - 10 * Math.cos(a + 0.5)},${my - 10 * Math.sin(a + 0.5)}`, stroke: c, 'stroke-width': 4, fill: 'none' }, g); };
  function arc(r0, a0, a1, c, t) { const x0 = px + r0 * Math.sin(a0), y0 = py - r0 * Math.cos(a0), x1 = px + r0 * Math.sin(a1), y1 = py - r0 * Math.cos(a1); svg('path', { d: `M${x0},${y0} A${r0},${r0} 0 0 ${a1 > a0 ? 1 : 0} ${x1},${y1}`, stroke: c, fill: 'none', 'stroke-width': 2 }, g); svg('text', { x: px + (r0 + 16) * Math.sin((a0 + a1) / 2) - 10, y: py - (r0 + 16) * Math.cos((a0 + a1) / 2), 'font-size': 13, fill: c }, g, t); }
  function draw() {
    while (g.firstChild) g.removeChild(g.firstChild);
    const a = i * Math.PI / 180, L = 220;
    if (mode === 0) { svg('rect', { x: 60, y: py, width: 480, height: 12, fill: '#94A3B8' }, g); for (let x = 64; x < 540; x += 14) svg('line', { x1: x, y1: py + 12, x2: x - 8, y2: py + 22, stroke: '#64748B' }, g); }
    else svg('rect', { x: 60, y: py, width: 480, height: 150, fill: '#BFDBFE', opacity: 0.7, stroke: '#60A5FA' }, g);
    svg('line', { x1: px, y1: 30, x2: px, y2: mode ? 390 : py, stroke: '#0F172A', 'stroke-dasharray': '6 6' }, g);
    svg('text', { x: px + 6, y: 44, 'font-size': 12, fill: '#0F172A' }, g, 'normal');
    ray(px - L * Math.sin(a), py - L * Math.cos(a), px, py, '#DC2626');
    arc(60, -a, 0, '#DC2626', i + '°');
    let r;
    if (mode === 0) { r = i; ray(px, py, px + L * Math.sin(a), py - L * Math.cos(a), '#DC2626'); arc(60, 0, a, '#B91C1C', r + '°'); }
    else { const rr = Math.asin(Math.sin(a) / 1.5); r = +(rr * 180 / Math.PI).toFixed(1); const l2 = 150 / Math.max(0.2, Math.cos(rr)); ray(px, py, px + l2 * Math.sin(rr), py + l2 * Math.cos(rr), '#EA580C'); svg('text', { x: px + 20, y: py + 50, 'font-size': 13, fill: '#EA580C' }, g, r + '° in glass'); }
    rd.set('i', i + '°'); rd.set('r', r + '°' + (mode ? ' (refraction)' : ' (reflection)'));
  }
  draw();
})();
