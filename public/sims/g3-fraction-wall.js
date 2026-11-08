(function () {
  const { svg, setup, readout, msg } = Sim;
  const { stage, controls } = setup({ title: 'Fraction wall', grade: 3, subject: 'Mathematics',
    intro: 'Each row is one whole cut into equal parts. Tap two pieces to compare them.',
    notice: ['The more parts a whole is cut into, the smaller each part.', '1/2 is the same as 2/4 and 3/6.', 'To compare fractions with the same top number, the smaller bottom number is bigger.'] });
  const W = 600, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const ROWS = [1, 2, 3, 4, 6, 8]; const COL = ['#1D5FD1', '#0EA5E9', '#22C55E', '#F59E0B', '#EF4444', '#A855F7'];
  let pick = [];
  const rd = readout(controls, [['a', 'First'], ['b', 'Second'], ['c', 'Compare']]); const m = msg(controls);
  ROWS.forEach((d, r) => { const w = 540 / d; for (let i = 0; i < d; i++) { const x = 30 + i * w, y = 20 + r * 56; const g = svg('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': `1/${d}` }, root); const rect = svg('rect', { x, y, width: w - 2, height: 50, rx: 6, fill: COL[r], opacity: 0.8 }, g); svg('text', { x: x + w / 2, y: y + 32, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#fff' }, g, d === 1 ? '1' : `1/${d}`); const go = () => choose(d, rect); g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(); }); } });
  function choose(d, rect) {
    if (pick.length === 2) { pick.forEach((p) => p.rect.setAttribute('stroke', 'none')); pick = []; }
    pick.push({ d, rect }); rect.setAttribute('stroke', '#0F172A'); rect.setAttribute('stroke-width', 4);
    rd.set('a', pick[0] ? (pick[0].d === 1 ? '1 whole' : `1/${pick[0].d}`) : '—'); rd.set('b', pick[1] ? `1/${pick[1].d}` : '—');
    if (pick.length === 2) { const [a, b] = pick; rd.set('c', a.d === b.d ? 'equal' : a.d < b.d ? `1/${a.d} > 1/${b.d}` : `1/${a.d} < 1/${b.d}`); m.show(a.d === b.d ? 'Same size!' : 'Look: the piece cut into fewer parts is bigger.', true); } else { rd.set('c', '—'); m.hide(); }
  }
})();
