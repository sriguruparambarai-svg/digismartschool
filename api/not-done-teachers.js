// /api/not-done-teachers.js — TeachBot's part of ERP's "not done yet" alerts (Nov 2026)
//
// Every school day at 4:15 PM India time (Vercel timer), for every school with DigiSmart ERP:
//   • teachers who use "Submit my day" in the Teacher App but haven't submitted today (only after the
//     school's own deadline — My School's Academics → Teachers; default 3:30 PM)
//   • on Mondays: teachers on the printed weekly checklist whose last week's checklist was not uploaded
// It hands the names to ERP (api/teachbot-link.js → not_done_teachers). At 4:30 PM ERP's api/not-done.js
// tells the principal (Owner App, principal login) and, if anything is still not done, the owner.
// Only teachers who actually use the step are counted: submitted at least once in the last 14 days /
// had a printed checklist uploaded in the 4 weeks before.
//
// GET (Vercel timer, Bearer CRON_SECRET)   optional ?school=<code or id>  ?dry=1 (show, don't send)

const https = require('https');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
function sb(path) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY || '';
    const r = https.request({ hostname: SB_HOST, path: path, method: 'GET', headers: { apikey: key, Authorization: 'Bearer ' + key } }, function (res) {
      let d = ''; res.setEncoding('utf8');
      res.on('data', function (c) { d += c; });
      res.on('end', function () { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve(res.statusCode < 300 && Array.isArray(j) ? j : null); });
    });
    r.on('error', function () { resolve(null); }); r.end();
  });
}
function postErp(row) {
  return new Promise(function (resolve) {
    const key = process.env.TEACHBOT_LINK_KEY || '';
    const data = JSON.stringify(row);
    const r = https.request({ hostname: 'erp.digismartschool.com', path: '/api/teachbot-link', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-teachbot-key': key } }, function (res) {
      let d = ''; res.setEncoding('utf8');
      res.on('data', function (c) { d += c; });
      res.on('end', function () { let j = {}; try { j = JSON.parse(d); } catch (e) { j = { error: d.slice(0, 200) }; } resolve(j); });
    });
    r.on('error', function (e) { resolve({ error: e.message }); });
    r.write(data); r.end();
  });
}
const enc = encodeURIComponent;
function istNow() { return new Date(Date.now() + 5.5 * 3600e3); }
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function mondayOf(d) { return addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7)); }
function officeOnly(t) {
  const a = t.access || [];
  return a.indexOf('notebook_check') !== -1 && !['today', 'tomorrow', 'hw_check', 'submit_day'].some(function (k) { return a.indexOf(k) !== -1; });
}
function classesOf(t) {
  const seen = {};
  (t.classes || []).forEach(function (c) { if (c && c.class_name) seen[c.class_name] = 1; });
  return Object.keys(seen).join(', ');
}

async function forSchool(s, today, now) {
  const set = await sb('/rest/v1/teacher_app_settings?school_id=eq.' + enc(s.id) + '&select=deadline&limit=1');
  const dl = set && set[0] && /^\d{2}:\d{2}$/.test(String(set[0].deadline || '')) ? String(set[0].deadline) : '15:30';
  const teachers = (await sb('/rest/v1/teacher_app?school_id=eq.' + enc(s.id) + '&active=eq.true&select=id,name,classes,access&order=name.asc') || [])
    .filter(function (t) { return (t.classes || []).length && !officeOnly(t); });
  const out = { day: [], week: [], deadline: dl, submitted: 0, week_of: null };

  // 1. Submit my day — after the deadline only
  const reports = await sb('/rest/v1/teacher_day_reports?school_id=eq.' + enc(s.id) + '&report_date=gte.' + addDays(today, -14) +
    '&report_date=lte.' + today + '&submitted_at=not.is.null&select=teacher_app_id,report_date&limit=5000') || [];
  const usedApp = {}, today_ = {};
  reports.forEach(function (r) { (String(r.report_date).slice(0, 10) === today ? today_ : usedApp)[String(r.teacher_app_id)] = 1; });
  out.submitted = Object.keys(today_).length;
  if (now >= dl) {
    teachers.forEach(function (t) {
      const id = String(t.id);
      if ((t.access || []).indexOf('submit_day') === -1) return;
      if (!usedApp[id] && !today_[id]) return;     // doesn't use the Teacher App's Submit my day
      if (!today_[id]) out.day.push({ name: t.name, classes: classesOf(t) });
    });
  }

  // 2. Mondays: last week's printed checklist
  if (new Date(today + 'T00:00:00Z').getUTCDay() === 1) {
    const last = addDays(mondayOf(today), -7);
    const wk = await sb('/rest/v1/teacher_weekly?school_id=eq.' + enc(s.id) + '&week_start=gte.' + addDays(last, -28) + '&week_start=lte.' + last +
      '&select=teacher_id,week_start&limit=5000');
    if (wk) {
      const before = {}, lastWeek = {};
      wk.forEach(function (w) { (String(w.week_start).slice(0, 10) === last ? lastWeek : before)[String(w.teacher_id)] = 1; });
      out.week_of = last;
      teachers.forEach(function (t) { const id = String(t.id); if (before[id] && !lastWeek[id]) out.week.push({ name: t.name, classes: classesOf(t) }); });
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ error: 'Not allowed.' });
  const q = req.query || {};
  const ist = istNow(), today = ist.toISOString().slice(0, 10), now = ist.toISOString().slice(11, 16);
  if (ist.getUTCDay() === 0) return res.json({ success: true, skipped: 'Sunday' });
  let schools = await sb('/rest/v1/schools?has_erp=eq.true&select=id,name,school_code,erp_school_id') || [];
  if (q.school) schools = schools.filter(function (s) { return String(s.id) === q.school || String(s.school_code) === q.school; });
  const report = [];
  for (const s of schools) {
    if (!s.erp_school_id) continue;
    const data = await forSchool(s, today, now);
    if (q.dry === '1') { report.push({ school: s.name, data: data }); continue; }
    const r = await postErp({ action: 'not_done_teachers', school_id: s.erp_school_id, day: today, data: data });
    report.push({ school: s.name, ok: !!r.ok, day: data.day.length, week: data.week.length, error: r.error || undefined });
  }
  return res.json({ success: true, date: today, schools: report });
};
module.exports.forSchool = forSchool;
