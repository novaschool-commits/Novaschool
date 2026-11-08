(function () {
  const { svg, setup, toggle, buttons, readout, loop } = Sim;
  const { stage, controls } = setup({ title: 'The life cycle of a star', grade: 8, subject: 'Physics',
    intro: 'Choose a star like our Sun or a massive star, then step through its life.',
    notice: ['All stars form in a nebula, a cloud of gas and dust.', 'A Sun-like star becomes a red giant and ends as a white dwarf.', 'A massive star becomes a red supergiant, explodes as a supernova, and leaves a neutron star or black hole.'] });
  const W = 600, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const SUN = [['Nebula', 'A huge cloud of gas and dust starts to collapse.', 'neb'], ['Main-sequence star', 'Hydrogen fuses into helium for about 10 billion years. Our Sun is here now.', '#FCD34D', 50], ['Red giant', 'The star swells as its hydrogen runs out.', '#F97316', 120], ['Planetary nebula', 'The outer layers drift away as a glowing shell.', 'ring'], ['White dwarf', 'A small, hot, dense core that slowly cools.', '#F8FAFC', 14]];
  const BIG = [['Nebula', 'A huge cloud of gas and dust starts to collapse.', 'neb'], ['Main-sequence star', 'A massive blue star burns its fuel fast — only millions of years.', '#93C5FD', 70], ['Red supergiant', 'It swells to an enormous size.', '#DC2626', 150], ['Supernova', 'The core collapses and the star explodes, brighter than a galaxy for a while.', 'boom'], ['Neutron star or black hole', 'What is left is extremely dense; very big cores become black holes.', '#0F172A', 18]];
  let big = false, s = 0, t = 0;
  const rd = readout(controls, [['n', 'Stage'], ['d', 'What happens']]);
  toggle(controls, ['Sun-like star', 'Massive star'], (k) => { big = k === 1; s = 0; });
  buttons(controls, [{ label: 'Back', onClick: () => { s = Math.max(0, s - 1); } }, { label: 'Next stage', primary: true, onClick: () => { s = Math.min(4, s + 1); } }]);
  svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#0B1530' }, root); const g = svg('g', {}, root);
  loop((dt) => {
    t += dt; while (g.firstChild) g.removeChild(g.firstChild);
    const st = (big ? BIG : SUN)[s], cx = W / 2, cy = H / 2;
    if (st[2] === 'neb') for (let k = 0; k < 40; k++) svg('circle', { cx: cx + 140 * Math.sin(k * 1.7 + t * 0.1), cy: cy + 90 * Math.cos(k * 2.3), r: 20 + (k % 5) * 6, fill: k % 2 ? '#7C3AED' : '#DB2777', opacity: 0.15 }, g);
    else if (st[2] === 'ring') { svg('circle', { cx, cy, r: 90 + 6 * Math.sin(t), fill: 'none', stroke: '#22D3EE', 'stroke-width': 16, opacity: 0.6 }, g); svg('circle', { cx, cy, r: 10, fill: '#fff' }, g); }
    else if (st[2] === 'boom') { for (let k = 0; k < 24; k++) { const a = k / 24 * 6.28, r = 30 + ((t * 80) % 140); svg('line', { x1: cx, y1: cy, x2: cx + r * Math.cos(a), y2: cy + r * Math.sin(a), stroke: '#FDE047', 'stroke-width': 4, opacity: 0.8 }, g); } svg('circle', { cx, cy, r: 30, fill: '#fff' }, g); }
    else { if (st[2] === '#0F172A') { svg('circle', { cx, cy, r: 40, fill: 'none', stroke: '#F97316', 'stroke-width': 4, opacity: 0.7 }, g); } svg('circle', { cx, cy, r: st[3] * 1.4, fill: st[2], opacity: 0.25 }, g); svg('circle', { cx, cy, r: st[3], fill: st[2], stroke: st[2] === '#0F172A' ? '#64748B' : 'none' }, g); }
    rd.set('n', `${s + 1} of 5 · ${st[0]}`); rd.set('d', st[1]);
  });
})();
