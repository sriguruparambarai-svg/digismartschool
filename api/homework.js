// /api/homework.js — Homework Planner (Oct 2026)
//
// Teachers write homework for their class; it WAITS for the principal.
// The principal adds it to the week, edits it, or sends it back with a note.
// Homework that is added goes out ON ITS OWN DAY at 4 PM (India time):
//   • into the Student Diary (diary_entries — the same rows student.html reads)
//   • into ERP's Parent Portal (communications), only if the school owns ERP —
//     exactly the fields index.html's pushHomeworkToERP() already uses, so ERP
//     needs no change.
// Each homework is sent once only (sent_at), and cannot be changed after that.
//
// Table: homework_plan (made in Supabase, Step 1). Locked to browsers (RLS on);
// only this file reads or writes it, with the secret key.
//
// The school ALWAYS comes from the signed login (x-dss-session), never from the
// page, so one school can never see or change another school's homework.
//
// POST { action, ... }  (needs a teacher or principal login)
//   list        { from, to }                        → { items:[...] , today }
//   save        { id?, class_name, subject, kind, homework, hw_date, made_by, teacher_name }
//                 teacher: new or changed homework is always 'waiting'
//                 principal: new homework goes straight into the week ('added')
//   add         { ids:[...] }                       principal: waiting → added
//   take_out    { id }                              principal: added → waiting (only before it is sent)
//   send_back   { id, note }                        principal: waiting → returned
//   remove      { id }                              teacher: only if not added; principal: if not sent
//   past        { class_name }                      last year's homework of one class (for the repeat check)
//   save_timetable { plan }                         principal: the fixed homework timetable
//                 plan = { "Class 1": { "Mon": ["Hindi","Maths"], "Tue": ["English","EVS"], ... }, ... }
//   (list also returns the school's timetable, so teachers see it on their page)
//
// Table: homework_timetable (one row per school: school_id, plan, updated_at). RLS on, no policies.
//
// CLASS WORK (Oct 2026): the same table also holds class work — entry_type 'classwork'
// (homework rows are 'homework'). Same approval by the principal, same 4 PM send,
// but a SEPARATE parent message: into the diary's class_notes, and to ERP as type 'classwork'.
// erp_error: set when ERP refuses a send; such rows are tried again at the next send.
// BOOK BACK ANSWERS (Oct 2026): entry_type 'bookback' — sent from Teacher Tools → Book Back Answers.
// Same approval and 4 PM send, into the diary's book_back_answers (each set added below the
// earlier ones, never replacing them). Not sent to ERP.
//
// WORKBOOK PICKS (Oct 2026): the Workbook Generator's picks (what goes on Class Work,
// Home Work 1-3 and the Class Test of each chapter) are kept per school, so every
// computer sees the same plan and the planner knows what is on each workbook page.
//   workbook_get   {}                    → { plan, settings, updated_at, updated_by, can_save }
//   workbook_save  { plan, settings }    principal, or a teacher with the Workbook tick
// Table: workbook_plans (school_id, plan jsonb, settings jsonb, updated_at, updated_by). RLS on, no policies.
// GET  (Vercel's daily timer, needs CRON_SECRET)    sends everything due today, all schools

const https = require('https');
const crypto = require('crypto');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
// ERP's Parent Portal — same address and public key index.html already uses for homework.
const ERP_HOST = 'nkfxrbumhjztmdyepygt.supabase.co';
const ERP_KEY = process.env.ERP_PUBLIC_KEY || 'sb_publishable_7RgXFcDeOipMGoFuPI7XBQ_r_aJpZdL';
// ERP's parent-messages table is locked to browsers, so homework goes through ERP's own
// server door (api/teachbot-homework.js), proved with TEACHBOT_LINK_KEY — the same value
// must be set in BOTH Vercel projects.
const ERP_DOOR_HOST = 'erp.digismartschool.com';
const ERP_DOOR_PATH = '/api/teachbot-homework';
function postErpHomework(row) {
  return new Promise(function (resolve) {
    const key = process.env.TEACHBOT_LINK_KEY || '';
    if (!key) return resolve({ status: 0, data: { error: 'TEACHBOT_LINK_KEY is not set in TeachBot\'s Vercel settings.' } });
    const data = JSON.stringify(row);
    const r = https.request({
      hostname: ERP_DOOR_HOST, path: ERP_DOOR_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-teachbot-key': key }
    }, function (res) {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        let j = null; try { j = d ? JSON.parse(d) : null; } catch (e) { j = { error: d.slice(0, 200) }; }
        resolve({ status: res.statusCode, data: j || {} });
      });
    });
    r.on('error', function (e) { resolve({ status: 0, data: { error: e.message } }); });
    r.setTimeout(20000, function () { r.destroy(new Error('ERP did not answer in 20 seconds')); });
    r.write(data); r.end();
  });
}

const SEND_HOUR_IST = 16;          // 4 PM India time — the daily timer runs then
const CLASSES = ['Pre KG', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
                 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
// Sections (Oct 2026): a class may be split, e.g. LKG + "LKG B" (Vijayadasami children).
// The plain name ("LKG") stays section A, so nothing already saved has to move.
// Saved per school in homework_timetable.plan._sections, e.g. { "LKG": ["B"] }.
const SEC_LETTERS = ['B', 'C', 'D', 'E', 'F'];
const okCls = function (c) {
  c = String(c || '');
  if (CLASSES.indexOf(c) !== -1) return true;
  const m = c.match(/^(.+) ([B-F])$/);
  return !!(m && CLASSES.indexOf(m[1]) !== -1);
};
function cleanSections(x) {
  const out = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
  Object.keys(x).forEach(function (c) {
    if (CLASSES.indexOf(c) === -1 || !Array.isArray(x[c])) return;
    const l = SEC_LETTERS.filter(function (L) { return x[c].indexOf(L) !== -1; });
    if (l.length) out[c] = l;
  });
  return out;
}
// Name ERP should get: "LKG" becomes "LKG A" once LKG has a B section (ERP then sends it to A only).
function erpClassName(cls, sections) {
  return sections && sections[cls] && sections[cls].length ? cls + ' A' : cls;
}
const MADE_BY = ['teacher', 'ai', 'ai-week', 'principal'];
const TT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ENTRY_TYPES = ['homework', 'classwork', 'bookback'];
const textLimit = function (x) { return entryType(x) === 'bookback' ? 20000 : 1000; };   // answers are long
const entryType = function (x) { return ENTRY_TYPES.indexOf(x && x.entry_type) !== -1 ? x.entry_type : 'homework'; };

// The school's fixed homework timetable ({} if none saved yet).
async function readTimetable(school) {
  const r = await db('GET', '/rest/v1/homework_timetable?school_id=eq.' + enc(school.id) + '&select=plan,updated_at&limit=1');
  if (!ok(r)) return { error: 'Could not read the homework timetable: ' + why(r) };
  const sp = splitFixed((r.data.length && r.data[0].plan) || {});
  return { plan: sp.timetable, fixed: sp.fixed, sections: sp.sections, updated_at: r.data.length ? r.data[0].updated_at : null };
}
// Keep only real classes, Mon–Sat, and short subject names (at most 10 a day).
function cleanTimetable(plan) {
  const out = {};
  if (!plan || typeof plan !== 'object') return out;
  Object.keys(plan).forEach(function (cls) {
    if (!okCls(cls) || !plan[cls] || typeof plan[cls] !== 'object') return;
    const days = {};
    TT_DAYS.forEach(function (d) {
      const list = Array.isArray(plan[cls][d]) ? plan[cls][d] : [];
      const seen = [];
      list.forEach(function (x) { const v = clip(x, 40); if (v && seen.indexOf(v) === -1 && seen.length < 10) seen.push(v); });
      if (seen.length) days[d] = seen;
    });
    if (Object.keys(days).length) out[cls] = days;
  });
  // Oct 2026: fixed homework lines — { "Class 1": { "Hindi": { en, ta } } } — one standing line per class + subject
  // (e.g. "Homework given in Hindi Workbook." + its Tamil line), written once by the principal.
  const fx = plan._fixed, fixed = {};
  if (fx && typeof fx === 'object' && !Array.isArray(fx)) {
    Object.keys(fx).forEach(function (cls) {
      if (!okCls(cls) || !fx[cls] || typeof fx[cls] !== 'object') return;
      const subs = {};
      Object.keys(fx[cls]).slice(0, 20).forEach(function (sb) {
        const v = fx[cls][sb] || {}, en = clip(v.en, 300), ta = clip(v.ta, 300), k = clip(sb, 40);
        if (k && en) subs[k] = { en: en, ta: ta };
      });
      if (Object.keys(subs).length) fixed[cls] = subs;
    });
  }
  if (Object.keys(fixed).length) out._fixed = fixed;
  return out;
}
// the timetable without the fixed lines, and the fixed lines on their own
function splitFixed(plan) {
  const t = Object.assign({}, plan || {}), f = t._fixed || {}, sec = cleanSections(t._sections);
  delete t._fixed; delete t._sections;
  return { timetable: t, fixed: f, sections: sec };
}

// ── Supabase (TeachBot) ──
function req(host, key, method, path, body, minimal) {
  return new Promise(function (resolve) {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: host, path: path, method: method,
      headers: {
        'Content-Type': 'application/json',
        apikey: key, Authorization: 'Bearer ' + key,
        Prefer: minimal ? 'return=minimal' : 'return=representation'
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(opts, function (res) {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, data: d ? JSON.parse(d) : [] }); }
        catch (e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on('error', function (e) { resolve({ status: 0, data: { message: e.message } }); });
    if (data) r.write(data);
    r.end();
  });
}
const db = function (method, path, body) { return req(SB_HOST, process.env.SUPABASE_SECRET_KEY || '', method, path, body); };
const ok = function (r) { return r && r.status >= 200 && r.status < 300; };
const why = function (r) {
  if (!r) return 'no reply';
  const d = r.data;
  return 'status ' + r.status + ': ' + (typeof d === 'string' ? d : (d && (d.message || d.error)) || JSON.stringify(d));
};
const enc = encodeURIComponent;

// ── Signed login (same check as auth.js / class-quiz.js) ──
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

// The school row for a login. Logins carry the school code (e.g. ARK2024) or the
// school's id, so both are tried. Homework is always stored under schools.id —
// the same label the Student Diary (diary_students / diary_entries) uses.
async function findSchool(label) {
  const s = String(label || '').trim();
  if (!s) return null;
  const cols = 'id,name,school_code,has_erp,erp_school_id';
  let r = await db('GET', '/rest/v1/schools?school_code=eq.' + enc(s) + '&select=' + cols + '&limit=1');
  if ((!ok(r) || !r.data.length) && /^[0-9a-fA-F-]{36}$/.test(s)) {
    r = await db('GET', '/rest/v1/schools?id=eq.' + enc(s) + '&select=' + cols + '&limit=1');
  }
  return ok(r) && r.data.length ? r.data[0] : null;
}

// ── India dates ──
function istNow() { return new Date(Date.now() + 5.5 * 60 * 60 * 1000); }
function istToday() { return istNow().toISOString().slice(0, 10); }
// Homework for a day is "due" once that day's 4 PM has passed (or the day is over).
function dueUpTo() {
  const n = istNow();
  if (n.getUTCHours() >= SEND_HOUR_IST) return n.toISOString().slice(0, 10);
  const y = new Date(n.getTime() - 24 * 60 * 60 * 1000);
  return y.toISOString().slice(0, 10);
}
const isDate = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = function (d) { const p = d.split('-'); return p[2] + ' ' + MON[Number(p[1]) - 1]; };
const clip = function (s, n) { return String(s == null ? '' : s).trim().substring(0, n); };

// ── Sending: Student Diary + ERP Parent Portal ──
// Sends every 'added', not-yet-sent homework of one school dated on or before `upTo`.
// Each homework is marked sent only after its diary row is saved, so a failure
// is simply tried again at the next send. Returns { sent, errors:[...] }.
async function sendDue(school, upTo) {
  const out = { sent: 0, errors: [] };
  const r = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) +
    '&status=eq.added&sent_at=is.null&hw_date=lte.' + upTo + '&select=*&order=hw_date.asc,class_name.asc,created_at.asc');
  if (!ok(r)) { out.errors.push('Could not read homework: ' + why(r)); return out; }

  // group: date | class | type → subject → [items]
  const groups = {};
  (r.data || []).forEach(function (it) {
    const k = it.hw_date + '|' + it.class_name + '|' + entryType(it);
    const g = (groups[k] = groups[k] || {});
    (g[it.subject] = g[it.subject] || []).push(it);
  });

  const forErp = [];   // groups that reached the diary and now go to ERP
  const secRead = await readTimetable(school);
  const SECTIONS = secRead.sections || {};
  for (const key of Object.keys(groups)) {
    const [date, cls, type] = key.split('|');
    const field = type === 'classwork' ? 'class_notes' : type === 'bookback' ? 'book_back_answers' : 'homework';   // diary column
    const joiner = type === 'bookback' ? '\n\n' : '\n';
    const bySubject = groups[key];
    const sentIds = [], sentSubjects = {};

    for (const subject of Object.keys(bySubject)) {
      const items = bySubject[subject];
      const ours = items.map(function (i) { return i.homework; }).join(joiner);

      // One diary row per school + class + subject + day (same as save_diary_entry).
      // Anything a teacher already wrote there is kept; ours is added below it.
      const ex = await db('GET', '/rest/v1/diary_entries?school_id=eq.' + enc(school.id) +
        '&class_name=eq.' + enc(cls) + '&subject=eq.' + enc(subject) + '&lesson_date=eq.' + date + '&select=id,homework,class_notes,book_back_answers&limit=1');
      if (!ok(ex)) { out.errors.push(cls + ' ' + subject + ' ' + date + ': ' + why(ex)); continue; }
      let w;
      if (ex.data.length) {
        const old = String(ex.data[0][field] || '').trim();
        const merged = !old ? ours : (old.indexOf(ours) !== -1 ? old : old + joiner + ours);
        const patch = { updated_at: new Date().toISOString() };
        patch[field] = merged;
        w = await db('PATCH', '/rest/v1/diary_entries?id=eq.' + enc(ex.data[0].id), patch);
      } else {
        const row = {
          school_id: school.id, class_name: cls, subject: subject,
          lesson_title: subject + ' — ' + date, lesson_date: date,
          class_notes: '', homework: '', updated_at: new Date().toISOString()
        };
        row[field] = ours;
        w = await db('POST', '/rest/v1/diary_entries', row);
      }
      if (!ok(w)) { out.errors.push(cls + ' ' + subject + ' ' + date + ' diary: ' + why(w)); continue; }
      items.forEach(function (i) { sentIds.push(i.id); });
      sentSubjects[subject] = items;
    }

    if (!sentIds.length) continue;
    const m = await db('PATCH', '/rest/v1/homework_plan?id=in.(' + sentIds.map(enc).join(',') + ')',
      { sent_at: new Date().toISOString() });
    if (!ok(m)) { out.errors.push('Could not mark as sent: ' + why(m)); continue; }
    out.sent += sentIds.length;
    if (type !== 'bookback') forErp.push({ date: date, cls: cls, type: type, bySubject: sentSubjects });   // book back answers stay in the diary
  }

  // ERP Parent Portal — only for schools that own ERP.
  if (school.has_erp === true && school.erp_school_id) {
    // Earlier sends that ERP refused (last 7 days) are tried again, grouped the same way.
    const since = new Date(istNow().getTime() - 7 * 864e5).toISOString().slice(0, 10);
    const rr = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) +
      '&status=eq.added&sent_at=not.is.null&erp_error=not.is.null&hw_date=gte.' + since + '&select=*&order=created_at.asc');
    if (ok(rr)) {
      const again = {};
      (rr.data || []).forEach(function (it) {
        const k = it.hw_date + '|' + it.class_name + '|' + entryType(it);
        const g = (again[k] = again[k] || {});
        (g[it.subject] = g[it.subject] || []).push(it);
      });
      Object.keys(again).forEach(function (k) {
        const [date, cls, type] = k.split('|');
        const same = forErp.find(function (f) { return f.date === date && f.cls === cls && f.type === type; });
        if (same) Object.keys(again[k]).forEach(function (sub) { same.bySubject[sub] = (same.bySubject[sub] || []).concat(again[k][sub]); });
        else forErp.push({ date: date, cls: cls, type: type, bySubject: again[k] });
      });
    }

    for (const g of forErp) {
      const subjects = Object.keys(g.bySubject);
      const ids = [], lines = [];
      subjects.forEach(function (sub) {
        g.bySubject[sub].forEach(function (i) { ids.push(i.id); });
        lines.push(sub + ': ' + g.bySubject[sub].map(function (i) { return i.homework; }).join(' / ').replace(/\n/g, ' / '));
      });
      const cw = g.type === 'classwork';
      const e = await postErpHomework({
        school_id: school.erp_school_id,
        type: cw ? 'classwork' : 'homework',
        class_name: erpClassName(g.cls, SECTIONS),
        title: cw ? (erpClassName(g.cls, SECTIONS) + ' · In class today — ' + dayLabel(g.date)) : (erpClassName(g.cls, SECTIONS) + ' Homework — ' + dayLabel(g.date)),
        message: lines.join('\n'),
        subject: subjects.join(', '),
        due_date: g.date,
        sender_name: clip(school.name, 120) || 'School'   // parents see the school's name as the sender
      });
      const good = e.status === 200 && e.data && e.data.ok;
      const msg = good ? null : clip((e.data && e.data.error) || ('status ' + e.status), 300);
      await db('PATCH', '/rest/v1/homework_plan?id=in.(' + ids.map(enc).join(',') + ')', { erp_error: msg });
      if (!good) out.errors.push(g.cls + ' ' + g.date + ' ERP (' + (cw ? 'class work' : 'homework') + '): ' + msg + ' — will try again at the next send');
    }
  }
  return out;
}

// After the principal adds homework: if its day's 4 PM has already passed,
// send it now instead of waiting for tomorrow's timer.
async function sendIfLate(school) {
  try { return await sendDue(school, dueUpTo()); }
  catch (e) { return { sent: 0, errors: [e.message] }; }
}

async function getItem(id, school) {
  if (!id) return null;
  const r = await db('GET', '/rest/v1/homework_plan?id=eq.' + enc(id) + '&school_id=eq.' + enc(school.id) + '&select=*&limit=1');
  return ok(r) && r.data.length ? r.data[0] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = async function handler(req2, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dss-session');
  if (req2.method === 'OPTIONS') return res.status(200).end();
  if (!process.env.SUPABASE_SECRET_KEY) return res.status(500).json({ error: 'SUPABASE_SECRET_KEY is not set in Vercel.' });

  try {
    // ── Daily timer (Vercel cron) ──
    if (req2.method === 'GET') {
      const secret = process.env.CRON_SECRET || '';
      if (!secret || req2.headers.authorization !== 'Bearer ' + secret) {
        return res.status(401).json({ error: 'Not allowed. (CRON_SECRET missing or wrong.)' });
      }
      const upTo = dueUpTo();
      const p = await db('GET', '/rest/v1/homework_plan?status=eq.added&sent_at=is.null&hw_date=lte.' + upTo + '&select=school_id');
      if (!ok(p)) return res.status(500).json({ error: 'Could not read homework: ' + why(p) });
      // schools whose ERP copy failed earlier are visited too, so it is tried again
      const p2 = await db('GET', '/rest/v1/homework_plan?status=eq.added&sent_at=not.is.null&erp_error=not.is.null&select=school_id');
      const ids = Array.from(new Set(p.data.concat(ok(p2) ? p2.data : []).map(function (x) { return x.school_id; })));
      const report = [];
      for (const sid of ids) {
        const s = await findSchool(sid);
        if (!s) { report.push({ school: sid, error: 'school not found' }); continue; }
        const r = await sendDue(s, upTo);
        report.push({ school: s.name || sid, sent: r.sent, errors: r.errors });
        if (r.errors.length) console.error('homework send', s.name || sid, r.errors);
      }
      return res.json({ success: true, up_to: upTo, schools: report });
    }

    if (req2.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const who = readSession(req2.headers['x-dss-session']);
    if (!who || ['teacher', 'school_admin', 'super_admin'].indexOf(who.role) === -1) {
      return res.status(401).json({ error: 'Please log in again.' });
    }
    const body = req2.body || {};
    // The super admin has no school of their own, so they name one; everyone else gets their login's school.
    const school = await findSchool(who.role === 'super_admin' ? body.school_id : who.sid);
    if (!school) return res.status(403).json({ error: 'Your school was not found. Please log in again.' });
    const principal = who.role !== 'teacher';
    const action = String(body.action || '');

    // ── WORKBOOK PICKS (one saved plan per school) ──
    if (action === 'workbook_get' || action === 'workbook_save') {
      // who may change the picks: the principal, or a teacher whose tools include the Workbook Generator
      let canSave = principal;
      if (!canSave && who.tid) {
        const t = await db('GET', '/rest/v1/teachers?id=eq.' + enc(who.tid) + '&select=allowed_tools&limit=1');
        const tools = ok(t) && t.data.length ? t.data[0].allowed_tools : undefined;
        canSave = tools === null || (Array.isArray(tools) && tools.indexOf('workbook') !== -1);
      }
      if (action === 'workbook_get') {
        const r = await db('GET', '/rest/v1/workbook_plans?school_id=eq.' + enc(school.id) + '&select=plan,settings,updated_at,updated_by&limit=1');
        if (!ok(r)) return res.json({ error: 'Could not read the workbook picks: ' + why(r) });
        const row = r.data[0] || {};
        return res.json({ success: true, plan: row.plan || null, settings: row.settings || null,
          updated_at: row.updated_at || null, updated_by: row.updated_by || '', can_save: canSave,
          school_name: school.name || '' });
      }
      if (!canSave) return res.status(403).json({ error: who.tid || principal ? 'Only the principal, or a teacher with the Workbook Generator ticked, can change the workbook picks.' : 'Please log out and log in again.' });
      const plan = body.plan;
      if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return res.json({ error: 'Nothing to save.' });
      const size = JSON.stringify(plan).length;
      if (size > 800000) return res.json({ error: 'The workbook picks are too large to save (' + Math.round(size / 1000) + ' KB).' });
      const st = body.settings && typeof body.settings === 'object' ? body.settings : {};
      const settings = { school: clip(st.school, 80), term: clip(st.term, 10), year: clip(st.year, 20) };
      const row = { plan: plan, settings: settings, updated_at: new Date().toISOString(), updated_by: clip(body.by, 60) };
      let r = await db('PATCH', '/rest/v1/workbook_plans?school_id=eq.' + enc(school.id), row);
      if (!ok(r)) return res.json({ error: 'Could not save the workbook picks: ' + why(r) });
      if (!r.data.length) {
        r = await db('POST', '/rest/v1/workbook_plans', Object.assign({ school_id: String(school.id) }, row));
        if (!ok(r)) return res.json({ error: 'Could not save the workbook picks: ' + why(r) });
      }
      return res.json({ success: true, updated_at: row.updated_at });
    }

    // ── LIST one week (or any range up to 6 weeks) ──
    if (action === 'list') {
      const from = isDate(body.from) ? body.from : istToday();
      const to = isDate(body.to) ? body.to : from;
      if (new Date(to) - new Date(from) > 42 * 864e5) return res.json({ error: 'Choose at most 6 weeks at a time.' });
      const r = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) +
        '&hw_date=gte.' + from + '&hw_date=lte.' + to + '&select=*&order=hw_date.asc,created_at.asc');
      if (!ok(r)) return res.json({ error: 'Could not load homework: ' + why(r) });
      const tt = await readTimetable(school);
      return res.json({ success: true, items: r.data, today: istToday(), send_hour: SEND_HOUR_IST,
                        timetable: tt.plan || {}, fixed: tt.fixed || {}, sections: tt.sections || {}, timetable_error: tt.error || '',
                        school: { name: school.name, code: school.school_code, has_erp: school.has_erp === true } });
    }

    // ── PAST homework of one class (last 365 days, not sent-back) — for the repeat check ──
    if (action === 'past') {
      const cls = clip(body.class_name, 20);
      if (!okCls(cls)) return res.json({ error: 'Choose a class.' });
      const since = new Date(istNow().getTime() - 365 * 864e5).toISOString().slice(0, 10);
      const r = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) + '&class_name=eq.' + enc(cls) +
        '&status=neq.returned&entry_type=eq.homework&hw_date=gte.' + since + '&select=id,subject,homework,hw_date&order=hw_date.desc&limit=1500');
      if (!ok(r)) return res.json({ error: 'Could not read past homework: ' + why(r) });
      return res.json({ success: true, items: r.data });
    }

    // ── SAVE the fixed homework timetable (principal only) ──
    if (action === 'save_timetable') {
      if (!principal) return res.status(403).json({ error: 'Only the principal can change the homework timetable.' });
      const plan = cleanTimetable(body.plan);
      const now = new Date().toISOString();
      const keepSec = await readTimetable(school);   // the Sections setting is kept as it is
      if (keepSec.sections && Object.keys(keepSec.sections).length) plan._sections = keepSec.sections;
      let r = await db('PATCH', '/rest/v1/homework_timetable?school_id=eq.' + enc(school.id), { plan: plan, updated_at: now });
      if (!ok(r)) return res.json({ error: 'Could not save the timetable: ' + why(r) });
      if (!r.data.length) {
        r = await db('POST', '/rest/v1/homework_timetable', { school_id: String(school.id), plan: plan, updated_at: now });
        if (!ok(r)) return res.json({ error: 'Could not save the timetable: ' + why(r) });
      }
      const sp = splitFixed(plan);
      return res.json({ success: true, timetable: sp.timetable, fixed: sp.fixed, sections: sp.sections });
    }

    // ── SECTIONS (Oct 2026): read for any login; save for the principal only ──
    if (action === 'sections') {
      const tt = await readTimetable(school);
      return res.json({ success: true, sections: tt.sections || {} });
    }
    if (action === 'save_sections') {
      if (!principal) return res.status(403).json({ error: 'Only the principal can change sections.' });
      const sec = cleanSections(body.sections);
      const r0 = await db('GET', '/rest/v1/homework_timetable?school_id=eq.' + enc(school.id) + '&select=plan&limit=1');
      if (!ok(r0)) return res.json({ error: 'Could not read the settings: ' + why(r0) });
      const plan = Object.assign({}, (r0.data.length && r0.data[0].plan) || {});
      if (Object.keys(sec).length) plan._sections = sec; else delete plan._sections;
      const now = new Date().toISOString();
      let r = await db('PATCH', '/rest/v1/homework_timetable?school_id=eq.' + enc(school.id), { plan: plan, updated_at: now });
      if (!ok(r)) return res.json({ error: 'Could not save sections: ' + why(r) });
      if (!r.data.length) {
        r = await db('POST', '/rest/v1/homework_timetable', { school_id: String(school.id), plan: plan, updated_at: now });
        if (!ok(r)) return res.json({ error: 'Could not save sections: ' + why(r) });
      }
      return res.json({ success: true, sections: sec });
    }

    // ── SAVE (new or changed) ──
    if (action === 'save') {
      const cls = clip(body.class_name, 20), subject = clip(body.subject, 40), text = clip(body.homework, textLimit(body));
      if (!okCls(cls)) return res.json({ error: 'Choose a class.' });
      if (!subject) return res.json({ error: 'Choose a subject.' });
      if (!text) return res.json({ error: 'Type the homework.' });
      if (!isDate(body.hw_date)) return res.json({ error: 'Choose a day.' });
      const fields = {
        class_name: cls, subject: subject, kind: clip(body.kind, 30) || 'Written', homework: text,
        hw_date: body.hw_date, updated_at: new Date().toISOString()
      };

      if (body.id) {
        const it = await getItem(body.id, school);
        if (!it) return res.json({ error: 'This homework was not found. It may have been removed.' });
        if (it.sent_at) return res.json({ error: 'This homework has already gone to the diary, so it cannot be changed.' });
        if (!principal && it.status === 'added') return res.json({ error: 'The principal has already added this to the week. Ask the principal to change it.' });
        if (!principal) { fields.status = 'waiting'; fields.return_note = ''; }   // a fixed homework goes back to the principal
        const r = await db('PATCH', '/rest/v1/homework_plan?id=eq.' + enc(it.id) + '&school_id=eq.' + enc(school.id), fields);
        if (!ok(r)) return res.json({ error: 'Could not save: ' + why(r) });
        const sent = principal && it.status === 'added' ? await sendIfLate(school) : null;
        return res.json({ success: true, item: r.data[0], sent: sent });
      }

      fields.school_id = school.id;
      fields.entry_type = entryType(body);
      fields.status = principal ? 'added' : 'waiting';
      fields.made_by = principal ? 'principal' : (MADE_BY.indexOf(body.made_by) !== -1 ? body.made_by : 'teacher');
      fields.teacher_name = clip(body.teacher_name, 60);
      const r = await db('POST', '/rest/v1/homework_plan', fields);
      if (!ok(r)) return res.json({ error: 'Could not save: ' + why(r) });
      const sent = principal ? await sendIfLate(school) : null;
      return res.json({ success: true, item: r.data[0], sent: sent });
    }

    // ── SAVE MANY (AI week plan) ──
    if (action === 'save_many') {
      const list = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
      if (!list.length) return res.json({ error: 'Nothing to save.' });
      const rows = [];
      for (const x of list) {
        const cls = clip(x.class_name, 20), subject = clip(x.subject, 40), text = clip(x.homework, textLimit(x));
        if (!okCls(cls) || !subject || !text || !isDate(x.hw_date)) {
          return res.json({ error: 'One homework is missing its class, subject, day or text.' });
        }
        rows.push({
          school_id: school.id, class_name: cls, subject: subject, kind: clip(x.kind, 30) || 'Written',
          entry_type: entryType(x),
          homework: text, hw_date: x.hw_date,
          status: principal ? 'added' : 'waiting',
          made_by: principal ? 'principal' : (MADE_BY.indexOf(x.made_by) !== -1 ? x.made_by : 'ai-week'),
          teacher_name: clip(body.teacher_name, 60)
        });
      }
      const r = await db('POST', '/rest/v1/homework_plan', rows);
      if (!ok(r)) return res.json({ error: 'Could not save: ' + why(r) });
      const sent = principal ? await sendIfLate(school) : null;
      return res.json({ success: true, items: r.data, sent: sent });
    }

    // ── PRINCIPAL ONLY below, except remove ──
    if (action === 'add' || action === 'take_out' || action === 'send_back') {
      if (!principal) return res.status(403).json({ error: 'Only the principal can do this.' });
    }

    if (action === 'add') {
      const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).filter(Boolean).slice(0, 200).map(String);
      if (!ids.length) return res.json({ error: 'Nothing chosen.' });
      const r = await db('PATCH', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) +
        '&status=eq.waiting&id=in.(' + ids.map(enc).join(',') + ')',
        { status: 'added', return_note: '', updated_at: new Date().toISOString() });
      if (!ok(r)) return res.json({ error: 'Could not add: ' + why(r) });
      const sent = await sendIfLate(school);
      return res.json({ success: true, added: r.data.length, items: r.data, sent: sent });
    }

    if (action === 'take_out') {
      const it = await getItem(body.id, school);
      if (!it) return res.json({ error: 'This homework was not found.' });
      if (it.sent_at) return res.json({ error: 'This homework has already gone to the diary, so it cannot be taken out.' });
      const r = await db('PATCH', '/rest/v1/homework_plan?id=eq.' + enc(it.id) + '&school_id=eq.' + enc(school.id),
        { status: 'waiting', updated_at: new Date().toISOString() });
      if (!ok(r)) return res.json({ error: 'Could not change: ' + why(r) });
      return res.json({ success: true, item: r.data[0] });
    }

    if (action === 'send_back') {
      const it = await getItem(body.id, school);
      if (!it) return res.json({ error: 'This homework was not found.' });
      if (it.sent_at) return res.json({ error: 'This homework has already gone to the diary.' });
      const r = await db('PATCH', '/rest/v1/homework_plan?id=eq.' + enc(it.id) + '&school_id=eq.' + enc(school.id),
        { status: 'returned', return_note: clip(body.note, 300), updated_at: new Date().toISOString() });
      if (!ok(r)) return res.json({ error: 'Could not send back: ' + why(r) });
      return res.json({ success: true, item: r.data[0] });
    }

    if (action === 'remove') {
      const it = await getItem(body.id, school);
      if (!it) return res.json({ success: true });           // already gone
      if (it.sent_at) return res.json({ error: 'This homework has already gone to the diary, so it cannot be removed here.' });
      if (!principal && it.status === 'added') return res.json({ error: 'The principal has already added this to the week. Ask the principal to remove it.' });
      const r = await db('DELETE', '/rest/v1/homework_plan?id=eq.' + enc(it.id) + '&school_id=eq.' + enc(school.id));
      if (!ok(r)) return res.json({ error: 'Could not remove: ' + why(r) });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    console.error('homework.js', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
