(function () {
  const { svg, setup, slider, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'The carbon cycle', grade: 8, subject: 'Biology',
    intro: 'Carbon moves between the air, living things, the ground and the ocean. Change how much fuel is burned and how much forest is left.',
    notice: ['Photosynthesis takes carbon dioxide out of the air.', 'Respiration, decay and burning put it back.', 'Burning more fossil fuels and cutting forests raise the carbon dioxide in the air, which adds to global warming.'] });
  const W = 600, H = 420; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const N = { air: [300, 60, 'Air (CO₂)'], plants: [120, 200, 'Plants'], animals: [300, 230, 'Animals'], decay: [200, 360, 'Decomposers'], fuels: [470, 360, 'Fossil fuels'], ocean: [490, 200, 'Ocean'] };
  const E = [['air', 'plants', 'photosynthesis', 'f'], ['plants', 'air', 'respiration', 'p'], ['plants', 'animals', 'eating', 'p'], ['animals', 'air', 'respiration', 'p'], ['plants', 'decay', 'death', 'p'], ['animals', 'decay', 'death and waste', 'p'], ['decay', 'air', 'decay', 'p'], ['fuels', 'air', 'burning', 'b'], ['air', 'ocean', 'dissolving', 'o'], ['ocean', 'air', 'release', 'o']];
  let burn = 30, forest = 70, co2 = 415, t = 0;
  const rd = readout(controls, [['c', 'CO₂ in the air (model)'], ['tr', 'Trend']]);
  slider(controls, { label: 'Fossil fuel burning', min: 0, max: 100, value: 30, unit: '%', onInput: (v) => { burn = v; } });
  slider(controls, { label: 'Forest cover', min: 0, max: 100, value: 70, unit: '%', onInput: (v) => { forest = v; } });
  E.forEach(([a, b, lab]) => { const [x1, y1] = N[a], [x2, y2] = N[b], off = a < b ? 8 : -8; svg('line', { x1: x1 + off, y1: y1 + off, x2: x2 + off, y2: y2 + off, stroke: '#CBD5E1', 'stroke-width': 2 }, root); svg('text', { x: (x1 + x2) / 2 + off * 2, y: (y1 + y2) / 2 + off * 2, 'font-size': 11, fill: '#64748B' }, root, lab); });
  Object.values(N).forEach(([x, y, l]) => { svg('rect', { x: x - 62, y: y - 20, width: 124, height: 40, rx: 12, fill: '#fff', stroke: '#1D5FD1', 'stroke-width': 2 }, root); svg('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 600 }, root, l); });
  const meter = svg('rect', { x: 560, width: 18, fill: '#DC2626' }, root); svg('rect', { x: 560, y: 20, width: 18, height: 120, fill: 'none', stroke: '#334155' }, root);
  const dots = svg('g', {}, root);
  const lp = loop((dt) => {
    t += dt; co2 += (burn * 0.06 - forest * 0.04 + 0.4) * dt; co2 = Math.max(280, Math.min(700, co2));
    meter.setAttribute('y', 140 - (co2 - 280) / 420 * 120); meter.setAttribute('height', (co2 - 280) / 420 * 120);
    while (dots.firstChild) dots.removeChild(dots.firstChild);
    E.forEach(([a, b, , k], i) => { const amt = k === 'f' ? forest : k === 'b' ? burn : 50; if (amt < 5) return; const n = Math.ceil(amt / 34); for (let j = 0; j < n; j++) { const f = ((t * 0.25 + j / n + i * 0.13) % 1); const [x1, y1] = N[a], [x2, y2] = N[b], off = a < b ? 8 : -8; svg('circle', { cx: x1 + (x2 - x1) * f + off, cy: y1 + (y2 - y1) * f + off, r: 5, fill: k === 'b' ? '#DC2626' : k === 'f' ? '#16A34A' : '#475569' }, dots); } });
    rd.set('c', Math.round(co2) + ' ppm'); const net = burn * 0.06 - forest * 0.04 + 0.4; rd.set('tr', net > 0.3 ? 'rising' : net < -0.3 ? 'falling' : 'about steady');
  });
  playButton(controls, lp);
})();
