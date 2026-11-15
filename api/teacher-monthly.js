// /api/teacher-monthly.js — teachers' monthly evaluation to the owner (Nov 2026)
//
// On the 1st of every month at 7 PM India time, Vercel's timer calls this. For every school with DigiSmart ERP,
// it works out last month's appraisal for each teacher — the same as My School's Academics → Teachers →
// 📊 Appraisal (weekly checklist ticks, homework sheet corrected ticks, notebook check, children's class quiz,
// and where her ticks don't match) — and sends it to the owner's Owner App in ERP as one alert.
// Teachers never see it.
//
// GET  (Vercel timer, needs CRON_SECRET)
//   optional ?month=YYYY-MM   — that month instead of last month (for testing)
//   optional ?school=<code or id> — only that school
//   optional ?dry=1           — show what would be sent, send nothing

const https = require('https');
const crypto = require('crypto');
const teacherApp = require('./teacher-app.js');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
function sb(path) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY || '';
    const r = https.request({ hostname: SB_HOST, path: path, method: 'GET', headers: { apikey: key, Authorization: 'Bearer ' + key } }, function (res) {
      let d = ''; res.setEncoding('utf8');
      res.on('data', function (c) { d += c; });
      res.on('end', function () { try { resolve(JSON.parse(d)); } catch (e) { resolve([]); } });
    });
    r.on('error', function () { resolve([]); }); r.end();
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
function sessionFor(schoolId) {
  const payload = JSON.stringify({ sid: String(schoolId), role: 'school_admin', exp: Date.now() + 10 * 60 * 1000 });
  const sig = crypto.createHmac('sha256', process.env.SUPABASE_SECRET_KEY || '').update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + sig;
}
function callApi(handler, token, body) {
  return new Promise(function (resolve) {
    const res = { statusCode: 200, setHeader: function () {}, status: function (c) { this.statusCode = c; return this; },
      json: function (d) { resolve(d || {}); return this; }, end: function () { resolve({}); return this; } };
    Promise.resolve(handler({ method: 'POST', headers: { 'x-dss-session': token }, body: body, query: {} }, res))
      .catch(function (e) { resolve({ error: String(e && e.message || e) }); });
  });
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ error: 'Not allowed.' });
  const q = req.query || {};
  const now = new Date(Date.now() + 5.5 * 3600e3);
  let y = now.getUTCFullYear(), m = now.getUTCMonth();   // last month (0-based m is already "last" in 1-based terms)
  if (m === 0) { y--; m = 12; }
  if (/^\d{4}-\d{2}$/.test(String(q.month || ''))) { y = +q.month.slice(0, 4); m = +q.month.slice(5, 7); }
  const mm = String(m).padStart(2, '0'), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = y + '-' + mm + '-01', to = y + '-' + mm + '-' + String(last).padStart(2, '0');
  const alertDate = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);   // the 1st of the next month
  const label = MONTHS[m - 1] + ' ' + y;
  let schools = await sb('/rest/v1/schools?has_erp=eq.true&select=id,name,school_code,erp_school_id');
  if (!Array.isArray(schools)) schools = [];
  if (q.school) schools = schools.filter(function (s) { return String(s.id) === q.school || String(s.school_code) === q.school; });
  const report = [];
  for (const s of schools) {
    if (!s.erp_school_id) continue;
    const d = await callApi(teacherApp, sessionFor(s.school_code || s.id), { action: 'tc_scores', from: from, to: to });
    if (!d.success) { report.push({ school: s.name, error: d.error }); continue; }
    const list = (d.teachers || []).map(function (t) {
      return { name: t.name, overall: t.overall, rating: t.rating, handed: t.handed, weeks: t.weeks_total, own: t.own,
               sheet: t.sheet.pct, notebook: t.notebook.pct, quiz: t.quiz.pct, flags: t.flags, complaints: (t.complaints || []).length };
    });
    const need = list.filter(function (t) { return t.rating === 'Needs attention'; }).length;
    const flagged = list.filter(function (t) { return (t.flags || []).some(function (f) { return f.indexOf('⚠️') === 0; }); }).length;
    const title = '👩‍🏫 Teachers\' evaluation — ' + label;
    const body = list.length + ' teacher' + (list.length === 1 ? '' : 's') + (need ? ' · ' + need + ' need attention' : '') + (flagged ? ' · ' + flagged + ' with ticks that don\'t match' : '');
    const data = { month: label, from: from, to: to, weeks: d.weeks.length, teachers: list };
    if (q.dry === '1') { report.push({ school: s.name, title: title, body: body, data: data }); continue; }
    const r = await postErp({ action: 'owner_alert', school_id: s.erp_school_id, kind: 'teacher_monthly', alert_date: alertDate, title: title, body: body, data: data });
    report.push({ school: s.name, sent: !!r.ok, already: !!r.already_sent, error: r.error || undefined });
  }
  return res.json({ success: true, month: label, schools: report });
};
