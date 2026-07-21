// /api/science-models.js — Verified 3D model finder for Science Class
//
// Receives { organ, query, label } →
//   1. CACHE: if this organ was resolved before, return the saved model instantly
//      (JSON in Supabase Storage: lesson-audio/science-models/<organ>.json)
//   2. SEARCH: Sketchfab public API (free, legal embeds of real 3D models)
//   3. REVIEWER: Claude reads the candidates' names/descriptions and picks the
//      ONE most accurate, realistic, school-appropriate model. Doubtful → none.
//   4. Save to cache, return { uid, name }
//
// On ANY failure returns { uid: null } (never an error) — the class page then
// falls back to a real photograph, so the lesson never breaks.

const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const CACHE_FOLDER = 'science-models';
const MODEL = 'claude-sonnet-4-5';
const UA = 'DigiSmartSchool/1.0 (https://digismartschool.com; sriguruparambarai@gmail.com)';

function getJSON(hostname, path) {
  return new Promise(function (resolve) {
    const opts = { hostname: hostname, path: path, method: 'GET', headers: { 'User-Agent': UA, 'Accept': 'application/json' } };
    const r = https.request(opts, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { resolve(null); }
      });
    });
    r.on('error', function () { resolve(null); });
    r.end();
  });
}

// ── Supabase Storage cache (same bucket pattern as social-images) ──
function fetchCache(fileName) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return resolve(null);
    const opts = {
      hostname: SB_HOST,
      path: '/storage/v1/object/lesson-audio/' + CACHE_FOLDER + '/' + fileName,
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

function saveCache(obj, fileName) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return resolve(false);
    const buf = Buffer.from(JSON.stringify(obj));
    const opts = {
      hostname: SB_HOST,
      path: '/storage/v1/object/lesson-audio/' + CACHE_FOLDER + '/' + fileName,
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

// ── Sketchfab search ─────────────────────────────────────────
function parseResults(data) {
  if (!data || !Array.isArray(data.results)) return [];
  return data.results.map(function (m) {
    return {
      uid: String(m.uid || ''),
      name: String(m.name || '').substring(0, 120),
      desc: String(m.description || '').replace(/\s+/g, ' ').substring(0, 180),
      likes: m.likeCount || 0,
      staffpicked: !!m.staffpickedAt
    };
  }).filter(function (m) { return m.uid; });
}

async function searchSketchfab(query) {
  const q = encodeURIComponent(String(query).trim());
  // staff-picked first (curated quality), then the wider pool by popularity
  let data = await getJSON('api.sketchfab.com',
    '/v3/search?type=models&q=' + q + '&staffpicked=true&sort_by=-likeCount&count=12');
  let out = parseResults(data);
  if (out.length < 4) {
    data = await getJSON('api.sketchfab.com',
      '/v3/search?type=models&q=' + q + '&sort_by=-likeCount&count=14');
    const more = parseResults(data);
    const seen = {};
    out.forEach(function (m) { seen[m.uid] = true; });
    more.forEach(function (m) { if (!seen[m.uid]) out.push(m); });
  }
  return out.slice(0, 16);
}

// ── AI REVIEWER — picks the single best classroom model ──────
function askReviewer(label, candidates) {
  return new Promise(function (resolve) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return resolve(0);

    let listing = '';
    candidates.forEach(function (c, i) {
      listing += (i + 1) + '. NAME: ' + c.name
        + (c.staffpicked ? ' [staff-picked]' : '')
        + ' | LIKES: ' + c.likes
        + '\n   DESCRIPTION: ' + (c.desc || '(none)') + '\n';
    });

    const payload = JSON.stringify({
      model: MODEL,
      max_tokens: 120,
      system: 'You choose ONE 3D model for a school science classroom projector. '
        + 'Pick the model that is: scientifically ACCURATE and REALISTIC (not cartoon, stylised, '
        + 'game asset, horror, damaged, or decorative), clearly shows the subject, and is '
        + 'appropriate for children. Prefer staff-picked and well-liked anatomical/educational models. '
        + 'Reply ONLY with JSON like {"pick":3}. If NO candidate is suitable, reply {"pick":0}.',
      messages: [{
        role: 'user',
        content: 'SUBJECT NEEDED: ' + label + '\n\nCANDIDATE MODELS:\n' + listing
      }]
    });

    const opts = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const chunks = [];
    const r = https.request(opts, function (res) {
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try {
          const d = JSON.parse(Buffer.concat(chunks).toString());
          let txt = '';
          if (d && Array.isArray(d.content)) txt = d.content.map(function (b) { return b.type === 'text' ? b.text : ''; }).join('');
          const m = txt.match(/\{[\s\S]*\}/);
          if (!m) return resolve(0);
          const n = parseInt(JSON.parse(m[0]).pick, 10);
          resolve((n >= 1 && n <= candidates.length) ? n : 0);
        } catch (e) { resolve(0); }
      });
    });
    r.on('error', function () { resolve(0); });
    r.write(payload);
    r.end();
  });
}

// ── HANDLER ─────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const organ = String(body.organ || '').toLowerCase().replace(/[^a-z_]/g, '').substring(0, 40);
  const query = String(body.query || '').trim();
  const label = String(body.label || organ).trim();
  if (!organ || query.length < 3) return res.json({ uid: null });

  const fileName = organ + '.json';

  try {
    // 1) cache — one verified model per organ, forever
    const cached = await fetchCache(fileName);
    if (cached && 'uid' in cached) {
      return res.json({ uid: cached.uid, name: cached.name || label, cached: true });
    }

    // 2) search
    const candidates = await searchSketchfab(query);
    if (candidates.length === 0) {
      return res.json({ uid: null, note: 'no sketchfab results' });
    }

    // 3) review
    const pick = await askReviewer(label, candidates);
    const chosen = pick > 0 ? candidates[pick - 1] : null;
    const result = chosen
      ? { uid: chosen.uid, name: chosen.name, verified: new Date().toISOString() }
      : { uid: null, verified: new Date().toISOString() };

    // 4) remember the verdict either way
    await saveCache(result, fileName);

    return res.json({ uid: result.uid, name: result.name || label, cached: false });
  } catch (e) {
    return res.json({ uid: null, note: String(e.message || e).substring(0, 120) });
  }
};
