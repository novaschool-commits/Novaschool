(function () {
  const { svg, setup, readout, loop, buttons } = Sim;
  const { stage, controls } = setup({ title: 'Parts of a plant', grade: 2, subject: 'Science and the World',
    intro: 'Tap a part of the plant to find out its job. Press "Water the plant" to watch water travel up.',
    notice: ['Roots hold the plant in the soil and take in water.', 'The stem carries water up and holds the plant up.', 'Leaves make food using sunlight.', 'Flowers make seeds.'] });
  const W = 420, H = 460; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const INFO = { root: ['Roots', 'Hold the plant in the soil and take in water.'], stem: ['Stem', 'Holds the plant up and carries water to the leaves.'], leaf: ['Leaves', 'Make food for the plant using sunlight.'], flower: ['Flower', 'Makes seeds so new plants can grow.'] };
  const rd = readout(controls, [['p', 'Part'], ['j', 'Its job']]);
  svg('rect', { x: 0, y: 330, width: W, height: 130, fill: '#A16207' }, root);
  const part = (k, el) => { el.setAttribute('style', 'cursor:pointer'); el.setAttribute('tabindex', 0); el.setAttribute('role', 'button'); el.setAttribute('aria-label', INFO[k][0]); const go = () => { rd.set('p', INFO[k][0]); rd.set('j', INFO[k][1]); }; el.addEventListener('click', go); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(); }); return el; };
  const rt = svg('g', {}, root); part('root', rt); [[-50, 60], [-20, 90], [20, 80], [55, 55], [0, 110]].forEach(([dx, dy]) => svg('path', { d: `M210,330 q${dx / 2},${dy / 2} ${dx},${dy}`, stroke: '#FEF3C7', 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round' }, rt));
  part('stem', svg('rect', { x: 203, y: 130, width: 14, height: 200, fill: '#16A34A' }, root));
  const lv = svg('g', {}, root); part('leaf', lv); [[210, 250, -1], [210, 200, 1], [210, 300, 1]].forEach(([x, y, s]) => svg('path', { d: `M${x},${y} q${s * 60},-50 ${s * 110},-10 q${-s * 60},40 ${-s * 110},10 Z`, fill: '#22C55E', stroke: '#15803D', 'stroke-width': 2 }, lv));
  const fl = svg('g', {}, root); part('flower', fl); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; svg('ellipse', { cx: 210 + 30 * Math.cos(a), cy: 110 + 30 * Math.sin(a), rx: 20, ry: 11, transform: `rotate(${i * 45} ${210 + 30 * Math.cos(a)} ${110 + 30 * Math.sin(a)})`, fill: '#F472B6' }, fl); } svg('circle', { cx: 210, cy: 110, r: 16, fill: '#FACC15' }, fl);
  const drops = svg('g', {}, root); let w = -1;
  buttons(controls, [{ label: '💧 Water the plant', primary: true, onClick: () => { w = 0; } }]);
  loop((dt) => { while (drops.firstChild) drops.removeChild(drops.firstChild); if (w < 0) return; w += dt * 0.5; for (let k = 0; k < 6; k++) { const f = (w + k / 6) % 1, y = 420 - f * 300; if (w < 2.5) svg('circle', { cx: 210, cy: y, r: 5, fill: '#38BDF8' }, drops); } if (w >= 2.5) w = -1; });
})();
