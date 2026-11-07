/* NovaSchool OS — shared runtime for the new role dashboards and public pages.
   Safety rules this file follows:
   - Every value from the API goes through esc() (via the html``
     tag). Only trusted constants (icons, our own markup) are inserted raw.
   - No secrets. The session token comes from the existing /api/auth/login and
     is kept under the same keys as the school app (/app), so one sign-in
     works for both. It is never logged or shown.
   - When data is missing the UI says so; it never invents live numbers. */
(function () {
  'use strict';

  // ---------- Escaping ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function esc(v) { return v === null || v === undefined ? '' : String(v).replace(/[&<>"'`]/g, (c) => ESC[c]); }
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = (s) => new Raw(String(s));
  function flat(v) {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(flat).join('');
    if (v === false || v === null || v === undefined) return '';
    return esc(v);
  }
  function html(strings, ...vals) {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += flat(vals[i]) + strings[i + 1];
    return raw(out);
  }
  // Only for URLs we build; refuses anything that is not a same-site path or http(s).
  function safeUrl(u) {
    const s = String(u || '');
    if (/^(\/(?!\/)|#|\?|\.\/|[a-z0-9-]+\.html)/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return '#';
  }

  // ---------- Icons (trusted constants) ----------
  const P = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="8" r="2.6"/><path d="M15.5 14.2c2.4.4 4.5 2.4 4.5 5.8"/>',
    cap: '<path d="M22 9 12 4 2 9l10 5 10-5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    doc: '<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 12h6M9 16h6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/>',
    exam: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    chart: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
    flask: '<path d="M9 2h6M10 2v6l-5 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V2"/><path d="M8.5 14h7"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 1 1 21 11.5z"/>',
    pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    chevronL: '<path d="M15 18l-6-6 6-6"/>',
    chevronR: '<path d="M9 18l6-6-6-6"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    video: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>',
    child: '<circle cx="12" cy="6" r="3"/><path d="M8 21v-6l-2-3 3-2h6l3 2-2 3v6"/>',
    upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
    download: '<path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    cloudOff: '<path d="M2 2l20 20"/><path d="M5.8 7.8A6 6 0 0 0 7 19h10.5M20.8 16.6A4.5 4.5 0 0 0 17.5 9h-1.3A6 6 0 0 0 10 5.1"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  };
  function icon(name, cls) { return raw(`<svg class="${cls || ''}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`); }

  // ---------- Formatting ----------
  const nf = new Intl.NumberFormat('en-PK');
  function num(n) { return n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : nf.format(Number(n)); }
  function pct(n) { return n === null || n === undefined ? '—' : `${Math.round(Number(n) * 10) / 10}%`; }
  function rs(n) { return n === null || n === undefined ? '—' : `Rs ${nf.format(Math.round(Number(n)))}`; }
  function fmtDate(d, opts) {
    if (!d) return '—';
    const x = new Date(d); if (Number.isNaN(x.getTime())) return '—';
    return x.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function ago(d) {
    if (!d) return '';
    const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
    return fmtDate(d, { day: 'numeric', month: 'short' });
  }
  function time(t) { // "09:00:00" -> "9:00"
    if (!t) return '';
    const [h, m] = String(t).split(':');
    const hh = Number(h); if (Number.isNaN(hh)) return String(t);
    return `${hh % 12 || 12}:${m || '00'} ${hh < 12 ? 'AM' : 'PM'}`;
  }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function initials(name) { const p = String(name || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  function today() { return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

  // ---------- Storage (never required) ----------
  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function sget(k) { try { return store('sessionStorage').getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { v === null ? store('sessionStorage').removeItem(k) : store('sessionStorage').setItem(k, v); } catch (e) { /* ignore */ } }
  function lget(k) { try { return store('localStorage').getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { store('localStorage').setItem(k, v); } catch (e) { /* ignore */ } }

  // ---------- Data mode ----------
  const params = new URLSearchParams(location.search);
  function lrm(k) { try { store('localStorage').removeItem(k); } catch (e) { /* ignore */ } }
  const session = {
    get token() { return lget('nova_token'); },
    get user() { try { return JSON.parse(lget('nova_user') || 'null'); } catch (e) { return null; } },
    save(token, user) { lset('nova_token', token); lset('nova_user', JSON.stringify(user)); },
    clear() { lrm('nova_token'); lrm('nova_user'); },
  };
  // There is no sample data on the live site: without a session, pages send
  // the visitor to sign in.
  const mode = () => (session.token ? 'live' : 'none');

  async function api(path, opts) {
    const headers = { 'Content-Type': 'application/json' };
    if (session.token) headers.Authorization = 'Bearer ' + session.token;
    let res;
    try { res = await fetch('/api' + path, Object.assign({}, opts || {}, { headers })); }
    catch (e) { throw Object.assign(new Error('Could not reach the NovaSchool server.'), { offline: true }); }
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (res.status === 401 && session.token) {
      session.clear();
      location.href = '/signin.html?expired=1';
      throw new Error('Session expired.');
    }
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  // Loads one endpoint (the second argument is unused here; the design
  // prototype passed sample data through it). Errors are
  // returned (not thrown) so each card can show its own honest error state.
  async function load(path, sample) {
    if (mode() !== 'live') return { ok: false, error: 'Not signed in.' };
    try { return { ok: true, data: await api(path) }; }
    catch (err) { return { ok: false, error: err.message, status: err.status }; }
  }

  const HOME = { admin: '/admin.html', teacher: '/teacher.html', student: '/student.html', parent: '/parent.html' };

  // ---------- Module status (honest labels) ----------
  const STATUS = {
    working: { label: 'Working', cls: 'b-success' },
    partial: { label: 'Partial', cls: 'b-warning' },
    planned: { label: 'Planned', cls: 'b-planned' },
  };
  function statusBadge(s) { const x = STATUS[s] || STATUS.working; return html`<span class="badge ${x.cls}">${x.label}</span>`; }

  // ---------- Shared UI pieces ----------
  function skeletonRows(n) { return html`<div class="stack" style="padding:16px 20px;gap:12px">${Array.from({ length: n || 3 }, () => html`<div class="skeleton" style="height:38px"></div>`)}</div>`; }
  function empty(title, text, ic) { return html`<div class="empty">${icon(ic || 'inbox')}<b>${title}</b><span>${text || ''}</span></div>`; }
  function errorBox(msg) { return html`<div style="padding:16px 20px"><div class="error-state" role="alert">${icon('alert')}<div><b>Couldn't load this.</b><br>${msg}</div></div></div>`; }
  function setHTML(el, h) { if (typeof el === 'string') el = document.getElementById(el); if (el) el.innerHTML = flat(h); }

  function card(id, title, opts) {
    opts = opts || {};
    return html`<section class="card ${opts.cls || ''} ${opts.span ? 'span-2' : ''}" aria-labelledby="${id}-h">
      <div class="card-head"><h2 id="${id}-h">${title}</h2>${opts.action || ''}</div>
      <div id="${id}">${skeletonRows(opts.rows || 3)}</div>
    </section>`;
  }

  function stat(o) {
    const meterCls = o.meter === undefined ? '' : (o.meter >= 85 ? 'good' : o.meter >= 70 ? 'warn' : 'bad');
    return html`<div class="card stat">
      <div class="stat-top"><span class="stat-label">${o.label}</span><span class="stat-icon">${icon(o.icon)}</span></div>
      <div class="stat-value mono">${o.value}</div>
      ${o.meter !== undefined && o.meter !== null ? html`<div class="meter ${meterCls}" role="img" aria-label="${o.label}: ${pct(o.meter)}"><span style="width:${Math.max(0, Math.min(100, Number(o.meter)))}%"></span></div>` : ''}
      <div class="stat-note">${o.note || ''}</div>
    </div>`;
  }
  function statSkeleton() { return html`<div class="card stat"><div class="skeleton" style="height:14px;width:60%"></div><div class="skeleton" style="height:30px;width:40%"></div><div class="skeleton" style="height:10px;width:80%"></div></div>`; }

  // ---------- App shell ----------
  // cfg: { role, roleLabel, page, nav:[{group, items:[{id,label,icon,status,count,href}]}], bottom:[{id,label,icon,href}],
  //        user:{name, sub}, school, search, notifications:fn, quick:[...] }
  function shell(cfg) {
    // A signed-in person only sees their own role's workspace. (The server
    // enforces this anyway; this just avoids a page full of 403 errors.)
    const u = session.user;
    if (mode() !== 'live' || !u) { location.replace('/signin.html'); return null; }
    if (u.role !== cfg.role) {
      const dest = HOME[u.role];
      location.replace(dest || '/app');
      return null;
    }
    const collapsed = lget('nova_sidebar') === 'mini';
    const navHtml = cfg.nav.map((g) => html`<div class="nav-group">
      ${g.group ? html`<div class="nav-group-title">${g.group}</div>` : ''}
      ${g.items.map((it) => html`<a class="nav-item ${it.id === cfg.page ? 'active' : ''}" href="${safeUrl(it.href || (it.app ? appUrl(it.app) : '?page=' + it.id))}" ${it.id === cfg.page ? raw('aria-current="page"') : ''} title="${it.label}">
        ${icon(it.icon)}<span class="nav-text">${it.label}</span>
        ${it.status && it.status !== 'working' ? html`<span class="nav-tag">${STATUS[it.status].label}</span>` : ''}
        ${it.count ? html`<span class="nav-count">${it.count}</span>` : ''}
      </a>`)}
    </div>`);
    const bottom = (cfg.bottom || []).map((b) => html`<a href="${safeUrl(b.href || (b.app ? appUrl(b.app) : '?page=' + b.id))}" class="${b.id === cfg.page ? 'active' : ''}" ${b.id === cfg.page ? raw('aria-current="page"') : ''}>${icon(b.icon)}<span>${b.label}</span></a>`);
    const isSample = false;
    const root = document.getElementById('app');
    root.innerHTML = flat(html`
    <a class="sr-only" href="#main">Skip to content</a>
    <div class="shell ${collapsed ? 'mini' : ''}" id="shell">
      <aside class="sidebar on-dark" id="sidebar" aria-label="Main navigation">
        <button class="icon-btn drawer-close mobile-only" id="drawerClose" type="button" aria-label="Close menu">${icon('x')}</button>
        <a class="brand" href="/"><img src="/assets/ns-mark-light.png" alt=""><span class="brand-text"><span class="brand-name">Nova<span>School</span></span><span class="brand-sub">School OS</span></span></a>
        <div class="side-school"><b>${cfg.school || 'Your school'}</b>${cfg.roleLabel} workspace</div>
        <nav>${navHtml}</nav>
        <div class="side-foot">
          <button class="nav-item collapse-btn desktop-only" id="collapseBtn" type="button" aria-label="Collapse sidebar">${icon(collapsed ? 'chevronR' : 'chevronL')}<span class="nav-text">Collapse</span></button>
          <a class="nav-item" href="/" id="signOutLink">${icon('logout')}<span class="nav-text">${isSample ? 'Sign in' : 'Sign out'}</span></a>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn mobile-only" id="menuBtn" type="button" aria-label="Open menu" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>
          <a class="brand mobile-only" href="${HOME[cfg.role] || '/'}"><img src="/assets/ns-mark-light.png" alt=""><span class="brand-name">Nova<span>School</span></span></a>
          <label class="search desktop-only">${icon('search')}<span class="sr-only">Search</span><input class="input" id="globalSearch" type="search" placeholder="${cfg.search || 'Search'}" autocomplete="off"></label>
          <div class="topbar-actions">
            ${cfg.quick ? html`<button class="btn btn-primary btn-sm desktop-only" id="quickBtn" type="button">${icon('plus')}Quick action</button>` : ''}
            <div class="rel">
              <button class="icon-btn" id="bellBtn" type="button" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">${icon('bell')}<span class="dot" id="bellDot" hidden></span></button>
              <div class="menu" id="bellMenu" role="dialog" aria-label="Notifications">
                <div class="menu-head"><b>Notifications</b><span class="badge plain" id="bellCount">0 new</span></div>
                <div id="bellList" style="max-height:360px;overflow:auto">${skeletonRows(2)}</div>
              </div>
            </div>
            <a class="icon-btn desktop-only" href="${safeUrl(cfg.settingsHref || appUrl('account'))}" aria-label="Settings">${icon('gear')}</a>
            <div class="rel">
              <button class="profile" id="profileBtn" aria-label="Account: ${cfg.user.name}" type="button" aria-haspopup="true" aria-expanded="false"><span class="avatar">${initials(cfg.user.name)}</span><span class="p-text" style="text-align:left"><span class="p-name" style="display:block">${cfg.user.name}</span><span class="p-role">${cfg.user.sub}</span></span></button>
              <div class="menu" id="profileMenu" style="width:240px"><ul class="list">
                <li><span class="li-main"><span class="li-title">${cfg.user.name}</span><span class="li-sub">${cfg.user.sub}</span></span></li>
                <li><a href="/app#account" class="row" style="text-decoration:none;color:inherit">${icon('lock')}Account &amp; password</a></li>
                <li><a href="/" class="row" style="text-decoration:none;color:inherit" id="signOutLink2">${icon('logout')}Sign out</a></li>
              </ul></div>
            </div>
          </div>
        </header>
        <main id="main" class="content" tabindex="-1">
          <div id="page"></div>
        </main>
      </div>
      <nav class="bottomnav" aria-label="Quick navigation">${bottom}</nav>
    </div>
    <div class="modal-backdrop" id="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal" id="modalBody"></div></div>`);

    // Behaviour
    const sh = document.getElementById('shell');
    const sb = document.getElementById('sidebar');
    const scrim = document.getElementById('scrim');
    const menuBtn = document.getElementById('menuBtn');
    const openDrawer = (on) => {
      sb.classList.toggle('open', on); scrim.classList.toggle('open', on); menuBtn.setAttribute('aria-expanded', String(on));
      document.body.classList.toggle('drawer-open', on);
      if (on) { const a = sb.querySelector('.nav-item.active') || sb.querySelector('.nav-item'); if (a) a.focus(); } else if (document.activeElement && sb.contains(document.activeElement)) menuBtn.focus();
    };
    document.getElementById('drawerClose').addEventListener('click', () => openDrawer(false));
    menuBtn.addEventListener('click', () => openDrawer(!sb.classList.contains('open')));
    scrim.addEventListener('click', () => openDrawer(false));
    document.querySelectorAll('a[href="#menu"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openDrawer(true); }));
    const cb = document.getElementById('collapseBtn');
    cb.addEventListener('click', () => {
      const mini = !sh.classList.contains('mini');
      sh.classList.toggle('mini', mini);
      lset('nova_sidebar', mini ? 'mini' : 'full');
      cb.innerHTML = flat(html`${icon(mini ? 'chevronR' : 'chevronL')}<span class="nav-text">Collapse</span>`);
    });
    ['signOutLink', 'signOutLink2'].forEach((id) => document.getElementById(id).addEventListener('click', () => session.clear()));
    function toggleMenu(btnId, menuId) {
      const b = document.getElementById(btnId), m = document.getElementById(menuId);
      b.addEventListener('click', (e) => { e.stopPropagation(); const on = !m.classList.contains('open'); closeMenus(); m.classList.toggle('open', on); b.setAttribute('aria-expanded', String(on)); });
      m.addEventListener('click', (e) => e.stopPropagation());
    }
    function closeMenus() { document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); document.querySelectorAll('[aria-haspopup]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
    toggleMenu('bellBtn', 'bellMenu');
    toggleMenu('profileBtn', 'profileMenu');
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenus(); openDrawer(false); closeModal(); } });
    if (cfg.quick) document.getElementById('quickBtn').addEventListener('click', () => openModal(cfg.quick));
    const gs = document.getElementById('globalSearch');
    gs.addEventListener('keydown', (e) => { if (e.key === 'Enter' && cfg.onSearch) cfg.onSearch(gs.value.trim()); });
    if (cfg.notifications) cfg.notifications().then((r) => renderBell(r)).catch(() => renderBell({ ok: false, error: 'Unavailable' }));
    else renderBell({ ok: true, data: { notifications: [], unreadCount: 0 } });
    return document.getElementById('page');
  }

  function renderBell(r) {
    const list = document.getElementById('bellList');
    if (!r.ok) { setHTML(list, errorBox(r.error)); return; }
    const items = r.data.notifications || [];
    const unread = Number(r.data.unreadCount || 0);
    document.getElementById('bellDot').hidden = unread === 0;
    setHTML('bellCount', `${unread} new`);
    setHTML(list, items.length
      ? html`<ul class="list">${items.slice(0, 8).map((n) => html`<li><span class="li-icon ${n.priority === 'critical' ? 'warn' : ''}">${icon(n.priority === 'critical' ? 'alert' : 'bell')}</span><span class="li-main"><span class="li-title" style="white-space:normal;font-weight:${n.read ? 500 : 650}">${n.message}</span><span class="li-sub">${ago(n.createdAt)}</span></span></li>`)}</ul>`
      : empty('You are all caught up', 'New alerts will appear here.', 'bell'));
  }

  // Quick action modal: list of {label, icon, href, note}
  function openModal(actions) {
    setHTML('modalBody', html`<div class="card-head"><h2 id="modalTitle">Quick actions</h2><button class="icon-btn" type="button" id="modalClose" aria-label="Close">${icon('x')}</button></div>
      <div class="qa-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${actions.map((a) => html`<a class="qa" href="${safeUrl(a.href)}">${icon(a.icon)}<span>${a.label}</span>${a.note ? html`<span class="li-sub" style="font-weight:500">${a.note}</span>` : ''}</a>`)}</div>`);
    document.getElementById('modal').classList.add('open');
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalClose').focus();
  }
  function closeModal() { const m = document.getElementById('modal'); if (m) m.classList.remove('open'); }
  document.addEventListener('click', (e) => { if (e.target && e.target.id === 'modal') closeModal(); });

  // Panel for modules that live in the current app (not rebuilt in the prototype).
  function modulePanel(mod, appUrl) {
    return html`<div class="page-head"><div><h1>${mod.label}</h1><p>${mod.desc || ''}</p></div>${statusBadge(mod.status)}</div>
      <section class="card card-pad stack" style="max-width:720px">
        <div class="row">${html`<span class="stat-icon">${icon(mod.icon)}</span>`}<div><h2>${mod.status === 'planned' ? 'Planned — not available yet' : mod.label}</h2>
        <p class="muted">${mod.status === 'planned' ? 'Nothing here is live. It is shown so the roadmap is visible, and it will not be marketed as available.' : (mod.desc || '')}</p></div></div>
        ${mod.gap ? html`<div class="notice sample">${icon('info')}<span>${mod.gap}</span></div>` : ''}
        ${mod.status !== 'planned' ? html`<div><a class="btn btn-primary" href="${safeUrl(appUrl || '/app')}">Open ${mod.label} ${icon('arrowR')}</a></div>` : ''}
      </section>`;
  }

  // Marks are stored as text: "92/100", "86" or a letter such as "A-".
  function score(v) {
    const t = String(v === null || v === undefined ? '' : v).trim();
    let m = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (m && Number(m[2]) > 0) { const p = Math.round((Number(m[1]) / Number(m[2])) * 100); return { pct: p, label: p + '%', raw: t }; }
    m = t.match(/^(\d+(?:\.\d+)?)\s*%?$/);
    if (m) { const p = Math.round(Number(m[1])); return { pct: p, label: p + '%', raw: t }; }
    return { pct: null, label: t || '—', raw: t };
  }
  function avgScore(list) { const v = list.map((g) => score(g.score).pct).filter((x) => x !== null); return v.length ? { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), n: v.length } : null; }
  function userName(fallback) {
    const u = session.user;
    if (!u) return fallback;
    const p = u.profile || {};
    return [p.first_name, p.last_name].filter(Boolean).join(' ') || u.email || fallback;
  }
  // Links into the school app: appUrl('admin/overview:people') -> /app#admin/overview:people
  const appUrl = (path) => '/app' + (path ? '#' + path : '');

  window.NovaOS = { HOME, appUrl, userName, score, avgScore, esc, html, raw, flat, safeUrl, icon, num, pct, rs, fmtDate, ago, time, greeting, initials, today, session, mode, api, load, STATUS, statusBadge, skeletonRows, empty, errorBox, setHTML, card, stat, statSkeleton, shell, openModal, closeModal, modulePanel, params, lget, lset };
})();
