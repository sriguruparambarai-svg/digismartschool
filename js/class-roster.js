/* js/class-roster.js — DigiSmart
   Answer card number = roll number. This reads the class's student list
   (Dashboard → Students, table diary_students) and returns { "7": "Priya", ... }
   so pages can show names instead of card numbers.
   Nothing is saved: names stay only in the school's student list.
   Usage:  dssRoster('Class 5').then(function(r){ r.names, r.error });
   r.names is {} when there is no list for that class or no school login. */
(function () {
  if (window.dssRoster) return;
  var cache = {}, schoolIdPromise = null;

  function post(body) {
    var tok = '';
    try { tok = localStorage.getItem('dss_session') || ''; } catch (e) {}
    return fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dss-session': tok },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  // The school's main id, the same one the Dashboard saves students under.
  function schoolId() {
    if (schoolIdPromise) return schoolIdPromise;
    schoolIdPromise = (function () {
      var u = {}, role = '';
      try { u = JSON.parse(localStorage.getItem('dss_user') || '{}'); role = localStorage.getItem('dss_role') || ''; } catch (e) {}
      if (role !== 'teacher' && role !== 'school_admin') return Promise.resolve({ id: '', error: 'Log in as a teacher or school admin to see names.' });
      return post({ action: 'get_school_info', email: u.email || '', role: role }).then(function (d) {
        var s = d && d.school;
        return s && s.id ? { id: String(s.id) } : { id: '', error: (d && d.error) || 'School not found for this login.' };
      });
    })().catch(function (e) { schoolIdPromise = null; return { id: '', error: e.message || String(e) }; });
    return schoolIdPromise;
  }

  // "07", "7", " 7 " → "7"; anything not a plain number is kept as typed.
  function rollKey(v) {
    var t = String(v == null ? '' : v).trim();
    return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t;
  }

  window.dssRoster = function (cls) {
    cls = String(cls || '').trim();
    if (!cls) return Promise.resolve({ names: {}, error: 'No class chosen.' });
    if (cache[cls]) return cache[cls];
    cache[cls] = schoolId().then(function (s) {
      if (!s.id) return { names: {}, error: s.error };
      return post({ action: 'get_diary_students', school_id: s.id }).then(function (d) {
        if (d && d.error) throw new Error(d.error);
        var names = {}, n = 0;
        ((d && d.students) || []).forEach(function (st) {
          if (String(st.class || '').trim() === cls && st.roll_no != null && st.name) { names[rollKey(st.roll_no)] = String(st.name); n++; }
        });
        return n ? { names: names } : { names: {}, error: 'No student list for ' + cls + ' yet. Add it in Dashboard → Students.' };
      });
    }).catch(function (e) {
      delete cache[cls];                       // try again next time
      return { names: {}, error: 'Could not read the student list: ' + (e.message || e) };
    });
    return cache[cls];
  };
})();
