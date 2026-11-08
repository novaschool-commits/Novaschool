(function () {
  const { svg, setup, buttons, readout, loop, playButton } = Sim;
  const { stage, controls } = setup({ title: 'Food chain: grass, goats and wolves', grade: 4, subject: 'General Science',
    intro: 'Watch how many of each living thing there are over time. Then remove the goats or the wolves and see what happens.',
    notice: ['Grass is a producer: it makes its own food.', 'Goats eat grass (consumers); wolves eat goats.', 'If one link disappears, every other link changes.', 'Decomposers break down dead things and return goodness to the soil.'] });
  const W = 600, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let g = 700, s = 25, w = 4, t = 0, acc = 0; const hist = [];
  const rd = readout(controls, [['g', '🌾 Grass'], ['s', '🐐 Goats'], ['w', '🐺 Wolves']]);
  buttons(controls, [{ label: 'Remove all goats', onClick: () => { s = 0; } }, { label: 'Remove all wolves', onClick: () => { w = 0; } }, { label: 'Start again', onClick: () => { g = 700; s = 25; w = 4; hist.length = 0; } }]);
  // A simple balanced model: grass grows up to a limit, goats eat grass, wolves eat goats.
  function step(h) {
    const dg = 0.5 * g * (1 - g / 1000) - 0.005 * g * s, ds = 0.001 * g * s - 0.3 * s - 0.05 * s * w, dw = 0.005 * s * w - 0.2 * w;
    g = Math.max(0, g + dg * h); s = Math.max(0, s + ds * h); w = Math.max(0, w + dw * h);
    if (s < 0.5) s = 0; if (w < 0.2) w = 0;
  }
  const lp = loop((dt) => {
    t += dt; for (let i = 0; i < 10; i++) step(dt * 0.6);
    acc += dt; if (acc > 0.05) { acc = 0; hist.push([g, s, w]); if (hist.length > 300) hist.shift(); }
    while (root.firstChild) root.removeChild(root.firstChild);
    svg('rect', { x: 40, y: 20, width: 540, height: 300, fill: '#F8FAFC', stroke: '#CBD5E1' }, root);
    [[0, '#16A34A', 1000], [1, '#B45309', 100], [2, '#475569', 15]].forEach(([i, col, max]) => svg('polyline', { points: hist.map((h, j) => `${40 + j * 1.8},${320 - Math.min(1, h[i] / max) * 290}`).join(' '), fill: 'none', stroke: col, 'stroke-width': 3 }, root));
    svg('text', { x: 50, y: 345, 'font-size': 13, fill: '#16A34A' }, root, '— grass'); svg('text', { x: 140, y: 345, 'font-size': 13, fill: '#B45309' }, root, '— goats'); svg('text', { x: 230, y: 345, 'font-size': 13, fill: '#475569' }, root, '— wolves'); svg('text', { x: 580, y: 345, 'font-size': 12, fill: '#64748B', 'text-anchor': 'end' }, root, 'time →');
    rd.set('g', g > 900 ? 'lots (overgrown)' : String(Math.round(g))); rd.set('s', String(Math.round(s))); rd.set('w', String(Math.round(w)));
  });
  playButton(controls, lp);
})();
