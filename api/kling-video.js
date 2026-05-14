// api/kling-video.js
// Two actions:
//   POST { action:'create', prompt, duration, aspect_ratio } → returns { taskId }
//   POST { action:'poll',   taskId }                         → returns { status, videoUrl }
const crypto = require('crypto');

function makeJWT(accessKey, secretKey) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })).toString('base64url');
  const sig     = crypto.createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) return res.status(500).json({ error: 'Kling API keys not configured in Vercel' });

  const token = makeJWT(accessKey, secretKey);
  const body  = req.body || {};

  // ── ACTION: create ─────────────────────────────────
  if (body.action === 'create') {
    const { prompt, duration = '5', aspect_ratio = '16:9', mode = 'standard' } = body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    try {
      const r = await fetch('https://api.klingai.com/v1/videos/text2video', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name:      'kling-v1',
          prompt,
          negative_prompt: 'blurry, low quality, violence, scary, adult content, watermark, text, subtitles',
          duration:        String(duration),
          aspect_ratio,
          mode,
          cfg_scale:       0.5
        })
      });
      const d = await r.json();
      if (!r.ok || d?.code !== 0) throw new Error(d?.message || `Kling HTTP ${r.status}: ${JSON.stringify(d)}`);
      const taskId = d?.data?.task_id;
      if (!taskId) throw new Error('No task_id returned from Kling');
      return res.status(200).json({ taskId });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── ACTION: poll ───────────────────────────────────
  if (body.action === 'poll') {
    const { taskId } = body;
    if (!taskId) return res.status(400).json({ error: 'taskId required' });
    try {
      const r = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const d = await r.json();
      const status = d?.data?.task_status;
      if (status === 'succeed') {
        const videoUrl = d?.data?.task_result?.videos?.[0]?.url;
        return res.status(200).json({ status: 'done', videoUrl });
      }
      if (status === 'failed') {
        return res.status(200).json({ status: 'failed', error: d?.data?.task_status_msg || 'Task failed' });
      }
      return res.status(200).json({ status: 'processing' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'action must be create or poll' });
};
