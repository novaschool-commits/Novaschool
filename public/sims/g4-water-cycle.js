(function () {
  const { svg, setup, slider, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'The water cycle', grade: 4, subject: 'General Science',
    intro: 'The Sun heats the sea. Water evaporates, cools into clouds, and falls as rain. Make the Sun stronger and watch.',
    notice: ['Evaporation: liquid water turns into water vapour.', 'Condensation: vapour cools into tiny drops that make clouds.', 'Precipitation: rain or snow falls; rivers carry water back to the sea.'] });
  const W = 600, H = 380; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let heat = 60, cloud = 0.2, t = 0;
  const rd = readout(controls, [['s', 'Now'], ['c', 'Cloud']]);
  slider(controls, { label: 'Sun strength', min: 10, max: 100, value: 60, unit: '%', onInput: (v) => { heat = v; } });
  svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#E0F2FE' }, root);
  const sun = svg('circle', { cx: 70, cy: 60, r: 36, fill: '#FBBF24' }, root);
  svg('polygon', { points: '300,300 430,130 600,300', fill: '#78716C' }, root); svg('polygon', { points: '400,170 430,130 460,170', fill: '#fff' }, root);
  svg('rect', { x: 0, y: 300, width: 330, height: 80, fill: '#0EA5E9' }, root); svg('rect', { x: 300, y: 300, width: 300, height: 80, fill: '#65A30D' }, root);
  svg('path', { d: 'M440,300 C420,330 360,320 330,330', stroke: '#38BDF8', 'stroke-width': 10, fill: 'none' }, root);
  const L = (x, y, s) => svg('text', { x, y, 'font-size': 14, 'font-weight': 700, fill: '#0F172A' }, root, s);
  L(60, 290, 'sea'); L(120, 220, 'evaporation ↑'); L(250, 40, 'condensation'); L(470, 270, 'river'); L(470, 95, 'rain ↓');
  const cl = svg('g', {}, root); const fx = svg('g', {}, root);
  const lp = loop((dt) => {
    t += dt; cloud = Math.min(1, cloud + heat / 100 * dt * 0.15); const raining = cloud > 0.6; if (raining) cloud = Math.max(0.2, cloud - dt * 0.12);
    sun.setAttribute('r', 26 + heat / 6);
    while (cl.firstChild) cl.removeChild(cl.firstChild); while (fx.firstChild) fx.removeChild(fx.firstChild);
    const cx = 330 + 100 * Math.min(1, cloud), shade = raining ? '#94A3B8' : '#fff';
    [[0, 0, 40], [35, -15, 35], [70, 0, 40], [35, 10, 38]].forEach(([dx, dy, r]) => svg('circle', { cx: cx + dx, cy: 80 + dy, r: r * (0.6 + 0.5 * cloud), fill: shade }, cl));
    for (let i = 0; i < Math.round(heat / 12); i++) { const y = 290 - ((t * 40 + i * 37) % 180); svg('path', { d: `M${100 + i * 22},${y} q5,-8 0,-16`, stroke: '#7DD3FC', 'stroke-width': 3, fill: 'none', opacity: y / 290 }, fx); }
    if (raining) for (let i = 0; i < 18; i++) { const x = cx - 20 + (i * 13) % 110, y = 120 + ((t * 160 + i * 23) % 160); svg('line', { x1: x, y1: y, x2: x - 3, y2: y + 10, stroke: '#2563EB', 'stroke-width': 2 }, fx); }
    rd.set('s', raining ? 'raining on the mountains' : 'water evaporating'); rd.set('c', Math.round(cloud * 100) + '%');
  });
  playButton(controls, lp);
})();
