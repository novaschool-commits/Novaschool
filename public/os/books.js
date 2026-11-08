/* Course books (PDF downloads) and simulations, shared by the student and teacher workspaces.
   Downloads go through the API with the signed-in session; the server checks the grade. */
(function () {
  'use strict';
  const N = window.NovaOS;
  const { html, icon, setHTML, empty, errorBox, load } = N;
  const ID = /^[a-z0-9-]{1,120}$/;

  async function download(base, id, btn) {
    if (!ID.test(id)) return;
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Downloading…';
    try {
      const res = await fetch('/api' + base + '/course-books/' + encodeURIComponent(id) + '/file', { headers: { Authorization: 'Bearer ' + (N.session.token || '') } });
      if (!res.ok) { let msg = 'Download failed (' + res.status + ').'; try { msg = (await res.json()).error || msg; } catch (e) { /* not JSON */ } throw new Error(msg); }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || ''; const m = cd.match(/filename="([^"]+)"/);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m ? m[1] : 'course-book.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      btn.textContent = 'Downloaded';
    } catch (e) { btn.textContent = label; alertBox(btn, e.message); }
    finally { btn.disabled = false; setTimeout(() => { if (btn.textContent === 'Downloaded') btn.textContent = label; }, 3000); }
  }
  function alertBox(btn, text) { const li = btn.closest('li'); if (!li) return; let n = li.querySelector('.dl-err'); if (!n) { n = document.createElement('span'); n.className = 'li-sub dl-err'; n.style.color = 'var(--danger, #B91C1C)'; li.querySelector('.li-main').appendChild(n); } n.textContent = text; }

  function bookRow(b) {
    return html`<li><span class="li-icon ${b.kind === 'answer-key' ? 'warn' : ''}">${icon(b.kind === 'answer-key' ? 'lock' : 'book')}</span>
      <span class="li-main"><span class="li-title">${b.subject}</span><span class="li-sub">Grade ${b.grade} · Term ${b.term} · PDF · ${b.sizeKb} KB${b.kind === 'answer-key' ? ' · teachers only' : ''}</span></span>
      <button class="btn btn-ghost btn-sm" type="button" data-book="${b.id}">${icon('download')} Download</button></li>`;
  }
  function bind(el, base) { el.addEventListener('click', (e) => { const b = e.target.closest('button[data-book]'); if (b) download(base, b.getAttribute('data-book'), b); }); }

  // Student: their own grade, grouped by term.
  async function studentBooks(el) {
    setHTML(el, html`<div class="page-head"><div><h1>Course Books</h1><p>Your subject books for each term as PDFs. Download them to study offline or print them.</p></div></div><section class="card" id="booksBody">${N.skeletonRows(4)}</section>`);
    const body = document.getElementById('booksBody'); bind(body, '/student');
    const r = await load('/student/course-books');
    if (!r.ok) return setHTML(body, errorBox(r.error));
    if (!r.data.grade) return setHTML(body, empty('No grade yet', 'Your school has not placed you in a class yet.', 'book'));
    if (!r.data.books.length) return setHTML(body, empty('No books yet', 'Books for your grade will appear here.', 'book'));
    const terms = [1, 2, 3].map((t) => ({ t, list: r.data.books.filter((b) => b.term === t) })).filter((x) => x.list.length);
    setHTML(body, html`<div class="card-head"><h2>Grade ${r.data.grade}</h2><span class="badge plain">${r.data.books.length} books</span></div>
      ${terms.map((x) => html`<div class="acad-h" style="padding:10px 20px 0;font-weight:650">Term ${x.t}</div><ul class="list">${x.list.map(bookRow)}</ul>`)}
      <p class="muted" style="padding:12px 20px;font-size:12.5px">Student editions: lesson notes, workbook pages and practice questions. NovaSchool's own materials, not officially accredited.</p>`);
  }

  // Teacher: every grade, with answer keys.
  async function teacherBooks(el) {
    setHTML(el, html`<div class="page-head"><div><h1>Course Books &amp; Answer Keys</h1><p>Student editions for every grade, and the answer keys (teachers only).</p></div></div>
      <section class="card card-pad" style="margin-bottom:12px"><label class="li-sub" for="bkGrade">Grade</label> <select id="bkGrade" class="select" style="max-width:220px">${[1, 2, 3, 4, 5, 6, 7, 8].map((g) => html`<option value="${g}">Grade ${g}</option>`)}</select>
      <a class="btn btn-ghost btn-sm" href="?page=sims" style="margin-left:8px">${icon('flask')} Simulations</a></section>
      <section class="card" id="booksBody">${N.skeletonRows(4)}</section>`);
    const body = document.getElementById('booksBody'); bind(body, '/teacher');
    const r = await load('/teacher/course-books');
    if (!r.ok) return setHTML(body, errorBox(r.error));
    const sel = document.getElementById('bkGrade');
    const show = () => { const g = Number(sel.value); const list = r.data.books.filter((b) => b.grade === g);
      setHTML(body, list.length ? html`${[1, 2, 3].map((t) => { const l = list.filter((b) => b.term === t); return l.length ? html`<div class="acad-h" style="padding:10px 20px 0;font-weight:650">Term ${t}</div><ul class="list">${l.map(bookRow)}</ul>` : ''; })}` : empty('No books', 'Nothing for this grade yet.', 'book')); };
    sel.addEventListener('change', show); show();
  }

  // Simulations list. Students see their grade (the grade comes from the server); teachers see all.
  async function sims(el, role) {
    setHTML(el, html`<div class="page-head"><div><h1>Simulations</h1><p>Interactive simulations and animations for your topics. They open in a new tab and work on phones too.</p></div></div><section class="card" id="simBody">${N.skeletonRows(4)}</section>`);
    const body = document.getElementById('simBody');
    let cat;
    try { const res = await fetch('/sims/catalog.json'); if (!res.ok) throw new Error('Could not load the list (' + res.status + ').'); cat = (await res.json()).sims || []; }
    catch (e) { return setHTML(body, errorBox(e.message)); }
    let grade = null;
    if (role === 'student') { const r = await load('/student/course-books'); grade = r.ok ? r.data.grade : null; }
    const list = grade ? cat.filter((s) => s.grade === grade) : cat;
    if (!list.length) return setHTML(body, empty('No simulations yet', grade ? `Simulations for Grade ${grade} are coming soon.` : 'None yet.', 'flask'));
    const grades = [...new Set(list.map((s) => s.grade))];
    setHTML(body, html`${grades.map((g) => html`<div class="card-head"><h2>Grade ${g}</h2></div><ul class="list">${list.filter((s) => s.grade === g).map((s) => html`<li><span class="li-icon">${icon(s.kind === 'animation' ? 'video' : 'flask')}</span><span class="li-main"><span class="li-title">${s.title}</span><span class="li-sub">${s.subject} · Term ${s.term} · ${s.outcome} · ${s.kind}</span></span><a class="btn btn-ghost btn-sm" href="${N.safeUrl('/sims/' + s.id + '.html')}" target="_blank" rel="noopener">Open ${icon('arrowR')}</a></li>`)}</ul>`)}`);
  }

  window.NovaBooks = { studentBooks, teacherBooks, sims };
})();
