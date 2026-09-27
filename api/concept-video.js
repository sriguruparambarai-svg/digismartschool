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
const MODEL    = process.env.KLING_MODEL || 'kling-v1';   // change in Vercel settings, no code edit needed
const DURATION = '5';                                       // seconds; 5 is the cheapest Kling length
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

function makeJWT(accessKey, secretKey) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })).toString('base64url');
  const sig     = crypto.createHmac('sha256', secretKey).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
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

// ── Kling helpers ──
async function klingCreate(prompt, token) {
  const r = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_name: MODEL,
      prompt: String(prompt).substring(0, 2400),
      negative_prompt: 'blurry, low quality, distorted hands, extra fingers, distorted faces, violence, '
                     + 'scary, adult content, watermark, text, subtitles, letters, logo',
      duration: DURATION,
      aspect_ratio: '16:9',
      mode: 'std',
      sound: 'off',          // no Kling audio: TeachBot's voice talks over the clip, and silent clips cost less
      cfg_scale: 0.5
    })
  });
  const d = await r.json().catch(function () { return {}; });
  if (!r.ok || d.code !== 0) {
    throw new Error('Kling refused: ' + (d.message || ('HTTP ' + r.status)) );
  }
  const taskId = d.data && d.data.task_id;
  if (!taskId) throw new Error('Kling gave no job number');
  return taskId;
}

async function klingPoll(taskId, token) {
  const r = await fetch('https://api.klingai.com/v1/videos/text2video/' + taskId, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const d = await r.json().catch(function () { return {}; });
  const st = d.data && d.data.task_status;
  if (st === 'succeed') {
    const v = d.data.task_result && d.data.task_result.videos && d.data.task_result.videos[0];
    return { status: 'done', url: v && v.url };
  }
  if (st === 'failed') return { status: 'failed', error: (d.data && d.data.task_status_msg) || 'Kling job failed' };
  if (!st) return { status: 'error', error: 'Kling check failed: ' + (d.message || ('HTTP ' + r.status)) };
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

    const accessKey = process.env.KLING_ACCESS_KEY;
    const secretKey = process.env.KLING_SECRET_KEY;
    if (!accessKey || !secretKey) {
      return res.json({ status: 'failed', error: 'KLING_ACCESS_KEY / KLING_SECRET_KEY are not set in Vercel' });
    }
    const token = makeJWT(accessKey, secretKey);

    // 2) a job already running for this clip? check on it instead of paying again.
    const p = await readPending(pend, supaKey);
    const fresh = p && p.taskId && (Date.now() - (p.created || 0) < STALE_MS);

    if (p && p.failed && (p.tries || 0) >= MAX_TRIES) {
      return res.json({ status: 'failed', error: p.error || 'Kling could not make this clip' });
    }

    if (fresh && !p.failed) {
      const got = await klingPoll(p.taskId, token);
      if (got.status === 'processing' || got.status === 'error') {
        return res.json({ status: 'processing', note: got.error || '' });
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
    const taskId = await klingCreate(prompt, token);
    const ok = await savePending(pend, { taskId: taskId, created: Date.now(), tries: tries }, supaKey);
    return res.json({ status: 'processing', started: true, note: ok === 'ok' ? '' : ('job note not saved: ' + ok) });

  } catch (e) {
    return res.json({ status: 'failed', error: String(e.message || e).substring(0, 200) });
  }
};

module.exports.config = { maxDuration: 120 };
