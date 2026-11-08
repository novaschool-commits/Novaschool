(function () {
  const { svg, el, setup, loop, buttons, readout, msg } = Sim;
  const { stage, controls } = setup({ title: 'Reflex arc and reaction time', grade: 8, subject: 'Biology',
    intro: 'Touch the hot pan to send a nerve impulse round the reflex arc. Then test your own reaction time with the falling ruler.',
    notice: ['Stimulus → receptor → sensory neuron → relay neuron (spinal cord) → motor neuron → effector (muscle).', 'A reflex skips the thinking part of the brain, so it is very fast.', 'Your catch is slower than a reflex because you must see, decide and act.'] });
  const W = 600, H = 340; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const path = [[110, 250], [180, 210], [300, 120], [380, 120], [420, 160], [380, 200], [300, 220], [190, 250]];
  const names = ['receptor in skin', 'sensory neuron', 'sensory neuron', 'relay neuron (spinal cord)', 'relay neuron (spinal cord)', 'motor neuron', 'motor neuron', 'muscle (effector)'];
  svg('rect', { x: 40, y: 250, width: 110, height: 20, rx: 6, fill: '#64748B' }, root); svg('text', { x: 50, y: 295, 'font-size': 13 }, root, 'hot pan');
  svg('rect', { x: 360, y: 90, width: 90, height: 140, rx: 40, fill: '#E9D5FF', stroke: '#7C3AED', 'stroke-width': 2 }, root); svg('text', { x: 405, y: 82, 'text-anchor': 'middle', 'font-size': 13 }, root, 'spinal cord');
  svg('polyline', { points: path.slice(0, 4).map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#2563EB', 'stroke-width': 5 }, root);
  svg('polyline', { points: path.slice(3, 6).map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#7C3AED', 'stroke-width': 5 }, root);
  svg('polyline', { points: path.slice(5).map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#DC2626', 'stroke-width': 5 }, root);
  svg('ellipse', { cx: 200, cy: 260, rx: 40, ry: 18, fill: '#FCA5A5' }, root); svg('text', { x: 170, y: 300, 'font-size': 13 }, root, 'arm muscle');
  const imp = svg('circle', { r: 9, fill: '#FACC15', stroke: '#B45309', 'stroke-width': 2 }, root); imp.style.display = 'none';
  const rd = readout(controls, [['n', 'Impulse at'], ['r', 'Your reaction time']]);
  let p = -1;
  buttons(controls, [{ label: 'Touch the hot pan', primary: true, onClick: () => { p = 0; imp.style.display = ''; } }]);
  loop((dt) => {
    if (p >= 0) { p += dt * 2.2; const k = Math.min(path.length - 1.001, p), i = Math.floor(k), f = k - i; const a = path[i], b = path[i + 1]; imp.setAttribute('cx', a[0] + (b[0] - a[0]) * f); imp.setAttribute('cy', a[1] + (b[1] - a[1]) * f); rd.set('n', names[i]); if (p >= path.length - 1) { p = -1; rd.set('n', 'muscle contracts — hand pulls away!'); } }
  });
  // Ruler-drop game
  const box = el('div', { class: 'card', style: 'margin-top:10px' }, controls); el('b', {}, box, 'Ruler-drop test');
  const ruler = el('div', { style: 'height:120px;position:relative;overflow:hidden;background:#F8FAFC;border-radius:8px;margin:8px 0' }, box);
  const bar = el('div', { style: 'position:absolute;left:45%;width:24px;height:200px;background:#FDE68A;border:1px solid #B45309;top:-160px' }, ruler);
  const m = msg(box); let t0 = 0, waiting = false, timer = 0, raf = 0;
  const [go, catchB] = buttons(box, [{ label: 'Start', onClick: () => { m.show('Get ready… tap Catch! as soon as the ruler falls.'); bar.style.top = '-160px'; waiting = true; timer = setTimeout(() => { t0 = performance.now(); fall(); }, 1000 + Math.random() * 2500); } }, { label: 'Catch!', primary: true, onClick: () => {
    if (!waiting) return; if (!t0) { clearTimeout(timer); waiting = false; m.show('Too early! Wait for the ruler to drop.'); return; }
    const ms = performance.now() - t0; cancelAnimationFrame(raf); waiting = false; t0 = 0; const cm = 0.5 * 981 * (ms / 1000) ** 2; rd.set('r', Math.round(ms) + ' ms'); m.show(`You caught it after ${Math.round(ms)} ms — the ruler fell about ${cm.toFixed(1)} cm.`, true);
  } }]);
  void go; void catchB;
  function fall() { const tt = (performance.now() - t0) / 1000; bar.style.top = (-160 + 0.5 * 981 * tt * tt * 0.6) + 'px'; if (tt < 0.6 && waiting) raf = requestAnimationFrame(fall); else if (waiting) { waiting = false; t0 = 0; m.show('Missed! Try again.'); } }
})();
