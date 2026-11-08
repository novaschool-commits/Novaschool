(function () {
  const { svg, setup, slider, loop, readout } = Sim;
  const { stage, controls } = setup({ title: 'Zooming in: from cell to DNA', grade: 8, subject: 'Biology',
    intro: 'Slide to zoom from a whole cell to the nucleus, a chromosome and finally the DNA double helix.',
    notice: ['The nucleus holds chromosomes (46 in a human body cell).', 'Each chromosome is a long, tightly coiled DNA molecule.', 'A gene is a section of DNA; its base pairs (A–T, C–G) are the code.'] });
  const W = 560, H = 420, c = W / 2; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let z = 0, t = 0;
  const rd = readout(controls, [['l', 'Level'], ['n', 'About']]);
  slider(controls, { label: 'Zoom', min: 0, max: 3, value: 0, format: (v) => ['cell', 'nucleus', 'chromosome', 'DNA'][v], onInput: (v) => { z = v; } });
  const g = svg('g', {}, root);
  const L = [['Cell', 'A human body cell; the nucleus is the control centre.'], ['Nucleus', 'Inside are 46 chromosomes (23 pairs).'], ['Chromosome', 'Made of DNA wound tightly round proteins.'], ['DNA double helix', 'Two strands joined by base pairs: A with T, C with G.']];
  loop((dt) => {
    t += dt; while (g.firstChild) g.removeChild(g.firstChild);
    if (z === 0) { svg('ellipse', { cx: c, cy: 210, rx: 220, ry: 160, fill: '#FCE7F3', stroke: '#DB2777', 'stroke-width': 3 }, g); svg('circle', { cx: c + 30, cy: 200, r: 60, fill: '#C4B5FD', stroke: '#6D28D9', 'stroke-width': 3 }, g); svg('text', { x: c + 30, y: 290, 'text-anchor': 'middle', 'font-size': 14 }, g, 'nucleus'); }
    if (z === 1) { svg('circle', { cx: c, cy: 210, r: 180, fill: '#EDE9FE', stroke: '#6D28D9', 'stroke-width': 3 }, g); for (let k = 0; k < 23; k++) { const a = k / 23 * 6.28, r = 60 + (k % 3) * 35; const x = c + r * Math.cos(a), y = 210 + r * Math.sin(a); svg('path', { d: `M${x - 8},${y - 14} L${x + 8},${y + 14} M${x + 8},${y - 14} L${x - 8},${y + 14}`, stroke: k % 2 ? '#2563EB' : '#DB2777', 'stroke-width': 6, 'stroke-linecap': 'round' }, g); } }
    if (z === 2) { svg('path', { d: `M${c - 70},60 Q${c},210 ${c + 70},360 M${c + 70},60 Q${c},210 ${c - 70},360`, stroke: '#2563EB', 'stroke-width': 46, fill: 'none', 'stroke-linecap': 'round', opacity: 0.85 }, g); for (let y = 70; y < 350; y += 10) svg('line', { x1: c - 30, y1: y, x2: c + 30, y2: y + 5, stroke: '#1E3A8A', 'stroke-width': 1, opacity: 0.4 }, g); svg('text', { x: c + 100, y: 210, 'font-size': 14 }, g, 'centromere'); }
    if (z === 3) { const B = [['A', 'T', '#EF4444', '#F59E0B'], ['C', 'G', '#3B82F6', '#22C55E']];
      for (let y = 30; y < 400; y += 18) { const ph = y / 40 + t * 1.5, x1 = c + 90 * Math.sin(ph), x2 = c - 90 * Math.sin(ph), b = B[Math.floor(y / 18) % 2 ^ (Math.floor(y / 54) % 2)], front = Math.cos(ph) > 0;
        svg('line', { x1, y1: y, x2: (x1 + x2) / 2, y2: y, stroke: b[2], 'stroke-width': 6, opacity: front ? 1 : 0.5 }, g); svg('line', { x1: (x1 + x2) / 2, y1: y, x2, y2: y, stroke: b[3], 'stroke-width': 6, opacity: front ? 1 : 0.5 }, g);
        svg('circle', { cx: x1, cy: y, r: 6, fill: '#0F172A' }, g); svg('circle', { cx: x2, cy: y, r: 6, fill: '#475569' }, g);
        if (y % 72 === 30) { svg('text', { x: x1 + (x1 > c ? 10 : -22), y: y + 5, 'font-size': 13, 'font-weight': 700, fill: b[2] }, g, b[0]); svg('text', { x: x2 + (x2 > c ? 10 : -22), y: y + 5, 'font-size': 13, 'font-weight': 700, fill: b[3] }, g, b[1]); } } }
    rd.set('l', L[z][0]); rd.set('n', L[z][1]);
  });
})();
