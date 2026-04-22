// /api/voice.js  — Vercel serverless function
// Receives { text, tone, lang } → calls ElevenLabs → returns { audio: base64 }

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
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ audio: base64 });

  } catch (err) {
    console.error('Voice API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}


