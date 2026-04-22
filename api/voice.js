// /api/voice.js  — Vercel serverless function
// Receives { text, tone } → calls ElevenLabs → returns { audio: base64 }

const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

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
function formatForSpeech(text, tone) {
  let t = text.trim();

  // 1. Tamil + English boundary — insert pause marker so engine doesn't skip Tamil
  //    English→Tamil:  "Photosynthesis என்றால்"  →  "Photosynthesis ... என்றால்"
  //    Tamil→English:  "என்றால் photosynthesis"  →  "என்றால் ... photosynthesis"
  t = t.replace(/([a-zA-Z])([\u0B80-\u0BFF])/g, '$1 ... $2');
  t = t.replace(/([\u0B80-\u0BFF])([a-zA-Z])/g, '$1 ... $2');

  // 2. Natural punctuation pauses
  t = t.replace(/\.\s*/g, '. ... ');
  t = t.replace(/,\s*/g, ', ');
  t = t.replace(/\?\s*/g, '? ... ');
  t = t.replace(/!\s*/g, '! ... ');

  // 3. Tone-based prefix / suffix (teacher feel)
  if (tone === 'strict') {
    t = 'Listen carefully... ' + t;
  } else if (tone === 'emphasis') {
    t = 'IMPORTANT... ' + t;
  } else if (tone === 'question') {
    t = t + ' ... Think about it...';
  } else if (tone === 'command') {
    t = t + ' ... Write this down...';
  }

  // 4. Collapse any triple+ spaces left by replacements
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

  const { text, tone } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set in environment variables' });
  }

  const voiceSettings = TONE_SETTINGS[tone] || TONE_SETTINGS.normal;
  const formattedText = formatForSpeech(text, tone);

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

