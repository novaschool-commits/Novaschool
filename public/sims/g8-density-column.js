(function () {
  const { svg, setup, slider, buttons, readout, loop } = Sim;
  const { stage, controls } = setup({ title: 'Density column: float or sink?', grade: 8, subject: 'Physics',
    intro: 'Set the mass and volume of a block, then drop it into a jar of honey, water and oil.',
    notice: ['Density = mass ÷ volume (g/cm³).', 'An object floats in a liquid that is denser than it, and sinks in one that is less dense.', 'Liquids also layer by density: honey (1.4), water (1.0), oil (0.9).'] });
  const W = 520, H = 440; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const L = [['oil', 0.9, '#FDE68A', 110], ['water', 1.0, '#93C5FD', 210], ['honey', 1.4, '#D97706', 310]];
  let mass = 40, vol = 50, y = 30, vy = 0, dropped = false;
  const rd = readout(controls, [['d', 'Density'], ['w', 'Where it rests']]);
  slider(controls, { label: 'Mass', min: 5, max: 120, value: 40, unit: 'g', onInput: (v) => { mass = v; reset(); } });
  slider(controls, { label: 'Volume', min: 20, max: 100, value: 50, unit: 'cm³', onInput: (v) => { vol = v; reset(); } });
  buttons(controls, [{ label: 'Drop it in', primary: true, onClick: () => { dropped = true; } }, { label: 'Take it out', onClick: reset }]);
  svg('rect', { x: 140, y: 60, width: 240, height: 360, fill: '#F8FAFC', stroke: '#334155', 'stroke-width': 3 }, root);
  L.forEach(([n, d, c, top], i) => { svg('rect', { x: 142, y: top, width: 236, height: i === 2 ? 108 : 100, fill: c, opacity: 0.8 }, root); svg('text', { x: 392, y: top + 50, 'font-size': 13 }, root, `${n} ${d} g/cm³`); });
  const blk = svg('rect', { x: 230, width: 60, height: 40, rx: 4, fill: '#64748B', stroke: '#0F172A', 'stroke-width': 2 }, root);
  function reset() { dropped = false; y = 30; vy = 0; }
  function rest(d) { if (d < 0.9) return 110 - 20; if (d < 1.0) return 210 - 20; if (d < 1.4) return 310 - 20; return 418 - 40; }
  loop((dt) => {
    const d = mass / vol; const target = rest(d);
    if (dropped) { vy += 400 * dt; y = Math.min(target, y + vy * dt); if (y >= target) vy = 0; }
    blk.setAttribute('y', y); blk.setAttribute('width', 30 + vol * 0.5); blk.setAttribute('x', 260 - (30 + vol * 0.5) / 2);
    rd.set('d', `${mass} ÷ ${vol} = ${d.toFixed(2)} g/cm³`);
    rd.set('w', !dropped ? 'not dropped yet' : d < 0.9 ? 'floats on the oil' : d < 1.0 ? 'sinks through oil, floats on water' : d < 1.4 ? 'sinks through water, floats on honey' : 'sinks to the bottom');
  });
})();
