/* js/session-header.js — DigiSmart
   Adds the signed login (localStorage 'dss_session', made at login) to every
   request a page makes to our own server (/api/...). The server uses it to check
   who is asking and which school they belong to. Requests to other websites are
   left untouched, and a header a page already set is never replaced.
   Include it near the top of a page, before any other script:
     <script src="js/session-header.js"></script> */
(function () {
  if (!window.fetch || window.__dssSessionHeader) return;
  window.__dssSessionHeader = true;
  var realFetch = window.fetch.bind(window);

  function ourApi(url) {
    try {
      var u = new URL(url, window.location.href);
      return u.origin === window.location.origin && u.pathname.indexOf('/api/') === 0;
    } catch (e) { return false; }
  }

  window.fetch = function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var token = '';
      try { token = localStorage.getItem('dss_session') || ''; } catch (e) {}
      if (token && ourApi(url) && typeof input === 'string') {
        init = init || {};
        var h = new Headers(init.headers || {});
        if (!h.has('x-dss-session')) h.set('x-dss-session', token);
        init = Object.assign({}, init, { headers: h });
      }
    } catch (e) {}
    return realFetch(input, init);
  };
})();
