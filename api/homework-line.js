// /api/homework-line.js — Homework Line TEST (Nov 2026)
//
// Why: the Lesson Planner gives every homework a fixed DATE, and "Fill this week" counts homework days
// from the plan's first day. When a day slips (absent teacher, homework timetable, a wrong tick) the two
// disagree with each other and with the class. Here the homework has NO date: each class + subject has
// one line — the approved Lesson Plan's homework in order — and a place in it ("given so far").
// The next homework is always the first one not given yet.
//   • "given" moves only when a homework put in from the line has really REACHED PARENTS at 4 PM — the Student
//     Diary, and for ERP schools also the ERP parent app (a send ERP refused is not counted until it goes) —
//     or when the principal sets the place with "We are here". The teachers' app is never needed.
//   • Schools without a workbook: the line is simply the Lesson Plan's own homework (book-back sets,
//     "Homework note: …") in lesson order, numbered Homework 1, 2, 3 … in each chapter.
//   • CLASS TEST: each class test of the plan is a step in the line. Its homework is given the DAY BEFORE:
//     "Tomorrow (Fri 6 Nov) class test — <chapter>. Revise: <portion>". It goes on any day (the homework
//     timetable does not hold it back); the test is then on the next school day.
//   • Not sent → not given → it comes again the next day. Nothing is skipped.
// The live Homework Planner, Lesson Planner and My Day are NOT changed by reading this.
// "Put in" (principal) writes that day's homework into the week (homework_plan) — replacing the
// unsent homework of that class + subject + day — so parents and My Day get the right one.
//
// POST { action, ... }  (principal; teachers may only read)
//   lines   { date }                                → { rows:[...], today, send_hour }
//   set_here{ class_name, subject, given }          principal: the class has finished `given` homework
//   put     { date, list:[{class_name,subject}] }   principal: put each one's next homework into the week on `date`
//
// Table: homework_line (step12-homework-line.sql). RLS on, no policies — only this file uses it.

const https = require('https');
const crypto = require('crypto');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const SEND_HOUR_IST = 16;   // same as api/homework.js
const WK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SUBJ_AL = { maths: 'mathematics', math: 'mathematics', 'social science': 'social', sst: 'social', 'social studies': 'social' };
const skey = function (s) { s = String(s || '').toLowerCase().trim(); return SUBJ_AL[s] || s; };
const clsNum = function (c) { const m = /Class (\d+)/.exec(String(c || '')); return m ? +m[1] : 0; };
const wkday = function (s) { return WK[new Date(s + 'T00:00:00Z').getUTCDay()]; };
const isDate = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); };
const clip = function (s, n) { return String(s == null ? '' : s).trim().substring(0, n); };
const enc = encodeURIComponent;
const istNow = function () { return new Date(Date.now() + 5.5 * 3600 * 1000); };
const istToday = function () { return istNow().toISOString().slice(0, 10); };

function db(method, path, body, prefer) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY || '';
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: SB_HOST, path: path, method: method,
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key, Prefer: prefer || 'return=representation' }
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
const ok = function (r) { return r && r.status >= 200 && r.status < 300; };
const why = function (r) {
  if (!r) return 'no reply';
  const d = r.data;
  return 'status ' + r.status + ': ' + (typeof d === 'string' ? d : (d && (d.message || d.error)) || JSON.stringify(d));
};

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

// the homework-timetable weekdays of a class + subject (null = the class has no homework timetable)
function ttDays(T, cls, subj) {
  const keys = Object.keys(T || {}).filter(function (k) { return k.charAt(0) !== '_'; });
  const ck = keys.find(function (k) { return k === cls; }) || (clsNum(cls) ? keys.find(function (k) { return clsNum(k) === clsNum(cls); }) : null);
  if (!ck) return null;
  const want = skey(subj), out = [];
  Object.keys(T[ck] || {}).forEach(function (d) { if ((T[ck][d] || []).some(function (x) { return skey(x) === want; })) out.push(d); });
  return out;
}
// same filler lines the live "Fill this week" leaves out
const isFiller = function (l) { return /^(Practise at home what was taught on |Reading: read .* aloud to a parent\.$|Homework note: redo 3 sums from )/.test(l); };
const hwText = function (x) { return String(x.homework || '').split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l && !isFiller(l); }).join('\n'); };
function kgLine(cls, subject, t, wb) {   // LKG/UKG wording, as in api/term-plan.js
  t = String(t || '').trim();
  if (!t || /Class \d+/.test(String(cls)) || /spoken|handwriting/i.test(String(subject)) || /^Homework given in /.test(t)) return t;
  if (/\bp(?:ages?|\.)?\s*\d+/i.test(t)) return t;
  const isWb = wb && /workbook/i.test(t), pm = t.match(/\bp(?:ages?|\.)?\s*\d+(?:\s*[–-]\s*\d+)?/i);
  return 'Homework given in ' + (isWb ? 'workbook' : subject + ' note') + (isWb && pm ? ' – ' + pm[0] : '');
}

// The line: the plan's homework in lesson order, no dates. Two lessons the same day give one homework.
function buildLine(p) {
  const rows = (Array.isArray(p.rows) ? p.rows : []).map(function (x, i) { return Object.assign({ _i: i }, x); })
    .concat((p.settings && Array.isArray(p.settings.hw_only) ? p.settings.hw_only : []).map(function (x) { return Object.assign({ _i: -1 }, x); }));
  const byDay = {}, line = [];
  rows.filter(function (x) { return x && isDate(x.date) && (x.type === 'test' || hwText(x)); })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a._i - b._i; })
    .forEach(function (x) {
      if (x.type === 'test') {   // a class test: told the day before
        line.push({ test: true, text: testPortion(x), chapter: String(x.chapter || ''), plan_date: x.date });
        return;
      }
      const t = kgLine(p.class_name, p.subject, hwText(x), !!(p.settings && p.settings.use_wb));
      if (line.length && line[line.length - 1].test && line[line.length - 1].plan_date === x.date) {   // homework on the test day itself
        line.push({ text: t, chapter: String(x.chapter || ''), plan_date: x.date }); return; }
      if (byDay[x.date]) { if (byDay[x.date].text.split('\n').indexOf(t) === -1) byDay[x.date].text += '\n' + t; return; }
      byDay[x.date] = { text: t, chapter: String(x.chapter || ''), plan_date: x.date };
      line.push(byDay[x.date]);
    });
  // a short label: "Ch 1 · Homework 5" — the workbook's own number when the text has one, else the count
  // in the chapter (schools without a workbook); a class test is "Ch 1 · Class test"
  const inCh = {};
  line.forEach(function (it, k) {
    const chm = /^(?:Ch(?:apter)?\.?\s*)?(\d+)/i.exec(it.chapter);
    it.n = k + 1;
    if (it.test) { it.label = (chm ? 'Ch ' + chm[1] + ' · ' : '') + 'Class test'; return; }
    inCh[it.chapter] = (inCh[it.chapter] || 0) + 1;
    const m = /home\s*-?\s*work\s*(\d+)/i.exec(it.text);
    it.label = (chm ? 'Ch ' + chm[1] + ' · ' : '') + 'Homework ' + (m ? m[1] : inCh[it.chapter]);
  });
  return line;
}
// what to revise for a class test, from the test lesson ("Class test: CLASS TEST: Children write workbook Class Test. Exercise A …")
function testPortion(x) {
  let t = String(x.teach || '').replace(/\s+/g, ' ').trim()
    .replace(/^(?:📝\s*)?(?:class test\s*[:—–-]\s*)+/i, '').replace(/^children write (?:the )?(?:workbook )?class test(?: page)?\.?\s*/i, '');
  if (t.length > 260) { const c = t.slice(0, 260).lastIndexOf('; '); t = c > 60 ? t.slice(0, c) : t.slice(0, 260).replace(/\s+\S*$/, '') + ' …'; }
  const own = hwText(x);   // a homework line the plan itself gave the test lesson
  return (t ? 'Revise: ' + t : 'Revise the whole chapter') + (own && !/^revise/i.test(own) ? '\n' + own : '');
}
// the next school day after d (no Sundays, no school holidays)
function nextSchoolDay(d, HOL) {
  const t = new Date(d + 'T00:00:00Z');
  for (let i = 0; i < 30; i++) { t.setUTCDate(t.getUTCDate() + 1); const s = t.toISOString().slice(0, 10); if (t.getUTCDay() !== 0 && !HOL[s]) return s; }
  return '';
}
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceD = function (s) { const t = new Date(s + 'T00:00:00Z'); return WK[t.getUTCDay()] + ' ' + t.getUTCDate() + ' ' + MONS[t.getUTCMonth()]; };
// the words parents get for one step of the line, given on day `d`
function hwFor(it, d, HOL) {
  if (!it.test) return it.text;
  const nx = nextSchoolDay(d, HOL), ch = String(it.chapter || '').replace(/^Ch(?:apter)?\.?\s*\d+\.?\s*/i, '');
  return 'Tomorrow' + (nx ? ' (' + niceD(nx) + ')' : '') + ' class test' + (ch ? ' — ' + ch : '') + '. ' + it.text;
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
    if ((action === 'set_here' || action === 'put') && !principal) return res.status(403).json({ error: 'Only the principal can do this.' });
    const today = istToday();

    // ── everything the three actions need: plans → lines, saved places, the homework timetable ──
    const pr = await db('GET', '/rest/v1/term_plans?school_id=eq.' + enc(school.id) +
      '&status=eq.approved&select=id,class_name,subject,term,rows,settings,updated_at&order=updated_at.desc');
    if (!ok(pr)) return res.json({ error: 'Could not read the Lesson Plans: ' + why(pr) });
    const st = await db('GET', '/rest/v1/homework_line?school_id=eq.' + enc(school.id) + '&select=*');
    if (!ok(st)) {
      const missing = st.status === 404 || /homework_line/.test(why(st));
      return res.json({ error: missing ? 'The Homework Line table is not made yet. Run step12-homework-line.sql in Supabase (SQL Editor → paste → Run), then open this page again.' : 'Could not read the homework places: ' + why(st), need_sql: missing });
    }
    const tt = await db('GET', '/rest/v1/homework_timetable?school_id=eq.' + enc(school.id) + '&select=plan&limit=1');
    const TT = (ok(tt) && tt.data.length && tt.data[0].plan) || {};
    const hol = await db('GET', '/rest/v1/school_holidays?school_id=eq.' + enc(school.id) + '&date=gte.' + today + '&select=date');
    const HOL = {}; if (ok(hol)) hol.data.forEach(function (h) { HOL[h.date] = 1; });

    const saved = {};
    st.data.forEach(function (s) { saved[s.class_name + '|' + skey(s.subject)] = s; });
    const seen = {}, items = [];
    pr.data.forEach(function (p) {
      if (/(Reading|Writing) Practice$/i.test(String(p.subject || ''))) return;   // those stay on the live planner
      const k = p.class_name + '|' + skey(p.subject);
      if (seen[k]) return;                       // the newest approved plan of a class + subject wins
      seen[k] = 1;
      const line = buildLine(p);
      if (!line.length) return;
      items.push({ key: k, plan: p, line: line, state: saved[k] || null });
    });

    // ── was the homework put in from the line really sent? (moves "given" on its own) ──
    const pend = items.filter(function (x) { return x.state && x.state.pending_hw_id; });
    if (pend.length) {
      const hr = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) + '&id=in.(' +
        pend.map(function (x) { return enc(x.state.pending_hw_id); }).join(',') + ')&select=id,sent_at,erp_error,status,hw_date');
      const H = {};
      if (ok(hr)) hr.data.forEach(function (h) { H[h.id] = h; });
      for (const x of pend) {
        if (!ok(hr)) break;
        const s = x.state, h = H[s.pending_hw_id];
        let patch = null;
        if (h && h.sent_at && !h.erp_error) {   // reached parents (diary + ERP parent app)
          const k = Math.min(Math.max(0, s.pending_k || 0), x.line.length - 1);
          patch = { given: k + 1, last_text: x.line[k].text, confirmed: true };
        } else if (h && h.sent_at) patch = null;   // in the diary, but ERP refused it — ERP is tried again for 7 days; wait
        else if (!h || h.status === 'returned' || (h.hw_date && h.hw_date < today)) patch = {};   // not given — it comes again
        if (patch) {
          Object.assign(patch, { pending_hw_id: '', pending_k: null, pending_date: null, updated_at: new Date().toISOString() });
          const w = await db('PATCH', '/rest/v1/homework_line?id=eq.' + enc(s.id), patch);
          if (ok(w) && w.data.length) x.state = w.data[0]; else Object.assign(s, patch);
        }
      }
    }

    // the place in the line: saved (found again by its text if the plan was changed), else the plan's ticks
    const placeOf = function (x) {
      const s = x.state;
      if (s) {
        let g = Math.max(0, Math.min(s.given || 0, x.line.length));
        if (g && s.last_text && x.line[g - 1].text !== s.last_text) {
          const f = x.line.findIndex(function (it) { return it.text === s.last_text; });
          if (f !== -1) g = f + 1;
        }
        return { given: g, confirmed: !!s.confirmed, from: s.confirmed ? 'set' : 'ticks' };
      }
      // not set yet: count the homework whose lessons are ticked done (a guess — check with the teacher)
      const rows = Array.isArray(x.plan.rows) ? x.plan.rows : [];
      let g = 0;
      x.line.forEach(function (it, k) { if (rows.some(function (r) { return r && r.date === it.plan_date && r.done; })) g = k + 1; });
      return { given: g, confirmed: false, from: 'ticks' };
    };

    const saveState = async function (x, fields) {
      fields.updated_at = new Date().toISOString();
      if (x.state && x.state.id) return db('PATCH', '/rest/v1/homework_line?id=eq.' + enc(x.state.id), fields);
      return db('POST', '/rest/v1/homework_line?on_conflict=school_id,class_name,subject',
        Object.assign({ school_id: String(school.id), class_name: x.plan.class_name, subject: x.plan.subject }, fields),
        'return=representation,resolution=merge-duplicates');
    };
    const find = function (cls, subj) { return items.find(function (x) { return x.key === cls + '|' + skey(subj); }); };

    // ── WE ARE HERE: the class has finished `given` homework of the line ──
    if (action === 'set_here') {
      const x = find(clip(body.class_name, 20), clip(body.subject, 40));
      if (!x) return res.json({ error: 'No approved Lesson Plan with homework was found for this class and subject.' });
      const g = parseInt(body.given, 10);
      if (!(g >= 0 && g <= x.line.length)) return res.json({ error: 'Choose the last homework the class has done.' });
      const w = await saveState(x, { given: g, last_text: g ? x.line[g - 1].text : '', confirmed: true, pending_hw_id: '', pending_k: null, pending_date: null });
      if (!ok(w)) return res.json({ error: 'Could not save: ' + why(w) });
      return res.json({ success: true });
    }

    // ── PUT IN: each one's next homework goes into the week on `date` (replaces that day's unsent one) ──
    if (action === 'put') {
      const date = String(body.date || '');
      if (!isDate(date)) return res.json({ error: 'Choose a day.' });
      if (date < today || (date === today && istNow().getUTCHours() >= SEND_HOUR_IST)) {
        return res.json({ error: 'Homework for ' + date + ' has already been sent at 4 PM. Choose the next school day.' });
      }
      const list = (Array.isArray(body.list) ? body.list : []).slice(0, 40);
      if (!list.length) return res.json({ error: 'Nothing chosen.' });
      const classes = list.map(function (l) { return clip(l && l.class_name, 20); }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
      const wk = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) + '&hw_date=eq.' + date +
        '&entry_type=eq.homework&status=neq.returned&class_name=in.(' + classes.map(function (c) { return enc('"' + c.replace(/"/g, '') + '"'); }).join(',') +
        ')&select=id,class_name,subject,homework,sent_at,status');
      if (!ok(wk)) return res.json({ error: 'Could not read the week\'s homework: ' + why(wk) });
      const done = [], skipped = [];
      for (const l of list) {
        const x = find(clip(l && l.class_name, 20), clip(l && l.subject, 40));
        const name = clip(l && l.class_name, 20) + ' ' + clip(l && l.subject, 40);
        if (!x) { skipped.push(name + ': no approved Lesson Plan'); continue; }
        const s = x.state;
        if (s && s.pending_hw_id && s.pending_date && s.pending_date < date) { skipped.push(name + ': the homework put in for ' + s.pending_date + ' is not sent yet'); continue; }
        const k = placeOf(x).given;
        if (k >= x.line.length) { skipped.push(name + ': all homework of the plan is given'); continue; }
        const text = clip(hwFor(x.line[k], date, HOL), 1000);
        const there = wk.data.filter(function (h) { return h.class_name === x.plan.class_name && skey(h.subject) === skey(x.plan.subject); });
        if (there.some(function (h) { return h.sent_at; })) { skipped.push(name + ': that day\'s homework is already sent'); continue; }
        let id = '', w;
        if (there.length) {
          id = there[0].id;
          w = await db('PATCH', '/rest/v1/homework_plan?id=eq.' + enc(id) + '&school_id=eq.' + enc(school.id),
            { homework: text, status: 'added', teacher_name: 'Homework Line', updated_at: new Date().toISOString() });
          // a second unsent homework of the same subject that day would be a repeat — take it out
          for (const h of there.slice(1)) await db('DELETE', '/rest/v1/homework_plan?id=eq.' + enc(h.id) + '&school_id=eq.' + enc(school.id));
        } else {
          w = await db('POST', '/rest/v1/homework_plan', { school_id: school.id, class_name: x.plan.class_name, subject: x.plan.subject,
            kind: 'Written', entry_type: 'homework', homework: text, hw_date: date, status: 'added', made_by: 'principal', teacher_name: 'Homework Line' });
          if (ok(w) && w.data.length) id = w.data[0].id;
        }
        if (!ok(w) || !id) { skipped.push(name + ': could not save (' + why(w) + ')'); continue; }
        const sw = await saveState(x, { given: k, last_text: k ? x.line[k - 1].text : '', confirmed: !!(s && s.confirmed),
          pending_hw_id: String(id), pending_k: k, pending_date: date });
        if (!ok(sw)) { skipped.push(name + ': put in, but its place was not saved (' + why(sw) + ')'); continue; }
        done.push(name + ': ' + x.line[k].label);
      }
      return res.json({ success: true, done: done, skipped: skipped });
    }

    // ── LINES: every class + subject on `date` ──
    if (action === 'lines') {
      const date = isDate(body.date) ? body.date : today;
      const wk = await db('GET', '/rest/v1/homework_plan?school_id=eq.' + enc(school.id) + '&hw_date=eq.' + date +
        '&entry_type=eq.homework&status=neq.returned&select=id,class_name,subject,homework,sent_at,teacher_name');
      const W = ok(wk) ? wk.data : [];
      const out = items.map(function (x) {
        const pl = placeOf(x), s = x.state, p = x.plan;
        const pending = s && s.pending_hw_id ? { date: s.pending_date, k: s.pending_k } : null;
        const nextK = pending && pending.date < date ? (pending.k || 0) + 1 : pl.given;   // a day after one still waiting
        const days = ttDays(TT, p.class_name, p.subject);
        const week = W.filter(function (h) { return h.class_name === p.class_name && skey(h.subject) === skey(p.subject); })
          .map(function (h) { return { id: h.id, text: h.homework, sent: !!h.sent_at, by: h.teacher_name || '' }; });
        const planSays = (Array.isArray(p.rows) ? p.rows : []).filter(function (r) { return r && r.date === date; })
          .map(function (r) { return hwText(r); }).filter(Boolean).join('\n');
        return { class_name: p.class_name, subject: p.subject, term: p.term, total: x.line.length,
                 given: pl.given, confirmed: pl.confirmed, from: pl.from, pending: pending,
                 line: x.line.map(function (it) { return { n: it.n, label: it.label, text: hwFor(it, date, HOL), chapter: it.chapter, plan_date: it.plan_date, test: !!it.test }; }),
                 next_k: nextK,
                 // a class test's "tomorrow" homework goes on any day; other homework follows the homework timetable
                 hw_day: x.line[nextK] && x.line[nextK].test ? true : days === null ? null : days.indexOf(wkday(date)) !== -1,
                 week: week, plan_says: planSays };
      }).sort(function (a, b) {
        const ca = a.class_name, cb = b.class_name, na = clsNum(ca), nb = clsNum(cb);
        const ra = na || (/UKG/.test(ca) ? -1 : /LKG/.test(ca) ? -2 : -3), rb = nb || (/UKG/.test(cb) ? -1 : /LKG/.test(cb) ? -2 : -3);
        return ra - rb || (ca < cb ? -1 : ca > cb ? 1 : 0) || (a.subject < b.subject ? -1 : 1);
      });
      return res.json({ success: true, rows: out, today: today, send_hour: SEND_HOUR_IST, date: date,
                        sent_now: date < today || (date === today && istNow().getUTCHours() >= SEND_HOUR_IST),
                        school: { name: school.name } });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    console.error('homework-line.js', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
