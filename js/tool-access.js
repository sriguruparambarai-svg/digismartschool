/* js/tool-access.js — DigiSmart TeachBot (Oct 2026)
   Which Teacher Tools each teacher may open. The principal ticks them in
   School Admin → My Teachers; they are saved on the teacher (teachers.allowed_tools).
     • allowed_tools empty / not set → the teacher sees every tool (as before)
     • the principal (school login) and super admin always see everything
   Used by index.html (hides tiles and menu items), dashboard.html (tick boxes)
   and tool pages (DSS_ACCESS.guard('planner') sends a teacher back if not allowed).
   Load it AFTER js/session-header.js, so the server request carries the login. */
(function () {
  if (window.DSS_ACCESS) return;

  // key → what the principal sees next to the tick box
  var TOOLS = [
    { key: 'teachbot',  icon: '🤖', label: 'TeachBot — Teach (classroom screen)' },
    { key: 'lesson',    icon: '📅', label: 'Lesson Planner' },
    { key: 'worksheet', icon: '📝', label: 'Homework & Worksheets' },
    { key: 'nursery',   icon: '✏️', label: 'Nursery & Primary' },
    { key: 'qpaper',    icon: '📋', label: 'Question Paper' },
    { key: 'objective', icon: '❓', label: 'Foundation Tests' },
    { key: 'bookback',  icon: '📖', label: 'Book Back Answers' },
    { key: 'revision',  icon: '🗣️', label: 'Say-Along Revision' },
    { key: 'insights',  icon: '📈', label: 'Class Insights' },
    { key: 'reports',   icon: '📊', label: 'Report Cards' },
    { key: 'diary',     icon: '📱', label: 'Homework Diary' },
    { key: 'planner',   icon: '🗓️', label: 'Homework Planner' },
    { key: 'attendance',icon: '📸', label: 'Face Attendance' }
  ];
  var KEYS = TOOLS.map(function (t) { return t.key; });

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function isTeacher() { return (lsGet('dss_role') || '') === 'teacher'; }

  // The list saved at login (or the last check). null = no limits.
  function cached() {
    try {
      var u = JSON.parse(lsGet('dss_user') || '{}');
      var a = u && u.allowed_tools;
      return Array.isArray(a) && a.length ? a : null;
    } catch (e) { return null; }
  }
  function remember(list) {
    try {
      var u = JSON.parse(lsGet('dss_user') || '{}');
      u.allowed_tools = list && list.length ? list : null;
      lsSet('dss_user', JSON.stringify(u));
    } catch (e) {}
  }

  var current = isTeacher() ? cached() : null;

  function allowed(key) {
    if (!isTeacher()) return true;
    if (!current) return true;
    return current.indexOf(key) !== -1;
  }

  // Ask the server for the teacher's latest ticks, so a change by the principal
  // works without the teacher logging out. If the check fails, the last known
  // list is kept (never silently opened up).
  var ready = (function () {
    if (!isTeacher()) return Promise.resolve(null);
    return fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_my_access' })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success) {
        current = Array.isArray(d.allowed_tools) && d.allowed_tools.length ? d.allowed_tools : null;
        remember(current);
      } else if (d && d.error) {
        console.warn('Tool access check:', d.error);
      }
      return current;
    }).catch(function (e) { console.warn('Tool access check failed:', e.message); return current; });
  })();

  // For a tool page: a teacher without this tool is sent back to Teacher Tools.
  function guard(key) {
    function check() {
      if (allowed(key)) return;
      var t = TOOLS.filter(function (x) { return x.key === key; })[0];
      alert((t ? t.label : 'This tool') + ' is not switched on for your login. Please ask your principal.');
      window.location.href = 'index.html';
    }
    check();          // straight away, from the last known list
    ready.then(check); // and again once the latest list arrives
  }

  window.DSS_ACCESS = { TOOLS: TOOLS, KEYS: KEYS, allowed: allowed, ready: ready, guard: guard, isTeacher: isTeacher };
})();
