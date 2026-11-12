// top-bar.js (Nov 2026) — one top bar and one Back button on every management page.
// Add <script src="js/top-bar.js"></script> at the end of a page. It only restyles the page's own
// top bar and moves its Back link to the left; nothing inside the page changes.
// Back rule: a teacher goes back to Teacher Tools, everyone else to School Admin.
(function () {
  if (window.top !== window.self) return;            // a page shown inside another page keeps its own bar
  var role = ''; try { role = localStorage.getItem('dss_role') || ''; } catch (e) {}
  var HOME = role === 'teacher' ? 'index.html' : 'dashboard.html';

  var css = ''
    + '.dss-bar{background:linear-gradient(90deg,#4A0A12,#6B0F1A)!important;border-bottom:4px solid #C9A84C!important;color:#FBF4E8!important}'
    + '.dss-bar.dss-flat{display:flex!important;justify-content:flex-start!important;align-items:center!important;gap:14px!important;padding:10px 24px!important}'
    + '.dss-bar .in{gap:14px!important;max-width:none!important;padding:10px 24px!important}'
    + '.dss-bar h1{font-size:1.35rem!important;line-height:1.2!important;color:#FBF4E8!important}'
    + '.dss-bar .sub{color:#E8C96A!important}'
    + '.dss-bar a.dss-back{order:-1;background:#C9A84C!important;color:#3A0E0E!important;border:none!important;border-radius:10px!important;padding:9px 16px!important;'
    +   'font-weight:900!important;font-size:.9rem!important;min-height:42px;display:inline-flex!important;align-items:center;text-decoration:none!important;white-space:nowrap;flex-shrink:0}'
    + '.dss-bar a.dss-back:hover{background:#DDBF6A!important}'
    + '.dss-bar a.dss-link{background:transparent!important;color:#FBF4E8!important;border:1.5px solid rgba(201,168,76,.6)!important;border-radius:10px!important;padding:8px 14px!important;'
    +   'font-weight:800!important;font-size:.85rem!important;min-height:42px;display:inline-flex!important;align-items:center;text-decoration:none!important;white-space:nowrap}'
    + '.dss-bar a.dss-link:hover{background:rgba(255,255,255,.12)!important}'
    + '.dss-bar a:focus-visible{outline:3px solid #E8C96A;outline-offset:2px}'
    + '@media print{.dss-bar a.dss-back,.dss-bar a.dss-link{display:none!important}}'
    + '@media (max-width:640px){.dss-bar .in,.dss-bar.dss-flat{padding:8px 12px!important}.dss-bar h1{font-size:1.1rem!important}.dss-bar a.dss-back{padding:8px 12px!important}}';

  // the small line above the page name is the school's name only (no "· TeachBot")
  function name(bar) {
    var sub = bar.querySelector('.sub'); if (!sub) return;
    var school = ''; try { var u = JSON.parse(localStorage.getItem('dss_user') || '{}'); school = u.school_name || (u.schools && u.schools.name) || (role !== 'teacher' ? u.name : '') || ''; } catch (e) {}
    function fix() { var t = sub.textContent.replace(/\s*[\u00B7\u2022|-]\s*TeachBot\s*$/i, '').trim(); if (/^(TeachBot|DigiSmartSchool)?$/i.test(t) && school) t = school; if (t !== sub.textContent) sub.textContent = t; }
    fix(); new MutationObserver(fix).observe(sub, { childList: true, characterData: true, subtree: true });
  }
  function run() {
    var bar = document.querySelector('header.band, div.band, body > header');
    if (!bar || bar.classList.contains('dss-bar')) return;
    var st = document.createElement('style'); st.id = 'dss-bar-style'; st.textContent = css; document.head.appendChild(st);
    bar.classList.add('dss-bar');
    if (!bar.querySelector('.in')) bar.classList.add('dss-flat');
    var links = [].slice.call(bar.querySelectorAll('a'));
    var back = links.filter(function (a) { return /^\s*←/.test(a.textContent) || a.classList.contains('back') || a.classList.contains('back-btn'); })[0];
    if (back) {
      back.textContent = '← Back';
      back.classList.add('dss-back');
      back.setAttribute('href', HOME);
      back.setAttribute('aria-label', role === 'teacher' ? 'Back to Teacher Tools' : 'Back to School Admin');
      back.parentNode.insertBefore(back, back.parentNode.firstChild);
    }
    links.forEach(function (a) { if (a !== back) a.classList.add('dss-link'); });
    name(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  // some pages set the Back link again after loading their data — keep the one rule
  window.addEventListener('load', function () { run(); var b = document.querySelector('.dss-bar a.dss-back'); if (b) b.setAttribute('href', HOME); });
})();
