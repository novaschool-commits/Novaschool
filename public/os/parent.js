/* Parent workspace — prototype. Reads only existing parent endpoints, and
   only for children the server confirms are linked to this parent. */
(function () {
  'use strict';
  const N = window.NovaOS, S = { dashboards: {} };
  const { html, icon, num, ago, rs, fmtDate, load, setHTML, card, stat, statSkeleton, empty, errorBox } = N;

  const MODULES = [
    { group: '', items: [{ id: 'dashboard', label: 'Overview', icon: 'grid', status: 'working' }] },
    { group: 'My children', items: [
      { id: 'results', app: 'parent', label: 'Result cards', icon: 'chart', status: 'working', desc: 'View and download each child’s result card.' },
      { id: 'fees', app: 'parent', label: 'Fees', icon: 'wallet', status: 'partial', desc: 'Invoices and payments.', gap: 'You can see balances and tell the office you have paid. No online payment gateway is connected yet.' },
      { id: 'messages', app: 'parent', label: 'Messages', icon: 'chat', status: 'working', desc: 'Messages with teachers and the school office.' },
      { id: 'notices', app: 'parent', label: 'Notices', icon: 'megaphone', status: 'working', desc: 'Announcements from the school.' },
    ] },
  ];
  const ALL = MODULES.flatMap((g) => g.items);
  const page = ALL.some((m) => m.id === N.params.get('page')) ? N.params.get('page') : 'dashboard';
  const name = N.userName('Parent');

  const el = N.shell({
    role: 'parent', roleLabel: 'Parent', page, nav: MODULES,
    school: 'Your school',
    user: { name, sub: 'Parent' }, search: 'Search…',
    bottom: [
      { id: 'dashboard', label: 'Home', icon: 'home' },
      { id: 'results', label: 'Results', icon: 'chart' },
      { id: 'fees', app: 'parent', label: 'Fees', icon: 'wallet' },
      { id: 'messages', app: 'parent', label: 'Messages', icon: 'chat' },
      { id: 'more', label: 'More', icon: 'menu', href: '#menu' },
    ],
  });
  if (!el) return; // redirected to the signed-in person's own workspace

  if (page === 'dashboard') dashboard();
  else { const mod = ALL.find((m) => m.id === page); if (mod.app) location.replace(N.appUrl(mod.app)); else setHTML(el, N.modulePanel(mod, N.appUrl())); }

  async function dashboard() {
    setHTML(el, html`
      <section class="welcome">
        <div style="position:relative;min-width:0">
          <p style="font-size:12.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7FD9E4">Parent</p>
          <h1>${N.greeting()}, ${name.split(' ')[0]}</h1>
          <p>How your children are doing, in one place.</p>
          <div class="w-meta"><span class="chip-dark">${icon('calendar')} ${N.today()}</span></div>
        </div>
        <div class="welcome-actions"><a class="btn btn-cyan" href="/app#parent">${icon('download')} Result cards</a><a class="btn btn-on-dark" href="/app#parent">${icon('chat')} Message a teacher</a></div>
      </section>
      <div role="tablist" aria-label="Children" class="row wrap" id="kids"><div class="skeleton" style="height:44px;width:220px"></div></div>
      <div class="grid g-4" id="kpis">${[1, 2, 3, 4].map(statSkeleton)}</div>
      <div class="grid g-3">
        ${card('att', 'Attendance by week', { rows: 3 })}
        ${card('marks', 'Recent marks', { rows: 3 })}
        ${card('fee', 'Fees', { rows: 2 })}
      </div>
      ${card('ann', 'School notices', { rows: 2 })}`);

    const [kids, fees, ann] = await Promise.all([load('/parent/children', S.children), load('/parent/fees-summary', S.fees), load('/parent/announcements', S.announcements)]);
    setHTML('ann', !ann.ok ? errorBox(ann.error) : ann.data.announcements.length ? html`<ul class="list">${ann.data.announcements.map((a) => html`<li><span class="li-icon">${icon('megaphone')}</span><span class="li-main"><span class="li-title">${a.title}</span><span class="li-sub">${a.body}</span></span><span class="li-time">${ago(a.created_at)}</span></li>`)}</ul>` : empty('No notices', '', 'megaphone'));
    if (!kids.ok) { setHTML('kids', ''); setHTML('kpis', html`<div class="card" style="grid-column:1/-1">${errorBox(kids.error)}</div>`); return; }
    const list = kids.data.children;
    if (!list.length) { setHTML('kids', ''); setHTML('kpis', html`<div class="card" style="grid-column:1/-1">${empty('No children linked yet', 'Ask the school office to link your child to this account.', 'child')}</div>`); ['att', 'marks', 'fee'].forEach((id) => setHTML(id, empty('Nothing to show', ''))); return; }

    const select = async (child) => {
      document.querySelectorAll('#kids [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.id) === child.id)));
      ['att', 'marks', 'fee'].forEach((id) => setHTML(id, N.skeletonRows(2)));
      const d = await load('/parent/dashboard/' + Number(child.id), () => S.dashboards[child.id]);
      if (!d.ok) { ['att', 'marks', 'fee'].forEach((id) => setHTML(id, errorBox(d.error))); return; }
      const x = d.data;
      const trend = x.attendanceTrend;
      const attAvg = trend.length ? Math.round(trend.reduce((s, w) => s + w.pct, 0) / trend.length) : null;
      const av = N.avgScore(x.grades); const avg = av ? av.avg : null;
      const inv = x.invoice; const bal = inv ? Number(inv.amount_due) - Number(inv.amount_paid) : null;
      setHTML('kpis', html`
        ${stat({ label: 'Class', icon: 'cap', value: child.section_code || '—', note: [child.grade, child.section_name && 'Section ' + child.section_name].filter(Boolean).join(' · ') })}
        ${stat({ label: 'Attendance', icon: 'check', value: attAvg === null ? '—' : attAvg + '%', meter: attAvg, note: attAvg === null ? 'Not recorded yet' : `Last ${trend.length} weeks` })}
        ${stat({ label: 'Recent average', icon: 'chart', value: avg === null ? '—' : avg + '%', note: avg === null ? (x.grades.length ? 'Marks are letter grades' : 'No marks yet') : `From ${av.n} recent mark${av.n > 1 ? 's' : ''}` })}
        ${stat({ label: 'Balance due', icon: 'wallet', value: bal === null ? '—' : rs(bal), note: inv ? `${inv.term} · due ${fmtDate(inv.due_date)}` : 'No invoice' })}`);
      setHTML('att', trend.length ? html`<div class="bars">${trend.map((w) => html`<div class="bar-row"><span class="bar-l">${w.week}</span><span class="bar"><span style="width:${w.pct}%;${w.pct < 75 ? 'background:var(--warning)' : ''}"></span></span><span class="bar-v mono">${w.pct}%</span></div>`)}</div>` : empty('No attendance yet', 'Weekly attendance appears once it is recorded.', 'check'));
      setHTML('marks', x.grades.length ? html`<ul class="list">${x.grades.map((g) => html`<li><span class="li-main"><span class="li-title">${g.subject}</span><span class="li-sub">${g.assessment}</span></span><b class="mono">${N.score(g.score).label}</b></li>`)}</ul>` : empty('No marks yet', '', 'chart'));
      const ST = { paid: ['Paid', 'b-success'], pending: ['Due', 'b-warning'], overdue: ['Overdue', 'b-error'], pending_confirmation: ['Awaiting office', 'b-royal'] };
      setHTML('fee', inv ? html`<div class="card-body stack" style="gap:12px">
          <div class="row between"><span class="muted">${inv.term}</span><span class="badge ${(ST[inv.status] || ['', ''])[1]}">${(ST[inv.status] || [inv.status])[0]}</span></div>
          <div class="row between"><span>Billed</span><b class="mono">${rs(inv.amount_due)}</b></div>
          <div class="row between"><span>Paid</span><b class="mono">${rs(inv.amount_paid)}</b></div>
          <div class="meter ${bal <= 0 ? 'good' : 'warn'}"><span style="width:${Number(inv.amount_due) ? Math.min(100, (Number(inv.amount_paid) / Number(inv.amount_due)) * 100) : 0}%"></span></div>
          <div class="row between"><span class="muted">Due ${fmtDate(inv.due_date)}</span><b class="mono">${rs(bal)} left</b></div>
          ${fees.ok && fees.data.totalDue > 0 ? html`<p class="li-sub">All children: ${rs(fees.data.totalDue)} outstanding.</p>` : ''}
        </div>` : empty('No invoice', 'Fee invoices appear here when issued.', 'wallet'));
    };

    setHTML('kids', html`${list.map((c, i) => html`<button type="button" role="tab" class="btn btn-secondary kid-tab" data-id="${c.id}" aria-selected="${i === 0 ? 'true' : 'false'}"><span class="avatar" style="width:28px;height:28px;font-size:11px">${N.initials(c.first_name + ' ' + c.last_name)}</span>${c.first_name} ${c.last_name}</button>`)}`);
    document.querySelectorAll('#kids [role=tab]').forEach((b) => b.addEventListener('click', () => select(list.find((c) => c.id === Number(b.dataset.id)))));
    select(list[0]);
  }
})();
