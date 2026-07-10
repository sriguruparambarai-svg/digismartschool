// /api/voice.js  — Vercel serverless function
// Receives { text, tone } → calls ElevenLabs → returns { audio: base64 }

// ── VOICE ID ──
// "Sarah" — eleven_multilingual_v2, calm female, handles Tamil+English naturally
// Swap this to any ElevenLabs voice ID you prefer
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

// ── TONE → VOICE SETTINGS ──
// stability   : higher = more consistent, lower = more expressive
// similarity_boost: how closely to match the trained voice
// style       : expressiveness (0 = neutral, 1 = very expressive)
// use_speaker_boost: extra clarity boost
const TONE_SETTINGS = {
  strict: {
    stability: 0.40,
    similarity_boost: 0.90,
    style: 0.60,
    use_speaker_boost: true
  },
  normal: {
    stability: 0.80,          // was 0.70 — steadier, calmer teacher reading
    similarity_boost: 0.80,
    style: 0.15,              // was 0.30 — less rushed / less "announcer"
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

// ── TEACHER PAUSES ──
// Inserts invisible ElevenLabs <break> tags after punctuation so the
// voice pauses like a teacher reading aloud.
// Only fires when a SPACE follows the punctuation (or end of text),
// so decimals like "3.5" and abbreviations like "e.g." are untouched.
function addTeacherPauses(text) {
  return text
    // full stop / question / exclamation → longer pause
    .replace(/([.!?])(\s+|$)/g, '$1 <break time="0.7s" /> ')
    // comma → short pause
    .replace(/(,)(\s+|$)/g, '$1 <break time="0.3s" /> ')
    // semicolon / colon → medium pause
    .replace(/([;:])(\s+|$)/g, '$1 <break time="0.5s" /> ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, tone } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set in environment variables' });
  }

  const voiceSettings = TONE_SETTINGS[tone] || TONE_SETTINGS.normal;

  // Add teacher-style pauses before sending to ElevenLabs
  const speechText = addTeacherPauses(text.trim());

  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: speechText,
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

    // Convert audio stream to base64
    const arrayBuffer = await elevenRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ audio: base64 });

  } catch (err) {
    console.error('Voice API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
