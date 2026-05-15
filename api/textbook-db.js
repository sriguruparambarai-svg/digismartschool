const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { table, method, body, params } = req.body || {};

  const ALLOWED = ['textbook_library', 'textbook_chapters', 'school_library_access'];
  if (!ALLOWED.includes(table)) return res.status(403).json({ error: 'Table not allowed' });

  const url = 'https://pzxosqukijwpjdlfdfst.supabase.co';
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'SUPABASE_SECRET_KEY not set in Vercel' });

  try {
    const db = createClient(url, key);

    if (method === 'GET') {
      let q = db.from(table).select('*');
      if (params) {
        for (const p of params.split('&')) {
          const eq = p.match(/^(\w+)=eq\.(.+)$/);
          const sel = p.match(/^select=(.+)$/);
          const ord = p.match(/^order=(\w+)\.(asc|desc)$/);
          if (eq) q = q.eq(eq[1], eq[2]);
          else if (sel && sel[1] !== '*') q = q.select(sel[1]);
          else if (ord) q = q.order(ord[1], { ascending: ord[2] === 'asc' });
        }
      }
      const { data, error } = await q;
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (method === 'POST') {
      const { data, error } = await db.from(table).insert(body).select();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (method === 'DELETE') {
      let q = db.from(table);
      if (params) {
        for (const p of params.split('&')) {
          const eq = p.match(/^(\w+)=eq\.(.+)$/);
          if (eq) q = q.eq(eq[1], eq[2]);
        }
      }
      const { error } = await q.delete();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown method' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
