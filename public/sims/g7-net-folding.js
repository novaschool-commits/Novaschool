(function () {
  const { setup, slider, toggle, readout, el } = Sim;
  const { stage, controls } = setup({ title: 'Folding a net into a solid', grade: 7, subject: 'Mathematics',
    intro: 'A net is a flat shape that folds into a solid. Slide to fold it and see which faces meet.',
    notice: ['A cube net has 6 squares.', 'The surface area of the solid is the total area of its net.', 'Not every arrangement of 6 squares folds into a cube.'] });
  const st = document.createElement('style');
  st.textContent = '.scene{width:100%;height:340px;perspective:900px;display:flex;align-items:center;justify-content:center}.rig{position:relative;width:70px;height:70px;transform-style:preserve-3d;transform:rotateX(-28deg) rotateY(-35deg)}.f{position:absolute;width:70px;height:70px;border:2px solid #1E3A8A;background:rgba(147,197,253,.92);transform-style:preserve-3d;display:flex;align-items:center;justify-content:center;font-weight:700;color:#1E3A8A;backface-visibility:visible}';
  document.head.appendChild(st);
  const scene = el('div', { class: 'scene' }, stage); const rig = el('div', { class: 'rig' }, scene);
  // base face with four children; the top face hangs off the back face.
  const base = el('div', { class: 'f' }, rig, '1');
  const mk = (txt, parent, css) => { const f = el('div', { class: 'f' }, parent, txt); f.style.cssText = css; return f; };
  const front = mk('2', base, 'top:100%;left:0;transform-origin:top center');
  const back = mk('3', base, 'bottom:100%;left:0;transform-origin:bottom center');
  const left = mk('4', base, 'right:100%;top:0;transform-origin:right center');
  const right = mk('5', base, 'left:100%;top:0;transform-origin:left center');
  const top = mk('6', back, 'bottom:100%;left:0;transform-origin:bottom center');
  base.style.transform = 'rotateX(90deg)';
  let k = 0, view = 0;
  const rd = readout(controls, [['s', 'Folded'], ['a', 'Surface area (side 3 cm)']]);
  slider(controls, { label: 'Fold', min: 0, max: 100, value: 0, unit: '%', onInput: (v) => { k = v / 100; draw(); } });
  toggle(controls, ['Tilted view', 'From above'], (i) => { view = i; draw(); });
  function draw() {
    const a = 90 * k;
    front.style.transform = `rotateX(${-a}deg)`; back.style.transform = `rotateX(${a}deg)`;
    left.style.transform = `rotateY(${-a}deg)`; right.style.transform = `rotateY(${a}deg)`; top.style.transform = `rotateX(${a}deg)`;
    rig.style.transform = view ? 'rotateX(-80deg)' : 'rotateX(-28deg) rotateY(-35deg)';
    rd.set('s', Math.round(k * 100) + '%'); rd.set('a', '6 × 3 × 3 = 54 cm²');
  }
  draw();
})();
