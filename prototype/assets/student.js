/* Student workspace — prototype. Reads only existing student and lab endpoints (GET). */
(function () {
  'use strict';
  const N = window.NovaOS, S = window.NovaSample.student;
  const { html, icon, num, ago, time, fmtDate, load, setHTML, card, stat, statSkeleton, empty, errorBox } = N;

  const MODULES = [
    { group: '', items: [{ id: 'dashboard', label: 'Today', icon: 'home', status: 'working' }] },
    { group: 'Learning', items: [
      { id: 'courses', label: 'My Courses', icon: 'book', status: 'working', desc: 'Your courses, units and lessons.' },
      { id: 'materials', label: 'Study Materials', icon: 'layers', status: 'working', desc: 'Notes, images and videos from your teachers.' },
      { id: 'recordings', label: 'Recordings', icon: 'video', status: 'working', desc: 'Saved whiteboards from live classes.' },
      { id: 'lab', label: 'Virtual Lab', icon: 'flask', status: 'partial', desc: 'Interactive science experiments.', gap: '3 of the planned 100 experiments are built.' },
    ] },
    { group: 'Work & results', items: [
      { id: 'assignments', label: 'Homework', icon: 'doc', status: 'working', desc: 'Homework to submit and feedback.' },
      { id: 'exams', label: 'Quizzes & Exams', icon: 'exam', status: 'working', desc: 'Take quizzes and see your marks.' },
      { id: 'results', label: 'Results', icon: 'chart', status: 'working', desc: 'Your marks and downloadable result card.' },
    ] },
    { group: 'Other', items: [
      { id: 'messages', label: 'Messages', icon: 'chat', status: 'working', desc: 'Messages with your teachers.' },
      { id: 'tutor', label: 'AI Tutor', icon: 'sparkles', status: 'planned', desc: 'A study helper that explains topics step by step.' },
    ] },
  ];
  const ALL = MODULES.flatMap((g) => g.items);
  const page = ALL.some((m) => m.id === N.params.get('page')) ? N.params.get('page') : 'dashboard';
  const sample = N.mode() === 'sample';
  const name = sample ? S.user.name : N.userName('Student');

  const el = N.shell({
    role: 'student', roleLabel: 'Student', page, nav: MODULES,
    school: sample ? window.NovaSample.school : 'Your school',
    user: { name, sub: 'Student' }, search: 'Search courses, homework…',
    onSearch: (q) => { const m = ALL.find((x) => x.label.toLowerCase().includes(q.toLowerCase())); if (m) location.href = '?page=' + m.id; },
    bottom: [
      { id: 'dashboard', label: 'Today', icon: 'home' },
      { id: 'assignments', label: 'Homework', icon: 'doc' },
      { id: 'exams', label: 'Quizzes', icon: 'exam' },
      { id: 'results', label: 'Results', icon: 'chart' },
      { id: 'more', label: 'More', icon: 'menu', href: '#menu' },
    ],
  });
  if (!el) return; // redirected to the signed-in person's own workspace

  if (page === 'dashboard') dashboard();
  else setHTML(el, N.modulePanel(ALL.find((m) => m.id === page), N.appUrl()));

  const mins = (t) => { const [h, m] = String(t || '').split(':').map(Number); return Number.isNaN(h) ? null : h * 60 + (m || 0); };
  function localDay(d) { const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(new Date(d).toDateString()); }
  function daysLeft(d) { return d ? Math.round((localDay(d) - new Date(new Date().toDateString())) / 86400000) : null; }
  function dueBox(d) {
    const n = daysLeft(d);
    if (n === null) return html`<span class="due">${icon('doc')}</span>`;
    if (n < 0) return html`<span class="due late"><b>${-n}</b><span>late</span></span>`;
    if (n === 0) return html`<span class="due soon"><b>!</b><span>today</span></span>`;
    return html`<span class="due ${n <= 2 ? 'soon' : ''}"><b>${n}</b><span>${n === 1 ? 'day' : 'days'}</span></span>`;
  }
  function nextClass(tt) {
    const now = new Date(); const m = now.getHours() * 60 + now.getMinutes();
    let cur = null, next = null;
    tt.forEach((c, i) => {
      const s = mins(c.start_time); const e = i + 1 < tt.length ? mins(tt[i + 1].start_time) : s + 45;
      if (s !== null && s <= m && m < e) cur = c;
      if (s !== null && s > m && !next) next = { c, inMin: s - m };
    });
    return { cur, next };
  }

  async function dashboard() {
    setHTML(el, html`
      <section class="welcome">
        <div style="position:relative;min-width:0;flex:1 1 320px">
          <p style="font-size:12.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7FD9E4" id="sSection">Student</p>
          <h1>${N.greeting()}, ${name.split(' ')[0]}</h1>
          <p id="sLine">Here is your day.</p>
          <div class="w-meta"><span class="chip-dark">${icon('calendar')} ${N.today()}</span></div>
        </div>
        <div class="next" id="nextUp" aria-live="polite"><div class="n-k">Next up</div><div class="skeleton" style="height:22px;margin-top:8px;opacity:.3"></div></div>
      </section>
      <div class="grid g-4" id="kpis">${[1, 2, 3, 4].map(statSkeleton)}</div>
      <div class="grid g-3">
        ${card('tt', "Today's timetable", { rows: 3, action: html`<span class="badge plain" id="dayBadge"></span>` })}
        ${card('hw', 'Homework deadlines', { rows: 3, action: html`<a class="btn btn-ghost btn-sm" href="?page=assignments">All</a>` })}
        ${card('quiz', 'Upcoming quizzes & exams', { rows: 3, action: html`<a class="btn btn-ghost btn-sm" href="?page=exams">All</a>` })}
      </div>
      <div class="grid g-3">
        ${card('grades', 'Recent results', { rows: 3, action: html`<a class="btn btn-ghost btn-sm" href="?page=results">Result card</a>` })}
        ${card('learn', 'Courses & study materials', { span: 2, rows: 3 })}
      </div>
      <div class="grid g-3">
        <section class="card lab-card" aria-labelledby="lab-h"><div class="card-head"><h2 id="lab-h">Virtual Lab</h2><span class="lab-count" id="labCount"></span></div><div id="lab">${N.skeletonRows(2)}</div></section>
        ${card('ann', 'Announcements', { span: 2, rows: 2 })}
      </div>`);

    const [d, ex, cr, mt, lb] = await Promise.all([
      load('/student/dashboard', S.dashboard), load('/student/exams', S.exams),
      load('/student/courses', S.courses), load('/student/materials', S.materials), load('/lab/catalog', S.lab),
    ]);

    if (!d.ok) {
      ['tt', 'hw', 'grades', 'ann'].forEach((id) => setHTML(id, errorBox(d.error)));
      setHTML('kpis', html`<div class="card" style="grid-column:1/-1">${errorBox(d.error)}</div>`);
      setHTML('nextUp', html`<div class="n-k">Next up</div><div class="n-s" style="margin-top:6px">Timetable unavailable</div>`);
    } else {
      const x = d.data;
      const upcoming = ex.ok ? ex.data.exams.filter((e) => e.status === 'not_started' || e.status === 'in_progress') : [];
      const av = N.avgScore(x.recentGrades); const avg = av ? av.avg : null;
      setHTML('sSection', x.student.section ? `Section ${x.student.section}` : 'Student');
      setHTML('dayBadge', x.day);
      setHTML('sLine', x.homeworkDue.length ? `${x.homeworkDue.length} piece${x.homeworkDue.length > 1 ? 's' : ''} of homework to hand in${upcoming.length ? ` and ${upcoming.length} quiz${upcoming.length > 1 ? 'zes' : ''} open` : ''}.` : 'No homework waiting.');

      const nc = nextClass(x.timetable);
      setHTML('nextUp', nc.cur ? html`<div class="n-k">Happening now</div><div class="n-t">${nc.cur.subject}</div><div class="n-s">${time(nc.cur.start_time)} · ${nc.cur.room || 'Room not set'}</div><span class="n-when"><span class="live-dot" style="background:var(--navy)"></span> In class now</span>`
        : nc.next ? html`<div class="n-k">Next class</div><div class="n-t">${nc.next.c.subject}</div><div class="n-s">${time(nc.next.c.start_time)} · ${nc.next.c.room || 'Room not set'}</div><span class="n-when">${icon('clock')} ${nc.next.inMin < 60 ? `Starts in ${nc.next.inMin} min` : `Starts in ${Math.floor(nc.next.inMin / 60)} h ${nc.next.inMin % 60} min`}</span>`
        : html`<div class="n-k">Next up</div><div class="n-t">${x.timetable.length ? 'Classes are over' : 'No classes today'}</div><div class="n-s">${x.timetable.length ? 'Time for homework or the Virtual Lab.' : 'Enjoy the day.'}</div>`);

      setHTML('kpis', html`
        ${stat({ label: 'Attendance', icon: 'check', value: x.attendancePct === null ? '—' : x.attendancePct + '%', meter: x.attendancePct, note: x.attendancePct === null ? 'Not recorded yet' : 'All recorded days' })}
        ${stat({ label: 'Homework due', icon: 'doc', value: num(x.homeworkDue.length), note: x.homeworkDue.length ? 'Next ' + fmtDate(x.homeworkDue[0].due_date, { day: 'numeric', month: 'short' }) : 'Nothing pending' })}
        ${stat({ label: 'Quizzes open', icon: 'exam', value: ex.ok ? num(upcoming.length) : '—', note: ex.ok ? (upcoming.length ? 'Ready to take' : 'None open') : 'Unavailable' })}
        ${stat({ label: 'Recent average', icon: 'chart', value: avg === null ? '—' : avg + '%', note: avg === null ? (x.recentGrades.length ? 'Marks are letter grades' : 'No marks yet') : `From ${av.n} recent mark${av.n > 1 ? 's' : ''}` })}`);

      const nowI = x.timetable.indexOf(nc.cur || (nc.next && nc.next.c));
      setHTML('tt', x.timetable.length ? html`<ol class="timeline">${x.timetable.map((c, i) => html`<li class="${i === nowI ? 'now' : ''}"><span class="t-time">${time(c.start_time)}</span><span class="t-dot"></span><div class="t-body"><div class="t-title">${c.subject}</div><div class="t-sub">${c.room || 'Room not set'}${i === nowI ? (nc.cur ? ' · now' : ' · next') : ''}</div></div></li>`)}</ol>` : empty('No classes today', 'Your timetable has nothing on ' + x.day + '.', 'calendar'));

      setHTML('hw', x.homeworkDue.length ? html`<div>${x.homeworkDue.slice(0, 5).map((h) => html`<a class="link-row" href="?page=assignments">${dueBox(h.due_date)}<span class="li-main"><span class="li-title">${h.title}</span><span class="li-sub">${h.subject} · due ${fmtDate(h.due_date, { weekday: 'short', day: 'numeric', month: 'short' })}</span></span>${icon('chevronR', 'chev')}</a>`)}</div>`
        : html`<div class="all-clear"><span class="li-icon">${icon('check')}</span><div><b>All handed in</b><div class="li-sub">New homework will appear here.</div></div></div>`);

      const g = x.recentGrades;
      setHTML('grades', g.length ? html`${avg !== null ? html`<div class="grade-sum"><span class="ring lg" style="--p:${avg}" data-label="${avg}%" role="img" aria-label="Average ${avg}%"></span><div><b>Average ${avg}%</b><div class="li-sub">From ${av.n} recent numeric mark${av.n > 1 ? 's' : ''}</div></div></div>` : ''}
        <ul class="list">${g.slice(0, 4).map((r) => { const sc = N.score(r.score); return html`<li><span class="li-main"><span class="li-title">${r.subject}</span><span class="li-sub">${r.assessment}${sc.pct !== null && sc.raw !== sc.label ? ' · ' + sc.raw : ''}</span></span>${sc.pct !== null ? html`<span style="width:80px"><span class="meter ${sc.pct >= 85 ? 'good' : sc.pct >= 60 ? '' : 'bad'}"><span style="width:${Math.min(100, sc.pct)}%"></span></span></span>` : ''}<b class="mono" style="min-width:44px;text-align:right">${sc.label}</b></li>`; })}</ul>`
        : empty('No marks yet', 'Marks appear when teachers record them.', 'chart'));

      setHTML('ann', x.announcements.length ? html`<ul class="list">${x.announcements.map((a) => html`<li><span class="li-icon">${icon('megaphone')}</span><span class="li-main"><span class="li-title">${a.title}</span><span class="li-sub">${a.body}</span></span><span class="li-time">${ago(a.created_at)}</span></li>`)}</ul>` : empty('No announcements', 'School notices will appear here.', 'megaphone'));
    }

    if (!ex.ok) setHTML('quiz', errorBox(ex.error));
    else {
      const open = ex.data.exams.filter((e) => e.status === 'not_started' || e.status === 'in_progress');
      setHTML('quiz', open.length ? html`<div>${open.slice(0, 4).map((e) => html`<a class="link-row" href="?page=exams"><span class="li-icon">${icon('exam')}</span><span class="li-main"><span class="li-title">${e.title}</span><span class="li-sub">${e.subject} · ${e.durationMinutes || '—'} min · ${num(e.maxMarks)} marks</span></span><span class="badge ${e.status === 'in_progress' ? 'b-warning' : 'b-royal'}">${e.status === 'in_progress' ? 'Continue' : 'Start'}</span></a>`)}</div>`
        : html`<div class="all-clear"><span class="li-icon">${icon('check')}</span><div><b>No quizzes open</b><div class="li-sub">Published quizzes for your class appear here.</div></div></div>`);
    }

    // Courses & materials
    const courses = cr.ok ? cr.data.courses : [];
    const mats = mt.ok ? mt.data.materials : [];
    const MT = { document: 'doc', image: 'layers', video: 'video' };
    setHTML('learn', !cr.ok && !mt.ok ? errorBox(cr.error)
      : html`<div class="grid g-2" style="gap:0">
          <div style="min-width:0"><div class="acad-h">Course progress</div>${courses.length ? courses.slice(0, 3).map((c) => { const p = c.lessonCount ? Math.round((c.completedCount / c.lessonCount) * 100) : 0; return html`<div class="course"><div class="row"><span class="li-title">${c.title}</span><b class="mono" style="font-size:13px">${p}%</b></div><div class="meter"><span style="width:${p}%"></span></div><span class="li-sub">${num(c.completedCount)} of ${num(c.lessonCount)} lessons</span></div>`; }) : empty('No courses yet', '', 'book')}</div>
          <div style="min-width:0;border-left:1px solid var(--line)" class="learn-mats"><div class="acad-h">New study materials</div>${mats.length ? html`<ul class="list">${mats.slice(0, 3).map((m) => html`<li><span class="li-icon">${icon(MT[m.materialType] || 'doc')}</span><span class="li-main"><span class="li-title">${m.title}</span><span class="li-sub">${m.subject} · ${ago(m.createdAt)}</span></span></li>`)}</ul>` : empty('No materials yet', 'Your teachers’ uploads appear here.', 'layers')}</div>
        </div>`);

    // Virtual Lab — only published experiments the server lists.
    if (!lb.ok) setHTML('lab', errorBox(lb.error));
    else {
      const e = lb.data.experiments;
      setHTML('labCount', e.length ? `${e.length} available` : '');
      setHTML('lab', e.length ? html`<ul class="list">${e.slice(0, 3).map((x) => html`<li><span class="li-icon">${icon('flask')}</span><span class="li-main"><span class="li-title">${x.title}</span><span class="li-sub">${x.subject}${x.estimatedMinutes ? ` · ${x.estimatedMinutes} min` : ''}${x.bestScore !== null ? ` · best ${x.bestScore}%` : ''}</span></span></li>`)}</ul><div class="card-foot" style="border-top-color:rgba(255,255,255,.08);justify-content:flex-start"><a class="btn btn-cyan btn-sm" href="?page=lab">${icon('flask')} Open the lab</a></div>`
        : empty('No experiments yet', 'Experiments appear here when published.', 'flask'));
    }
  }
})();
