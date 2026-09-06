// api/demo-request.js
// Receives "Book a free demo" enquiries from home.html.
//
// The public site used to insert straight into Supabase from the browser,
// which meant the project URL and a write-capable key sat in the page source
// for anyone to read and reuse. This endpoint moves that write to the server,
// the same way every other write in DigiSmartSchool is handled.
//
// The leads table lives in the DigiSmart ERP project, not the TeachBot one,
// so this reads its own key: ERP_SECRET_KEY.

const https = require('https');

const HOST = 'nkfxrbumhjztmdyepygt.supabase.co';   // DigiSmart ERP project
const TABLE = '/rest/v1/demo_requests';

function insert(row) {
  return new Promise((resolve) => {
    const key = process.env.ERP_SECRET_KEY;
    const data = JSON.stringify([row]);
    const opts = {
      hostname: HOST,
      path: TABLE,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const r = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: body }));
    });
    r.on('error', () => resolve({ status: 0, body: 'network' }));
    r.write(data);
    r.end();
  });
}

// Keep one field to a sane length so a bot cannot post a novel into the table.
function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 200);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const b = (req.body && typeof req.body === 'object') ? req.body : {};

  // Honeypot: a real person never sees or fills this field. A bot fills
  // everything. Answer as if it worked, but write nothing.
  if (clean(b.website, 100)) {
    res.status(200).json({ ok: true });
    return;
  }

  const school = clean(b.school_name, 150);
  const name = clean(b.contact_name, 100);
  const mobile = clean(b.mobile, 20);
  const digits = mobile.replace(/\D/g, '');

  if (!school || !name || !digits) {
    res.status(400).json({ ok: false, error: 'School name, your name and mobile number are required.' });
    return;
  }
  if (digits.length < 10 || digits.length > 15) {
    res.status(400).json({ ok: false, error: 'Please enter a valid mobile number.' });
    return;
  }

  const row = {
    school_name: school,
    contact_name: name,
    mobile: mobile,
    email: clean(b.email, 150),
    city: clean(b.city, 100),
    students: clean(b.students, 60),
    plan: clean(b.plan, 100),
    requested_at: new Date().toISOString()
  };

  const out = await insert(row);

  if (out.status >= 200 && out.status < 300) {
    res.status(200).json({ ok: true });
    return;
  }

  console.error('demo-request insert failed:', out.status, out.body);
  res.status(502).json({ ok: false, error: 'Could not save the request.' });
};
