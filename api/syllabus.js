// api/syllabus.js
// Serves the syllabus chapter list to the Concept Class pages.
//
// Reads the `syllabus_chapters` table seeded from NCERT contents pages.
// Read-only: this endpoint never writes. All queries go through the server
// so the browser never touches Supabase directly.
//
// Actions:
//   'classes'  -> which classes have chapters for a board+subject
//   'chapters' -> the chapter list for one board+class+subject
//
// Chapters marked active = false (Hindi read-only pieces, marked with a star
// or with "for reading" tags in the book) are excluded by default, because
// they are not meant for full teaching treatment.

const https = require('https');

const HOST = 'pzxosqukijwpjdlfdfst.supabase.co';

function req(method, path) {
  return new Promise((resolve) => {
    const key = process.env.SUPABASE_SECRET_KEY;
    const opts = {
      hostname: HOST, path, method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Accept-Profile': 'public'
      }
    };
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: d ? JSON.parse(d) : [] }); }
        catch (e) { resolve({ status: res.statusCode, data: [] }); }
      });
    });
    r.on('error', () => resolve({ status: 0, data: [] }));
    r.end();
  });
}

// Class values arrive as 'Class 7' from the page but are stored as 7.
function classNumber(cls) {
  const m = String(cls || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

module.exports = async (req2, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req2.method === 'OPTIONS') return res.status(200).end();
  if (req2.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req2.body || {};
    const action = body.action || 'chapters';
    const board = String(body.board || 'NCERT');
    const subject = String(body.subject || 'Maths');

    if (!process.env.SUPABASE_SECRET_KEY) {
      return res.status(200).json({ ok: false, chapters: [], reason: 'storage not configured' });
    }

    if (action === 'classes') {
      const r = await req('GET',
        '/rest/v1/syllabus_chapters'
        + '?board=eq.' + encodeURIComponent(board)
        + '&subject=eq.' + encodeURIComponent(subject)
        + '&select=class&order=class.asc');
      const seen = {};
      const classes = [];
      (Array.isArray(r.data) ? r.data : []).forEach((row) => {
        if (row && row.class != null && !seen[row.class]) {
          seen[row.class] = 1;
          classes.push(row.class);
        }
      });
      return res.status(200).json({ ok: true, classes: classes });
    }

    if (action === 'chapters') {
      const cls = classNumber(body.cls);
      if (cls == null) return res.status(400).json({ error: 'Missing or unreadable class' });

      const r = await req('GET',
        '/rest/v1/syllabus_chapters'
        + '?board=eq.' + encodeURIComponent(board)
        + '&class=eq.' + cls
        + '&subject=eq.' + encodeURIComponent(subject)
        + '&active=eq.true'
        + '&select=id,book_name,part,theme_or_group,chapter_number,chapter_title,page_start,scope_notes'
        + '&order=part.asc,id.asc');

      const rows = Array.isArray(r.data) ? r.data : [];
      return res.status(200).json({ ok: true, cls: cls, subject: subject, board: board, chapters: rows });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('[syllabus] Error:', err);
    return res.status(500).json({ error: err.message || 'syllabus failed' });
  }
};
