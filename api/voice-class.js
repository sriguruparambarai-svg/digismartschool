// api/voice-class.js
// ElevenLabs TTS — class-based voice mapping for DigiSmartSchool
// Teacher-quality voices selected for educational delivery (not audiobook narration)

const https = require('https');
const crypto = require('crypto');

// ─── AUDIO CACHE (Supabase Storage) ────────────────────────
// Generated audio is saved to bucket 'lesson-audio', folder 'class-voice/'.
// Same text + same voice = same file, so replays cost zero ElevenLabs credits.
// If storage is ever unavailable we silently fall back to normal generation.
const SUPA_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const AUDIO_BUCKET = 'lesson-audio';
const AUDIO_FOLDER = 'class-voice';

function audioKey(voiceId, speechText) {
  const hash = crypto.createHash('sha256')
    .update(voiceId + '|' + speechText)
    .digest('hex')
    .slice(0, 40);
  return AUDIO_FOLDER + '/' + hash + '.mp3';
}

// Fetch previously saved audio. Returns Buffer on hit, null on miss/error (never throws).
function fetchCachedAudio(objectPath, supaKey) {
  return new Promise((resolve) => {
    const opts = {
      hostname: SUPA_HOST,
      path: '/storage/v1/object/' + AUDIO_BUCKET + '/' + objectPath,
      method: 'GET',
      headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey }
    };
    const r = https.request(opts, (response) => {
      if (response.statusCode !== 200) { response.resume(); return resolve(null); }
      const chunks = [];
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(null));
    });
    r.on('error', () => resolve(null));
    r.end();
  });
}

// Save generated audio for future replays. Never throws — a failed save can't break playback.
function saveCachedAudio(objectPath, supaKey, audioBuffer) {
  return new Promise((resolve) => {
    const opts = {
      hostname: SUPA_HOST,
      path: '/storage/v1/object/' + AUDIO_BUCKET + '/' + objectPath,
      method: 'POST',
      headers: {
        'apikey': supaKey,
        'Authorization': 'Bearer ' + supaKey,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true',
        'Content-Length': audioBuffer.length
      }
    };
    const r = https.request(opts, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode === 200));
    });
    r.on('error', () => resolve(false));
    r.write(audioBuffer);
    r.end();
  });
}

// ─── VOICE MAPPING BY CLASS GROUP ──────────────────────────
// All these are ElevenLabs official library voices (free to use with API)
const VOICE_MAP = {
  // PreKG–Class 3 → Tripti — Warm & Sweet Training Voice (from Kayal's own ElevenLabs account)
  // If this voice ever goes missing, the safety net auto-switches to Sarah
  'PreKG':   'X5RWySWhCXiGdP9YIKck',
  'LKG':     'X5RWySWhCXiGdP9YIKck',
  'UKG':     'X5RWySWhCXiGdP9YIKck',
  'Class 1': 'X5RWySWhCXiGdP9YIKck',
  'Class 2': 'X5RWySWhCXiGdP9YIKck',
  'Class 3': 'X5RWySWhCXiGdP9YIKck',

  // Class 4–7 → Monika Sogam - Deep and Clear (from Kayal's own ElevenLabs account)
  // If this voice ever goes missing, the safety net below auto-switches to Sarah
  'Class 4': 'Ms9OTvWb99V6DwRHZn6q',
  'Class 5': 'Ms9OTvWb99V6DwRHZn6q',
  'Class 6': 'Ms9OTvWb99V6DwRHZn6q',
  'Class 7': 'Ms9OTvWb99V6DwRHZn6q',

  // Tamil (any class) → Sarah — multilingual, pronounces Tamil script correctly
  // Change this ONE line to try a different Tamil voice later
  'Tamil': 'EXAVITQu4vr4xnSDxMaL',

  // Class 8–10 → Brian (calm confident American male, clear teacher tone)
  'Class 8':  'nPczCjzI2devNBz1zQrb',
  'Class 9':  'nPczCjzI2devNBz1zQrb',
  'Class 10': 'nPczCjzI2devNBz1zQrb',

  // Class 11–12 → Daniel (British male, authoritative but kind — senior teacher)
  'Class 11': 'onwK4e9ZLuTAKqWW03F9',
  'Class 12': 'onwK4e9ZLuTAKqWW03F9'
};

// Fallback if class not recognized — Sarah (built-in, always exists)
const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';
// Emergency voice if the mapped voice is ever missing from the account
const SAFE_VOICE = 'EXAVITQu4vr4xnSDxMaL';

// ─── TEXT CLEANING ─────────────────────────────────────────
function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[Page\s+\d+\]/gi, '')        // Remove [Page N] markers
    .replace(/♦/g, '')                       // Remove ♦ symbols
    .replace(/[\u2022\u2023\u2043\u200D\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2900-\u297F\u2B00-\u2BFF\uFE00-\uFE0F\uE000-\uF8FF]/g, ' ')   // icons & symbols: arrows, shapes, dingbats, technical (▶ ✦ ⏵ ► • etc.)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ' ')  // ALL emojis (🔍 🔬 ✨ 🌱 etc. — every character stored as a surrogate pair)
    .replace(/\*+/g, '')                     // Remove asterisks (markdown)
    .replace(/#/g, '')                       // Remove hashes
    .replace(/\.{3,}/g, '. ')                // Replace ... with single period
    .replace(/\s+/g, ' ')                    // Normalize whitespace
    .trim();
}

// ─── TEACHER PAUSES ────────────────────────────────────────
// Inserts invisible ElevenLabs <break> tags after punctuation so the
// voice pauses like a teacher reading aloud, instead of rushing.
// Only fires when a SPACE follows the punctuation (or end of text),
// so decimals like "3.5" and abbreviations like "e.g." stay untouched.
function addTeacherPauses(text) {
  return text
    // full stop / question / exclamation → longer pause
    .replace(/([.!?])(\s+|$)/g, '$1 <break time="0.7s" /> ')
    // comma → short breath
    .replace(/(,)(\s+|$)/g, '$1 <break time="0.3s" /> ')
    // semicolon / colon → medium pause
    .replace(/([;:])(\s+|$)/g, '$1 <break time="0.5s" /> ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── MAIN HANDLER ──────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, cls } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Missing text' });
    }

    const cleanedText = cleanText(text);
    if (!cleanedText) {
      return res.status(400).json({ error: 'Text empty after cleaning' });
    }

    // Add teacher-style pauses at commas and full stops
    const speechText = addTeacherPauses(cleanedText);

    // Pick voice based on class
    const voiceId = VOICE_MAP[cls] || DEFAULT_VOICE;

    // ElevenLabs API key from Vercel env
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    // ── CACHE CHECK: if this exact line was generated before, play the saved file ──
    const supaKey = process.env.SUPABASE_SECRET_KEY;
    if (supaKey) {
      const cached = await fetchCachedAudio(audioKey(voiceId, speechText), supaKey);
      if (cached && cached.length > 0) {
        return res.status(200).json({
          audio_b64: cached.toString('base64'),
          voiceId: voiceId,
          cls: cls || 'default',
          cached: true
        });
      }
    }
    // ── CACHE MISS: generate as normal below ──

    // Build request body for ElevenLabs
    const payload = JSON.stringify({
      text: speechText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.70,         // was 0.55 — steadier, calmer teacher reading
        similarity_boost: 0.75,  // Strong voice character
        style: 0.15,             // was 0.30 — less rushed / less "announcer"
        use_speaker_boost: true
      }
    });

    // Call ElevenLabs API (as a reusable helper so we can retry with a safe voice)
    function callEleven(vid) {
      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.elevenlabs.io',
          path: `/v1/text-to-speech/${vid}`,
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        const req2 = https.request(options, (response) => {
          if (response.statusCode !== 200) {
            let errBody = '';
            response.on('data', (chunk) => { errBody += chunk; });
            response.on('end', () => {
              reject(new Error('ElevenLabs error ' + response.statusCode + ': ' + errBody));
            });
            return;
          }
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        });

        req2.on('error', reject);
        req2.write(payload);
        req2.end();
      });
    }

    let usedVoice = voiceId;
    let audioBuffer;
    try {
      audioBuffer = await callEleven(voiceId);
    } catch (firstErr) {
      // 🛟 Safety net: if this voice is missing from the account, retry with the built-in safe voice
      if (String(firstErr.message).indexOf('voice_not_found') !== -1 && voiceId !== SAFE_VOICE) {
        console.warn('[voice-class] Voice ' + voiceId + ' missing — retrying with safe voice');
        usedVoice = SAFE_VOICE;
        audioBuffer = await callEleven(SAFE_VOICE);
      } else {
        throw firstErr;
      }
    }

    // ── SAVE TO CACHE so the next play of this line is free ──
    // Keyed by the voice that ACTUALLY spoke (usedVoice), so a safety-net
    // recording is never mistaken for the proper class voice.
    if (supaKey) {
      await saveCachedAudio(audioKey(usedVoice, speechText), supaKey, audioBuffer);
    }

    // Return base64 audio (field name matches existing client code)
    const audioBase64 = audioBuffer.toString('base64');
    return res.status(200).json({
      audio_b64: audioBase64,
      voiceId: usedVoice,
      cls: cls || 'default',
      cached: false
    });

  } catch (err) {
    console.error('[voice-class] Error:', err);
    return res.status(500).json({ error: err.message || 'Voice generation failed' });
  }
};


// ─── TAMIL AUTO-DETECT (additive wrapper) ──────────────────
// If the text contains Tamil script, route it to the 'Tamil' voice (Sarah)
// instead of the class voice. English lessons are completely unaffected.
// Caching still works: Tamil clips are keyed by Sarah's voice ID separately.
const _classHandler = module.exports;
module.exports = async (req, res) => {
  try {
    if (req.body && req.body.text && /[\u0B80-\u0BFF]/.test(String(req.body.text))) {
      req.body.cls = 'Tamil';
    }
  } catch (e) { /* never block normal flow */ }
  return _classHandler(req, res);
};
