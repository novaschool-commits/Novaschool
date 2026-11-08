(function () {
  const { svg, setup, buttons, loop, readout } = Sim;
  const { stage, controls } = setup({ title: 'Pollination and seeds', grade: 5, subject: 'General Science',
    intro: 'Send the bee to collect pollen from one flower and carry it to another. Then watch a seed form.',
    notice: ['Pollen is made in the anthers (the male part).', 'Pollination is pollen landing on the stigma (the female part).', 'Insects and wind carry pollen; after pollination, seeds grow in the ovary.'] });
  const W = 600, H = 380; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const F1 = [150, 200], F2 = [450, 200];
  let stage_ = 0, t = 0, bx = 300, by = 60;
  const rd = readout(controls, [['s', 'Step']]);
  buttons(controls, [{ label: 'Next step', primary: true, onClick: () => { stage_ = Math.min(4, stage_ + 1); t = 0; } }, { label: 'Start again', onClick: () => { stage_ = 0; t = 0; bx = 300; by = 60; } }]);
  const STEPS = ['Two flowers of the same kind.', 'The bee visits flower 1 for nectar; pollen sticks to its body.', 'The bee flies to flower 2.', 'Pollen rubs onto the stigma of flower 2: pollination!', 'A seed grows in the ovary; the petals fall off.'];
  function flower([x, y], seed) {
    svg('line', { x1: x, y1: y + 40, x2: x, y2: 360, stroke: '#16A34A', 'stroke-width': 8 }, root);
    if (!seed) for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; svg('ellipse', { cx: x + 40 * Math.cos(a), cy: y + 40 * Math.sin(a), rx: 30, ry: 16, transform: `rotate(${i * 60} ${x + 40 * Math.cos(a)} ${y + 40 * Math.sin(a)})`, fill: '#F9A8D4', opacity: 0.9 }, root); }
    svg('ellipse', { cx: x, cy: y + 30, rx: seed ? 20 : 14, ry: seed ? 16 : 10, fill: seed ? '#A16207' : '#86EFAC', stroke: '#15803D' }, root);
    svg('line', { x1: x, y1: y + 22, x2: x, y2: y - 10, stroke: '#15803D', 'stroke-width': 4 }, root); svg('circle', { cx: x, cy: y - 12, r: 6, fill: '#22C55E' }, root);
    [-18, 18].forEach((d) => { svg('line', { x1: x, y1: y + 20, x2: x + d, y2: y - 4, stroke: '#CA8A04', 'stroke-width': 2 }, root); svg('circle', { cx: x + d, cy: y - 6, r: 6, fill: '#FACC15' }, root); });
  }
  loop((dt) => {
    t = Math.min(1, t + dt * 0.8); while (root.firstChild) root.removeChild(root.firstChild);
    svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#F0FDF4' }, root);
    flower(F1, false); flower(F2, stage_ >= 4);
    svg('text', { x: F1[0], y: 120, 'text-anchor': 'middle', 'font-size': 14 }, root, 'flower 1'); svg('text', { x: F2[0], y: 120, 'text-anchor': 'middle', 'font-size': 14 }, root, 'flower 2');
    if (stage_ === 1) { bx += (F1[0] - bx) * t * 0.2; by += (F1[1] - 30 - by) * t * 0.2; }
    if (stage_ === 2 || stage_ === 3) { bx += (F2[0] - bx) * t * 0.2; by += (F2[1] - 30 - by) * t * 0.2; }
    svg('text', { x: bx - 18, y: by + 12, 'font-size': 34 }, root, '🐝');
    if (stage_ >= 1 && stage_ <= 3) for (let i = 0; i < 6; i++) svg('circle', { cx: bx - 6 + (i % 3) * 6, cy: by + 16 + Math.floor(i / 3) * 5, r: 2.5, fill: '#EAB308' }, root);
    if (stage_ >= 3) svg('circle', { cx: F2[0] + 4, cy: F2[1] - 14, r: 3, fill: '#EAB308' }, root);
    if (stage_ === 3) svg('text', { x: F2[0] + 30, y: F2[1] - 20, 'font-size': 14, fill: '#15803D', 'font-weight': 700 }, root, '← stigma');
    if (stage_ === 4) svg('text', { x: F2[0] + 30, y: F2[1] + 36, 'font-size': 14, fill: '#A16207', 'font-weight': 700 }, root, '← seed growing');
    rd.set('s', `${stage_ + 1} of 5 · ${STEPS[stage_]}`);
  });
})();
