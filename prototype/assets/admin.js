/* Admin workspace — prototype. Reads only existing admin endpoints (GET). */
(function () {
  'use strict';
  const N = window.NovaOS, S = window.NovaSample.admin;
  const { html, icon, num, pct, ago, fmtDate, rs, load, setHTML, card, stat, statSkeleton, empty, errorBox } = N;

  const MODULES = [
    { group: '', items: [{ id: 'overview', label: 'Overview', icon: 'grid', status: 'working' }] },
    { group: 'People', items: [
      { id: 'approvals', label: 'Approvals', icon: 'inbox', status: 'working', desc: 'Admissions, teacher applications, staff invitations and fee payments waiting for a decision.' },
      { id: 'people', label: 'People & Admissions', icon: 'users', status: 'working', desc: 'Students, parents, teachers, admissions and teacher applications.' },
      { id: 'staff', label: 'Staff & Permissions', icon: 'shield', status: 'working', desc: 'Staff accounts, roles and permission sets.' },
    ] },
    { group: 'Teaching & learning', items: [
      { id: 'academics', label: 'Academics', icon: 'cap', status: 'working', desc: 'Academic years, terms, grade bands and curriculum.' },
      { id: 'classes', label: 'Classes & Timetable', icon: 'calendar', status: 'working', desc: 'Sections, class teachers and the weekly timetable.' },
      { id: 'attendance', label: 'Attendance', icon: 'check', status: 'partial', desc: 'Attendance figures from recorded data.', gap: 'Attendance percentages come from records already in the system. A screen for teachers to take daily attendance does not exist yet (risk R2), so a separate "today" figure is not available.' },
      { id: 'homework', label: 'Homework & Assignments', icon: 'doc', status: 'working', desc: 'Assignments set by teachers, submissions and grading.' },
      { id: 'courses', label: 'Courses & Materials', icon: 'book', status: 'working', desc: 'Courses, lessons and the study-materials library.' },
      { id: 'exams', label: 'Examinations', icon: 'exam', status: 'working', desc: 'Quizzes and exams across all classes.' },
      { id: 'gradebook', label: 'Gradebook', icon: 'chart', status: 'working', desc: 'Recorded results and report cards.' },
      { id: 'lab', label: 'Virtual Lab', icon: 'flask', status: 'partial', desc: 'Interactive science experiments.', gap: '3 of the planned 100 experiments are built.' },
    ] },
    { group: 'Operations', items: [
      { id: 'fees', label: 'Fees & Finance', icon: 'wallet', status: 'partial', desc: 'Invoices, payments and confirmations.', gap: 'Collection figures and payment confirmations work. A screen for creating invoices does not exist yet (risk R2), and no online payment gateway is connected.' },
      { id: 'messages', label: 'Messages & Notices', icon: 'megaphone', status: 'working', desc: 'Announcements and message oversight.' },
      { id: 'reports', label: 'Reports & Analytics', icon: 'pie', status: 'working', desc: 'Exam summaries, admissions and usage analytics.' },
      { id: 'notifications', label: 'Notifications', icon: 'bell', status: 'working', desc: 'Alerts for the administration.' },
      { id: 'settings', label: 'School Settings', icon: 'gear', status: 'working', desc: 'School profile, contact details and exam authority.' },
    ] },
  ];
  const ALL = MODULES.flatMap((g) => g.items);
  const page = ALL.some((m) => m.id === N.params.get('page')) ? N.params.get('page') : 'overview';

  // Approval kinds: each maps to an existing endpoint and a tab on the Approvals page.
  const KINDS = {
    admissions: { label: 'Student admissions', short: 'Admissions', icon: 'users' },
    'teacher-applications': { label: 'Teacher applications', short: 'Teachers', icon: 'cap' },
    fees: { label: 'Fee payments to confirm', short: 'Fee payments', icon: 'wallet' },
    staff: { label: 'Staff invitations pending', short: 'Staff invites', icon: 'shield' },
  };

  const QUICK = [
    { label: 'Review approvals', icon: 'inbox', href: '?page=approvals' },
    { label: 'Post an announcement', icon: 'megaphone', href: N.appUrl(), note: 'Current app' },
    { label: 'Add a teacher', icon: 'cap', href: N.appUrl(), note: 'Current app' },
    { label: 'Confirm a fee payment', icon: 'wallet', href: '?page=approvals#fees' },
    { label: 'View examinations', icon: 'exam', href: '?page=exams' },
    { label: 'Reports & analytics', icon: 'pie', href: N.appUrl(), note: 'Current app' },
  ];

  const sample = N.mode() === 'sample';
  const userName = sample ? S.user.name : N.userName('Administrator');
  const notif = () => load('/admin/my-notifications', S.notifications);

  const el = N.shell({
    role: 'admin', roleLabel: 'Administration', page, nav: MODULES,
    school: sample ? window.NovaSample.school : 'Your school',
    user: { name: userName, sub: 'Administrator' },
    search: 'Search pages and modules…',
    quick: QUICK,
    notifications: notif,
    onSearch: (q) => { const m = ALL.find((x) => x.label.toLowerCase().includes(q.toLowerCase())); if (m) location.href = '?page=' + m.id; },
    bottom: [
      { id: 'overview', label: 'Home', icon: 'home' },
      { id: 'approvals', label: 'Approvals', icon: 'inbox' },
      { id: 'exams', label: 'Exams', icon: 'exam' },
      { id: 'notifications', label: 'Alerts', icon: 'bell' },
      { id: 'more', label: 'More', icon: 'menu', href: '#menu' },
    ],
  });
  if (!el) return; // redirected to the signed-in person's own workspace

  if (page === 'overview') overview();
  else if (page === 'approvals') approvalsPage();
  else if (page === 'exams') examsPage();
  else if (page === 'notifications') notificationsPage();
  else setHTML(el, N.modulePanel(ALL.find((m) => m.id === page), N.appUrl()));

  const gnum = (g) => { const m = String(g).match(/\d+/); return m ? Number(m[0]) : 999; };
  const gradeLabel = (g) => (/^\d+$/.test(String(g)) ? 'Grade ' + g : String(g));
  const plural = (n, w) => `${num(n)} ${w}${Number(n) === 1 ? '' : (/s$/.test(w) ? 'es' : 's')}`;

  // ---------------------------------------------------------------------
  async function overview() {
    setHTML(el, html`
      <section class="welcome" aria-labelledby="welcomeTitle">
        <div style="position:relative;min-width:0">
          <p id="schoolName" style="font-size:12.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7FD9E4">${sample ? window.NovaSample.school : 'Your school'}</p>
          <h1 id="welcomeTitle">${N.greeting()}, ${userName.split(' ')[0]}</h1>
          <p>Here is what needs your attention across the school today.</p>
          <div class="w-meta"><span class="chip-dark">${icon('calendar')} ${N.today()}</span><span class="chip-dark" id="liveChip">${icon('video')} Checking live classes…</span></div>
        </div>
        <div class="welcome-actions">
          <a class="btn btn-cyan" href="?page=approvals">${icon('inbox')} Review approvals</a>
          <button class="btn btn-on-dark" type="button" id="welcomeQuick">${icon('plus')} Quick action</button>
        </div>
      </section>
      <div class="grid g-4" id="kpis" aria-label="Key figures">${[1, 2, 3, 4].map(statSkeleton)}</div>
      <div class="grid g-3">
        <section class="card attn span-2" aria-labelledby="attn-h">
          <div class="card-head"><div><h2 id="attn-h">Needs attention</h2><span class="sub">Decisions waiting for the administration</span></div><span class="attn-total" id="attnTotal"></span></div>
          <div id="attention">${N.skeletonRows(2)}</div>
        </section>
        ${card('live', 'Live classrooms', { action: html`<span class="live-badge" id="liveBadge"></span>` })}
      </div>
      <section class="card" aria-labelledby="acad-h">
        <div class="card-head"><div><h2 id="acad-h">Academic overview</h2><span class="sub">Enrolment, teaching activity and class capacity</span></div><a class="btn btn-ghost btn-sm" href="?page=classes">Classes</a></div>
        <div id="academic">${N.skeletonRows(4)}</div>
      </section>
      <div class="grid g-3">
        ${card('activity', 'Recent activity', { span: 2, rows: 4 })}
        ${card('quick', 'Quick actions', { rows: 2 })}
      </div>`);
    document.getElementById('welcomeQuick').addEventListener('click', () => N.openModal(QUICK));
    setHTML('quick', html`<div class="qa-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${QUICK.slice(0, 4).map((a) => html`<a class="qa" href="${N.safeUrl(a.href)}" ${a.note ? N.raw('target="_blank" rel="noopener"') : ''}>${icon(a.icon)}<span>${a.label}</span></a>`)}</div>`);

    const [ov, ap, lv, nt, an, st, sec] = await Promise.all([
      load('/admin/overview', S.overview),
      load('/admin/approvals', S.approvals),
      load('/admin/live-classes', S.live),
      notif(),
      load('/admin/announcements-all', S.announcements),
      sample ? Promise.resolve({ ok: false }) : load('/admin/settings', {}),
      load('/admin/sections', S.sections),
    ]);

    if (st.ok && st.data.schoolName) { setHTML('schoolName', st.data.schoolName); document.querySelector('.side-school b').textContent = st.data.schoolName; }

    // KPIs — only figures the server reports; "—" with a reason otherwise.
    if (!ov.ok) setHTML('kpis', html`<div style="grid-column:1/-1" class="card">${errorBox(ov.error)}</div>`);
    else {
      const o = ov.data;
      setHTML('kpis', html`
        ${stat({ label: 'Students', icon: 'users', value: num(o.totalStudents), note: `${num(o.students.active)} active · ${num(o.students.newThisMonth)} new this month` })}
        ${stat({ label: 'Active teachers', icon: 'cap', value: num(o.teachers.active), note: `${plural(o.totalClasses, 'class')} · ${plural(o.courses.subjects, 'subject')}` })}
        ${stat({ label: 'Attendance', icon: 'check', value: o.attendancePct ? pct(o.attendancePct) : '—', meter: o.attendancePct || null, note: o.attendancePct ? 'All recorded days · no daily figure yet' : 'No attendance recorded yet' })}
        ${stat({ label: 'Fee collection', icon: 'wallet', value: o.feeCollectionPct ? pct(o.feeCollectionPct) : '—', meter: o.feeCollectionPct || null, note: o.feeCollectionPct ? 'Of all amounts billed' : 'No payments recorded yet' })}`);
    }

    // Needs attention — each tile opens the matching tab of the Approvals page.
    if (!ap.ok) { setHTML('attention', errorBox(ap.error)); setHTML('attnTotal', ''); }
    else {
      const items = ap.data.items.map((i) => ({ kind: i.anchor, label: (KINDS[i.anchor] || { label: i.label }).label, count: i.count, href: '?page=approvals#' + i.anchor, icon: (KINDS[i.anchor] || { icon: 'doc' }).icon, cta: 'Review' }));
      if (ov.ok && ov.data.pendingSubmissions) items.push({ label: 'Submissions to grade', count: ov.data.pendingSubmissions, href: '?page=homework', icon: 'doc', cta: 'Teachers grade these' });
      const total = items.reduce((s, i) => s + Number(i.count), 0);
      setHTML('attnTotal', items.length ? html`<b>${num(total)}</b> waiting` : '');
      setHTML('attention', items.length
        ? html`<div class="attn-grid">${items.map((i) => html`<a class="attn-tile" href="${N.safeUrl(i.href)}"><span class="li-icon warn">${icon(i.icon)}</span><span class="t-label">${i.label}</span><span class="t-count">${num(i.count)}</span><span class="t-cta">${i.cta} ${icon('arrowR')}</span></a>`)}</div>`
        : html`<div class="all-clear"><span class="li-icon">${icon('check')}</span><div><b>All clear</b><div class="li-sub">No admissions, applications or payments are waiting.</div></div></div>`);
    }

    // Live classrooms — only sessions the server reports as open.
    if (!lv.ok) { setHTML('live', errorBox(lv.error)); setHTML('liveChip', html`${icon('video')} Live status unavailable`); }
    else {
      const s = lv.data.sessions;
      setHTML('liveChip', html`${icon('video')} ${s.length ? `${plural(s.length, 'class')} live now` : 'No live classes right now'}`);
      if (s.length) setHTML('liveBadge', html`<span class="live-dot"></span> LIVE`);
      setHTML('live', s.length
        ? html`<div>${s.map((x) => html`<div class="live-card"><span class="li-icon">${icon('video')}</span><span class="li-main"><span class="li-title">Section ${x.sectionCode}</span><span class="li-sub">${x.teacherName} · started ${ago(x.startedAt)}</span></span><span class="badge b-error">Live</span></div>`)}</div>`
        : empty('No classes are live', 'When a teacher starts a live class it appears here.', 'video'));
    }

    // Academic overview: enrolment · activity · class capacity
    if (!ov.ok) setHTML('academic', errorBox(ov.error));
    else {
      const o = ov.data;
      const grades = o.enrollmentByGrade.slice().sort((a, b) => gnum(a.grade) - gnum(b.grade));
      const max = Math.max(1, ...grades.map((g) => g.count));
      const sections = sec.ok ? sec.data.sections.slice() : [];
      sections.sort((a, b) => (b.capacity ? b.studentCount / b.capacity : 0) - (a.capacity ? a.studentCount / a.capacity : 0));
      const unassigned = sections.filter((x) => x.classTeacher === 'Unassigned').length;
      setHTML('academic', html`<div class="acad">
        <div><div class="acad-h">Students by grade</div>
          ${grades.length ? html`<div class="bars">${grades.map((g) => html`<div class="bar-row"><span class="bar-l">${gradeLabel(g.grade)}</span><span class="bar"><span style="width:${(g.count / max) * 100}%"></span></span><span class="bar-v mono">${num(g.count)}</span></div>`)}</div>` : empty('No students placed yet', 'Enrolment appears once students are in sections.', 'users')}
        </div>
        <div><div class="acad-h">Teaching activity</div>
          <div class="mini-grid">
            <div class="mini"><div class="m-v">${num(o.courses.published)}<span class="muted" style="font-size:13px;font-weight:500"> / ${num(o.courses.total)}</span></div><div class="m-l">Courses published</div><div class="m-s">${plural(o.courses.draft, 'draft')}</div></div>
            <div class="mini"><div class="m-v">${num(o.activeExams)}</div><div class="m-l">Published exams</div><div class="m-s">Open to students</div></div>
            <div class="mini"><div class="m-v">${num(o.totalAssignments)}</div><div class="m-l">Assignments</div><div class="m-s">${num(o.pendingSubmissions)} to grade</div></div>
            <div class="mini"><div class="m-v">${num(o.resultsRecorded)}</div><div class="m-l">Results recorded</div><div class="m-s">All classes</div></div>
            <div class="mini"><div class="m-v">${num(o.activity.dau)}</div><div class="m-l">Signed in today</div><div class="m-s">${num(o.activity.wau)} this week</div></div>
            <div class="mini"><div class="m-v">${num(o.parents.active)}</div><div class="m-l">Parent accounts</div><div class="m-s">${num(o.parents.total)} linked</div></div>
          </div>
        </div>
        <div><div class="acad-h">Class capacity${unassigned ? html` · <span style="color:var(--warning-text)">${plural(unassigned, 'class')} without a class teacher</span>` : ''}</div>
          ${!sec.ok ? errorBox(sec.error) : sections.length ? html`<div style="padding:6px 0 12px">${sections.slice(0, 6).map((x) => { const f = x.capacity ? Math.round((x.studentCount / x.capacity) * 100) : null; return html`<div class="sec-row"><span class="code">${x.sectionCode}</span><span style="min-width:0"><span class="meter ${f === null ? '' : f >= 95 ? 'bad' : f >= 85 ? 'warn' : 'good'}"><span style="width:${f === null ? 0 : Math.min(100, f)}%"></span></span><span class="who">${x.classTeacher}</span></span><span class="fill">${num(x.studentCount)}${x.capacity ? ' / ' + num(x.capacity) : ''}</span></div>`; })}</div>` : empty('No classes yet', 'Sections appear here once created.', 'calendar')}
        </div>
      </div>`);
    }

    // Recent activity: alerts + announcements, newest first
    const acts = [];
    if (nt.ok) nt.data.notifications.forEach((n) => acts.push({ ic: n.priority === 'critical' ? 'alert' : 'bell', warn: n.priority === 'critical', t: n.message, s: 'Alert', at: n.createdAt }));
    if (an.ok) an.data.announcements.forEach((a) => acts.push({ ic: 'megaphone', t: a.title, s: `Announcement · ${a.audience === 'all' ? 'everyone' : a.audience}`, at: a.created_at }));
    acts.sort((a, b) => new Date(b.at) - new Date(a.at));
    setHTML('activity', !nt.ok && !an.ok ? errorBox(nt.error || an.error)
      : acts.length ? html`<ul class="list">${acts.slice(0, 6).map((a) => html`<li><span class="li-icon ${a.warn ? 'warn' : ''}">${icon(a.ic)}</span><span class="li-main"><span class="li-title">${a.t}</span><span class="li-sub">${a.s}</span></span><span class="li-time">${ago(a.at)}</span></li>`)}</ul>`
      : empty('No recent activity', 'Announcements and alerts will show here.'));
  }

  // ---------------------------------------------------------------------
  // Approvals: read-only lists from existing endpoints. Decisions are still
  // made in the current app. Uploaded photos/documents are never rendered here
  // (they are untrusted files); only their presence is shown.
  async function approvalsPage() {
    const start = KINDS[location.hash.slice(1)] ? location.hash.slice(1) : 'admissions';
    setHTML(el, html`<div class="page-head"><div><h1>Approvals</h1><p>Everything waiting for a decision. Open a record to see its details.</p></div><a class="btn btn-secondary btn-sm" href="${N.appUrl()}" target="_blank" rel="noopener">Decide in current app ${icon('arrowR')}</a></div>
      <div class="tabs" role="tablist" aria-label="Approval type" id="apTabs">${Object.keys(KINDS).map((k) => html`<button type="button" role="tab" id="tab-${k}" aria-controls="apPanel" aria-selected="${k === start ? 'true' : 'false'}" data-k="${k}">${KINDS[k].short}<span class="tab-count" id="cnt-${k}">…</span></button>`)}</div>
      <section class="card" id="apPanel" role="tabpanel" aria-labelledby="tab-${start}"><div id="apList">${N.skeletonRows(3)}</div></section>`);

    const [adm, tch, fee, stf] = await Promise.all([
      load('/admin/admissions', S.admissions),
      load('/admin/teacher-applications', S.teacherApps),
      load('/admin/invoices/pending-confirmation', S.feeClaims),
      load('/management/staff', S.staff),
    ]);
    const data = {
      admissions: adm.ok ? { ok: true, rows: adm.data.applications.map((a) => ({ id: a.id, title: a.applicantName, sub: `${a.gradeApplied || 'Grade not given'} · applied ${ago(a.submittedAt)}`, badge: a.entranceScore !== null && a.entranceScore !== undefined ? `Test ${a.entranceScore}%` : 'No test score',
        kv: [['Grade applied', a.gradeApplied], ['Parent email', a.parentEmail], ['Phone', a.contactPhone], ['Submitted', fmtDate(a.submittedAt)], ['Entrance test', a.entranceScore !== null && a.entranceScore !== undefined ? a.entranceScore + '%' : 'Not taken'], ['Files', [a.hasPhoto ? 'Photo attached' : null, a.documentFilename ? 'Document attached' : null].filter(Boolean).join(' · ') || 'None']] })) } : adm,
      'teacher-applications': tch.ok ? { ok: true, rows: tch.data.applications.map((a) => ({ id: a.id, title: a.applicantName, sub: `${a.subjectApplied || 'Subject not given'} · applied ${ago(a.submittedAt)}`, badge: a.entranceScore !== null && a.entranceScore !== undefined ? `Test ${a.entranceScore}%` : 'No test score',
        kv: [['Subject', a.subjectApplied], ['Email', a.email], ['Phone', a.phone], ['Submitted', fmtDate(a.submittedAt)], ['Entrance test', a.entranceScore !== null && a.entranceScore !== undefined ? a.entranceScore + '%' : 'Not taken'], ['CV', a.documentFilename ? 'Attached' : 'None']] })) } : tch,
      fees: fee.ok ? { ok: true, rows: fee.data.invoices.map((i) => ({ id: i.id, title: i.studentName, sub: `${i.term} · ${rs(i.amountDue)} · marked paid ${ago(i.claimedAt)}`, badge: 'Awaiting office',
        kv: [['Admission no.', i.admissionNo], ['Term', i.term], ['Amount', rs(i.amountDue)], ['Due date', fmtDate(i.dueDate)], ['Parent note', i.paymentNote || 'No note'], ['Marked paid', fmtDate(i.claimedAt)]] })) } : fee,
      staff: stf.ok ? { ok: true, rows: stf.data.staff.filter((x) => x.status === 'invited').map((x) => ({ id: x.id, title: `${x.firstName} ${x.lastName}`, sub: `${x.roleName || 'No role'} · invited ${ago(x.invitedAt)}`, badge: 'Not activated',
        kv: [['Email', x.email], ['Role', x.roleName], ['Invited', fmtDate(x.invitedAt)]] })) } : stf,
    };
    Object.keys(KINDS).forEach((k) => setHTML('cnt-' + k, data[k].ok ? String(data[k].rows.length) : '!'));

    const show = (k) => {
      document.querySelectorAll('#apTabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k)));
      document.getElementById('apPanel').setAttribute('aria-labelledby', 'tab-' + k);
      const d = data[k];
      if (!d.ok) return setHTML('apList', errorBox(d.error));
      setHTML('apList', d.rows.length ? html`${d.rows.map((r) => html`<div class="rec">
          <button type="button" aria-expanded="false" aria-controls="rec-${k}-${r.id}"><span class="li-icon warn">${icon(KINDS[k].icon)}</span><span class="li-main"><span class="li-title">${r.title}</span><span class="li-sub">${r.sub}</span></span><span class="badge desktop-only">${r.badge}</span>${icon('chevronR', 'chev')}</button>
          <div class="rec-body" id="rec-${k}-${r.id}" hidden><div class="kv">${r.kv.map(([a, b]) => html`<div><span>${a}</span>${b || '—'}</div>`)}</div><a class="btn btn-primary btn-sm" href="${N.appUrl()}" target="_blank" rel="noopener">Decide in current app ${icon('arrowR')}</a></div>
        </div>`)}`
        : html`<div class="all-clear"><span class="li-icon">${icon('check')}</span><div><b>Nothing waiting</b><div class="li-sub">No ${KINDS[k].label.toLowerCase()} right now.</div></div></div>`);
    };
    document.getElementById('apTabs').addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) { history.replaceState(null, '', '#' + b.dataset.k); show(b.dataset.k); } });
    document.getElementById('apList').addEventListener('click', (e) => {
      const b = e.target.closest('.rec > button'); if (!b) return;
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      document.getElementById(b.getAttribute('aria-controls')).hidden = !open;
    });
    show(start);
  }

  // ---------------------------------------------------------------------
  async function examsPage() {
    setHTML(el, html`<div class="page-head"><div><h1>Examinations</h1><p>Quizzes and exams across all classes.</p></div><div class="row wrap"><a class="btn btn-secondary btn-sm" href="${N.appUrl()}" target="_blank" rel="noopener">Open full module ${icon('arrowR')}</a></div></div>
      <section class="card"><div class="card-head"><h2>All exams</h2><span class="badge plain" id="examCount">…</span></div><div id="examTable">${N.skeletonRows(4)}</div></section>`);
    const r = await load('/admin/exams', S.exams);
    if (!r.ok) return setHTML('examTable', errorBox(r.error));
    const ex = r.data.exams || [];
    setHTML('examCount', `${ex.length} total`);
    setHTML('examTable', ex.length ? html`<div class="table-wrap"><table class="tbl cards"><thead><tr><th>Exam</th><th>Class</th><th>Duration</th><th>Questions</th><th>Status</th><th class="num">To grade</th></tr></thead><tbody>
      ${ex.map((e) => html`<tr><td data-label="Exam"><b>${e.title}</b><div class="li-sub">${e.subject}</div></td><td data-label="Class">${e.sectionCode}</td><td data-label="Duration">${e.durationMinutes ? e.durationMinutes + ' min' : '—'}</td><td data-label="Questions" class="mono">${num(e.questionCount)}</td><td data-label="Status">${e.isPublished ? html`<span class="badge b-success">Published</span>` : html`<span class="badge">Draft</span>`}</td><td data-label="To grade" class="num">${e.pendingGrading ? html`<span class="badge b-warning">${num(e.pendingGrading)}</span>` : '0'}</td></tr>`)}
      </tbody></table></div>` : empty('No exams yet', 'Teachers create quizzes and exams from their workspace.', 'exam'));
  }

  async function notificationsPage() {
    setHTML(el, html`<div class="page-head"><div><h1>Notifications</h1><p>Alerts for the administration, newest first.</p></div></div><section class="card"><div id="nList">${N.skeletonRows(4)}</div></section>`);
    const r = await notif();
    if (!r.ok) return setHTML('nList', errorBox(r.error));
    const n = r.data.notifications;
    setHTML('nList', n.length ? html`<ul class="list">${n.map((x) => html`<li><span class="li-icon ${x.priority === 'critical' ? 'warn' : ''}">${icon(x.priority === 'critical' ? 'alert' : 'bell')}</span><span class="li-main"><span class="li-title" style="white-space:normal">${x.message}</span><span class="li-sub">${fmtDate(x.createdAt)} · ${x.type}</span></span>${x.read ? '' : html`<span class="badge b-royal">New</span>`}</li>`)}</ul>` : empty('You are all caught up', 'New alerts will appear here.', 'bell'));
  }
})();
