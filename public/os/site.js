/* Public pages: homepage, architecture, design system, sign-in. */
(function () {
  'use strict';
  const N = window.NovaOS;
  const { html, icon, setHTML } = N;

  // Icons for static markup: <i data-icon="name"></i>
  document.querySelectorAll('i[data-icon]').forEach((i) => { i.outerHTML = N.flat(icon(i.dataset.icon)); });
  // Links to the current app (Apply / Log in in the real site)

  // Mobile site menu
  const mb = document.getElementById('siteMenuBtn');
  if (mb) mb.addEventListener('click', () => {
    const m = document.getElementById('siteMenu'); const on = m.hidden; m.hidden = !on; mb.setAttribute('aria-expanded', String(on));
  });

  // ---------------------------------------------------------------- ecosystem
  // Status reflects the real application today. Planned items stay planned.
  const OS = [
    { id: 'academic', name: 'Academic OS', icon: 'cap', s: 'working', text: 'Years, terms, classes, timetable, courses and results in one academic record.',
      items: [['Academic years & terms', 'working'], ['Sections & timetable', 'working'], ['Courses & units', 'working'], ['Gradebook & result cards', 'working'], ['Curriculum Map', 'planned']] },
    { id: 'people', name: 'People OS', icon: 'users', s: 'working', text: 'Everyone in the school, with the right access for their role.',
      items: [['Online admissions & entrance test', 'working'], ['Students, parents & teachers', 'working'], ['Staff roles & permissions', 'working'], ['Teacher applications', 'working']] },
    { id: 'classroom', name: 'Classroom OS', icon: 'video', s: 'working', text: 'The live school day: lessons, homework and assessment.',
      items: [['Live classes with whiteboard', 'working'], ['Assignments & submissions', 'working'], ['Quizzes & exams', 'working'], ['Daily attendance register', 'planned']] },
    { id: 'learning', name: 'Learning OS', icon: 'book', s: 'partial', text: 'Resources students can return to after class.',
      items: [['Study materials library', 'working'], ['Whiteboard recordings', 'working'], ['Virtual Lab (3 experiments)', 'partial'], ['AI Tutor', 'planned']] },
    { id: 'finance', name: 'Finance OS', icon: 'wallet', s: 'partial', text: 'Fee balances parents can see and the office can confirm.',
      items: [['Invoices & balances for parents', 'working'], ['Payment confirmation by the office', 'working'], ['Invoice creation screen', 'planned'], ['Online payment gateway', 'planned']] },
    { id: 'communication', name: 'Communication OS', icon: 'chat', s: 'working', text: 'Messages and notices that reach the right people.',
      items: [['Messages between teachers & families', 'working'], ['School announcements', 'working'], ['Admin alerts', 'working']] },
    { id: 'intelligence', name: 'Intelligence OS', icon: 'sparkles', s: 'planned', text: 'Future assistance built on the school’s own data. Not available yet.',
      items: [['Reports & at-risk list (in Admin)', 'working'], ['AI Tutor', 'planned'], ['Second Brain', 'planned'], ['Curriculum Map', 'planned']] },
  ];
  const TAG = { academic: 'Years, timetable, courses, results', people: 'Admissions, staff and roles', classroom: 'Live classes, homework, quizzes', learning: 'Materials, recordings, Virtual Lab',
    finance: 'Balances and payment confirmation', communication: 'Messages, notices and alerts', intelligence: 'AI help — not available yet' };
  const stLabel = (s) => html`<span class="st st-${s}">${N.STATUS[s].label}</span>`;
  const stage = document.getElementById('ecoStage');
  if (stage) {
    // Radial layout in a 100 x 90 box (the stage keeps a 10:9 shape).
    const RX = 36, RY = 33;
    const pos = OS.map((o, i) => { const a = (-90 + (360 / OS.length) * i) * Math.PI / 180; return { x: 50 + RX * Math.cos(a), y: 45 + RY * Math.sin(a) }; });
    const motion = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setHTML(stage, html`
      <svg class="ecx-svg" id="ecxSvg" viewBox="0 0 100 90" preserveAspectRatio="none" aria-hidden="true">
        <ellipse class="orbit" cx="50" cy="45" rx="${RX}" ry="${RY}"/>
        ${pos.map((p, i) => html`<line class="ln ${OS[i].s}" data-id="${OS[i].id}" x1="50" y1="45" x2="${p.x.toFixed(2)}" y2="${p.y.toFixed(2)}"/>`)}
        ${motion ? pos.map((p, i) => OS[i].s === 'planned' ? '' : html`<circle class="pulse" r="0.7"><animateMotion dur="${(2.4 + i * 0.23).toFixed(2)}s" repeatCount="indefinite" path="M50,45 L${p.x.toFixed(2)},${p.y.toFixed(2)}"/></circle>`) : ''}
      </svg>
      <div class="ecx-core"><img src="/assets/ns-mark-light.png" alt=""><b>NOVASCHOOL OS</b><span>One school record</span></div>
      ${OS.map((o, i) => html`<button type="button" class="ecx-node s-${o.s}" data-id="${o.id}" aria-pressed="false" aria-controls="ecoDetail" style="left:${pos[i].x.toFixed(2)}%;top:${(pos[i].y / 90 * 100).toFixed(2)}%">${icon(o.icon)}<b>${o.name}</b>${stLabel(o.s)}<small>${TAG[o.id]}</small></button>`)}`);
    const svg = document.getElementById('ecxSvg');
    const show = (id) => {
      const o = OS.find((x) => x.id === id);
      stage.querySelectorAll('.ecx-node').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      svg.classList.add('focus');
      svg.querySelectorAll('.ln').forEach((l) => l.classList.toggle('on', l.dataset.id === id));
      setHTML('ecoDetail', html`<div class="row between wrap"><h3>${o.name}</h3>${N.statusBadge(o.s)}</div><p class="lead" style="margin-top:8px;font-size:15px">${o.text}</p>
        <ul>${o.items.map(([t, s]) => html`<li><span>${t}</span>${N.statusBadge(s)}</li>`)}</ul>`);
    };
    stage.addEventListener('click', (e) => { const b = e.target.closest('.ecx-node'); if (b) show(b.dataset.id); });
    stage.addEventListener('mouseover', (e) => { const b = e.target.closest('.ecx-node'); if (b) svg.querySelectorAll('.ln').forEach((l) => l.classList.toggle('on', l.dataset.id === b.dataset.id || l.dataset.id === (stage.querySelector('[aria-pressed=true]') || {}).dataset?.id)); });
    show('classroom');
  }
  const list = document.getElementById('ecoList');
  if (list) {
    setHTML(list, html`<div class="ecx-hub"><img src="/assets/ns-mark-light.png" alt=""><div><b>NOVASCHOOL OS</b><span>Seven parts, one school record. Tap a part to see what works today.</span></div></div>
      <ol class="ecx-spine">${OS.map((o, i) => html`<li class="s-${o.s}"><div class="ecx-item">
        <button type="button" aria-expanded="${i === 2 ? 'true' : 'false'}" aria-controls="ecm-${o.id}">${icon(o.icon)}<b>${o.name}</b>${stLabel(o.s)}<small>${TAG[o.id]}</small>${icon('chevronR', 'chev')}</button>
        <ul id="ecm-${o.id}" ${i === 2 ? '' : N.raw('hidden')}>${o.items.map(([t, s]) => html`<li><span>${t}</span>${stLabel(s)}</li>`)}</ul>
      </div></li>`)}</ol>`);
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.ecx-item > button'); if (!b) return;
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      document.getElementById(b.getAttribute('aria-controls')).hidden = !open;
    });
  }

  // ------------------------------------------------------------- architecture
  const filt = document.getElementById('archFilter');
  if (filt) filt.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    filt.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const a = document.getElementById('arch');
    a.classList.toggle('only-working', b.dataset.f === 'working');
    a.classList.toggle('only-planned', b.dataset.f === 'planned');
  });
  document.querySelectorAll('[data-status]').forEach((el) => { el.outerHTML = N.flat(N.statusBadge(el.dataset.status)); });

  // ------------------------------------------------------------ design system
  const md = document.getElementById('demoModal');
  if (md) md.addEventListener('click', () => N.openModal([
    { label: 'Post an announcement', icon: 'megaphone', href: '#' }, { label: 'Add a teacher', icon: 'cap', href: '#' },
    { label: 'Review admissions', icon: 'users', href: '#' }, { label: 'Confirm a payment', icon: 'wallet', href: '#' }]));
  if (md && !document.getElementById('modal')) {
    document.body.insertAdjacentHTML('beforeend', '<div class="modal-backdrop" id="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal" id="modalBody"></div></div>');
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') N.closeModal(); });
  }
  const dd = document.getElementById('demoDropBtn');
  if (dd) {
    const menu = document.getElementById('demoDrop');
    dd.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); dd.setAttribute('aria-expanded', String(menu.classList.contains('open'))); });
    document.addEventListener('click', () => { menu.classList.remove('open'); dd.setAttribute('aria-expanded', 'false'); });
  }
  const pg = document.getElementById('demoPager');
  if (pg) {
    let cur = 1; const total = 5;
    const draw = () => setHTML(pg, html`<span>Showing ${(cur - 1) * 10 + 1}–${cur * 10} of 48</span><div class="pager-btns"><button type="button" data-p="${cur - 1}" ${cur === 1 ? N.raw('disabled') : ''} aria-label="Previous page">‹</button>${Array.from({ length: total }, (_, i) => html`<button type="button" data-p="${i + 1}" ${i + 1 === cur ? N.raw('aria-current="page"') : ''}>${i + 1}</button>`)}<button type="button" data-p="${cur + 1}" ${cur === total ? N.raw('disabled') : ''} aria-label="Next page">›</button></div>`);
    pg.addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (b && !b.disabled) { cur = Number(b.dataset.p); draw(); } });
    draw();
  }

  // ------------------------------------------------------------------ sign-in
  const form = document.getElementById('signinForm');
  if (form) {
    const msg = document.getElementById('signinMsg');
    // Already signed in: go straight to your workspace.
    const cur = N.session.user;
    if (N.session.token && cur && !N.params.get('expired')) location.replace(N.HOME[cur.role] || '/app');
    if (N.params.get('expired')) setHTML(msg, html`<div class="notice sample">${icon('info')}<span>Your session ended. Please sign in again.</span></div>`);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const email = form.email.value.trim(); const password = form.password.value;
      if (!email || !password) { setHTML(msg, html`<div class="error-state" role="alert">${icon('alert')}<span>Enter your email and password.</span></div>`); return; }
      btn.disabled = true; btn.textContent = 'Signing in…'; setHTML(msg, '');
      try {
        N.session.clear();
        const data = await N.api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        N.session.save(data.token, data.user);
        form.password.value = '';
        location.href = N.HOME[data.user.role] || '/app';
      } catch (err) {
        setHTML(msg, html`<div class="error-state" role="alert">${icon('alert')}<span>${err.offline ? 'Could not reach NovaSchool. Check your connection and try again.' : err.message}</span></div>`);
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    });
  }
})();
