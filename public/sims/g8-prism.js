(function () {
  const { svg, setup, toggle, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'A prism splits white light', grade: 8, subject: 'Physics',
    intro: 'White light enters a glass prism and comes out as a spectrum. Try a coloured filter.',
    notice: ['White light is a mixture of colours.', 'Each colour bends by a different amount; violet bends most, red least.', 'A filter lets one colour through and absorbs the rest.'] });
  const W = 600, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#0F172A' }, root);
  const C = [['red', '#EF4444'], ['orange', '#F97316'], ['yellow', '#FACC15'], ['green', '#22C55E'], ['blue', '#3B82F6'], ['indigo', '#6366F1'], ['violet', '#A855F7']];
  let filt = -1, t = 0;
  const rd = readout(controls, [['f', 'Filter'], ['o', 'Colours on the screen']]);
  toggle(controls, ['No filter', 'Red filter', 'Green filter', 'Blue filter'], (k) => { filt = [-1, 0, 3, 4][k]; });
  svg('polygon', { points: '250,80 350,280 150,280', fill: '#BFDBFE', opacity: 0.35, stroke: '#E0F2FE', 'stroke-width': 2 }, root);
  svg('rect', { x: 560, y: 60, width: 14, height: 260, fill: '#E2E8F0' }, root); svg('text', { x: 520, y: 50, 'font-size': 12, fill: '#E2E8F0' }, root, 'screen');
  const g = svg('g', {}, root);
  const lp = loop((dt) => {
    t = Math.min(1, t + dt * 0.6); while (g.firstChild) g.removeChild(g.firstChild);
    svg('line', { x1: 20, y1: 190, x2: 20 + Math.min(1, t * 3) * 190, y2: 190, stroke: '#fff', 'stroke-width': 5 }, g);
    if (t > 0.33) C.forEach((c, k) => { const y1 = 190 + (k - 3) * 2, y2 = 120 + k * 22 + 10; const f = Math.min(1, (t - 0.33) * 3);
      svg('line', { x1: 210, y1: 190, x2: 290, y2: y1 + 10 + k * 3, stroke: c[1], 'stroke-width': 2, opacity: 0.8 }, g);
      if (filt === -1 || filt === k) { svg('line', { x1: 290, y1: y1 + 10 + k * 3, x2: 290 + f * 270, y2: y1 + 10 + k * 3 + f * (y2 - y1 - 10 - k * 3), stroke: c[1], 'stroke-width': 4 }, g); if (f >= 1) svg('rect', { x: 560, y: y2 - 8, width: 14, height: 18, fill: c[1] }, g); } });
    if (filt !== -1) svg('rect', { x: 420, y: 80, width: 10, height: 240, fill: C[filt][1], opacity: 0.7 }, g);
    rd.set('f', filt === -1 ? 'none' : C[filt][0]); rd.set('o', filt === -1 ? 'all seven' : C[filt][0] + ' only');
  });
  playButton(controls, lp);
})();
