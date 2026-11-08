(function () {
  const { svg, setup, slider, readout } = Sim;
  const { stage, controls } = setup({ title: 'Stacking cubes: volume of a cuboid', grade: 6, subject: 'Mathematics',
    intro: 'Each small cube is 1 cm³. Change the length, width and height and count the cubes.',
    notice: ['One layer holds length × width cubes.', 'The number of layers is the height.', 'Volume = length × width × height, in cm³.'] });
  const W = 600, H = 380; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const v = { l: 4, w: 3, h: 2 };
  const rd = readout(controls, [['layer', 'Cubes in one layer'], ['n', 'Layers'], ['v', 'Volume']]);
  slider(controls, { label: 'Length', min: 1, max: 6, value: 4, unit: 'cm', onInput: (x) => { v.l = x; draw(); } });
  slider(controls, { label: 'Width', min: 1, max: 6, value: 3, unit: 'cm', onInput: (x) => { v.w = x; draw(); } });
  slider(controls, { label: 'Height', min: 1, max: 6, value: 2, unit: 'cm', onInput: (x) => { v.h = x; draw(); } });
  const s = 26, ox = W / 2, oy = H - 60;
  const P = (x, y, z) => [ox + (x - y) * s * 0.87, oy + (x + y) * s * 0.5 - z * s];
  function face(pts, fill) { svg('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill, stroke: '#1E3A8A', 'stroke-width': 1 }, root); }
  function draw() {
    while (root.firstChild) root.removeChild(root.firstChild);
    // draw back-to-front so nearer cubes cover farther ones
    const cubes = [];
    for (let z = 0; z < v.h; z++) for (let y = 0; y < v.w; y++) for (let x = 0; x < v.l; x++) cubes.push([x, y, z]);
    cubes.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[2] - b[2]);
    cubes.forEach(([x, y, z]) => {
      face([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], z === v.h - 1 ? '#93C5FD' : '#93C5FD');
      face([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)], '#3B82F6');
      face([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], '#2563EB');
    });
    rd.set('layer', `${v.l} × ${v.w} = ${v.l * v.w}`); rd.set('n', String(v.h)); rd.set('v', `${v.l} × ${v.w} × ${v.h} = ${v.l * v.w * v.h} cm³`);
  }
  draw();
})();
