(function () {
  const { svg, setup, slider, buttons, readout, loop } = Sim;
  const { stage, controls } = setup({ title: 'Moving car with a live distance–time graph', grade: 7, subject: 'Physics',
    intro: 'Set a speed, start the car, and stop it on the way. The graph is drawn as the car moves.',
    notice: ['A straight sloping line means a steady speed.', 'A steeper line means a faster speed.', 'A flat line means the car has stopped.', 'Speed = distance ÷ time.'] });
  const W = 600, H = 400; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let v = 10, t = 0, d = 0, run = false; const pts = [[0, 0]];
  const rd = readout(controls, [['t', 'Time'], ['d', 'Distance'], ['s', 'Speed']]);
  slider(controls, { label: 'Speed', min: 0, max: 20, value: 10, unit: 'm/s', onInput: (x) => { v = x; } });
  const bs = buttons(controls, [{ label: 'Start', primary: true, onClick: () => { run = !run; bs[0].textContent = run ? 'Stop the car' : 'Start'; } }, { label: 'Reset', onClick: () => { t = 0; d = 0; pts.length = 1; run = false; bs[0].textContent = 'Start'; } }]);
  svg('rect', { x: 0, y: 0, width: W, height: 90, fill: '#E0F2FE' }, root); svg('rect', { x: 0, y: 70, width: W, height: 20, fill: '#64748B' }, root);
  const car = svg('g', {}, root); svg('rect', { x: -26, y: 44, width: 52, height: 20, rx: 6, fill: '#DC2626' }, car); svg('circle', { cx: -14, cy: 66, r: 6, fill: '#0F172A' }, car); svg('circle', { cx: 14, cy: 66, r: 6, fill: '#0F172A' }, car);
  const gx = 60, gy = 370, gw = 510, gh = 240;
  svg('line', { x1: gx, y1: gy, x2: gx + gw, y2: gy, stroke: '#0F172A', 'stroke-width': 2 }, root); svg('line', { x1: gx, y1: gy, x2: gx, y2: gy - gh, stroke: '#0F172A', 'stroke-width': 2 }, root);
  svg('text', { x: gx + gw / 2, y: gy + 26, 'text-anchor': 'middle', 'font-size': 13 }, root, 'time (s)'); svg('text', { x: 18, y: gy - gh / 2, 'font-size': 13, transform: `rotate(-90 18 ${gy - gh / 2})`, 'text-anchor': 'middle' }, root, 'distance (m)');
  for (let i = 0; i <= 6; i++) { svg('text', { x: gx + i * gw / 6, y: gy + 14, 'font-size': 11, 'text-anchor': 'middle', fill: '#64748B' }, root, String(i * 5)); svg('text', { x: gx - 6, y: gy - i * gh / 6 + 4, 'font-size': 11, 'text-anchor': 'end', fill: '#64748B' }, root, String(i * 100)); }
  const line = svg('polyline', { fill: 'none', stroke: '#1D5FD1', 'stroke-width': 3 }, root);
  loop((dt) => {
    if (run && t < 30 && d < 600) { t += dt; d += v * dt; pts.push([t, d]); }
    car.setAttribute('transform', `translate(${30 + (d % 600) * 0.9},0)`);
    line.setAttribute('points', pts.map(([a, b]) => `${gx + a / 30 * gw},${gy - Math.min(600, b) / 600 * gh}`).join(' '));
    rd.set('t', t.toFixed(1) + ' s'); rd.set('d', d.toFixed(0) + ' m'); rd.set('s', (run ? v : 0) + ' m/s');
  });
})();
