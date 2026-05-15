const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '2mb' } } };

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const EL_HOST = 'api.elevenlabs.io';

// Voice IDs — professional Indian English teacher voices
const VOICE_IDS = {
  default:  'EXAVITQu4vr4xnSDxMaL', // Sarah — clear, warm female
  teacher:  'XB0fDUnXU5powFXDhCwa', // Charlotte — professional
  male:     'TxGEqnHWrfWFTfGW9XjX', // Josh — male teacher
};

function sbReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const key = process.env.SUPABASE_SECRET_KEY;
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: SB_HOST, path, method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': key, 'Authorization': 'Bearer ' + key,
        'Prefer': 'return=representation',
        ...(data && { 'Content-Length': Buffer.byteLength(data) })
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: d ? JSON.parse(d) : {} }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function elReq(voiceId, text, stability, similarity) {
  return new Promise((resolve, reject) => {
    const key = process.env.ELEVENLABS_API_KEY;
    const payload = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: stability || 0.55,
        similarity_boost: similarity || 0.80,
        style: 0.2,
        use_speaker_boost: true
      }
    });
    const opts = {
      hostname: EL_HOST,
      path: `/v1/text-to-speech/${voiceId}`,
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
          const errText = Buffer.concat(chunks).toString();
          resolve({ ok: false, error: errText, status: res.statusCode });
        }
      });
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });
}

// Upload audio buffer to Supabase Storage
function uploadAudio(buffer, fileName) {
  return new Promise((resolve, reject) => {
    const key = process.env.SUPABASE_SECRET_KEY;
    const storagePath = `/storage/v1/object/lesson-audio/${fileName}`;
    const opts = {
      hostname: SB_HOST,
      path: storagePath,
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
        const publicUrl = `https://${SB_HOST}/storage/v1/object/public/lesson-audio/${fileName}`;
        resolve({ ok: res.statusCode === 200 || res.statusCode === 201, url: publicUrl, status: res.statusCode, data: d });
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

  const { lesson_id, paragraphs, voice_type, class_name, regenerate } = req.body || {};

  if (!lesson_id) return res.json({ error: 'lesson_id required' });
  if (!paragraphs || !Array.isArray(paragraphs) || paragraphs.length === 0)
    return res.json({ error: 'paragraphs array required' });

  const voiceId = VOICE_IDS[voice_type] || VOICE_IDS.default;

  // Check existing cached audio unless regenerating
  let existingOrders = new Set();
  if (!regenerate) {
    const existing = await sbReq('GET',
      `/rest/v1/lesson_audio?lesson_id=eq.${encodeURIComponent(lesson_id)}&select=paragraph_order,status`
    );
    if (existing.data && Array.isArray(existing.data)) {
      existing.data.forEach(r => { if (r.status === 'ready') existingOrders.add(r.paragraph_order); });
    }
  }

  const results = [];
  let generated = 0, skipped = 0, failed = 0;

  // Process paragraphs — skip headings, generate for content paragraphs
  for (const para of paragraphs) {
    const order = para.order;
    const text = (para.text || '').trim();

    // Skip headings and very short text
    if (!text || text.length < 15 || para.type === 'heading') {
      skipped++;
      results.push({ order, status: 'skipped', reason: 'heading or too short' });
      continue;
    }

    // Skip if already cached
    if (existingOrders.has(order)) {
      skipped++;
      results.push({ order, status: 'cached' });
      continue;
    }

    try {
      // Generate audio via ElevenLabs
      const elResult = await elReq(voiceId, text, 0.55, 0.80);

      if (!elResult.ok) {
        failed++;
        results.push({ order, status: 'failed', error: elResult.error });
        continue;
      }

      // Upload to Supabase Storage
      const fileName = `${lesson_id}_para_${order}.mp3`;
      const uploadResult = await uploadAudio(elResult.audio, fileName);

      if (!uploadResult.ok) {
        failed++;
        results.push({ order, status: 'upload_failed', error: uploadResult.data });
        continue;
      }

      // Save record to lesson_audio table
      const record = {
        lesson_id,
        paragraph_order: order,
        paragraph_text: text.substring(0, 500),
        audio_url: uploadResult.url,
        status: 'ready',
        voice_id: voiceId,
        class_name: class_name || '',
        created_at: new Date().toISOString()
      };

      // Upsert (replace if exists)
      await sbReq('POST',
        `/rest/v1/lesson_audio?on_conflict=lesson_id,paragraph_order`,
        record
      );

      generated++;
      results.push({ order, status: 'ready', url: uploadResult.url });

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      failed++;
      results.push({ order, status: 'error', error: e.message });
    }
  }

  return res.json({
    success: true,
    lesson_id,
    summary: { generated, skipped, failed, total: paragraphs.length },
    results
  });
};
