// api/story-cache.js
// Saves and loads finished CARTOON STORY lessons in Supabase Storage.
//
// Why this exists: cartoon-story.html asked Claude for a brand-new story on
// every click, then paid OpenAI to draw 4-6 fresh pictures for it. The same
// lesson opened twice cost twice. Saving the finished story server-side means
// the second teacher gets it instantly and free.
//
// Key: title + class + type + language + pasted lesson text + version.
// No school ID — a school with a different book naturally produces a different
// title/text, so it gets its own key. Two schools on the SAME NCERT lesson
// share, which is a bonus, not a clash.
//
// Expiry: 10 months (300 days). An older story is reported as "not found", so
// the page writes a fresh one straight over it. No cron job needed.
//
// Storage: bucket "lesson-audio", folder "story-cache/"
//          (same bucket as the voice, math-solution and concept caches).
//
// This file is SEPARATE from concept-cache.js and does not touch it.

const https = require('https');
const crypto = require('crypto');

const SUPA_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const BUCKET = 'lesson-audio';
const FOLDER = 'story-cache';
const MAX_AGE_DAYS = 300;              // 10 months

// Fingerprint the story. Whitespace and letter-case differences must never
// create duplicate files, or the cache silently stops working.
function storyKey(title, cls, type, lang, text, ver) {
  const norm = function (v, fallback) {
    return String(v || fallback || '').replace(/\s+/g, ' ').trim().toLowerCase();
  };
  // Pasted lesson text can be long — fingerprint it instead of storing it.
  const textPrint = crypto.createHash('sha256')
    .update(norm(text, '')).digest('hex').slice(0, 16);
  const combined =
      norm(title)
    + '|' + norm(cls)
    + '|' + norm(type, 'story')
    + '|' + norm(lang, 'en')
    + '|' + textPrint
    + '|' + norm(ver, 'v1');
  const hash = crypto.createHash('sha256').update(combined).digest('hex').slice(0, 40);
  return FOLDER + '/' + hash + '.json';
}

// How old is a saved story, in days? Returns a huge number if unreadable, so a
// bad timestamp is always treated as expired rather than served forever.
function ageInDays(savedAt) {
  const t = Date.parse(savedAt || '');
  if (!t || isNaN(t)) return 99999;
  return (Date.now() - t) / 86400000;
}

// Fetch a saved story. Returns the parsed object on hit, null on miss or on
// ANY error — a storage problem must never surface as a failure to the class.
function fetchStory(objectPath, supaKey) {
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

// Save a story. Resolves true/false — never throws, so a failed save cannot
// break a running class.
function saveStory(objectPath, supaKey, storyObj) {
  return new Promise((resolve) => {
    let body;
    try {
      body = Buffer.from(JSON.stringify(storyObj), 'utf8');
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
    const b = req.body || {};
    const action = b.action;
    const title = b.title;
    const cls = b.cls;
    const type = b.type;
    const lang = b.lang;
    const text = b.text;
    const ver = b.ver;

    if (!title) {
      return res.status(400).json({ error: 'Missing title' });
    }

    const supaKey = process.env.SUPABASE_SECRET_KEY;
    if (!supaKey) {
      // No storage key configured — the class still runs, just without saving.
      return res.status(200).json({ found: false, saved: false, reason: 'storage not configured' });
    }

    const objectPath = storyKey(title, cls, type, lang, text, ver);

    if (action === 'get') {
      const saved = await fetchStory(objectPath, supaKey);
      if (saved && Array.isArray(saved.scenes) && saved.scenes.length > 0) {
        const age = ageInDays(saved.savedAt);
        if (age > MAX_AGE_DAYS) {
          // Older than 10 months — pretend it is not there so a fresh story is
          // written straight over it on the next save.
          return res.status(200).json({ found: false, expired: true, ageDays: Math.round(age) });
        }
        return res.status(200).json({
          found: true,
          cached: true,
          ageDays: Math.round(age),
          title: saved.title || '',
          type: saved.type || 'story',
          moral: saved.moral || '',
          charSheet: saved.charSheet || '',
          scenes: saved.scenes,
          images: Array.isArray(saved.images) ? saved.images : []
        });
      }
      return res.status(200).json({ found: false });
    }

    if (action === 'save') {
      const scenes = b.scenes;
      if (!Array.isArray(scenes) || scenes.length === 0) {
        return res.status(400).json({ error: 'Invalid scenes' });
      }
      const ok = await saveStory(objectPath, supaKey, {
        title: String(b.storyTitle || title),
        type: String(type || 'story'),
        cls: String(cls || ''),
        lang: String(lang || 'en'),
        moral: String(b.moral || ''),
        charSheet: String(b.charSheet || ''),
        scenes: scenes,
        images: Array.isArray(b.images) ? b.images : [],
        ver: String(ver || 'v1'),
        savedAt: new Date().toISOString()
      });
      return res.status(200).json({ saved: ok });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('[story-cache] Error:', err);
    return res.status(500).json({ error: err.message || 'story-cache failed' });
  }
};
