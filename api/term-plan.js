// /api/term-plan.js — Term Planner (Oct 2026)
//
// One plan per school + class + subject + term: the chapters picked from the school's
// uploaded books, spread over the term's lesson periods, each row with what to teach and
// a class, home and ground activity. A teacher makes and edits it and sends it to the
// principal; the principal approves it (then it is locked for teachers), sends it back
// with a note, or opens it again.
//
// The school ALWAYS comes from the signed login (x-dss-session), never from the page.
//
// POST { action, ... }  (teacher or principal login)
//   list      { term? }                         → { plans:[ {id,class_name,subject,term,status,teacher_name,updated_at,rows_count,done_count} ] }
//   get       { class_name, subject, term }     → { plan | null }
//   save      { class_name, subject, term, settings, rows }   draft (teacher) — not when approved, unless principal
//   submit    { id }                            teacher: → waiting
//   approve   { id }                            principal: → approved
//   send_back { id, note }                      principal: → returned
//   reopen    { id }                            principal: approved → draft
//   mark_done { id, index, done }               anyone of the school: tick a row as taught (even when approved)
//   for_day   { class_name, date }              the term-plan rows of one class on one day, all subjects
//                                               (the Homework Planner fills class work and homework ideas from them)
//   done_day  { class_name, date, subjects:[] } tick that day's rows of these subjects as taught
//                                               (the Homework Planner calls it when class work is sent)
//   list also gives behind_count: lessons dated before today (India time) not yet ticked done.
//
// SCHOOL HOLIDAY CALENDAR (Oct 2026) — one calendar per school, shared by every term plan.
//   holidays        { from?, to? }                 anyone of the school → { holidays:[{id,date,name,kind}] }
//   holiday_save    { date, name, kind }          principal: add or change one day
//                                                 kind 'holiday' (closed) | 'no_teaching' (exams, events)
//   holiday_save_many { list:[{date,name,kind}] } principal: add several (the government list)
//   holiday_remove  { id }                        principal
//   declare_holiday { date, name, kind? }         principal, for a SUDDEN holiday (rain, Collector's order):
//                                                 saves the day, then in EVERY term plan of the school the
//                                                 lessons of that day and all later ones move forward by one
//                                                 lesson slot (new slots are added after the plan's last day,
//                                                 on its school days, skipping holidays). Lessons already
//                                                 ticked done stay. Homework / class work of that day not yet
//                                                 sent moves to the next school day.
//                                                 → { moved_plans, over_term:[{class_name,subject,over}] }
// Table: school_holidays (step5-holidays.sql). RLS on, no policies.
//
// Table: term_plans (made in Supabase, Step 1). RLS on, no policies — only this file uses it.

const https = require('https');
const crypto = require('crypto');

module.exports.config = { api: { bodyParser: { sizeLimit: '2mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const CLASSES = ['Pre KG', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
                 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
const TERMS = ['I', 'II', 'III'];
const ROW_FIELDS = ['date', 'chapter', 'pages', 'teach', 'class_act', 'home_act', 'ground_act', 'homework', 'type', 'workbook', 'period', 'room'];
// period = the timetable period (e.g. "P3"); room = 'ai' when the class is in the AI class room (Oct 2026)
// homework = AI's suggestion; type = kind of period (teachbot, teach, read, practice, classwork, catchup, revision, test);
// workbook = the school's workbook pages placed on this period (Oct 2026). class_act now holds the one Activity.
const ROW_TYPES = ['teachbot', 'teach', 'read', 'practice', 'classwork', 'catchup', 'revision', 'test'];

function db(method, path, body) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY || '';
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: SB_HOST, path: path, method: method,
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=representation' }
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
const ok = function (r) { return r && r.status >= 200 && r.status < 300; };
const why = function (r) {
  if (!r) return 'no reply';
  const d = r.data;
  return 'status ' + r.status + ': ' + (typeof d === 'string' ? d : (d && (d.message || d.error)) || JSON.stringify(d));
};
const enc = encodeURIComponent;
const clip = function (s, n) { return String(s == null ? '' : s).trim().substring(0, n); };
const isDate = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); };
const istToday = function () { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); };

// ── Signed login (same check as auth.js / homework.js) ──
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
  let r = await db('GET', '/rest/v1/schools?school_code=eq.' + enc(s) + '&select=id,name,school_code&limit=1');
  if ((!ok(r) || !r.data.length) && /^[0-9a-fA-F-]{36}$/.test(s)) {
    r = await db('GET', '/rest/v1/schools?id=eq.' + enc(s) + '&select=id,name,school_code&limit=1');
  }
  return ok(r) && r.data.length ? r.data[0] : null;
}

function cleanMap(m) {   // chapter key → workbook chapter number (index), for the optional workbook
  const out = {};
  if (m && typeof m === 'object' && !Array.isArray(m)) Object.keys(m).slice(0, 40).forEach(function (k) {
    const v = parseInt(m[k], 10); if (!isNaN(v) && v >= -1 && v < 200) out[clip(k, 120)] = v;
  });
  return out;
}
function cleanSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  const days = Array.isArray(s.days) ? s.days.filter(function (d) { return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(d) !== -1; }) : [];
  const chapters = Array.isArray(s.chapters) ? s.chapters.slice(0, 40).map(function (c) {
    return { key: clip(c && c.key, 120), title: clip(c && c.title, 160), book: clip(c && c.book, 160),
             from: parseInt(c && c.from, 10) || null, to: parseInt(c && c.to, 10) || null };
  }) : [];
  return { start: isDate(s.start) ? s.start : '', end: isDate(s.end) ? s.end : '', days: days,
           ppw: Math.max(1, Math.min(14, parseInt(s.ppw, 10) || 5)), chapters: chapters, note: clip(s.note, 500),
           tb: ['auto', '0', '1', '2', '3'].indexOf(String(s.tb)) !== -1 ? String(s.tb) : 'auto',
           use_wb: !!s.use_wb, wb_map: cleanMap(s.wb_map) };
}
function cleanRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 400).map(function (r) {
    const o = {};
    ROW_FIELDS.forEach(function (f) { o[f] = clip(r && r[f], f === 'date' ? 10 : 1200); });
    if (!isDate(o.date)) o.date = '';
    if (ROW_TYPES.indexOf(o.type) === -1) o.type = '';
    if (o.room !== 'ai') o.room = '';
    o.done = !!(r && r.done);
    return o;
  });
}
async function getPlan(id, school) {
  if (!id) return null;
  const r = await db('GET', '/rest/v1/term_plans?id=eq.' + enc(id) + '&school_id=eq.' + enc(school.id) + '&select=*&limit=1');
  return ok(r) && r.data.length ? r.data[0] : null;
}
async function setStatus(p, school, fields) {
  fields.updated_at = new Date().toISOString();
  const r = await db('PATCH', '/rest/v1/term_plans?id=eq.' + enc(p.id) + '&school_id=eq.' + enc(school.id), fields);
  return ok(r) ? { success: true, plan: r.data[0] } : { error: 'Could not save: ' + why(r) };
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

    if (action === 'list') {
      let q = '/rest/v1/term_plans?school_id=eq.' + enc(school.id) + '&select=id,class_name,subject,term,status,teacher_name,updated_at,rows&order=updated_at.desc';
      if (TERMS.indexOf(body.term) !== -1) q += '&term=eq.' + enc(body.term);
      const r = await db('GET', q);
      if (!ok(r)) return res.json({ error: 'Could not load plans: ' + why(r) });
      const today = istToday();
      return res.json({ success: true, plans: r.data.map(function (p) {
        const rows = Array.isArray(p.rows) ? p.rows : [];
        return { id: p.id, class_name: p.class_name, subject: p.subject, term: p.term, status: p.status,
                 teacher_name: p.teacher_name, updated_at: p.updated_at, rows_count: rows.length,
                 done_count: rows.filter(function (x) { return x && x.done; }).length,
                 behind_count: rows.filter(function (x) { return x && !x.done && x.date && x.date < today; }).length };
      }) });
    }

    // ── one class, one day, every subject (for the Homework Planner) ──
    if (action === 'for_day' || action === 'done_day') {
      const cls = clip(body.class_name, 20), date = String(body.date || '');
      if (CLASSES.indexOf(cls) === -1 || !isDate(date)) return res.json({ error: 'Class and date needed.' });
      const r = await db('GET', '/rest/v1/term_plans?school_id=eq.' + enc(school.id) + '&class_name=eq.' + enc(cls) +
        '&status=neq.returned&select=id,subject,term,status,rows&order=updated_at.desc');
      if (!ok(r)) return res.json({ error: 'Could not read term plans: ' + why(r) });
      if (action === 'for_day') {
        const out = [];
        r.data.forEach(function (p) {
          (Array.isArray(p.rows) ? p.rows : []).forEach(function (row, i) {
            if (row && row.date === date) out.push({ plan_id: p.id, subject: p.subject, term: p.term, status: p.status, index: i,
              chapter: row.chapter || '', pages: row.pages || '', teach: row.teach || '', class_act: row.class_act || '',
              home_act: row.home_act || '', ground_act: row.ground_act || '', homework: row.homework || '', type: row.type || '', workbook: row.workbook || '', period: row.period || '', room: row.room || '', done: !!row.done });
          });
        });
        return res.json({ success: true, rows: out });
      }
      const subjects = Array.isArray(body.subjects) ? body.subjects.map(function (x) { return clip(x, 40); }) : [];
      let marked = 0;
      for (const p of r.data) {
        if (subjects.indexOf(p.subject) === -1) continue;
        const rows = Array.isArray(p.rows) ? p.rows : [];
        let changed = false;
        rows.forEach(function (row) { if (row && row.date === date && !row.done) { row.done = true; changed = true; marked++; } });
        if (changed) {
          const w = await db('PATCH', '/rest/v1/term_plans?id=eq.' + enc(p.id) + '&school_id=eq.' + enc(school.id), { rows: rows, updated_at: new Date().toISOString() });
          if (!ok(w)) return res.json({ error: 'Could not tick the term plan: ' + why(w) });
        }
      }
      return res.json({ success: true, marked: marked });
    }

    // ── SCHOOL HOLIDAY CALENDAR ──
    if (action === 'holidays') {
      let q = '/rest/v1/school_holidays?school_id=eq.' + enc(school.id) + '&select=id,date,name,kind&order=date.asc';
      if (isDate(body.from)) q += '&date=gte.' + body.from;
      if (isDate(body.to)) q += '&date=lte.' + body.to;
      const r = await db('GET', q);
      if (!ok(r)) return res.json({ error: 'Could not load holidays: ' + why(r) + (r.status === 404 ? ' (Has step5-holidays.sql been run in Supabase?)' : '') });
      return res.json({ success: true, holidays: r.data, principal: principal });
    }
    if (['holiday_save', 'holiday_save_many', 'holiday_remove', 'declare_holiday'].indexOf(action) !== -1 && !principal) {
      return res.status(403).json({ error: 'Only the principal can change the school calendar.' });
    }
    const cleanHol = function (x) {
      const date = String((x && x.date) || ''), name = clip(x && x.name, 80);
      if (!isDate(date)) return { error: 'Choose a date.' };
      if (!name) return { error: 'Type a name for ' + date + '.' };
      return { school_id: school.id, date: date, name: name, kind: (x && x.kind) === 'no_teaching' ? 'no_teaching' : 'holiday' };
    };
    const upsertHol = function (rows) {
      return db('POST', '/rest/v1/school_holidays?on_conflict=school_id,date', rows);
    };
    if (action === 'holiday_save' || action === 'holiday_save_many') {
      const list = action === 'holiday_save' ? [body] : (Array.isArray(body.list) ? body.list.slice(0, 120) : []);
      if (!list.length) return res.json({ error: 'Nothing to save.' });
      const rows = [];
      for (const x of list) { const c = cleanHol(x); if (c.error) return res.json({ error: c.error }); rows.push(c); }
      // replace any existing row for the same dates (so a name or kind can be changed)
      const dr = await db('DELETE', '/rest/v1/school_holidays?school_id=eq.' + enc(school.id) + '&date=in.(' + rows.map(function (r) { return r.date; }).join(',') + ')');
      if (!ok(dr)) return res.json({ error: 'Could not save: ' + why(dr) + (dr.status === 404 ? ' (Has step5-holidays.sql been run in Supabase?)' : '') });
      const r = await upsertHol(rows);
      if (!ok(r)) return res.json({ error: 'Could not save: ' + why(r) });
      return res.json({ success: true, saved: r.data.length });
    }
    if (action === 'holiday_remove') {
      if (!body.id) return res.json({ error: 'Nothing chosen.' });
      const r = await db('DELETE', '/rest/v1/school_holidays?id=eq.' + enc(body.id) + '&school_id=eq.' + enc(school.id));
      if (!ok(r)) return res.json({ error: 'Could not remove: ' + why(r) });
      return res.json({ success: true });
    }
    if (action === 'declare_holiday') {
      const c = cleanHol(body);
      if (c.error) return res.json({ error: c.error });
      const D = c.date;
      await db('DELETE', '/rest/v1/school_holidays?school_id=eq.' + enc(school.id) + '&date=eq.' + D);
      const hs = await upsertHol([c]);
      if (!ok(hs)) return res.json({ error: 'Could not save the holiday: ' + why(hs) + (hs.status === 404 ? ' (Has step5-holidays.sql been run in Supabase?)' : '') });
      const hr = await db('GET', '/rest/v1/school_holidays?school_id=eq.' + enc(school.id) + '&date=gte.' + D + '&select=date');
      const off = {};
      (ok(hr) ? hr.data : []).forEach(function (h) { off[h.date] = 1; });
      const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const nextDay = function (d, days) {
        const x = new Date(d + 'T00:00:00Z');
        for (let i = 0; i < 60; i++) {
          x.setUTCDate(x.getUTCDate() + 1);
          const iso = x.toISOString().slice(0, 10);
          if (days.indexOf(WD[x.getUTCDay()]) !== -1 && !off[iso]) return iso;
        }
        return '';
      };
      const pr = await db('GET', '/rest/v1/term_plans?school_id=eq.' + enc(school.id) + '&status=neq.returned&select=id,class_name,subject,settings,rows');
      if (!ok(pr)) return res.json({ error: 'Holiday saved, but the term plans could not be read: ' + why(pr) });
      let moved = 0; const over = [];
      for (const p of pr.data) {
        const rows = Array.isArray(p.rows) ? p.rows : [];
        // lessons of that day (not yet taught) and every later lesson, in order
        const idx = [];
        rows.forEach(function (r, i) { if (r && r.date && (r.date > D || (r.date === D && !r.done))) idx.push(i); });
        if (!rows.some(function (r) { return r && r.date === D && !r.done; })) continue;
        idx.sort(function (a, b) { return rows[a].date < rows[b].date ? -1 : rows[a].date > rows[b].date ? 1 : a - b; });
        // the free slots: every later slot date, then new days after the last one
        const slots = idx.map(function (i) { return rows[i].date; }).filter(function (d) { return d > D; });
        const days = (p.settings && Array.isArray(p.settings.days) && p.settings.days.length) ? p.settings.days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        let last = slots.length ? slots[slots.length - 1] : D;
        while (slots.length < idx.length) { const n = nextDay(last, days); if (!n) break; slots.push(n); last = n; }
        idx.forEach(function (ri, k) { if (slots[k]) rows[ri].date = slots[k]; });
        const end = p.settings && isDate(p.settings.end) ? p.settings.end : '';
        if (end) { const n = rows.filter(function (r) { return r && r.date > end; }).length; if (n) over.push({ class_name: p.class_name, subject: p.subject, over: n }); }
        const w = await db('PATCH', '/rest/v1/term_plans?id=eq.' + enc(p.id) + '&school_id=eq.' + enc(school.id), { rows: rows, updated_at: new Date().toISOString() });
        if (!ok(w)) return res.json({ error: 'Holiday saved, but ' + p.class_name + ' ' + p.subject + ' could not be moved: ' + why(w) });
        moved++;
      }
      // homework / class work planned for that day and not yet sent → next school day (Mon–Sat)
      const nd = nextDay(D, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
      let hwMoved = 0;
      if (nd) {
        const hw = await db('PATCH', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) + '&hw_date=eq.' + D + '&sent_at=is.null',
                            { hw_date: nd, updated_at: new Date().toISOString() });
        if (ok(hw)) hwMoved = hw.data.length;
      }
      return res.json({ success: true, moved_plans: moved, over_term: over, homework_moved: hwMoved, homework_to: nd });
    }

    if (action === 'get') {
      const cls = clip(body.class_name, 20), subject = clip(body.subject, 40), term = clip(body.term, 4);
      const r = await db('GET', '/rest/v1/term_plans?school_id=eq.' + enc(school.id) + '&class_name=eq.' + enc(cls) +
        '&subject=eq.' + enc(subject) + '&term=eq.' + enc(term) + '&select=*&limit=1');
      if (!ok(r)) return res.json({ error: 'Could not load the plan: ' + why(r) });
      return res.json({ success: true, plan: r.data[0] || null, principal: principal });
    }

    if (action === 'save') {
      const cls = clip(body.class_name, 20), subject = clip(body.subject, 40), term = clip(body.term, 4);
      if (CLASSES.indexOf(cls) === -1) return res.json({ error: 'Choose a class.' });
      if (!subject) return res.json({ error: 'Choose a subject.' });
      if (TERMS.indexOf(term) === -1) return res.json({ error: 'Choose a term.' });
      const fields = { settings: cleanSettings(body.settings), rows: cleanRows(body.rows), updated_at: new Date().toISOString() };
      const ex = await db('GET', '/rest/v1/term_plans?school_id=eq.' + enc(school.id) + '&class_name=eq.' + enc(cls) +
        '&subject=eq.' + enc(subject) + '&term=eq.' + enc(term) + '&select=id,status&limit=1');
      if (!ok(ex)) return res.json({ error: 'Could not save: ' + why(ex) });
      if (ex.data.length) {
        const p = ex.data[0];
        if (!principal && p.status === 'approved') return res.json({ error: 'The principal has approved this plan, so it is locked. Ask the principal to open it again.' });
        if (!principal && p.status === 'waiting') fields.status = 'draft';     // changed after sending → send again
        if (!principal) fields.teacher_name = clip(body.teacher_name, 60);
        const r = await db('PATCH', '/rest/v1/term_plans?id=eq.' + enc(p.id), fields);
        if (!ok(r)) return res.json({ error: 'Could not save: ' + why(r) });
        return res.json({ success: true, plan: r.data[0] });
      }
      Object.assign(fields, { school_id: String(school.id), class_name: cls, subject: subject, term: term,
                              status: principal ? 'approved' : 'draft', teacher_name: clip(body.teacher_name, 60) });
      const r = await db('POST', '/rest/v1/term_plans', fields);
      if (!ok(r)) return res.json({ error: 'Could not save: ' + why(r) });
      return res.json({ success: true, plan: r.data[0] });
    }

    const p = await getPlan(body.id, school);
    if (!p) return res.json({ error: 'This plan was not found.' });

    if (action === 'mark_done') {
      const rows = Array.isArray(p.rows) ? p.rows : [];
      const i = parseInt(body.index, 10);
      if (!(i >= 0 && i < rows.length)) return res.json({ error: 'Row not found.' });
      rows[i].done = !!body.done;
      return res.json(await setStatus(p, school, { rows: rows }));
    }
    if (action === 'submit') {
      if (p.status === 'approved') return res.json({ error: 'Already approved.' });
      if (!Array.isArray(p.rows) || !p.rows.length) return res.json({ error: 'Make the plan first.' });
      return res.json(await setStatus(p, school, { status: 'waiting', return_note: '' }));
    }
    if (['approve', 'send_back', 'reopen'].indexOf(action) !== -1 && !principal) return res.status(403).json({ error: 'Only the principal can do this.' });
    if (action === 'approve') return res.json(await setStatus(p, school, { status: 'approved', return_note: '', approved_at: new Date().toISOString() }));
    if (action === 'send_back') return res.json(await setStatus(p, school, { status: 'returned', return_note: clip(body.note, 300) }));
    if (action === 'reopen') return res.json(await setStatus(p, school, { status: 'draft' }));

    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    console.error('term-plan.js', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
