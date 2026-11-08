(function () {
  const { svg, setup, slider, buttons, loop, readout } = Sim;
  const { stage, controls } = setup({ title: 'Unrolling a circle: where π comes from', grade: 7, subject: 'Mathematics',
    intro: 'Roll the circle along the line for one full turn. The track it leaves is its circumference.',
    notice: ['The circumference is a bit more than 3 diameters — exactly π diameters.', 'Circumference = 2πr = πd.', 'Area = πr²: the circle can be cut and rearranged into a near-rectangle πr long and r high.'] });
  const W = 600, H = 300; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let r = 40, p = 0, go = false;
  const rd = readout(controls, [['r', 'Radius'], ['c', 'Circumference'], ['d', 'Diameters that fit'], ['a', 'Area']]);
  slider(controls, { label: 'Radius', min: 15, max: 55, value: 40, unit: 'mm', onInput: (v) => { r = v; p = 0; go = false; } });
  buttons(controls, [{ label: 'Roll one turn', primary: true, onClick: () => { p = 0; go = true; } }, { label: 'Reset', onClick: () => { p = 0; go = false; } }]);
  const g = svg('g', {}, root);
  loop((dt) => {
    if (go) { p = Math.min(1, p + dt * 0.35); if (p >= 1) go = false; }
    while (g.firstChild) g.removeChild(g.firstChild);
    const y0 = 220, x0 = 40, C = 2 * Math.PI * r, x = x0 + p * C;
    svg('line', { x1: 20, y1: y0, x2: W - 20, y2: y0, stroke: '#0F172A', 'stroke-width': 2 }, g);
    svg('line', { x1: x0, y1: y0, x2: x, y2: y0, stroke: '#DC2626', 'stroke-width': 6 }, g);
    for (let k = 0; k <= 3; k++) { const xx = x0 + k * 2 * r; if (xx < W) { svg('line', { x1: xx, y1: y0 + 8, x2: xx, y2: y0 + 22, stroke: '#1D5FD1', 'stroke-width': 2 }, g); if (k) svg('text', { x: xx, y: y0 + 38, 'font-size': 12, 'text-anchor': 'middle', fill: '#1D5FD1' }, g, k + 'd'); } }
    svg('circle', { cx: x, cy: y0 - r, r, fill: '#DBEAFE', stroke: '#1D5FD1', 'stroke-width': 3 }, g);
    const a = -Math.PI / 2 + p * 2 * Math.PI; svg('line', { x1: x, y1: y0 - r, x2: x + r * Math.sin(p * 2 * Math.PI) * -1, y2: y0 - r + r * Math.cos(p * 2 * Math.PI), stroke: '#DC2626', 'stroke-width': 3 }, g);
    svg('circle', { cx: x - r * Math.sin(p * 2 * Math.PI), cy: y0 - r + r * Math.cos(p * 2 * Math.PI), r: 5, fill: '#DC2626' }, g); void a;
    rd.set('r', r + ' mm'); rd.set('c', (C).toFixed(1) + ' mm'); rd.set('d', (C / (2 * r)).toFixed(4) + ' ≈ π'); rd.set('a', (Math.PI * r * r).toFixed(0) + ' mm²');
  });
})();
