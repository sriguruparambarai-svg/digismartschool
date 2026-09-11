// api/voice-story.js
// ElevenLabs TTS — STORY NARRATION voice for the Storybook (cartoon-story.html)
//
// Why this is separate from voice-class.js:
//   voice-class.js is deliberately tuned like a teacher reading a lesson —
//   steady, calm, low style, even pauses. Good for teaching, flat for a story.
//   This one is tuned like a storyteller — more expression, wider emotion,
//   longer dramatic pauses at full stops, and a proper pause on "..."
//
// Nothing else in the app uses this file, so changing it can never affect a lesson.

const https = require('https');
const crypto = require('crypto');

// ─── AUDIO CACHE (Supabase Storage) ────────────────────────
// Saved to bucket 'lesson-audio', folder 'story-voice/' — a SEPARATE folder
// from the class voice, so the same sentence can exist in both styles.
const SUPA_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const AUDIO_BUCKET = 'lesson-audio';
const AUDIO_FOLDER = 'story-voice';

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

// Save generated audio for future replays. Never throws.
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

// ─── NARRATOR VOICES ───────────────────────────────────────
// CHANGE THESE TWO LINES to swap the storyteller. Nothing else needs editing.
//
// English  → George: warm, unhurried British narrator. The classic storybook voice.
// Tamil    → Sarah:  multilingual, pronounces Tamil script correctly.
//                    (Same voice the lessons already use for Tamil, so it is
//                     proven working in this account.)
//
// Other library voices worth trying for English narration:
//   Sarah     EXAVITQu4vr4xnSDxMaL   (female, gentle — safest, already in use)
//   Daniel    onwK4e9ZLuTAKqWW03F9   (male, deeper, more formal)
//   Charlotte XB0fDUnXU5powFXDhCwa   (female, soft and expressive)
const NARRATOR = {
  en: 'JBFqnCBsd6RMkjVDRZzb',
  ta: 'EXAVITQu4vr4xnSDxMaL'
};

// Used if the language is unrecognised, and as the emergency voice if the
// chosen narrator is ever missing from the ElevenLabs account.
const SAFE_VOICE = 'EXAVITQu4vr4xnSDxMaL';

// ─── TEXT CLEANING ─────────────────────────────────────────
// Same cleaning as the class voice, so stray symbols are never read aloud.
function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[Page\s+\d+\]/gi, '')
    .replace(/♦/g, '')
    .replace(/[\u2022\u2023\u2043\u200D\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2900-\u297F\u2B00-\u2BFF\uFE00-\uFE0F\uE000-\uF8FF]/g, ' ')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ' ')   // all emojis
    .replace(/\*+/g, '')
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── STORYTELLER PAUSES ────────────────────────────────────
// Longer than the teacher pauses, because a story needs room to land.
// "..." becomes a real dramatic pause instead of being flattened to a full stop.
// Only fires when a SPACE follows the punctuation (or end of text), so
// decimals like "3.5" and abbreviations like "e.g." stay untouched.
function addStoryPauses(text) {
  return text
    // ellipsis first — the longest pause in storytelling
    .replace(/\.{3,}/g, ' <break time="1.2s" /> ')
    // dash aside — a beat before the turn
    .replace(/\s[—–-]\s/g, ' <break time="0.5s" /> ')
    // full stop / question / exclamation → long pause, end of a beat
    .replace(/([.!?])(\s+|$)/g, '$1 <break time="0.9s" /> ')
    // comma → short breath
    .replace(/(,)(\s+|$)/g, '$1 <break time="0.35s" /> ')
    // semicolon / colon → medium, often before speech
    .replace(/([;:])(\s+|$)/g, '$1 <break time="0.6s" /> ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── MAIN HANDLER ──────────────────────────────────────────
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

    const speechText = addStoryPauses(cleanedText);
    const useLang = (lang === 'ta') ? 'ta' : 'en';
    const voiceId = NARRATOR[useLang] || SAFE_VOICE;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    // ── CACHE CHECK: a replayed scene costs zero credits ──
    const supaKey = process.env.SUPABASE_SECRET_KEY;
    if (supaKey) {
      const cached = await fetchCachedAudio(audioKey(voiceId, speechText), supaKey);
      if (cached && cached.length > 0) {
        return res.status(200).json({
          audio_b64: cached.toString('base64'),
          voiceId: voiceId,
          lang: useLang,
          cached: true
        });
      }
    }

    // ── STORYTELLER SETTINGS ──
    // Lower stability than the class voice so the delivery rises and falls with
    // the story instead of staying level. Higher style for character and drama.
    const payload = JSON.stringify({
      text: speechText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.45,          // class voice uses 0.70 — this varies more, for emotion
        similarity_boost: 0.80,   // hold the narrator's character through the variation
        style: 0.55,              // class voice uses 0.15 — this performs the story
        use_speaker_boost: true
      }
    });

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
      // 🛟 Safety net: if the narrator voice is not in this account, use Sarah.
      // The response reports which voice actually spoke, so this is never silent.
      if (String(firstErr.message).indexOf('voice_not_found') !== -1 && voiceId !== SAFE_VOICE) {
        console.warn('[voice-story] Narrator ' + voiceId + ' missing — using safe voice');
        usedVoice = SAFE_VOICE;
        audioBuffer = await callEleven(SAFE_VOICE);
      } else {
        throw firstErr;
      }
    }

    if (supaKey) {
      await saveCachedAudio(audioKey(usedVoice, speechText), supaKey, audioBuffer);
    }

    return res.status(200).json({
      audio_b64: audioBuffer.toString('base64'),
      voiceId: usedVoice,
      lang: useLang,
      cached: false
    });

  } catch (err) {
    console.error('[voice-story] ' + (err && err.message));
    return res.status(500).json({ error: 'Narration failed: ' + (err && err.message) });
  }
};
