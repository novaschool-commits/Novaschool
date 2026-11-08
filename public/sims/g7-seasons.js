(function () {
  const { svg, setup, slider, loop, playButton, readout } = Sim;
  const { stage, controls } = setup({ title: 'Seasons: the tilted Earth', grade: 7, subject: 'Physics',
    intro: 'The Earth\'s axis is tilted about 23.5°. Move through the year and watch which half leans towards the Sun.',
    notice: ['When Pakistan\'s half (the north) leans towards the Sun, days are longer and sunlight is more direct: summer.', 'Six months later the north leans away: winter.', 'Seasons are caused by the tilt, not by the Earth\'s distance from the Sun.'] });
  const W = 600, H = 380, c = W / 2, cy = 190; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#0B1530' }, root);
  svg('ellipse', { cx: c, cy, rx: 230, ry: 120, fill: 'none', stroke: '#334155', 'stroke-dasharray': '6 6' }, root);
  svg('circle', { cx: c, cy, r: 34, fill: '#FBBF24' }, root);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let day = 172;
  const rd = readout(controls, [['m', 'Month'], ['s', 'Season in Pakistan'], ['d', 'Daylight in Lahore (about)']]);
  const sl = slider(controls, { label: 'Day of the year', min: 1, max: 365, value: 172, format: (v) => M[Math.min(11, Math.floor((v - 1) / 30.5))], onInput: (v) => { day = v; draw(); } });
  const e = svg('g', {}, root);
  function draw() {
    while (e.firstChild) e.removeChild(e.firstChild);
    // June solstice: Earth on the left of the Sun so the north tilts towards it.
    const a = Math.PI + (day - 172) / 365 * 2 * Math.PI; const x = c + 230 * Math.cos(a), y = cy + 120 * Math.sin(a);
    const lit = Math.atan2(cy - y, c - x);
    svg('circle', { cx: x, cy: y, r: 30, fill: '#1E3A8A' }, e);
    svg('path', { d: `M${x + 30 * Math.cos(lit - Math.PI / 2)},${y + 30 * Math.sin(lit - Math.PI / 2)} A30,30 0 0 1 ${x + 30 * Math.cos(lit + Math.PI / 2)},${y + 30 * Math.sin(lit + Math.PI / 2)} Z`, fill: '#60A5FA' }, e);
    const t = 23.5 * Math.PI / 180, ax = 44 * Math.sin(t), ay = 44 * Math.cos(t);
    svg('line', { x1: x - ax, y1: y + ay, x2: x + ax, y2: y - ay, stroke: '#fff', 'stroke-width': 2 }, e);
    svg('text', { x: x + ax + 2, y: y - ay - 4, 'font-size': 12, fill: '#fff' }, e, 'N');
    const decl = 23.5 * Math.cos((day - 172) / 365 * 2 * Math.PI);
    const lat = 31.5 * Math.PI / 180, dr = decl * Math.PI / 180; const hrs = 24 / Math.PI * Math.acos(-Math.tan(lat) * Math.tan(dr));
    const season = decl > 12 ? 'summer' : decl < -12 ? 'winter' : (day < 172 && day > 40) ? 'spring' : 'autumn';
    rd.set('m', M[Math.min(11, Math.floor((day - 1) / 30.5))]); rd.set('s', season); rd.set('d', hrs.toFixed(1) + ' hours');
  }
  const lp = loop((dt) => { day = day % 365 + dt * 30; sl.input.value = Math.round(day); draw(); }, false);
  playButton(controls, lp); draw();
})();
