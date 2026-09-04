// /api/gen-image.js — Bright kid-friendly illustration generator for young classes
//
// Receives { query, context } →
//   1. CACHE: if this scene was drawn before, return the saved picture instantly
//   2. DRAW:  otherwise ask OpenAI GPT Image 2 for a cheerful cartoon illustration,
//             save the PNG to Supabase Storage, and return its public URL.
//
// Same contract & shape as /api/social-images so the front end can use it as a
// drop-in sibling:  POST { query, context }  →  { images:[{url,title,source}] }
//
// Env vars (already set in Vercel):
//   OPENAI_API_KEY       — OpenAI developer key (server-side only, never exposed)
//   SUPABASE_SECRET_KEY  — Supabase service key (same one the audio cache uses)

const https = require('https');
const crypto = require('crypto');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const BUCKET = 'lesson-audio';        // reuse the existing public cache bucket
const CACHE_FOLDER = 'gen-images';    // pictures live in lesson-audio/gen-images/
const OPENAI_MODEL = 'gpt-image-2';   // current flagship image model (July 2026)
const IMG_SIZE = '1536x1024';         // landscape, fills the projector frame
const IMG_QUALITY = 'medium';         // bright & clean without paying premium

// ── Picture styles ──────────────────────────────────────────────────────
// 'scene'      lesson illustrations, landscape, full picture with background
// 'kg-colour'  one object for a KG worksheet, bright, on plain white
// 'kg-outline' the same object as a colouring page, outline only
//
// Each style has its own cache folder key, so the same word can exist as both
// a colour picture and an outline without one overwriting the other.
const STYLES = {
  'kg-colour': {
    size: '1024x1024',
    quality: 'medium',
    prefix: 'A single simple picture for a kindergarten worksheet. '
      + 'Flat bright cheerful colours with a thick clean black outline. '
      + 'Exactly ONE object, centred, filling most of the frame. '
      + 'Plain pure white background, no shadow, no floor, no scenery, no border, no frame. '
      + 'No text, no letters, no numbers anywhere. '
      + 'Clear and instantly recognisable to a four year old child. Draw: '
  },
  'kg-outline': {
    size: '1024x1024',
    quality: 'medium',
    prefix: 'A black and white colouring page picture for a young child. '
      + 'Thick bold black outlines only. No colour, no grey, no shading, no hatching. '
      + 'Large simple shapes with plenty of open white space inside to colour in. '
      + 'Exactly ONE object, centred, filling most of the frame. '
      + 'Plain pure white background, no border, no frame. '
      + 'No text, no letters, no numbers anywhere. Draw: '
  }
};

// Locked storybook style so every young-class picture is cheerful and consistent.
const STYLE_PREFIX =
  'A bright, cheerful childrens picture-book illustration in a colourful, friendly cartoon style. '
  + 'Simple clean rounded shapes, warm happy mood, vivid child-friendly colours, soft lighting. '
  + 'When people or places appear, show Indian children and an Indian setting. '
  + 'No text, no letters, no numbers, no words anywhere in the image. '
  + 'Full-frame single scene, no borders, no collage. Scene to draw: ';

// Cache key: style + scene, so changing the style later re-draws cleanly.
function cacheKey(query, context, mode) {
  var m = mode || 'scene';
  var styleLen = STYLES[m] ? STYLES[m].prefix.length : STYLE_PREFIX.length;
  return crypto.createHash('sha256')
    .update('img-v1|' + m + '|' + styleLen + '|'
            + String(query).toLowerCase().trim() + '|'
            + String(context || '').toLowerCase().trim().substring(0, 160))
    .digest('hex').substring(0, 40);
}

// Only our own pages may spend money here. Same check as /api/ai - it stops
// other websites and casual misuse, not somebody determined with curl.
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

function publicUrl(fileName) {
  return 'https://' + SB_HOST + '/storage/v1/object/public/'
         + BUCKET + '/' + CACHE_FOLDER + '/' + fileName;
}

// ── does this picture already exist in the cache? ───────────
function cacheExists(fileName) {
  return new Promise(function (resolve) {
    const opts = {
      hostname: SB_HOST,
      path: '/storage/v1/object/public/' + BUCKET + '/' + CACHE_FOLDER + '/' + fileName,
      method: 'GET',
      headers: { 'Range': 'bytes=0-0' }   // ask for 1 byte — cheap existence check
    };
    const r = https.request(opts, function (resp) {
      resp.resume();
      resolve(resp.statusCode === 200 || resp.statusCode === 206);
    });
    r.on('error', function () { resolve(false); });
    r.end();
  });
}

// ── upload the finished PNG to Supabase Storage ─────────────
function saveImage(pngBuffer, fileName) {
  return new Promise(function (resolve) {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return resolve(false);
    const opts = {
      hostname: SB_HOST,
      path: '/storage/v1/object/' + BUCKET + '/' + CACHE_FOLDER + '/' + fileName,
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Length': pngBuffer.length,
        'x-upsert': 'true'
      }
    };
    const r = https.request(opts, function (res) {
      res.resume();
      res.on('end', function () { resolve(res.statusCode === 200 || res.statusCode === 201); });
    });
    r.on('error', function () { resolve(false); });
    r.write(pngBuffer);
    r.end();
  });
}

// ── ask OpenAI GPT Image 2 to draw the scene ────────────────
function drawImage(prompt, size, quality) {
  return new Promise(function (resolve) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return resolve({ ok: false, note: 'no OPENAI_API_KEY set in Vercel' });
    const payload = JSON.stringify({
      model: OPENAI_MODEL,
      prompt: prompt,
      size: size || IMG_SIZE,
      quality: quality || IMG_QUALITY,
      n: 1
    });
    const opts = {
      hostname: 'api.openai.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const chunks = [];
    const r = https.request(opts, function (res) {
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try {
          const d = JSON.parse(Buffer.concat(chunks).toString());
          if (d && Array.isArray(d.data) && d.data[0] && d.data[0].b64_json) {
            return resolve({ ok: true, b64: d.data[0].b64_json });
          }
          const msg = (d && d.error && d.error.message) ? d.error.message : ('unexpected response (HTTP ' + res.statusCode + ')');
          resolve({ ok: false, note: String(msg).substring(0, 180) });
        } catch (e) {
          resolve({ ok: false, note: 'bad response from image API' });
        }
      });
    });
    r.on('error', function () { resolve({ ok: false, note: 'could not reach image API' }); });
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

  if (!fromOurSite(req)) {
    return res.status(403).json({ images: [], note: 'forbidden' });
  }

  const body = req.body || {};
  const query = String(body.query || '').trim();
  const context = String(body.context || '').trim();
  const mode = STYLES[body.mode] ? body.mode : 'scene';
  const style = STYLES[mode] || null;
  if (query.length < 3) return res.json({ images: [] });

  const fileName = cacheKey(query, context, mode) + '.png';
  const url = publicUrl(fileName);
  const wrap = function (u) { return { images: [{ url: u, title: query, source: 'AI illustration' }] }; };

  try {
    // 1) already drawn before? return instantly.
    console.log('[gen-image] request mode=' + mode + ' key=' + fileName.substring(0, 12));
    if (await cacheExists(fileName)) {
      return res.json(Object.assign(wrap(url), { cached: true }));
    }

    // 2) draw it fresh.
    const prompt = style
      ? (style.prefix + query + (context ? ('. ' + context.substring(0, 220)) : ''))
      : (STYLE_PREFIX + query + (context ? ('. ' + context.substring(0, 220)) : ''));
    console.log('[gen-image] drawing "' + query.substring(0, 60) + '" mode=' + mode);
    const t0 = Date.now();
    const drawn = await drawImage(prompt,
                                  style ? style.size : IMG_SIZE,
                                  style ? style.quality : IMG_QUALITY);
    console.log('[gen-image] draw ' + (drawn.ok ? 'ok' : 'FAILED: ' + drawn.note)
                + ' in ' + Math.round((Date.now() - t0) / 1000) + 's');
    if (!drawn.ok) {
      // Let the front end fall back (to a diagram/photo/text) instead of showing nothing.
      return res.json({ images: [], note: drawn.note || 'draw failed' });
    }

    // 3) save to cache, then return the public URL.
    const png = Buffer.from(drawn.b64, 'base64');
    const saved = await saveImage(png, fileName);
    console.log('[gen-image] save to storage ' + (saved ? 'ok' : 'FAILED')
                + ' (' + Math.round(png.length / 1024) + ' KB) ' + fileName);
    if (!saved) {
      // Returning a URL that points at nothing would look like success and
      // leave a broken picture in the library.
      return res.json({ images: [], note: 'the picture was drawn but could not be saved to storage' });
    }
    return res.json(Object.assign(wrap(url), { cached: false }));
  } catch (e) {
    return res.json({ images: [], note: String(e.message || e).substring(0, 140) });
  }
};

// Image generation can take a while; give the function room on Vercel.
module.exports.config = { maxDuration: 60 };
