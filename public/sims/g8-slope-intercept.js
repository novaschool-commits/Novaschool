(function () {
  const { svg, setup, slider, readout } = Sim;
  const { stage, controls } = setup({ title: 'Gradient and intercept: y = mx + c', grade: 8, subject: 'Mathematics',
    intro: 'Move the sliders for m and c and watch the line. The triangle shows rise over run.',
    notice: ['m is the gradient: how far the line rises for every 1 across.', 'A negative m makes the line slope down.', 'c is where the line crosses the y-axis.', 'Lines with the same m are parallel.'] });
  const W = 560, H = 560, o = W / 2, u = 25; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let m = 1.5, c = 2;
  const rd = readout(controls, [['e', 'Equation'], ['g', 'Gradient'], ['y', 'y-intercept'], ['x', 'x-intercept']]);
  slider(controls, { label: 'm (gradient)', min: -4, max: 4, step: 0.25, value: 1.5, onInput: (v) => { m = v; draw(); } });
  slider(controls, { label: 'c (intercept)', min: -8, max: 8, value: 2, onInput: (v) => { c = v; draw(); } });
  const X = (x) => o + x * u, Y = (y) => o - y * u;
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    for (let i = -11; i <= 11; i++) { svg('line', { x1: X(i), y1: 0, x2: X(i), y2: H, stroke: i ? '#E2E8F0' : '#0F172A', 'stroke-width': i ? 1 : 2 }, root); svg('line', { x1: 0, y1: Y(i), x2: W, y2: Y(i), stroke: i ? '#E2E8F0' : '#0F172A', 'stroke-width': i ? 1 : 2 }, root); }
    svg('line', { x1: X(-12), y1: Y(m * -12 + c), x2: X(12), y2: Y(m * 12 + c), stroke: '#1D5FD1', 'stroke-width': 3 }, root);
    svg('path', { d: `M${X(1)},${Y(m + c)} L${X(2)},${Y(m + c)} L${X(2)},${Y(2 * m + c)}`, stroke: '#DC2626', 'stroke-width': 3, fill: 'none' }, root);
    svg('text', { x: X(1.5), y: Y(m + c) + (m >= 0 ? 18 : -8), 'font-size': 13, fill: '#DC2626', 'text-anchor': 'middle' }, root, 'run 1');
    svg('text', { x: X(2) + 6, y: Y(1.5 * m + c), 'font-size': 13, fill: '#DC2626' }, root, 'rise ' + m);
    svg('circle', { cx: X(0), cy: Y(c), r: 6, fill: '#16A34A' }, root);
    const sign = c < 0 ? '− ' + -c : '+ ' + c;
    rd.set('e', `y = ${m}x ${sign}`); rd.set('g', m > 0 ? m + ' (slopes up)' : m < 0 ? m + ' (slopes down)' : '0 (flat)'); rd.set('y', `(0, ${c})`); rd.set('x', m ? `(${+(-c / m).toFixed(2)}, 0)` : 'none');
  }
  draw();
})();
