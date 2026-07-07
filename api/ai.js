// /api/ai.js — Anthropic proxy for DigiSmartSchool
// Receives { system, messages, max_tokens } → calls Claude → returns response

const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const ANTHROPIC_HOST = 'api.anthropic.com';
const MODEL = 'claude-sonnet-4-5'; // current valid model

function callAnthropic(body) {
  return new Promise(function(resolve, reject) {
    var key = process.env.ANTHROPIC_API_KEY;
    if (!key) { resolve({ ok: false, error: 'ANTHROPIC_API_KEY not set in Vercel env' }); return; }

    var payload = JSON.stringify({
      model: body.model || MODEL,
      max_tokens: body.max_tokens || 1024,
      system: body.system || '',
      messages: body.messages || []
    });

    var opts = {
      hostname: ANTHROPIC_HOST,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    var chunks = [];
    var r = https.request(opts, function(res) {
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString();
        try {
          var parsed = JSON.parse(raw);
          resolve({ ok: res.statusCode === 200, status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, error: 'Invalid JSON: ' + raw.substring(0, 300) });
        }
      });
    });
    r.on('error', function(e) { resolve({ ok: false, error: e.message }); });
    r.write(payload);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    var result = await callAnthropic(body);
    if (!result.ok) {
      return res.status(result.status || 500).json({
        type: 'error',
        error: result.error || result.data,
        message: typeof result.error === 'string' ? result.error : 'Anthropic API call failed'
      });
    }
    // Return Anthropic response as-is (has content array with text blocks)
    return res.status(200).json(result.data);
  } catch (e) {
    return res.status(500).json({ type: 'error', error: e.message });
  }
};
