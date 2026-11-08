(function () {
  const { svg, setup, toggle, loop, playButton, readout, buttons } = Sim;
  const { stage, controls } = setup({ title: 'Ionic and covalent bonds', grade: 8, subject: 'Chemistry',
    intro: 'Only the outer shells are drawn. Watch sodium give an electron to chlorine, or watch hydrogen and oxygen share.',
    notice: ['Ionic: a metal gives electrons to a non-metal; the ions (Na⁺ and Cl⁻) attract.', 'Covalent: non-metals share pairs of electrons.', 'Both ways let atoms fill their outer shells.'] });
  const W = 600, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let mode = 0, t = 0;
  const rd = readout(controls, [['k', 'Bond'], ['s', 'What happens']]);
  toggle(controls, ['Ionic: NaCl', 'Covalent: H₂O'], (k) => { mode = k; t = 0; });
  const g = svg('g', {}, root);
  const lp = loop((dt) => {
    t = Math.min(4, t + dt); while (g.firstChild) g.removeChild(g.firstChild);
    const dot = (x, y, cross) => cross ? svg('text', { x: x - 6, y: y + 6, 'font-size': 18, 'font-weight': 700, fill: '#DC2626' }, g, '×') : svg('circle', { cx: x, cy: y, r: 6, fill: '#1D5FD1' }, g);
    if (mode === 0) {
      const p = Math.min(1, Math.max(0, (t - 1) / 1.5));
      svg('circle', { cx: 170, cy: 180, r: 70, fill: '#FEF3C7', stroke: '#B45309', 'stroke-width': 2 }, g); svg('text', { x: 170, y: 186, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700 }, g, p >= 1 ? 'Na⁺' : 'Na');
      svg('circle', { cx: 420, cy: 180, r: 70, fill: '#DCFCE7', stroke: '#15803D', 'stroke-width': 2 }, g); svg('text', { x: 420, y: 186, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700 }, g, p >= 1 ? 'Cl⁻' : 'Cl');
      for (let k = 0; k < 7; k++) { const a = k / 8 * 6.28 + 0.4; dot(420 + 70 * Math.cos(a), 180 + 70 * Math.sin(a), false); }
      const sx = 170 + 70, ex = 420 + 70 * Math.cos(7 / 8 * 6.28 + 0.4), ey = 180 + 70 * Math.sin(7 / 8 * 6.28 + 0.4);
      dot(sx + (ex - sx) * p, 180 + (ey - 180) * p - Math.sin(p * Math.PI) * 60, true);
      rd.set('k', 'Ionic'); rd.set('s', p < 1 ? 'Sodium (2,8,1) gives its outer electron…' : '…to chlorine (2,8,7). Both now have full outer shells and attract.');
    } else {
      const p = Math.min(1, t / 2);
      const ox = 300, oy = 200, hx = 130 - 50 * p;
      svg('circle', { cx: ox, cy: oy, r: 75, fill: '#FEE2E2', stroke: '#B91C1C', 'stroke-width': 2 }, g); svg('text', { x: ox, y: oy + 7, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700 }, g, 'O');
      [[-1], [1]].forEach(([s]) => { const x = ox + s * (75 + hx * 0.6), y = oy - 40; svg('circle', { cx: x, cy: y, r: 40, fill: '#E0F2FE', stroke: '#0369A1', 'stroke-width': 2 }, g); svg('text', { x, y: y + 6, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 }, g, 'H'); dot(x - s * 34 * p - s * 6, y + 4, true); });
      [[0.6], [1.2], [1.9], [2.5]].forEach(([a]) => dot(ox + 75 * Math.cos(a), oy + 75 * Math.sin(a), false));
      dot(ox - 62, oy - 44, false); dot(ox + 62, oy - 44, false);
      rd.set('k', 'Covalent'); rd.set('s', p < 1 ? 'Each hydrogen brings one electron…' : '…and shares a pair with oxygen. Oxygen now has 8 outer electrons; each hydrogen has 2.');
    }
  });
  playButton(controls, lp); buttons(controls, [{ label: 'Replay', onClick: () => { t = 0; lp.play(); } }]);
})();
