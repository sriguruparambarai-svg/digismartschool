// api/concept-video.js
// Makes a short real-life video for the Science Mystery class with Kling,
// then SAVES it in Supabase Storage so it is paid for only once.
//
// One call does everything, and the page simply calls it again every
// ~20 seconds until the video is ready:
//
//   POST { prompt, create:true }
//     -> { status:'done', url }          video is saved, play this link
//     -> { status:'processing' }         Kling is still making it
//     -> { status:'none' }               not made yet (create was false)
//     -> { status:'failed', error }      Kling could not make it (real reason)
//
// How the saving works (bucket "lesson-audio", folder "concept-video/"):
//   <key>.mp4           the finished video, public, shared by every school
//   <key>.pending.json  Kling's job number while the video is being made,
//                       so two classrooms opening the same new lesson never
//                       pay Kling twice for the same clip
// <key> comes from the prompt words, so the same prompt always finds the
// same saved video.
//
// This file is SEPARATE from api/kling-video.js, which is left untouched.

const crypto = require('crypto');

const SB_HOST  = 'pzxosqukijwpjdlfdfst.supabase.co';
const BUCKET   = 'lesson-audio';
const FOLDER   = 'concept-video';
// Kling's NEW API (2026): one API key, sent as "Bearer <key>", model named in the web address.
const KLING_HOST = 'https://api-singapore.klingai.com';
const MODEL    = 'kling-3.0';
const DURATION = 5;                                         // seconds
const MAX_TRIES = 2;                                        // stop paying for a prompt that keeps failing
const STALE_MS  = 40 * 60 * 1000;                           // a job older than this is treated as lost

// ── same "only our own pages may spend money" check as gen-image.js ──
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

// The single Kling API key. KLING_API_KEY is preferred; the key pasted into
// KLING_ACCESS_KEY also works. trim(): a copied space breaks the key.
function klingKey() {
  return String(process.env.KLING_API_KEY || process.env.KLING_ACCESS_KEY || '').trim();
}

function videoKey(prompt) {
  const norm = String(prompt || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return crypto.createHash('sha256')
    .update(norm + '|' + DURATION + '|' + MODEL)
    .digest('hex').substring(0, 40);
}

function publicUrl(name) {
  return 'https://' + SB_HOST + '/storage/v1/object/public/' + BUCKET + '/' + FOLDER + '/' + name;
}

// ── storage helpers ──
async function videoExists(name) {
  try {
    const r = await fetch(publicUrl(name), { method: 'GET', headers: { Range: 'bytes=0-0' } });
    return r.status === 200 || r.status === 206;
  } catch (e) { return false; }
}

async function readPending(name, key) {
  try {
    const r = await fetch('https://' + SB_HOST + '/storage/v1/object/' + BUCKET + '/' + FOLDER + '/' + name, {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    if (r.status !== 200) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function upload(name, body, type, key) {
  try {
    const r = await fetch('https://' + SB_HOST + '/storage/v1/object/' + BUCKET + '/' + FOLDER + '/' + name, {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': type, 'x-upsert': 'true' },
      body: body
    });
    if (r.status >= 200 && r.status < 300) return 'ok';
    const t = await r.text();
    return 'storage said ' + r.status + ': ' + t.substring(0, 160);
  } catch (e) { return 'could not reach storage: ' + e.message; }
}

function savePending(name, obj, key) {
  return upload(name, JSON.stringify(obj), 'application/json', key);
}

// ── Kling helpers (new API) ──
// Kling's reply layout for task checks is read defensively: we look for a
// status word and a video link anywhere in the reply, so a small change in
// their format does not silently break the class. Anything unexpected is
// reported with the real reply text.
function findAll(obj, test, out) {
  out = out || [];
  if (obj && typeof obj === 'object') {
    for (const k in obj) {
      const v = obj[k];
      if (test(k, v)) out.push(v);
      if (v && typeof v === 'object') findAll(v, test, out);
    }
  }
  return out;
}

async function klingCreate(prompt, apiKey, externalId) {
  const r = await fetch(KLING_HOST + '/text-to-video/' + MODEL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: String(prompt).substring(0, 2400),
      settings: { resolution: '720p', aspect_ratio: '16:9', duration: DURATION, audio: 'off', multi_shot: false },
      options: { external_task_id: externalId, watermark_info: { enabled: false } }
    })
  });
  const t = await r.text();
  let d = {}; try { d = JSON.parse(t); } catch (e) {}
  if (!r.ok || (d.code !== undefined && d.code !== 0)) {
    throw new Error('Kling refused: ' + (d.message || d.msg || ('HTTP ' + r.status + ' ' + t.substring(0, 160))));
  }
  return externalId;
}

async function klingPoll(externalId, apiKey) {
  const r = await fetch(KLING_HOST + '/tasks?external_task_ids=' + encodeURIComponent(externalId), {
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
  });
  const t = await r.text();
  let d = {}; try { d = JSON.parse(t); } catch (e) {}
  if (!r.ok || (d.code !== undefined && d.code !== 0)) {
    return { status: 'error', error: 'Kling check failed: ' + (d.message || d.msg || ('HTTP ' + r.status + ' ' + t.substring(0, 160))) };
  }
  const statuses = findAll(d, function (k, v) { return /status$/i.test(k) && typeof v === 'string'; })
                   .map(function (x) { return x.toLowerCase(); });
  const urls = findAll(d, function (k, v) { return typeof v === 'string' && /^https?:\/\/\S+\.(mp4|mov)(\?|$)/i.test(v); });
  if (statuses.some(function (x) { return /fail/.test(x); })) {
    const msg = findAll(d, function (k, v) { return /(status_msg|message|reason|error)/i.test(k) && typeof v === 'string' && v; });
    return { status: 'failed', error: 'Kling could not make it: ' + (msg[0] || 'no reason given') };
  }
  if (urls.length) return { status: 'done', url: urls[0] };
  if (statuses.some(function (x) { return /succe/.test(x); })) {
    return { status: 'error', error: 'Kling says finished but no video link was found: ' + t.substring(0, 160) };
  }
  if (!statuses.length) {
    return { status: 'error', error: 'Kling reply not understood: ' + t.substring(0, 160) };
  }
  return { status: 'processing' };
}

// ── HANDLER ──
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!fromOurSite(req)) return res.status(403).json({ status: 'failed', error: 'forbidden' });

  const body = req.body || {};
  const prompt = String(body.prompt || '').trim();
  if (prompt.length < 10) return res.status(400).json({ status: 'failed', error: 'prompt too short' });

  const supaKey = process.env.SUPABASE_SECRET_KEY;
  if (!supaKey) return res.json({ status: 'failed', error: 'SUPABASE_SECRET_KEY is not set in Vercel' });

  const key = videoKey(prompt);
  const mp4 = key + '.mp4';
  const pend = key + '.pending.json';

  try {
    // 1) already made and saved? free from here on.
    if (await videoExists(mp4)) return res.json({ status: 'done', url: publicUrl(mp4), cached: true });

    const token = klingKey();
    if (!token) return res.json({ status: 'failed', error: 'The Kling API key is not set in Vercel (KLING_API_KEY)' });

    // 2) a job already running for this clip? check on it instead of paying again.
    const p = await readPending(pend, supaKey);
    const fresh = p && p.taskId && (Date.now() - (p.created || 0) < STALE_MS);

    if (p && p.failed && (p.tries || 0) >= MAX_TRIES) {
      return res.json({ status: 'failed', error: p.error || 'Kling could not make this clip' });
    }

    if (fresh && !p.failed) {
      const got = await klingPoll(p.taskId, token);
      if (got.status === 'processing') return res.json({ status: 'processing' });
      if (got.status === 'error') {
        // Show the real reason, but keep checking: the job may still finish.
        return res.json({ status: 'processing', error: got.error });
      }
      if (got.status === 'failed') {
        await savePending(pend, { taskId: p.taskId, created: p.created, tries: p.tries || 1,
                                  failed: true, error: got.error }, supaKey);
        return res.json({ status: 'failed', error: got.error });
      }
      // done: copy the video from Kling (their link expires) into our storage
      if (!got.url) return res.json({ status: 'failed', error: 'Kling finished but sent no video link' });
      const vr = await fetch(got.url);
      if (!vr.ok) return res.json({ status: 'processing', note: 'could not download from Kling yet (' + vr.status + ')' });
      const buf = Buffer.from(await vr.arrayBuffer());
      const saved = await upload(mp4, buf, 'video/mp4', supaKey);
      if (saved !== 'ok') return res.json({ status: 'failed', error: 'video made but not saved: ' + saved });
      return res.json({ status: 'done', url: publicUrl(mp4), cached: false });
    }

    // 3) nothing running. Only start a paid job when the page asks for it.
    if (body.create !== true) return res.json({ status: 'none' });

    const tries = (p && p.tries) ? p.tries + 1 : 1;
    // external id must be unique per Kling account, so a retry gets a new one
    const taskId = await klingCreate(prompt, token, 'dss-' + key.substring(0, 24) + '-' + tries + '-' + Date.now().toString(36));
    const ok = await savePending(pend, { taskId: taskId, created: Date.now(), tries: tries }, supaKey);
    return res.json({ status: 'processing', started: true, note: ok === 'ok' ? '' : ('job note not saved: ' + ok) });

  } catch (e) {
    return res.json({ status: 'failed', error: String(e.message || e).substring(0, 200) });
  }
};

module.exports.config = { maxDuration: 120 };
