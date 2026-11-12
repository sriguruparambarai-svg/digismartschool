// top-bar.js (Nov 2026) — one top bar and one Back button on every management and tool page.
// Add <script src="js/top-bar.js"></script> at the end of a page. It only restyles the page's own
// top bar and puts a Back button at its left; nothing inside the page changes.
// Back rule: a page opened in its own tab closes that tab. Otherwise a teacher goes back to
// Teacher Tools and everyone else to School Admin.
(function () {
  if (window.top !== window.self) return;            // a page shown inside another page keeps its own bar
  var ARROW = String.fromCharCode(8592) + ' Back';
  var role = ''; try { role = localStorage.getItem('dss_role') || ''; } catch (e) {}
  var HOME = role === 'teacher' ? 'index.html' : 'dashboard.html';
  var BTN = 'background:#C9A84C!important;color:#3A0E0E!important;border:none!important;border-radius:10px!important;padding:9px 16px!important;'
    + 'font-weight:900!important;font-size:.9rem!important;min-height:42px;display:inline-flex!important;align-items:center;text-decoration:none!important;white-space:nowrap;flex-shrink:0;cursor:pointer';

  var css = ''
    + '.dss-bar{background:linear-gradient(90deg,#4A0A12,#6B0F1A)!important;border-bottom:4px solid #C9A84C!important;color:#FBF4E8!important}'
    + '.dss-bar.dss-flat{display:flex!important;justify-content:flex-start!important;align-items:center!important;gap:14px!important;padding:10px 24px!important}'
    + '.dss-bar .in{gap:14px!important;max-width:none!important;padding:10px 24px!important}'
    + '.dss-bar h1{font-size:1.35rem!important;line-height:1.2!important;color:#FBF4E8!important}'
    + '.dss-bar .sub{color:#E8C96A!important}'
    + '.dss-bar a.dss-back{order:-1;' + BTN + '}'
    + 'a.dss-back.dss-solo{' + BTN + '}'
    + 'a.dss-back:hover{background:#DDBF6A!important}'
    + '.dss-bar a.dss-back.dss-float{float:left;margin:2px 14px 0 0}.dss-bar .wtabs{clear:both}'
    + '.dss-bar .ai-badge{display:none!important}'
    + 'header.dss-bar > nav.wtabs{max-width:none!important;margin-left:0!important;margin-right:0!important;padding-left:24px!important;padding-right:24px!important}'
    + '.dss-bar a.dss-link{background:transparent!important;color:#FBF4E8!important;border:1.5px solid rgba(201,168,76,.6)!important;border-radius:10px!important;padding:8px 14px!important;'
    +   'font-weight:800!important;font-size:.85rem!important;min-height:42px;display:inline-flex!important;align-items:center;text-decoration:none!important;white-space:nowrap}'
    + '.dss-bar a.dss-link:hover{background:rgba(255,255,255,.12)!important}'
    + 'a.dss-back:focus-visible,.dss-bar a:focus-visible{outline:3px solid #E8C96A;outline-offset:2px}'
    + '@media print{a.dss-back,.dss-bar a.dss-link{display:none!important}}'
    + '@media (max-width:640px){.dss-bar .in,.dss-bar.dss-flat{padding:8px 12px!important}.dss-bar h1{font-size:1.1rem!important}.dss-bar a.dss-back{padding:8px 12px!important}}';

  function wire(a) {
    a.setAttribute('href', HOME);
    a.setAttribute('aria-label', role === 'teacher' ? 'Back to Teacher Tools' : 'Back to School Admin');
    if (a._dssWired) return; a._dssWired = true;
    a.addEventListener('click', function (e) {
      try { if (window.opener && !window.opener.closed) { e.preventDefault(); window.close(); setTimeout(function () { window.location.href = HOME; }, 300); } } catch (x) {}
    });
  }
  // the small line above the page name is the school's name only (no "· TeachBot")
  function name(bar) {
    var sub = bar.querySelector('.sub'); if (!sub) return;
    var school = ''; try { var u = JSON.parse(localStorage.getItem('dss_user') || '{}'); school = u.school_name || (u.schools && u.schools.name) || (role !== 'teacher' ? u.name : '') || ''; } catch (e) {}
    function fix() { var t = sub.textContent.replace(/\s*[·•|-]\s*TeachBot\s*$/i, '').trim(); if (/^(TeachBot|DigiSmartSchool)?$/i.test(t) && school) t = school; if (t !== sub.textContent) sub.textContent = t; }
    fix(); new MutationObserver(fix).observe(sub, { childList: true, characterData: true, subtree: true });
  }
  function run() {
    if (document.getElementById('dss-bar-style')) return;
    var st = document.createElement('style'); st.id = 'dss-bar-style'; st.textContent = css; document.head.appendChild(st);
    var bar = document.querySelector('header.band, div.band, body > header, body > .header, body > .topbar, #editor > .top');
    if (!bar) {            // a page with no top bar: its own Back link follows the same rule
      var solo = document.querySelector('a.back'); if (solo) { solo.textContent = ARROW; solo.classList.add('dss-back', 'dss-solo'); wire(solo); }
      return;
    }
    bar.classList.add('dss-bar');
    if (bar.matches('header') && !bar.querySelector('.in')) bar.classList.add('dss-flat');
    var links = [].slice.call(bar.querySelectorAll('a')).filter(function (a) { return !a.closest('nav'); });   // tab links inside the bar stay as they are
    var back = links.filter(function (a) { return a.textContent.trim().charCodeAt(0) === 8592 || a.classList.contains('back') || a.classList.contains('back-btn'); })[0];
    if (back) {
      back.textContent = ARROW; back.classList.add('dss-back');
      back.parentNode.insertBefore(back, back.parentNode.firstChild);
    } else {               // a page that had no Back button gets one
      back = document.createElement('a'); back.textContent = ARROW; back.className = 'dss-back';
      var box = bar.querySelector('.in') || bar;
      var flex = /flex/.test(getComputedStyle(box).display);
      if (!flex) back.classList.add('dss-float');
      else {               // Back, then the page name, on the left; the page's own buttons stay on the right
        box.style.justifyContent = 'flex-start';
        var last = box.lastElementChild; if (last && box.children.length > 1) last.style.marginLeft = 'auto';
        if (!box.style.gap) box.style.gap = '14px';
      }
      box.insertBefore(back, box.firstChild);
    }
    wire(back);
    // a "Close" button that only closes the tab is the same thing as Back
    [].slice.call(bar.querySelectorAll('button[onclick]')).forEach(function (b) { if (/window\.close\(\)/.test(b.getAttribute('onclick'))) b.style.display = 'none'; });
    links.forEach(function (a) { if (a !== back) a.classList.add('dss-link'); });
    name(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  // some pages set the Back link again after loading their data — keep the one rule
  window.addEventListener('load', function () { run(); var b = document.querySelector('a.dss-back'); if (b) b.setAttribute('href', HOME); });
})();
