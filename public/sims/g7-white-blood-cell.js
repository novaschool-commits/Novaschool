(function () {
  const { svg, setup, buttons, loop, readout, toggle } = Sim;
  const { stage, controls } = setup({ title: 'White blood cells at work', grade: 7, subject: 'Biology',
    intro: 'Germs have got into the blood. Watch white blood cells hunt them. Try again after a vaccine.',
    notice: ['White blood cells engulf germs and make antibodies.', 'Memory cells remember a germ, so the second response is faster.', 'A vaccine trains the body without making you ill.'] });
  const W = 600, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#FEE2E2' }, root);
  let G = [], C = [], vacc = false, time = 0, done = false;
  const rd = readout(controls, [['g', 'Germs left'], ['t', 'Time to clear'], ['v', 'Body']]);
  toggle(controls, ['No vaccine', 'After a vaccine'], (i) => { vacc = i === 1; start(); });
  buttons(controls, [{ label: 'Germs enter', primary: true, onClick: start }]);
  const layer = svg('g', {}, root);
  function start() { G = Array.from({ length: 24 }, () => ({ x: 300 + Math.random() * 280, y: 20 + Math.random() * 320, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30 })); C = Array.from({ length: vacc ? 6 : 2 }, (_, i) => ({ x: 40, y: 60 + i * 50, n: 0 })); time = 0; done = false; }
  loop((dt) => {
    if (!done) time += dt;
    G.forEach((g) => { g.x += g.vx * dt; g.y += g.vy * dt; if (g.x < 10 || g.x > W - 10) g.vx *= -1; if (g.y < 10 || g.y > H - 10) g.vy *= -1; });
    const spd = vacc ? 120 : 55;
    C.forEach((c) => { let best = null, bd = 1e9; G.forEach((g) => { const d = Math.hypot(g.x - c.x, g.y - c.y); if (d < bd) { bd = d; best = g; } }); if (best) { c.x += (best.x - c.x) / bd * spd * dt; c.y += (best.y - c.y) / bd * spd * dt; if (bd < 22) { G.splice(G.indexOf(best), 1); c.n++; } } });
    if (!vacc && C.length < 6 && time > C.length * 2.5) C.push({ x: 40, y: 180, n: 0 });
    if (!G.length) done = true;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    G.forEach((g) => { svg('circle', { cx: g.x, cy: g.y, r: 7, fill: '#65A30D' }, layer); svg('circle', { cx: g.x + 5, cy: g.y - 5, r: 2, fill: '#3F6212' }, layer); });
    C.forEach((c) => { svg('circle', { cx: c.x, cy: c.y, r: 20, fill: '#F8FAFC', stroke: '#6366F1', 'stroke-width': 3 }, layer); svg('circle', { cx: c.x, cy: c.y, r: 8, fill: '#A5B4FC' }, layer); if (vacc) svg('text', { x: c.x - 4, y: c.y - 24, 'font-size': 14, fill: '#4338CA' }, layer, 'Y'); });
    rd.set('g', String(G.length)); rd.set('t', time.toFixed(1) + ' s'); rd.set('v', done ? 'germs cleared' : G.length > 15 ? (vacc ? 'fighting fast (memory cells)' : 'feeling ill') : 'recovering');
  });
  start();
})();
