// /api/social-images.js — Verified photo fetcher for Social Science Class
//
// Receives { query, context } →
//   1. CACHE: if this query was verified before, return saved result instantly
//      (JSON stored in Supabase Storage: lesson-audio/social-images/<hash>.json)
//   2. SEARCH: Wikimedia Commons (free, legal, real photographs)
//   3. GATEKEEPER: Claude checks every candidate's title + description against
//      the lesson step — ONLY on-topic images are approved. Doubtful → rejected.
//   4. Save approved list to cache, return { images:[{url,title}] }
//
// On ANY failure it returns { images: [] } (never an error) — the class page
// falls back to concept cards so a lesson can never break or show a wrong photo.

const https = require('https');
const crypto = require('crypto');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const CACHE_FOLDER = 'social-images';           // inside the existing lesson-audio bucket
const MODEL = 'claude-sonnet-4-5';
const UA = 'DigiSmartSchool/1.0 (https://digismartschool.com; sriguruparambarai@gmail.com)';

function cacheKey(query) {
  return crypto.createHash('sha256')
    .update('v1|' + String(query).toLowerCase().trim())
    .digest('hex').substring(0, 40);
}

// ── generic HTTPS GET returning parsed JSON ─────────────────
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

// ── Supabase Storage cache ──────────────────────────────────
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

// ── Wikimedia Commons search ────────────────────────────────
function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchWikimedia(query) {
  const q = encodeURIComponent(String(query).trim() + ' filetype:bitmap');
  const path = '/w/api.php?action=query&format=json&generator=search'
    + '&gsrsearch=' + q
    + '&gsrnamespace=6&gsrlimit=10'
    + '&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1400&origin=*';
  const data = await getJSON('commons.wikimedia.org', path);
  if (!data || !data.query || !data.query.pages) return [];
  const out = [];
  Object.keys(data.query.pages).forEach(function (pid) {
    const p = data.query.pages[pid];
    const info = p.imageinfo && p.imageinfo[0];
    if (!info) return;
    const url = info.thumburl || info.url;
    if (!url) return;
    const low = url.toLowerCase();
    if (low.indexOf('.jpg') === -1 && low.indexOf('.jpeg') === -1 && low.indexOf('.png') === -1) return;
    let desc = '';
    try { desc = stripTags(info.extmetadata && info.extmetadata.ImageDescription && info.extmetadata.ImageDescription.value); } catch (e) {}
    out.push({
      title: String(p.title || '').replace(/^File:/, '').substring(0, 160),
      url: url,
      desc: desc.substring(0, 220)
    });
  });
  return out;
}

// ── AI GATEKEEPER — approves only on-topic candidates ───────
function askGatekeeper(query, context, candidates) {
  return new Promise(function (resolve) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return resolve([]);   // no key → approve nothing (safe direction)

    let listing = '';
    candidates.forEach(function (c, i) {
      listing += (i + 1) + '. TITLE: ' + c.title + '\n   DESCRIPTION: ' + (c.desc || '(none)') + '\n';
    });

    const payload = JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system: 'You are a strict image reviewer for a school classroom projector. '
        + 'You will see a lesson topic and numbered image candidates (title + description). '
        + 'Approve ONLY images that clearly and directly show the topic itself. '
        + 'REJECT anything doubtful, unrelated, modern-event photos, memes, maps of wrong regions, '
        + 'people unrelated to the topic, or anything not suitable for children. '
        + 'When in doubt, reject. Reply ONLY with JSON like {"approved":[2,5]} — nothing else. '
        + 'If none qualify reply {"approved":[]}.',
      messages: [{
        role: 'user',
        content: 'LESSON TOPIC / STEP: ' + String(query) + '\nCONTEXT: ' + String(context || '').substring(0, 300)
          + '\n\nCANDIDATE IMAGES:\n' + listing
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
          if (!m) return resolve([]);
          const parsed = JSON.parse(m[0]);
          const arr = Array.isArray(parsed.approved) ? parsed.approved : [];
          resolve(arr.map(function (n) { return parseInt(n, 10); }).filter(function (n) { return n >= 1 && n <= candidates.length; }));
        } catch (e) { resolve([]); }
      });
    });
    r.on('error', function () { resolve([]); });
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
  const query = String(body.query || '').trim();
  const context = String(body.context || '').trim();
  if (query.length < 3) return res.json({ images: [] });

  const fileName = cacheKey(query) + '.json';

  try {
    // 1) cache
    const cached = await fetchCache(fileName);
    if (cached && Array.isArray(cached.images)) {
      return res.json({ images: cached.images, cached: true });
    }

    // 2) search
    const candidates = await searchWikimedia(query);
    if (candidates.length === 0) {
      return res.json({ images: [], note: 'no wikimedia results' });
    }

    // 3) gatekeeper
    const approved = await askGatekeeper(query, context, candidates);
    const images = approved.slice(0, 2).map(function (n) {
      const c = candidates[n - 1];
      return { url: c.url, title: c.title };
    });

    // 4) cache the verified result (even an empty one — verdict is remembered)
    await saveCache({ images: images, query: query, verified: new Date().toISOString() }, fileName);

    return res.json({ images: images, cached: false });
  } catch (e) {
    return res.json({ images: [], note: String(e.message || e).substring(0, 120) });
  }
};
