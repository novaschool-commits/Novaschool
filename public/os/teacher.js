/* Teacher workspace — prototype. Reads only existing teacher endpoints. */
(function () {
  'use strict';
  const N = window.NovaOS, S = {};
  const { html, icon, num, ago, time, load, setHTML, card, stat, statSkeleton, empty, errorBox } = N;

  const MODULES = [
    { group: '', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'grid', status: 'working' }] },
    { group: 'Teaching', items: [
      { id: 'students', app: 'teacher/students', label: 'My Students', icon: 'users', status: 'working', desc: 'Your class roster and student profiles.' },
      { id: 'live', app: 'teacher/live', label: 'Live Classroom', icon: 'video', status: 'working', desc: 'Start a live class with the shared whiteboard.' },
      { id: 'lessons', app: 'teacher/lessons', label: 'Lessons', icon: 'pen', status: 'working', desc: 'Lesson plans and recordings.' },
      { id: 'courses', app: 'teacher/courses', label: 'Courses', icon: 'book', status: 'working', desc: 'Your courses and their units.' },
      { id: 'materials', app: 'teacher/materials', label: 'Study Materials', icon: 'layers', status: 'working', desc: 'Documents, images and video links for your classes.' },
      { id: 'books', label: 'Course Books & Keys', icon: 'download', status: 'working', desc: 'Student PDFs for every grade and the answer keys.' },
      { id: 'sims', label: 'Simulations', icon: 'flask', status: 'partial', desc: 'Interactive simulations and animations.', gap: 'Maths and Science for Grades 1–8 so far.' },
    ] },
    { group: 'Assessment', items: [
      { id: 'assignments', app: 'teacher/assignments', label: 'Assignments', icon: 'doc', status: 'working', desc: 'Set work, review submissions and grade.' },
      { id: 'exams', app: 'teacher/exams', label: 'Quizzes & Exams', icon: 'exam', status: 'working', desc: 'Build, publish and mark quizzes and exams.' },
      { id: 'gradebook', app: 'teacher/gradebook', label: 'Gradebook', icon: 'chart', status: 'working', desc: 'All recorded marks for your sections.' },
      { id: 'lab', app: 'teacher/lab', label: 'Virtual Lab', icon: 'flask', status: 'partial', desc: 'Interactive science experiments.', gap: '3 of the planned 100 experiments are built.' },
    ] },
    { group: 'Communication', items: [
      { id: 'messages', app: 'teacher/messages', label: 'Messages', icon: 'chat', status: 'working', desc: 'Messages with students and parents.' },
      { id: 'attendance', label: 'Take attendance', icon: 'check', status: 'planned', desc: 'Daily attendance register.', gap: 'There is no attendance-taking screen yet (risk R2). This needs a backend change and separate approval.' },
    ] },
  ];
  const ALL = MODULES.flatMap((g) => g.items);
  const page = ALL.some((m) => m.id === N.params.get('page')) ? N.params.get('page') : 'dashboard';
  const name = N.userName('Teacher');
  const QUICK = [
    { label: 'Start a live class', icon: 'video', href: N.appUrl('teacher/live') },
    { label: 'New assignment', icon: 'doc', href: N.appUrl('teacher/assignments') },
    { label: 'Build a quiz', icon: 'exam', href: N.appUrl('teacher/exams') },
    { label: 'Upload material', icon: 'upload', href: N.appUrl('teacher/materials') },
  ];

  const el = N.shell({
    role: 'teacher', roleLabel: 'Teacher', page, nav: MODULES,
    school: 'Your school',
    user: { name, sub: 'Teacher' }, search: 'Search your workspace…', quick: QUICK,
    onSearch: (q) => { const m = ALL.find((x) => x.label.toLowerCase().includes(q.toLowerCase())); if (m) location.href = '?page=' + m.id; },
    bottom: [
      { id: 'dashboard', label: 'Today', icon: 'home' },
      { id: 'assignments', label: 'Grade', icon: 'doc' },
      { id: 'live', label: 'Live', icon: 'video' },
      { id: 'messages', app: 'teacher/messages', label: 'Messages', icon: 'chat' },
      { id: 'more', label: 'More', icon: 'menu', href: '#menu' },
    ],
  });
  if (!el) return; // redirected to the signed-in person's own workspace

  if (page === 'dashboard') dashboard();
  else if (page === 'books') window.NovaBooks.teacherBooks(el);
  else if (page === 'sims') window.NovaBooks.sims(el, 'teacher');
  else { const mod = ALL.find((m) => m.id === page); if (mod.app) location.replace(N.appUrl(mod.app)); else setHTML(el, N.modulePanel(mod, N.appUrl())); }

  function nowIndex(classes) {
    const t = new Date(); const mins = t.getHours() * 60 + t.getMinutes();
    let idx = -1;
    classes.forEach((c, i) => { const [h, m] = String(c.start_time).split(':').map(Number); if (h * 60 + m <= mins) idx = i; });
    return idx;
  }

  async function dashboard() {
    setHTML(el, html`
      <section class="welcome">
        <div style="position:relative;min-width:0">
          <p style="font-size:12.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7FD9E4" id="tSubject">Teacher workspace</p>
          <h1>${N.greeting()}, ${name.split(' ')[0]}</h1>
          <p>Your classes, grading and messages for today.</p>
          <div class="w-meta"><span class="chip-dark">${icon('calendar')} ${N.today()}</span><span class="chip-dark" id="tChip">${icon('clock')} Loading schedule…</span></div>
        </div>
        <div class="welcome-actions">
          <a class="btn btn-cyan" href="${N.appUrl('teacher/live')}">${icon('video')} Start live class</a>
          <a class="btn btn-on-dark" href="${N.appUrl('teacher/assignments')}">${icon('plus')} New assignment</a>
        </div>
      </section>
      <div class="grid g-4" id="kpis">${[1, 2, 3, 4].map(statSkeleton)}</div>
      <div class="grid g-3">
        ${card('schedule', "Today's schedule", { rows: 3, action: html`<span class="badge plain" id="dayBadge"></span>` })}
        ${card('grading', 'Grading queue', { action: html`<a class="btn btn-ghost btn-sm" href="/app#teacher/assignments">View all</a>` })}
        ${card('exams', 'Quizzes & exams', { action: html`<a class="btn btn-ghost btn-sm" href="/app#teacher/exams">View all</a>` })}
      </div>
      <div class="grid g-2">
        ${card('roster', 'My class', { rows: 3 })}
        ${card('msgs', 'Recent messages', { rows: 3, action: html`<a class="btn btn-ghost btn-sm" href="/app#teacher/messages">Open</a>` })}
      </div>`);

    const [d, ex, lv] = await Promise.all([load('/teacher/dashboard', S.dashboard), load('/teacher/exams', S.exams), load('/teacher/live-sessions', S.live)]);
    if (!d.ok) { ['schedule', 'grading', 'roster', 'msgs'].forEach((id) => setHTML(id, errorBox(d.error))); setHTML('kpis', html`<div class="card" style="grid-column:1/-1">${errorBox(d.error)}</div>`); }
    else {
      const x = d.data;
      const pending = x.gradingQueue.reduce((s, q) => s + Number(q.pending), 0);
      const live = lv.ok ? lv.data.activeSections : [];
      setHTML('tSubject', x.teacher.subject ? `${x.teacher.subject} teacher` : 'Teacher workspace');
      setHTML('tChip', html`${icon('clock')} ${x.todaysClasses.length ? `${x.todaysClasses.length} class${x.todaysClasses.length > 1 ? 'es' : ''} today` : 'No classes today'}`);
      setHTML('dayBadge', x.day);
      setHTML('kpis', html`
        ${stat({ label: 'Classes today', icon: 'calendar', value: num(x.todaysClasses.length), note: live.length ? `${live.length} live now` : 'None live right now' })}
        ${stat({ label: 'Waiting for grading', icon: 'doc', value: num(pending), note: `Across ${num(x.gradingQueue.length)} assignment${x.gradingQueue.length === 1 ? '' : 's'}` })}
        ${stat({ label: 'My sections', icon: 'users', value: num(x.mySections.length), note: x.mySections.join(' · ') || 'No sections on your timetable' })}
        ${stat({ label: 'Class roster', icon: 'cap', value: num(x.roster.students.length), note: x.roster.section ? `Class teacher of ${x.roster.section}` : 'Not a class teacher' })}`);

      const ni = nowIndex(x.todaysClasses);
      setHTML('schedule', x.todaysClasses.length ? html`<ol class="timeline">${x.todaysClasses.map((c, i) => html`<li class="${i === ni ? 'now' : ''}"><span class="t-time">${time(c.start_time)}</span><span class="t-dot"></span><div class="t-body"><div class="t-title">${c.subject} · ${c.section_code}</div><div class="t-sub">${c.room || 'Room not set'}${live.includes(c.section_code) ? ' · Live now' : ''}</div></div></li>`)}</ol>`
        : empty('No classes today', 'Your timetable has nothing scheduled for ' + x.day + '.', 'calendar'));

      setHTML('grading', x.gradingQueue.length ? html`<ul class="list">${x.gradingQueue.map((q) => html`<li><span class="li-icon warn">${icon('doc')}</span><span class="li-main"><span class="li-title">${q.title}</span><span class="li-sub">Section ${q.section_code}</span></span><span class="count">${num(q.pending)}</span></li>`)}</ul>`
        : empty('All caught up', 'No submissions are waiting for you.', 'check'));

      const r = x.roster;
      setHTML('roster', r.section ? html`<div class="card-body row between wrap"><div><div class="stat-value mono">${num(r.students.length)}</div><div class="muted">students in ${r.section}</div></div><a class="btn btn-secondary btn-sm" href="/app#teacher/students">Open roster ${icon('arrowR')}</a></div>
        <ul class="list">${r.students.slice(0, 4).map((s) => html`<li><span class="avatar" style="width:32px;height:32px;font-size:12px;background:var(--royal-bg);color:var(--royal)">${N.initials(s.first_name + ' ' + s.last_name)}</span><span class="li-main"><span class="li-title">${s.first_name} ${s.last_name}</span><span class="li-sub">${s.admission_no || ''}</span></span></li>`)}</ul>`
        : empty('No class assigned', 'You are not the class teacher of a section.', 'users'));

      setHTML('msgs', x.messages.length ? html`<ul class="list">${x.messages.slice(0, 4).map((m) => html`<li><span class="li-icon">${icon('chat')}</span><span class="li-main"><span class="li-title">${m.from}</span><span class="li-sub">${m.body}</span></span><span class="li-time">${ago(m.sentAt)}</span></li>`)}</ul>`
        : empty('No messages', 'Messages from students and parents appear here.', 'chat'));
    }

    if (!ex.ok) setHTML('exams', errorBox(ex.error));
    else setHTML('exams', ex.data.exams.length ? html`<ul class="list">${ex.data.exams.slice(0, 4).map((e) => html`<li><span class="li-icon">${icon('exam')}</span><span class="li-main"><span class="li-title">${e.title}</span><span class="li-sub">${e.subject} · ${e.sectionCode}${e.pendingGrading ? ` · ${e.pendingGrading} to mark` : ''}</span></span>${e.isPublished ? html`<span class="badge b-success">Published</span>` : html`<span class="badge">Draft</span>`}</li>`)}</ul>`
      : empty('No quizzes yet', 'Build a quiz from Quizzes & Exams.', 'exam'));
  }
})();
