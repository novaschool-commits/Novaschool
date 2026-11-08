(function () {
  const { svg, setup, buttons, readout, msg, el } = Sim;
  const { stage, controls } = setup({ title: 'Zooming in on the number line', grade: 7, subject: 'Mathematics',
    intro: 'Type a fraction like 3/4 or −5/2. Watch where it sits, then zoom in between two numbers.',
    notice: ['Every rational number p/q has an exact place on the number line.', 'Between any two numbers there are always more numbers — zoom in and see.', 'Negative numbers sit to the left of zero.'] });
  const W = 600, H = 200; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let lo = -3, hi = 3, val = 0.75;
  const rd = readout(controls, [['f', 'Fraction'], ['d', 'Decimal'], ['r', 'Showing']]);
  const m = msg(controls);
  const inp = el('input', { type: 'text', value: '3/4', 'aria-label': 'Fraction p/q', inputmode: 'text' }, controls);
  buttons(controls, [
    { label: 'Place it', primary: true, onClick: place },
    { label: 'Zoom in ×10', onClick: () => { const c = val, span = (hi - lo) / 10; lo = c - span / 2; hi = c + span / 2; draw(); } },
    { label: 'Reset view', onClick: () => { lo = -3; hi = 3; draw(); } },
  ]);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') place(); });
  function place() {
    const t = inp.value.replace('−', '-').trim(); const mm = t.match(/^(-?\d{1,4})\s*\/\s*(-?\d{1,4})$/) || t.match(/^(-?\d{1,4})$/);
    if (!mm) return m.show('Type a fraction like 3/4, or a whole number.');
    const q = mm[2] === undefined ? 1 : Number(mm[2]);
    if (q === 0) return m.show('q cannot be 0 — dividing by zero has no answer, so p/0 is not a number.');
    m.hide(); val = Number(mm[1]) / q; if (val < lo || val > hi) { const span = Math.max(6, Math.abs(val) * 2.2); lo = -span / 2; hi = span / 2; } draw();
  }
  const X = (v) => 30 + (v - lo) / (hi - lo) * (W - 60);
  function nice(span) { const p = Math.pow(10, Math.floor(Math.log10(span / 6))); return [1, 2, 5, 10].map((k) => k * p).find((s) => span / s <= 10); }
  function fmt(v, step) { const dp = Math.max(0, -Math.floor(Math.log10(step))); return Number(v.toFixed(dp)).toString(); }
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    svg('line', { x1: 20, y1: 110, x2: W - 20, y2: 110, stroke: '#0F172A', 'stroke-width': 3 }, root);
    const step = nice(hi - lo);
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      const x = X(v); svg('line', { x1: x, y1: 100, x2: x, y2: 120, stroke: '#0F172A', 'stroke-width': Math.abs(v) < 1e-9 ? 3 : 1.5 }, root);
      svg('text', { x, y: 142, 'text-anchor': 'middle', 'font-size': 13, fill: '#334155' }, root, fmt(v, step));
    }
    if (val >= lo && val <= hi) { const x = X(val); svg('circle', { cx: x, cy: 110, r: 8, fill: '#DC2626' }, root); svg('text', { x, y: 82, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#DC2626' }, root, inp.value.trim()); }
    rd.set('f', inp.value.trim()); rd.set('d', Number.isFinite(val) ? String(+val.toFixed(6)) : '—'); rd.set('r', `${fmt(lo, step / 10)} to ${fmt(hi, step / 10)}`);
  }
  draw();
})();
