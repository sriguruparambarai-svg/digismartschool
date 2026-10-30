// /api/keep-warm.js — keeps the app awake during school hours (Oct 2026)
//
// Why: when nobody has used the app for a while, the server and the database
// "fall asleep". The first person to open Academic Control in the morning then
// waited a long time. Vercel's timer (vercel.json) calls this every 5 minutes,
// Monday to Saturday, 7:30 AM to 5:25 PM India time, so everything stays awake.
//
// It only knocks — it reads one tiny row and changes nothing anywhere:
//   1. the TeachBot database (one row from schools)
//   2. /api/teacher-app and /api/timetable (they answer the 'ping' straight away)
//   3. the ERP timetable door (no key is sent, so ERP just says "not allowed" — that still wakes it)
//
// GET only, and only with CRON_SECRET (Vercel's timer sends it), same as /api/homework.

const https = require('https');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const SITE_HOST = 'digismartschool.com';
const ERP_HOST = 'erp.digismartschool.com';

function knock(host, path, method, headers, body) {
  return new Promise(function (resolve) {
    const t0 = Date.now();
    const data = body ? JSON.stringify(body) : null;
    const h = Object.assign({}, headers || {});
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = https.request({ hostname: host, path: path, method: method, headers: h }, function (res) {
      res.on('data', function () {});
      res.on('end', function () { resolve({ status: res.statusCode, ms: Date.now() - t0 }); });
    });
    r.on('error', function (e) { resolve({ status: 0, ms: Date.now() - t0, error: e.message }); });
    r.setTimeout(20000, function () { r.destroy(new Error('no answer in 20 seconds')); });
    if (data) r.write(data);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) {
    return res.status(401).json({ error: 'Not allowed. (CRON_SECRET missing or wrong.)' });
  }
  const key = process.env.SUPABASE_SECRET_KEY || '';
  const [database, teacherApp, timetable, erp] = await Promise.all([
    knock(SB_HOST, '/rest/v1/schools?select=id&limit=1', 'GET', { apikey: key, Authorization: 'Bearer ' + key }),
    knock(SITE_HOST, '/api/teacher-app', 'POST', {}, { action: 'ping' }),
    knock(SITE_HOST, '/api/timetable', 'POST', {}, { action: 'ping' }),
    knock(ERP_HOST, '/api/teachbot-timetable', 'POST', {}, { ping: true })
  ]);
  return res.json({ success: true, database: database, teacher_app: teacherApp, timetable: timetable, erp: erp });
};
