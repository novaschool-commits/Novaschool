(function () {
  const { svg, setup, slider, toggle, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'How tectonic plates move', grade: 6, subject: 'Geography',
    intro: 'Plates of the Earth\'s crust float on the hot mantle. Choose a kind of boundary and move time forward.',
    notice: ['When plates push together, the crust folds up into mountains — this is how the Himalayas and Karakoram formed.', 'Sudden slips at boundaries cause earthquakes.', 'Where plates pull apart, magma rises and makes new crust.'] });
  const W = 600, H = 320; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let mode = 0, t = 0;
  const rd = readout(controls, [['k', 'Boundary'], ['y', 'Time passed']]);
  toggle(controls, ['Pushing together', 'Pulling apart'], (i) => { mode = i; t = 0; tS.set(0); });
  const tS = slider(controls, { label: 'Time', min: 0, max: 100, value: 0, format: (v) => (v * 0.5).toFixed(0) + ' million years', onInput: (v) => { t = v; draw(); } });
  const lp = loop((dt) => { if (t < 100) { t = Math.min(100, t + dt * 12); tS.input.value = t; } draw(); }, false); playButton(controls, lp);
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    svg('rect', { x: 0, y: 0, width: W, height: 120, fill: '#E0F2FE' }, root);
    svg('rect', { x: 0, y: 190, width: W, height: 130, fill: '#FDBA74' }, root);
    svg('text', { x: 16, y: 300, 'font-size': 14, fill: '#7C2D12' }, root, 'Mantle (hot, slowly moving rock)');
    const f = t / 100;
    if (mode === 0) {
      const gap = 40 * f; const hgt = 110 * f;
      svg('rect', { x: 0, y: 120, width: W / 2 - 4 + gap, height: 70, fill: '#A16207' }, root);
      svg('rect', { x: W / 2 + 4 - gap, y: 120, width: W / 2 + gap, height: 70, fill: '#65A30D' }, root);
      svg('polygon', { points: `${W / 2 - 120},120 ${W / 2 - 50},${120 - hgt * 0.7} ${W / 2},${120 - hgt} ${W / 2 + 60},${120 - hgt * 0.6} ${W / 2 + 120},120`, fill: '#78716C' }, root);
      if (hgt > 70) svg('polygon', { points: `${W / 2 - 18},${120 - hgt * 0.9} ${W / 2},${120 - hgt} ${W / 2 + 20},${120 - hgt * 0.88}`, fill: '#fff' }, root);
      arrow(90, 155, 1); arrow(W - 90, 155, -1);
      if (f > 0.3 && Math.floor(t) % 20 < 3) svg('text', { x: W / 2 - 40, y: 215, 'font-size': 16, fill: '#B91C1C', 'font-weight': 700 }, root, '⚡ earthquake');
      rd.set('k', 'Pushing together (mountains)');
    } else {
      const gap = 70 * f;
      svg('rect', { x: 0, y: 120, width: W / 2 - gap / 2, height: 70, fill: '#A16207' }, root);
      svg('rect', { x: W / 2 + gap / 2, y: 120, width: W / 2, height: 70, fill: '#65A30D' }, root);
      svg('rect', { x: W / 2 - gap / 2, y: 140, width: gap, height: 50, fill: '#DC2626' }, root);
      svg('text', { x: W / 2 - 34, y: 110, 'font-size': 13, fill: '#B91C1C' }, root, f > 0.2 ? 'new crust' : '');
      arrow(W / 2 - 90, 155, -1); arrow(W / 2 + 90, 155, 1);
      rd.set('k', 'Pulling apart (new crust)');
    }
    rd.set('y', (t * 0.5).toFixed(0) + ' million years');
  }
  function arrow(x, y, d) { svg('path', { d: `M${x - 30 * d},${y} L${x + 30 * d},${y} M${x + 18 * d},${y - 10} L${x + 30 * d},${y} L${x + 18 * d},${y + 10}`, stroke: '#fff', 'stroke-width': 4, fill: 'none' }, root); }
  draw();
})();
