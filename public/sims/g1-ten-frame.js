(function () {
  const { svg, el, setup, buttons, readout } = Sim;
  const { stage, controls } = setup({ title: 'Ten frames: count to 20', grade: 1, subject: 'Mathematics',
    intro: 'Tap + to add a counter and − to take one away. When the first frame is full, it makes a ten.',
    notice: ['A full ten frame is 10.', '13 is ten and three more.', 'Count the counters, then say the number.'] });
  const W = 560, H = 260; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  let n = 7;
  const big = el('div', { class: 'big-num', 'aria-live': 'polite' }, controls);
  const rd = readout(controls, [['w', 'In words'], ['t', 'Tens and ones']]);
  buttons(controls, [{ label: '+ add one', primary: true, onClick: () => { n = Math.min(20, n + 1); draw(); } }, { label: '− take one', onClick: () => { n = Math.max(0, n - 1); draw(); } }, { label: 'Start again', onClick: () => { n = 0; draw(); } }]);
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    for (let f = 0; f < 2; f++) for (let i = 0; i < 10; i++) {
      const x = 20 + f * 275 + (i % 5) * 50, y = 60 + Math.floor(i / 5) * 60, k = f * 10 + i;
      svg('rect', { x, y, width: 48, height: 58, fill: '#fff', stroke: '#334155', 'stroke-width': 2 }, root);
      if (k < n) svg('circle', { cx: x + 24, cy: y + 29, r: 18, fill: f ? '#F59E0B' : '#DC2626' }, root);
    }
    svg('text', { x: 145, y: 40, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 }, root, n >= 10 ? 'ten ✓' : '');
    big.textContent = String(n); rd.set('w', WORDS[n]); rd.set('t', `${Math.floor(n / 10)} ten${Math.floor(n / 10) === 1 ? '' : 's'} and ${n % 10}`);
  }
  draw();
})();
