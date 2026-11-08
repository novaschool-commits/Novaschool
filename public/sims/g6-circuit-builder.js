(function () {
  const { svg, setup, slider, toggle, buttons, readout } = Sim;
  const { stage, controls } = setup({ title: 'Circuit builder: series and parallel', grade: 6, subject: 'General Science',
    intro: 'Close the switch, change the number of cells, and take a bulb out. Compare a series circuit with a parallel circuit.',
    notice: ['A circuit only works when the loop is complete.', 'In series the bulbs share the push from the cells, so they are dimmer; if one bulb is removed, all go out.', 'In parallel each bulb gets the full push; one bulb can be removed and the other stays on — homes are wired this way.'] });
  const W = 600, H = 340; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const st = { par: false, on: true, cells: 2, out: [false, false] };
  const rd = readout(controls, [['c', 'Circuit'], ['b1', 'Bulb 1'], ['b2', 'Bulb 2']]);
  toggle(controls, ['Series', 'Parallel'], (i) => { st.par = i === 1; draw(); });
  slider(controls, { label: 'Number of cells', min: 1, max: 3, value: 2, onInput: (v) => { st.cells = v; draw(); } });
  const bs = buttons(controls, [
    { label: 'Open the switch', primary: true, onClick: () => { st.on = !st.on; bs[0].textContent = st.on ? 'Open the switch' : 'Close the switch'; draw(); } },
    { label: 'Remove / replace bulb 1', onClick: () => { st.out[0] = !st.out[0]; draw(); } },
    { label: 'Remove / replace bulb 2', onClick: () => { st.out[1] = !st.out[1]; draw(); } },
  ]);
  function wire(d, live) { svg('path', { d, stroke: live ? '#F59E0B' : '#475569', 'stroke-width': 5, fill: 'none', 'stroke-linejoin': 'round' }, root); }
  function bulb(x, y, b, out, label) {
    if (out) { svg('circle', { cx: x, cy: y, r: 22, fill: '#fff', stroke: '#CBD5E1', 'stroke-dasharray': '4 4', 'stroke-width': 3 }, root); svg('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 12, fill: '#64748B' }, root, 'gap'); }
    else {
      if (b > 0) svg('circle', { cx: x, cy: y, r: 22 + 26 * b, fill: '#FDE047', opacity: 0.25 + 0.35 * b }, root);
      svg('circle', { cx: x, cy: y, r: 22, fill: b > 0 ? '#FDE047' : '#F1F5F9', stroke: '#334155', 'stroke-width': 3 }, root);
      svg('path', { d: `M${x - 10},${y + 8} L${x - 4},${y - 8} L${x + 4},${y + 8} L${x + 10},${y - 8}`, stroke: '#334155', 'stroke-width': 2, fill: 'none' }, root);
    }
    svg('text', { x, y: y + 44, 'text-anchor': 'middle', 'font-size': 13, fill: '#334155' }, root, label);
  }
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    const push = st.cells / 2; let b1 = 0, b2 = 0;
    if (st.on) {
      if (!st.par) { if (!st.out[0] && !st.out[1]) { b1 = b2 = Math.min(1, 0.5 * push); } }
      else { if (!st.out[0]) b1 = Math.min(1, push); if (!st.out[1]) b2 = Math.min(1, push); }
    }
    const live = b1 > 0 || b2 > 0;
    // battery on the left, switch at the bottom
    wire('M80,90 L80,60 L520,60 L520,280 L330,280', live); wire('M270,280 L80,280 L80,210', live);
    for (let i = 0; i < st.cells; i++) { const y = 110 + i * 30; svg('line', { x1: 60, y1: y, x2: 100, y2: y, stroke: '#0F172A', 'stroke-width': 4 }, root); svg('line', { x1: 70, y1: y + 10, x2: 90, y2: y + 10, stroke: '#0F172A', 'stroke-width': 8 }, root); }
    svg('text', { x: 20, y: 200, 'font-size': 13, fill: '#334155' }, root, st.cells + (st.cells > 1 ? ' cells' : ' cell'));
    svg('circle', { cx: 270, cy: 280, r: 5, fill: '#0F172A' }, root); svg('circle', { cx: 330, cy: 280, r: 5, fill: '#0F172A' }, root);
    svg('line', { x1: 270, y1: 280, x2: st.on ? 330 : 318, y2: st.on ? 280 : 250, stroke: '#0F172A', 'stroke-width': 5 }, root);
    svg('text', { x: 300, y: 310, 'text-anchor': 'middle', 'font-size': 13, fill: '#334155' }, root, st.on ? 'switch closed' : 'switch open');
    if (!st.par) { bulb(240, 60, b1, st.out[0], 'Bulb 1'); bulb(400, 60, b2, st.out[1], 'Bulb 2'); }
    else {
      wire('M200,60 L200,170 L440,170 L440,60', live && b2 > 0);
      bulb(320, 60, b1, st.out[0], 'Bulb 1'); bulb(320, 170, b2, st.out[1], 'Bulb 2');
    }
    const word = (b, o) => o ? 'removed' : b === 0 ? 'off' : b < 0.6 ? 'dim' : 'bright';
    rd.set('c', (st.par ? 'Parallel' : 'Series') + (st.on ? '' : ' · open'));
    rd.set('b1', word(b1, st.out[0])); rd.set('b2', word(b2, st.out[1]));
  }
  draw();
})();
