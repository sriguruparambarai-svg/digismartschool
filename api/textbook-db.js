// api/textbook-db.js
// Server-side proxy for textbook library Supabase calls
// Bypasses browser CORS/allowlist restrictions

const { createClient } = require('@supabase/supabase-js');

const SB_URL = process.env.SUPABASE_URL || 'https://pzxosqukijwpjdlfdfst.supabase.co';
const SB_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { table, method, body, params } = req.body || {};
  if (!table || !method) return res.status(400).json({ error: 'table and method required' });

  // Whitelist allowed tables
  const allowed = ['textbook_library', 'textbook_chapters', 'school_library_access'];
  if (!allowed.includes(table)) return res.status(403).json({ error: 'Table not allowed' });

  try {
    const db = createClient(SB_URL, SB_KEY);

    if (method === 'GET') {
      let q = db.from(table).select('*');
      if (params) {
        params.split('&').forEach(p => {
          const eq = p.match(/^(\w+)=eq\.(.+)$/);
          const sel = p.match(/^select=(.+)$/);
          const ord = p.match(/^order=(\w+)\.(asc|desc)$/);
          if (eq) q = q.eq(eq[1], eq[2]);
          else if (sel && sel[1] !== '*') q = q.select(sel[1]);
          else if (ord) q = q.order(ord[1], { ascending: ord[2] === 'asc' });
        });
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
        params.split('&').forEach(p => {
          const eq = p.match(/^(\w+)=eq\.(.+)$/);
          if (eq) q = q.eq(eq[1], eq[2]);
        });
      }
      const { error } = await q.delete();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown method: ' + method });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
