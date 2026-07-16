// api/math-solutions.js
// Saves and loads COMPLETE Math Class solutions (the steps JSON) in Supabase Storage.
// Same question + class + language = same saved class → instant replay, zero AI cost,
// and every voice line matches the audio already saved by api/voice-math.js.
//
// Storage: bucket "lesson-audio", folder "math-solutions/" (same bucket as voice cache).
// This file is SEPARATE from Teaching Mode — used only by math-class.html.

const https = require('https');
const crypto = require('crypto');

const SUPA_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const BUCKET = 'lesson-audio';
const FOLDER = 'math-solutions';

// Fingerprint: same question + class + language = same file name.
// Whitespace and letter-case differences in the pasted question do not
// create duplicate files.
function solutionKey(question, cls, lang) {
  const norm = String(question || '').replace(/\s+/g, ' ').trim().toLowerCase()
    + '|' + String(cls || '').replace(/\s+/g, ' ').trim().toLowerCase()
    + '|' + String(lang || 'en').trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(norm).digest('hex').slice(0, 40);
  return FOLDER + '/' + hash + '.json';
}

// Fetch a saved solution. Returns parsed object on hit, null on miss / any error.
function fetchSolution(objectPath, supaKey) {
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

// Save a solution JSON. Resolves true/false — never throws, so a failed save
// can never break the class.
function saveSolution(objectPath, supaKey, solutionObj) {
  return new Promise((resolve) => {
    let body;
    try {
      body = Buffer.from(JSON.stringify(solutionObj), 'utf8');
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
    const { action, question, cls, lang, solution } = req.body || {};

    if (!question || String(question).trim().length < 5) {
      return res.status(400).json({ error: 'Missing question' });
    }

    const supaKey = process.env.SUPABASE_SECRET_KEY;
    if (!supaKey) {
      // No storage key configured — class still works, just without saving.
      return res.status(200).json({ found: false, saved: false, reason: 'storage not configured' });
    }

    const objectPath = solutionKey(question, cls, lang);

    if (action === 'get') {
      const saved = await fetchSolution(objectPath, supaKey);
      if (saved && Array.isArray(saved.steps) && saved.steps.length > 0) {
        return res.status(200).json({ found: true, solution: saved });
      }
      return res.status(200).json({ found: false });
    }

    if (action === 'save') {
      if (!solution || !Array.isArray(solution.steps) || solution.steps.length === 0) {
        return res.status(400).json({ error: 'Invalid solution' });
      }
      const ok = await saveSolution(objectPath, supaKey, solution);
      return res.status(200).json({ saved: ok });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('[math-solutions] Error:', err);
    return res.status(500).json({ error: err.message || 'math-solutions failed' });
  }
};
