const https = require('https');
module.exports.config = { api: { bodyParser: { sizeLimit: '10mb' } } };

function sbReq(key, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'pzxosqukijwpjdlfdfst.supabase.co',
      path, method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=representation',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: d ? JSON.parse(d) : [] }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { table, method, body, params } = req.body || {};
  const ALLOWED = ['textbook_library','textbook_chapters','school_library_access'];
  if (!ALLOWED.includes(table)) return res.status(403).json({ error: 'Table not allowed: ' + table });

  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'SUPABASE_SECRET_KEY not configured' });

  try {
    if (method === 'GET') {
      const qs = params ? params.replace(/select=[^&]*/g,'').replace(/^&/,'').replace(/&&/g,'&') : '';
      const path = '/rest/v1/' + table + '?select=*' + (qs ? '&' + qs : '');
      const r = await sbReq(key, 'GET', path, null);
      if (r.status >= 400) return res.status(r.status).json({ error: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) });
      return res.status(200).json(Array.isArray(r.data) ? r.data : []);
    }
    if (method === 'POST') {
      const r = await sbReq(key, 'POST', '/rest/v1/' + table, body);
      if (r.status >= 400) return res.status(r.status).json({ error: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) });
      return res.status(200).json(r.data);
    }
    if (method === 'DELETE') {
      const path = '/rest/v1/' + table + (params ? '?' + params : '');
      const r = await sbReq(key, 'DELETE', path, null);
      if (r.status >= 400) return res.status(r.status).json({ error: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) });
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Unknown method: ' + method });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
