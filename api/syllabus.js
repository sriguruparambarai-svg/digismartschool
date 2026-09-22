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

    // ── chapter_text ──
    // Returns the real chapter text from the NCERT library, when that book
    // has been uploaded in Super Admin. The Concept Class uses it so the
    // lesson follows what the book actually says. When nothing is found the
    // page simply teaches from the chapter name, exactly as before.
    if (action === 'chapter_text') {
      const cls = classNumber(body.cls);
      if (cls == null) return res.status(400).json({ error: 'Missing or unreadable class' });

      // The syllabus list and the book library use slightly different subject
      // names, so accept every name that means the same subject.
      const SUBJECT_NAMES = {
        maths: ['Mathematics', 'Maths'],
        science: ['Science', 'EVS'],
        evs: ['EVS', 'Science'],
        'social science': ['Social Science'],
        english: ['English'],
        hindi: ['Hindi'],
        tamil: ['Tamil']
      };
      const names = SUBJECT_NAMES[String(subject).toLowerCase()] || [subject];
      const inList = '(' + names.map((n) => '"' + n + '"').join(',') + ')';

      const r = await req('GET',
        '/rest/v1/textbook_chapters'
        + '?syllabus_type=eq.ncert'
        + '&class_name=eq.' + encodeURIComponent('Class ' + cls)
        + '&subject=in.' + encodeURIComponent(inList)
        + '&select=chapter_number,chapter_title,extracted_text'
        + '&order=chapter_number.asc');

      const rows = Array.isArray(r.data) ? r.data : [];
      if (!rows.length) return res.status(200).json({ ok: true, found: false });

      const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const wantTitle = norm(body.chapter_title);
      if (!wantTitle) return res.status(200).json({ ok: true, found: false });

      // Match by NAME only. Chapter numbers are never used: a book uploaded
      // file by file is numbered by file order, so one extra file (front
      // matter, for example) would shift every chapter and teach the wrong
      // lesson. No match means the lesson is taught from the chapter name,
      // which is right, rather than from the wrong chapter, which is not.
      let hit = null;
      let text = '';

      // 1. The chapter row is named the same as the syllabus chapter.
      hit = rows.find((c) => norm(c.chapter_title) === wantTitle) || null;

      // 2. The chapter name appears inside a file's text. NCERT often puts
      //    several lessons in one unit file, and files uploaded one per
      //    chapter carry a file name rather than a real title, so this is
      //    the match that usually works. The text is cut from where the
      //    chapter actually starts.
      if (!hit) {
        let best = null;
        for (const c of rows) {
          const flat = norm(c.extracted_text);
          if (!flat) continue;
          const at = flat.indexOf(wantTitle);
          if (at === -1) continue;
          if (!best || at < best.at) best = { row: c, at: at };
        }
        if (best) {
          hit = best.row;
          const raw = String(best.row.extracted_text)
            .replace(/\[Page \d+\]/g, ' ').replace(/\s+/g, ' ').trim();
          // Line the cut up with the cleaned text, then start a little before
          // the title so the chapter opening is not lost.
          const flatRaw = norm(raw);
          const at = flatRaw.indexOf(wantTitle);
          const from = at === -1 ? 0 : Math.max(0, at - 200);
          text = raw.substring(from, from + 9000);
        }
      }

      // 3. A long chapter name that clearly contains, or is contained by,
      //    a row's title. Short names are skipped — "Light" would match
      //    almost anything.
      if (!hit && wantTitle.length >= 8) {
        hit = rows.find((c) => {
          const t = norm(c.chapter_title);
          return t.length >= 8 && (t.includes(wantTitle) || wantTitle.includes(t));
        }) || null;
      }

      if (!hit || !hit.extracted_text) return res.status(200).json({ ok: true, found: false });

      if (!text) {
        text = String(hit.extracted_text)
          .replace(/\[Page \d+\]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 9000);
      }

      return res.status(200).json({
        ok: true, found: text.length > 200,
        matched_title: hit.chapter_title || '',
        text: text
      });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('[syllabus] Error:', err);
    return res.status(500).json({ error: err.message || 'syllabus failed' });
  }
};
