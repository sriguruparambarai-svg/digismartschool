// /api/lesson-plan.js — Prepared-class plan cache
//
// GET  ?key=<hex>          → { steps: [...] } if a prepared plan exists, else { steps: null }
// POST { key, steps, meta} → saves the plan → { saved: true }
//
// Plans live in Supabase Storage: lesson-audio/lesson-plans/<key>.json
// This is what makes "Prepare Class" work: the plan is generated ONCE
// (tonight, by the teacher) and every later open of the same lesson
// loads it instantly — no live AI call in front of the students.

const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '2mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const FOLDER = 'lesson-plans';

function validKey(k) {
  return typeof k === 'string' && /^[a-f0-9]{16,64}$/.test(k);
}

function sbGet(fileName) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return resolve(null);
    const opts = {
      hostname: SB_HOST,
      path: '/storage/v1/object/lesson-audio/' + FOLDER + '/' + fileName,
      method: 'GET',
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    };
    const r = https.request(opts, function (resp) {
      if (resp.statusCode !== 200) { resp.resume(); return resolve(null); }
      const chunks = [];
      resp.on('data', function (c) { chunks.push(c); });
      resp.on('end', function () {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { resolve(null); }
      });
      resp.on('error', function () { resolve(null); });
    });
    r.on('error', function () { resolve(null); });
    r.end();
  });
}

function sbSave(obj, fileName) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return resolve(false);
    const buf = Buffer.from(JSON.stringify(obj));
    const opts = {
      hostname: SB_HOST,
      path: '/storage/v1/object/lesson-audio/' + FOLDER + '/' + fileName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Length': buf.length,
        'x-upsert': 'true'
      }
    };
    const r = https.request(opts, function (res) {
      res.resume();
      res.on('end', function () { resolve(res.statusCode === 200 || res.statusCode === 201); });
    });
    r.on('error', function () { resolve(false); });
    r.write(buf);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const key = String((req.query && req.query.key) || '');
      if (!validKey(key)) return res.json({ steps: null });
      const data = await sbGet(key + '.json');
      if (data && Array.isArray(data.steps) && data.steps.length) {
        return res.json({ steps: data.steps, meta: data.meta || null, prepared: true });
      }
      return res.json({ steps: null });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const key = String(body.key || '');
      const steps = Array.isArray(body.steps) ? body.steps : null;
      if (!validKey(key) || !steps || steps.length === 0 || steps.length > 40) {
        return res.status(400).json({ saved: false, error: 'invalid key or steps' });
      }
      const ok = await sbSave({
        steps: steps,
        meta: Object.assign({}, body.meta || {}, { saved: new Date().toISOString() })
      }, key + '.json');
      return res.json({ saved: !!ok });
    }

    return res.status(405).json({ error: 'GET or POST only' });
  } catch (e) {
    return res.json({ steps: null, error: String(e.message || e).substring(0, 120) });
  }
};
