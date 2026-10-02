// erp-report-switch.js
// For schools that also use DigiSmart ERP (Super Admin "ERP ON" switch), report cards
// are made in ERP. This file turns TeachBot's Report Cards / Bulk Reports buttons into
// a link to ERP, and shows a short note on bulk-reports.html.
// Schools without ERP see no change. If anything fails, nothing changes (safe default).
(function () {
  var ERP_URL = 'https://erp.digismartschool.com';

  function readUser() {
    try { return JSON.parse(localStorage.getItem('dss_user') || '{}'); } catch (e) { return {}; }
  }

  function mySchoolId() {
    var u = readUser();
    var role = '';
    try { role = localStorage.getItem('dss_role') || ''; } catch (e) {}
    if (role === 'teacher') return u.school_id || (u.schools && u.schools.id) || window._schoolId || '';
    return u.school_id || u.id || window._schoolId || '';
  }

  function onReportPage() {
    return /bulk-reports\.html/i.test(window.location.pathname);
  }

  function pointButtonsToERP() {
    var found = document.querySelectorAll('[onclick*="bulk-reports.html"], a[href*="bulk-reports.html"]');
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      if (el.getAttribute('data-erp-done')) continue;
      el.setAttribute('data-erp-done', '1');
      if (el.tagName === 'A') {
        el.setAttribute('href', ERP_URL);
        el.setAttribute('target', '_blank');
      } else {
        el.removeAttribute('onclick');
        el.addEventListener('click', function (ev) { ev.preventDefault(); window.open(ERP_URL, '_blank'); });
      }
      // Update the small description text where there is one
      var desc = el.querySelector('.tile-desc, .tool-desc');
      if (desc) desc.textContent = 'Now in DigiSmart ERP ↗';
      var name = el.querySelector('.tool-name');
      if (name) name.textContent = 'Report Cards (ERP)';
      // Sidebar item has no description — add a tiny tag
      if (!desc && el.classList.contains('nav-item')) {
        var tag = document.createElement('span');
        tag.textContent = ' · ERP';
        tag.style.cssText = 'font-size:.75em;opacity:.75;';
        el.appendChild(tag);
      }
    }
  }

  function showERPNoticeOnReportPage() {
    if (document.getElementById('erp-report-notice')) return;
    var box = document.createElement('div');
    box.id = 'erp-report-notice';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(74,10,18,.92);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;font-family:Nunito,sans-serif;';
    box.innerHTML =
      '<div style="background:#FFF8EC;border:3px solid #C9A84C;border-radius:16px;max-width:420px;width:100%;padding:26px;text-align:center;color:#4A0A12;">' +
        '<div style="font-size:2.4rem;">📊</div>' +
        '<h2 style="margin:8px 0 6px;color:#6B0F1A;">Report cards are now in DigiSmart ERP</h2>' +
        '<p style="margin:0 0 18px;line-height:1.5;">Your school makes report cards in ERP, with attendance, rank and parent copies.</p>' +
        '<a href="' + ERP_URL + '" style="display:inline-block;padding:11px 22px;background:linear-gradient(135deg,#A07830,#FFD700);color:#4A0A12;' +
          'border-radius:10px;font-weight:800;text-decoration:none;">Open ERP</a>' +
        '<div style="margin-top:14px;"><a href="/index.html" style="color:#6B0F1A;font-size:.9rem;">← Back to TeachBot</a></div>' +
      '</div>';
    document.body.appendChild(box);
  }

  function apply() {
    if (onReportPage()) showERPNoticeOnReportPage();
    else pointButtonsToERP();
  }

  function check() {
    // Always ask the server, so turning the Super Admin switch ON or OFF works
    // straight away, without anyone logging out and in again.
    var sid = mySchoolId();
    if (!sid) return;
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_school_sources', school_id: sid })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.has_erp === true) apply(); })
      .catch(function () { /* keep page as it is */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check);
  else check();
  // dashboard.html sets its school id a moment after loading — check once more then
  setTimeout(check, 2500);
})();
