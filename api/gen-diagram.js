// /api/gen-diagram.js — 3D-style science DIAGRAM generator (replaces flat SVG diagrams)
//
// Receives { topic, band } →
//   1. CACHE: if this diagram was drawn before for this age band, return it instantly
//   2. DRAW:  otherwise ask OpenAI GPT Image 2 for a clean 3D model (NO text labels),
//             save the PNG to Supabase Storage, and return its public URL.
//
// Same response shape as /api/gen-image so the front end treats it as a sibling:
//   POST { topic:"human_skeletal", band:"junior"|"senior" }
//     -> { images:[{url,title,source}] }
//
// The cache key is topic + band ONLY (no lesson text), so an image drawn by ONE
// school is reused forever by EVERY school. Each topic costs at most two draws
// (one junior, one senior) across the whole platform.
//
// Env vars (already set in Vercel, same ones gen-image uses):
//   OPENAI_API_KEY       — OpenAI developer key (server-side only)
//   SUPABASE_SECRET_KEY  — Supabase service key (same one the audio/image cache uses)

const https = require('https');
const crypto = require('crypto');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const BUCKET = 'lesson-audio';          // reuse the existing public cache bucket
const CACHE_FOLDER = 'diagram-images';  // diagrams live in lesson-audio/diagram-images/
const OPENAI_MODEL = 'gpt-image-2';     // same model gen-image uses
const IMG_SIZE = '1024x1024';           // square suits most science models
const IMG_QUALITY = 'medium';           // clean without paying premium

// Plain-English subject for each diagram key. The front end sends only the key;
// the real description lives here so the cache stays stable across all lessons.
const DIAGRAM_SUBJECTS = {
  heart:            'the human heart, showing its chambers and the main blood vessels',
  plant:            'a single plant cell, showing the cell wall, nucleus and green chloroplasts',
  plant_anatomy:    'a whole flowering plant, showing its roots, stem, leaves and a flower',
  photosynthesis:   'a green plant making its food from sunlight, water and carbon dioxide and giving out oxygen',
  food_chain:       'a simple food chain, with plants and animals linked by who eats whom',
  water_cycle:      'the water cycle: water evaporating, forming clouds, falling as rain and flowing back to the sea',
  cell_division:    'one cell dividing neatly into two cells',
  dna_structure:    'the twisted ladder shape of a DNA double helix',
  human_digestive:  'the human digestive system, from mouth and stomach down through the intestines',
  human_respiratory:'the human respiratory system, the two lungs and the airway',
  human_circulatory:'the human circulatory system, the heart with blood vessels reaching the body',
  human_nervous:    'the human nervous system, the brain, spinal cord and branching nerves',
  human_skeletal:   'the full human skeleton, the whole system of bones',
  human_eye:        'a cut-through cross-section of the human eye, showing its inner parts',
  solar_system:     'the solar system, the sun in the centre with the planets orbiting around it',
  atom_structure:   'the structure of an atom, a central nucleus with electrons moving around it',
  magnet_field:     'a bar magnet with the curved lines of its magnetic field around it',
  electric_circuit: 'a simple electric circuit: a battery, wires and a glowing bulb',
  states_of_matter: 'the three states of matter side by side: a solid, a liquid and a gas',
  layers_earth:     'the Earth cut open to show its layers: crust, mantle, outer core and inner core',
  fraction_visual:  'fractions shown as coloured parts of a whole, like slices of a round pie',
  pythagoras:       'a right-angled triangle with a square drawn on each of its three sides'
};

// Two locked styles — one per age band. NO text baked into any image.
const STYLE_COMMON =
  ' Clean educational look, a single clear subject centred in the frame, '
  + 'plain simple background, soft even lighting, no clutter. '
  + 'Absolutely no text, no letters, no numbers, no labels, no captions and no arrows with words '
  + 'anywhere in the image. Full frame, no borders, no collage, no multiple panels. Subject to show: ';

const STYLE_JUNIOR =
  'A friendly, colourful 3D model illustration made for young school children (kindergarten to class 5). '
  + 'Soft rounded shapes, bright cheerful child-friendly colours, simple and approachable, gentle and not scary.'
  + STYLE_COMMON;

const STYLE_SENIOR =
  'A realistic, detailed 3D scientific model illustration made for senior school students (class 6 to class 12). '
  + 'Accurate proportions, natural surfaces and textures, proper depth and shading, a serious textbook-quality look.'
  + STYLE_COMMON;

function styleFor(band) {
  return (band === 'senior') ? STYLE_SENIOR : STYLE_JUNIOR;
}

function subjectFor(topic) {
  if (DIAGRAM_SUBJECTS[topic]) return DIAGRAM_SUBJECTS[topic];
  // Unknown key: fall back to the key itself as words (e.g. "food_web" -> "food web").
  return String(topic).replace(/_/g, ' ').trim();
}

// Cache name: style version + topic + band only. Stable => shared by every school.
function cacheKey(topic, band) {
  return crypto.createHash('sha256')
    .update('dia-v1|' + String(topic).toLowerCase().trim() + '|' + band)
    .digest('hex').substring(0, 40);
}

function publicUrl(fileName) {
  return 'https://' + SB_HOST + '/storage/v1/object/public/'
         + BUCKET + '/' + CACHE_FOLDER + '/' + fileName;
}

// ── does this diagram already exist in the cache? ───────────
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

// ── ask OpenAI GPT Image 2 to draw the diagram ──────────────
function drawImage(prompt) {
  return new Promise(function (resolve) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return resolve({ ok: false, note: 'no OPENAI_API_KEY set in Vercel' });
    const payload = JSON.stringify({
      model: OPENAI_MODEL,
      prompt: prompt,
      size: IMG_SIZE,
      quality: IMG_QUALITY,
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

  const body = req.body || {};
  const topic = String(body.topic || '').toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
  const band = (String(body.band || '').toLowerCase() === 'senior') ? 'senior' : 'junior';
  if (topic.length < 2) return res.json({ images: [] });

  const fileName = cacheKey(topic, band) + '.png';
  const url = publicUrl(fileName);
  const wrap = function (u) { return { images: [{ url: u, title: topic, source: 'AI diagram' }] }; };

  try {
    // 1) already drawn before for this band? return instantly.
    if (await cacheExists(fileName)) {
      return res.json(Object.assign(wrap(url), { cached: true }));
    }

    // 2) draw it fresh in the right style for the age band.
    const prompt = styleFor(band) + subjectFor(topic) + '.';
    const drawn = await drawImage(prompt);
    if (!drawn.ok) {
      // Let the front end fall back to a clean text slide instead of showing nothing.
      return res.json({ images: [], note: drawn.note || 'draw failed' });
    }

    // 3) save to cache, then return the public URL.
    const png = Buffer.from(drawn.b64, 'base64');
    await saveImage(png, fileName);
    return res.json(Object.assign(wrap(url), { cached: false }));
  } catch (e) {
    return res.json({ images: [], note: String(e.message || e).substring(0, 140) });
  }
};

// Image generation can take a while; give the function room on Vercel.
module.exports.config = { maxDuration: 60 };
