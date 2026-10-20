/* Nova OS shell behaviour: mobile navigation drawer for every dashboard.
   Purely presentational. It never calls the API and never changes which
   page or role is shown; it only opens and closes the existing sidebar. */
(function(){
  'use strict';
  var MENU_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  function setOpen(shell, open){
    shell.classList.toggle('nav-open', open);
    var btn = shell.querySelector('.nova-drawer-btn');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open){
      var first = shell.querySelector('.app-sidebar .side-link.active') || shell.querySelector('.app-sidebar .side-link');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }
  }

  function enhance(shell, i){
    var sidebar = shell.querySelector('.app-sidebar');
    var topbar = shell.querySelector('.app-topbar');
    if (!sidebar || !topbar || shell.querySelector('.nova-drawer-btn')) return;

    if (!sidebar.id) sidebar.id = 'novaSidebar' + i;
    sidebar.setAttribute('aria-label', 'Main navigation');

    // Make sidebar links reachable by keyboard (they are <a> without href).
    sidebar.querySelectorAll('.side-link, .logout-link').forEach(function(a){
      if (!a.hasAttribute('href') && !a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
      if (!a.hasAttribute('role')) a.setAttribute('role', 'button');
      a.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.click(); }
      });
      a.addEventListener('click', function(){ setOpen(shell, false); });
    });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nova-drawer-btn';
    btn.setAttribute('aria-label', 'Open navigation');
    btn.setAttribute('aria-controls', sidebar.id);
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = MENU_ICON;
    btn.addEventListener('click', function(){ setOpen(shell, !shell.classList.contains('nav-open')); });

    // Put the button beside the page title without moving the title element.
    var titleBlock = topbar.firstElementChild;
    var row = document.createElement('div');
    row.className = 'nova-topbar-row';
    topbar.insertBefore(row, titleBlock);
    row.appendChild(btn);
    if (titleBlock) row.appendChild(titleBlock);

    var backdrop = document.createElement('div');
    backdrop.className = 'nova-drawer-backdrop';
    backdrop.addEventListener('click', function(){ setOpen(shell, false); });
    shell.appendChild(backdrop);
  }

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.app-shell.nav-open').forEach(function(s){
      setOpen(s, false);
      var b = s.querySelector('.nova-drawer-btn'); if (b) b.focus();
    });
  });

  function init(){ document.querySelectorAll('.app-shell').forEach(enhance); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
