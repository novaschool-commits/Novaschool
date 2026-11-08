(function () {
  const { svg, setup, slider, toggle, buttons, readout, loop } = Sim;
  const { stage, controls } = setup({ title: 'Friction: a fair test', grade: 4, subject: 'General Science',
    intro: 'Push a book with the same force across three surfaces. Only the surface changes — that makes it a fair test.',
    notice: ['Friction slows moving things and acts against the motion.', 'Rough surfaces have more friction than smooth ones.', 'In a fair test, change only one thing and keep everything else the same.'] });
  const W = 600, H = 300; const root = svg('svg', { viewBox: `0 0 ${W} ${H}` }, stage);
  const S = [['wood', '#D97706', 0.25], ['carpet', '#7C3AED', 0.6], ['sandpaper', '#A8A29E', 1.0]];
  let surf = 0, push = 60, x = 40, v = 0; const results = {};
  const rd = readout(controls, [['d', 'Distance'], ['r', 'Results']]);
  toggle(controls, S.map((s) => s[0]), (k) => { surf = k; reset(); draw(); });
  slider(controls, { label: 'Push (same for every test)', min: 30, max: 100, value: 60, onInput: (p) => { push = p; reset(); } });
  buttons(controls, [{ label: 'Push the book', primary: true, onClick: () => { reset(); v = push * 6; } }]);
  function reset() { x = 40; v = 0; }
  const ground = svg('rect', { x: 0, y: 200, width: W, height: 100 }, root); const book = svg('rect', { y: 160, width: 70, height: 40, rx: 4, fill: '#1D5FD1' }, root); const lab = svg('text', { y: 186, 'font-size': 13, fill: '#fff', 'font-weight': 700 }, root, 'BOOK');
  function draw() { ground.setAttribute('fill', S[surf][1]); }
  loop((dt) => {
    if (v > 0) { v = Math.max(0, v - S[surf][2] * 600 * dt); x = Math.min(W - 80, x + v * dt); if (v === 0) results[S[surf][0]] = Math.round((x - 40) / 5); }
    book.setAttribute('x', x); lab.setAttribute('x', x + 14);
    rd.set('d', Math.round((x - 40) / 5) + ' cm'); rd.set('r', S.map((s) => `${s[0]}: ${results[s[0]] === undefined ? '—' : results[s[0]] + ' cm'}`).join(' · '));
  });
  draw();
})();
