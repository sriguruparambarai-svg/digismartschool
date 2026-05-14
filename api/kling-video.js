// api/kling-video.js — Vercel serverless function for Kling AI video generation
const crypto = require('crypto');

function makeJWT(accessKey, secretKey) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })).toString('base64url');
  const data    = `${header}.${payload}`;
  const sig     = crypto.createHmac('sha256', secretKey).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function pollTask(taskId, token, maxWait = 180000) {
  const start = Date.now();
  const url   = `https://api.klingai.com/v1/videos/text2video/${taskId}`;
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const data = await res.json();
    const status = data?.data?.task_status;
    if (status === 'succeed') {
      const videoUrl = data?.data?.task_result?.videos?.[0]?.url;
      if (videoUrl) return videoUrl;
      throw new Error('Video succeeded but no URL returned');
    }
    if (status === 'failed') throw new Error('Kling task failed: ' + (data?.data?.task_status_msg || 'Unknown'));
  }
  throw new Error('Video generation timed out after 3 minutes');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) return res.status(500).json({ error: 'Kling API keys not set in Vercel environment variables' });

  const { prompt, duration = '5', aspect_ratio = '16:9', mode = 'standard' } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    const token = makeJWT(accessKey, secretKey);
    const createRes = await fetch('https://api.klingai.com/v1/videos/text2video', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_name: 'kling-v1',
        prompt, duration: String(duration), aspect_ratio, mode,
        negative_prompt: 'blurry, low quality, violence, scary, adult content, watermark, text, subtitles',
        cfg_scale: 0.5
      })
    });
    const createData = await createRes.json();
    if (!createRes.ok || createData?.code !== 0) throw new Error(createData?.message || `HTTP ${createRes.status}`);
    const taskId = createData?.data?.task_id;
    if (!taskId) throw new Error('No task_id from Kling');
    const videoUrl = await pollTask(taskId, token);
    return res.status(200).json({ success: true, videoUrl, taskId });
  } catch (err) {
    console.error('Kling error:', err.message);
    return res.status(500).json({ error: err.message || 'Video generation failed' });
  }
}
