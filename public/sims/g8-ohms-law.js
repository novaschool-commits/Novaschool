(function () {
  const { svg, setup, slider, toggle, buttons, readout, msg } = Sim;
  const { stage, controls } = setup({ title: 'Current, voltage and resistance', grade: 8, subject: 'Physics',
    intro: 'Change the voltage and the resistance. The ammeter (in series) and voltmeter (in parallel) show what happens. Choose a fuse.',
    notice: ['V = I × R: more voltage gives more current; more resistance gives less.', 'Power P = V × I, in watts.', 'A fuse melts and breaks the circuit when the current is higher than its rating.'] });
  const W = 600, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let V = 6, R = 6, fuse = 3, blown = false;
  const rd = readout(controls, [['i', 'Current I = V ÷ R'], ['p', 'Power P = V × I']]);
  const m = msg(controls);
  slider(controls, { label: 'Voltage', min: 1, max: 24, value: 6, unit: 'V', onInput: (v) => { V = v; draw(); } });
  slider(controls, { label: 'Resistance', min: 1, max: 30, value: 6, unit: 'Ω', onInput: (v) => { R = v; draw(); } });
  toggle(controls, ['1 A fuse', '3 A fuse', '5 A fuse'], (k) => { fuse = [1, 3, 5][k]; draw(); }, 1);
  buttons(controls, [{ label: 'Replace the fuse', onClick: () => { blown = false; draw(); } }]);
  const meter = (x, y, lab, val, col) => { svg('circle', { cx: x, cy: y, r: 30, fill: '#fff', stroke: col, 'stroke-width': 3 }, root); svg('text', { x, y: y - 4, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: col }, root, lab); svg('text', { x, y: y + 14, 'text-anchor': 'middle', 'font-size': 12 }, root, val); };
  function draw() {
    let I = V / R; if (I > fuse) blown = true; if (blown) I = 0;
    while (root.firstChild) root.removeChild(root.firstChild);
    const live = I > 0, wc = live ? '#F59E0B' : '#475569';
    svg('path', { d: 'M80,80 L520,80 L520,280 L80,280 Z', stroke: wc, 'stroke-width': 5, fill: 'none' }, root);
    svg('rect', { x: 60, y: 150, width: 40, height: 60, fill: '#fff' }, root); svg('line', { x1: 60, y1: 170, x2: 100, y2: 170, stroke: '#0F172A', 'stroke-width': 4 }, root); svg('line', { x1: 70, y1: 186, x2: 90, y2: 186, stroke: '#0F172A', 'stroke-width': 8 }, root); svg('text', { x: 12, y: 184, 'font-size': 13 }, root, V + ' V');
    svg('rect', { x: 280, y: 266, width: 90, height: 28, fill: '#E2E8F0', stroke: '#0F172A', 'stroke-width': 2 }, root); svg('text', { x: 325, y: 285, 'text-anchor': 'middle', 'font-size': 13 }, root, R + ' Ω');
    svg('path', { d: 'M300,280 L300,330 L350,330 L350,280', stroke: '#64748B', 'stroke-width': 2, fill: 'none' }, root); meter(325, 330, 'V', V.toFixed(1) + ' V', '#16A34A');
    meter(300, 80, 'A', I.toFixed(2) + ' A', '#2563EB');
    svg('rect', { x: 420, y: 72, width: 50, height: 16, fill: '#fff', stroke: blown ? '#DC2626' : '#0F172A', 'stroke-width': 2 }, root);
    svg('path', { d: blown ? 'M425,80 L440,76 M450,84 L465,80' : 'M425,80 L465,80', stroke: blown ? '#DC2626' : '#0F172A', 'stroke-width': 2 }, root); svg('text', { x: 445, y: 66, 'text-anchor': 'middle', 'font-size': 12 }, root, fuse + ' A fuse');
    const P = V * I; if (live) svg('circle', { cx: 200, cy: 80, r: 10 + Math.min(30, P), fill: '#FDE047', opacity: 0.35 }, root); svg('circle', { cx: 200, cy: 80, r: 16, fill: live ? '#FDE047' : '#F1F5F9', stroke: '#334155', 'stroke-width': 2 }, root);
    rd.set('i', blown ? '0 A (fuse blown)' : (V / R).toFixed(2) + ' A'); rd.set('p', (V * I).toFixed(1) + ' W');
    if (blown) m.show(`The current (${(V / R).toFixed(2)} A) was more than ${fuse} A, so the fuse melted. Lower the voltage or raise the resistance, then replace the fuse.`); else m.hide();
  }
  draw();
})();
