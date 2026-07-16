const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const EL_HOST = 'api.elevenlabs.io';
const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';

// ElevenLabs multilingual voices that handle Tamil+English well
// eleven_multilingual_v2 model reads Tamil script + English terms naturally
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah — warm, clear, works well for Tamil

function elTTS(text) {
  return new Promise((resolve, reject) => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) { resolve({ ok: false, error: 'No ElevenLabs API key' }); return; }

    const payload = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.60,
        similarity_boost: 0.75,
        style: 0.15,
        use_speaker_boost: true
      }
    });

    const opts = {
      hostname: EL_HOST,
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': key,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const chunks = [];
    const r = https.request(opts, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ ok: true, audio: Buffer.concat(chunks) });
        } else {
          const err = Buffer.concat(chunks).toString();
          resolve({ ok: false, error: err, status: res.statusCode });
        }
      });
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });
}

// Check storage BEFORE generating — this is the actual caching step that was missing.
// Same lesson+page+paragraph = same fileName = instant reuse, zero ElevenLabs cost.
function fetchFromSB(fileName) {
  return new Promise((resolve) => {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) return resolve(null);
    const opts = {
      hostname: SB_HOST,
      path: `/storage/v1/object/lesson-audio/${fileName}`,
      method: 'GET',
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    };
    const r = https.request(opts, (resp) => {
      if (resp.statusCode !== 200) { resp.resume(); return resolve(null); }
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks)));
      resp.on('error', () => resolve(null));
    });
    r.on('error', () => resolve(null));
    r.end();
  });
}

function uploadToSB(buffer, fileName) {
  return new Promise((resolve, reject) => {
    const key = process.env.SUPABASE_SECRET_KEY;
    const opts = {
      hostname: SB_HOST,
      path: `/storage/v1/object/lesson-audio/${fileName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'audio/mpeg',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Length': buffer.length,
        'x-upsert': 'true'
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const url = `https://${SB_HOST}/storage/v1/object/public/lesson-audio/${fileName}`;
        resolve({ ok: res.statusCode === 200 || res.statusCode === 201, url });
      });
    });
    r.on('error', reject);
    r.write(buffer);
    r.end();
  });
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { text, cache_key } = req.body || {};
  if (!text || text.trim().length < 5) return res.json({ error: 'text required' });

  const fileName = 'explain_' + (cache_key || Date.now()) + '.mp3';

  try {
    // ── CACHE CHECK: reuse saved audio if this exact line was generated before ──
    if (cache_key) {
      const cached = await fetchFromSB(fileName);
      if (cached && cached.length > 0) {
        return res.json({
          success: true,
          audio_b64: cached.toString('base64'),
          source: 'cache',
          cached: true
        });
      }
    }
    // ── CACHE MISS: generate as normal below ──

    // Generate audio via ElevenLabs multilingual_v2
    const result = await elTTS(text.trim());
    if (!result.ok) {
      return res.json({ error: 'ElevenLabs error: ' + (result.error || 'Unknown'), status: result.status });
    }

    // Upload to Supabase storage — saved under the SAME fileName so next call hits the cache
    const upload = await uploadToSB(result.audio, fileName);

    if (!upload.ok) {
      // Return base64 as fallback if storage fails
      const b64 = result.audio.toString('base64');
      return res.json({ success: true, audio_b64: b64, source: 'base64', cached: false });
    }

    return res.json({ success: true, audio_url: upload.url, source: 'storage', cached: false });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
