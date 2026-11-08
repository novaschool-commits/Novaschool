(function () {
  const { svg, setup, slider, readout } = Sim;
  const { stage, controls } = setup({ title: 'Line plotter: y = ax + b', grade: 7, subject: 'Mathematics',
    intro: 'Choose a and b. The table of values is worked out and each point is plotted on the Cartesian plane.',
    notice: ['Points from y = ax + b always lie on a straight line.', 'b is where the line crosses the y-axis.', 'a tells how much y goes up each time x goes up by 1.'] });
  const W = 560, H = 560, o = W / 2, u = 25; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let a = 2, b = 1;
  const rd = readout(controls, [['e', 'Equation'], ['t', 'Table']]);
  slider(controls, { label: 'a', min: -3, max: 3, step: 0.5, value: 2, onInput: (v) => { a = v; draw(); } });
  slider(controls, { label: 'b', min: -5, max: 5, value: 1, onInput: (v) => { b = v; draw(); } });
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    for (let i = -10; i <= 10; i++) { svg('line', { x1: o + i * u, y1: 0, x2: o + i * u, y2: H, stroke: i ? '#E2E8F0' : '#0F172A', 'stroke-width': i ? 1 : 2 }, root); svg('line', { x1: 0, y1: o - i * u, x2: W, y2: o - i * u, stroke: i ? '#E2E8F0' : '#0F172A', 'stroke-width': i ? 1 : 2 }, root); if (i && i % 2 === 0) { svg('text', { x: o + i * u, y: o + 16, 'font-size': 11, 'text-anchor': 'middle', fill: '#64748B' }, root, String(i)); svg('text', { x: o - 8, y: o - i * u + 4, 'font-size': 11, 'text-anchor': 'end', fill: '#64748B' }, root, String(i)); } }
    svg('line', { x1: 0, y1: o - (a * -11.2 + b) * u, x2: W, y2: o - (a * 11.2 + b) * u, stroke: '#1D5FD1', 'stroke-width': 3 }, root);
    const rows = [];
    for (let x = -2; x <= 2; x++) { const y = a * x + b; rows.push(`(${x}, ${y})`); svg('circle', { cx: o + x * u, cy: o - y * u, r: 6, fill: '#DC2626' }, root); }
    rd.set('e', `y = ${a}x ${b < 0 ? '− ' + -b : '+ ' + b}`); rd.set('t', rows.join(' '));
  }
  draw();
})();
