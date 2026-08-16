// /api/voice.js  — Vercel serverless function
// Receives { text, tone, lang } → calls ElevenLabs → returns { audio: base64 }

import crypto from 'crypto';

// ── AUDIO CACHE (Supabase Storage) ─────────────────────────
// Generated audio is saved to bucket 'lesson-audio', folder 'teach-voice/'.
// Same voice + same spoken text = same file, so every replay of a line —
// in any classroom, in any school, on any day — costs ZERO ElevenLabs credits.
// This mirrors the proven cache already running in api/voice-class.js.
// If Supabase is ever unavailable we silently fall back to normal generation,
// so a storage problem can never stop a lesson.
const SUPA_HOST    = 'pzxosqukijwpjdlfdfst.supabase.co';
const AUDIO_BUCKET = 'lesson-audio';
const AUDIO_FOLDER = 'teach-voice';

function audioKey(voiceId, speechText) {
  const hash = crypto.createHash('sha256')
    .update(voiceId + '|' + speechText)
    .digest('hex')
    .slice(0, 40);
  return AUDIO_FOLDER + '/' + hash + '.mp3';
}

// Fetch previously saved audio. Returns base64 string on hit, null on miss. Never throws.
async function fetchCachedAudio(objectPath, supaKey) {
  try {
    const r = await fetch(
      'https://' + SUPA_HOST + '/storage/v1/object/' + AUDIO_BUCKET + '/' + objectPath,
      { method: 'GET', headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey } }
    );
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (!buf || buf.byteLength === 0) return null;
    return Buffer.from(buf).toString('base64');
  } catch (e) {
    return null;
  }
}

// Save generated audio for future replays. Never throws — a failed save cannot break playback.
async function saveCachedAudio(objectPath, supaKey, audioBuffer) {
  try {
    const r = await fetch(
      'https://' + SUPA_HOST + '/storage/v1/object/' + AUDIO_BUCKET + '/' + objectPath,
      {
        method: 'POST',
        headers: {
          apikey: supaKey,
          Authorization: 'Bearer ' + supaKey,
          'Content-Type': 'audio/mpeg',
          'x-upsert': 'true'
        },
        body: audioBuffer
      }
    );
    return r.ok;
  } catch (e) {
    return false;
  }
}

// ── VOICE IDs ──
// English: "Sarah" — calm, clear, multilingual
const VOICE_ID_EN = 'EXAVITQu4vr4xnSDxMaL';
// Tamil: "Aria" — eleven_multilingual_v2 handles Tamil script well with this voice
// You can swap to any voice ID that you find sounds better for Tamil
const VOICE_ID_TA = 'EXAVITQu4vr4xnSDxMaL'; // same model, Tamil pronunciation handled by model

// ── TONE → VOICE SETTINGS ──
const TONE_SETTINGS = {
  strict: {
    stability: 0.40,
    similarity_boost: 0.90,
    style: 0.60,
    use_speaker_boost: true
  },
  normal: {
    stability: 0.70,
    similarity_boost: 0.80,
    style: 0.30,
    use_speaker_boost: true
  },
  emphasis: {
    stability: 0.30,
    similarity_boost: 0.90,
    style: 0.75,
    use_speaker_boost: true
  },
  question: {
    stability: 0.50,
    similarity_boost: 0.80,
    style: 0.50,
    use_speaker_boost: true
  },
  command: {
    stability: 0.55,
    similarity_boost: 0.85,
    style: 0.45,
    use_speaker_boost: true
  }
};

// ── FORMAT TEXT FOR NATURAL SPEECH ──
function formatForSpeech(text, tone, lang) {
  let t = text.trim();

  if (lang === 'ta') {
    // Tamil-only segment — no boundary markers needed, just punctuation pauses
    t = t.replace(/\.\s*/g, '. ');
    t = t.replace(/,\s*/g, ', ');
    t = t.replace(/\?\s*/g, '? ');
    t = t.replace(/!\s*/g, '! ');

    // Tamil tone prefixes
    if (tone === 'strict')   t = 'கவனமா கேளுங்க... ' + t;
    if (tone === 'emphasis') t = 'முக்கியம்... ' + t;
    if (tone === 'question') t = t + ' யோசிங்க...';
    if (tone === 'command')  t = t + ' எழுதிக்கோங்க...';

  } else {
    // English-only segment
    // Natural punctuation pauses
    t = t.replace(/\.\s*/g, '. ... ');
    t = t.replace(/,\s*/g,  ', ');
    t = t.replace(/\?\s*/g, '? ... ');
    t = t.replace(/!\s*/g,  '! ... ');

    // Tone-based prefix / suffix
    if (tone === 'strict')   t = 'Listen carefully... ' + t;
    if (tone === 'emphasis') t = 'IMPORTANT... ' + t;
    if (tone === 'question') t = t + ' Think about it...';
    if (tone === 'command')  t = t + ' Write this down...';
  }

  // Collapse any accidental multi-space runs
  t = t.replace(/ {3,}/g, ' ... ');

  return t;
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, tone, lang } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set in environment variables' });
  }

  // Pick voice by language
  const voiceId       = (lang === 'ta') ? VOICE_ID_TA : VOICE_ID_EN;
  const voiceSettings = TONE_SETTINGS[tone] || TONE_SETTINGS.normal;
  const formattedText = formatForSpeech(text, tone, lang || 'en');

  // ── CACHE CHECK: if this exact line was spoken before, replay the saved file ──
  const supaKey = process.env.SUPABASE_SECRET_KEY;
  const cacheObjectPath = audioKey(voiceId, formattedText);
  if (supaKey) {
    const cachedAudio = await fetchCachedAudio(cacheObjectPath, supaKey);
    if (cachedAudio) {
      return res.status(200).json({ audio: cachedAudio, cached: true });
    }
  }
  // ── CACHE MISS: generate as normal below ──

  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: formattedText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: voiceSettings
        })
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error('ElevenLabs error:', elevenRes.status, errText);
      return res.status(502).json({
        error: 'ElevenLabs API error',
        status: elevenRes.status,
        detail: errText
      });
    }

    const arrayBuffer = await elevenRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const base64 = audioBuffer.toString('base64');

    // ── SAVE TO CACHE so the next play of this line is free ──
    if (supaKey) {
      await saveCachedAudio(cacheObjectPath, supaKey, audioBuffer);
    }

    return res.status(200).json({ audio: base64, cached: false });

  } catch (err) {
    console.error('Voice API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}


