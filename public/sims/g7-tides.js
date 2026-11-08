(function () {
  const { svg, setup, slider, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'Tides: the Moon pulls the oceans', grade: 7, subject: 'Physics',
    intro: 'The Moon\'s gravity pulls the ocean into two bulges. As the Earth spins, a coast passes through high and low tide.',
    notice: ['There is a bulge facing the Moon and one on the opposite side.', 'Most coasts, like Karachi\'s, have two high tides and two low tides a day.', 'Diagram is not to scale.'] });
  const W = 560, H = 440, c = W / 2, cy = 220; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#0B1530' }, root);
  let speed = 1, hours = 0;
  const rd = readout(controls, [['h', 'Time of day'], ['k', 'Tide at the coast']]);
  slider(controls, { label: 'Speed', min: 0.5, max: 6, step: 0.5, value: 1, format: (v) => v + '×', onInput: (v) => { speed = v; } });
  const ocean = svg('ellipse', { cx: c, cy, fill: '#38BDF8', opacity: 0.85 }, root);
  const earth = svg('g', {}, root); svg('circle', { cx: c, cy, r: 90, fill: '#16A34A' }, earth); svg('circle', { cx: c, cy, r: 90, fill: 'none', stroke: '#14532D', 'stroke-width': 2 }, earth);
  const dot = svg('circle', { r: 8, fill: '#F59E0B', stroke: '#fff', 'stroke-width': 2 }, root); const dl = svg('text', { 'font-size': 13, fill: '#FDE68A' }, root, 'your coast');
  const moon = svg('circle', { r: 20, fill: '#E5E7EB' }, root);
  const lp = loop((dt) => {
    hours = (hours + dt * speed * 2) % 24.8;
    const ma = hours / 24.8 * 2 * Math.PI * 0.035; // the Moon moves slowly in its orbit
    const mx = c + 200 * Math.cos(ma), my = cy + 200 * Math.sin(ma);
    moon.setAttribute('cx', mx); moon.setAttribute('cy', my);
    ocean.setAttribute('rx', 128); ocean.setAttribute('ry', 102); ocean.setAttribute('transform', `rotate(${ma * 180 / Math.PI} ${c} ${cy})`);
    const ea = hours / 24 * 2 * Math.PI; const px = c + 92 * Math.cos(ea), py = cy + 92 * Math.sin(ea);
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); dl.setAttribute('x', px + 12); dl.setAttribute('y', py - 10);
    const rel = Math.cos(2 * (ea - ma));
    rd.set('h', `${Math.floor(hours) % 24}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}`); rd.set('k', rel > 0.6 ? 'high tide' : rel < -0.6 ? 'low tide' : rel > 0 ? 'rising / falling (near high)' : 'rising / falling (near low)');
  });
  playButton(controls, lp);
})();
