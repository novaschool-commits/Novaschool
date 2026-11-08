(function () {
  const { setup, slider, readout, loop, playButton, canvas, buttons } = Sim;
  const { stage, controls } = setup({ title: 'Waves: amplitude, frequency and sound', grade: 7, subject: 'Physics',
    intro: 'Change the amplitude and frequency of the wave. Press "Hear it" to listen to a sound of that pitch.',
    notice: ['Higher frequency means more waves each second and a higher pitch.', 'Bigger amplitude means more energy and a louder sound.', 'Wavelength gets shorter when frequency goes up (the wave speed stays the same).'] });
  const { ctx, w, h } = canvas(stage, 600, 300);
  let A = 50, f = 2, t = 0, ac = null;
  const rd = readout(controls, [['f', 'Frequency'], ['l', 'Wavelength (on screen)'], ['p', 'Pitch'], ['v', 'Loudness']]);
  slider(controls, { label: 'Amplitude', min: 5, max: 110, value: 50, onInput: (v) => { A = v; } });
  slider(controls, { label: 'Frequency', min: 1, max: 6, step: 0.5, value: 2, unit: 'Hz (scaled)', onInput: (v) => { f = v; } });
  buttons(controls, [{ label: 'Hear it (1 second)', onClick: () => {
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 110 * f; g.gain.value = 0.02 + A / 110 * 0.18; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 1); } catch (e) { /* no audio */ }
  } }]);
  const lp = loop((dt) => {
    t += dt; const speed = 150, lam = speed / f; ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#E2E8F0'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = '#1D5FD1'; ctx.lineWidth = 4; ctx.beginPath();
    for (let x = 0; x <= w; x += 2) { const y = h / 2 - A * Math.sin(2 * Math.PI * (x / lam - f * t)); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.fillStyle = '#DC2626'; ctx.beginPath(); ctx.arc(lam * 0.25 + (f * t % 1) * lam, h / 2 - A, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#16A34A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(20, h - 30); ctx.lineTo(20 + lam, h - 30); ctx.stroke(); ctx.fillStyle = '#16A34A'; ctx.font = '13px Inter,sans-serif'; ctx.fillText('one wavelength', 24, h - 38);
    ctx.strokeStyle = '#F59E0B'; ctx.beginPath(); ctx.moveTo(w - 30, h / 2); ctx.lineTo(w - 30, h / 2 - A); ctx.stroke(); ctx.fillStyle = '#B45309'; ctx.fillText('amplitude', w - 100, h / 2 - A - 6);
    rd.set('f', f + ' Hz (scaled)'); rd.set('l', Math.round(lam) + ' px'); rd.set('p', f < 2.5 ? 'low' : f < 4.5 ? 'medium' : 'high'); rd.set('v', A < 40 ? 'quiet' : A < 80 ? 'medium' : 'loud');
  });
  playButton(controls, lp);
})();
