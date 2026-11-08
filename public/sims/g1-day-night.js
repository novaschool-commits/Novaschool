(function () {
  const { svg, setup, slider, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'Day and night', grade: 1, subject: 'Science and the World',
    intro: 'The Earth spins round. The side facing the Sun has day. The other side has night.',
    notice: ['The Sun does not go round us — the Earth spins.', 'One full spin takes one day.', 'When it is day in Pakistan, it is night on the other side of the world.'] });
  const W = 600, H = 340; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#0B1530' }, root);
  svg('circle', { cx: 70, cy: 170, r: 60, fill: '#FBBF24' }, root); svg('text', { x: 70, y: 176, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 }, root, 'Sun');
  for (let i = 0; i < 5; i++) svg('line', { x1: 140, y1: 110 + i * 30, x2: 300, y2: 110 + i * 30, stroke: '#FDE047', 'stroke-width': 3, opacity: 0.5 }, root);
  const cx = 420, cy = 170;
  svg('circle', { cx, cy, r: 100, fill: '#2563EB' }, root);
  svg('path', { d: `M${cx},${cy - 100} A100,100 0 0 1 ${cx},${cy + 100} Z`, fill: '#0F172A', opacity: 0.65 }, root);
  const me = svg('g', {}, root); svg('circle', { r: 12, fill: '#F59E0B', stroke: '#fff', 'stroke-width': 3 }, me); svg('text', { x: 0, y: -18, 'text-anchor': 'middle', 'font-size': 14, fill: '#fff', 'font-weight': 700 }, me, 'Pakistan');
  let ang = 180, speed = 1;
  const rd = readout(controls, [['n', 'In Pakistan it is']]);
  slider(controls, { label: 'Spin speed', min: 0.2, max: 3, step: 0.2, value: 1, format: (v) => v.toFixed(1) + '×', onInput: (v) => { speed = v; } });
  const lp = loop((dt) => {
    ang = (ang + dt * 30 * speed) % 360; const a = ang * Math.PI / 180;
    me.setAttribute('transform', `translate(${cx + 100 * Math.cos(a)},${cy + 100 * Math.sin(a)})`);
    const day = Math.cos(a) < 0; rd.set('n', day ? '☀️ day' : '🌙 night');
  });
  playButton(controls, lp);
})();
