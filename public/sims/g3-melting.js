(function () {
  const { svg, setup, slider, readout, loop } = Sim;
  const { stage, controls } = setup({ title: 'Ice, water and steam', grade: 3, subject: 'General Science',
    intro: 'Make it colder or warmer and watch water change between solid, liquid and gas.',
    notice: ['Solids keep their shape.', 'Liquids flow and take the shape of their container.', 'Gases spread out to fill the space.', 'Only an adult should use heat.'] });
  const W = 560, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let T = -5;
  const rd = readout(controls, [['s', 'Water is'], ['t', 'Temperature']]);
  slider(controls, { label: 'Temperature', min: -20, max: 120, value: -5, unit: '°C', onInput: (v) => { T = v; } });
  svg('path', { d: 'M150,120 V300 a20,20 0 0 0 20,20 H390 a20,20 0 0 0 20,-20 V120', fill: '#F8FAFC', stroke: '#475569', 'stroke-width': 4 }, root);
  const thermo = svg('rect', { x: 480, width: 16, fill: '#DC2626' }, root); svg('rect', { x: 480, y: 60, width: 16, height: 260, rx: 8, fill: 'none', stroke: '#334155', 'stroke-width': 2 }, root);
  const g = svg('g', {}, root); let t = 0;
  loop((dt) => {
    t += dt; while (g.firstChild) g.removeChild(g.firstChild);
    thermo.setAttribute('y', 320 - (T + 20) / 140 * 260); thermo.setAttribute('height', (T + 20) / 140 * 260);
    if (T <= 0) { svg('rect', { x: 220, y: 200, width: 120, height: 110, rx: 10, fill: '#BAE6FD', stroke: '#0284C7', 'stroke-width': 3 }, g); svg('path', { d: 'M235,215 l30,0 M235,230 l20,0', stroke: '#fff', 'stroke-width': 4 }, g); rd.set('s', 'solid — ice (keeps its shape)'); }
    else if (T < 100) { const melt = Math.min(1, T / 20); if (melt < 1) svg('rect', { x: 240, y: 240 + 50 * melt, width: 80 * (1 - melt) + 1, height: 70 * (1 - melt) + 1, rx: 8, fill: '#BAE6FD', stroke: '#0284C7', 'stroke-width': 2 }, g); svg('path', { d: `M152,${300 - 30 * melt} Q280,${292 - 30 * melt + 4 * Math.sin(t * 3)} 408,${300 - 30 * melt} V300 a18,18 0 0 1 -18,18 H170 a18,18 0 0 1 -18,-18 Z`, fill: '#38BDF8', opacity: 0.8 }, g); rd.set('s', melt < 1 ? 'melting — solid to liquid' : 'liquid — water (it flows)'); }
    else { svg('path', { d: 'M152,285 Q280,281 408,285 V300 a18,18 0 0 1 -18,18 H170 a18,18 0 0 1 -18,-18 Z', fill: '#38BDF8', opacity: 0.8 }, g); for (let k = 0; k < 10; k++) { const y = 260 - ((t * 60 + k * 30) % 220); svg('circle', { cx: 170 + k * 22 + 8 * Math.sin(t * 2 + k), cy: y, r: 10, fill: '#E2E8F0', opacity: Math.max(0, y / 260) }, g); } rd.set('s', 'boiling — liquid to gas (steam spreads out)'); }
    rd.set('t', T + ' °C');
  });
})();
