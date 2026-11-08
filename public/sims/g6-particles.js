(function () {
  const { setup, slider, readout, loop, playButton, canvas, toggle } = Sim;
  const { stage, controls } = setup({ title: 'Particles in three states', grade: 6, subject: 'General Science',
    intro: 'Heat or cool water and watch its particles. Each dot is a particle.',
    notice: ['In a solid the particles stay in place and only vibrate.', 'In a liquid they are close together but slide past each other.', 'In a gas they are far apart and move fast in every direction.', 'Heating gives particles more energy; cooling takes it away.'] });
  const { ctx, w, h } = canvas(stage, 600, 360);
  const n = 64; const P = [];
  for (let i = 0; i < n; i++) P.push({ hx: 230 + (i % 8) * 18, hy: 200 + Math.floor(i / 8) * 18, x: 0, y: 0, vx: 0, vy: 0 });
  P.forEach((p) => { p.x = p.hx; p.y = p.hy; });
  let T = -10, diff = false;
  const rd = readout(controls, [['s', 'State'], ['t', 'Temperature']]);
  slider(controls, { label: 'Temperature', min: -40, max: 160, value: -10, unit: '°C', onInput: (v) => { T = v; } });
  toggle(controls, ['One substance', 'Add a drop of ink (diffusion)'], (i) => { diff = i === 1; P.forEach((p, j) => { p.ink = diff && j < 10; }); });
  const lp = loop(step); playButton(controls, lp);
  function state() { return T < 0 ? 'Solid (ice)' : T < 100 ? 'Liquid (water)' : 'Gas (steam)'; }
  function step(dt) {
    const st = state(); rd.set('s', st); rd.set('t', T + ' °C');
    const speed = 40 + Math.max(0, T + 40) * 2.2;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#F8FAFC'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 3; ctx.strokeRect(20, 20, w - 40, h - 40);
    P.forEach((p) => {
      if (T < 0) { const a = 1 + (T + 40) / 10; p.x += (p.hx - p.x) * 0.3 + (Math.random() - 0.5) * a; p.y += (p.hy - p.y) * 0.3 + (Math.random() - 0.5) * a; }
      else {
        if (!p.vx && !p.vy) { const a = Math.random() * 6.28; p.vx = Math.cos(a); p.vy = Math.sin(a); }
        const top = T < 100 ? h - 150 : 26;
        p.vy += T < 100 ? 0.6 * dt * 60 / speed : 0;
        const norm = Math.hypot(p.vx, p.vy) || 1; p.vx /= norm; p.vy /= norm;
        p.x += p.vx * speed * dt; p.y += p.vy * speed * dt;
        if (p.x < 28) { p.x = 28; p.vx = Math.abs(p.vx); } if (p.x > w - 28) { p.x = w - 28; p.vx = -Math.abs(p.vx); }
        if (p.y < top) { p.y = top; p.vy = Math.abs(p.vy); } if (p.y > h - 28) { p.y = h - 28; p.vy = -Math.abs(p.vy); }
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 6.283); ctx.fillStyle = p.ink ? '#7C3AED' : '#1D5FD1'; ctx.fill();
    });
  }
})();
