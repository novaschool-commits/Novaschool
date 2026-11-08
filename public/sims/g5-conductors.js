(function () {
  const { svg, setup, buttons, readout, msg } = Sim;
  const { stage, controls } = setup({ title: 'Conductors and insulators', grade: 5, subject: 'General Science',
    intro: 'Put each object into the gap in the circuit. Does the bulb light?',
    notice: ['Conductors let electricity flow: most metals, like copper, iron and aluminium.', 'Insulators stop it: plastic, rubber, wood, glass.', 'Wires are copper inside plastic, so they carry electricity safely.'] });
  const W = 600, H = 320; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const OBJ = [['iron nail', 1, '#94A3B8'], ['plastic ruler', 0, '#F472B6'], ['copper coin', 1, '#D97706'], ['rubber band', 0, '#7C2D12'], ['wooden pencil', 0, '#FCD34D'], ['aluminium foil', 1, '#CBD5E1'], ['glass marble', 0, '#BAE6FD'], ['steel spoon', 1, '#64748B']];
  let cur = -1; const res = {};
  const rd = readout(controls, [['o', 'In the gap'], ['r', 'Result']]); const m = msg(controls);
  buttons(controls, OBJ.map((o, i) => ({ label: o[0], onClick: () => { cur = i; res[o[0]] = o[1]; draw(); } })));
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    const on = cur >= 0 && OBJ[cur][1] === 1, wc = on ? '#F59E0B' : '#475569';
    svg('path', { d: 'M100,220 V80 H500 V220 H350 M250,220 H100', stroke: wc, 'stroke-width': 5, fill: 'none' }, root);
    svg('rect', { x: 80, y: 120, width: 40, height: 70, fill: '#fff' }, root); svg('line', { x1: 80, y1: 140, x2: 120, y2: 140, stroke: '#0F172A', 'stroke-width': 4 }, root); svg('line', { x1: 90, y1: 156, x2: 110, y2: 156, stroke: '#0F172A', 'stroke-width': 8 }, root);
    if (on) svg('circle', { cx: 300, cy: 80, r: 50, fill: '#FDE047', opacity: 0.4 }, root); svg('circle', { cx: 300, cy: 80, r: 24, fill: on ? '#FDE047' : '#F1F5F9', stroke: '#334155', 'stroke-width': 3 }, root);
    svg('circle', { cx: 250, cy: 220, r: 7, fill: '#0F172A' }, root); svg('circle', { cx: 350, cy: 220, r: 7, fill: '#0F172A' }, root); svg('text', { x: 300, y: 260, 'text-anchor': 'middle', 'font-size': 14 }, root, 'gap');
    if (cur >= 0) { svg('rect', { x: 245, y: 210, width: 110, height: 20, rx: 6, fill: OBJ[cur][2], stroke: '#0F172A' }, root); }
    rd.set('o', cur >= 0 ? OBJ[cur][0] : 'nothing'); rd.set('r', cur < 0 ? 'circuit not complete' : on ? 'bulb lights — conductor' : 'bulb stays off — insulator');
    const done = Object.keys(res).length; if (done === OBJ.length) m.show(`You tested all ${done}. Conductors: ${OBJ.filter((o) => o[1]).map((o) => o[0]).join(', ')}.`, true);
  }
  draw();
})();
