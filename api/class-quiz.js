// /api/class-quiz.js — Class Quiz results (whole-class chorus ratings)
//
// POST { cls, subject, topic, planKey, results:[{q, a, rating}] } → { saved:true }
//   rating: 3 = most got it, 2 = about half, 1 = only a few
// GET  → { records:[ ...latest 30, newest first ] }   (for class-insights.html)
//
// Records live in Supabase Storage: lesson-audio/class-quiz/<time>_<rand>.json
// This is CLASS-level formative data (no student names) — the honest signal
// of which concepts landed and which need reteaching.

const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const FOLDER = 'class-quiz';

function sbReq(method, path, bodyObj) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return resolve(null);
    const buf = bodyObj ? Buffer.from(JSON.stringify(bodyObj)) : null;
    const opts = {
      hostname: SB_HOST, path: path, method: method,
      headers: {
        apikey: key, Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      }
    };
    if (buf) opts.headers['Content-Length'] = buf.length;
    const r = https.request(opts, function (resp) {
      const chunks = [];
      resp.on('data', function (c) { chunks.push(c); });
      resp.on('end', function () {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: resp.statusCode, json: JSON.parse(raw) }); }
        catch (e) { resolve({ status: resp.statusCode, json: null }); }
      });
      resp.on('error', function () { resolve(null); });
    });
    r.on('error', function () { resolve(null); });
    if (buf) r.write(buf);
    r.end();
  });
}

function sbSaveObject(obj, fileName) {
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
        apikey: key, Authorization: 'Bearer ' + key,
        'Content-Length': buf.length, 'x-upsert': 'true'
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

function sbFetchObject(fileName) {
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      const results = Array.isArray(b.results) ? b.results.slice(0, 10) : [];
      if (results.length === 0) return res.status(400).json({ saved: false, error: 'no results' });
      const record = {
        ts: new Date().toISOString(),
        cls: String(b.cls || '').substring(0, 30),
        subject: String(b.subject || '').substring(0, 60),
        topic: String(b.topic || '').substring(0, 140),
        planKey: String(b.planKey || '').substring(0, 64),
        results: results.map(function (r) {
          return {
            q: String((r && r.q) || '').substring(0, 220),
            a: String((r && r.a) || '').substring(0, 220),
            rating: Math.max(1, Math.min(3, parseInt((r && r.rating) || 0, 10) || 0))
          };
        }).filter(function (r) { return r.q && r.rating; })
      };
      const fileName = Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.json';
      const ok = await sbSaveObject(record, fileName);
      return res.json({ saved: !!ok });
    }

    if (req.method === 'GET') {
      // list latest files, then fetch up to 30 records
      const list = await sbReq('POST', '/storage/v1/object/list/lesson-audio', {
        prefix: FOLDER + '/',
        limit: 60,
        sortBy: { column: 'name', order: 'desc' }   // names start with timestamp → desc = newest first
      });
      const files = (list && Array.isArray(list.json)) ? list.json : [];
      const names = files
        .map(function (f) { return f && f.name ? String(f.name) : ''; })
        .filter(function (n) { return n.endsWith('.json'); })
        .slice(0, 30);
      const records = [];
      for (let i = 0; i < names.length; i++) {
        const rec = await sbFetchObject(names[i]);
        if (rec && Array.isArray(rec.results)) records.push(rec);
      }
      return res.json({ records: records });
    }

    return res.status(405).json({ error: 'GET or POST only' });
  } catch (e) {
    return res.json({ error: String(e.message || e).substring(0, 120) });
  }
};
