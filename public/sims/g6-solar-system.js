(function () {
  const { svg, setup, slider, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'Planets orbiting the Sun', grade: 6, subject: 'General Science',
    intro: 'The eight planets orbit the Sun. Tap a planet to learn about it. Sizes and distances are not to scale.',
    notice: ['Planets closer to the Sun go round faster and have shorter years.', 'A comet\'s tail always points away from the Sun.', 'Pluto is now called a dwarf planet.'] });
  const W = 600, H = 600, cx = W / 2, cy = H / 2; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const PL = [['Mercury', 0.24, '#A8A29E', 4, 'Closest to the Sun; a year is 88 Earth days.'], ['Venus', 0.62, '#FCD34D', 6, 'Hottest planet because of its thick clouds.'], ['Earth', 1, '#3B82F6', 6.5, 'Our home; one orbit takes one year.'], ['Mars', 1.88, '#EF4444', 5, 'The red planet; it has two small moons.'],
    ['Jupiter', 11.9, '#D97706', 13, 'The largest planet, a gas giant.'], ['Saturn', 29.5, '#EAB308', 11, 'Famous for its bright rings.'], ['Uranus', 84, '#67E8F9', 9, 'An ice giant that spins on its side.'], ['Neptune', 165, '#6366F1', 9, 'The farthest planet; very windy.']];
  let speed = 1, t = 0, sel = 2;
  const rd = readout(controls, [['n', 'Planet'], ['o', 'Order from the Sun'], ['y', 'One orbit'], ['f', 'Fact']]);
  slider(controls, { label: 'Speed', min: 0.2, max: 5, step: 0.1, value: 1, format: (v) => v.toFixed(1) + '×', onInput: (v) => { speed = v; } });
  const stars = svg('g', {}, root); for (let i = 0; i < 80; i++) svg('circle', { cx: Math.random() * W, cy: Math.random() * H, r: Math.random() * 1.2, fill: '#CBD5E1' }, stars);
  svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#0B1530' }, root).parentNode.insertBefore(root.lastChild, root.firstChild);
  svg('circle', { cx, cy, r: 26, fill: '#FBBF24' }, root);
  const rad = (i) => 50 + i * 30;
  const dots = PL.map((p, i) => { svg('circle', { cx, cy, r: rad(i), fill: 'none', stroke: '#334155', 'stroke-width': 1 }, root); const d = svg('circle', { r: p[3], fill: p[2], tabindex: 0, role: 'button', 'aria-label': p[0], style: 'cursor:pointer' }, root); const pick = () => { sel = i; show(); }; d.addEventListener('click', pick); d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') pick(); }); return d; });
  const ring = svg('circle', { r: 12, fill: 'none', stroke: '#fff', 'stroke-width': 2 }, root);
  const comet = svg('g', {}, root); const tail = svg('path', { fill: '#BAE6FD', opacity: 0.7 }, comet); const head = svg('circle', { r: 4, fill: '#fff' }, comet);
  function show() { const p = PL[sel]; rd.set('n', p[0]); rd.set('o', String(sel + 1)); rd.set('y', p[1] < 1 ? Math.round(p[1] * 365) + ' Earth days' : p[1] + ' Earth years'); rd.set('f', p[4]); }
  const lp = loop((dt) => {
    t += dt * speed;
    PL.forEach((p, i) => { const a = t * 2 * Math.PI / (p[1] * 4) * (i < 4 ? 1 : 3); const x = cx + rad(i) * Math.cos(a), y = cy + rad(i) * Math.sin(a); dots[i].setAttribute('cx', x); dots[i].setAttribute('cy', y); if (i === sel) { ring.setAttribute('cx', x); ring.setAttribute('cy', y); } });
    const ca = t * 0.25, ex = cx + 120 + 170 * Math.cos(ca), ey = cy + 90 * Math.sin(ca);
    const dx = ex - cx, dy = ey - cy, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, len = 900 / Math.max(80, L);
    head.setAttribute('cx', ex); head.setAttribute('cy', ey);
    tail.setAttribute('d', `M${ex - uy * 3},${ey + ux * 3} L${ex + ux * len * 4},${ey + uy * len * 4} L${ex + uy * 3},${ey - ux * 3} Z`);
  });
  playButton(controls, lp); show();
})();
