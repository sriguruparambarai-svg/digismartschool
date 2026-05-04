const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '10mb' } } };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // ── Special: return key for direct browser access (PDF vision) ──
  if (req.body && req.body.getKey === true) {
    return res.status(200).json({ key: apiKey });
  }

  const payload = req.body.payload || req.body;

  const body = JSON.stringify({
    model:      payload.model      || 'claude-sonnet-4-20250514',
    max_tokens: payload.max_tokens || 1000,
    ...(payload.system ? { system: payload.system } : {}),
    messages:   payload.messages   || [],
  });

  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const r = https.request(opts, (apiRes) => {
      let data = '';
      apiRes.on('data', c => data += c);
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.status(200).json(parsed);
        } catch(e) {
          res.status(500).json({ error: { message: 'Parse error: ' + data.substring(0, 200) } });
        }
        resolve();
      });
    });

    r.on('error', (e) => {
      res.status(500).json({ error: { message: e.message } });
      resolve();
    });

    r.write(body);
    r.end();
  });
};
