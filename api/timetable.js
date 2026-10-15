// /api/timetable.js — School Timetable for TeachBot (Oct 2026)
//
// One timetable shape for every school, whatever its source:
//   • schools WITH ERP  → read live from ERP's master timetable (ERP's api/teachbot-timetable.js,
//                         proved with TEACHBOT_LINK_KEY — the same key the homework link uses)
//   • schools WITHOUT ERP → the timetable read from a photo by AI and checked by the principal,
//                         kept in school_timetable (step6-timetable.sql)
// The Term Planner uses it to put lessons on each class's real periods, and TeachBot
// lessons only on the periods the class goes to the AI class room.
//
// The school ALWAYS comes from the signed login (x-dss-session), never from the page.
// POST { action, ... }
//   get                    teacher or principal → { source:'erp'|'photo'|'', periods, days, classes, grid, ai_room, ... }
//                          grid = { Mon: { "0": { "Class 3": { subject, teacher, ai } } } }   ("0" = first period)
//   save { periods, days, classes, grid, ai_room }   principal, schools without ERP only

const https = require('https');
const crypto = require('crypto');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const ERP_DOOR_HOST = 'erp.digismartschool.com';
const ERP_DOOR_PATH = '/api/teachbot-timetable';
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
                    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const CLASS_FROM_ERP = { PreKG: 'Pre KG', 'PRE KG': 'Pre KG', 'Pre-KG': 'Pre KG' };

function db(method, path, body) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY || '';
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname: SB_HOST, path: path, method: method,
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=representation' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(opts, function (res) {
      let d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () { try { resolve({ status: res.statusCode, data: d ? JSON.parse(d) : [] }); } catch (e) { resolve({ status: res.statusCode, data: d }); } });
    });
    r.on('error', function (e) { resolve({ status: 0, data: { message: e.message } }); });
    if (data) r.write(data);
    r.end();
  });
}
function erpDoor(body) {
  return new Promise(function (resolve) {
    const key = process.env.TEACHBOT_LINK_KEY || '';
    if (!key) return resolve({ status: 0, data: { error: 'TEACHBOT_LINK_KEY is not set in TeachBot\'s Vercel settings.' } });
    const data = JSON.stringify(body);
    const r = https.request({ hostname: ERP_DOOR_HOST, path: ERP_DOOR_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-teachbot-key': key } }, function (res) {
      let d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () { let j = null; try { j = d ? JSON.parse(d) : null; } catch (e) { j = { error: d.slice(0, 200) }; } resolve({ status: res.statusCode, data: j || {} }); });
    });
    r.on('error', function (e) { resolve({ status: 0, data: { error: e.message } }); });
    r.write(data); r.end();
  });
}
const ok = function (r) { return r && r.status >= 200 && r.status < 300; };
const why = function (r) { const d = r && r.data; return 'status ' + (r && r.status) + ': ' + (typeof d === 'string' ? d : (d && (d.message || d.error)) || JSON.stringify(d)); };
const enc = encodeURIComponent;
const clip = function (s, n) { return String(s == null ? '' : s).trim().substring(0, n); };

function readSession(raw) {
  if (!raw) return null;
  try {
    const parts = String(raw).split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0], 'base64').toString();
    const secret = process.env.SUPABASE_SECRET_KEY || '';
    if (!secret) return null;
    const expect = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const got = Buffer.from(parts[1], 'utf8'), want = Buffer.from(expect, 'utf8');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    const data = JSON.parse(payload);
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch (e) { return null; }
}
async function findSchool(label) {
  const s = String(label || '').trim();
  if (!s) return null;
  const cols = 'id,name,school_code,has_erp,erp_school_id';
  let r = await db('GET', '/rest/v1/schools?school_code=eq.' + enc(s) + '&select=' + cols + '&limit=1');
  if ((!ok(r) || !r.data.length) && /^[0-9a-fA-F-]{36}$/.test(s)) r = await db('GET', '/rest/v1/schools?id=eq.' + enc(s) + '&select=' + cols + '&limit=1');
  return ok(r) && r.data.length ? r.data[0] : null;
}

// ── one clean shape ──
function cleanPeriods(list) {
  return (Array.isArray(list) ? list : []).slice(0, 20).map(function (p) {
    return { label: clip(p && p.label, 40), start: clip(p && p.start, 5), end: clip(p && p.end, 5), isBreak: !!(p && p.isBreak) };
  });
}
function cleanGrid(grid, renameClass) {
  const out = {};
  if (!grid || typeof grid !== 'object' || Array.isArray(grid)) return out;
  Object.keys(grid).forEach(function (day) {
    const d = DAY_SHORT[String(day).toLowerCase()];
    const dayObj = grid[day];
    if (!d || !dayObj || typeof dayObj !== 'object') return;
    const o = {};
    Object.keys(dayObj).slice(0, 20).forEach(function (pi) {
      if (!/^\d{1,2}$/.test(pi)) return;
      const row = dayObj[pi];
      if (!row || typeof row !== 'object') return;
      const r = {};
      Object.keys(row).slice(0, 30).forEach(function (cls) {
        const c = row[cls];
        if (!c || typeof c !== 'object') return;
        const subject = clip(c.subject, 60), teacher = clip(c.teacher, 120);
        if (!subject && !teacher) return;
        const name = clip(renameClass ? (CLASS_FROM_ERP[cls] || cls) : cls, 30);
        r[name] = { subject: subject, teacher: teacher };
        if (c.ai === true) r[name].ai = true;
        if (c.common === true) r[name].common = true;
      });
      if (Object.keys(r).length) o[pi] = r;
    });
    out[d] = o;
  });
  return out;
}
function cleanDays(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach(function (d) { const s = DAY_SHORT[String(d).toLowerCase()]; if (s && out.indexOf(s) === -1) out.push(s); });
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dss-session');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SUPABASE_SECRET_KEY) return res.status(500).json({ error: 'SUPABASE_SECRET_KEY is not set in Vercel.' });

  try {
    const who = readSession(req.headers['x-dss-session']);
    if (!who || ['teacher', 'school_admin', 'super_admin'].indexOf(who.role) === -1) return res.status(401).json({ error: 'Please log in again.' });
    const body = req.body || {};
    const school = await findSchool(who.role === 'super_admin' ? body.school_id : who.sid);
    if (!school) return res.status(403).json({ error: 'Your school was not found. Please log in again.' });
    const principal = who.role !== 'teacher';
    const action = String(body.action || '');
    const viaErp = school.has_erp === true && !!school.erp_school_id;

    if (action === 'get') {
      if (viaErp) {
        const r = await erpDoor({ school_id: school.erp_school_id });
        if (!ok(r) || !r.data || r.data.ok !== true) return res.json({ success: true, source: 'erp', error: 'Could not read the ERP timetable: ' + why(r), principal: principal });
        const d = r.data;
        const grid = cleanGrid(d.grid, true);
        const classes = (Array.isArray(d.classes) ? d.classes : []).map(function (c) { return CLASS_FROM_ERP[c] || c; });
        let days = cleanDays(d.working_days);
        if (!days.length) days = Object.keys(grid);
        return res.json({ success: true, source: 'erp', principal: principal, academic_year: d.academic_year || '',
          periods: cleanPeriods(d.periods), days: days, classes: classes, grid: grid, ai_room: !!d.ai_class,
          updated_at: d.updated_at || null, note: d.note || '' });
      }
      const r = await db('GET', '/rest/v1/school_timetable?school_id=eq.' + enc(school.id) + '&select=*&limit=1');
      if (!ok(r)) return res.json({ error: 'Could not read the timetable: ' + why(r) + (r.status === 404 ? ' (Has step6-timetable.sql been run in Supabase?)' : '') });
      const t = r.data[0];
      if (!t) return res.json({ success: true, source: '', principal: principal, periods: [], days: [], classes: [], grid: {}, ai_room: false });
      return res.json({ success: true, source: 'photo', principal: principal, periods: t.periods || [], days: t.days || [],
        classes: t.classes || [], grid: t.grid || {}, ai_room: !!t.ai_room, updated_at: t.updated_at });
    }

    if (action === 'save') {
      if (!principal) return res.status(403).json({ error: 'Only the principal can change the timetable.' });
      if (viaErp) return res.json({ error: 'This school\'s timetable comes from ERP. Change it in ERP → Timetable → Master timetable.' });
      const grid = cleanGrid(body.grid, false);
      if (!Object.keys(grid).length) return res.json({ error: 'The timetable is empty.' });
      const row = { school_id: school.id, periods: cleanPeriods(body.periods), days: cleanDays(body.days),
        classes: (Array.isArray(body.classes) ? body.classes : []).slice(0, 30).map(function (c) { return clip(c, 30); }).filter(Boolean),
        grid: grid, ai_room: !!body.ai_room, updated_at: new Date().toISOString() };
      await db('DELETE', '/rest/v1/school_timetable?school_id=eq.' + enc(school.id));
      const r = await db('POST', '/rest/v1/school_timetable', row);
      if (!ok(r)) return res.json({ error: 'Could not save: ' + why(r) + (r.status === 404 ? ' (Has step6-timetable.sql been run in Supabase?)' : '') });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
