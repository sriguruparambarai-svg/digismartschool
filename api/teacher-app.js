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
