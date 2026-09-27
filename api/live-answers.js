// api/live-answers.js
// Passes answer-card results from the facilitator's PHONE (card-scanner.html)
// to the PROJECTOR (science-mystery.html quick check), live.
//
// The projector opens a class code, the phone joins with it:
//   POST { action:'create' }                        -> { code }
//   POST { action:'state_set', code, state }        projector: which question, asking or answer shown
//   POST { action:'state_get', code }               phone:     -> { state }
//   POST { action:'answers_set', code, q, answers } phone:     answers = { "7":"B", "12":"A", ... }
//   POST { action:'answers_get', code, q }          projector: -> { answers }
//
// Only card numbers and letters travel here — never names. Files live in
// Supabase Storage: lesson-audio/live-answers/<code>/state.json and q<n>.json.
// A code is reused only after it has been quiet for 6 hours.

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const BUCKET  = 'lesson-audio';
const FOLDER  = 'live-answers';
const QUIET_MS = 6 * 60 * 60 * 1000;

// same "only our own pages" check as the other money/data endpoints
function fromOurSite(req) {
  function host(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }
  function ok(h) {
    if (!h) return false;
    if (['digismartschool.com', 'www.digismartschool.com', 'learn.digismartschool.com',
         'erp.digismartschool.com', 'localhost', '127.0.0.1'].indexOf(h) !== -1) return true;
    return /\.vercel\.app$/.test(h);
  }
  var o = req.headers['origin'];
  if (o) return ok(host(o));
  var r = req.headers['referer'] || req.headers['referrer'];
  if (r) return ok(host(r));
  return false;
}

function url(path) { return 'https://' + SB_HOST + '/storage/v1/object/' + BUCKET + '/' + FOLDER + '/' + path; }

async function readJson(path, key) {
  try {
    // the time in the address stops any in-between cache from returning an old answer list
    const r = await fetch(url(path) + '?t=' + Date.now(), {
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Cache-Control': 'no-cache' }
    });
    if (r.status !== 200) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function writeJson(path, obj, key) {
  try {
    const r = await fetch(url(path), {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
                 'x-upsert': 'true', 'cache-control': 'max-age=0' },
      body: JSON.stringify(obj)
    });
    if (r.status >= 200 && r.status < 300) return '';
    return 'storage said ' + r.status + ': ' + (await r.text()).substring(0, 120);
  } catch (e) { return 'could not reach storage: ' + e.message; }
}

function cleanCode(c) { return /^\d{4}$/.test(String(c || '')) ? String(c) : ''; }

function cleanAnswers(a) {
  const out = {};
  let n = 0;
  if (a && typeof a === 'object') {
    for (const k in a) {
      const card = parseInt(k, 10), L = String(a[k] || '').toUpperCase();
      if (card >= 1 && card <= 60 && /^[ABCD]$/.test(L)) { out[card] = L; if (++n >= 60) break; }
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!fromOurSite(req)) return res.status(403).json({ error: 'forbidden' });

  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return res.json({ error: 'SUPABASE_SECRET_KEY is not set in Vercel' });

  const b = req.body || {};
  const action = String(b.action || '');

  try {
    if (action === 'create') {
      for (let tries = 0; tries < 8; tries++) {
        const code = String(1000 + Math.floor(Math.random() * 9000));
        const old = await readJson(code + '/state.json', key);
        if (old && old.updated && Date.now() - old.updated < QUIET_MS) continue;   // in use
        const err = await writeJson(code + '/state.json', { q: -1, phase: 'wait', updated: Date.now() }, key);
        if (err) return res.json({ error: err });
        return res.json({ code: code });
      }
      return res.json({ error: 'no free class code, try again' });
    }

    const code = cleanCode(b.code);
    if (!code) return res.json({ error: 'class code must be 4 digits' });

    if (action === 'state_set') {
      const s = b.state || {};
      const state = {
        q: Math.max(-1, Math.min(20, parseInt(s.q, 10) || 0)),
        phase: ['wait', 'ask', 'reveal', 'done'].indexOf(s.phase) !== -1 ? s.phase : 'wait',
        total: Math.max(0, Math.min(20, parseInt(s.total, 10) || 0)),
        title: String(s.title || '').substring(0, 120),
        updated: Date.now()
      };
      const err = await writeJson(code + '/state.json', state, key);
      return res.json(err ? { error: err } : { ok: true });
    }

    if (action === 'state_get') {
      const st = await readJson(code + '/state.json', key);
      if (!st) return res.json({ error: 'No class with code ' + code + '. Check the number on the screen.' });
      return res.json({ state: st });
    }

    const q = Math.max(0, Math.min(20, parseInt(b.q, 10) || 0));

    if (action === 'answers_set') {
      const err = await writeJson(code + '/q' + q + '.json', { answers: cleanAnswers(b.answers), updated: Date.now() }, key);
      return res.json(err ? { error: err } : { ok: true });
    }

    if (action === 'answers_get') {
      const a = await readJson(code + '/q' + q + '.json', key);
      return res.json({ answers: (a && a.answers) || {} });
    }

    return res.json({ error: 'unknown action' });
  } catch (e) {
    return res.json({ error: String(e.message || e).substring(0, 160) });
  }
};
