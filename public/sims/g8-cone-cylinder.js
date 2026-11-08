(function () {
  const { svg, setup, slider, buttons, readout } = Sim;
  const { stage, controls } = setup({ title: 'How many cones fill a cylinder?', grade: 8, subject: 'Mathematics',
    intro: 'The cone and the cylinder have the same radius and height. Pour cones of water into the cylinder.',
    notice: ['Exactly 3 cones fill the cylinder, so V(cone) = ⅓πr²h.', 'A sphere of the same radius holds 2 cones: V = 4/3 πr³ when h = 2r.', 'Volume of a cylinder = πr²h.'] });
  const W = 600, H = 380; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let r = 5, h = 12, n = 0;
  const rd = readout(controls, [['k', 'Cone volume'], ['c', 'Cylinder volume'], ['n', 'Cones poured'], ['f', 'Cylinder full']]);
  slider(controls, { label: 'Radius', min: 2, max: 8, value: 5, unit: 'cm', onInput: (v) => { r = v; n = 0; draw(); } });
  slider(controls, { label: 'Height', min: 4, max: 16, value: 12, unit: 'cm', onInput: (v) => { h = v; n = 0; draw(); } });
  buttons(controls, [{ label: 'Pour one cone', primary: true, onClick: () => { n = Math.min(3, n + 1); draw(); } }, { label: 'Empty', onClick: () => { n = 0; draw(); } }]);
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    const s = Math.min(16, 260 / h), R = r * s, Hh = h * s, base = 340;
    const cx = 170; svg('polygon', { points: `${cx - R},${base - Hh} ${cx + R},${base - Hh} ${cx},${base}`, fill: n < 3 ? '#93C5FD' : '#F1F5F9', stroke: '#1E3A8A', 'stroke-width': 2 }, root); svg('ellipse', { cx, cy: base - Hh, rx: R, ry: R * 0.25, fill: n < 3 ? '#BFDBFE' : '#fff', stroke: '#1E3A8A', 'stroke-width': 2 }, root); svg('text', { x: cx, y: base + 24, 'text-anchor': 'middle', 'font-size': 13 }, root, 'cone');
    const qx = 420, lvl = Hh * n / 3;
    svg('rect', { x: qx - R, y: base - lvl, width: 2 * R, height: lvl, fill: '#60A5FA' }, root);
    if (n) svg('ellipse', { cx: qx, cy: base - lvl, rx: R, ry: R * 0.25, fill: '#93C5FD' }, root);
    svg('path', { d: `M${qx - R},${base - Hh} L${qx - R},${base} A${R},${R * 0.25} 0 0 0 ${qx + R},${base} L${qx + R},${base - Hh}`, fill: 'none', stroke: '#1E3A8A', 'stroke-width': 2 }, root); svg('ellipse', { cx: qx, cy: base - Hh, rx: R, ry: R * 0.25, fill: 'none', stroke: '#1E3A8A', 'stroke-width': 2 }, root);
    svg('text', { x: qx, y: base + 24, 'text-anchor': 'middle', 'font-size': 13 }, root, 'cylinder');
    const vc = Math.PI * r * r * h / 3;
    rd.set('k', `⅓ × π × ${r}² × ${h} = ${vc.toFixed(1)} cm³`); rd.set('c', `π × ${r}² × ${h} = ${(3 * vc).toFixed(1)} cm³`); rd.set('n', String(n)); rd.set('f', n === 3 ? 'yes — 3 cones!' : Math.round(n / 3 * 100) + '%');
  }
  draw();
})();
