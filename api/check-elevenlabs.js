const https = require('https');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.json({ error: 'ELEVENLABS_API_KEY not set in Vercel environment variables' });

  // Check account/subscription info
  const userInfo = await new Promise((resolve) => {
    const opts = {
      hostname: 'api.elevenlabs.io',
      path: '/v1/user',
      method: 'GET',
      headers: { 'xi-api-key': key }
    };
    const r = https.request(opts, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: resp.statusCode, data: d }); }
      });
    });
    r.on('error', () => resolve({ status: 0, data: 'connection error' }));
    r.end();
  });

  if (userInfo.status === 401) {
    return res.json({
      ok: false,
      problem: 'Invalid API key',
      fix: 'Go to elevenlabs.io → Profile → API Key → copy the correct key → update in Vercel dashboard → Environment Variables → ELEVENLABS_API_KEY'
    });
  }

  if (userInfo.status !== 200) {
    return res.json({ ok: false, status: userInfo.status, raw: typeof userInfo.data === 'string' ? userInfo.data.substring(0,200) : userInfo.data });
  }

  const sub = userInfo.data.subscription || {};
  const used = sub.character_count || 0;
  const limit = sub.character_limit || 0;
  const remaining = limit - used;
  const tier = sub.tier || 'unknown';

  return res.json({
    ok: true,
    account: userInfo.data.first_name || 'Unknown',
    tier: tier,
    characters_used: used,
    characters_limit: limit,
    characters_remaining: remaining,
    can_generate: remaining > 100,
    message: remaining > 100
      ? `✅ OK — ${remaining.toLocaleString()} characters remaining`
      : `❌ Only ${remaining} characters left — top up at elevenlabs.io`
  });
};
