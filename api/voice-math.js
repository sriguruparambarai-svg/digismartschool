// api/voice-math.js
// DEDICATED voice API for Math Class only
// English mode: Monika Sogam (Indian female teacher voice)
// Tamil-mix mode: Sarah (multilingual voice good with Tamil script)
// This is SEPARATE from voice-class.js so it doesn't affect Teaching Mode voices.
//
// AUDIO CACHING (added):
// Generated audio is saved to Supabase Storage (bucket: lesson-audio, folder: math-voice/).
// On every request we first check storage — if the same text+voice was generated
// before, we return the saved file (zero ElevenLabs cost). If storage is ever
// unavailable, we fall back to normal generation, so voice never breaks.

const https = require('https');
const crypto = require('crypto');

// Voice IDs
const MATH_VOICE_ENGLISH = '5lf6Bj1bjbGRTV68afJj';  // Monika Sogam - clear Indian English
const MATH_VOICE_TAMIL   = 'EXAVITQu4vr4xnSDxMaL';  // Sarah - multilingual, good with Tamil

// Supabase Storage (same project + env key as api/auth.js)
const SUPA_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const AUDIO_BUCKET = 'lesson-audio';
const AUDIO_FOLDER = 'math-voice';

function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[Page\s+\d+\]/gi, '')
    .replace(/♦/g, '')
    .replace(/\*+/g, '')
    .replace(/#/g, '')
    .replace(/\.{3,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fingerprint: same text + same voice = same file name
function audioKey(voiceId, cleanedText) {
  const hash = crypto.createHash('sha256')
    .update(voiceId + '|' + cleanedText)
    .digest('hex')
    .slice(0, 40);
  return AUDIO_FOLDER + '/' + hash + '.mp3';
}

// Try to fetch previously saved audio from Supabase Storage.
// Returns a Buffer on hit, or null on miss / any error (never throws).
function fetchCachedAudio(objectPath, supaKey) {
  return new Promise((resolve) => {
    const opts = {
      hostname: SUPA_HOST,
      path: '/storage/v1/object/' + AUDIO_BUCKET + '/' + objectPath,
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
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(null));
    });
    r.on('error', () => resolve(null));
    r.end();
  });
}

// Save generated audio to Supabase Storage for future replays.
// Resolves true/false — never throws, so a failed save can't break playback.
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
      response.resume(); // drain
      response.on('end', () => resolve(response.statusCode === 200));
    });
    r.on('error', () => resolve(false));
    r.write(audioBuffer);
    r.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, lang } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Missing text' });
    }

    const cleanedText = cleanText(text);
    if (!cleanedText) {
      return res.status(400).json({ error: 'Text empty after cleaning' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    // Pick voice based on language mode
    const isTamilMix = (lang === 'mix' || lang === 'ta');
    const voiceId = isTamilMix ? MATH_VOICE_TAMIL : MATH_VOICE_ENGLISH;

    // ---- CACHE CHECK: play saved audio if we've generated this line before ----
    const supaKey = process.env.SUPABASE_SECRET_KEY;
    const objectPath = audioKey(voiceId, cleanedText);

    if (supaKey) {
      const cached = await fetchCachedAudio(objectPath, supaKey);
      if (cached && cached.length > 0) {
        return res.status(200).json({
          audio_b64: cached.toString('base64'),
          voiceId: voiceId,
          lang: lang || 'en',
          cached: true
        });
      }
    }
    // ---- CACHE MISS: generate as normal below ----

    // Voice settings differ by language for optimal delivery
    const voiceSettings = isTamilMix
      ? {
          // Tamil-mix: slightly more expressive to handle script switching
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true
        }
      : {
          // English: intellectual professor tone (focused, not expressive)
          stability: 0.60,
          similarity_boost: 0.78,
          style: 0.25,
          use_speaker_boost: true
        };

    const payload = JSON.stringify({
      text: cleanedText,
      model_id: 'eleven_multilingual_v2',  // supports Tamil + English
      voice_settings: voiceSettings
    });

    const audioBuffer = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voiceId}`,
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

    // ---- SAVE TO CACHE so the next play of this line is free ----
    if (supaKey) {
      await saveCachedAudio(objectPath, supaKey, audioBuffer);
    }

    const audioBase64 = audioBuffer.toString('base64');
    return res.status(200).json({
      audio_b64: audioBase64,
      voiceId: voiceId,
      lang: lang || 'en',
      cached: false
    });

  } catch (err) {
    console.error('[voice-math] Error:', err);
    return res.status(500).json({ error: err.message || 'Voice generation failed' });
  }
};
