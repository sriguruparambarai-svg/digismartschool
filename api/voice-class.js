// /api/voice-class.js
// Class-based voice for fullscreen-class.html
// One-shot: text in → base64 audio out. No caching, no storage.

const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const EL_HOST = 'api.elevenlabs.io';

// Class-based voice mapping (matches voice-config.js)
const VOICE_MAP = {
  primary: {
    voice_id: 'EXAVITQu4vr4xnSDxMaL', // Bella — warm, child-friendly
    stability: 0.75, similarity_boost: 0.85, style: 0.20
  },
  middle: {
    voice_id: 'ThT5KcBeYPX3keUQqHPh', // Dorothy — clear, encouraging
    stability: 0.70, similarity_boost: 0.80, style: 0.15
  },
  senior: {
    voice_id: 'TxGEqnHWrfWFTfGW9XjX', // Josh — confident, neutral
    stability: 0.65, similarity_boost: 0.78, style: 0.10
  },
  higher: {
    voice_id: 'VR6AewLTigWG4xSOukaG', // Arnold — authoritative
    stability: 0.60, similarity_boost: 0.75, style: 0.08
  }
};

function pickVoice(cls) {
  // Extract number from "Class 1", "Class 10", "LKG", "UKG", "Pre KG"
  var s = (cls || '').toLowerCase();
  if (s.indexOf('pre') >= 0 || s.indexOf('lkg') >= 0 || s.indexOf('ukg') >= 0) return VOICE_MAP.primary;
  var match = s.match(/\d+/);
  var num = match ? parseInt(match[0]) : 7;
  if (num <= 3) return VOICE_MAP.primary;
  if (num <= 7) return VOICE_MAP.middle;
  if (num <= 10) return VOICE_MAP.senior;
  return VOICE_MAP.higher;
}

// Light formatting - natural punctuation, NO "..." spam that makes TTS say "dot dot dot"
function formatForSpeech(text) {
  var t = text.trim();
  // Remove [Page N] markers if any leaked in
  t = t.replace(/\[Page\s+\d+\]/gi, '');
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  // Natural sentence breaks - just commas and periods
  t = t.replace(/\.\s+/g, '. ');
  t = t.replace(/,\s+/g, ', ');
  t = t.replace(/\?\s+/g, '? ');
  t = t.replace(/!\s+/g, '! ');
  return t;
}

function callElevenLabs(voiceId, text, settings) {
  return new Promise(function(resolve) {
    var key = process.env.ELEVENLABS_API_KEY;
    if (!key) { resolve({ ok: false, error: 'No ElevenLabs API key' }); return; }

    var payload = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: settings.stability,
        similarity_boost: settings.similarity_boost,
        style: settings.style,
        use_speaker_boost: true
      }
    });

    var opts = {
      hostname: EL_HOST,
      path: '/v1/text-to-speech/' + voiceId,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': key,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    var chunks = [];
    var r = https.request(opts, function(res) {
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        if (res.statusCode === 200) {
          resolve({ ok: true, audio: Buffer.concat(chunks) });
        } else {
          var err = Buffer.concat(chunks).toString();
          resolve({ ok: false, error: err, status: res.statusCode });
        }
      });
    });
    r.on('error', function(e) { resolve({ ok: false, error: e.message }); });
    r.write(payload);
    r.end();
  });
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var text = (body.text || '').trim();
  var cls = body.cls || body.class || 'Class 7';

  if (!text || text.length < 3) {
    return res.json({ error: 'text required' });
  }

  // Limit text length to avoid huge generation
  if (text.length > 1500) text = text.substring(0, 1500);

  var voice = pickVoice(cls);
  var formattedText = formatForSpeech(text);

  try {
    var result = await callElevenLabs(voice.voice_id, formattedText, voice);
    if (!result.ok) {
      return res.json({ error: 'ElevenLabs: ' + (result.error || 'unknown'), status: result.status });
    }
    var base64 = result.audio.toString('base64');
    return res.json({ success: true, audio_b64: base64, voice_id: voice.voice_id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
