// /api/auto-fill-week.js — "Fill this week from Lesson Plans" on its own (Nov 2026)
//
// Every Saturday at 5 PM India time (after that day's 4 PM send), Vercel's timer calls this.
// For every school that has an approved Lesson Plan, it fills NEXT week (Mon–Sat) in the
// Homework Planner exactly the way the principal's 📘 "Fill this week from Lesson Plans" button does:
//   • homework from the approved Lesson Plans (the subject's fixed line where one is set)
//   • class work, one short line per lesson
//   • "Tomorrow class test" added to homework already in the week for the day before a test
// Nothing already in the week is changed or replaced — a class + day + subject that already
// has homework (or class work) is left alone. Everything stays editable until it is sent at 4 PM.
// The 📘 button still works as before (for a plan approved after Saturday, or to fill again).
//
// It uses the SAME two APIs as the button (term-plan.js and homework.js), called here on the
// server as each school's principal, so both always give the same result.
//
// GET  (Vercel timer, needs CRON_SECRET)
//   optional ?from=YYYY-MM-DD (a Monday)  — fill that week instead of next week (for testing)
//   optional ?school=<code or id>         — only that school (for testing)
//   optional ?dry=1                       — only report what would be added, save nothing

const https = require('https');
const crypto = require('crypto');
const termPlanApi = require('./term-plan.js');
const homeworkApi = require('./homework.js');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
function sb(method, path) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY || '';
    const r = https.request({ hostname: SB_HOST, path: path, method: method,
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key } }, function (res) {
      let d = ''; res.setEncoding('utf8');
      res.on('data', function (c) { d += c; });
      res.on('end', function () { try { resolve({ status: res.statusCode, data: d ? JSON.parse(d) : [] }); } catch (e) { resolve({ status: res.statusCode, data: d }); } });
    });
    r.on('error', function (e) { resolve({ status: 0, data: { message: e.message } }); });
    r.end();
  });
}
const ok = function (r) { return r && r.status >= 200 && r.status < 300; };
const enc = encodeURIComponent;
const isDate = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); };

// India-time dates
function istToday() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }
function addDays(s, n) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function nextMonday(s) { const d = new Date(s + 'T00:00:00Z'); const w = d.getUTCDay(); return addDays(s, w === 1 ? 7 : (8 - w) % 7 || 7); }

// A short signed login for one school, the same shape as /api/auth's (school admin = principal)
function sessionFor(schoolId) {
  const payload = JSON.stringify({ sid: String(schoolId), role: 'school_admin', exp: Date.now() + 10 * 60 * 1000 });
  const sig = crypto.createHmac('sha256', process.env.SUPABASE_SECRET_KEY || '').update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + sig;
}

// Call one of our own API files on the server, as if the principal's page called it
function callApi(handler, token, body) {
  return new Promise(function (resolve) {
    const res = {
      statusCode: 200,
      setHeader: function () {},
      status: function (c) { this.statusCode = c; return this; },
      json: function (d) { resolve(Object.assign({ _status: this.statusCode }, d || {})); return this; },
      end: function () { resolve({ _status: this.statusCode }); return this; }
    };
    Promise.resolve(handler({ method: 'POST', headers: { 'x-dss-session': token }, body: body, query: {} }, res))
      .catch(function (e) { resolve({ error: 'Server error: ' + (e && e.message || e) }); });
  });
}

// Same as the Homework Planner page: take labels like "Homework note:" off each line
function cleanTpText(t) {
  return String(t || '').trim().split('\n').map(function (l) {
    l = l.trim().replace(/^(homework\s*note|homework|reading|writing|note)\s*[:：\-–]\s*/i, '');
    return l.charAt(0).toUpperCase() + l.slice(1);
  }).filter(Boolean).join('\n');
}
function fixedText(FX, c, sb) { const f = FX && FX[c] && FX[c][sb]; return f && f.en ? f.en + (f.ta ? '\n' + f.ta : '') : ''; }
const lc = function (s) { return String(s || '').toLowerCase(); };

async function fillSchool(schoolId, from, dry) {
  const to = addDays(from, 5);
  const token = sessionFor(schoolId);
  const L = await callApi(homeworkApi, token, { action: 'list', from: from, to: to });
  if (!L.success) return { error: 'Could not read the week: ' + (L.error || 'no answer') };
  const all = L.items || [], FX = L.fixed || {};
  const hwHave = all.filter(function (i) { return i.entry_type !== 'classwork' && i.entry_type !== 'bookback'; });
  const cwHave = all.filter(function (i) { return i.entry_type === 'classwork'; });
  const has = function (list, x) { return list.some(function (i) { return i.class_name === x.class_name && i.hw_date === x.date && lc(i.subject) === lc(x.subject) && i.status !== 'returned'; }); };
  const today = istToday();

  const d = await callApi(termPlanApi, token, { action: 'for_week', from: from, to: to });
  if (d.error) return { error: 'Could not read the Lesson Plans: ' + d.error };
  const rows = (d.rows || []).filter(function (x) { return x.date > today; });
  const items = rows.filter(function (x) { return !has(hwHave, x); }).map(function (x) {
    return { class_name: x.class_name, subject: x.subject, kind: 'Written', homework: fixedText(FX, x.class_name, x.subject) || cleanTpText(x.homework), hw_date: x.date, made_by: 'principal' };
  }).filter(function (x) { return String(x.homework || '').trim(); });

  let cwItems = [], cwErr = '';
  const dc = await callApi(termPlanApi, token, { action: 'cw_for_week', from: from, to: to });
  if (dc.error) cwErr = dc.error;
  else cwItems = (dc.rows || []).filter(function (x) { return x.date > today && !has(cwHave, x) && String(x.classwork || '').trim(); })
    .map(function (x) { return { class_name: x.class_name, subject: x.subject, kind: 'Class work', homework: x.classwork, hw_date: x.date, made_by: 'principal', entry_type: 'classwork' }; });

  // "Tomorrow class test" onto homework already in the week (not sent, not already saying class test)
  const tnotes = rows.filter(function (x) { return x.test_note; }).map(function (x) {
    const i = hwHave.find(function (i) { return i.class_name === x.class_name && i.hw_date === x.date && lc(i.subject) === lc(x.subject) && i.status !== 'returned'; });
    return i && !i.sent_at && !/class test/i.test(String(i.homework || '')) ? { i: i, note: x.test_note } : null;
  }).filter(Boolean);

  const out = { week: from + ' to ' + to, homework: items.length, classwork: cwItems.length, test_notes: tnotes.length,
                not_approved: d.not_approved || 0, errors: [] };
  if (cwErr) out.errors.push('Class work: ' + cwErr);
  if (dry) return out;

  let n = 0, m = 0, t = 0;
  for (let a = 0; a < items.length; a += 60) {
    const s = await callApi(homeworkApi, token, { action: 'save_many', items: items.slice(a, a + 60), teacher_name: 'Term Plan' });
    if (s.error) out.errors.push('Homework: ' + s.error); else n += (s.items || []).length;
  }
  for (let a = 0; a < cwItems.length; a += 60) {
    const s = await callApi(homeworkApi, token, { action: 'save_many', items: cwItems.slice(a, a + 60), teacher_name: 'Term Plan' });
    if (s.error) out.errors.push('Class work: ' + s.error); else m += (s.items || []).length;
  }
  for (const x of tnotes) {
    const s = await callApi(homeworkApi, token, { action: 'save', id: x.i.id, class_name: x.i.class_name, subject: x.i.subject,
      kind: x.i.kind || 'Written', homework: String(x.i.homework || '').trim() + '\n' + x.note, hw_date: x.i.hw_date });
    if (s.error) out.errors.push('Class test note: ' + s.error); else t++;
  }
  out.homework = n; out.classwork = m; out.test_notes = t;
  return out;
}

module.exports = async function handler(req, res) {
  if (!process.env.SUPABASE_SECRET_KEY) return res.status(500).json({ error: 'SUPABASE_SECRET_KEY is not set in Vercel.' });
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) {
    return res.status(401).json({ error: 'Not allowed. (CRON_SECRET missing or wrong.)' });
  }
  try {
    const q = req.query || {};
    const from = isDate(q.from) ? q.from : nextMonday(istToday());
    const dry = q.dry === '1';
    let ids;
    if (q.school) ids = [String(q.school)];
    else {
      // every school with at least one approved Lesson Plan
      const p = await sb('GET', '/rest/v1/term_plans?status=eq.approved&select=school_id');
      if (!ok(p)) return res.status(500).json({ error: 'Could not read Lesson Plans.' });
      ids = Array.from(new Set(p.data.map(function (x) { return x.school_id; }).filter(Boolean)));
    }
    const report = [];
    for (const sid of ids) {
      let s = await sb('GET', '/rest/v1/schools?school_code=eq.' + enc(sid) + '&select=id,name&limit=1');
      if ((!ok(s) || !s.data.length) && /^[0-9a-fA-F-]{36}$/.test(String(sid))) s = await sb('GET', '/rest/v1/schools?id=eq.' + enc(sid) + '&select=id,name&limit=1');
      const sch = ok(s) && s.data.length ? s.data[0] : null;
      const r = await fillSchool(sch ? sch.id : sid, from, dry);
      report.push(Object.assign({ school: (sch && sch.name) || sid }, r));
      if (r.error || (r.errors && r.errors.length)) console.error('auto-fill-week', (sch && sch.name) || sid, r.error || r.errors);
    }
    return res.json({ success: true, dry: dry, from: from, schools: report });
  } catch (e) {
    console.error('auto-fill-week', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
