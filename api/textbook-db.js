const https = require('https');

module.exports.config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const HOST = 'pzxosqukijwpjdlfdfst.supabase.co';

function sbReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const key = process.env.SUPABASE_SECRET_KEY;
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST, path, method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=representation',
        ...(data && { 'Content-Length': Buffer.byteLength(data) })
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
  const ALLOWED = ['textbook_library', 'textbook_chapters', 'school_library_access'];
  if (!ALLOWED.includes(table)) return res.status(403).json({ error: 'Table not allowed' });

  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'SUPABASE_SECRET_KEY missing' });

  try {
    if (method === 'GET') {
      let path = `/rest/v1/${table}?select=*`;
      if (params) {
        params.split('&').forEach(p => {
          if (p.startsWith('select=')) {
            path = `/rest/v1/${table}?${p}`;
          } else {
            path += '&' + p;
          }
        });
      }
      const r = await sbReq('GET', path, null);
      if (r.status >= 400) return res.status(r.status).json({ error: JSON.stringify(r.data) });
      return res.status(200).json(Array.isArray(r.data) ? r.data : []);
    }

    if (method === 'POST') {
      const r = await sbReq('POST', `/rest/v1/${table}`, body);
      if (r.status >= 400) return res.status(r.status).json({ error: JSON.stringify(r.data) });
      return res.status(200).json(r.data);
    }

    if (method === 'DELETE') {
      let path = `/rest/v1/${table}?`;
      if (params) path += params;
      const r = await sbReq('DELETE', path, null);
      if (r.status >= 400) return res.status(r.status).json({ error: JSON.stringify(r.data) });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown method: ' + method });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
