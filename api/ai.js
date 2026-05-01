const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // ── Special: return key so browser can call Anthropic directly (for large files)
  if (req.body && req.body.getKey === true) {
    return res.status(200).json({ key: apiKey });
  }

  try {
    const payload = req.body.payload || req.body;
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model:      payload.model      || 'claude-sonnet-4-20250514',
      max_tokens: payload.max_tokens || 1000,
      ...(payload.system ? { system: payload.system } : {}),
      messages:   payload.messages   || [],
    });

    return res.status(200).json(response);

  } catch (error) {
    console.error('Anthropic API error:', error);
    return res.status(500).json({
      error: { message: error.message || 'API error', type: error.constructor.name }
    });
  }
};
