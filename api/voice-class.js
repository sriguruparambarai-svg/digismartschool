// api/voice-class.js
// ElevenLabs TTS — class-based voice mapping for DigiSmartSchool
// Teacher-quality voices selected for educational delivery (not audiobook narration)

const https = require('https');

// ─── VOICE MAPPING BY CLASS GROUP ──────────────────────────
// All these are ElevenLabs official library voices (free to use with API)
const VOICE_MAP = {
  // PreKG–Class 3 → Lily (warm, gentle female, perfect for small children)
  'PreKG':   'pFZP5JQG7iQjIQuC4Bku',
  'LKG':     'pFZP5JQG7iQjIQuC4Bku',
  'UKG':     'pFZP5JQG7iQjIQuC4Bku',
  'Class 1': 'pFZP5JQG7iQjIQuC4Bku',
  'Class 2': 'pFZP5JQG7iQjIQuC4Bku',
  'Class 3': 'pFZP5JQG7iQjIQuC4Bku',

  // Class 4–7 → Monika Sogam (Indian English female teacher voice — most popular for Indian EdTech)
  'Class 4': '5lf6Bj1bjbGRTV68afJj',
  'Class 5': '5lf6Bj1bjbGRTV68afJj',
  'Class 6': '5lf6Bj1bjbGRTV68afJj',
  'Class 7': '5lf6Bj1bjbGRTV68afJj',

  // Class 8–10 → Brian (calm confident American male, clear teacher tone)
  'Class 8':  'nPczCjzI2devNBz1zQrb',
  'Class 9':  'nPczCjzI2devNBz1zQrb',
  'Class 10': 'nPczCjzI2devNBz1zQrb',

  // Class 11–12 → Daniel (British male, authoritative but kind — senior teacher)
  'Class 11': 'onwK4e9ZLuTAKqWW03F9',
  'Class 12': 'onwK4e9ZLuTAKqWW03F9'
};

// Fallback if class not recognized
const DEFAULT_VOICE = '5lf6Bj1bjbGRTV68afJj'; // Monika Sogam

// ─── TEXT CLEANING ─────────────────────────────────────────
function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[Page\s+\d+\]/gi, '')        // Remove [Page N] markers
    .replace(/♦/g, '')                       // Remove ♦ symbols
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

    // Call ElevenLabs API
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

    // Return base64 audio (field name matches existing client code)
    const audioBase64 = audioBuffer.toString('base64');
    return res.status(200).json({
      audio_b64: audioBase64,
      voiceId: voiceId,
      cls: cls || 'default'
    });

  } catch (err) {
    console.error('[voice-class] Error:', err);
    return res.status(500).json({ error: err.message || 'Voice generation failed' });
  }
};
