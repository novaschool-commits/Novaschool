(function () {
  const { svg, setup, slider, loop, readout } = Sim;
  const { stage, controls } = setup({ title: 'Building atoms: electron shells', grade: 7, subject: 'Chemistry',
    intro: 'Choose an element from 1 to 20. Protons and neutrons sit in the nucleus; electrons fill shells of 2, 8, 8, …',
    notice: ['The atomic number is the number of protons.', 'A neutral atom has as many electrons as protons.', 'The first shell holds 2 electrons, the next ones 8.', 'Valency depends on the electrons in the outer shell.'] });
  const E = [['Hydrogen', 'H', 0], ['Helium', 'He', 2], ['Lithium', 'Li', 4], ['Beryllium', 'Be', 5], ['Boron', 'B', 6], ['Carbon', 'C', 6], ['Nitrogen', 'N', 7], ['Oxygen', 'O', 8], ['Fluorine', 'F', 10], ['Neon', 'Ne', 10], ['Sodium', 'Na', 12], ['Magnesium', 'Mg', 12], ['Aluminium', 'Al', 14], ['Silicon', 'Si', 14], ['Phosphorus', 'P', 16], ['Sulfur', 'S', 16], ['Chlorine', 'Cl', 18], ['Argon', 'Ar', 22], ['Potassium', 'K', 20], ['Calcium', 'Ca', 20]];
  const W = 560, H = 560, c = W / 2; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let z = 11, rot = 0; const g = svg('g', {}, root);
  const rd = readout(controls, [['e', 'Element'], ['p', 'Protons · neutrons'], ['s', 'Shells'], ['v', 'Valency']]);
  slider(controls, { label: 'Atomic number', min: 1, max: 20, value: 11, onInput: (v) => { z = v; } });
  const shells = (n) => { const s = []; [2, 8, 8, 2].forEach((cap) => { if (n > 0) { s.push(Math.min(cap, n)); n -= cap; } }); return s; };
  loop((dt) => {
    rot += dt * 20; while (g.firstChild) g.removeChild(g.firstChild);
    const sh = shells(z), [name, sym, nn] = E[z - 1];
    svg('circle', { cx: c, cy: c, r: 34, fill: '#FDE68A', stroke: '#B45309' }, g);
    svg('text', { x: c, y: c - 2, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700 }, g, `${z}p`); svg('text', { x: c, y: c + 16, 'text-anchor': 'middle', 'font-size': 13 }, g, `${nn}n`);
    sh.forEach((k, i) => { const r = 70 + i * 55; svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: '#94A3B8', 'stroke-width': 1.5 }, g);
      for (let j = 0; j < k; j++) { const a = (j / k) * 2 * Math.PI + (rot * (i % 2 ? -1 : 1)) * Math.PI / 180; svg('circle', { cx: c + r * Math.cos(a), cy: c + r * Math.sin(a), r: 8, fill: '#1D5FD1' }, g); } });
    const out = sh[sh.length - 1]; const val = (z === 2 || z === 10 || z === 18) ? 0 : out <= 4 ? out : 8 - out;
    rd.set('e', `${name} (${sym})`); rd.set('p', `${z} · ${nn}`); rd.set('s', sh.join(', ')); rd.set('v', z === 1 ? '1' : String(val) + (val === 0 ? ' (full outer shell)' : ''));
  });
})();
