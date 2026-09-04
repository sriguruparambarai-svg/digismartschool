// /api/ai.js — Anthropic proxy for DigiSmartSchool
// Receives { system, messages, max_tokens } → calls Claude → returns response

const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const ANTHROPIC_HOST = 'api.anthropic.com';
const MODEL = 'claude-sonnet-4-5'; // current valid model

// ── Guards ──────────────────────────────────────────────────────────────
// This endpoint spends real money on every call, so it only answers our own
// pages. Note this stops other websites and casual misuse, NOT a determined
// person with curl, who can fake an Origin header. Proper protection is the
// signed session token in auth.js, which needs the pages to send it too.
const ALLOWED_HOSTS = [
  'digismartschool.com',
  'www.digismartschool.com',
  'learn.digismartschool.com',
  'erp.digismartschool.com',
  'localhost',
  '127.0.0.1'
];

// Only these models may be used, whatever the caller asks for.
const ALLOWED_MODELS = ['claude-sonnet-4-5'];

const MAX_TOKENS_CAP = 8000;   // highest any of our tools legitimately needs
const MAX_MESSAGES   = 40;     // a normal conversation never comes near this
const RATE_PER_MIN   = 40;     // calls allowed per address per minute

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
}

function hostAllowed(h) {
  if (!h) return false;
  if (ALLOWED_HOSTS.indexOf(h) !== -1) return true;
  return /\.vercel\.app$/.test(h);      // preview and dev deployments
}

// Requests from a browser always carry one of these on a POST. Something with
// neither is not one of our pages.
function fromOurSite(req) {
  const origin = req.headers['origin'];
  if (origin) return hostAllowed(hostOf(origin));
  const referer = req.headers['referer'] || req.headers['referrer'];
  if (referer) return hostAllowed(hostOf(referer));
  return false;
}

// Rough rate limit. Serverless spins up many separate instances, so this is a
// speed bump rather than a wall - it catches a runaway loop or a script, not a
// spread-out attack.
const hits = new Map();
function rateOk(ip) {
  const now = Date.now();
  const cutoff = now - 60000;
  const list = (hits.get(ip) || []).filter(function (t) { return t > cutoff; });
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();       // never let the map grow unbounded
  return list.length <= RATE_PER_MIN;
}

function callAnthropic(body) {
  return new Promise(function(resolve, reject) {
    var key = process.env.ANTHROPIC_API_KEY;
    if (!key) { resolve({ ok: false, error: 'ANTHROPIC_API_KEY not set in Vercel env' }); return; }

    // The caller does not get to choose the model or an unlimited answer length.
    var wanted = String(body.model || MODEL);
    var model = ALLOWED_MODELS.indexOf(wanted) !== -1 ? wanted : MODEL;
    var tokens = parseInt(body.max_tokens, 10);
    if (!tokens || tokens < 1) tokens = 1024;
    if (tokens > MAX_TOKENS_CAP) tokens = MAX_TOKENS_CAP;

    var payload = JSON.stringify({
      model: model,
      max_tokens: tokens,
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
  // Echo the origin back only when it is one of ours, instead of "any website".
  var origin = req.headers['origin'] || '';
  if (origin && hostAllowed(hostOf(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!fromOurSite(req)) {
    return res.status(403).json({ type: 'error', error: 'forbidden',
      message: 'This service is only available from DigiSmartSchool.' });
  }

  var ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (!rateOk(ip)) {
    return res.status(429).json({ type: 'error', error: 'rate_limited',
      message: 'Too many requests in a short time. Please wait a moment and try again.' });
  }

  var body = req.body || {};

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  if (body.messages.length > MAX_MESSAGES) {
    return res.status(400).json({ type: 'error', error: 'too_many_messages',
      message: 'This conversation is too long. Please clear it and start again.' });
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
