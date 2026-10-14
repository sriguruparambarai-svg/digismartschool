// /api/teacher-app.js — Teacher Communication App (Oct 2026)
//
// Teachers do NOT get the school's TeachBot login (schools keep that private).
// Instead the principal gives each teacher a personal link + a 4-digit PIN.
// The link opens only the teacher's own day (today's plan, homework check,
// submit my day) — never books, lessons or any other TeachBot screen.
//
// The teacher's login made here is signed with its OWN key (different from the
// school/teacher login), so no other TeachBot server file will accept it.
//
// POST { action, ... }
//
// Principal (School Admin login, x-dss-session):
//   list                                       → { teachers:[ {id,name,phone,link_code,has_pin,access,classes,active,locked,last_login_at} ] }
//   save     { id?, name, phone, access[], classes[{class_name,subject}], active? }  → { teacher }
//   set_pin  { id, pin? }                      → { pin }   pin left empty = a random one is made; shown ONCE
//   new_link { id }                            → { link_code }   old link stops working, phones are logged out
//   remove   { id }
//
// Teacher (no login yet):
//   link_info { code }                         → { name, school_name }   for the PIN screen
//   login     { code, pin }                    → { token, teacher }      stays logged in 30 days
// Teacher (logged in, x-teacher-app header):
//   me                                         → { teacher }
//   my_day                                     → today's lessons from the Term Planner (+ up to 3 left from
//                                                earlier per subject), today's homework, the last school day's
//                                                homework to check, roll numbers, deadline, today's saved report
//   save_day { items, hw_checks, watch, submit? }  saves what she marked; Done/Not done ticks the Term Planner;
//                                                submit:true stamps the time once (late if after the deadline)
// Tables (Step 2): teacher_day_reports, teacher_app_settings (step2-teacher-day.sql).
//
// Wrong PIN 5 times → locked for 15 minutes.
// Table: teacher_app (step1-teacher-app.sql). RLS on, no policies — only this file uses it.

const https = require('https');
const crypto = require('crypto');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const CLASSES = ['Pre KG', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
                 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
const ACCESS_KEYS = ['today', 'hw_check', 'submit_day', 'notices'];
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const APP_DAYS = 30;

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
// India time
const istNowIso = function () { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString(); };
const istToday = function () { return istNowIso().slice(0, 10); };
const istTime = function () { return istNowIso().slice(11, 16); };          // "15:05"
const istWeekday = function () { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(istToday() + 'T00:00:00Z').getUTCDay()]; };
const addDays = function (d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// The school's "Submit my day" deadline (principal's choice, default 3:30 PM)
async function readDeadline(school) {
  const r = await db('GET', '/rest/v1/teacher_app_settings?school_id=eq.' + enc(school.id) + '&select=deadline&limit=1');
  const d = ok(r) && r.data.length ? String(r.data[0].deadline || '') : '';
  return /^\d{2}:\d{2}$/.test(d) ? d : '15:30';
}

// ── School/teacher login (same check as auth.js / term-plan.js) ──
function verify(raw, secret) {
  if (!raw || !secret) return null;
  try {
    const parts = String(raw).split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0], 'base64').toString();
    const expect = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const got = Buffer.from(parts[1], 'utf8'), want = Buffer.from(expect, 'utf8');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    const data = JSON.parse(payload);
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch (e) { return null; }
}
function sign(data, secret) {
  const payload = JSON.stringify(data);
  return Buffer.from(payload).toString('base64') + '.' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
// The teacher-app key is different from the school login key on purpose:
// a teacher-app login can never be used on any other TeachBot server file.
function appSecret() {
  const s = process.env.SUPABASE_SECRET_KEY || '';
  return s ? crypto.createHash('sha256').update('teacher-app:' + s).digest('hex') : '';
}

async function findSchool(label) {
  const s = String(label || '').trim();
  if (!s) return null;
  let r = await db('GET', '/rest/v1/schools?school_code=eq.' + enc(s) + '&select=id,name,school_code,subscription_status,subscription_end&limit=1');
  if ((!ok(r) || !r.data.length) && /^[0-9a-fA-F-]{36}$/.test(s)) {
    r = await db('GET', '/rest/v1/schools?id=eq.' + enc(s) + '&select=id,name,school_code,subscription_status,subscription_end&limit=1');
  }
  return ok(r) && r.data.length ? r.data[0] : null;
}
function schoolClosed(s) {
  if (!s) return 'School not found.';
  if (s.subscription_status === 'suspended' || s.subscription_status === 'expired') return 'Your school\'s DigiSmart subscription has ended. Please tell your principal.';
  if (s.subscription_end) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(s.subscription_end); end.setHours(0, 0, 0, 0);
    if (end < today) return 'Your school\'s DigiSmart subscription has ended. Please tell your principal.';
  }
  return '';
}

function newLinkCode() {
  // 10 letters/digits, no look-alikes (0/O, 1/l/I)
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = crypto.randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += abc[b[i] % abc.length];
  return s;
}
function hashPin(pin, salt) {
  return crypto.createHmac('sha256', appSecret()).update(salt + ':' + pin).digest('hex');
}
function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cleanAccess(v) {
  const list = Array.isArray(v) ? ACCESS_KEYS.filter(function (k) { return v.indexOf(k) !== -1; }) : [];
  return list;
}
function cleanClasses(v) {
  if (!Array.isArray(v)) return [];
  const seen = {};
  return v.slice(0, 60).map(function (c) {
    return { class_name: clip(c && c.class_name, 20), subject: clip(c && c.subject, 40) };
  }).filter(function (c) {
    if (CLASSES.indexOf(c.class_name) === -1 || !c.subject) return false;
    const k = c.class_name + '|' + c.subject.toLowerCase();
    if (seen[k]) return false;
    seen[k] = 1; return true;
  });
}
function forPrincipal(t) {
  return {
    id: t.id, name: t.name, phone: t.phone || '', link_code: t.link_code,
    has_pin: !!t.pin_hash, access: t.access || [], classes: t.classes || [], active: t.active !== false,
    locked: !!(t.locked_until && new Date(t.locked_until) > new Date()),
    last_login_at: t.last_login_at || null
  };
}
function forTeacher(t, school) {
  return { id: t.id, name: t.name, access: t.access || [], classes: t.classes || [],
           school_name: (school && school.name) || '' };
}
async function teacherOfSchool(id, school) {
  if (!id) return null;
  const r = await db('GET', '/rest/v1/teacher_app?id=eq.' + enc(id) + '&school_id=eq.' + enc(school.id) + '&select=*&limit=1');
  return ok(r) && r.data.length ? r.data[0] : null;
}
async function byCode(code) {
  const c = clip(code, 20);
  if (!/^[a-z0-9]{6,20}$/.test(c)) return null;
  const r = await db('GET', '/rest/v1/teacher_app?link_code=eq.' + enc(c) + '&select=*&limit=1');
  return ok(r) && r.data.length ? r.data[0] : null;
}

// A teacher-app login is valid only while the link and PIN it was made with are unchanged.
async function readTeacher(raw) {
  const tok = verify(raw, appSecret());
  if (!tok || tok.role !== 'teacher_app' || !tok.tid) return { error: 'Please enter your PIN again.' };
  const r = await db('GET', '/rest/v1/teacher_app?id=eq.' + enc(tok.tid) + '&select=*&limit=1');
  if (!ok(r)) return { error: 'Could not check your login: ' + why(r) };
  const t = r.data[0];
  if (!t || t.active === false) return { error: 'Your teacher app was switched off. Please ask your principal.' };
  if (t.link_code !== tok.lc || String(t.pin_set_at || '') !== String(tok.ps || '')) return { error: 'Your link or PIN was changed. Please enter your new PIN.' };
  const school = await findSchool(t.school_id);
  const closed = schoolClosed(school);
  if (closed) return { error: closed };
  return { teacher: t, school: school };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dss-session, x-teacher-app');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SUPABASE_SECRET_KEY) return res.status(500).json({ error: 'SUPABASE_SECRET_KEY is not set in Vercel.' });

  const body = req.body || {};
  const action = String(body.action || '');

  try {
    // ───────────── Teacher side ─────────────
    if (action === 'link_info') {
      const t = await byCode(body.code);
      if (!t || t.active === false) return res.json({ error: 'This link is not working. Please ask your principal for your link.' });
      const school = await findSchool(t.school_id);
      return res.json({ success: true, name: t.name, school_name: (school && school.name) || '' });
    }

    if (action === 'login') {
      const t = await byCode(body.code);
      if (!t || t.active === false) return res.json({ error: 'This link is not working. Please ask your principal for your link.' });
      if (!t.pin_hash) return res.json({ error: 'Your PIN is not set yet. Please ask your principal.' });
      if (t.locked_until && new Date(t.locked_until) > new Date()) {
        const mins = Math.max(1, Math.ceil((new Date(t.locked_until) - new Date()) / 60000));
        return res.json({ error: 'Too many wrong PINs. Please try again in ' + mins + ' minute' + (mins > 1 ? 's' : '') + ', or ask your principal.' });
      }
      const pin = String(body.pin || '');
      if (!/^\d{4}$/.test(pin) || !sameHash(hashPin(pin, t.pin_salt || ''), t.pin_hash)) {
        const fails = (t.pin_fails || 0) + 1;
        const patch = { pin_fails: fails };
        if (fails >= MAX_FAILS) { patch.pin_fails = 0; patch.locked_until = new Date(Date.now() + LOCK_MIN * 60000).toISOString(); }
        await db('PATCH', '/rest/v1/teacher_app?id=eq.' + enc(t.id), patch);
        const left = MAX_FAILS - fails;
        return res.json({ error: fails >= MAX_FAILS
          ? 'Too many wrong PINs. Locked for ' + LOCK_MIN + ' minutes.'
          : 'Wrong PIN. ' + left + ' tr' + (left > 1 ? 'ies' : 'y') + ' left.' });
      }
      const school = await findSchool(t.school_id);
      const closed = schoolClosed(school);
      if (closed) return res.json({ error: closed });
      await db('PATCH', '/rest/v1/teacher_app?id=eq.' + enc(t.id), { pin_fails: 0, locked_until: null, last_login_at: new Date().toISOString() });
      const token = sign({ role: 'teacher_app', tid: t.id, lc: t.link_code, ps: String(t.pin_set_at || ''),
                           exp: Date.now() + APP_DAYS * 24 * 3600 * 1000 }, appSecret());
      return res.json({ success: true, token: token, teacher: forTeacher(t, school) });
    }

    if (action === 'me') {
      const me = await readTeacher(req.headers['x-teacher-app']);
      if (me.error) return res.status(401).json({ error: me.error });
      return res.json({ success: true, teacher: forTeacher(me.teacher, me.school) });
    }

    // ── MY DAY (Step 2): what to teach today, yesterday's homework, submit my day ──
    if (action === 'my_day' || action === 'save_day') {
      const me = await readTeacher(req.headers['x-teacher-app']);
      if (me.error) return res.status(401).json({ error: me.error });
      const t = me.teacher, school = me.school;
      const access = t.access || [];
      const mine = (Array.isArray(t.classes) ? t.classes : []).filter(function (c) { return c && c.class_name && c.subject; });
      const isMine = function (cls, sub) {
        return mine.some(function (c) { return c.class_name === cls && String(c.subject).toLowerCase() === String(sub || '').toLowerCase(); });
      };
      const today = istToday();
      const deadline = await readDeadline(school);

      // the school's labels (diary students are saved under the id or the code)
      const labels = [String(school.id)];
      if (school.school_code) labels.push(String(school.school_code));

      // term plans of her classes
      const myClasses = mine.map(function (c) { return c.class_name; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
      let plans = [];
      if (myClasses.length) {
        const pr = await db('GET', '/rest/v1/term_plans?school_id=eq.' + enc(school.id) + '&class_name=in.(' +
          myClasses.map(function (c) { return '"' + c.replace(/"/g, '') + '"'; }).map(enc).join(',') +
          ')&status=neq.returned&select=id,class_name,subject,term,status,rows&order=updated_at.desc');
        if (!ok(pr)) return res.json({ error: 'Could not read the term plans: ' + why(pr) });
        plans = pr.data.filter(function (p) { return isMine(p.class_name, p.subject); });
      }

      const repR = await db('GET', '/rest/v1/teacher_day_reports?teacher_app_id=eq.' + enc(t.id) + '&report_date=eq.' + today + '&select=*&limit=1');
      if (!ok(repR)) return res.json({ error: 'Could not read today\'s report: ' + why(repR) + (repR.status === 404 ? ' (Has step2-teacher-day.sql been run in Supabase?)' : '') });
      const report = repR.data[0] || null;

      if (action === 'save_day') {
        if (access.indexOf('today') === -1 && access.indexOf('submit_day') === -1 && access.indexOf('hw_check') === -1) {
          return res.json({ error: 'Your principal has not given you anything to mark.' });
        }
        // items: [{ plan_id, index, status:'done'|'not'|'', reason, hw }]
        const byId = {};
        plans.forEach(function (p) { byId[p.id] = p; });
        const items = (Array.isArray(body.items) ? body.items : []).slice(0, 60).map(function (x) {
          const p = byId[x && x.plan_id];
          const i = parseInt(x && x.index, 10);
          if (!p || !Array.isArray(p.rows) || !(i >= 0 && i < p.rows.length)) return null;
          const st = x.status === 'done' || x.status === 'not' ? x.status : '';
          return { plan_id: p.id, index: i, class_name: p.class_name, subject: p.subject,
                   chapter: clip(p.rows[i].chapter, 160), teach: clip(p.rows[i].teach, 300),
                   date: p.rows[i].date || '', status: st, reason: st === 'not' ? clip(x.reason, 160) : '',
                   hw: clip(x.hw, 300) };
        }).filter(Boolean);
        // tick / untick the term plan rows she marked
        const touched = {};
        items.forEach(function (x) {
          if (!x.status) return;
          const p = byId[x.plan_id];
          const want = x.status === 'done';
          if (!!p.rows[x.index].done !== want) { p.rows[x.index].done = want; touched[p.id] = p; }
        });
        for (const id of Object.keys(touched)) {
          const w = await db('PATCH', '/rest/v1/term_plans?id=eq.' + enc(id) + '&school_id=eq.' + enc(school.id),
                             { rows: touched[id].rows, updated_at: new Date().toISOString() });
          if (!ok(w)) return res.json({ error: 'Could not tick the term plan: ' + why(w) });
        }
        // hw_checks: [{ hw_id, class_name, subject, homework, hw_date, corrected:'yes'|'some'|'no', missing:[roll] }]
        const checks = (Array.isArray(body.hw_checks) ? body.hw_checks : []).slice(0, 40).map(function (c) {
          if (!c || !isMine(clip(c.class_name, 20), clip(c.subject, 40))) return null;
          return { hw_id: clip(c.hw_id, 60), class_name: clip(c.class_name, 20), subject: clip(c.subject, 40),
                   homework: clip(c.homework, 300), hw_date: isDate(c.hw_date) ? c.hw_date : '',
                   corrected: ['yes', 'some', 'no'].indexOf(c.corrected) !== -1 ? c.corrected : '',
                   missing: (Array.isArray(c.missing) ? c.missing : []).slice(0, 80).map(function (m) { return clip(m, 10); }) };
        }).filter(Boolean);
        const fields = { items: items, hw_checks: checks, watch: clip(body.watch, 600), teacher_name: t.name,
                         updated_at: new Date().toISOString() };
        if (body.submit) {
          if (access.indexOf('submit_day') === -1) return res.json({ error: 'Your principal has not switched on Submit my day for you.' });
          if (!report || !report.submitted_at) {
            fields.submitted_at = new Date().toISOString();
            fields.late = istTime() > deadline;
          }
        }
        let w;
        if (report) w = await db('PATCH', '/rest/v1/teacher_day_reports?id=eq.' + enc(report.id), fields);
        else {
          Object.assign(fields, { school_id: school.id, teacher_app_id: t.id, report_date: today });
          w = await db('POST', '/rest/v1/teacher_day_reports', fields);
        }
        if (!ok(w)) return res.json({ error: 'Could not save: ' + why(w) });
        const saved = w.data[0];
        return res.json({ success: true, submitted_at: saved.submitted_at || null, late: !!saved.late });
      }

      // ── my_day: build the screen ──
      const out = { today: today, weekday: istWeekday(), deadline: deadline, now: istTime(),
                    access: access, classes: mine, items: [], earlier: [], hw_today: [], hw_check: [],
                    students: {}, report: report ? { items: report.items || [], hw_checks: report.hw_checks || [],
                    watch: report.watch || '', submitted_at: report.submitted_at || null, late: !!report.late } : null };

      if (access.indexOf('today') !== -1 || access.indexOf('submit_day') !== -1) {
        plans.forEach(function (p) {
          const rows = Array.isArray(p.rows) ? p.rows : [];
          const late = [];
          rows.forEach(function (row, i) {
            if (!row) return;
            const card = { plan_id: p.id, index: i, class_name: p.class_name, subject: p.subject, date: row.date || '',
                           chapter: row.chapter || '', pages: row.pages || '', teach: row.teach || '',
                           class_act: row.class_act || '', home_act: row.home_act || '', ground_act: row.ground_act || '',
                           done: !!row.done };
            if (row.date === today) out.items.push(card);
            else if (row.date && row.date < today && !row.done) late.push(card);
          });
          // the oldest few lessons still not taught come along as "left from earlier"
          late.slice(0, 3).forEach(function (c) { out.earlier.push(c); });
        });
      }

      // homework of her classes: today (to give) and the last school day before today (to check)
      if (myClasses.length) {
        const from = addDays(today, -7);
        const hr = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) +
          '&entry_type=eq.homework&status=neq.returned&hw_date=gte.' + from + '&hw_date=lte.' + today +
          '&select=id,class_name,subject,homework,hw_date,status&order=hw_date.asc');
        if (ok(hr)) {
          const mineHw = hr.data.filter(function (h) { return isMine(h.class_name, h.subject); });
          out.hw_today = mineHw.filter(function (h) { return h.hw_date === today; });
          if (access.indexOf('hw_check') !== -1) {
            const before = mineHw.filter(function (h) { return h.hw_date < today && h.status === 'added'; });
            const last = before.reduce(function (m, h) { return h.hw_date > m ? h.hw_date : m; }, '');
            out.hw_check = before.filter(function (h) { return h.hw_date === last; });
          }
        } else out.hw_error = 'Could not read homework: ' + why(hr);
      }

      // roll numbers (and names) of the classes she must check
      if (out.hw_check.length) {
        const cls = out.hw_check.map(function (h) { return h.class_name; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
        const sr = await db('GET', '/rest/v1/diary_students?school_id=in.(' + labels.map(enc).join(',') + ')&select=class,roll_no,name&order=roll_no.asc');
        if (ok(sr)) {
          cls.forEach(function (c) {
            out.students[c] = sr.data.filter(function (s) { return s.class === c; })
              .map(function (s) { return { roll: String(s.roll_no), name: s.name || '' }; })
              .sort(function (a, b) { return (parseInt(a.roll, 10) || 0) - (parseInt(b.roll, 10) || 0); });
          });
        }
      }
      return res.json(Object.assign({ success: true, teacher: forTeacher(t, school) }, out));
    }

    // ───────────── Principal side ─────────────
    const who = verify(req.headers['x-dss-session'], process.env.SUPABASE_SECRET_KEY || '');
    if (!who || (who.role !== 'school_admin' && who.role !== 'super_admin')) {
      return res.status(401).json({ error: 'Only the principal (School Admin login) can do this. Please log in again.' });
    }
    const school = await findSchool(who.role === 'super_admin' ? body.school_id : who.sid);
    if (!school) return res.json({ error: 'School not found for this login.' });

    if (action === 'list') {
      const r = await db('GET', '/rest/v1/teacher_app?school_id=eq.' + enc(school.id) + '&select=*&order=name.asc');
      if (!ok(r)) return res.json({ error: 'Could not load teachers: ' + why(r) + (r.status === 404 ? ' (Has step1-teacher-app.sql been run in Supabase?)' : '') });
      return res.json({ success: true, teachers: r.data.map(forPrincipal) });
    }

    if (action === 'save') {
      const name = clip(body.name, 80);
      if (!name) return res.json({ error: 'Please type the teacher\'s name.' });
      const access = cleanAccess(body.access);
      if (!access.length) return res.json({ error: 'Tick at least one thing this teacher can see.' });
      const fields = { name: name, phone: clip(body.phone, 20), access: access, classes: cleanClasses(body.classes),
                       updated_at: new Date().toISOString() };
      if (Object.prototype.hasOwnProperty.call(body, 'active')) fields.active = !!body.active;
      if (body.id) {
        const t = await teacherOfSchool(body.id, school);
        if (!t) return res.json({ error: 'Teacher not found in your school.' });
        const r = await db('PATCH', '/rest/v1/teacher_app?id=eq.' + enc(t.id) + '&school_id=eq.' + enc(school.id), fields);
        if (!ok(r)) return res.json({ error: 'Could not save: ' + why(r) });
        return res.json({ success: true, teacher: forPrincipal(r.data[0]) });
      }
      fields.school_id = school.id;
      fields.link_code = newLinkCode();
      const r = await db('POST', '/rest/v1/teacher_app', fields);
      if (!ok(r)) return res.json({ error: 'Could not add the teacher: ' + why(r) });
      return res.json({ success: true, teacher: forPrincipal(r.data[0]) });
    }

    if (action === 'set_pin') {
      const t = await teacherOfSchool(body.id, school);
      if (!t) return res.json({ error: 'Teacher not found in your school.' });
      let pin = String(body.pin || '').trim();
      if (pin && !/^\d{4}$/.test(pin)) return res.json({ error: 'The PIN must be exactly 4 digits.' });
      if (!pin) pin = String(crypto.randomInt(0, 10000)).padStart(4, '0');
      const salt = crypto.randomBytes(12).toString('hex');
      const r = await db('PATCH', '/rest/v1/teacher_app?id=eq.' + enc(t.id) + '&school_id=eq.' + enc(school.id), {
        pin_hash: hashPin(pin, salt), pin_salt: salt, pin_set_at: new Date().toISOString(),
        pin_fails: 0, locked_until: null, updated_at: new Date().toISOString()
      });
      if (!ok(r)) return res.json({ error: 'Could not save the PIN: ' + why(r) });
      return res.json({ success: true, pin: pin });
    }

    if (action === 'new_link') {
      const t = await teacherOfSchool(body.id, school);
      if (!t) return res.json({ error: 'Teacher not found in your school.' });
      const code = newLinkCode();
      const r = await db('PATCH', '/rest/v1/teacher_app?id=eq.' + enc(t.id) + '&school_id=eq.' + enc(school.id), { link_code: code, updated_at: new Date().toISOString() });
      if (!ok(r)) return res.json({ error: 'Could not make a new link: ' + why(r) });
      return res.json({ success: true, link_code: code });
    }

    if (action === 'remove') {
      const t = await teacherOfSchool(body.id, school);
      if (!t) return res.json({ error: 'Teacher not found in your school.' });
      const r = await db('DELETE', '/rest/v1/teacher_app?id=eq.' + enc(t.id) + '&school_id=eq.' + enc(school.id));
      if (!ok(r)) return res.json({ error: 'Could not remove: ' + why(r) });
      return res.json({ success: true });
    }

    return res.json({ error: 'Unknown action: ' + action });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
};
