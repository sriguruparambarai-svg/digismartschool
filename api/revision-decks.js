// /api/revision-decks.js — Say-Along Revision deck storage for DigiSmartSchool
//
// All reading and writing of revision cards goes through here, using the
// service key. The browser can never touch the revision_decks table directly
// (RLS is on with no policies), so this file is the only door.
//
// Actions (POST body → { action: '...' }):
//   list_decks   { school_id }                     → chapters this school can see
//   get_deck     { id }                            → one deck, with its cards
//   save_deck    { school_id, class_name, ... }    → create or replace a deck
//   delete_deck  { id, school_id }                 → remove a deck
//
// A school always sees TWO sets of chapters:
//   • the shared library  (school_id = '')  — built once, free for everyone
//   • its own private decks (school_id = 'ARK2024')

const https = require('https');

const SB_HOST = 'pzxosqukijwpjdlfdfst.supabase.co';
const TABLE   = 'revision_decks';

// One chapter can hold at most this many cards, and one card this many points.
// Guards against a runaway AI conversion filling the database with nonsense.
const MAX_CARDS         = 300;
const MAX_POINTS        = 25;
const MAX_TEXT          = 2000;   // characters, per question / point / about

/* ─────────────────────────────────────────────────────────────
   Talking to Supabase
   ───────────────────────────────────────────────────────────── */
function sbRequest(method, path, bodyObj, extraHeaders) {
  return new Promise(function (resolve) {
    var key = process.env.SUPABASE_SECRET_KEY;
    if (!key) { resolve({ ok: false, error: 'SUPABASE_SECRET_KEY not set in Vercel' }); return; }

    var payload = bodyObj ? JSON.stringify(bodyObj) : null;

    var headers = {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (h) { headers[h] = extraHeaders[h]; });
    }

    var opts = { hostname: SB_HOST, path: '/rest/v1/' + path, method: method, headers: headers };

    var chunks = [];
    var r = https.request(opts, function (res) {
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        var parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = raw; }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data: parsed
        });
      });
    });
    r.on('error', function (e) { resolve({ ok: false, error: e.message }); });
    if (payload) r.write(payload);
    r.end();
  });
}

/* ─────────────────────────────────────────────────────────────
   Checking what came in
   ───────────────────────────────────────────────────────────── */
function clean(v, limit) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, limit || 200);
}

// Cards are what children will memorise, so nothing malformed gets stored.
function checkCards(cards) {
  if (!Array.isArray(cards))  return 'cards must be a list';
  if (!cards.length)          return 'there are no cards to save';
  if (cards.length > MAX_CARDS) return 'too many cards (limit ' + MAX_CARDS + ')';

  for (var i = 0; i < cards.length; i++) {
    var c = cards[i];
    var where = 'card ' + (i + 1);
    if (!c || typeof c !== 'object')          return where + ' is not valid';
    if (!c.question || !String(c.question).trim()) return where + ' has no question';
    if (String(c.question).length > MAX_TEXT) return where + ' question is too long';
    if (c.about && String(c.about).length > MAX_TEXT) return where + ' explanation is too long';
    if (!Array.isArray(c.points) || !c.points.length) return where + ' has no answer points';
    if (c.points.length > MAX_POINTS)         return where + ' has too many points';
    for (var p = 0; p < c.points.length; p++) {
      if (!c.points[p] || !String(c.points[p]).trim()) return where + ', point ' + (p + 1) + ' is empty';
      if (String(c.points[p]).length > MAX_TEXT)       return where + ', point ' + (p + 1) + ' is too long';
    }
  }
  return null;   // all good
}

// Trim each deck down before sending it to the picker — it only needs
// to show chapter names and a card count, not every answer.
function summarise(row) {
  return {
    id:            row.id,
    school_id:     row.school_id,
    class_name:    row.class_name,
    subject:       row.subject,
    chapter:       row.chapter,
    chapter_title: row.chapter_title,
    medium:        row.medium,
    cards:         Array.isArray(row.cards) ? row.cards.length : 0,
    shared:        row.school_id === '',
    updated_at:    row.updated_at
  };
}

/* ─────────────────────────────────────────────────────────────
   The actions
   ───────────────────────────────────────────────────────────── */

// What can this school see? Its own decks, plus the shared library.
async function listDecks(schoolId) {
  var cols = 'id,school_id,class_name,subject,chapter,chapter_title,medium,cards,updated_at';

  var shared = await sbRequest('GET',
    TABLE + '?school_id=eq.&select=' + cols + '&order=class_name,subject,chapter', null);

  var own = { ok: true, data: [] };
  if (schoolId) {
    own = await sbRequest('GET',
      TABLE + '?school_id=eq.' + encodeURIComponent(schoolId) +
      '&select=' + cols + '&order=class_name,subject,chapter', null);
  }

  if (!shared.ok && !own.ok) {
    return { error: 'Could not read the revision library' };
  }

  var rows = []
    .concat(Array.isArray(own.data) ? own.data : [])
    .concat(Array.isArray(shared.data) ? shared.data : []);

  return { decks: rows.map(summarise) };
}

// One deck, with all its cards — this is what the revision page plays.
async function getDeck(id) {
  var r = await sbRequest('GET',
    TABLE + '?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1', null);

  if (!r.ok) return { error: 'Could not load that chapter' };
  var row = Array.isArray(r.data) ? r.data[0] : null;
  if (!row) return { error: 'That chapter no longer exists' };

  return {
    deck: {
      id:            row.id,
      class_name:    row.class_name,
      subject:       row.subject,
      chapter:       row.chapter,
      chapter_title: row.chapter_title,
      medium:        row.medium,
      shared:        row.school_id === '',
      cards:         Array.isArray(row.cards) ? row.cards : [],
      updated_at:    row.updated_at
    }
  };
}

// Create or replace. The database rule (one deck per chapter) means saving
// again REPLACES the old cards rather than adding a second copy — so a class
// can never be shown two different versions of the same answer.
async function saveDeck(body) {
  var row = {
    school_id:     clean(body.school_id, 100),          // '' = shared library
    class_name:    clean(body.class_name, 50),
    subject:       clean(body.subject, 100),
    chapter:       clean(body.chapter, 200),
    chapter_title: clean(body.chapter_title, 300),
    medium:        (clean(body.medium, 20) || 'english').toLowerCase(),
    cards:         body.cards,
    source_text:   body.source_text ? String(body.source_text).slice(0, 200000) : null,
    created_by:    clean(body.created_by, 200)
  };

  if (!row.class_name) return { error: 'Please choose a class' };
  if (!row.subject)    return { error: 'Please choose a subject' };
  if (!row.chapter)    return { error: 'Please give the chapter a name' };
  if (row.medium !== 'english' && row.medium !== 'tamil') row.medium = 'english';

  var problem = checkCards(row.cards);
  if (problem) return { error: problem };

  var r = await sbRequest(
    'POST',
    TABLE + '?on_conflict=school_id,class_name,subject,chapter,medium',
    [row],
    { 'Prefer': 'resolution=merge-duplicates,return=representation' }
  );

  if (!r.ok) {
    return { error: 'Save failed: ' + (r.error || JSON.stringify(r.data).slice(0, 200)) };
  }

  var saved = Array.isArray(r.data) ? r.data[0] : null;
  return {
    success: true,
    id: saved ? saved.id : null,
    cards: row.cards.length,
    shared: row.school_id === ''
  };
}

// A school can only delete its OWN decks. The shared library is never
// removable this way, so one school can't wipe out everyone else's chapters.
async function deleteDeck(id, schoolId) {
  if (!id) return { error: 'Nothing to delete' };
  if (!schoolId) return { error: 'Only a school can remove its own chapters' };

  var r = await sbRequest('DELETE',
    TABLE + '?id=eq.' + encodeURIComponent(id) +
    '&school_id=eq.' + encodeURIComponent(schoolId),
    null,
    { 'Prefer': 'return=representation' });

  if (!r.ok) return { error: 'Could not remove that chapter' };
  var gone = Array.isArray(r.data) ? r.data.length : 0;
  if (!gone) return { error: 'That chapter does not belong to this school' };
  return { success: true };
}

/* ─────────────────────────────────────────────────────────────
   Handler
   ───────────────────────────────────────────────────────────── */
module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var action = clean(body.action, 40);

  try {
    var out;
    if (action === 'list_decks')       out = await listDecks(clean(body.school_id, 100));
    else if (action === 'get_deck')    out = await getDeck(clean(body.id, 100));
    else if (action === 'save_deck')   out = await saveDeck(body);
    else if (action === 'delete_deck') out = await deleteDeck(clean(body.id, 100), clean(body.school_id, 100));
    else return res.status(400).json({ error: 'Unknown action: ' + action });

    return res.status(out && out.error ? 400 : 200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' });
  }
};

// NOTE: this must come AFTER the line above. Setting it before
// `module.exports = ...` looks right but is silently thrown away,
// leaving the default 1MB limit in place.
module.exports.config = { api: { bodyParser: { sizeLimit: '4mb' } } };
