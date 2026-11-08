(function () {
  const { svg, el, setup, buttons, readout, msg } = Sim;
  const { stage, controls } = setup({ title: 'Hundreds, tens and ones', grade: 2, subject: 'Mathematics',
    intro: 'Add or take away blocks. Ten ones make a ten; ten tens make a hundred.',
    notice: ['In 352 the 3 means 3 hundreds, the 5 means 5 tens and the 2 means 2 ones.', 'When you have 10 ones, swap them for 1 ten (carrying).', 'When you need more ones, break a ten into 10 ones (borrowing).'] });
  const W = 600, H = 300; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const v = { h: 3, t: 5, o: 2 };
  const big = el('div', { class: 'big-num', 'aria-live': 'polite' }, controls);
  const rd = readout(controls, [['w', 'Value']]); const m = msg(controls);
  buttons(controls, [
    { label: '+1 hundred', onClick: () => ch('h', 1) }, { label: '+1 ten', onClick: () => ch('t', 1) }, { label: '+1 one', primary: true, onClick: () => ch('o', 1) },
    { label: '−1 hundred', onClick: () => ch('h', -1) }, { label: '−1 ten', onClick: () => ch('t', -1) }, { label: '−1 one', onClick: () => ch('o', -1) },
    { label: 'Swap 10 ones → 1 ten', onClick: () => { if (v.o >= 10) { v.o -= 10; v.t++; m.show('10 ones became 1 ten.', true); } else m.show('You need 10 ones to make a ten.'); draw(); } },
    { label: 'Break 1 ten → 10 ones', onClick: () => { if (v.t > 0) { v.t--; v.o += 10; m.show('1 ten became 10 ones.', true); } draw(); } },
  ]);
  function ch(k, d) { m.hide(); v[k] = Math.max(0, Math.min(k === 'o' ? 19 : 9, v[k] + d)); draw(); }
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    [['Hundreds', 10, 200], ['Tens', 215, 150], ['Ones', 380, 210]].forEach(([l, x, w]) => { svg('rect', { x, y: 10, width: w, height: 280, rx: 10, fill: '#F8FAFC', stroke: '#CBD5E1' }, root); svg('text', { x: x + w / 2, y: 32, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700 }, root, l); });
    for (let i = 0; i < v.h; i++) { const x = 20 + (i % 3) * 62, y = 45 + Math.floor(i / 3) * 80; svg('rect', { x, y, width: 56, height: 56, fill: '#93C5FD', stroke: '#1E3A8A' }, root); for (let k = 1; k < 10; k++) { svg('line', { x1: x + k * 5.6, y1: y, x2: x + k * 5.6, y2: y + 56, stroke: '#1E3A8A', 'stroke-width': 0.5 }, root); svg('line', { x1: x, y1: y + k * 5.6, x2: x + 56, y2: y + k * 5.6, stroke: '#1E3A8A', 'stroke-width': 0.5 }, root); } }
    for (let i = 0; i < v.t; i++) { const x = 225 + (i % 9) * 15, y = 45 + Math.floor(i / 9) * 115; svg('rect', { x, y, width: 11, height: 100, fill: '#FCD34D', stroke: '#B45309' }, root); }
    for (let i = 0; i < v.o; i++) { const x = 392 + (i % 5) * 38, y = 45 + Math.floor(i / 5) * 38; svg('rect', { x, y, width: 30, height: 30, fill: '#FCA5A5', stroke: '#B91C1C' }, root); }
    const n = v.h * 100 + v.t * 10 + v.o; big.textContent = String(n);
    rd.set('w', `${v.h} hundreds + ${v.t} tens + ${v.o} ones = ${n}`);
  }
  draw();
})();
