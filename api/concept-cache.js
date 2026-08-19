// api/concept-cache.js
// Saves and loads AI-written CONCEPT CLASS narration in Supabase Storage.
//
// Why this exists: narration used to be saved in localStorage, which lives in
// ONE browser on ONE device. Every classroom, every device and every school
// regenerated the same lesson and paid for it again — and because AI wording is
// never identical twice, the ElevenLabs audio cache (keyed on the exact words)
// missed every time too.
//
// Saving server-side makes the words identical everywhere, so the existing
// voice cache in api/voice-class.js finally starts hitting.
//
// Key: board + class + subject + topic + language + version.
// No school ID — narration is shared across every school by design.
// No expiry — bump the version from the page when you want fresh wording.
//
// Storage: bucket "lesson-audio", folder "concept-narration/"
//          (same bucket as the voice and math-solution caches).
//
// This file is SEPARATE from Teaching Mode and from math-class.html.

const https = require('https');
const crypto = require('crypto');

const SUPA_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const BUCKET = 'lesson-audio';
const FOLDER = 'concept-narration';

// Fingerprint the lesson. Whitespace and letter-case differences must never
// create duplicate files, or the cache silently stops working.
function narrationKey(board, cls, subject, topic, lang, ver) {
  const norm = function (v, fallback) {
    return String(v || fallback || '').replace(/\s+/g, ' ').trim().toLowerCase();
  };
  const combined =
      norm(board, 'ncert')
    + '|' + norm(cls)
    + '|' + norm(subject, 'maths')
    + '|' + norm(topic)
    + '|' + norm(lang, 'english')
    + '|' + norm(ver, 'v1');
  const hash = crypto.createHash('sha256').update(combined).digest('hex').slice(0, 40);
  return FOLDER + '/' + hash + '.json';
}

// Fetch saved narration. Returns the parsed object on hit, null on miss or on
// ANY error — a storage problem must never surface as a failure to the class.
function fetchNarration(objectPath, supaKey) {
  return new Promise((resolve) => {
    const opts = {
      hostname: SUPA_HOST,
      path: '/storage/v1/object/' + BUCKET + '/' + objectPath,
      method: 'GET',
      headers: {
        'apikey': supaKey,
        'Authorization': 'Bearer ' + supaKey
      }
    };
    const r = https.request(opts, (response) => {
      if (response.statusCode !== 200) {
        response.resume(); // drain
        return resolve(null);
      }
      const chunks = [];
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          resolve(null);
        }
      });
      response.on('error', () => resolve(null));
    });
    r.on('error', () => resolve(null));
    r.end();
  });
}

// Save narration. Resolves true/false — never throws, so a failed save cannot
// break a running class.
function saveNarration(objectPath, supaKey, narrationObj) {
  return new Promise((resolve) => {
    let body;
    try {
      body = Buffer.from(JSON.stringify(narrationObj), 'utf8');
    } catch (e) {
      return resolve(false);
    }
    const opts = {
      hostname: SUPA_HOST,
      path: '/storage/v1/object/' + BUCKET + '/' + objectPath,
      method: 'POST',
      headers: {
        'apikey': supaKey,
        'Authorization': 'Bearer ' + supaKey,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
        'Content-Length': body.length
      }
    };
    const r = https.request(opts, (response) => {
      response.resume(); // drain
      response.on('end', () => resolve(response.statusCode === 200 || response.statusCode === 201));
    });
    r.on('error', () => resolve(false));
    r.write(body);
    r.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, board, cls, subject, topic, lang, ver, narration } = req.body || {};

    if (!cls || !topic) {
      return res.status(400).json({ error: 'Missing class or topic' });
    }

    const supaKey = process.env.SUPABASE_SECRET_KEY;
    if (!supaKey) {
      // No storage key configured — the class still runs, just without saving.
      return res.status(200).json({ found: false, saved: false, reason: 'storage not configured' });
    }

    const objectPath = narrationKey(board, cls, subject, topic, lang, ver);

    if (action === 'get') {
      const saved = await fetchNarration(objectPath, supaKey);
      if (saved && saved.map && typeof saved.map === 'object' && Object.keys(saved.map).length > 0) {
        return res.status(200).json({ found: true, map: saved.map, cached: true });
      }
      return res.status(200).json({ found: false });
    }

    if (action === 'save') {
      if (!narration || typeof narration !== 'object' || Object.keys(narration).length === 0) {
        return res.status(400).json({ error: 'Invalid narration' });
      }
      const ok = await saveNarration(objectPath, supaKey, {
        map: narration,
        cls: String(cls),
        topic: String(topic),
        lang: String(lang || 'english'),
        ver: String(ver || 'v1'),
        savedAt: new Date().toISOString()
      });
      return res.status(200).json({ saved: ok });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('[concept-cache] Error:', err);
    return res.status(500).json({ error: err.message || 'concept-cache failed' });
  }
};
