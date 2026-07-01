// api/voice-math.js
// DEDICATED voice API for Math Class only
// Uses Monika Sogam (Indian female teacher voice)
// Intellectual professor settings — clear, confident, focused
// This is SEPARATE from voice-class.js so it doesn't affect Teaching Mode voices.

const https = require('https');

// Monika Sogam — Indian English female voice, calm and clear
const MATH_VOICE_ID = '5lf6Bj1bjbGRTV68afJj';

// Clean the text before sending to TTS
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

    // Intellectual professor settings — clear, confident, focused (NOT warm/emotional)
    // Slightly higher stability = more consistent = professor-like
    // Lower style = focused delivery, not expressive
    const payload = JSON.stringify({
      text: cleanedText,
      model_id: 'eleven_multilingual_v2',  // multilingual supports Tamil
      voice_settings: {
        stability: 0.60,          // Confident, steady delivery
        similarity_boost: 0.78,   // Strong voice character
        style: 0.25,              // Focused, not overly expressive
        use_speaker_boost: true
      }
    });

    const audioBuffer = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${MATH_VOICE_ID}`,
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

    const audioBase64 = audioBuffer.toString('base64');
    return res.status(200).json({
      audio_b64: audioBase64,
      voiceId: MATH_VOICE_ID,
      lang: lang || 'en'
    });

  } catch (err) {
    console.error('[voice-math] Error:', err);
    return res.status(500).json({ error: err.message || 'Voice generation failed' });
  }
};
