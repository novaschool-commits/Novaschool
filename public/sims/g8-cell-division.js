(function () {
  const { svg, setup, toggle, buttons, readout } = Sim;
  const { stage, controls } = setup({ title: 'Cell division: mitosis and meiosis', grade: 8, subject: 'Biology',
    intro: 'Step through each stage. This model cell has 4 chromosomes (2 pairs); a human cell has 46.',
    notice: ['Mitosis makes 2 identical cells with the full number of chromosomes — for growth and repair.', 'Meiosis makes 4 sex cells with half the number — so a baby gets half from each parent.', 'Chromosomes are copied before the cell divides.'] });
  const W = 600, H = 360; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let mei = false, s = 0;
  const MIT = ['Start: one cell', 'Chromosomes copy themselves', 'They line up in the middle', 'Copies are pulled apart', 'Two identical cells'];
  const MEI = ['Start: one cell', 'Chromosomes copy themselves', 'Pairs line up together', 'First division: 2 cells', 'Second division: 4 sex cells'];
  const rd = readout(controls, [['s', 'Stage'], ['c', 'Cells'], ['n', 'Chromosomes in each cell']]);
  toggle(controls, ['Mitosis', 'Meiosis'], (k) => { mei = k === 1; s = 0; draw(); });
  buttons(controls, [{ label: 'Back', onClick: () => { s = Math.max(0, s - 1); draw(); } }, { label: 'Next stage', primary: true, onClick: () => { s = Math.min(4, s + 1); draw(); } }]);
  const COL = ['#DB2777', '#F472B6', '#2563EB', '#60A5FA'];
  function chrom(x, y, col, dbl, len) { svg('line', { x1: x - (dbl ? 4 : 0), y1: y - len, x2: x - (dbl ? 4 : 0), y2: y + len, stroke: col, 'stroke-width': 7, 'stroke-linecap': 'round' }, root); if (dbl) svg('line', { x1: x + 4, y1: y - len, x2: x + 4, y2: y + len, stroke: col, 'stroke-width': 7, 'stroke-linecap': 'round' }, root); }
  function cell(cx, cy, r, list) { svg('circle', { cx, cy, r, fill: '#F0FDF4', stroke: '#16A34A', 'stroke-width': 3 }, root); list.forEach((ch, i) => chrom(cx - (list.length - 1) * 12 + i * 24, cy, COL[ch[0]], ch[1], ch[2] || 18)); }
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    let cells = 1, n = 4;
    if (!mei) {
      if (s <= 2) cell(300, 180, 130, [[0, s >= 1], [1, s >= 1], [2, s >= 1], [3, s >= 1]]);
      if (s === 3) { svg('ellipse', { cx: 300, cy: 180, rx: 200, ry: 120, fill: '#F0FDF4', stroke: '#16A34A', 'stroke-width': 3 }, root); [0, 1, 2, 3].forEach((k, i) => { chrom(180 + i * 12, 180, COL[k], false, 16); chrom(380 + i * 12, 180, COL[k], false, 16); }); }
      if (s === 4) { cells = 2; cell(170, 180, 100, [[0], [1], [2], [3]]); cell(430, 180, 100, [[0], [1], [2], [3]]); }
    } else {
      if (s <= 1) cell(300, 180, 130, [[0, s >= 1], [1, s >= 1], [2, s >= 1], [3, s >= 1]]);
      if (s === 2) cell(300, 180, 130, [[0, true], [1, true], [2, true], [3, true]].map((c, i) => [c[0], true, 20]));
      if (s === 3) { cells = 2; n = 2; cell(170, 180, 100, [[0, true], [2, true]]); cell(430, 180, 100, [[1, true], [3, true]]); }
      if (s === 4) { cells = 4; n = 2; [[120, 100, 0, 2], [260, 260, 0, 2], [340, 100, 1, 3], [480, 260, 1, 3]].forEach(([x, y, a, b]) => cell(x, y, 70, [[a], [b]])); }
    }
    rd.set('s', (mei ? MEI : MIT)[s]); rd.set('c', String(cells)); rd.set('n', String(n) + (n === 4 ? ' (full set; human 46)' : ' (half set; human 23)'));
  }
  draw();
})();
