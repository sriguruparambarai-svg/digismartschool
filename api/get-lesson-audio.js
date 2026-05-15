const https = require('https');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';

function sbReq(path) {
  return new Promise((resolve, reject) => {
    const key = process.env.SUPABASE_SECRET_KEY;
    const opts = {
      hostname: SB_HOST, path, method: 'GET',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: [] }); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const lesson_id = req.query && req.query.lesson_id;
  if (!lesson_id) return res.json({ error: 'lesson_id required' });

  try {
    const r = await sbReq(
      `/rest/v1/lesson_audio?lesson_id=eq.${encodeURIComponent(lesson_id)}&select=paragraph_order,audio_url,status,paragraph_text&order=paragraph_order.asc`
    );

    const paragraphs = Array.isArray(r.data) ? r.data : [];
    const ready = paragraphs.filter(p => p.status === 'ready').length;

    return res.json({
      success: true,
      lesson_id,
      paragraphs,
      summary: { total: paragraphs.length, ready, pending: paragraphs.length - ready }
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
