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
// GET  (Vercel's daily timer, needs CRON_SECRET)    sends everything due today, all schools

const https = require('https');
const crypto = require('crypto');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
// ERP's Parent Portal — same address and public key index.html already uses for homework.
const ERP_HOST = 'nkfxrbumhjztmdyepygt.supabase.co';
const ERP_KEY = process.env.ERP_PUBLIC_KEY || 'sb_publishable_7RgXFcDeOipMGoFuPI7XBQ_r_aJpZdL';

const SEND_HOUR_IST = 16;          // 4 PM India time — the daily timer runs then
const CLASSES = ['Pre KG', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
                 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
const MADE_BY = ['teacher', 'ai', 'ai-week', 'principal'];

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
  if (!r.data.length) return out;

  // group: date → class → subject → [items]
  const groups = {};
  r.data.forEach(function (it) {
    const g = (groups[it.hw_date + '|' + it.class_name] = groups[it.hw_date + '|' + it.class_name] || {});
    (g[it.subject] = g[it.subject] || []).push(it);
  });

  for (const key of Object.keys(groups)) {
    const [date, cls] = key.split('|');
    const bySubject = groups[key];
    const sentIds = [], erpLines = [];

    for (const subject of Object.keys(bySubject)) {
      const items = bySubject[subject];
      const ours = items.map(function (i) { return i.homework; }).join('\n');

      // One diary row per school + class + subject + day (same as save_diary_entry).
      // If a teacher already wrote homework there, ours is added below it, never over it.
      const ex = await db('GET', '/rest/v1/diary_entries?school_id=eq.' + enc(school.id) +
        '&class_name=eq.' + enc(cls) + '&subject=eq.' + enc(subject) + '&lesson_date=eq.' + date + '&select=id,homework&limit=1');
      if (!ok(ex)) { out.errors.push(cls + ' ' + subject + ' ' + date + ': ' + why(ex)); continue; }
      let w;
      if (ex.data.length) {
        const old = String(ex.data[0].homework || '').trim();
        const merged = !old ? ours : (old.indexOf(ours) !== -1 ? old : old + '\n' + ours);
        w = await db('PATCH', '/rest/v1/diary_entries?id=eq.' + enc(ex.data[0].id),
          { homework: merged, updated_at: new Date().toISOString() });
      } else {
        w = await db('POST', '/rest/v1/diary_entries', {
          school_id: school.id, class_name: cls, subject: subject,
          lesson_title: subject + ' — ' + date, lesson_date: date,
          class_notes: '', homework: ours, updated_at: new Date().toISOString()
        });
      }
      if (!ok(w)) { out.errors.push(cls + ' ' + subject + ' ' + date + ' diary: ' + why(w)); continue; }
      items.forEach(function (i) { sentIds.push(i.id); });
      erpLines.push(subject + ': ' + ours.replace(/\n/g, ' / '));
    }

    if (!sentIds.length) continue;
    const m = await db('PATCH', '/rest/v1/homework_plan?id=in.(' + sentIds.map(enc).join(',') + ')',
      { sent_at: new Date().toISOString() });
    if (!ok(m)) { out.errors.push('Could not mark as sent: ' + why(m)); continue; }
    out.sent += sentIds.length;

    // ERP Parent Portal — only for schools that own ERP. A failure here does not
    // undo the diary; it is reported so it can be seen in the Vercel log.
    if (school.has_erp === true && school.erp_school_id) {
      const e = await req(ERP_HOST, ERP_KEY, 'POST', '/rest/v1/communications', [{
        school_id: school.erp_school_id,
        type: 'homework',
        title: cls + ' Homework — ' + dayLabel(date),
        message: erpLines.join('\n'),
        subject: Object.keys(bySubject).join(', '),
        target_class: cls,
        target_section: null,
        due_date: date,
        priority: 'normal',
        sender_name: 'Teacher',
        created_at: new Date().toISOString()
      }], true);   // like the browser insert: don't ask for the row back (ERP lets the public key add, not read)
      if (!ok(e)) out.errors.push(cls + ' ' + date + ' ERP: ' + why(e));
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
      const ids = Array.from(new Set(p.data.map(function (x) { return x.school_id; })));
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

    // ── LIST one week (or any range up to 6 weeks) ──
    if (action === 'list') {
      const from = isDate(body.from) ? body.from : istToday();
      const to = isDate(body.to) ? body.to : from;
      if (new Date(to) - new Date(from) > 42 * 864e5) return res.json({ error: 'Choose at most 6 weeks at a time.' });
      const r = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) +
        '&hw_date=gte.' + from + '&hw_date=lte.' + to + '&select=*&order=hw_date.asc,created_at.asc');
      if (!ok(r)) return res.json({ error: 'Could not load homework: ' + why(r) });
      return res.json({ success: true, items: r.data, today: istToday(), send_hour: SEND_HOUR_IST,
                        school: { name: school.name, code: school.school_code, has_erp: school.has_erp === true } });
    }

    // ── SAVE (new or changed) ──
    if (action === 'save') {
      const cls = clip(body.class_name, 20), subject = clip(body.subject, 40), text = clip(body.homework, 1000);
      if (CLASSES.indexOf(cls) === -1) return res.json({ error: 'Choose a class.' });
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
      const list = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
      if (!list.length) return res.json({ error: 'Nothing to save.' });
      const rows = [];
      for (const x of list) {
        const cls = clip(x.class_name, 20), subject = clip(x.subject, 40), text = clip(x.homework, 1000);
        if (CLASSES.indexOf(cls) === -1 || !subject || !text || !isDate(x.hw_date)) {
          return res.json({ error: 'One homework is missing its class, subject, day or text.' });
        }
        rows.push({
          school_id: school.id, class_name: cls, subject: subject, kind: clip(x.kind, 30) || 'Written',
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
