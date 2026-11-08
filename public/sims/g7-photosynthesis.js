(function () {
  const { svg, setup, slider, loop, readout } = Sim;
  const { stage, controls } = setup({ title: 'Photosynthesis in a leaf', grade: 7, subject: 'Biology',
    intro: 'Carbon dioxide and water go in; glucose and oxygen are made using light. Change the light and the carbon dioxide.',
    notice: ['carbon dioxide + water → glucose + oxygen (with light and chlorophyll).', 'More light makes photosynthesis faster — until something else runs short.', 'Oxygen leaves through the stomata under the leaf.'] });
  const W = 600, H = 380; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let light = 60, co2 = 60;
  const rd = readout(controls, [['r', 'Rate'], ['o', 'Oxygen bubbles a minute'], ['l', 'Limited by']]);
  slider(controls, { label: 'Light', min: 0, max: 100, value: 60, unit: '%', onInput: (v) => { light = v; } });
  slider(controls, { label: 'Carbon dioxide', min: 0, max: 100, value: 60, unit: '%', onInput: (v) => { co2 = v; } });
  const sun = svg('circle', { cx: 60, cy: 60, r: 34, fill: '#FBBF24' }, root);
  svg('path', { d: 'M150,250 C220,120 420,110 520,190 C430,300 260,320 150,250 Z', fill: '#22C55E', stroke: '#15803D', 'stroke-width': 3 }, root);
  svg('path', { d: 'M150,250 L520,190', stroke: '#15803D', 'stroke-width': 3 }, root); svg('line', { x1: 150, y1: 250, x2: 90, y2: 330, stroke: '#15803D', 'stroke-width': 6 }, root);
  svg('text', { x: 300, y: 225, 'font-size': 15, fill: '#fff', 'text-anchor': 'middle', 'font-weight': 700 }, root, 'glucose made here');
  const lab = (x, y, t, c) => svg('text', { x, y, 'font-size': 14, fill: c, 'font-weight': 600 }, root, t);
  lab(470, 80, 'CO₂ in', '#475569'); lab(40, 360, 'water from roots', '#2563EB'); lab(420, 330, 'O₂ out', '#0EA5E9');
  const parts = svg('g', {}, root); const P = [];
  const rays = svg('g', {}, root);
  loop((dt) => {
    const rate = Math.min(light, co2); sun.setAttribute('opacity', 0.25 + light / 130);
    while (rays.firstChild) rays.removeChild(rays.firstChild);
    for (let i = 0; i < Math.round(light / 20); i++) svg('line', { x1: 90 + i * 8, y1: 90 + i * 4, x2: 240 + i * 25, y2: 170 + i * 6, stroke: '#FDE047', 'stroke-width': 3, opacity: 0.7 }, rays);
    if (Math.random() < rate / 100 * dt * 12) P.push({ x: 380, y: 260, k: 'o' });
    if (Math.random() < co2 / 100 * dt * 6) P.push({ x: 520, y: 70, k: 'c' });
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; if (p.k === 'o') { p.x += 30 * dt; p.y += 40 * dt; } else { p.x -= 40 * dt; p.y += 45 * dt; } if (p.y > H || (p.k === 'c' && p.y > 190)) P.splice(i, 1); }
    while (parts.firstChild) parts.removeChild(parts.firstChild);
    P.forEach((p) => svg('circle', { cx: p.x, cy: p.y, r: 7, fill: p.k === 'o' ? '#7DD3FC' : '#94A3B8', stroke: '#fff' }, parts));
    rd.set('r', rate + '%'); rd.set('o', String(Math.round(rate * 0.6))); rd.set('l', light < co2 ? 'light' : co2 < light ? 'carbon dioxide' : 'both equally');
  });
})();
