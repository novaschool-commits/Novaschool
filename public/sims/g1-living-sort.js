(function () {
  const { el, setup, buttons, readout, msg } = Sim;
  const { stage, controls } = setup({ title: 'Living or non-living?', grade: 1, subject: 'Science and the World',
    intro: 'Look at each picture. Is it living or non-living? Tap the right button.',
    notice: ['Living things grow, breathe, need food and water, and have young.', 'Non-living things do not grow or eat.', 'A plant is living even though it does not walk.'] });
  const ITEMS = [['🌳', 'tree', 1], ['🪨', 'stone', 0], ['🐄', 'cow', 1], ['🚗', 'car', 0], ['🐟', 'fish', 1], ['🪑', 'chair', 0], ['🌻', 'sunflower', 1], ['⚽', 'ball', 0], ['🐦', 'bird', 1], ['📚', 'book', 0], ['🐜', 'ant', 1], ['☀️', 'Sun', 0]];
  let i = 0, score = 0;
  const box = el('div', { style: 'text-align:center' }, stage); const pic = el('div', { style: 'font-size:120px;line-height:1.1' }, box); const name = el('div', { style: 'font-size:26px;font-weight:700' }, box);
  const rd = readout(controls, [['s', 'Score'], ['q', 'Picture']]); const m = msg(controls);
  buttons(controls, [{ label: '🌱 Living', primary: true, onClick: () => answer(1) }, { label: '🧱 Non-living', onClick: () => answer(0) }, { label: 'Play again', onClick: () => { i = 0; score = 0; m.hide(); show(); } }]);
  function show() { if (i >= ITEMS.length) { pic.textContent = '🎉'; name.textContent = `You got ${score} of ${ITEMS.length}!`; rd.set('q', 'done'); return; } pic.textContent = ITEMS[i][0]; name.textContent = ITEMS[i][1]; rd.set('s', `${score} / ${i}`); rd.set('q', `${i + 1} of ${ITEMS.length}`); }
  function answer(k) { if (i >= ITEMS.length) return; const it = ITEMS[i]; if (k === it[2]) { score++; m.show(`Yes! A ${it[1]} is ${it[2] ? 'living' : 'non-living'}.`, true); } else m.show(`Not quite. A ${it[1]} is ${it[2] ? 'living — it grows and needs food and water' : 'non-living — it does not grow or eat'}.`); i++; show(); rd.set('s', `${score} / ${i}`); }
  show();
})();
