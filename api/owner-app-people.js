// /api/owner-app-people.js — Owner App people, from the SUPER ADMIN panel (Nov 2026)
//
// The ERP's Owner App (erp.digismartschool.com/owner) tells school owners what the ERP
// did on autopilot (fee reminders, …). Only DigiSmart's super admin decides who gets it:
// add a person (name + mobile) → one-time starting PIN; Reset; Remove.
// This file checks the super admin login (x-dss-session), then passes the request to the
// ERP's door api/owner-app-admin.js, proved with TEACHBOT_LINK_KEY (same key as the
// homework and timetable links). No school login can reach it.
//
// POST { action: 'schools' | 'list' | 'add' | 'reset' | 'remove', school_id?, name?, phone?, id? }

const https = require('https');
const crypto = require('crypto');

const ERP_HOST = 'erp.digismartschool.com';
const ERP_PATH = '/api/owner-app-admin';
const ACTIONS = ['schools', 'list', 'add', 'reset', 'remove'];

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

function erpDoor(body) {
  return new Promise(function (resolve) {
    const key = process.env.TEACHBOT_LINK_KEY || '';
    if (!key) return resolve({ status: 500, data: { ok: false, error: 'TEACHBOT_LINK_KEY is not set in TeachBot\'s Vercel settings.' } });
    const data = JSON.stringify(body);
    const r = https.request({ hostname: ERP_HOST, path: ERP_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'x-teachbot-key': key } }, function (res) {
      let d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () { let j = null; try { j = d ? JSON.parse(d) : null; } catch (e) { j = { ok: false, error: d.slice(0, 200) }; } resolve({ status: res.statusCode, data: j || {} }); });
    });
    r.on('error', function (e) { resolve({ status: 502, data: { ok: false, error: 'Could not reach the ERP: ' + e.message } }); });
    r.setTimeout(12000, function () { r.destroy(new Error('the ERP took too long to answer')); });
    r.write(data); r.end();
  });
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const who = readSession(req.headers['x-dss-session']);
  if (!who || who.role !== 'super_admin') return res.status(401).json({ ok: false, error: 'Super admin only. Please log in again.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (e) { return res.status(400).json({ ok: false, error: 'Invalid request.' }); }
  const action = String(body.action || '');
  if (ACTIONS.indexOf(action) === -1) return res.status(400).json({ ok: false, error: 'Unknown action.' });
  const out = await erpDoor({
    action: action,
    school_id: body.school_id != null ? String(body.school_id).slice(0, 64) : undefined,
    name: body.name != null ? String(body.name).slice(0, 80) : undefined,
    phone: body.phone != null ? String(body.phone).slice(0, 20) : undefined,
    id: body.id != null ? String(body.id).slice(0, 64) : undefined
  });
  return res.status(out.status || 500).json(out.data);
};
