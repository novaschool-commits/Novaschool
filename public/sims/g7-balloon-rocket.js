(function () {
  const { svg, setup, buttons, loop, readout } = Sim;
  const { stage, controls } = setup({ title: 'Balloon rocket: action and reaction', grade: 7, subject: 'Physics',
    intro: 'A balloon is taped to a straw on a string. Let the air out and watch it move.',
    notice: ['The balloon pushes air backwards (action).', 'The air pushes the balloon forwards with an equal force (reaction).', 'Rockets, jet engines and swimming all use this idea.'] });
  const W = 600, H = 260; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  svg('line', { x1: 10, y1: 90, x2: W - 10, y2: 90, stroke: '#94A3B8', 'stroke-width': 2 }, root);
  const b = svg('g', {}, root); const body = svg('ellipse', { cx: 0, cy: 120, rx: 60, ry: 34, fill: '#EF4444' }, b); svg('rect', { x: -30, y: 86, width: 60, height: 8, fill: '#F8FAFC', stroke: '#94A3B8' }, b);
  const air = svg('g', {}, b); const a1 = svg('path', { stroke: '#2563EB', 'stroke-width': 4, fill: 'none' }, b); const a2 = svg('path', { stroke: '#16A34A', 'stroke-width': 4, fill: 'none' }, b);
  const l1 = svg('text', { 'font-size': 13, fill: '#2563EB' }, b); const l2 = svg('text', { 'font-size': 13, fill: '#16A34A' }, b);
  let x = 120, v = 0, size = 1, go = false;
  const rd = readout(controls, [['s', 'Air left'], ['v', 'Speed']]);
  buttons(controls, [{ label: 'Let the air out', primary: true, onClick: () => { go = true; } }, { label: 'Blow it up again', onClick: () => { go = false; x = 120; v = 0; size = 1; } }]);
  loop((dt) => {
    if (go && size > 0.35) { v += 160 * dt; size -= 0.25 * dt; } else v = Math.max(0, v - 60 * dt);
    x = Math.min(W - 70, x + v * dt); if (x >= W - 70) v = 0;
    b.setAttribute('transform', `translate(${x},0)`); body.setAttribute('rx', 60 * size); body.setAttribute('ry', 34 * size);
    while (air.firstChild) air.removeChild(air.firstChild);
    const thrust = go && size > 0.35;
    if (thrust) for (let i = 0; i < 6; i++) svg('circle', { cx: -60 * size - 10 - Math.random() * 50, cy: 120 + (Math.random() - 0.5) * 20, r: 3, fill: '#93C5FD' }, air);
    a1.setAttribute('d', thrust ? `M${-60 * size - 10},150 l-60,0 m10,-8 l-10,8 l10,8` : ''); l1.setAttribute('x', -60 * size - 80); l1.setAttribute('y', 175); l1.textContent = thrust ? 'action: air pushed back' : '';
    a2.setAttribute('d', thrust ? `M${60 * size + 4},150 l60,0 m-10,-8 l10,8 l-10,8` : ''); l2.setAttribute('x', 60 * size); l2.setAttribute('y', 175); l2.textContent = thrust ? 'reaction: balloon pushed forward' : '';
    rd.set('s', Math.round(Math.max(0, (size - 0.35) / 0.65) * 100) + '%'); rd.set('v', v.toFixed(0) + ' (model units)');
  });
})();
