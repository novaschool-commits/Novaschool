(function () {
  const { svg, setup, slider, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'Breathing model: lungs and diaphragm', grade: 7, subject: 'Biology',
    intro: 'Watch the diaphragm and ribs. Change the breathing rate as if you were resting or running.',
    notice: ['Breathing in: the diaphragm moves down and the ribs move up and out, so air rushes in.', 'Breathing out: the diaphragm moves up and air is pushed out.', 'Gas exchange happens in the alveoli: oxygen in, carbon dioxide out.'] });
  const W = 560, H = 440, c = W / 2; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let rate = 14, t = 0;
  const rd = readout(controls, [['p', 'Now'], ['r', 'Breaths a minute']]);
  slider(controls, { label: 'Breaths a minute', min: 10, max: 40, value: 14, onInput: (v) => { rate = v; } });
  svg('path', { d: `M${c},40 L${c},150`, stroke: '#94A3B8', 'stroke-width': 18, 'stroke-linecap': 'round' }, root);
  svg('text', { x: c + 16, y: 70, 'font-size': 13, fill: '#475569' }, root, 'trachea');
  const lL = svg('ellipse', { fill: '#FDA4AF', stroke: '#BE123C', 'stroke-width': 3 }, root), lR = svg('ellipse', { fill: '#FDA4AF', stroke: '#BE123C', 'stroke-width': 3 }, root);
  svg('path', { d: `M${c},150 L${c - 60},190 M${c},150 L${c + 60},190`, stroke: '#94A3B8', 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round' }, root);
  const ribs = svg('g', {}, root); const dia = svg('path', { stroke: '#7C2D12', 'stroke-width': 6, fill: 'none' }, root); const dl = svg('text', { x: c + 140, 'font-size': 13, fill: '#7C2D12' }, root, 'diaphragm');
  const arrow = svg('text', { x: c - 70, y: 30, 'font-size': 15, 'font-weight': 700 }, root);
  const lp = loop((dt) => {
    t += dt * rate / 60; const ph = (Math.sin(2 * Math.PI * t) + 1) / 2;
    const rx = 85 + 18 * ph, ry = 115 + 16 * ph;
    lL.setAttribute('cx', c - 75); lL.setAttribute('cy', 260); lL.setAttribute('rx', rx); lL.setAttribute('ry', ry);
    lR.setAttribute('cx', c + 75); lR.setAttribute('cy', 260); lR.setAttribute('rx', rx); lR.setAttribute('ry', ry);
    const dy = 385 + 25 * ph; dia.setAttribute('d', `M${c - 200},${dy - 10} Q${c},${dy - 70 + 40 * ph} ${c + 200},${dy - 10}`); dl.setAttribute('y', dy);
    while (ribs.firstChild) ribs.removeChild(ribs.firstChild);
    for (let i = 0; i < 5; i++) { const y = 170 + i * 42, s = 1 + 0.08 * ph; svg('path', { d: `M${c - 12},${y} Q${c - 220 * s},${y + 10 - 12 * ph} ${c - 200 * s},${y + 40}  M${c + 12},${y} Q${c + 220 * s},${y + 10 - 12 * ph} ${c + 200 * s},${y + 40}`, stroke: '#CBD5E1', 'stroke-width': 7, fill: 'none' }, ribs); }
    const inhale = Math.cos(2 * Math.PI * t) > 0; arrow.textContent = inhale ? '↓ air in' : '↑ air out'; arrow.setAttribute('fill', inhale ? '#2563EB' : '#64748B');
    rd.set('p', inhale ? 'breathing in' : 'breathing out'); rd.set('r', String(rate));
  });
  playButton(controls, lp);
})();
