(function () {
  const { svg, setup, slider, readout } = Sim;
  const { stage, controls } = setup({ title: 'Shadows through the day', grade: 3, subject: 'General Science',
    intro: 'Move the Sun across the sky from morning to evening. Watch the stick\'s shadow.',
    notice: ['A shadow forms when an object blocks light.', 'The shadow points away from the Sun.', 'At 12 noon the Sun is highest and the shadow is shortest.'] });
  const W = 600, H = 340; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  let hr = 9;
  const rd = readout(controls, [['t', 'Time'], ['l', 'Shadow']]);
  slider(controls, { label: 'Time of day', min: 7, max: 17, step: 0.5, value: 9, format: (v) => `${Math.floor(v) > 12 ? Math.floor(v) - 12 : Math.floor(v)}:${v % 1 ? '30' : '00'} ${v < 12 ? 'a.m.' : 'p.m.'}`, onInput: (v) => { hr = v; draw(); } });
  const g = svg('g', {}, root);
  function draw() {
    while (g.firstChild) g.removeChild(g.firstChild);
    const f = (hr - 6) / 12, ang = Math.PI * f, sx = 300 - 260 * Math.cos(ang), sy = 280 - 230 * Math.sin(ang);
    svg('rect', { x: 0, y: 0, width: W, height: 280, fill: '#E0F2FE' }, g); svg('rect', { x: 0, y: 280, width: W, height: 60, fill: '#86EFAC' }, g);
    svg('text', { x: 20, y: 320, 'font-size': 14, 'font-weight': 700 }, g, 'East'); svg('text', { x: 580, y: 320, 'font-size': 14, 'font-weight': 700, 'text-anchor': 'end' }, g, 'West');
    svg('path', { d: 'M40,280 A260,230 0 0 1 560,280', fill: 'none', stroke: '#FCD34D', 'stroke-dasharray': '6 6' }, g);
    svg('circle', { cx: sx, cy: sy, r: 22, fill: '#FBBF24' }, g);
    const elev = Math.atan2(280 - sy, Math.abs(sx - 300)), len = Math.min(280, 80 / Math.tan(Math.max(0.15, elev))), dir = sx < 300 ? 1 : -1;
    svg('polygon', { points: `296,280 304,280 ${300 + dir * len + 4},286 ${300 + dir * len - 4},286`, fill: '#334155', opacity: 0.6 }, g);
    svg('rect', { x: 296, y: 200, width: 8, height: 80, fill: '#92400E' }, g);
    rd.set('t', hr === 12 ? '12 noon' : hr < 12 ? 'morning' : 'afternoon'); rd.set('l', `${Math.round(len / 8)} units long, pointing ${dir > 0 ? 'west' : 'east'}`);
  }
  draw();
})();
