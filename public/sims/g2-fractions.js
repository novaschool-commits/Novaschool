(function () {
  const { svg, setup, toggle, readout, msg, buttons } = Sim;
  const { stage, controls } = setup({ title: 'Halves, thirds and quarters', grade: 2, subject: 'Mathematics',
    intro: 'Choose how many equal parts, then tap the parts to colour them.',
    notice: ['The parts must be equal.', 'One of two equal parts is a half (1/2).', 'One of four equal parts is a quarter (1/4). Two quarters make a half.'] });
  const W = 560, H = 300; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let parts = 2, on = new Set(), shape = 0;
  const NAMES = { 2: 'half', 3: 'third', 4: 'quarter' };
  const rd = readout(controls, [['f', 'Coloured'], ['w', 'In words']]); const m = msg(controls);
  toggle(controls, ['2 parts', '3 parts', '4 parts'], (k) => { parts = k + 2; on.clear(); draw(); });
  toggle(controls, ['Roti (circle)', 'Chocolate bar'], (k) => { shape = k; on.clear(); draw(); });
  buttons(controls, [{ label: 'Clear', onClick: () => { on.clear(); draw(); } }]);
  function tap(i) { on.has(i) ? on.delete(i) : on.add(i); draw(); }
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    for (let i = 0; i < parts; i++) {
      let p;
      if (!shape) { const a0 = i / parts * 2 * Math.PI - Math.PI / 2, a1 = (i + 1) / parts * 2 * Math.PI - Math.PI / 2, cx = 280, cy = 150, r = 130; p = svg('path', { d: `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 0 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z` }, root); }
      else { const w = 440 / parts; p = svg('rect', { x: 60 + i * w, y: 80, width: w, height: 140 }, root); }
      p.setAttribute('fill', on.has(i) ? (shape ? '#92400E' : '#F59E0B') : (shape ? '#D6B48A' : '#FEF3C7')); p.setAttribute('stroke', '#78350F'); p.setAttribute('stroke-width', 3); p.setAttribute('style', 'cursor:pointer'); p.setAttribute('tabindex', 0); p.setAttribute('role', 'button'); p.setAttribute('aria-label', `part ${i + 1}`);
      p.addEventListener('click', () => tap(i)); p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tap(i); });
    }
    const k = on.size; rd.set('f', `${k}/${parts}`); rd.set('w', k === 0 ? 'none' : k === parts ? 'the whole' : `${k} ${NAMES[parts]}${k > 1 ? 's' : ''}`);
    if (parts === 4 && k === 2) m.show('Two quarters make one half!', true); else m.hide();
  }
  draw();
})();
