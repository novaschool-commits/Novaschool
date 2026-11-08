(function () {
  const { svg, setup, slider, readout } = Sim;
  const { stage, controls } = setup({ title: 'Percentages on a hundred square', grade: 5, subject: 'Mathematics',
    intro: 'Percent means "out of 100". Colour squares and see the fraction, decimal and percentage.',
    notice: ['50% = 1/2 = 0.5.', '25% = 1/4 = 0.25 and 75% = 3/4 = 0.75.', 'To find 20% of Rs 500: 20/100 × 500 = Rs 100.'] });
  const W = 420, H = 420; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let n = 25;
  const rd = readout(controls, [['p', 'Percentage'], ['f', 'Fraction'], ['d', 'Decimal'], ['r', 'Of Rs 500']]);
  slider(controls, { label: 'Squares coloured', min: 0, max: 100, value: 25, onInput: (v) => { n = v; draw(); } });
  const cells = []; for (let i = 0; i < 100; i++) cells.push(svg('rect', { x: 10 + (i % 10) * 40, y: 10 + Math.floor(i / 10) * 40, width: 38, height: 38, rx: 4 }, root));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function draw() {
    cells.forEach((c, i) => c.setAttribute('fill', i < n ? '#1D5FD1' : '#E2E8F0'));
    const g = gcd(n, 100) || 1;
    rd.set('p', n + '%'); rd.set('f', n === 0 ? '0' : `${n}/100 = ${n / g}/${100 / g}`); rd.set('d', (n / 100).toString()); rd.set('r', 'Rs ' + (n * 5));
  }
  draw();
})();
