(function () {
  const { svg, setup, slider, readout } = Sim;
  const { stage, controls } = setup({ title: 'Measuring angles', grade: 4, subject: 'Mathematics',
    intro: 'Open the angle and read it on the protractor. Watch its name change.',
    notice: ['Acute: less than 90°. Right angle: exactly 90°. Obtuse: between 90° and 180°.', 'A straight line is 180°.', 'Reflex angles are more than 180°.'] });
  const W = 560, H = 360, cx = 280, cy = 300; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let a = 60;
  const rd = readout(controls, [['a', 'Angle'], ['n', 'Name']]);
  slider(controls, { label: 'Angle', min: 0, max: 360, value: 60, unit: '°', onInput: (v) => { a = v; draw(); } });
  const g = svg('g', {}, root);
  function draw() {
    while (g.firstChild) g.removeChild(g.firstChild);
    svg('path', { d: `M${cx - 220},${cy} A220,220 0 0 1 ${cx + 220},${cy} Z`, fill: '#EFF6FF', stroke: '#93C5FD', 'stroke-width': 2 }, g);
    for (let d = 0; d <= 180; d += 10) { const r = d * Math.PI / 180, r1 = d % 30 ? 205 : 195; svg('line', { x1: cx + r1 * Math.cos(r), y1: cy - r1 * Math.sin(r), x2: cx + 220 * Math.cos(r), y2: cy - 220 * Math.sin(r), stroke: '#1E3A8A' }, g); if (d % 30 === 0) svg('text', { x: cx + 178 * Math.cos(r), y: cy - 178 * Math.sin(r) + 5, 'text-anchor': 'middle', 'font-size': 13 }, g, String(d)); }
    const r = a * Math.PI / 180, big = a > 180 ? 1 : 0;
    if (a > 0) svg('path', { d: `M${cx},${cy} L${cx + 60},${cy} A60,60 0 ${big} 0 ${cx + 60 * Math.cos(r)},${cy - 60 * Math.sin(r)} Z`, fill: '#FDE68A', opacity: 0.8 }, g);
    svg('line', { x1: cx, y1: cy, x2: cx + 230, y2: cy, stroke: '#DC2626', 'stroke-width': 5 }, g);
    svg('line', { x1: cx, y1: cy, x2: cx + 230 * Math.cos(r), y2: cy - 230 * Math.sin(r), stroke: '#DC2626', 'stroke-width': 5 }, g);
    if (a === 90) svg('rect', { x: cx, y: cy - 22, width: 22, height: 22, fill: 'none', stroke: '#0F172A', 'stroke-width': 2 }, g);
    const name = a === 0 ? 'zero' : a < 90 ? 'acute' : a === 90 ? 'right angle' : a < 180 ? 'obtuse' : a === 180 ? 'straight' : a < 360 ? 'reflex' : 'full turn';
    rd.set('a', a + '°'); rd.set('n', name);
  }
  draw();
})();
