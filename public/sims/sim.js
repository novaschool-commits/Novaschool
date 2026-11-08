/* NovaSchool simulations: shared helpers. Pages hold no school data. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setup(o) {
    document.title = o.title + ' · NovaSchool Simulations';
    if (o.grade <= 5) document.body.classList.add('young');
    const m = document.getElementById('sim');
    const top = el('div', { class: 'top' }, m);
    const back = el('a', { href: '/student.html?page=sims' }, top, '← All simulations');
    try { const u = JSON.parse(localStorage.getItem('nova_user') || 'null'); if (u && u.role === 'teacher') back.setAttribute('href', '/teacher.html?page=books'); } catch (e) { /* ignore */ }
    const chips = el('div', { class: 'chips' }, top);
    el('span', { class: 'chip' }, chips, 'Grade ' + o.grade);
    el('span', { class: 'chip t' }, chips, o.subject);
    el('h1', {}, m, o.title);
    el('p', { class: 'intro' }, m, o.intro);
    const lay = el('div', { class: 'layout' }, m);
    const stage = el('div', { class: 'card stage', role: 'img', 'aria-label': o.title }, lay);
    const controls = el('div', { class: 'card controls' }, lay);
    if (o.notice && o.notice.length) {
      const n = el('section', { class: 'card notice' }, m);
      el('h2', {}, n, 'Things to notice');
      const ol = el('ol', {}, n);
      o.notice.forEach((t) => el('li', {}, ol, t));
    }
    el('p', { class: 'foot' }, m, 'The Nova Research Curriculum · a simplified model for learning; real measurements can differ.');
    return { stage, controls };
  }
  function slider(parent, o) {
    const w = el('div', { class: 'ctl' }, parent);
    const id = 's' + Math.random().toString(36).slice(2, 8);
    const lab = el('label', { for: id }, w);
    el('span', {}, lab, o.label);
    const out = el('output', { for: id }, lab);
    const inp = el('input', { type: 'range', id, min: o.min, max: o.max, step: o.step || 1, value: o.value }, w);
    const fmt = o.format || ((v) => v + (o.unit ? ' ' + o.unit : ''));
    const upd = () => { out.textContent = fmt(Number(inp.value)); if (o.onInput) o.onInput(Number(inp.value)); };
    inp.addEventListener('input', upd);
    out.textContent = fmt(Number(inp.value));
    return { input: inp, get value() { return Number(inp.value); }, set(v) { inp.value = v; upd(); } };
  }
  function buttons(parent, list) {
    const w = el('div', { class: 'btns' }, parent);
    return list.map((b) => { const x = el('button', { type: 'button', class: b.primary ? 'p' : '' }, w, b.label); x.addEventListener('click', b.onClick); return x; });
  }
  function toggle(parent, labels, onChange, start) {
    const w = el('div', { class: 'btns', role: 'group' }, parent);
    const bs = labels.map((l, i) => { const b = el('button', { type: 'button', 'aria-pressed': String(i === (start || 0)) }, w, l); b.addEventListener('click', () => { bs.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); onChange(i); }); return b; });
    return bs;
  }
  function readout(parent, rows) {
    const w = el('div', { class: 'read', 'aria-live': 'polite' }, parent);
    const map = {};
    rows.forEach((r) => { el('span', {}, w, r[1]); map[r[0]] = el('b', {}, w, '—'); });
    return { set(k, v) { map[k].textContent = v; } };
  }
  function msg(parent) { const m = el('div', { class: 'msg', 'aria-live': 'polite' }, parent); m.hidden = true; return { show(t, ok) { m.hidden = false; m.textContent = t; m.className = 'msg' + (ok ? ' ok' : ''); }, hide() { m.hidden = true; } }; }
  // Animation loop with play/pause; stops when the tab is hidden.
  function loop(fn, startPlaying) {
    let on = startPlaying !== false && !reduced, last = 0, raf = 0;
    function step(t) { const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t; fn(dt); if (on) raf = requestAnimationFrame(step); }
    function play() { if (on) return; on = true; last = 0; raf = requestAnimationFrame(step); }
    function pause() { on = false; cancelAnimationFrame(raf); }
    document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); } });
    if (on) raf = requestAnimationFrame(step); else fn(0);
    return { play, pause, get playing() { return on; }, once() { fn(0); } };
  }
  function playButton(parent, lp) {
    const [b] = buttons(parent, [{ label: lp.playing ? 'Pause' : 'Play', primary: true, onClick: () => { if (lp.playing) { lp.pause(); b.textContent = 'Play'; } else { lp.play(); b.textContent = 'Pause'; } } }]);
    return b;
  }
  function canvas(stage, w, h) {
    const c = el('canvas', { width: w * 2, height: h * 2 }, stage);
    const ctx = c.getContext('2d'); ctx.scale(2, 2);
    return { c, ctx, w, h };
  }
  window.Sim = { el, svg, setup, slider, buttons, toggle, readout, msg, loop, playButton, canvas, reduced };
})();
